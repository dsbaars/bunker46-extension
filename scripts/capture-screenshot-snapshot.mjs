/**
 * One-time: connect the extension with the bunker URI below, then save full
 * chrome.storage.local to scripts/screenshot-storage-snapshot.json.
 * Run this when you want to refresh the snapshot (e.g. after adding permissions
 * or changing settings). After that, pnpm run screenshots only loads the
 * snapshot and does not need a live NIP-46 connection.
 *
 * Run: pnpm run build && node scripts/capture-screenshot-snapshot.mjs
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pathToExtension = path.resolve(__dirname, '..', '.output', 'chrome-mv3');
const snapshotPath = path.resolve(__dirname, 'screenshot-storage-snapshot.json');

const BUNKER_URI =
  'bunker://52bc9087706bc8c318e50fb5a87e8868a0f0551e6254d6275ff64b4f99c8ad73?relay=wss%3A%2F%2Frelay.nsec.app&relay=wss%3A%2F%2Frelay.damus.io&relay=wss%3A%2F%2Fnos.lol&secret=34f0835bed08100ca2a966d3909df1e6';

async function main() {
  if (!fs.existsSync(path.join(pathToExtension, 'manifest.json'))) {
    console.error('Extension not built. Run: pnpm run build');
    process.exit(1);
  }

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

  if (fs.existsSync(snapshotPath)) {
    const existing = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const optionsPage = await context.newPage();
    await optionsPage.goto(`${extensionOrigin}/options.html`);
    await optionsPage.evaluate((data) => {
      return chrome.storage.local.set(data);
    }, existing);
    await optionsPage.close();
  }

  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`${extensionOrigin}/popup.html`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);

  const bunkerInput = page.getByPlaceholder(/bunker:\/\//);
  await bunkerInput.fill(BUNKER_URI);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByRole('button', { name: 'Disconnect' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);

  const optionsPage = await context.newPage();
  await optionsPage.goto(`${extensionOrigin}/options.html`);
  const fullStorage = await optionsPage.evaluate(() => {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => resolve(data));
    });
  });
  await optionsPage.close();
  await context.close();

  fs.writeFileSync(snapshotPath, JSON.stringify(fullStorage, null, 2), 'utf8');
  console.log('Saved full storage to', snapshotPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
