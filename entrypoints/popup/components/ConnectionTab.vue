<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import CardTitle from '@/components/ui/CardTitle.vue';
import CardDescription from '@/components/ui/CardDescription.vue';
import CardContent from '@/components/ui/CardContent.vue';
import Input from '@/components/ui/Input.vue';
import Separator from '@/components/ui/Separator.vue';
import ProfileAvatar from '@/components/ui/ProfileAvatar.vue';
import RelayProbeLeadingIcons from './RelayProbeLeadingIcons.vue';
import {
  Link2,
  Loader2,
  ExternalLink,
  Trash2,
  QrCode,
  Copy,
  UserPlus,
  X,
  Unplug,
  XCircle,
} from 'lucide-vue-next';
import { t } from '@/lib/i18n';
import type { RelayUiProbeStatus } from '@/lib/relay-ui-probe';
import type { ProfileSummary } from '../types';

defineProps<{
  connectionStateLoaded: boolean;
  reconnectingRelaysList: string[];
  relayStatuses: Record<string, RelayUiProbeStatus>;
  addingNewProfile: boolean;
  useBunker46: boolean;
  connecting: boolean;
  bunkerUriInput: string;
  connectingRelays: string[];
  reconnectionFailed: boolean;
  connected: boolean;
  multiProfileEnabled: boolean;
  activeProfileSummary?: ProfileSummary;
  activeProfileName?: string;
  activeProfilePicture?: string;
  signerPubkey: string;
  pubkeyDisplayValue: string;
  pubkeyDisplayShort: string;
  pubkeyDisplayMode: 'npub' | 'hex' | 'nprofile';
}>();

defineEmits<{
  (e: 'update:bunker-uri-input', value: string): void;
  (e: 'connect-bunker-uri'): void;
  (e: 'start-nostr-connect'): void;
  (e: 'open-bunker46'): void;
  (e: 'cancel-add-profile'): void;
  (e: 'request-remove-profile'): void;
  (e: 'request-logout'): void;
  (e: 'start-add-profile'): void;
  (e: 'cycle-pubkey-format'): void;
  (e: 'copy-pubkey'): void;
  (e: 'open-qr-modal'): void;
}>();
</script>

<template>
  <div data-testid="connection-tab-root">
    <div
      v-if="!connectionStateLoaded"
      class="flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground"
    >
      <Loader2 class="size-5 animate-spin" />
      <span class="text-xs">{{ t('loading') }}</span>
      <div v-if="reconnectingRelaysList.length" class="flex flex-col items-center gap-1 mt-1">
        <span class="text-xs text-muted-foreground/60">{{ t('connectingToRelays') }}</span>
        <div v-for="relay in reconnectingRelaysList" :key="relay" class="flex items-center gap-1.5">
          <RelayProbeLeadingIcons :status="relayStatuses[relay]" />
          <span class="text-xs font-mono text-muted-foreground/50 truncate max-w-[200px]">
            {{ relay.replace(/^wss?:\/\//, '').replace(/\/$/, '') }}
          </span>
        </div>
      </div>
    </div>

    <div v-else-if="addingNewProfile" class="flex flex-col gap-4 p-5">
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium">{{ t('addAnotherConnection') }}</p>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:text-foreground"
          @click="$emit('cancel-add-profile')"
        >
          <X class="size-4" />
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div class="flex items-center gap-2">
            <Link2 class="size-4 text-primary" />
            <CardTitle>{{ t('connectViaBunkerUri') }}</CardTitle>
          </div>
          <CardDescription>{{ t('connectViaBunkerUriDesc') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col gap-3">
            <Input
              :model-value="bunkerUriInput"
              :placeholder="t('placeholderBunkerUri')"
              :disabled="connecting"
              class="font-mono text-xs"
              @update:model-value="$emit('update:bunker-uri-input', String($event))"
              @keydown.enter="$emit('connect-bunker-uri')"
            />
            <Button
              class="w-full"
              :disabled="connecting || !bunkerUriInput.trim()"
              @click="$emit('connect-bunker-uri')"
            >
              <Loader2 v-if="connecting" class="size-4 animate-spin" />
              <Link2 v-else class="size-4" />
              {{ connecting ? t('connecting') : t('connect') }}
            </Button>

            <div
              v-if="connecting && connectingRelays.length"
              class="flex flex-col items-center gap-1"
            >
              <span class="text-xs text-muted-foreground/60">{{ t('connectingToRelays') }}</span>
              <div v-for="relay in connectingRelays" :key="relay" class="flex items-center gap-1.5">
                <RelayProbeLeadingIcons :status="relayStatuses[relay]" />
                <span class="text-xs font-mono text-muted-foreground/50 truncate max-w-[220px]">
                  {{ relay.replace(/^wss?:\/\//, '').replace(/\/$/, '') }}
                </span>
              </div>
            </div>

            <template v-if="useBunker46">
              <Separator :label="t('separatorOr')" />
              <Button variant="outline" class="w-full" @click="$emit('open-bunker46')">
                <ExternalLink class="size-4" />
                {{ t('getUriFromBunker46') }}
              </Button>
            </template>

            <Separator :label="t('separatorOr')" />
            <div class="flex flex-col gap-3">
              <p class="text-xs text-muted-foreground">{{ t('nostrConnectDesc') }}</p>
              <Button variant="outline" class="w-full" @click="$emit('start-nostr-connect')">
                <QrCode class="size-4" />
                {{ t('showQrConnectionUri') }}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <div v-else-if="reconnectionFailed" class="flex flex-col gap-4 p-5">
      <Card class="border-destructive/50">
        <CardContent class="pt-5">
          <div class="flex flex-col gap-4">
            <div class="flex items-start gap-3">
              <div class="size-10 shrink-0 flex items-center justify-center">
                <ProfileAvatar
                  :signer-pubkey="activeProfileSummary?.signerPubkey"
                  :picture="activeProfilePicture ?? activeProfileSummary?.picture"
                  :name="activeProfileName ?? activeProfileSummary?.name"
                  size="lg"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">
                  {{ activeProfileName || activeProfileSummary?.name || t('signerKey') }}
                </p>
                <p class="text-xs text-destructive mt-0.5">
                  {{ t('reconnectionFailedMessage') }}
                </p>
                <div v-if="reconnectingRelaysList.length" class="mt-1.5 flex flex-col gap-1">
                  <div
                    v-for="relay in reconnectingRelaysList"
                    :key="relay"
                    class="flex items-center gap-1.5"
                    :title="relay"
                  >
                    <XCircle class="size-3 shrink-0 text-destructive/70" />
                    <span class="text-xs font-mono text-muted-foreground/60 truncate">
                      {{ relay.replace(/^wss?:\/\//, '').replace(/\/$/, '') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Button variant="destructive" class="w-full" @click="$emit('request-remove-profile')">
              <Trash2 class="size-4" />
              {{ t('removeProfile') }}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <div v-else-if="connected" class="flex flex-col gap-4 p-5">
      <Card>
        <CardContent class="pt-5">
          <div class="flex flex-col gap-4">
            <div class="flex items-start gap-3">
              <div class="size-10 shrink-0 flex items-center justify-center">
                <ProfileAvatar
                  :signer-pubkey="signerPubkey"
                  :picture="activeProfilePicture ?? activeProfileSummary?.picture"
                  :name="activeProfileName ?? activeProfileSummary?.name"
                  size="lg"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">
                  {{ activeProfileName || activeProfileSummary?.name || t('signerKey') }}
                </p>
                <div class="flex items-center gap-2">
                  <button
                    class="text-xs text-muted-foreground font-mono truncate block max-w-full hover:text-foreground transition-colors cursor-pointer text-left flex-1 min-w-0"
                    :title="pubkeyDisplayValue"
                    @click="$emit('cycle-pubkey-format')"
                  >
                    {{ pubkeyDisplayShort }}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    :title="t('copyTitle')"
                    @click="$emit('copy-pubkey')"
                  >
                    <Copy class="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                    :title="t('showQrTitle')"
                    @click="$emit('open-qr-modal')"
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

      <Button
        v-if="!multiProfileEnabled"
        variant="outline"
        class="w-full"
        @click="$emit('request-logout')"
      >
        <Unplug class="size-4" />
        {{ t('disconnect') }}
      </Button>
      <Button
        v-else
        variant="outline"
        class="w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
        @click="$emit('request-remove-profile')"
      >
        <Trash2 class="size-4" />
        {{ t('disconnectAndRemoveProfile') }}
      </Button>

      <Button
        v-if="multiProfileEnabled"
        variant="outline"
        class="w-full"
        @click="$emit('start-add-profile')"
      >
        <UserPlus class="size-4" />
        {{ t('addAnotherConnection') }}
      </Button>
    </div>

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
              :model-value="bunkerUriInput"
              :placeholder="t('placeholderBunkerUri')"
              :disabled="connecting"
              class="font-mono text-xs"
              @update:model-value="$emit('update:bunker-uri-input', String($event))"
              @keydown.enter="$emit('connect-bunker-uri')"
            />
            <Button
              class="w-full"
              :disabled="connecting || !bunkerUriInput.trim()"
              @click="$emit('connect-bunker-uri')"
            >
              <Loader2 v-if="connecting" class="size-4 animate-spin" />
              <Link2 v-else class="size-4" />
              {{ connecting ? t('connecting') : t('connect') }}
            </Button>

            <div
              v-if="connecting && connectingRelays.length"
              class="flex flex-col items-center gap-1"
            >
              <span class="text-xs text-muted-foreground/60">{{ t('connectingToRelays') }}</span>
              <div v-for="relay in connectingRelays" :key="relay" class="flex items-center gap-1.5">
                <RelayProbeLeadingIcons :status="relayStatuses[relay]" />
                <span class="text-xs font-mono text-muted-foreground/50 truncate max-w-[220px]">
                  {{ relay.replace(/^wss?:\/\//, '').replace(/\/$/, '') }}
                </span>
              </div>
            </div>

            <template v-if="useBunker46">
              <Separator :label="t('separatorOr')" />
              <Button variant="outline" class="w-full" @click="$emit('open-bunker46')">
                <ExternalLink class="size-4" />
                {{ t('getUriFromBunker46') }}
              </Button>
            </template>

            <Separator :label="t('separatorOr')" />

            <div class="flex flex-col gap-3">
              <p class="text-xs text-muted-foreground">
                {{ t('nostrConnectDesc') }}
              </p>
              <Button variant="outline" class="w-full" @click="$emit('start-nostr-connect')">
                <QrCode class="size-4" />
                {{ t('showQrConnectionUri') }}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
