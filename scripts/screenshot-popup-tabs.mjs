/**
 * Takes screenshots of each popup tab (Connection, Permissions, Settings) and
 * the prompt dialog. Loads storage from scripts/screenshot-storage-snapshot.json
 * (must contain a connected session; run scripts/capture-screenshot-snapshot.mjs once).
 * No live NIP-46 connection is made. Screenshots the #app element (360px wide).
 *
 * Prompt: opened with URL params only; the raw-event block (with JSON syntax
 * highlighting) is injected by this script via DOM after load—no extension code
 * is changed for screenshots.
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

/** Tokenize pretty-printed JSON for syntax-highlight HTML (matches lib/json-highlight.ts). */
function tokenizeJson(json) {
  const trimmed = json.trim();
  const tokens = [];
  let i = 0;
  const n = trimmed.length;
  let nextIsKey = true;
  const PUNCT = /^[{}[\],:]/;
  const STRING = /^"(?:[^"\\]|\\.)*"/;
  const NUMBER = /^-?\d+\.?\d*([eE][+-]?\d+)?/;
  const LITERAL = /^(true|false|null)/;

  while (i < n) {
    const rest = trimmed.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      tokens.push({ type: 'punctuation', text: ws[0] });
      i += ws[0].length;
      continue;
    }
    const punct = PUNCT.exec(rest);
    if (punct) {
      const ch = punct[0];
      tokens.push({ type: 'punctuation', text: ch });
      i += ch.length;
      nextIsKey = ch === '{' || ch === ',' || ch === '[';
      continue;
    }
    const str = STRING.exec(rest);
    if (str) {
      tokens.push({ type: nextIsKey ? 'key' : 'string', text: str[0] });
      i += str[0].length;
      const after = trimmed.slice(i);
      const afterWs = /^\s*/.exec(after);
      const afterIdx = i + (afterWs?.[0]?.length ?? 0);
      nextIsKey = trimmed[afterIdx] === ':';
      continue;
    }
    const num = NUMBER.exec(rest);
    if (num) {
      tokens.push({ type: 'number', text: num[0] });
      i += num[0].length;
      nextIsKey = false;
      continue;
    }
    const lit = LITERAL.exec(rest);
    if (lit) {
      const val = lit[1];
      tokens.push({ type: val === 'null' ? 'null' : 'boolean', text: val });
      i += val.length;
      nextIsKey = false;
      continue;
    }
    tokens.push({ type: 'punctuation', text: rest[0] ?? '' });
    i += 1;
  }
  return tokens;
}

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

  // Prompt dialog: open with URL params only (no extension changes). Inject the
  // raw-event block from the screenshot script so the JSON syntax highlighting appears.
  const sampleEvent = {
    kind: 1,
    content: 'Hello from Bunker',
    tags: [['client', 'bunker46-extension']],
    created_at: Math.floor(Date.now() / 1000),
  };
  const jsonStr = JSON.stringify(sampleEvent, null, 2).trim();
  const tokens = tokenizeJson(jsonStr);
  const escape = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const spansHtml = tokens
    .map((t) => `<span class="json-${t.type}">${escape(t.text)}</span>`)
    .join('');
  const rawBlockHtml = `
    <div class="w-full flex flex-col gap-1.5 min-h-0">
      <button type="button" class="w-full justify-between h-8 text-xs text-muted-foreground hover:text-foreground inline-flex items-center rounded-md px-3 font-medium">
        <span>Hide raw message</span>
        <svg class="size-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>
      <div class="rounded-lg border border-border bg-card overflow-auto max-h-32 min-h-0 json-pre">
        <pre class="p-3 text-xs whitespace-pre-wrap wrap-break-word m-0">${spansHtml}</pre>
      </div>
    </div>
  `.trim();

  const promptPage = await context.newPage();
  const promptQs = new URLSearchParams({
    requestId: 'screenshot',
    host: 'example.com',
    method: 'signEvent',
    eventKind: '1',
  });
  await promptPage.setViewportSize({ width: 360, height: 480 });
  await promptPage.goto(`${extensionOrigin}/prompt.html?${promptQs.toString()}`);
  await promptPage.waitForLoadState('networkidle');
  await promptPage.waitForTimeout(400);

  await promptPage.evaluate((html) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Allow always')
    );
    const grid = btn?.closest('.grid') ?? btn?.parentElement;
    if (!grid?.parentElement) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    grid.parentElement.insertBefore(wrapper.firstElementChild, grid);
  }, rawBlockHtml);

  await promptPage.waitForTimeout(100);
  const promptApp = promptPage.locator('#app');
  await promptApp.screenshot({
    path: path.join(outDir, 'prompt-permission.png'),
  });
  console.log('Saved docs/screenshots/prompt-permission.png');
  await promptPage.close();

  await context.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
