<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import { Copy } from 'lucide-vue-next';
import { t } from '@/lib/i18n';

defineProps<{
  show: boolean;
  nostrConnectQrDataUrl: string;
  nostrConnectWaiting: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'copy-uri'): void;
}>();
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    @click.self="$emit('close')"
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
      <Button variant="outline" size="sm" class="w-full" @click="$emit('copy-uri')">
        <Copy class="size-3.5" />
        {{ t('copyUri') }}
      </Button>
      <p v-if="nostrConnectWaiting" class="text-xs text-muted-foreground text-center">
        {{ t('waitingForBunker') }}
      </p>
      <Button size="sm" variant="ghost" class="w-full" @click="$emit('close')">
        {{ t('cancel') }}
      </Button>
    </div>
  </div>
</template>
