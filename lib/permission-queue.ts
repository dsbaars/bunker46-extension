import { methodKey } from '@/lib/permissions';
import type { PermissionDecision } from '@/lib/permissions';

/**
 * Groups concurrent permission requests and shows them one prompt at a time.
 *
 * Clients often fire a burst of identical requests right after login (e.g. one
 * NIP-42 auth signature per relay), which used to open one popup window per
 * request. Requests are grouped on their permission scope — the same key the
 * stored rule uses — so a group can never mix, say, kind 1 with kind 22242, and
 * a single decision is never broader than the "Allow Always" offered next to it.
 *
 * A group is frozen the moment its prompt opens: requests arriving afterwards
 * start a fresh group instead of joining the one on screen, so a decision can
 * only ever apply to what the user was actually shown. Stragglers behind an
 * "Allow Always" are absorbed silently anyway, because the next group is
 * re-checked against stored permissions before it opens.
 *
 * Only one group is on screen at a time.
 */

/** Decision as sent by the prompt window. */
export type PromptDecision = 'allow_always' | 'allow_once' | 'deny_once' | 'deny_always';

const PROMPT_DECISIONS = new Set<string>([
  'allow_always',
  'allow_once',
  'deny_once',
  'deny_always',
]);

export function isPromptDecision(value: unknown): value is PromptDecision {
  return typeof value === 'string' && PROMPT_DECISIONS.has(value);
}

export type QueuedRequest = {
  requestId: string;
  /** Raw signEvent payload for the prompt to display. Undefined for methods without reviewable content. */
  rawEvent?: unknown;
  resolve: (allowed: boolean) => void;
};

export type PermissionGroup = {
  /** `${profileId}|${host}|${methodKey(method, eventKind)}` — the stored permission scope. */
  key: string;
  host: string;
  method: string;
  eventKind?: number;
  /** Profile the requests were made under. A rule from this group is stored for it alone. */
  profileId?: string;
  requests: QueuedRequest[];
  /** Prompt window currently showing this group, or null while it is queued. */
  windowId: number | null;
};

export type PermissionQueueDeps = {
  /** Stored decision for this scope, or null when the user has to be asked. */
  checkPermission: (
    host: string,
    method: string,
    eventKind?: number,
    profileId?: string
  ) => Promise<PermissionDecision | null>;
  /** Open the prompt window for a group and resolve with its window id. */
  openPrompt: (group: PermissionGroup) => Promise<number>;
  createRequestId?: () => string;
  /** Window in which requests are collected before the prompt opens (ms). */
  collectMs?: number;
};

/** Requests arriving within this window end up in the same prompt. */
export const PERMISSION_COLLECT_MS = 200;

export function groupKeyFor(
  host: string,
  method: string,
  eventKind?: number,
  profileId?: string
): string {
  return `${profileId ?? ''}|${host}|${methodKey(method, eventKind)}`;
}

function defaultRequestId(): string {
  return Math.random().toString(36).slice(2) + Date.now();
}

export class PermissionQueue {
  private readonly deps: PermissionQueueDeps;
  private readonly collectMs: number;
  private readonly createRequestId: () => string;
  /** Insertion-ordered, so groups are prompted first-in-first-out. */
  private readonly groups = new Map<string, PermissionGroup>();
  /** The frozen group currently on screen. Never accepts new requests. */
  private active: PermissionGroup | null = null;
  private collectTimer: ReturnType<typeof setTimeout> | null = null;
  private pumping = false;

  constructor(deps: PermissionQueueDeps) {
    this.deps = deps;
    this.collectMs = deps.collectMs ?? PERMISSION_COLLECT_MS;
    this.createRequestId = deps.createRequestId ?? defaultRequestId;
  }

  /** Queue a request; resolves once the user (or a stored rule) decides on its group. */
  request(input: {
    host: string;
    method: string;
    eventKind?: number;
    rawEvent?: unknown;
    profileId?: string;
  }): Promise<boolean> {
    const key = groupKeyFor(input.host, input.method, input.eventKind, input.profileId);
    // Only pending groups are joinable — never `this.active`, which the user is
    // looking at right now.
    let group = this.groups.get(key);
    if (!group) {
      group = {
        key,
        host: input.host,
        method: input.method,
        eventKind: input.eventKind,
        profileId: input.profileId,
        requests: [],
        windowId: null,
      };
      this.groups.set(key, group);
    }

    const requestId = this.createRequestId();
    const target = group;
    const promise = new Promise<boolean>((resolve) => {
      target.requests.push({ requestId, rawEvent: input.rawEvent, resolve });
    });

    this.schedulePump();
    return promise;
  }

  /** The group a prompt window is showing. Pending groups are not visible to the prompt. */
  getGroup(key: string): PermissionGroup | undefined {
    return this.active?.key === key ? this.active : undefined;
  }

  /**
   * Apply a prompt decision to the group on screen. `approvedRequestIds` are the requests
   * the prompt actually displayed and the user did not skip; anything else is denied, so an
   * incomplete or stale prompt fails closed. Returns the group, or null if it is already gone.
   */
  resolve(
    key: string,
    decision: PromptDecision,
    approvedRequestIds: readonly string[] = []
  ): PermissionGroup | null {
    const group = this.active;
    if (!group || group.key !== key) return null;

    const allowed = decision === 'allow_always' || decision === 'allow_once';
    this.finish(group, allowed, new Set(approvedRequestIds));
    void this.pump();
    return group;
  }

  /** Closing the prompt window denies the whole group, as closing a single prompt always did. */
  handleWindowClosed(windowId: number): PermissionGroup | null {
    const group = this.active;
    if (!group || group.windowId !== windowId) return null;
    this.finish(group, false);
    void this.pump();
    return group;
  }

  private finish(group: PermissionGroup, allowed: boolean, approved?: Set<string>): void {
    // A newer pending group may already own this key; only drop our own entry.
    if (this.groups.get(group.key) === group) this.groups.delete(group.key);
    if (this.active === group) this.active = null;
    for (const request of group.requests) {
      request.resolve(allowed && (approved === undefined || approved.has(request.requestId)));
    }
  }

  private schedulePump(): void {
    if (this.active !== null || this.collectTimer !== null || this.pumping) return;
    this.collectTimer = setTimeout(() => {
      this.collectTimer = null;
      void this.pump();
    }, this.collectMs);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.active !== null) return;
    this.pumping = true;
    try {
      for (;;) {
        const group = this.groups.values().next().value;
        if (!group) break;

        // A rule saved in an earlier prompt may already cover this group.
        const stored = await this.deps.checkPermission(
          group.host,
          group.method,
          group.eventKind,
          group.profileId
        );
        if (stored === 'allow' || stored === 'deny') {
          this.finish(group, stored === 'allow');
          continue;
        }

        let windowId: number;
        try {
          windowId = await this.deps.openPrompt(group);
        } catch {
          this.finish(group, false);
          continue;
        }

        // Freeze: the group leaves the pending map, so later requests for the same
        // scope collect into a fresh group instead of this one.
        this.groups.delete(group.key);
        group.windowId = windowId;
        this.active = group;
        break;
      }
    } finally {
      this.pumping = false;
    }
  }
}
