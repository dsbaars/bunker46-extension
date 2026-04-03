<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';
import Tooltip from '@/components/ui/Tooltip.vue';
import { Maximize2 } from 'lucide-vue-next';
import { t } from '@/lib/i18n';
import type { RelayUiProbeStatus } from '@/lib/relay-ui-probe';
import RelayProbeLeadingIcons from './RelayProbeLeadingIcons.vue';

defineProps<{
  extensionIconUrl: string;
  showOpenFullPageButton: boolean;
  connected: boolean;
  reconnecting: boolean;
  signerRelays: string[];
  relayStatuses: Record<string, RelayUiProbeStatus>;
}>();

defineEmits<{
  (e: 'open-full-page'): void;
}>();
</script>

<template>
  <header class="flex items-center justify-between px-5 py-4">
    <div class="flex items-center gap-2.5">
      <img :src="extensionIconUrl" alt="" class="size-8 rounded-lg object-contain" />
      <div>
        <h1 class="text-sm font-semibold leading-tight">{{ t('extName') }}</h1>
        <p class="text-xs text-muted-foreground leading-tight">{{ t('appSubtitle') }}</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button
        v-if="showOpenFullPageButton"
        variant="ghost"
        size="icon"
        class="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        :title="t('openFullPage')"
        @click="$emit('open-full-page')"
      >
        <Maximize2 class="size-4" />
      </Button>
      <Tooltip :disabled="!connected" side="bottom" :side-offset="8">
        <Badge
          :variant="reconnecting ? 'secondary' : connected ? 'success' : 'secondary'"
          class="cursor-default select-none"
        >
          <span
            :class="[
              'size-1.5 rounded-full',
              reconnecting
                ? 'bg-amber-500 animate-pulse'
                : connected
                  ? 'bg-success'
                  : 'bg-muted-foreground',
            ]"
          />
          {{ reconnecting ? t('connecting') : connected ? t('connected') : t('offline') }}
        </Badge>
        <template #content>
          <p class="mb-1.5 font-medium text-muted-foreground">{{ t('connectedViaRelays') }}</p>
          <div class="flex flex-col gap-0.5">
            <p
              v-for="relay in signerRelays"
              :key="relay"
              class="flex items-center gap-1.5 font-mono text-foreground"
            >
              <RelayProbeLeadingIcons :status="relayStatuses[relay]" />
              <span>{{ relay.replace(/^wss?:\/\//, '').replace(/\/$/, '') }}</span>
            </p>
          </div>
        </template>
      </Tooltip>
    </div>
  </header>
</template>
