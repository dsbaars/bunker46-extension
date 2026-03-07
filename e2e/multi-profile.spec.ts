import { test, expect } from './fixtures/extension';

const STORAGE_KEY_PROFILES = 'profiles';
const STORAGE_KEY_ACTIVE_PROFILE_ID = 'activeProfileId';

/** Seed extension storage with multi-profile enabled and one profile so the profile switcher appears. */
async function seedMultiProfileWithOneProfile(page: import('@playwright/test').Page) {
  const profileId = 'e2e-profile-1';
  const clientSecretHex = '0'.repeat(64); // minimal valid-length hex
  await page.evaluate(
    async ({
      profilesKey,
      activeIdKey,
      pid,
      secret,
    }: {
      profilesKey: string;
      activeIdKey: string;
      pid: string;
      secret: string;
    }) => {
      await chrome.storage.local.set({
        multiProfileEnabled: true,
        [profilesKey]: {
          [pid]: {
            id: pid,
            name: 'E2E Test Profile',
            clientSecretHex: secret,
          },
        },
        [activeIdKey]: pid,
      });
    },
    {
      profilesKey: STORAGE_KEY_PROFILES,
      activeIdKey: STORAGE_KEY_ACTIVE_PROFILE_ID,
      pid: profileId,
      secret: clientSecretHex,
    }
  );
}

test.describe('Multiple profiles', () => {
  test('Settings tab shows Multiple profiles card and switch', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Multiple profiles')).toBeVisible();
    await expect(
      page.getByText(/Show profile switcher and allow adding multiple connections/)
    ).toBeVisible();
    await expect(page.getByRole('switch', { name: /Multiple profiles/i })).toBeVisible();
  });

  test('when multi-profile is enabled and one profile exists, profile switcher is visible', async ({
    page,
    extensionId,
  }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await seedMultiProfileWithOneProfile(page);
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByTitle('Switch profile')).toBeVisible();
    await expect(page.getByText('E2E Test Profile')).toBeVisible();
  });

  test('profile switcher dropdown shows Add another connection', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await seedMultiProfileWithOneProfile(page);
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(page.getByTitle('Switch profile')).toBeVisible();
    await page.getByTitle('Switch profile').click();
    await expect(page.getByRole('button', { name: 'Add another connection' })).toBeVisible();
  });
});
