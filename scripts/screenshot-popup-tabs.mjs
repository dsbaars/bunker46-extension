/**
 * Takes screenshots of each popup tab (Connection, Permissions, Settings).
 * Loads storage from scripts/screenshot-storage-snapshot.json (must contain a
 * connected session; run scripts/capture-screenshot-snapshot.mjs once to create it).
 * No live NIP-46 connection is made. Screenshots the #app element so image size
 * matches the real popup (360px wide).
 *
 * Run: pnpm run build && pnpm run screenshots
 * Screenshots are saved to docs/screenshots/
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.resolve(__dirname, '..', '.output', 'chrome-mv3');
const outDir = path.resolve(__dirname, '..', 'docs', 'screenshots');
const snapshotPath = path.resolve(__dirname, 'screenshot-storage-snapshot.json');

const POPUP_WIDTH = 360;

async function main() {
  if (!fs.existsSync(path.join(pathToExtension, 'manifest.json'))) {
    console.error('Extension not built. Run: pnpm run build');
    process.exit(1);
  }

  if (!fs.existsSync(snapshotPath)) {
    console.error('Snapshot not found. Run: node scripts/capture-screenshot-snapshot.mjs first');
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${pathToExtension}`, `--load-extension=${pathToExtension}`],
  });

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const extensionId = serviceWorker.url().split('/')[2];
  const extensionOrigin = `chrome-extension://${extensionId}`;

  const optionsPage = await context.newPage();
  await optionsPage.goto(`${extensionOrigin}/options.html`);
  await optionsPage.evaluate((data) => {
    return chrome.storage.local.set(data);
  }, snapshot);
  await optionsPage.close();

  const page = await context.newPage();
  await page.setViewportSize({ width: POPUP_WIDTH, height: 640 });
  await page.goto(`${extensionOrigin}/popup.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);

  const app = page.locator('#app');

  await app.screenshot({
    path: path.join(outDir, 'popup-connection.png'),
  });
  console.log('Saved docs/screenshots/popup-connection.png');

  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await page.waitForTimeout(400);
  await app.screenshot({
    path: path.join(outDir, 'popup-permissions.png'),
  });
  console.log('Saved docs/screenshots/popup-permissions.png');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.waitForTimeout(400);
  await app.screenshot({
    path: path.join(outDir, 'popup-settings.png'),
  });
  console.log('Saved docs/screenshots/popup-settings.png');

  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
