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
 * Only one group is on screen at a time; the next one is re-checked against
 * stored permissions before it opens, so a rule saved in the previous prompt
 * silently covers the requests waiting behind it.
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
  /** `${host}|${methodKey(method, eventKind)}` — identical to the stored permission scope. */
  key: string;
  host: string;
  method: string;
  eventKind?: number;
  requests: QueuedRequest[];
  /** Prompt window currently showing this group, or null while it is queued. */
  windowId: number | null;
};

export type PermissionQueueDeps = {
  /** Stored decision for this scope, or null when the user has to be asked. */
  checkPermission: (
    host: string,
    method: string,
    eventKind?: number
  ) => Promise<PermissionDecision | null>;
  /** Open the prompt window for a group and resolve with its window id. */
  openPrompt: (group: PermissionGroup) => Promise<number>;
  /** Called when a request joins the group that is already on screen. */
  onGroupUpdated?: (group: PermissionGroup) => void;
  createRequestId?: () => string;
  /** Window in which requests are collected before the prompt opens (ms). */
  collectMs?: number;
};

/** Requests arriving within this window end up in the same prompt. */
export const PERMISSION_COLLECT_MS = 200;

export function groupKeyFor(host: string, method: string, eventKind?: number): string {
  return `${host}|${methodKey(method, eventKind)}`;
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
  private activeKey: string | null = null;
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
  }): Promise<boolean> {
    const key = groupKeyFor(input.host, input.method, input.eventKind);
    let group = this.groups.get(key);
    if (!group) {
      group = {
        key,
        host: input.host,
        method: input.method,
        eventKind: input.eventKind,
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

    if (this.activeKey === key) this.deps.onGroupUpdated?.(target);
    else this.schedulePump();

    return promise;
  }

  getGroup(key: string): PermissionGroup | undefined {
    return this.groups.get(key);
  }

  /** Apply a prompt decision to a whole group. Returns the group, or null if it is already gone. */
  resolve(
    key: string,
    decision: PromptDecision,
    skippedRequestIds: readonly string[] = []
  ): PermissionGroup | null {
    const group = this.groups.get(key);
    if (!group) return null;

    const allowed = decision === 'allow_always' || decision === 'allow_once';
    this.finish(group, allowed, new Set(skippedRequestIds));
    void this.pump();
    return group;
  }

  /** Closing the prompt window denies the whole group, as closing a single prompt always did. */
  handleWindowClosed(windowId: number): PermissionGroup | null {
    for (const group of this.groups.values()) {
      if (group.windowId !== windowId) continue;
      this.finish(group, false);
      void this.pump();
      return group;
    }
    return null;
  }

  private finish(group: PermissionGroup, allowed: boolean, skipped?: Set<string>): void {
    this.groups.delete(group.key);
    if (this.activeKey === group.key) this.activeKey = null;
    for (const request of group.requests) {
      request.resolve(allowed && !skipped?.has(request.requestId));
    }
  }

  private schedulePump(): void {
    if (this.activeKey !== null || this.collectTimer !== null || this.pumping) return;
    this.collectTimer = setTimeout(() => {
      this.collectTimer = null;
      void this.pump();
    }, this.collectMs);
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.activeKey !== null) return;
    this.pumping = true;
    try {
      for (;;) {
        const group = this.groups.values().next().value;
        if (!group) break;

        // A rule saved in an earlier prompt may already cover this group.
        const stored = await this.deps.checkPermission(group.host, group.method, group.eventKind);
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

        group.windowId = windowId;
        this.activeKey = group.key;
        break;
      }
    } finally {
      this.pumping = false;
    }
  }
}
