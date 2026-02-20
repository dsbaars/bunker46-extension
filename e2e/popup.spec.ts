import { test, expect } from './fixtures/extension';

test('popup opens and shows Bunker46 heading', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('heading', { name: /Bunker46/i })).toBeVisible();
});

test('popup has Connection and Permissions tabs', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('button', { name: 'Connection' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Permissions' })).toBeVisible();
});

test('Permissions tab shows empty state when no permissions', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Permissions' }).click();
  await expect(page.getByText(/No permissions yet/i)).toBeVisible();
});

test('Connection tab shows bunker URI input and Connect button when disconnected', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('button', { name: 'Connection' })).toBeVisible();
  await expect(page.getByPlaceholder(/bunker:\/\/\.\.\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
});

test('connect with invalid bunker URI shows error', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByPlaceholder(/bunker:\/\/\.\.\./).fill('bunker://invalid-not-a-real-uri');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText(/Connection failed|Paste a bunker/)).toBeVisible({ timeout: 8000 });
});

test('window.nostr is present on a web page and exposes NIP-07 methods', async ({ page }) => {
  await page.goto('https://example.com');
  await page.waitForFunction(
    () => typeof (window as unknown as { nostr?: unknown }).nostr !== 'undefined',
    { timeout: 10000 }
  );
  const nip07 = await page.evaluate(() => {
    const n = (window as unknown as { nostr?: { getPublicKey?: unknown; signEvent?: unknown } })
      .nostr;
    return {
      hasNostr: !!n,
      getPublicKey: typeof n?.getPublicKey === 'function',
      signEvent: typeof n?.signEvent === 'function',
    };
  });
  expect(nip07.hasNostr).toBe(true);
  expect(nip07.getPublicKey).toBe(true);
  expect(nip07.signEvent).toBe(true);
});
