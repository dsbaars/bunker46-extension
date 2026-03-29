<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import AppHeader from './components/AppHeader.vue';
import ProfileSwitcher from './components/ProfileSwitcher.vue';
import ConnectionTab from './components/ConnectionTab.vue';
import SettingsTab from './components/SettingsTab.vue';
import PermissionsTab from './components/PermissionsTab.vue';
import RemoveProfileDialog from './components/RemoveProfileDialog.vue';
import LogoutDialog from './components/LogoutDialog.vue';
import RenameProfileDialog from './components/RenameProfileDialog.vue';
import PubkeyQrModal from './components/PubkeyQrModal.vue';
import NostrConnectModal from './components/NostrConnectModal.vue';
import { Toaster, toast } from 'vue-sonner';
import 'vue-sonner/style.css';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import { t, getMethodLabel } from '@/lib/i18n';
import { getPermissionDomains, filterAndPinDomains } from '@/lib/domains';
import type { DomainPolicies, ProfileSummary } from './types';

// ---------------------------------------------------------------------------
// Reactive state
// ---------------------------------------------------------------------------

const activeTab = ref<'connection' | 'permissions' | 'settings'>('connection');
const connected = ref(false);
const signerPubkey = ref('');
const signerRelays = ref<string[]>([]);
const baseUrl = ref('http://localhost:5173');
const nostrConnectRelaysInput = ref('wss://relay.nsec.app');
const privacyMode = ref(false);
const showNostrBadge = ref(true);
const useBunker46 = ref(false);
const specifyNostrConnectRelays = ref(false);
const touchedUseBunker46 = ref(false);
const touchedSpecifyNostrConnectRelays = ref(false);
type PubkeyFormat = 'npub' | 'hex' | 'nprofile';
const pubkeyDisplayMode = ref<PubkeyFormat>('npub');
const showQrModal = ref(false);
const qrDataUrl = ref('');
const bunkerUriInput = ref('');
const connecting = ref(false);
/** Relay hostnames extracted from the bunker URI being connected, shown while connecting. */
const connectingRelays = ref<string[]>([]);
/** Per-relay probe status for UI feedback (connecting / ok / failed). */
const relayStatuses = ref<Record<string, 'connecting' | 'ok' | 'failed'>>({});
const connectionStateLoaded = ref(false);
const errorMessage = ref('');
const permissions = ref<DomainPolicies>({});

const showLogoutConfirm = ref(false);
const showNostrConnectModal = ref(false);
const nostrConnectUri = ref('');
const nostrConnectQrDataUrl = ref('');
const nostrConnectWaiting = ref(false);
/** When adding a new profile via Nostr Connect, we only close the modal when profile count increases (not when an existing profile is still connected). */
const nostrConnectInitialProfileCount = ref(0);
let nostrConnectPollTimer: ReturnType<typeof setInterval> | null = null;
let profileSwitchPollTimer: ReturnType<typeof setInterval> | null = null;
const PROFILE_SWITCH_POLL_MS = 1000;
const PROFILE_SWITCH_TIMEOUT_MS = 35_000;

const nostrWhitelist = ref<string[]>([]);
const currentTabDomain = ref('');

// Multi-profile state
const multiProfileEnabled = ref(false);
const allProfiles = ref<ProfileSummary[]>([]);
const activeProfileIdRef = ref<string | null>(null);
const activeProfileName = ref<string | undefined>(undefined);
const activeProfilePicture = ref<string | undefined>(undefined);
const showProfileSwitcher = ref(false);
const addingNewProfile = ref(false);
const showRemoveProfileConfirm = ref(false);
const reconnectionFailed = ref(false);
/** True while background is reconnecting after a profile switch (GET_SESSION returns reconnecting: true). */
const reconnecting = ref(false);
/** Relays the background is currently (or last tried to) connect through. Shown in loading / error UI. */
const reconnectingRelaysList = ref<string[]>([]);
const showRenameModal = ref(false);
const renameProfileId = ref<string | null>(null);
const renameProfileName = ref('');
const renameProfileFetching = ref(false);

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const permissionDomains = computed(() =>
  getPermissionDomains(Object.keys(permissions.value), nostrWhitelist.value)
);
const permissionSearchQuery = ref('');
const filteredPermissionDomains = computed(() =>
  filterAndPinDomains(permissionDomains.value, permissionSearchQuery.value, currentTabDomain.value)
);

function isWhitelistOnly(host: string): boolean {
  return (
    nostrWhitelist.value.includes(host.toLowerCase()) &&
    (!permissions.value[host] || Object.keys(permissions.value[host]).length === 0)
  );
}

const currentTabIsWhitelisted = computed(() =>
  currentTabDomain.value
    ? nostrWhitelist.value.includes(currentTabDomain.value.toLowerCase())
    : false
);
const extensionIconUrl = chrome.runtime.getURL('icon/48.png');

/** True when running in the popup (or extension dialog), false when already on the full options tab. */
const showOpenFullPageButton =
  typeof window !== 'undefined' && !window.location.pathname.includes('options.html');

const pubkeyFormats = computed(() => {
  const hex = signerPubkey.value;
  if (!hex) return { npub: '', hex: '', nprofile: '' };
  try {
    const npub = nip19.npubEncode(hex);
    const nprofile = nip19.nprofileEncode({
      pubkey: hex,
      relays: signerRelays.value ?? [],
    });
    return { npub, hex, nprofile };
  } catch {
    return { npub: hex, hex, nprofile: hex };
  }
});

const pubkeyDisplayValue = computed(() => {
  const fmt = pubkeyFormats.value;
  return fmt[pubkeyDisplayMode.value] || fmt.npub || '';
});

const pubkeyDisplayShort = computed(() => {
  const s = pubkeyDisplayValue.value;
  if (!s || s.length <= 20) return s;
  return s.slice(0, 12) + '…' + s.slice(-10);
});

const activeProfileSummary = computed(() =>
  allProfiles.value.find((p) => p.id === activeProfileIdRef.value)
);

const canDisableMultiProfile = computed(
  () => !multiProfileEnabled.value || allProfiles.value.length <= 1
);

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

function shortNpub(hex: string): string {
  try {
    const npub = nip19.npubEncode(hex);
    if (npub.length <= 24) return npub;
    return npub.slice(0, 12) + '…' + npub.slice(-10);
  } catch {
    if (hex.length <= 20) return hex;
    return hex.slice(0, 10) + '…' + hex.slice(-8);
  }
}

function profileDisplayName(p: ProfileSummary): string {
  if (p.name) return p.name;
  if (p.signerPubkey) return shortNpub(p.signerPubkey);
  return 'Unknown';
}

function cyclePubkeyFormat() {
  const order: PubkeyFormat[] = ['npub', 'hex', 'nprofile'];
  const i = order.indexOf(pubkeyDisplayMode.value);
  pubkeyDisplayMode.value = order[(i + 1) % order.length];
}

// ---------------------------------------------------------------------------
// Reconnect polling + relay probe UI
// ---------------------------------------------------------------------------

/**
 * Probe each relay URL from the popup side and update relayStatuses in real
 * time so the UI can show per-relay ✓/✗ icons.
 *
 * Uses the same logic as the background probeRelays() but drives reactive
 * state instead of returning a map.  Safe to call multiple times; statuses
 * are reset on each call.
 */
function probeRelaysUi(relays: string[]) {
  if (!relays.length) return;
  const initial: Record<string, 'connecting' | 'ok' | 'failed'> = {};
  for (const r of relays) initial[r] = 'connecting';
  relayStatuses.value = initial;

  for (const url of relays) {
    try {
      const ws = new WebSocket(url);
      let settled = false;

      const setStatus = (status: 'ok' | 'failed') => {
        if (settled) return;
        settled = true;
        relayStatuses.value = { ...relayStatuses.value, [url]: status };
      };

      const timer = setTimeout(() => setStatus('ok'), 5_000);

      ws.addEventListener('open', () => {
        clearTimeout(timer);
        setStatus('ok');
        try {
          ws.close(1000, 'probe');
        } catch {
          /* ignore */
        }
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        setStatus('failed');
      });
      ws.addEventListener('close', () => {
        clearTimeout(timer);
        if (!settled) setStatus('failed');
      });
    } catch {
      relayStatuses.value = { ...relayStatuses.value, [url]: 'failed' };
    }
  }
}

/**
 * Start polling GET_SESSION every second until the background is no longer
 * reconnecting, then call loadState + loadPermissions.
 * Also shown during the initial-load reconnect (not just profile switches).
 */
function startReconnectPoll(relays?: string[]) {
  if (relays?.length) {
    reconnectingRelaysList.value = relays;
    probeRelaysUi(relays);
  }
  if (profileSwitchPollTimer) {
    clearInterval(profileSwitchPollTimer);
    profileSwitchPollTimer = null;
  }
  const startedAt = Date.now();
  profileSwitchPollTimer = setInterval(async () => {
    if (Date.now() - startedAt > PROFILE_SWITCH_TIMEOUT_MS) {
      if (profileSwitchPollTimer) clearInterval(profileSwitchPollTimer);
      profileSwitchPollTimer = null;
      connectionStateLoaded.value = true;
      await loadState();
      await loadPermissions();
      return;
    }
    const s = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    const session = s as {
      reconnecting?: boolean;
      reconnectingRelays?: string[];
    };
    if (session.reconnectingRelays?.length) {
      reconnectingRelaysList.value = session.reconnectingRelays;
    }
    if (session.reconnecting) {
      reconnecting.value = true;
      return;
    }
    if (profileSwitchPollTimer) clearInterval(profileSwitchPollTimer);
    profileSwitchPollTimer = null;
    connectionStateLoaded.value = true;
    await loadState();
    await loadPermissions();
  }, PROFILE_SWITCH_POLL_MS);
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadProfiles() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_PROFILES' });
    if (res?.profiles) {
      allProfiles.value = res.profiles as ProfileSummary[];
      activeProfileIdRef.value = (res.activeProfileId as string | null) ?? null;
    }
  } catch {
    /* ignore */
  }
}

async function loadState() {
  let startedPoll = false;
  try {
    const res: {
      connected?: boolean;
      signerPubkey?: string;
      relays?: string[];
      profileName?: string;
      profilePicture?: string;
      activeProfileId?: string;
    } = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    const sessionRes = res as {
      reconnecting?: boolean;
      reconnectionFailed?: boolean;
      reconnectingRelays?: string[];
      reconnectionFailedRelays?: string[];
    };

    reconnecting.value = sessionRes?.reconnecting ?? false;
    activeProfileIdRef.value = res?.activeProfileId ?? null;

    if (sessionRes?.reconnecting && !profileSwitchPollTimer) {
      // Background just kicked off a reconnect; keep the spinner up and poll.
      startedPoll = true;
      if (res?.profileName) activeProfileName.value = res.profileName;
      if (res?.profilePicture) activeProfilePicture.value = res.profilePicture;
      startReconnectPoll(sessionRes.reconnectingRelays);
    } else if (res?.connected) {
      connected.value = true;
      reconnectionFailed.value = false;
      signerPubkey.value = res.signerPubkey ?? '';
      signerRelays.value = res.relays ?? [];
      activeProfileName.value = res.profileName;
      activeProfilePicture.value = res.profilePicture;
    } else {
      connected.value = false;
      signerPubkey.value = '';
      signerRelays.value = [];
      activeProfileName.value = res?.profileName;
      activeProfilePicture.value = res?.profilePicture;
      reconnectionFailed.value = sessionRes?.reconnectionFailed ?? false;
      if (sessionRes?.reconnectionFailedRelays?.length) {
        reconnectingRelaysList.value = sessionRes.reconnectionFailedRelays;
      }
    }

    const stored = await chrome.storage.local.get([
      'bunker46BaseUrl',
      'useBunker46',
      'specifyNostrConnectRelays',
      'nostrConnectRelays',
      'privacyMode',
      'showNostrBadge',
      'multiProfileEnabled',
    ]);
    if (stored.bunker46BaseUrl) baseUrl.value = stored.bunker46BaseUrl as string;
    if (!touchedUseBunker46.value) useBunker46.value = stored.useBunker46 === true;
    if (!touchedSpecifyNostrConnectRelays.value)
      specifyNostrConnectRelays.value = stored.specifyNostrConnectRelays === true;
    const relays = stored.nostrConnectRelays as string[] | undefined;
    if (Array.isArray(relays) && relays.length > 0) {
      nostrConnectRelaysInput.value = relays.join('\n');
    } else {
      nostrConnectRelaysInput.value = 'wss://relay.nsec.app';
    }
    privacyMode.value = stored.privacyMode === true;
    showNostrBadge.value = stored.showNostrBadge !== false;
    multiProfileEnabled.value = stored.multiProfileEnabled === true;
  } catch {
    /* background may not be ready */
  } finally {
    if (!startedPoll) {
      connectionStateLoaded.value = true;
    }
  }
  if (!startedPoll) {
    await loadProfiles();
  }
}

async function loadPermissions() {
  try {
    const [permRes, whitelistRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_PERMISSIONS' }),
      chrome.runtime.sendMessage({ type: 'GET_NOSTR_WHITELIST' }),
    ]);
    if ((permRes as { permissions?: DomainPolicies })?.permissions)
      permissions.value = (permRes as { permissions: DomainPolicies }).permissions;
    if ((whitelistRes as { whitelist?: string[] })?.whitelist)
      nostrWhitelist.value = (whitelistRes as { whitelist: string[] }).whitelist;
  } catch {
    /* ignore */
  }
}

async function fetchCurrentTabDomain() {
  currentTabDomain.value = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
      const host = new URL(tab.url).hostname;
      if (host && !host.startsWith('chrome') && !host.startsWith('edge'))
        currentTabDomain.value = host;
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Connection actions
// ---------------------------------------------------------------------------

/** Extract relay URLs from a bunker:// URI without a full parse. */
function parseRelaysFromBunkerUri(uri: string): string[] {
  try {
    const normalized = uri.trim().replace(/^bunker:\/\//, 'https://');
    const url = new URL(normalized);
    return url.searchParams
      .getAll('relay')
      .filter((r) => r.startsWith('wss://') || r.startsWith('ws://'));
  } catch {
    return [];
  }
}

async function connectWithBunkerUri() {
  const uri = bunkerUriInput.value.trim();
  if (!uri) {
    errorMessage.value = t('errorPasteUri');
    return;
  }
  connecting.value = true;
  connectingRelays.value = parseRelaysFromBunkerUri(uri);
  probeRelaysUi(connectingRelays.value);
  errorMessage.value = '';
  try {
    const res: {
      success?: boolean;
      signerPubkey?: string;
      error?: string;
    } = await chrome.runtime.sendMessage({
      type: 'CONNECT_BUNKER_URI',
      uri,
      asNewProfile: addingNewProfile.value,
    });
    if (res?.success) {
      connected.value = true;
      signerPubkey.value = res.signerPubkey ?? '';
      const sessionRes: {
        relays?: string[];
        profileName?: string;
        profilePicture?: string;
        activeProfileId?: string;
      } = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      signerRelays.value = sessionRes?.relays ?? [];
      activeProfileName.value = sessionRes?.profileName;
      activeProfilePicture.value = sessionRes?.profilePicture;
      activeProfileIdRef.value = sessionRes?.activeProfileId ?? null;
      bunkerUriInput.value = '';
      addingNewProfile.value = false;
      await loadProfiles();
    } else {
      errorMessage.value = res?.error || t('errorConnectionFailed');
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : t('errorConnectionFailed');
  } finally {
    connecting.value = false;
    connectingRelays.value = [];
    relayStatuses.value = {};
  }
}

async function doFullLogout() {
  try {
    await chrome.runtime.sendMessage({ type: 'FULL_LOGOUT' });
    connected.value = false;
    signerPubkey.value = '';
    signerRelays.value = [];
    activeProfileName.value = undefined;
    activeProfilePicture.value = undefined;
    permissions.value = {};
    nostrWhitelist.value = [];
    errorMessage.value = '';
    showLogoutConfirm.value = false;
    addingNewProfile.value = false;
    await loadProfiles();
    toast.success(t('toastLoggedOut'));
  } catch {
    toast.error(t('toastLogoutFailed'));
  }
}

async function switchProfile(profileId: string) {
  showProfileSwitcher.value = false;
  if (profileId === activeProfileIdRef.value) return;
  if (profileSwitchPollTimer) {
    clearInterval(profileSwitchPollTimer);
    profileSwitchPollTimer = null;
  }
  try {
    const res = await chrome.runtime.sendMessage({ type: 'SWITCH_PROFILE', profileId });
    const data = res as {
      success?: boolean;
      activeProfileId?: string;
      profileName?: string;
      profilePicture?: string;
      hasSession?: boolean;
      reconnectingRelays?: string[];
      error?: string;
    };
    if (!data?.success) return;

    // Update UI immediately so the new profile appears selected
    activeProfileIdRef.value = data.activeProfileId ?? profileId;
    activeProfileName.value = data.profileName;
    activeProfilePicture.value = data.profilePicture;
    connected.value = false;
    signerPubkey.value = '';
    signerRelays.value = [];
    reconnectionFailed.value = false;
    await loadProfiles();

    if (!data.hasSession) {
      connectionStateLoaded.value = true;
      await loadState();
      await loadPermissions();
      return;
    }

    reconnecting.value = true;
    connectionStateLoaded.value = false; // Show "Loading" on Connection tab
    startReconnectPoll(data.reconnectingRelays);
  } catch {
    connectionStateLoaded.value = true;
    await loadState();
  }
}

async function doRemoveProfile() {
  showRemoveProfileConfirm.value = false;
  const profileId = activeProfileIdRef.value;
  if (!profileId) return;
  try {
    await chrome.runtime.sendMessage({ type: 'REMOVE_PROFILE', profileId });
    await loadState();
    await loadPermissions();
    reconnectionFailed.value = false;
    toast.success(t('toastProfileRemoved'));
  } catch {
    toast.error(t('toastProfileRemoveFailed'));
  }
}

function openRenameModal(profile: ProfileSummary) {
  renameProfileId.value = profile.id;
  renameProfileName.value = profile.name ?? '';
  showRenameModal.value = true;
  showProfileSwitcher.value = false;
}

async function fetchProfileMetadataForRename() {
  const profileId = renameProfileId.value;
  if (!profileId) return;
  renameProfileFetching.value = true;
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'FETCH_PROFILE_METADATA',
      profileId,
    });
    const data = res as { success?: boolean; name?: string; picture?: string };
    if (data?.success && data.name !== undefined) {
      renameProfileName.value = data.name;
      await loadProfiles();
      toast.success(t('toastProfileMetadataFetched'));
    } else {
      toast.error(t('toastProfileMetadataFetchFailed'));
    }
  } catch {
    toast.error(t('toastProfileMetadataFetchFailed'));
  } finally {
    renameProfileFetching.value = false;
  }
}

async function saveRenameProfile() {
  const profileId = renameProfileId.value;
  if (!profileId) return;
  try {
    await chrome.runtime.sendMessage({
      type: 'RENAME_PROFILE',
      profileId,
      name: renameProfileName.value.trim(),
    });
    await loadProfiles();
    showRenameModal.value = false;
    renameProfileId.value = null;
    renameProfileName.value = '';
    toast.success(t('toastSettingsSaved'));
  } catch {
    toast.error(t('toastProfileRenameFailed'));
  }
}

// ---------------------------------------------------------------------------
// Settings actions
// ---------------------------------------------------------------------------

async function saveBaseUrl() {
  await chrome.storage.local.set({ bunker46BaseUrl: baseUrl.value });
  toast.success(t('toastSettingsSaved'));
}

function parseRelaysInput(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function saveNostrConnectRelays() {
  const relays = parseRelaysInput(nostrConnectRelaysInput.value);
  await chrome.storage.local.set({ nostrConnectRelays: relays });
  toast.success(t('toastSettingsSaved'));
}

async function setPrivacyModeEnabled() {
  const enabled = privacyMode.value;
  await chrome.storage.local.set({ privacyMode: enabled });
  toast.success(enabled ? t('toastPrivacyModeOn') : t('toastPrivacyModeOff'));
}

async function setShowNostrBadgeEnabled() {
  const enabled = showNostrBadge.value;
  await chrome.runtime.sendMessage({ type: 'SET_SHOW_NOSTR_BADGE', enabled });
  toast.success(enabled ? t('toastBadgeShown') : t('toastBadgeHidden'));
}

async function setUseBunker46Enabled() {
  touchedUseBunker46.value = true;
  const enabled = useBunker46.value;
  await chrome.storage.local.set({ useBunker46: enabled });
  toast.success(t('toastSettingsSaved'));
}

async function setSpecifyNostrConnectRelaysEnabled() {
  touchedSpecifyNostrConnectRelays.value = true;
  const enabled = specifyNostrConnectRelays.value;
  await chrome.storage.local.set({ specifyNostrConnectRelays: enabled });
  toast.success(t('toastSettingsSaved'));
}

async function setMultiProfileEnabled() {
  await chrome.storage.local.set({ multiProfileEnabled: multiProfileEnabled.value });
  toast.success(t('toastSettingsSaved'));
}

// ---------------------------------------------------------------------------
// Copy / QR
// ---------------------------------------------------------------------------

async function copyPubkey() {
  const value = pubkeyDisplayValue.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(t('toastCopied'));
  } catch {
    toast.error(t('toastCopyFailed'));
  }
}

async function openQrModal() {
  const value = pubkeyDisplayValue.value;
  if (!value) return;
  try {
    qrDataUrl.value = await QRCode.toDataURL(value, {
      width: 220,
      margin: 1,
      color: { dark: '#0d0d0d', light: '#ffffff' },
    });
    showQrModal.value = true;
  } catch {
    /* ignore */
  }
}

function closeQrModal() {
  showQrModal.value = false;
}

// ---------------------------------------------------------------------------
// Nostr Connect (QR flow)
// ---------------------------------------------------------------------------

async function startNostrConnect() {
  nostrConnectUri.value = '';
  nostrConnectQrDataUrl.value = '';
  errorMessage.value = '';
  try {
    const res: { uri?: string; error?: string } = await chrome.runtime.sendMessage({
      type: 'CONNECT_VIA_NOSTRCONNECT',
      asNewProfile: addingNewProfile.value,
    });
    if (res?.error) {
      errorMessage.value = res.error;
      return;
    }
    const uri = res?.uri ?? '';
    if (!uri) {
      errorMessage.value = t('errorGenerateUri');
      return;
    }
    nostrConnectUri.value = uri;
    nostrConnectQrDataUrl.value = await QRCode.toDataURL(uri, {
      width: 220,
      margin: 1,
      color: { dark: '#0d0d0d', light: '#ffffff' },
    });
    showNostrConnectModal.value = true;
    nostrConnectWaiting.value = true;
    nostrConnectInitialProfileCount.value = addingNewProfile.value ? allProfiles.value.length : 0;
    nostrConnectPollTimer = setInterval(async () => {
      if (addingNewProfile.value) {
        // New profile is only created when the bunker connects; profile count will increase
        const profilesRes = await chrome.runtime.sendMessage({ type: 'GET_PROFILES' });
        const profiles = (profilesRes as { profiles?: ProfileSummary[] })?.profiles ?? [];
        if (profiles.length > nostrConnectInitialProfileCount.value) {
          if (nostrConnectPollTimer) clearInterval(nostrConnectPollTimer);
          nostrConnectPollTimer = null;
          nostrConnectWaiting.value = false;
          showNostrConnectModal.value = false;
          addingNewProfile.value = false;
          await loadState();
        }
      } else {
        const s: { connected?: boolean } = await chrome.runtime.sendMessage({
          type: 'GET_SESSION',
        });
        if (s?.connected) {
          if (nostrConnectPollTimer) clearInterval(nostrConnectPollTimer);
          nostrConnectPollTimer = null;
          nostrConnectWaiting.value = false;
          showNostrConnectModal.value = false;
          await loadState();
        }
      }
    }, 1500);
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : t('errorStartConnection');
  }
}

function closeNostrConnectModal() {
  showNostrConnectModal.value = false;
  nostrConnectWaiting.value = false;
  if (nostrConnectPollTimer) {
    clearInterval(nostrConnectPollTimer);
    nostrConnectPollTimer = null;
  }
}

async function copyNostrConnectUri() {
  const uri = nostrConnectUri.value;
  if (!uri) return;
  try {
    await navigator.clipboard.writeText(uri);
    toast.success(t('toastCopied'));
  } catch {
    toast.error(t('toastCopyFailed'));
  }
}

function openBunker46() {
  const url = baseUrl.value.replace(/\/+$/, '') + '/connections';
  chrome.tabs.create({ url });
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

async function revokePermission(host: string, method: string) {
  try {
    await chrome.runtime.sendMessage({ type: 'REMOVE_PERMISSION', host, method });
    const hostPolicies = permissions.value[host];
    if (hostPolicies) {
      delete hostPolicies[method];
      if (Object.keys(hostPolicies).length === 0) {
        delete permissions.value[host];
      }
    }
    toast.success(t('toastPermissionRemoved'));
  } catch {
    toast.error(t('toastPermissionRemoveFailed'));
  }
}

async function revokeDomain(host: string) {
  try {
    await chrome.runtime.sendMessage({ type: 'REMOVE_DOMAIN_PERMISSIONS', host });
    delete permissions.value[host];
    toast.success(t('toastDomainRemoved'));
  } catch {
    toast.error(t('toastDomainRemoveFailed'));
  }
}

async function addCurrentTabToWhitelist() {
  if (!currentTabDomain.value) await fetchCurrentTabDomain();
  const host = currentTabDomain.value;
  if (!host) {
    toast.error(t('toastNoActiveTab'));
    return;
  }
  try {
    await chrome.runtime.sendMessage({ type: 'ADD_TO_NOSTR_WHITELIST', host });
    const list = [...nostrWhitelist.value, host.toLowerCase()]
      .filter((h, i, a) => a.indexOf(h) === i)
      .sort();
    nostrWhitelist.value = list;
    toast.success(t('toastAddedToWhitelist', host));
  } catch (e) {
    toast.error(e instanceof Error ? e.message : t('toastAddDomainFailed'));
  }
}

async function removeFromWhitelist(host: string) {
  try {
    await chrome.runtime.sendMessage({ type: 'REMOVE_FROM_NOSTR_WHITELIST', host });
    nostrWhitelist.value = nostrWhitelist.value.filter((h) => h !== host.toLowerCase());
    toast.success(t('toastRemovedFromWhitelist'));
  } catch {
    toast.error(t('toastRemoveFromWhitelistFailed'));
  }
}

function switchTab(tab: 'connection' | 'permissions' | 'settings') {
  activeTab.value = tab;
  if (tab === 'permissions') {
    loadPermissions();
    void fetchCurrentTabDomain();
  }
}

function openFullPage() {
  const url = chrome.runtime.getURL('options.html');
  chrome.tabs.create({ url });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  loadState();
  loadPermissions();
});

onUnmounted(() => {
  if (nostrConnectPollTimer) {
    clearInterval(nostrConnectPollTimer);
    nostrConnectPollTimer = null;
  }
  if (profileSwitchPollTimer) {
    clearInterval(profileSwitchPollTimer);
    profileSwitchPollTimer = null;
  }
});
</script>

<template>
  <div class="flex min-w-0 flex-col overflow-x-hidden bg-background text-foreground">
    <Toaster
      theme="dark"
      position="bottom-center"
      rich-colors
      :close-button="false"
      :duration="3000"
    />

    <AppHeader
      :extension-icon-url="extensionIconUrl"
      :show-open-full-page-button="showOpenFullPageButton"
      :connected="connected"
      :reconnecting="reconnecting"
      :signer-relays="signerRelays"
      @open-full-page="openFullPage"
    />

    <ProfileSwitcher
      :multi-profile-enabled="multiProfileEnabled"
      :all-profiles="allProfiles"
      :show-profile-switcher="showProfileSwitcher"
      :active-profile-summary="activeProfileSummary"
      :active-profile-id-ref="activeProfileIdRef"
      :reconnecting="reconnecting"
      :connected="connected"
      :active-profile-name="activeProfileName"
      :profile-display-name="profileDisplayName"
      @toggle-open="showProfileSwitcher = !showProfileSwitcher"
      @close="showProfileSwitcher = false"
      @switch-profile="switchProfile"
      @rename-profile="openRenameModal"
      @add-profile="
        addingNewProfile = true;
        showProfileSwitcher = false;
        activeTab = 'connection';
      "
    />

    <div class="flex border-b border-border">
      <button
        :class="[
          'flex-1 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer',
          activeTab === 'connection'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground',
        ]"
        @click="switchTab('connection')"
      >
        {{ t('tabConnection') }}
      </button>
      <button
        :class="[
          'flex-1 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer',
          activeTab === 'permissions'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground',
        ]"
        @click="switchTab('permissions')"
      >
        {{ t('tabPermissions') }}
      </button>
      <button
        :class="[
          'flex-1 px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer',
          activeTab === 'settings'
            ? 'text-foreground border-b-2 border-primary'
            : 'text-muted-foreground hover:text-foreground',
        ]"
        @click="switchTab('settings')"
      >
        {{ t('tabSettings') }}
      </button>
    </div>

    <div
      v-if="errorMessage && activeTab === 'connection'"
      class="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
    >
      <span class="mt-px shrink-0">!</span>
      <span>{{ errorMessage }}</span>
    </div>

    <ConnectionTab
      v-if="activeTab === 'connection'"
      :connection-state-loaded="connectionStateLoaded"
      :reconnecting-relays-list="reconnectingRelaysList"
      :relay-statuses="relayStatuses"
      :adding-new-profile="addingNewProfile"
      :use-bunker46="useBunker46"
      :connecting="connecting"
      :bunker-uri-input="bunkerUriInput"
      :connecting-relays="connectingRelays"
      :reconnection-failed="reconnectionFailed"
      :connected="connected"
      :multi-profile-enabled="multiProfileEnabled"
      :active-profile-summary="activeProfileSummary"
      :active-profile-name="activeProfileName"
      :active-profile-picture="activeProfilePicture"
      :signer-pubkey="signerPubkey"
      :pubkey-display-value="pubkeyDisplayValue"
      :pubkey-display-short="pubkeyDisplayShort"
      :pubkey-display-mode="pubkeyDisplayMode"
      @update:bunker-uri-input="bunkerUriInput = $event"
      @connect-bunker-uri="connectWithBunkerUri"
      @start-nostr-connect="startNostrConnect"
      @open-bunker46="openBunker46"
      @cancel-add-profile="
        addingNewProfile = false;
        errorMessage = '';
      "
      @request-remove-profile="showRemoveProfileConfirm = true"
      @request-logout="showLogoutConfirm = true"
      @start-add-profile="
        addingNewProfile = true;
        errorMessage = '';
      "
      @cycle-pubkey-format="cyclePubkeyFormat"
      @copy-pubkey="copyPubkey"
      @open-qr-modal="openQrModal"
    />

    <SettingsTab
      v-if="activeTab === 'settings'"
      :multi-profile-enabled="multiProfileEnabled"
      :can-disable-multi-profile="canDisableMultiProfile"
      :privacy-mode="privacyMode"
      :show-nostr-badge="showNostrBadge"
      :use-bunker46="useBunker46"
      :base-url="baseUrl"
      :specify-nostr-connect-relays="specifyNostrConnectRelays"
      :nostr-connect-relays-input="nostrConnectRelaysInput"
      @update:multi-profile-enabled="multiProfileEnabled = $event"
      @update:privacy-mode="privacyMode = $event"
      @update:show-nostr-badge="showNostrBadge = $event"
      @update:use-bunker46="useBunker46 = $event"
      @update:base-url="baseUrl = $event"
      @update:specify-nostr-connect-relays="specifyNostrConnectRelays = $event"
      @update:nostr-connect-relays-input="nostrConnectRelaysInput = $event"
      @set-multi-profile-enabled="setMultiProfileEnabled"
      @set-privacy-mode-enabled="setPrivacyModeEnabled"
      @set-show-nostr-badge-enabled="setShowNostrBadgeEnabled"
      @set-use-bunker46-enabled="setUseBunker46Enabled"
      @save-base-url="saveBaseUrl"
      @set-specify-nostr-connect-relays-enabled="setSpecifyNostrConnectRelaysEnabled"
      @save-nostr-connect-relays="saveNostrConnectRelays"
    />

    <PermissionsTab
      v-if="activeTab === 'permissions'"
      :privacy-mode="privacyMode"
      :current-tab-domain="currentTabDomain"
      :current-tab-is-whitelisted="currentTabIsWhitelisted"
      :permission-search-query="permissionSearchQuery"
      :permission-domains="permissionDomains"
      :filtered-permission-domains="filteredPermissionDomains"
      :permissions="permissions"
      :nostr-whitelist="nostrWhitelist"
      :is-whitelist-only="isWhitelistOnly"
      :get-method-label="getMethodLabel"
      @update:permission-search-query="permissionSearchQuery = $event"
      @add-current-tab-to-whitelist="addCurrentTabToWhitelist"
      @remove-from-whitelist="removeFromWhitelist"
      @revoke-domain="revokeDomain"
      @revoke-permission="revokePermission"
    />

    <RemoveProfileDialog
      :open="showRemoveProfileConfirm"
      @update:open="showRemoveProfileConfirm = $event"
      @confirm="doRemoveProfile"
    />

    <LogoutDialog
      :open="showLogoutConfirm"
      @update:open="showLogoutConfirm = $event"
      @confirm="doFullLogout"
    />

    <RenameProfileDialog
      :open="showRenameModal"
      :rename-profile-name="renameProfileName"
      :rename-profile-fetching="renameProfileFetching"
      @update:open="showRenameModal = $event"
      @update:rename-profile-name="renameProfileName = $event"
      @fetch-profile-metadata="fetchProfileMetadataForRename"
      @save="saveRenameProfile"
    />

    <PubkeyQrModal
      :show="showQrModal"
      :qr-data-url="qrDataUrl"
      :pubkey-display-mode="pubkeyDisplayMode"
      @close="closeQrModal"
    />

    <NostrConnectModal
      :show="showNostrConnectModal"
      :nostr-connect-qr-data-url="nostrConnectQrDataUrl"
      :nostr-connect-waiting="nostrConnectWaiting"
      @copy-uri="copyNostrConnectUri"
      @close="closeNostrConnectModal"
    />
  </div>
</template>
