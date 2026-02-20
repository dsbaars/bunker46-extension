/**
 * NIP-07 compliant window.nostr provider.
 * Injects the provider script (public/nostr-provider.js) into the page via script.src
 * so it runs in the main world and is not blocked by CSP. This content script (isolated
 * world) bridges nip07-request events to the background via chrome.runtime.
 * @see https://nips.nostr.com/7
 */

const EVENT_REQUEST = 'nip07-request';
const _EVENT_RESPONSE = 'nip07-response';

const METHOD_TO_TYPE: Record<string, string> = {
  getPublicKey: 'NIP07_GET_PUBLIC_KEY',
  signEvent: 'NIP07_SIGN_EVENT',
  getRelays: 'NIP07_GET_RELAYS',
  nip04_encrypt: 'NIP04_ENCRYPT',
  nip04_decrypt: 'NIP04_DECRYPT',
  nip44_encrypt: 'NIP44_ENCRYPT',
  nip44_decrypt: 'NIP44_DECRYPT',
};

const PROVIDER_SCRIPT_URL = 'nostr-provider.js';
const NOSTRCONNECT_PREFIX = 'nostrconnect:';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main(ctx) {
    document.addEventListener(
      'click',
      (e: MouseEvent) => {
        const anchor = (e.target as Element)?.closest?.('a');
        if (!anchor?.href) return;
        try {
          if (anchor.href.startsWith(NOSTRCONNECT_PREFIX)) {
            e.preventDefault();
            e.stopPropagation();
            chrome.runtime.sendMessage({ type: 'OPEN_NOSTRCONNECT_URI', uri: anchor.href });
          }
        } catch {
          /* ignore */
        }
      },
      true
    );

    document.addEventListener(EVENT_REQUEST, async (e: Event) => {
      const ev = e as CustomEvent<{ id: string; method: string; params?: unknown[] }>;
      const { id, method, params } = ev.detail ?? {};
      if (!id || !method) return;
      const type = METHOD_TO_TYPE[method];
      function sendResponse(payload: { id: string; error?: string; result?: unknown }) {
        window.postMessage({ type: 'nip07-response', payload }, '*');
      }
      if (!type) {
        sendResponse({ id, error: 'Unknown NIP-07 method' });
        return;
      }
      try {
        const res = await chrome.runtime.sendMessage({
          type,
          params: params ?? [],
        });
        if (!ctx.isValid) return;
        if (res?.error) {
          sendResponse({ id, error: res.error });
        } else {
          sendResponse({ id, result: res?.result });
        }
      } catch (err) {
        if (!ctx.isValid) return;
        sendResponse({
          id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(PROVIDER_SCRIPT_URL);
    script.onload = () => script.remove();
    (document.documentElement || document.head).appendChild(script);
  },
});
