import { test, expect } from './fixtures/extension';
import type { Page } from '@playwright/test';

/**
 * Drives the built prompt window with a stubbed background: the real permission
 * flow needs a connected NIP-46 signer, so the group contents are injected here.
 * Grouping and queueing semantics are covered by lib/permission-queue.spec.ts.
 */
type StubRequest = { requestId: string; event: unknown };

async function openPrompt(
  page: Page,
  extensionId: string,
  opts: { method: string; eventKind?: number; host?: string; requests: StubRequest[] }
): Promise<void> {
  await page.addInitScript((requests: StubRequest[]) => {
    const w = window as unknown as {
      __sent: unknown[];
      __listeners: ((msg: unknown) => void)[];
      close: () => void;
    };
    w.__sent = [];
    w.__listeners = [];
    // Keep the window alive after a decision so the test can inspect what was sent.
    w.close = () => {};
    const runtime = chrome.runtime as unknown as {
      sendMessage: (msg: unknown) => Promise<unknown>;
      onMessage: { addListener: (fn: (msg: unknown) => void) => void; removeListener: () => void };
    };
    runtime.sendMessage = async (msg: unknown) => {
      w.__sent.push(msg);
      if ((msg as { type: string }).type === 'GET_PERMISSION_GROUP') return { requests };
      return {};
    };
    runtime.onMessage.addListener = (fn) => w.__listeners.push(fn);
    runtime.onMessage.removeListener = () => {};
  }, opts.requests);

  const host = opts.host ?? 'client.test';
  const scope =
    opts.method === 'signEvent' && opts.eventKind !== undefined
      ? `signEvent:${opts.eventKind}`
      : opts.method;
  const qs = new URLSearchParams({
    groupKey: `${host}|${scope}`,
    host,
    method: opts.method,
  });
  if (opts.eventKind !== undefined) qs.set('eventKind', String(opts.eventKind));

  await page.goto(`chrome-extension://${extensionId}/prompt.html?${qs.toString()}`);
}

function signRequests(n: number): StubRequest[] {
  return Array.from({ length: n }, (_, i) => ({
    requestId: `req-${i + 1}`,
    event: { kind: 22242, content: `request ${i + 1}`, tags: [], created_at: 1700000000 + i },
  }));
}

async function sentDecision(page: Page): Promise<{ decision?: string; skipped?: string[] }> {
  return page.evaluate(() => {
    const sent = (window as unknown as { __sent: { type: string }[] }).__sent;
    return (sent.find((m) => m.type === 'PERMISSION_RESPONSE') ?? {}) as {
      decision?: string;
      skipped?: string[];
    };
  });
}

test('single request looks exactly as before: no count, no pager', async ({
  page,
  extensionId,
}) => {
  await openPrompt(page, extensionId, {
    method: 'signEvent',
    eventKind: 22242,
    requests: signRequests(1),
  });

  await expect(page.getByText('client.test')).toBeVisible();
  await expect(page.getByText('Event kind 22242')).toBeVisible();
  await expect(page.getByText(/\d+ requests/)).toHaveCount(0);
  await expect(page.getByText(/Request \d+ of \d+/)).toHaveCount(0);
  await expect(page.getByText('Applies to all requests shown here')).toHaveCount(0);
});

test('a group shows its size and applies one decision to all of it', async ({
  page,
  extensionId,
}) => {
  await openPrompt(page, extensionId, {
    method: 'signEvent',
    eventKind: 22242,
    requests: signRequests(5),
  });

  await expect(page.getByText('5 requests')).toBeVisible();
  await expect(page.getByText('Applies to all requests shown here')).toBeVisible();

  await page.getByRole('button', { name: 'Allow Once', exact: true }).click();
  await expect
    .poll(() => sentDecision(page))
    .toMatchObject({ decision: 'allow_once', skipped: [] });
});

test('the pager steps through the events of a group', async ({ page, extensionId }) => {
  await openPrompt(page, extensionId, {
    method: 'signEvent',
    eventKind: 22242,
    requests: signRequests(3),
  });

  await expect(page.getByText('Request 1 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous request' })).toBeDisabled();

  await page.getByRole('button', { name: 'View raw message' }).click();
  await expect(page.getByText(/"request 1"/)).toBeVisible();

  await page.getByRole('button', { name: 'Next request' }).click();
  await expect(page.getByText('Request 2 of 3')).toBeVisible();
  await expect(page.getByText(/"request 2"/)).toBeVisible();

  await page.getByRole('button', { name: 'Next request' }).click();
  await expect(page.getByRole('button', { name: 'Next request' })).toBeDisabled();
});

test('a skipped request is reported back and can be put back', async ({ page, extensionId }) => {
  await openPrompt(page, extensionId, {
    method: 'signEvent',
    eventKind: 22242,
    requests: signRequests(3),
  });

  await page.getByRole('button', { name: 'Next request' }).click();
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(page.getByText('Skipped requests will be denied')).toBeVisible();

  await page.getByRole('button', { name: 'Include', exact: true }).click();
  await expect(page.getByText('Skipped requests will be denied')).toHaveCount(0);

  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('button', { name: 'Allow Once', exact: true }).click();

  await expect
    .poll(() => sentDecision(page))
    .toMatchObject({ decision: 'allow_once', skipped: ['req-2'] });
});

test('a group without reviewable content shows the count but no pager', async ({
  page,
  extensionId,
}) => {
  await openPrompt(page, extensionId, {
    method: 'nip44_decrypt',
    requests: [
      { requestId: 'a', event: null },
      { requestId: 'b', event: null },
      { requestId: 'c', event: null },
    ],
  });

  await expect(page.getByText('NIP-44 Decrypt')).toBeVisible();
  await expect(page.getByText('3 requests')).toBeVisible();
  await expect(page.getByText(/Request \d+ of \d+/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View raw message' })).toHaveCount(0);
});

test('a request joining the group updates the prompt', async ({ page, extensionId }) => {
  await openPrompt(page, extensionId, {
    method: 'signEvent',
    eventKind: 22242,
    requests: signRequests(2),
  });
  await expect(page.getByText('2 requests')).toBeVisible();

  // Background pushes an update; the prompt re-reads the group.
  await page.evaluate(() => {
    const w = window as unknown as {
      __sent: unknown[];
      __listeners: ((msg: unknown) => void)[];
    };
    const runtime = chrome.runtime as unknown as { sendMessage: (m: unknown) => Promise<unknown> };
    runtime.sendMessage = async (msg: unknown) => {
      w.__sent.push(msg);
      if ((msg as { type: string }).type === 'GET_PERMISSION_GROUP') {
        return {
          requests: [1, 2, 3, 4].map((i) => ({
            requestId: `req-${i}`,
            event: { kind: 22242, content: `request ${i}`, tags: [], created_at: 1700000000 },
          })),
        };
      }
      return {};
    };
    for (const fn of w.__listeners) {
      fn({ type: 'PERMISSION_GROUP_UPDATED', groupKey: 'client.test|signEvent:22242' });
    }
  });

  await expect(page.getByText('4 requests')).toBeVisible();
});
