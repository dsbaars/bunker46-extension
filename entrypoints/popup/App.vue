<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
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
import { Toaster, toast } from 'vue-sonner';
import 'vue-sonner/style.css';
import { nip19 } from 'nostr-tools';
import QRCode from 'qrcode';
import {
  Link2,
  Unplug,
  Settings2,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  KeyRound,
  ShieldCheck,
  Trash2,
  Globe,
  QrCode,
  Copy,
  Search,
} from 'lucide-vue-next';

type PermissionEntry = {
  decision: 'allow' | 'deny';
  created_at: number;
};

type DomainPolicies = {
  [host: string]: {
    [method: string]: PermissionEntry;
  };
};

const activeTab = ref<'connection' | 'permissions'>('connection');
const connected = ref(false);
const signerPubkey = ref('');
const signerRelays = ref<string[]>([]);
const baseUrl = ref('http://localhost:5173');
type PubkeyFormat = 'npub' | 'hex' | 'nprofile';
const pubkeyDisplayMode = ref<PubkeyFormat>('npub');
const showQrModal = ref(false);
const qrDataUrl = ref('');
const bunkerUriInput = ref('');
const showSettings = ref(false);
const connecting = ref(false);
const errorMessage = ref('');
const permissions = ref<DomainPolicies>({});

const METHOD_LABELS: Record<string, string> = {
  getPublicKey: 'Get Public Key',
  signEvent: 'Sign Event',
  getRelays: 'Get Relays',
  nip04_encrypt: 'NIP-04 Encrypt',
  nip04_decrypt: 'NIP-04 Decrypt',
  nip44_encrypt: 'NIP-44 Encrypt',
  nip44_decrypt: 'NIP-44 Decrypt',
};

const permissionDomains = computed(() => Object.keys(permissions.value).sort());
const permissionSearchQuery = ref('');
const filteredPermissionDomains = computed(() => {
  const q = permissionSearchQuery.value.trim().toLowerCase();
  if (!q) return permissionDomains.value;
  return permissionDomains.value.filter((host) => host.toLowerCase().includes(q));
});
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
    const stored = await chrome.storage.local.get('bunker46BaseUrl');
    if (stored.bunker46BaseUrl) baseUrl.value = stored.bunker46BaseUrl as string;
  } catch {
    /* background may not be ready */
  }
}

async function loadPermissions() {
  try {
    const res: { permissions?: DomainPolicies } = await chrome.runtime.sendMessage({
      type: 'GET_PERMISSIONS',
    });
    if (res?.permissions) permissions.value = res.permissions;
  } catch {
    /* ignore */
  }
}

async function connectWithBunkerUri() {
  const uri = bunkerUriInput.value.trim();
  if (!uri) {
    errorMessage.value = 'Paste a bunker:// URI above';
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
      errorMessage.value = res?.error || 'Connection failed';
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Connection failed';
  } finally {
    connecting.value = false;
  }
}

async function disconnect() {
  try {
    await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
    connected.value = false;
    signerPubkey.value = '';
    signerRelays.value = [];
    errorMessage.value = '';
  } catch {
    errorMessage.value = 'Disconnect failed';
  }
}

async function saveBaseUrl() {
  await chrome.storage.local.set({ bunker46BaseUrl: baseUrl.value });
  showSettings.value = false;
  toast.success('Settings saved');
}

async function copyPubkey() {
  const value = pubkeyDisplayValue.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success('Copied to clipboard');
  } catch {
    toast.error('Failed to copy');
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
    toast.success('Permission removed');
  } catch {
    toast.error('Failed to remove permission');
  }
}

async function revokeDomain(host: string) {
  try {
    await chrome.runtime.sendMessage({ type: 'REMOVE_DOMAIN_PERMISSIONS', host });
    delete permissions.value[host];
    toast.success('Domain permissions removed');
  } catch {
    toast.error('Failed to remove domain');
  }
}

function switchTab(tab: 'connection' | 'permissions') {
  activeTab.value = tab;
  if (tab === 'permissions') loadPermissions();
}

onMounted(() => {
  loadState();
  loadPermissions();
});
</script>

<template>
  <div class="flex flex-col bg-background text-foreground">
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
          <h1 class="text-sm font-semibold leading-tight">Bunker46</h1>
          <p class="text-xs text-muted-foreground leading-tight">NIP-07 Remote Signer</p>
        </div>
      </div>
      <Badge :variant="connected ? 'success' : 'secondary'">
        <span
          :class="['size-1.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground']"
        />
        {{ connected ? 'Connected' : 'Offline' }}
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
        Connection
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
        Permissions
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
      <!-- Connected state -->
      <div v-if="connected" class="flex flex-col gap-4 p-5">
        <Card>
          <CardContent class="pt-5">
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-3">
                <div class="flex items-center justify-center size-10 rounded-full bg-success/15">
                  <KeyRound class="size-5 text-success" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium">Signer Key</p>
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
                      title="Copy"
                      @click="copyPubkey"
                    >
                      <Copy class="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                      title="Show QR code"
                      @click="openQrModal"
                    >
                      <QrCode class="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              <p class="text-xs text-muted-foreground leading-relaxed">
                All NIP-07 requests from web pages are forwarded to this remote signer via NIP-46.
                No private keys are stored in the extension.
              </p>
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" class="w-full" @click="disconnect">
          <Unplug class="size-4" />
          Disconnect
        </Button>
      </div>

      <!-- Disconnected state -->
      <div v-else class="flex flex-col gap-4 p-5">
        <Card>
          <CardHeader>
            <div class="flex items-center gap-2">
              <Link2 class="size-4 text-primary" />
              <CardTitle>Connect via Bunker URI</CardTitle>
            </div>
            <CardDescription>
              Paste a bunker:// URI from your remote signer to connect
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex flex-col gap-3">
              <Input
                v-model="bunkerUriInput"
                placeholder="bunker://..."
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
                {{ connecting ? 'Connecting...' : 'Connect' }}
              </Button>

              <Separator label="or" />

              <Button variant="outline" class="w-full" @click="openBunker46">
                <ExternalLink class="size-4" />
                Get URI from Bunker46
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Footer / Settings -->
      <div class="mt-auto border-t border-border">
        <button
          class="flex w-full items-center justify-between px-5 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          @click="showSettings = !showSettings"
        >
          <span class="flex items-center gap-2">
            <Settings2 class="size-3.5" />
            Settings
          </span>
          <ChevronUp v-if="showSettings" class="size-3.5" />
          <ChevronDown v-else class="size-3.5" />
        </button>
        <div v-if="showSettings" class="border-t border-border px-5 py-4 flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <Label>Bunker46 URL</Label>
            <Input v-model="baseUrl" placeholder="http://localhost:5173" class="text-xs" />
            <p class="text-xs text-muted-foreground">Base URL of your Bunker46 instance</p>
          </div>
          <Button size="sm" @click="saveBaseUrl"> Save </Button>
        </div>
      </div>
    </template>

    <!-- PERMISSIONS TAB -->
    <template v-if="activeTab === 'permissions'">
      <div class="flex flex-col gap-3 p-5 max-h-[400px] overflow-hidden min-h-0">
        <!-- Search -->
        <div class="relative shrink-0">
          <Search
            class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            v-model="permissionSearchQuery"
            type="text"
            placeholder="Search domains..."
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
            <p class="text-sm font-medium text-muted-foreground">No permissions yet</p>
            <p class="text-xs text-muted-foreground/70 mt-1 max-w-[250px]">
              When websites request access to your Nostr identity, you'll see them here.
            </p>
          </div>

          <!-- No search results -->
          <div
            v-else-if="filteredPermissionDomains.length === 0"
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <p class="text-sm font-medium text-muted-foreground">No domains match your search</p>
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
                  variant="ghost"
                  size="icon"
                  class="size-7 text-muted-foreground hover:text-destructive"
                  title="Revoke all permissions for this domain"
                  @click="revokeDomain(host)"
                >
                  <Trash2 class="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent class="pt-0">
              <div class="flex flex-col gap-1.5">
                <div
                  v-for="(entry, method) in permissions[host]"
                  :key="method"
                  class="flex items-center justify-between py-1"
                >
                  <span class="text-xs text-muted-foreground">
                    {{ METHOD_LABELS[method as string] ?? method }}
                  </span>
                  <div class="flex items-center gap-2">
                    <Badge
                      :variant="entry.decision === 'allow' ? 'success' : 'destructive'"
                      class="text-[10px] px-1.5 py-0"
                    >
                      {{ entry.decision === 'allow' ? 'Allowed' : 'Denied' }}
                    </Badge>
                    <button
                      class="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Revoke"
                      @click="revokePermission(host, method as string)"
                    >
                      <Trash2 class="size-3" />
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </template>

    <!-- QR code modal -->
    <div
      v-if="showQrModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="closeQrModal"
    >
      <div
        class="rounded-lg border border-border bg-card p-4 shadow-xl flex flex-col items-center gap-3"
      >
        <p class="text-xs font-medium text-muted-foreground">
          {{ pubkeyDisplayMode }} (scan to use)
        </p>
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="QR code"
          class="rounded border border-border bg-white"
          width="220"
          height="220"
        />
        <Button size="sm" variant="outline" @click="closeQrModal"> Close </Button>
      </div>
    </div>
  </div>
</template>
