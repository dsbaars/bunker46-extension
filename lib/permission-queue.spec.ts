import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PermissionQueue,
  groupKeyFor,
  isPromptDecision,
  type PermissionGroup,
} from '@/lib/permission-queue';
import type { PermissionDecision } from '@/lib/permissions';

type Harness = {
  queue: PermissionQueue;
  opened: PermissionGroup[];
  updated: PermissionGroup[];
  stored: Map<string, PermissionDecision>;
  openPrompt: ReturnType<typeof vi.fn>;
};

function makeQueue(overrides: { openPrompt?: (group: PermissionGroup) => Promise<number> } = {}) {
  const opened: PermissionGroup[] = [];
  const updated: PermissionGroup[] = [];
  const stored = new Map<string, PermissionDecision>();
  let nextWindowId = 1;
  let nextRequestId = 1;

  const openPrompt = vi.fn(async (group: PermissionGroup) => {
    if (overrides.openPrompt) return overrides.openPrompt(group);
    opened.push(group);
    return nextWindowId++;
  });

  const queue = new PermissionQueue({
    checkPermission: async (host, method, eventKind) =>
      stored.get(groupKeyFor(host, method, eventKind)) ?? null,
    openPrompt,
    onGroupUpdated: (group) => updated.push(group),
    createRequestId: () => `req-${nextRequestId++}`,
    collectMs: 200,
  });

  return { queue, opened, updated, stored, openPrompt } satisfies Harness;
}

/** Let the collect window elapse and every queued microtask settle. */
async function settle(ms = 200): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('permission queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('groups requests on the permission scope', () => {
    expect(groupKeyFor('a.com', 'signEvent', 22242)).toBe('a.com|signEvent:22242');
    expect(groupKeyFor('a.com', 'signEvent', 1)).not.toBe(groupKeyFor('a.com', 'signEvent', 22242));
    expect(groupKeyFor('a.com', 'nip44_decrypt')).toBe('a.com|nip44_decrypt');
    expect(groupKeyFor('a.com', 'nip44_decrypt')).not.toBe(groupKeyFor('b.com', 'nip44_decrypt'));
  });

  it('opens one prompt for a burst of identical requests', async () => {
    const { queue, opened } = makeQueue();

    const pending = [1, 2, 3, 4, 5].map((i) =>
      queue.request({ host: 'armada.buzz', method: 'signEvent', eventKind: 22242, rawEvent: { i } })
    );
    await settle();

    expect(opened).toHaveLength(1);
    expect(opened[0]!.requests).toHaveLength(5);

    queue.resolve(opened[0]!.key, 'allow_once');
    await expect(Promise.all(pending)).resolves.toEqual([true, true, true, true, true]);
  });

  it('keeps different event kinds in separate prompts', async () => {
    const { queue, opened } = makeQueue();

    const auth = queue.request({ host: 'a.com', method: 'signEvent', eventKind: 22242 });
    const note = queue.request({ host: 'a.com', method: 'signEvent', eventKind: 1 });
    await settle();

    expect(opened).toHaveLength(1);
    expect(opened[0]!.eventKind).toBe(22242);

    queue.resolve(opened[0]!.key, 'allow_once');
    await settle(0);

    expect(opened).toHaveLength(2);
    expect(opened[1]!.eventKind).toBe(1);

    queue.resolve(opened[1]!.key, 'deny_once');
    await expect(auth).resolves.toBe(true);
    await expect(note).resolves.toBe(false);
  });

  it('shows one prompt at a time and re-checks stored rules before the next one', async () => {
    const { queue, opened, stored } = makeQueue();

    const signing = queue.request({ host: 'a.com', method: 'signEvent', eventKind: 22242 });
    const decrypting = queue.request({ host: 'a.com', method: 'nip44_decrypt' });
    await settle();

    expect(opened).toHaveLength(1);

    // User picked "Allow Always" on the first group; a rule now covers the second.
    stored.set('a.com|nip44_decrypt', 'allow');
    queue.resolve(opened[0]!.key, 'allow_always');
    await settle(0);

    expect(opened).toHaveLength(1);
    await expect(signing).resolves.toBe(true);
    await expect(decrypting).resolves.toBe(true);
  });

  it('lets late requests join the prompt that is already open', async () => {
    const { queue, opened, updated } = makeQueue();

    const first = queue.request({ host: 'a.com', method: 'nip44_decrypt' });
    await settle();
    expect(opened).toHaveLength(1);

    const late = queue.request({ host: 'a.com', method: 'nip44_decrypt' });
    await settle(0);

    expect(opened).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.requests).toHaveLength(2);

    queue.resolve(opened[0]!.key, 'allow_once');
    await expect(Promise.all([first, late])).resolves.toEqual([true, true]);
  });

  it('denies skipped requests while allowing the rest of the group', async () => {
    const { queue, opened } = makeQueue();

    const pending = [1, 2, 3].map((i) =>
      queue.request({ host: 'a.com', method: 'signEvent', eventKind: 1, rawEvent: { i } })
    );
    await settle();

    const group = opened[0]!;
    queue.resolve(group.key, 'allow_once', [group.requests[1]!.requestId]);

    await expect(Promise.all(pending)).resolves.toEqual([true, false, true]);
  });

  it('denies the whole group when the prompt window is closed', async () => {
    const { queue, opened } = makeQueue();

    const pending = [1, 2].map(() => queue.request({ host: 'a.com', method: 'getPublicKey' }));
    await settle();

    const closed = queue.handleWindowClosed(opened[0]!.windowId!);
    expect(closed?.key).toBe('a.com|getPublicKey');
    await expect(Promise.all(pending)).resolves.toEqual([false, false]);
  });

  it('never prompts for a scope that already has a stored rule', async () => {
    const { queue, opened, stored } = makeQueue();
    stored.set('a.com|signEvent:1', 'deny');

    const denied = queue.request({ host: 'a.com', method: 'signEvent', eventKind: 1 });
    await settle();

    expect(opened).toHaveLength(0);
    await expect(denied).resolves.toBe(false);
  });

  it('denies the group when the prompt window cannot be opened', async () => {
    const { queue } = makeQueue({
      openPrompt: () => Promise.reject(new Error('no window')),
    });

    const pending = queue.request({ host: 'a.com', method: 'getPublicKey' });
    await settle();

    await expect(pending).resolves.toBe(false);
  });

  it('ignores a decision for a group that is already gone', async () => {
    const { queue, opened } = makeQueue();

    const pending = queue.request({ host: 'a.com', method: 'getPublicKey' });
    await settle();

    expect(queue.resolve(opened[0]!.key, 'allow_once')).not.toBeNull();
    expect(queue.resolve(opened[0]!.key, 'allow_once')).toBeNull();
    await expect(pending).resolves.toBe(true);
  });

  it('drains queued groups after each decision', async () => {
    const { queue, opened } = makeQueue();

    const hosts = ['a.com', 'b.com', 'c.com'];
    const pending = hosts.map((host) => queue.request({ host, method: 'getPublicKey' }));
    await settle();

    for (let i = 0; i < hosts.length; i++) {
      expect(opened).toHaveLength(i + 1);
      expect(opened[i]!.host).toBe(hosts[i]);
      queue.resolve(opened[i]!.key, 'allow_once');
      await settle(0);
    }

    await expect(Promise.all(pending)).resolves.toEqual([true, true, true]);
  });

  it('validates prompt decisions', () => {
    expect(isPromptDecision('allow_always')).toBe(true);
    expect(isPromptDecision('deny_once')).toBe(true);
    expect(isPromptDecision('allow')).toBe(false);
    expect(isPromptDecision(undefined)).toBe(false);
  });
});
