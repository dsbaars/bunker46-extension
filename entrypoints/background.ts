import { generateSecretKey, getPublicKey, SimplePool } from 'nostr-tools';
import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  toBunkerURL,
} from 'nostr-tools/nip46';
import { bytesToHex } from '@/lib/hex';
import { DEFAULT_NOSTRCONNECT_RELAYS, NIP46_APP_NAME } from '@/lib/constants';
import {
  checkPermission,
  setPermission,
  getPermissions,
  removePermission,
  removeDomainPermissions,
  clearAllPermissions,
  deleteProfilePermissions,
} from '@/lib/permissions';
import type { DomainPolicies } from '@/lib/permissions';
import {
  shouldExposeNostrForHost,
  addToNostrWhitelist,
  removeFromNostrWhitelist,
  getNostrWhitelist,
  clearNostrWhitelist,
  deleteProfileWhitelist,
} from '@/lib/privacy-mode';
import type { NIP07SignEventInput } from '@/lib/nip07/types';
import {
  migrateToProfiles,
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  generateNewClientSecret,
  getClientSecretBytes,
  profilesToSummaries,
} from '@/lib/profiles';
import type { Profile, Session } from '@/lib/profiles';

const STORAGE_KEY_NOSTRCONNECT_RELAYS = 'nostrConnectRelays';

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

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

let bunkerSigner: BunkerSigner | null = null;
let activeProfile: Profile | null = null;
let activeProfileId: string | null = null;
/** True while reconnectFromSession() is running (e.g. after SWITCH_PROFILE). GET_SESSION returns reconnecting: true without blocking. */
let reconnecting = false;
const pendingPermissions = new Map<string, PendingPermission>();
/** Raw event payload for signEvent permission prompts (requestId -> event). Cleaned up on response. */
const pendingRawEvents = new Map<string, unknown>();

// ---------------------------------------------------------------------------
// Profile state management
// ---------------------------------------------------------------------------

async function loadActiveProfileFromStorage(): Promise<void> {
  activeProfileId = await getActiveProfileId();
  if (!activeProfileId) {
    activeProfile = null;
    return;
  }
  const profiles = await getProfiles();
  activeProfile = profiles[activeProfileId] ?? null;
}

async function persistProfileSession(profileId: string, session: Session): Promise<void> {
  const profiles = await getProfiles();
  if (!profiles[profileId]) return;
  profiles[profileId] = { ...profiles[profileId], session };
  await saveProfiles(profiles);
  if (profileId === activeProfileId) {
    activeProfile = profiles[profileId];
  }
}

async function clearProfileSession(profileId: string): Promise<void> {
  const profiles = await getProfiles();
  if (!profiles[profileId]) return;
  const { session: _session, ...rest } = profiles[profileId];
  profiles[profileId] = rest as Profile;
  await saveProfiles(profiles);
  if (profileId === activeProfileId) {
    activeProfile = profiles[profileId];
    bunkerSigner = null;
  }
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const BUNKER_CONNECT_TIMEOUT_MS = 30_000;
const STORAGE_KEY_SHOW_BADGE = 'showNostrBadge';
const NOSTR_BADGE_COLOR = '#a855f7';

async function getShowNostrBadge(): Promise<boolean> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_SHOW_BADGE);
  return raw[STORAGE_KEY_SHOW_BADGE] !== false;
}

function setBadgeForTab(tabId: number, count: number): void {
  try {
    const text = count > 0 ? (count > 9 ? '9+' : String(count)) : '';
    chrome.action.setBadgeText({ tabId, text });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: NOSTR_BADGE_COLOR });
    }
  } catch {
    /* ignore e.g. invalid tabId */
  }
}

function countAllowedPermissions(policies: DomainPolicies, host: string): number {
  const hostPolicies = policies[host];
  if (!hostPolicies) return 0;
  return Object.values(hostPolicies).filter((p) => p.decision === 'allow').length;
}

async function updateBadgeForTabsWithHost(host: string): Promise<void> {
  const profileId = activeProfileId ?? undefined;
  const showBadge = await getShowNostrBadge();
  if (!showBadge) {
    await clearBadgeForTabsWithHost(host);
    return;
  }
  const [policies, inject] = await Promise.all([
    getPermissions(profileId),
    shouldExposeNostrForHost(host, profileId),
  ]);
  const count = inject ? countAllowedPermissions(policies, host) : 0;
  let tabs: { id?: number; url?: string }[];
  try {
    tabs = await new Promise((resolve) => {
      chrome.tabs.query({}, (result: { id?: number; url?: string }[]) => resolve(result ?? []));
    });
  } catch {
    return;
  }
  const normalizedHost = host.trim().toLowerCase();
  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    try {
      const tabHost = new URL(tab.url).hostname.toLowerCase();
      if (tabHost === normalizedHost) {
        setBadgeForTab(tab.id, count);
      }
    } catch {
      /* ignore invalid URL */
    }
  }
}

async function clearBadgeForTabsWithHost(host: string): Promise<void> {
  let tabs: { id?: number; url?: string }[];
  try {
    tabs = await new Promise((resolve) => {
      chrome.tabs.query({}, (result: { id?: number; url?: string }[]) => resolve(result ?? []));
    });
  } catch {
    return;
  }
  const normalizedHost = host.trim().toLowerCase();
  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    try {
      const tabHost = new URL(tab.url).hostname.toLowerCase();
      if (tabHost === normalizedHost) {
        setBadgeForTab(tab.id, 0);
      }
    } catch {
      /* ignore */
    }
  }
}

async function clearAllBadges(): Promise<void> {
  let tabs: { id?: number }[];
  try {
    tabs = await new Promise((resolve) => {
      chrome.tabs.query({}, (result: { id?: number }[]) => resolve(result ?? []));
    });
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id != null) setBadgeForTab(tab.id, 0);
  }
}

// ---------------------------------------------------------------------------
// NIP-65 relay list
// ---------------------------------------------------------------------------

const NIP65_KIND_RELAY_LIST = 10002;
const NIP65_FETCH_TIMEOUT_MS = 8_000;

type RelayEntry = [string, { read: boolean; write: boolean }];

async function fetchNip65RelayList(pubkey: string, relays: string[]): Promise<RelayEntry[] | null> {
  if (!relays.length) return null;
  const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);
  try {
    const event = await withTimeout(
      pool.get(
        relays,
        { kinds: [NIP65_KIND_RELAY_LIST], authors: [pubkey] },
        { maxWait: NIP65_FETCH_TIMEOUT_MS }
      ),
      NIP65_FETCH_TIMEOUT_MS + 2_000,
      'NIP-65 relay list fetch timed out'
    );
    pool.close(relays);
    if (!event?.tags?.length) return null;
    const byUrl = new Map<string, { read: boolean; write: boolean }>();
    for (const tag of event.tags) {
      if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
      const url = tag[1].trim();
      if (!url) continue;
      const marker = typeof tag[2] === 'string' ? tag[2].toLowerCase() : undefined;
      const read = marker === undefined || marker === 'read';
      const write = marker === undefined || marker === 'write';
      const existing = byUrl.get(url);
      byUrl.set(url, {
        read: existing ? existing.read || read : read,
        write: existing ? existing.write || write : write,
      });
    }
    if (byUrl.size === 0) return null;
    return Array.from(byUrl.entries(), ([u, rw]) => [u, rw] as RelayEntry);
  } catch {
    pool.close(relays);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Kind 0 metadata fetch (name / picture)
// ---------------------------------------------------------------------------

const KIND0_FETCH_TIMEOUT_MS = 8_000;

/**
 * Fetch kind 0 (metadata) for the signer pubkey from session relays.
 * Updates the profile's name and picture in storage. Fire-and-forget.
 */
async function fetchKind0ForProfile(
  profileId: string,
  pubkey: string,
  relays: string[]
): Promise<void> {
  if (!relays.length) return;
  const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);
  try {
    const event = await withTimeout(
      pool.get(relays, { kinds: [0], authors: [pubkey] }),
      KIND0_FETCH_TIMEOUT_MS,
      'Kind 0 fetch timed out'
    );
    pool.close(relays);
    if (!event?.content) return;

    const metadata = JSON.parse(event.content) as Record<string, unknown>;

    let name: string | undefined;
    if (typeof metadata.name === 'string' && metadata.name.trim()) {
      name = metadata.name.trim();
    } else if (typeof metadata.nip05 === 'string' && metadata.nip05.trim()) {
      const nip05 = metadata.nip05.trim();
      name = nip05.includes('@') ? nip05.split('@')[0] : nip05;
    }

    let picture: string | undefined;
    if (
      typeof metadata.picture === 'string' &&
      (metadata.picture.startsWith('https://') || metadata.picture.startsWith('http://'))
    ) {
      picture = metadata.picture;
    }

    if (name === undefined && picture === undefined) return;

    const profiles = await getProfiles();
    if (!profiles[profileId]) return;

    profiles[profileId] = {
      ...profiles[profileId],
      ...(name !== undefined ? { name } : {}),
      ...(picture !== undefined ? { picture } : {}),
    };
    await saveProfiles(profiles);
    if (profileId === activeProfileId) {
      activeProfile = profiles[profileId];
    }
  } catch {
    try {
      pool.close(relays);
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Connection helpers
// ---------------------------------------------------------------------------

/** Reconnect to the bunker using the active profile's stored session + client secret. */
async function reconnectFromSession(): Promise<boolean> {
  const session = activeProfile?.session;
  if (!session?.signerPubkey || !session.relays?.length) return false;
  if (!activeProfile) return false;
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
    const secret = getClientSecretBytes(activeProfile);
    const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);
    const signer = BunkerSigner.fromBunker(secret, bp, { pool });
    await withTimeout(signer.connect(), BUNKER_CONNECT_TIMEOUT_MS, 'Reconnection timed out.');
    bunkerSigner = signer;
    return true;
  } catch {
    return false;
  }
}

/**
 * Connect to a bunker via URI.
 * If `asNewProfile` is true or no active profile exists, a new profile is created.
 * Otherwise the active profile's session is updated.
 */
async function connectWithBunkerUri(
  uri: string,
  opts?: { asNewProfile?: boolean }
): Promise<{ success: boolean; signerPubkey?: string; profileId?: string; error?: string }> {
  try {
    const bp = await parseBunkerInput(uri);
    if (!bp) return { success: false, error: 'Invalid bunker URI' };
    if (!bp.relays?.length) return { success: false, error: 'No relays in bunker URI' };

    const createNew = opts?.asNewProfile === true || !activeProfileId;

    let profileId: string;
    let clientSecretBytes: Uint8Array;
    let clientSecretHex: string;

    if (createNew) {
      const { hex, bytes } = generateNewClientSecret();
      clientSecretHex = hex;
      clientSecretBytes = bytes;
      profileId = crypto.randomUUID();
    } else {
      profileId = activeProfileId!;
      clientSecretBytes = getClientSecretBytes(activeProfile!);
      clientSecretHex = activeProfile!.clientSecretHex;
    }

    const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);
    const signer = BunkerSigner.fromBunker(clientSecretBytes, bp, { pool });

    await withTimeout(
      signer.connect(),
      BUNKER_CONNECT_TIMEOUT_MS,
      'Connection timed out. The bunker may be slow or unreachable—check relays and try again.'
    );

    const signerPubkey = await signer.getPublicKey();
    const session: Session = { signerPubkey, relays: bp.relays, bunkerUri: uri };

    const profiles = await getProfiles();
    if (createNew) {
      profiles[profileId] = { id: profileId, clientSecretHex, session };
    } else {
      profiles[profileId] = { ...profiles[profileId], session };
    }
    await saveProfiles(profiles);

    activeProfileId = profileId;
    activeProfile = profiles[profileId];
    await setActiveProfileId(profileId);
    bunkerSigner = signer;

    void fetchKind0ForProfile(profileId, signerPubkey, bp.relays);

    return { success: true, signerPubkey, profileId };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : typeof e === 'string' ? e : 'Connection failed';
    return { success: false, error: message };
  }
}

/** One-time secret for nostrconnect URI (bunker echoes it back to confirm). */
function randomNostrConnectSecret(): string {
  return bytesToHex(generateSecretKey());
}

/**
 * Start connecting via nostrconnect: generate a URI, show it as QR/copy;
 * wait for bunker to connect in the background and persist session when done.
 */
function startNostrConnectConnection(opts?: { asNewProfile?: boolean }): Promise<{ uri: string }> {
  return (async () => {
    const createNew = opts?.asNewProfile === true || !activeProfileId;

    let profileId: string;
    let clientSecretBytesVal: Uint8Array;
    let clientSecretHex: string;

    if (createNew) {
      const { hex, bytes } = generateNewClientSecret();
      clientSecretHex = hex;
      clientSecretBytesVal = bytes;
      profileId = crypto.randomUUID();
    } else {
      profileId = activeProfileId!;
      clientSecretBytesVal = getClientSecretBytes(activeProfile!);
      clientSecretHex = activeProfile!.clientSecretHex;
    }

    const clientPubkey = getPublicKey(clientSecretBytesVal);
    const pool = new SimplePool({ maxWaitForConnection: 10_000 } as Record<string, unknown>);

    const data = await chrome.storage.local.get(STORAGE_KEY_NOSTRCONNECT_RELAYS);
    const stored = data[STORAGE_KEY_NOSTRCONNECT_RELAYS] as string[] | undefined;
    const relays =
      Array.isArray(stored) && stored.length > 0
        ? stored.map((r) => String(r).trim()).filter((r) => r.length > 0)
        : DEFAULT_NOSTRCONNECT_RELAYS;

    const oneTimeSecret = randomNostrConnectSecret();
    const uri = createNostrConnectURI({
      clientPubkey,
      relays,
      secret: oneTimeSecret,
      name: NIP46_APP_NAME,
    });

    // Wait for bunker to connect in the background; create/persist profile only on success
    BunkerSigner.fromURI(clientSecretBytesVal, uri, { pool }, BUNKER_CONNECT_TIMEOUT_MS)
      .then(async (signer) => {
        const signerPubkey = await signer.getPublicKey();
        const session: Session = {
          signerPubkey,
          relays: signer.bp.relays,
          bunkerUri: toBunkerURL(signer.bp),
        };

        if (createNew) {
          const profiles = await getProfiles();
          profiles[profileId] = { id: profileId, clientSecretHex, session };
          await saveProfiles(profiles);
          activeProfileId = profileId;
          activeProfile = profiles[profileId];
          await setActiveProfileId(profileId);
        } else {
          await persistProfileSession(profileId, session);
        }

        bunkerSigner = signer;
        void fetchKind0ForProfile(profileId, signerPubkey, signer.bp.relays);
      })
      .catch(() => {
        // Popup may poll GET_SESSION; no need to surface timeout here
      });

    return { uri };
  })();
}

// ---------------------------------------------------------------------------
// Permission enforcement
// ---------------------------------------------------------------------------

async function requestPermission(
  host: string,
  method: string,
  params?: unknown[]
): Promise<boolean> {
  const requestId = Math.random().toString(36).slice(2) + Date.now();

  const qs = new URLSearchParams({ requestId, host, method });

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
    pendingPermissions.set(requestId, { resolve, windowId: win.id! });
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

  const kind =
    method === 'signEvent' ? (params?.[0] as { kind?: number } | undefined)?.kind : undefined;
  const decision = await checkPermission(host, method, kind, activeProfileId ?? undefined);
  if (decision === 'allow') return { allowed: true };
  if (decision === 'deny') return { allowed: false, error: 'Permission denied' };

  const allowed = await requestPermission(host, method, params);
  return allowed ? { allowed: true } : { allowed: false, error: 'Permission denied' };
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

/** Message types that may only be sent from extension pages (popup, prompt, options), not content scripts. */
const PRIVILEGED_MESSAGE_TYPES = new Set([
  'PERMISSION_RESPONSE',
  'GET_SESSION',
  'CONNECT_BUNKER_URI',
  'CONNECT_VIA_NOSTRCONNECT',
  'GET_PROFILES',
  'SWITCH_PROFILE',
  'REMOVE_PROFILE',
  'RENAME_PROFILE',
  'FETCH_PROFILE_METADATA',
  'ADD_TO_NOSTR_WHITELIST',
  'GET_NOSTR_WHITELIST',
  'REMOVE_FROM_NOSTR_WHITELIST',
  'SET_SHOW_NOSTR_BADGE',
  'DISCONNECT',
  'FULL_LOGOUT',
  'GET_RAW_EVENT',
  'GET_PERMISSIONS',
  'REMOVE_PERMISSION',
  'REMOVE_DOMAIN_PERMISSIONS',
]);

function isExtensionPage(sender: { url?: string }): boolean {
  if (!sender?.url) return false;
  const base = chrome.runtime.getURL('');
  return sender.url === base || sender.url.startsWith(base);
}

function isPromptPage(sender: { url?: string }): boolean {
  return Boolean(sender?.url?.includes('prompt.html'));
}

function validateNip04Nip44Params(params: unknown[]): params is [string, string] {
  return params.length >= 2 && typeof params[0] === 'string' && typeof params[1] === 'string';
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
      enabled?: boolean;
      profileId?: string;
      asNewProfile?: boolean;
      name?: string;
    },
    sender: { url?: string; tab?: { id?: number } },
    sendResponse: (response: unknown) => void
  ) => {
    (async () => {
      // Restrict privileged messages to extension pages only (defense-in-depth).
      if (PRIVILEGED_MESSAGE_TYPES.has(msg.type)) {
        if (msg.type === 'GET_RAW_EVENT') {
          if (!isPromptPage(sender)) return { error: 'Unauthorized' };
        } else if (!isExtensionPage(sender)) {
          return { error: 'Unauthorized' };
        }
      }

      // --- Prompt window responses ---
      if (msg.type === 'PERMISSION_RESPONSE' && msg.requestId && msg.decision) {
        const pending = pendingPermissions.get(msg.requestId);
        if (!pending) return {};
        pendingRawEvents.delete(msg.requestId);
        pendingPermissions.delete(msg.requestId);

        let host = '';
        let method = '';
        let eventKind: number | undefined;
        if (sender?.url) {
          try {
            const params = new URL(sender.url).searchParams;
            host = params.get('host') ?? '';
            method = params.get('method') ?? '';
            const kindParam = params.get('eventKind');
            if (kindParam !== null && kindParam !== '') {
              const n = parseInt(kindParam, 10);
              if (!Number.isNaN(n) && n >= 0) eventKind = n;
            }
          } catch {
            /* ignore */
          }
        }

        const profileId = activeProfileId ?? undefined;

        if (msg.decision === 'allow_always') {
          if (host && method)
            await setPermission(
              host,
              method,
              'allow',
              method === 'signEvent' ? eventKind : undefined,
              profileId
            );
          if (host) void updateBadgeForTabsWithHost(host);
          pending.resolve(true);
        } else if (msg.decision === 'deny_always') {
          if (host && method)
            await setPermission(
              host,
              method,
              'deny',
              method === 'signEvent' ? eventKind : undefined,
              profileId
            );
          if (host) void updateBadgeForTabsWithHost(host);
          pending.resolve(false);
        } else if (msg.decision === 'allow_once') {
          pending.resolve(true);
        } else {
          pending.resolve(false);
        }
        return {};
      }

      // --- Session / profile management ---
      if (msg.type === 'GET_SESSION') {
        await loadActiveProfileFromStorage();
        if (reconnecting) {
          return { connected: false, reconnecting: true, activeProfileId };
        }
        if (activeProfile?.session && !bunkerSigner) {
          const reconnected = await reconnectFromSession();
          if (!reconnected) {
            return {
              connected: false,
              reconnectionFailed: true,
              activeProfileId,
              profileName: activeProfile.name,
              profilePicture: activeProfile.picture,
            };
          }
        }
        if (bunkerSigner && activeProfile?.session) {
          return {
            connected: true,
            signerPubkey: activeProfile.session.signerPubkey,
            relays: activeProfile.session.relays,
            profileName: activeProfile.name,
            profilePicture: activeProfile.picture,
            activeProfileId,
          };
        }
        return { connected: false, activeProfileId };
      }

      if (msg.type === 'CONNECT_BUNKER_URI' && msg.uri) {
        return await connectWithBunkerUri(msg.uri, { asNewProfile: msg.asNewProfile });
      }

      if (msg.type === 'CONNECT_VIA_NOSTRCONNECT') {
        return await startNostrConnectConnection({ asNewProfile: msg.asNewProfile });
      }

      if (msg.type === 'GET_PROFILES') {
        const [profiles, currentActiveId] = await Promise.all([
          getProfiles(),
          getActiveProfileId(),
        ]);
        return {
          profiles: profilesToSummaries(profiles),
          activeProfileId: currentActiveId,
        };
      }

      if (msg.type === 'SWITCH_PROFILE' && msg.profileId) {
        const targetId = msg.profileId;
        const profiles = await getProfiles();
        if (!profiles[targetId]) return { success: false, error: 'Profile not found' };

        // Close current signer
        if (bunkerSigner) {
          try {
            await bunkerSigner.close();
          } catch {
            /* ignore */
          }
          bunkerSigner = null;
        }

        activeProfileId = targetId;
        activeProfile = profiles[targetId];
        await setActiveProfileId(targetId);

        // Reconnect in background so UI can update immediately
        if (activeProfile.session?.signerPubkey) {
          reconnecting = true;
          reconnectFromSession()
            .then(() => {})
            .finally(() => {
              reconnecting = false;
            });
        }

        return {
          success: true,
          activeProfileId: targetId,
          profileName: activeProfile.name,
          profilePicture: activeProfile.picture,
          hasSession: Boolean(activeProfile.session?.signerPubkey),
        };
      }

      if (msg.type === 'REMOVE_PROFILE' && msg.profileId) {
        const targetId = msg.profileId;
        const profiles = await getProfiles();
        if (!profiles[targetId]) return { success: false, error: 'Profile not found' };

        const wasActive = targetId === activeProfileId;

        // If removing active profile, disconnect
        if (wasActive && bunkerSigner) {
          try {
            await bunkerSigner.close();
          } catch {
            /* ignore */
          }
          bunkerSigner = null;
        }

        // Remove profile and its data
        delete profiles[targetId];
        await saveProfiles(profiles);
        await deleteProfilePermissions(targetId);
        await deleteProfileWhitelist(targetId);

        let newActiveId: string | null = null;

        if (wasActive) {
          // Switch to another profile if available
          const remaining = Object.keys(profiles);
          newActiveId = remaining.length > 0 ? remaining[0] : null;
          activeProfileId = newActiveId;
          activeProfile = newActiveId ? profiles[newActiveId] : null;
          await setActiveProfileId(newActiveId);

          // Reconnect if new active profile has session
          let connected = false;
          if (activeProfile?.session?.signerPubkey) {
            connected = await reconnectFromSession();
          }
          void connected; // suppress unused warning
        }

        await clearAllBadges();

        return {
          success: true,
          newActiveProfileId: wasActive ? newActiveId : activeProfileId,
        };
      }

      if (msg.type === 'RENAME_PROFILE' && msg.profileId && typeof msg.name === 'string') {
        const profiles = await getProfiles();
        if (!profiles[msg.profileId]) return { success: false, error: 'Profile not found' };
        profiles[msg.profileId] = {
          ...profiles[msg.profileId],
          name: msg.name.trim() || undefined,
        };
        await saveProfiles(profiles);
        if (msg.profileId === activeProfileId) {
          activeProfile = profiles[msg.profileId];
        }
        return { success: true };
      }

      if (msg.type === 'FETCH_PROFILE_METADATA' && msg.profileId) {
        const profiles = await getProfiles();
        const profile = profiles[msg.profileId];
        if (!profile?.session?.signerPubkey || !profile.session.relays?.length) {
          return { success: false, error: 'Profile has no session or relays' };
        }
        await fetchKind0ForProfile(
          msg.profileId,
          profile.session.signerPubkey,
          profile.session.relays
        );
        const updated = await getProfiles();
        const p = updated[msg.profileId];
        return {
          success: true,
          name: p?.name,
          picture: p?.picture,
        };
      }

      if (msg.type === 'SHOULD_INJECT_NOSTR' && typeof msg.host === 'string') {
        const host = msg.host;
        // Ensure profile is loaded (service worker may have restarted)
        if (activeProfileId === null) await loadActiveProfileFromStorage();
        const profileId = activeProfileId ?? undefined;
        const [inject, policies, showBadge] = await Promise.all([
          shouldExposeNostrForHost(host, profileId),
          getPermissions(profileId),
          getShowNostrBadge(),
        ]);
        const count = showBadge && inject ? countAllowedPermissions(policies, host) : 0;
        const tabId = sender.tab?.id;
        if (tabId !== undefined) {
          setBadgeForTab(tabId, count);
        }
        return { inject };
      }

      if (msg.type === 'ADD_TO_NOSTR_WHITELIST' && typeof msg.host === 'string') {
        await addToNostrWhitelist(msg.host, activeProfileId ?? undefined);
        return {};
      }

      if (msg.type === 'GET_NOSTR_WHITELIST') {
        return { whitelist: await getNostrWhitelist(activeProfileId ?? undefined) };
      }

      if (msg.type === 'REMOVE_FROM_NOSTR_WHITELIST' && typeof msg.host === 'string') {
        await removeFromNostrWhitelist(msg.host, activeProfileId ?? undefined);
        void updateBadgeForTabsWithHost(msg.host);
        return {};
      }

      if (msg.type === 'SET_SHOW_NOSTR_BADGE' && typeof msg.enabled === 'boolean') {
        await chrome.storage.local.set({ [STORAGE_KEY_SHOW_BADGE]: msg.enabled });
        if (!msg.enabled) await clearAllBadges();
        return {};
      }

      // Open nostrconnect URI in Bunker46 (only when "Use bunker46" is enabled)
      if (msg.type === 'OPEN_NOSTRCONNECT_URI' && msg.uri) {
        const data = await chrome.storage.local.get(['useBunker46', 'bunker46BaseUrl']);
        if (data.useBunker46 !== true) return {};
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
        if (activeProfileId) await clearProfileSession(activeProfileId);
        return {};
      }

      if (msg.type === 'FULL_LOGOUT') {
        if (bunkerSigner) {
          try {
            await bunkerSigner.close();
          } catch {}
        }
        bunkerSigner = null;
        const profileId = activeProfileId ?? undefined;
        if (activeProfileId) await clearProfileSession(activeProfileId);
        await clearAllPermissions(profileId);
        await clearNostrWhitelist(profileId);
        await clearAllBadges();
        return {};
      }

      if (msg.type === 'GET_RAW_EVENT' && msg.requestId) {
        return { event: pendingRawEvents.get(msg.requestId) ?? null };
      }

      if (msg.type === 'GET_PERMISSIONS') {
        const perms = await getPermissions(activeProfileId ?? undefined);
        return { permissions: perms };
      }

      if (msg.type === 'REMOVE_PERMISSION' && msg.host && msg.method) {
        await removePermission(msg.host, msg.method, undefined, activeProfileId ?? undefined);
        void updateBadgeForTabsWithHost(msg.host);
        return {};
      }

      if (msg.type === 'REMOVE_DOMAIN_PERMISSIONS' && msg.host) {
        await removeDomainPermissions(msg.host, activeProfileId ?? undefined);
        void updateBadgeForTabsWithHost(msg.host);
        return {};
      }

      // --- NIP-07 from content script ---
      const nip07Method = NIP07_METHOD_MAP[msg.type];
      if (nip07Method) {
        await loadActiveProfileFromStorage();
        if (activeProfile?.session && !bunkerSigner) await reconnectFromSession();
        if (!bunkerSigner || !activeProfile?.session) {
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

        const session = activeProfile.session;
        if (msg.type === 'NIP07_GET_RELAYS') {
          const pubkey = await bunkerSigner.getPublicKey();
          const nip65 =
            session.relays.length > 0 ? await fetchNip65RelayList(pubkey, session.relays) : null;
          const list: RelayEntry[] =
            nip65 && nip65.length > 0
              ? nip65
              : session.relays.map((r) => [r, { read: true, write: true }] as RelayEntry);
          return { result: list };
        }

        const nip44Params = msg.params ?? [];
        if (msg.type === 'NIP04_ENCRYPT' && validateNip04Nip44Params(nip44Params)) {
          return { result: await bunkerSigner.nip04Encrypt(nip44Params[0], nip44Params[1]) };
        }
        if (msg.type === 'NIP04_DECRYPT' && validateNip04Nip44Params(nip44Params)) {
          return { result: await bunkerSigner.nip04Decrypt(nip44Params[0], nip44Params[1]) };
        }
        if (msg.type === 'NIP44_ENCRYPT' && validateNip04Nip44Params(nip44Params)) {
          return { result: await bunkerSigner.nip44Encrypt(nip44Params[0], nip44Params[1]) };
        }
        if (msg.type === 'NIP44_DECRYPT' && validateNip04Nip44Params(nip44Params)) {
          return { result: await bunkerSigner.nip44Decrypt(nip44Params[0], nip44Params[1]) };
        }

        if (
          ['NIP04_ENCRYPT', 'NIP04_DECRYPT', 'NIP44_ENCRYPT', 'NIP44_DECRYPT'].includes(msg.type)
        ) {
          return { error: 'Invalid params: NIP-04/NIP-44 methods require two string arguments' };
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
  // Run migration (idempotent) before anything else
  await migrateToProfiles();

  // Load active profile and attempt reconnect
  await loadActiveProfileFromStorage();
  if (activeProfile?.session && !bunkerSigner) void reconnectFromSession();
});
