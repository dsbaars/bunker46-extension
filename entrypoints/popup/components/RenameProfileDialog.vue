<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Label from '@/components/ui/Label.vue';
import { Download, Loader2 } from 'lucide-vue-next';
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { t } from '@/lib/i18n';

defineProps<{
  open: boolean;
  renameProfileName: string;
  renameProfileFetching: boolean;
}>();

defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'update:rename-profile-name', value: string): void;
  (e: 'fetch-profile-metadata'): void;
  (e: 'save'): void;
}>();
</script>

<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-4 shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      >
        <DialogTitle class="text-sm font-semibold">
          {{ t('renameProfileTitle') }}
        </DialogTitle>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ t('renameProfileHint') }}
        </p>
        <div class="mt-4 flex flex-col gap-3">
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">{{ t('renameProfileNameLabel') }}</Label>
            <Input
              :model-value="renameProfileName"
              class="text-sm"
              :placeholder="t('renameProfileNamePlaceholder')"
              @update:model-value="$emit('update:rename-profile-name', String($event))"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            class="w-full"
            :disabled="renameProfileFetching"
            @click="$emit('fetch-profile-metadata')"
          >
            <Loader2 v-if="renameProfileFetching" class="size-3.5 animate-spin" />
            <Download v-else class="size-3.5" />
            {{ t('fetchProfileFromNostr') }}
          </Button>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <DialogClose as-child>
            <Button variant="outline" size="sm">{{ t('cancel') }}</Button>
          </DialogClose>
          <Button size="sm" @click="$emit('save')">
            {{ t('save') }}
          </Button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
