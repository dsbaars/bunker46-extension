import { test, expect } from './fixtures/extension';

test.describe('i18n', () => {
  test('popup shows English tab labels and connection UI when locale is en', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByRole('button', { name: 'Connection', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Permissions', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/bunker:\/\/\.\.\./)).toBeVisible();
    await expect(page.getByText('Offline')).toBeVisible();
  });

  test('Settings tab shows English labels', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Bunker46 URL')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.getByText('Privacy mode')).toBeVisible();
  });

  test('Permissions tab shows English empty state', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.getByRole('button', { name: 'Permissions', exact: true }).click();
    await expect(page.getByText(/No permissions yet/i)).toBeVisible();
  });
});
