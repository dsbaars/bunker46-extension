import { test, expect } from './fixtures/extension';

test('popup opens and shows Bunker46 heading', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('heading', { name: /Bunker46/i })).toBeVisible();
});

test('popup has Connection, Permissions, and Settings tabs', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('button', { name: 'Connection', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Permissions', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('Permissions tab shows empty state when no permissions', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await expect(page.getByText(/No permissions yet/i)).toBeVisible();
});

test('Connection tab shows bunker URI input and Connect button when disconnected', async ({
  page,
  extensionId,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByRole('button', { name: 'Connection', exact: true })).toBeVisible();
  await expect(page.getByTestId('connection-tab-root')).toBeVisible();
  await expect(page.getByPlaceholder(/bunker:\/\/\.\.\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('connect with invalid bunker URI shows error', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByPlaceholder(/bunker:\/\/\.\.\./).fill('bunker://invalid-not-a-real-uri');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText(/Connection failed|Paste a bunker/)).toBeVisible({ timeout: 8000 });
});

test('Settings tab shows choice cards for privacy, badge, Bunker46, and nostrconnect relays', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Privacy mode')).toBeVisible();
  await expect(page.getByText('Show badge on extension icon')).toBeVisible();
  await expect(page.getByText('Use Bunker46')).toBeVisible();
  await expect(page.getByText('Specify nostrconnect relays')).toBeVisible();
});

test('Settings tab shows nostrconnect relays textarea when Specify nostrconnect relays is enabled', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const nostrCard = page.getByTestId('settings-nostrconnect-card');
  await expect(nostrCard).toHaveCount(1);
  const nostrSwitch = nostrCard.getByRole('switch');
  await expect(nostrSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(nostrCard.getByTestId('settings-nostrconnect-relays-section')).toHaveCount(0);
  await nostrSwitch.click();
  await expect(nostrSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(nostrCard.getByTestId('settings-nostrconnect-relays-section')).toBeVisible();
  await expect(nostrCard.getByPlaceholder('wss://relay.nsec.app')).toBeVisible();
});

test('Settings tab shows Use Bunker46 switch and Bunker46 URL section is not rendered when switch is off', async ({
  page,
  extensionId,
}) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Use Bunker46')).toBeVisible();
  const bunkerSwitch = page.getByRole('switch', { name: /Use Bunker46/i });
  await expect(bunkerSwitch).toBeVisible();
  await expect(page.getByTestId('settings-bunker46-url-section')).toHaveCount(0);
  await bunkerSwitch.click();
  await expect(page.getByTestId('settings-bunker46-url-section')).toBeVisible();
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
