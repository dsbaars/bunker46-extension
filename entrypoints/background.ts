import { generateSecretKey, SimplePool } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import { bytesToHex, hexToBytes } from '@/lib/hex';
import {
  checkPermission,
  setPermission,
  getPermissions,
  removePermission,
  removeDomainPermissions,
} from '@/lib/permissions';
import type { NIP07SignEventInput } from '@/lib/nip07/types';

const STORAGE_KEY_CLIENT_SECRET = 'nip46_client_secret_hex';
const STORAGE_KEY_SESSION = 'nip46_session';

type Session = {
  signerPubkey: string;
  relays: string[];
  /** Optional: original bunker URI for reconnection (may include one-time secret). */
  bunkerUri?: string;
};

type PendingPermission = {
  resolve: (allowed: boolean) => void;
  windowId: number;
};

const NIP07_METHOD_MAP: Record<string, string> = {
  NIP07_GET_PUBLIC_KEY: 'getPublicKey',
  NIP07_SIGN_EVENT: 'signEvent',
  NIP07_GET_RELAYS: 'getRelays',
  NIP04_ENCRYPT: 'nip04_encrypt',
  NIP04_DECRYPT: 'nip04_decrypt',
  NIP44_ENCRYPT: 'nip44_encrypt',
  NIP44_DECRYPT: 'nip44_decrypt',
};

function validateSignEventInput(event: unknown): event is NIP07SignEventInput {
  if (!event || typeof event !== 'object') return false;
  const e = event as Record<string, unknown>;
  return (
    typeof e.kind === 'number' &&
    typeof e.content === 'string' &&
    Array.isArray(e.tags) &&
    typeof e.created_at === 'number'
  );
}

let bunkerSigner: BunkerSigner | null = null;
let session: Session | null = null;
const pendingPermissions = new Map<string, PendingPermission>();
/** Raw event payload for signEvent permission prompts (requestId -> event). Cleaned up on response. */
const pendingRawEvents = new Map<string, unknown>();

async function getOrCreateClientKey(): Promise<Uint8Array> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_CLIENT_SECRET);
  const hex = raw[STORAGE_KEY_CLIENT_SECRET] as string | undefined;
  if (hex) return hexToBytes(hex);
  const secret = generateSecretKey();
  await chrome.storage.local.set({
    [STORAGE_KEY_CLIENT_SECRET]: bytesToHex(secret),
  });
  return secret;
}

async function loadSessionFromStorage(): Promise<void> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_SESSION);
  session = (raw[STORAGE_KEY_SESSION] as Session) ?? null;
}

async function persistSession(s: Session): Promise<void> {
  session = s;
  await chrome.storage.local.set({ [STORAGE_KEY_SESSION]: s });
}

async function clearSession(): Promise<void> {
  session = null;
  bunkerSigner = null;
  await chrome.storage.local.remove(STORAGE_KEY_SESSION);
}

const BUNKER_CONNECT_TIMEOUT_MS = 30_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/** Reconnect to the bunker using stored session (e.g. after service worker restarted). */
async function reconnectFromSession(): Promise<boolean> {
  if (!session?.signerPubkey || !session.relays?.length) return false;
  try {
    let bp: { pubkey: string; relays: string[]; secret: string | null };
    if (session.bunkerUri) {
      const parsed = await parseBunkerInput(session.bunkerUri);
      if (!parsed) return false;
      bp = parsed;
    } else {
      bp = {
        pubkey: session.signerPubkey,
        relays: session.relays,
        secret: null,
      };
    }
    const secret = await getOrCreateClientKey();
    const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);
    const signer = BunkerSigner.fromBunker(secret, bp, { pool });
    await withTimeout(
      signer.connect(),
      BUNKER_CONNECT_TIMEOUT_MS,
      'Reconnection timed out.'
    );
    bunkerSigner = signer;
    return true;
  } catch {
    return false;
  }
}

async function connectWithBunkerUri(
  uri: string
): Promise<{ success: boolean; signerPubkey?: string; error?: string }> {
  try {
    const bp = await parseBunkerInput(uri);
    if (!bp) return { success: false, error: 'Invalid bunker URI' };
    if (!bp.relays?.length) return { success: false, error: 'No relays in bunker URI' };

    const secret = await getOrCreateClientKey();
    const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);
    const signer = BunkerSigner.fromBunker(secret, bp, { pool });

    // Use built-in connect(): sends [remotePubkey, secret]. Some bunkers (e.g. nsec.app) return
    // the secret as result instead of "ack"; both are success.
    await withTimeout(
      signer.connect(),
      BUNKER_CONNECT_TIMEOUT_MS,
      'Connection timed out. The bunker may be slow or unreachable—check relays and try again.'
    );
    const signerPubkey = await signer.getPublicKey();
    bunkerSigner = signer;
    await persistSession({
      signerPubkey,
      relays: bp.relays,
      bunkerUri: uri,
    });
    return { success: true, signerPubkey };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : typeof e === 'string' ? e : 'Connection failed';
    return { success: false, error: message };
  }
}

async function requestPermission(
  host: string,
  method: string,
  params?: unknown[]
): Promise<boolean> {
  const requestId = Math.random().toString(36).slice(2) + Date.now();

  const qs = new URLSearchParams({
    requestId,
    host,
    method,
  });

  if (method === 'signEvent' && params?.[0]) {
    const evt = params[0] as { kind?: number };
    if (evt.kind !== undefined) qs.set('eventKind', String(evt.kind));
    pendingRawEvents.set(requestId, params[0]);
  }

  const promptUrl = chrome.runtime.getURL(`prompt.html?${qs.toString()}`);

  const lastFocused = await chrome.windows.getLastFocused();
  const width = 400;
  const height = 440;
  const left =
    lastFocused.left !== undefined && lastFocused.width !== undefined
      ? Math.round(lastFocused.left + (lastFocused.width - width) / 2)
      : undefined;
  const top =
    lastFocused.top !== undefined && lastFocused.height !== undefined
      ? Math.round(lastFocused.top + (lastFocused.height - height) / 2)
      : undefined;

  const win = await chrome.windows.create({
    url: promptUrl,
    type: 'popup',
    width,
    height,
    left,
    top,
    focused: true,
  });

  return new Promise<boolean>((resolve) => {
    pendingPermissions.set(requestId, {
      resolve,
      windowId: win.id!,
    });
  });
}

async function enforcePermission(
  senderUrl: string | undefined,
  msgType: string,
  params?: unknown[]
): Promise<{ allowed: boolean; error?: string }> {
  const method = NIP07_METHOD_MAP[msgType];
  if (!method) return { allowed: true };

  if (!senderUrl) return { allowed: false, error: 'Unknown origin' };

  let host: string;
  try {
    host = new URL(senderUrl).hostname;
  } catch {
    return { allowed: false, error: 'Invalid origin' };
  }

  const decision = await checkPermission(host, method);
  if (decision === 'allow') return { allowed: true };
  if (decision === 'deny') return { allowed: false, error: 'Permission denied' };

  const allowed = await requestPermission(host, method, params);
  return allowed ? { allowed: true } : { allowed: false, error: 'Permission denied' };
}

chrome.runtime.onMessage.addListener(
  (
    msg: {
      type: string;
      uri?: string;
      method?: string;
      params?: unknown[];
      host?: string;
      requestId?: string;
      decision?: string;
    },
    sender: { url?: string },
    sendResponse: (response: unknown) => void
  ) => {
    (async () => {
      // --- Prompt window responses ---
      if (msg.type === 'PERMISSION_RESPONSE' && msg.requestId && msg.decision) {
        const pending = pendingPermissions.get(msg.requestId);
        if (!pending) return {};
        pendingRawEvents.delete(msg.requestId);
        pendingPermissions.delete(msg.requestId);

        // Host and method are in the prompt page URL (sender.url)
        let host = '';
        let method = '';
        if (sender?.url) {
          try {
            const params = new URL(sender.url).searchParams;
            host = params.get('host') ?? '';
            method = params.get('method') ?? '';
          } catch {
            /* ignore */
          }
        }

        if (msg.decision === 'allow_always') {
          if (host && method) await setPermission(host, method, 'allow');
          pending.resolve(true);
        } else if (msg.decision === 'deny_always') {
          if (host && method) await setPermission(host, method, 'deny');
          pending.resolve(false);
        } else if (msg.decision === 'allow_once') {
          pending.resolve(true);
        } else {
          pending.resolve(false);
        }
        return {};
      }

      // --- Popup management messages ---
      if (msg.type === 'GET_SESSION') {
        await loadSessionFromStorage();
        if (session && !bunkerSigner) await reconnectFromSession();
        if (bunkerSigner && session)
          return {
            connected: true,
            signerPubkey: session.signerPubkey,
            relays: session.relays,
          };
        return { connected: false };
      }

      if (msg.type === 'CONNECT_BUNKER_URI' && msg.uri) {
        return await connectWithBunkerUri(msg.uri);
      }

      // Open nostrconnect URI in Bunker46 (avoids loading extension page in tab — often blocked by ad blockers)
      if (msg.type === 'OPEN_NOSTRCONNECT_URI' && msg.uri) {
        const data = await chrome.storage.local.get('bunker46BaseUrl');
        const baseUrl = (data.bunker46BaseUrl as string) || 'http://localhost:5173';
        const base = baseUrl.replace(/\/+$/, '');
        const target = `${base}/connections?import=${encodeURIComponent(msg.uri)}`;
        await chrome.tabs.create({ url: target });
        return {};
      }

      if (msg.type === 'DISCONNECT') {
        if (bunkerSigner) {
          try {
            await bunkerSigner.close();
          } catch {}
        }
        await clearSession();
        return {};
      }

      if (msg.type === 'GET_RAW_EVENT' && msg.requestId) {
        return { event: pendingRawEvents.get(msg.requestId) ?? null };
      }

      if (msg.type === 'GET_PERMISSIONS') {
        const perms = await getPermissions();
        return { permissions: perms };
      }

      if (msg.type === 'REMOVE_PERMISSION' && msg.host && msg.method) {
        await removePermission(msg.host, msg.method);
        return {};
      }

      if (msg.type === 'REMOVE_DOMAIN_PERMISSIONS' && msg.host) {
        await removeDomainPermissions(msg.host);
        return {};
      }

      // --- NIP-07 from content script (NIP-07 compliant: getPublicKey, signEvent, optional nip04/nip44/getRelays) ---
      const nip07Method = NIP07_METHOD_MAP[msg.type];
      if (nip07Method) {
        await loadSessionFromStorage();
        if (session && !bunkerSigner) await reconnectFromSession();
        if (!bunkerSigner || !session) {
          return { error: 'Not connected to signer. Connect in the extension popup.' };
        }

        const permResult = await enforcePermission(sender.url, msg.type, msg.params);
        if (!permResult.allowed) {
          return { error: permResult.error ?? 'Permission denied' };
        }

        if (msg.type === 'NIP07_GET_PUBLIC_KEY') {
          const pubkey = await bunkerSigner.getPublicKey();
          return { result: pubkey };
        }

        if (msg.type === 'NIP07_SIGN_EVENT') {
          const rawEvent = msg.params?.[0];
          if (!validateSignEventInput(rawEvent)) {
            return {
              error:
                'Invalid event: must have kind (number), content (string), tags (string[][]), created_at (number)',
            };
          }
          const event = await bunkerSigner.signEvent(rawEvent);
          return { result: event };
        }

        if (msg.type === 'NIP07_GET_RELAYS') {
          return {
            result: session.relays.map((r) => [r, { read: true, write: true }]),
          };
        }

        if (
          msg.type === 'NIP04_ENCRYPT' &&
          msg.params?.[0] !== undefined &&
          msg.params?.[1] !== undefined
        ) {
          return {
            result: await bunkerSigner.nip04Encrypt(
              msg.params[0] as string,
              msg.params[1] as string
            ),
          };
        }

        if (
          msg.type === 'NIP04_DECRYPT' &&
          msg.params?.[0] !== undefined &&
          msg.params?.[1] !== undefined
        ) {
          return {
            result: await bunkerSigner.nip04Decrypt(
              msg.params[0] as string,
              msg.params[1] as string
            ),
          };
        }

        if (
          msg.type === 'NIP44_ENCRYPT' &&
          msg.params?.[0] !== undefined &&
          msg.params?.[1] !== undefined
        ) {
          return {
            result: await bunkerSigner.nip44Encrypt(
              msg.params[0] as string,
              msg.params[1] as string
            ),
          };
        }

        if (
          msg.type === 'NIP44_DECRYPT' &&
          msg.params?.[0] !== undefined &&
          msg.params?.[1] !== undefined
        ) {
          return {
            result: await bunkerSigner.nip44Decrypt(
              msg.params[0] as string,
              msg.params[1] as string
            ),
          };
        }
      }

      return { error: 'Unknown message type' };
    })()
      .then(sendResponse)
      .catch((e) => sendResponse({ error: e?.message ?? 'Unknown error' }));
    return true;
  }
);

chrome.windows.onRemoved.addListener((windowId: number) => {
  for (const [requestId, pending] of pendingPermissions) {
    if (pending.windowId === windowId) {
      pendingRawEvents.delete(requestId);
      pending.resolve(false);
      pendingPermissions.delete(requestId);
    }
  }
});

export default defineBackground(async () => {
  await loadSessionFromStorage();
  if (session && !bunkerSigner) void reconnectFromSession();
});
