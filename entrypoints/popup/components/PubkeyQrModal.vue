<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import { t } from '@/lib/i18n';

defineProps<{
  show: boolean;
  qrDataUrl: string;
  pubkeyDisplayMode: 'npub' | 'hex' | 'nprofile';
}>();

defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    @click.self="$emit('close')"
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
      <Button size="sm" variant="outline" @click="$emit('close')"> {{ t('close') }} </Button>
    </div>
  </div>
</template>
