<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
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
import { t } from '@/lib/i18n';

defineProps<{
  open: boolean;
}>();

defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'confirm'): void;
}>();
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <AlertDialogPortal>
      <AlertDialogOverlay
        class="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <AlertDialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <AlertDialogTitle class="text-sm font-semibold">
          {{ t('removeProfileConfirmTitle') }}
        </AlertDialogTitle>
        <AlertDialogDescription class="mt-2 text-xs text-muted-foreground">
          {{ t('removeProfileConfirmDesc') }}
        </AlertDialogDescription>
        <div class="mt-4 flex justify-end gap-2">
          <AlertDialogCancel as-child>
            <Button variant="outline" size="sm"> {{ t('cancel') }} </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button variant="destructive" size="sm" @click="$emit('confirm')">
              {{ t('removeProfile') }}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
