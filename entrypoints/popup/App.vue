<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardTitle from '@/components/ui/CardTitle.vue';
import CardDescription from '@/components/ui/CardDescription.vue';
import CardContent from '@/components/ui/CardContent.vue';
import Input from '@/components/ui/Input.vue';
import Badge from '@/components/ui/Badge.vue';
import Separator from '@/components/ui/Separator.vue';
import Label from '@/components/ui/Label.vue';
import ChoiceCard from '@/components/ui/ChoiceCard.vue';
import { Toaster, toast } from 'vue-sonner';
import 'vue-sonner/style.css';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui';
import {
  Link2,
  Unplug,
  Loader2,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Trash2,
  Globe,
  QrCode,
  Copy,
  Search,
  Plus,
} from 'lucide-vue-next';
import { t, getMethodLabel } from '@/lib/i18n';

type PermissionEntry = {
  decision: 'allow' | 'deny';
  created_at: number;
};

type DomainPolicies = {
  [host: string]: {
    [method: string]: PermissionEntry;
  };
};

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
type PubkeyFormat = 'npub' | 'hex' | 'nprofile';
const pubkeyDisplayMode = ref<PubkeyFormat>('npub');
const showQrModal = ref(false);
const qrDataUrl = ref('');
const bunkerUriInput = ref('');
const connecting = ref(false);
const connectionStateLoaded = ref(false);
const errorMessage = ref('');
const permissions = ref<DomainPolicies>({});

const showLogoutConfirm = ref(false);
const showNostrConnectModal = ref(false);
const nostrConnectUri = ref('');
const nostrConnectQrDataUrl = ref('');
const nostrConnectWaiting = ref(false);
let nostrConnectPollTimer: ReturnType<typeof setInterval> | null = null;

const nostrWhitelist = ref<string[]>([]);
const currentTabDomain = ref('');

const permissionDomains = computed(() => {
  const fromPerms = Object.keys(permissions.value);
  const fromWhitelist = nostrWhitelist.value;
  return [...new Set([...fromPerms, ...fromWhitelist])].sort();
});
const permissionSearchQuery = ref('');
const filteredPermissionDomains = computed(() => {
  const q = permissionSearchQuery.value.trim().toLowerCase();
  if (!q) return permissionDomains.value;
  return permissionDomains.value.filter((host) => host.toLowerCase().includes(q));
});

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

function cyclePubkeyFormat() {
  const order: PubkeyFormat[] = ['npub', 'hex', 'nprofile'];
  const i = order.indexOf(pubkeyDisplayMode.value);
  pubkeyDisplayMode.value = order[(i + 1) % order.length];
}

async function loadState() {
  try {
    const res: {
      connected?: boolean;
      signerPubkey?: string;
      relays?: string[];
    } = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    if (res?.connected) {
      connected.value = true;
      signerPubkey.value = res.signerPubkey ?? '';
      signerRelays.value = res.relays ?? [];
    }
    const stored = await chrome.storage.local.get([
      'bunker46BaseUrl',
      'useBunker46',
      'specifyNostrConnectRelays',
      'nostrConnectRelays',
      'privacyMode',
      'showNostrBadge',
    ]);
    if (stored.bunker46BaseUrl) baseUrl.value = stored.bunker46BaseUrl as string;
    useBunker46.value = stored.useBunker46 === true;
    specifyNostrConnectRelays.value = stored.specifyNostrConnectRelays === true;
    const relays = stored.nostrConnectRelays as string[] | undefined;
    if (Array.isArray(relays) && relays.length > 0) {
      nostrConnectRelaysInput.value = relays.join('\n');
    } else {
      nostrConnectRelaysInput.value = 'wss://relay.nsec.app';
    }
    privacyMode.value = stored.privacyMode === true;
    showNostrBadge.value = stored.showNostrBadge !== false;
  } catch {
    /* background may not be ready */
  } finally {
    connectionStateLoaded.value = true;
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

async function connectWithBunkerUri() {
  const uri = bunkerUriInput.value.trim();
  if (!uri) {
    errorMessage.value = t('errorPasteUri');
    return;
  }
  connecting.value = true;
  errorMessage.value = '';
  try {
    const res: {
      success?: boolean;
      signerPubkey?: string;
      error?: string;
    } = await chrome.runtime.sendMessage({ type: 'CONNECT_BUNKER_URI', uri });
    if (res?.success) {
      connected.value = true;
      signerPubkey.value = res.signerPubkey ?? '';
      const sessionRes = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      signerRelays.value = (sessionRes as { relays?: string[] })?.relays ?? [];
      bunkerUriInput.value = '';
    } else {
      errorMessage.value = res?.error || t('errorConnectionFailed');
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : t('errorConnectionFailed');
  } finally {
    connecting.value = false;
  }
}

async function doFullLogout() {
  try {
    await chrome.runtime.sendMessage({ type: 'FULL_LOGOUT' });
    connected.value = false;
    signerPubkey.value = '';
    signerRelays.value = [];
    permissions.value = {};
    nostrWhitelist.value = [];
    errorMessage.value = '';
    showLogoutConfirm.value = false;
    toast.success(t('toastLoggedOut'));
  } catch {
    toast.error(t('toastLogoutFailed'));
  }
}

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
  const enabled = useBunker46.value;
  await chrome.storage.local.set({ useBunker46: enabled });
  toast.success(t('toastSettingsSaved'));
}

async function setSpecifyNostrConnectRelaysEnabled() {
  const enabled = specifyNostrConnectRelays.value;
  await chrome.storage.local.set({ specifyNostrConnectRelays: enabled });
  toast.success(t('toastSettingsSaved'));
}

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

async function startNostrConnect() {
  nostrConnectUri.value = '';
  nostrConnectQrDataUrl.value = '';
  errorMessage.value = '';
  try {
    const res: { uri?: string; error?: string } = await chrome.runtime.sendMessage({
      type: 'CONNECT_VIA_NOSTRCONNECT',
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
    nostrConnectPollTimer = setInterval(async () => {
      const s: { connected?: boolean } = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      if (s?.connected) {
        if (nostrConnectPollTimer) clearInterval(nostrConnectPollTimer);
        nostrConnectPollTimer = null;
        nostrConnectWaiting.value = false;
        showNostrConnectModal.value = false;
        await loadState();
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
    if (privacyMode.value) void fetchCurrentTabDomain();
  }
}

onMounted(() => {
  loadState();
  loadPermissions();
});

onUnmounted(() => {
  if (nostrConnectPollTimer) {
    clearInterval(nostrConnectPollTimer);
    nostrConnectPollTimer = null;
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
    <!-- Header -->
    <header class="flex items-center justify-between px-5 py-4">
      <div class="flex items-center gap-2.5">
        <img :src="extensionIconUrl" alt="" class="size-8 rounded-lg object-contain" />
        <div>
          <h1 class="text-sm font-semibold leading-tight">{{ t('extName') }}</h1>
          <p class="text-xs text-muted-foreground leading-tight">{{ t('appSubtitle') }}</p>
        </div>
      </div>
      <Badge :variant="connected ? 'success' : 'secondary'">
        <span
          :class="['size-1.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground']"
        />
        {{ connected ? t('connected') : t('offline') }}
      </Badge>
    </header>

    <!-- Tabs -->
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

    <!-- Error banner -->
    <div
      v-if="errorMessage && activeTab === 'connection'"
      class="mx-5 mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
    >
      <span class="mt-px shrink-0">!</span>
      <span>{{ errorMessage }}</span>
    </div>

    <!-- CONNECTION TAB -->
    <template v-if="activeTab === 'connection'">
      <!-- Loading: avoid flashing connect form when already connected -->
      <div
        v-if="!connectionStateLoaded"
        class="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground"
      >
        <Loader2 class="size-5 animate-spin" />
        <span class="text-xs">{{ t('loading') }}</span>
      </div>
      <!-- Connected state -->
      <div v-else-if="connected" class="flex flex-col gap-4 p-5">
        <Card>
          <CardContent class="pt-5">
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center size-10 rounded-full bg-success/15">
                  <KeyRound class="size-5 text-success" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">{{ t('signerKey') }}</p>
                  <div class="flex items-center gap-2">
                    <button
                      class="text-xs text-muted-foreground font-mono truncate block max-w-full hover:text-foreground transition-colors cursor-pointer text-left flex-1 min-w-0"
                      :title="pubkeyDisplayValue"
                      @click="cyclePubkeyFormat"
                    >
                      {{ pubkeyDisplayShort }}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      :title="t('copyTitle')"
                      @click="copyPubkey"
                    >
                      <Copy class="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      :title="t('showQrTitle')"
                      @click="openQrModal"
                    >
                      <QrCode class="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <p class="text-xs text-muted-foreground leading-relaxed">
                {{ t('signerDescription') }}
              </p>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" class="w-full" @click="showLogoutConfirm = true">
          <Unplug class="size-4" />
          {{ t('disconnect') }}
        </Button>

        <!-- Log out confirmation (disconnect + clear permissions + whitelist) -->
        <AlertDialogRoot v-model:open="showLogoutConfirm">
          <AlertDialogPortal>
            <AlertDialogOverlay
              class="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            />
            <AlertDialogContent
              class="fixed left-1/2 top-1/2 z-50 w-full max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            >
              <AlertDialogTitle class="text-sm font-semibold">
                {{ t('logoutConfirmTitle') }}
              </AlertDialogTitle>
              <AlertDialogDescription class="mt-2 text-xs text-muted-foreground">
                {{ t('logoutConfirmDescription') }}
              </AlertDialogDescription>
              <div class="mt-4 flex justify-end gap-2">
                <AlertDialogCancel as-child>
                  <Button variant="outline" size="sm"> {{ t('cancel') }} </Button>
                </AlertDialogCancel>
                <AlertDialogAction as-child>
                  <Button variant="destructive" size="sm" @click="doFullLogout">
                    {{ t('logOut') }}
                  </Button>
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialogPortal>
        </AlertDialogRoot>
      </div>

      <!-- Disconnected state -->
      <div v-else class="flex flex-col gap-4 p-5">
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <Link2 class="size-4 text-primary" />
              <CardTitle>{{ t('connectViaBunkerUri') }}</CardTitle>
            </div>
            <CardDescription>
              {{ t('connectViaBunkerUriDesc') }}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex flex-col gap-3">
              <Input
                v-model="bunkerUriInput"
                :placeholder="t('placeholderBunkerUri')"
                :disabled="connecting"
                class="font-mono text-xs"
                @keydown.enter="connectWithBunkerUri"
              />
              <Button
                class="w-full"
                :disabled="connecting || !bunkerUriInput.trim()"
                @click="connectWithBunkerUri"
              >
                <Loader2 v-if="connecting" class="size-4 animate-spin" />
                <Link2 v-else class="size-4" />
                {{ connecting ? t('connecting') : t('connect') }}
              </Button>

              <template v-if="useBunker46">
                <Separator :label="t('separatorOr')" />
                <Button variant="outline" class="w-full" @click="openBunker46">
                  <ExternalLink class="size-4" />
                  {{ t('getUriFromBunker46') }}
                </Button>
              </template>

              <Separator :label="t('separatorOr')" />

              <div class="flex flex-col gap-3">
                <p class="text-xs text-muted-foreground">
                  {{ t('nostrConnectDesc') }}
                </p>
                <Button variant="outline" class="w-full" @click="startNostrConnect">
                  <QrCode class="size-4" />
                  {{ t('showQrConnectionUri') }}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- SETTINGS TAB -->
    <template v-if="activeTab === 'settings'">
      <div class="flex min-w-0 flex-col gap-4 overflow-x-hidden p-5">
        <ChoiceCard
          v-model="privacyMode"
          :label="t('privacyMode')"
          :description="t('privacyModeHint') + ' ' + t('privacyModeSitesHint')"
          @update:model-value="setPrivacyModeEnabled()"
        />
        <ChoiceCard
          v-model="showNostrBadge"
          :label="t('showBadge')"
          :description="t('showBadgeHint')"
          @update:model-value="setShowNostrBadgeEnabled()"
        />
        <ChoiceCard
          v-model="useBunker46"
          :label="t('settingsUseBunker46')"
          :description="t('settingsUseBunker46Hint')"
          @update:model-value="setUseBunker46Enabled()"
        >
          <div class="flex flex-col gap-2">
            <Label class="text-xs">{{ t('settingsBunkerUrl') }}</Label>
            <Input
              v-model="baseUrl"
              :placeholder="t('settingsBunkerUrlPlaceholder')"
              class="text-xs"
              @click.stop
            />
            <p class="text-xs text-muted-foreground">{{ t('settingsBunkerUrlHint') }}</p>
            <Button size="sm" class="w-fit" @click.stop="saveBaseUrl">
              {{ t('save') }}
            </Button>
          </div>
        </ChoiceCard>
        <ChoiceCard
          v-model="specifyNostrConnectRelays"
          :label="t('settingsSpecifyNostrConnectRelays')"
          :description="t('settingsSpecifyNostrConnectRelaysHint')"
          @update:model-value="setSpecifyNostrConnectRelaysEnabled()"
        >
          <div class="flex flex-col gap-2">
            <Label class="text-xs">{{ t('settingsNostrConnectRelays') }}</Label>
            <textarea
              v-model="nostrConnectRelaysInput"
              :placeholder="t('settingsNostrConnectRelaysPlaceholder')"
              rows="3"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              @click.stop
            />
            <p class="text-xs text-muted-foreground">
              {{ t('settingsNostrConnectRelaysHint') }}
            </p>
            <Button size="sm" class="w-fit" @click.stop="saveNostrConnectRelays">
              {{ t('save') }}
            </Button>
          </div>
        </ChoiceCard>
      </div>
    </template>

    <!-- PERMISSIONS TAB -->
    <template v-if="activeTab === 'permissions'">
      <div class="flex flex-col gap-3 p-5 max-h-[400px] overflow-hidden min-h-0">
        <!-- Add or remove current tab from whitelist (when privacy mode on) -->
        <Button
          v-if="privacyMode && currentTabDomain && !currentTabIsWhitelisted"
          variant="outline"
          size="sm"
          class="w-full shrink-0"
          :title="t('addToWhitelistTitle', currentTabDomain)"
          @click="addCurrentTabToWhitelist"
        >
          <Plus class="size-3.5" />
          {{ t('addToWhitelistButton', currentTabDomain) }}
        </Button>
        <Button
          v-else-if="privacyMode && currentTabDomain && currentTabIsWhitelisted"
          variant="outline"
          size="sm"
          class="w-full shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
          :title="t('removeFromWhitelistTitle', currentTabDomain)"
          @click="removeFromWhitelist(currentTabDomain)"
        >
          <Trash2 class="size-3.5" />
          {{ t('removeFromWhitelistButton', currentTabDomain) }}
        </Button>
        <!-- Search -->
        <div class="relative shrink-0">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            v-model="permissionSearchQuery"
            type="text"
            :placeholder="t('searchDomainsPlaceholder')"
            class="pl-8 text-xs h-8"
          />
        </div>

        <div class="flex flex-col gap-3 overflow-y-auto min-h-0">
          <!-- Empty state: no permissions at all -->
          <div
            v-if="permissionDomains.length === 0"
            class="flex flex-col items-center justify-center py-10 text-center"
          >
            <ShieldCheck class="size-10 text-muted-foreground/50 mb-3" />
            <p class="text-sm font-medium text-muted-foreground">{{ t('noPermissionsYet') }}</p>
            <p class="text-xs text-muted-foreground/70 mt-1 max-w-[250px]">
              {{ t('noPermissionsHint') }}
            </p>
          </div>

          <!-- No search results -->
          <div
            v-else-if="filteredPermissionDomains.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <p class="text-sm font-medium text-muted-foreground">{{ t('noDomainsMatch') }}</p>
          </div>

          <!-- Domain list -->
          <Card v-for="host in filteredPermissionDomains" :key="host">
            <CardHeader class="pb-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2 min-w-0">
                  <Globe class="size-3.5 text-muted-foreground shrink-0" />
                  <span class="text-sm font-medium truncate">{{ host }}</span>
                </div>
                <Button
                  v-if="permissions[host] && Object.keys(permissions[host]).length > 0"
                  variant="ghost"
                  size="icon"
                  class="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  :title="t('revokeAllPermissionsTitle')"
                  @click="revokeDomain(host)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent class="pt-0">
              <!-- Whitelist-only: no permission entries yet -->
              <div v-if="isWhitelistOnly(host)" class="py-1.5 text-xs text-muted-foreground">
                {{ t('whitelistedNoPermissions') }}
              </div>
              <!-- Has permission entries -->
              <div v-else class="flex flex-col gap-1.5">
                <div
                  v-for="(entry, method) in permissions[host]"
                  :key="method"
                  class="flex items-center justify-between py-1"
                >
                  <span class="text-xs text-muted-foreground">
                    {{ getMethodLabel(method as string) }}
                  </span>
                  <div class="flex items-center gap-2">
                    <Badge
                      :variant="entry.decision === 'allow' ? 'success' : 'destructive'"
                      class="text-[10px] px-1.5 py-0"
                    >
                      {{ entry.decision === 'allow' ? t('allowed') : t('denied') }}
                    </Badge>
                    <button
                      class="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      :title="t('revokeTitle')"
                      @click="revokePermission(host, method as string)"
                    >
                      <Trash2 class="size-3" />
                    </button>
                  </div>
                </div>
              </div>
              <Button
                v-if="nostrWhitelist.includes(host.toLowerCase())"
                variant="outline"
                size="sm"
                class="mt-2 w-full text-xs border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive h-7"
                :title="t('removeFromWhitelist')"
                @click="removeFromWhitelist(host)"
              >
                <Trash2 class="size-3" />
                {{ t('removeFromWhitelist') }}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </template>

    <!-- QR code modal (signer pubkey) -->
    <div
      v-if="showQrModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="closeQrModal"
    >
      <div
        class="rounded-lg border border-border bg-card p-4 shadow-xl flex flex-col items-center gap-3"
      >
        <p class="text-xs font-medium text-muted-foreground">
          {{ t('qrScanToUse', pubkeyDisplayMode) }}
        </p>
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          :alt="t('qrCodeAlt')"
          class="rounded border border-border bg-white"
          width="220"
          height="220"
        />
        <Button size="sm" variant="outline" @click="closeQrModal"> {{ t('close') }} </Button>
      </div>
    </div>

    <!-- Nostrconnect connection modal (QR + copy, waiting for bunker) -->
    <div
      v-if="showNostrConnectModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="closeNostrConnectModal"
    >
      <div
        class="rounded-lg border border-border bg-card p-4 shadow-xl flex flex-col items-center gap-3 max-w-[280px]"
      >
        <p class="text-xs font-medium text-muted-foreground text-center">
          {{ t('nostrConnectModalHint') }}
        </p>
        <img
          v-if="nostrConnectQrDataUrl"
          :src="nostrConnectQrDataUrl"
          :alt="t('nostrConnectQrAlt')"
          class="rounded border border-border bg-white shrink-0"
          width="220"
          height="220"
        />
        <Button variant="outline" size="sm" class="w-full" @click="copyNostrConnectUri">
          <Copy class="size-3.5" />
          {{ t('copyUri') }}
        </Button>
        <p v-if="nostrConnectWaiting" class="text-xs text-muted-foreground text-center">
          {{ t('waitingForBunker') }}
        </p>
        <Button size="sm" variant="ghost" class="w-full" @click="closeNostrConnectModal">
          {{ t('cancel') }}
        </Button>
      </div>
    </div>
  </div>
</template>
