<script lang="ts" setup>
import { useId } from 'reka-ui';
import Switch from '@/components/ui/Switch.vue';
import { cn } from '@/lib/utils';

defineProps<{
  modelValue: boolean;
  label?: string;
  description?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const switchId = useId();
</script>

<template>
  <div
    :class="
      cn(
        'min-w-0 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background'
      )
    "
  >
    <label
      :for="switchId"
      class="flex cursor-pointer flex-row items-start justify-between gap-3 text-left hover:opacity-90"
    >
      <div class="min-w-0 flex-1">
        <span v-if="label" class="text-sm font-medium leading-none">{{ label }}</span>
        <p
          v-if="description"
          class="mt-1.5 text-xs text-muted-foreground break-words"
        >
          {{ description }}
        </p>
      </div>
      <Switch
        :id="switchId"
        :model-value="modelValue"
        class="shrink-0"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </label>
    <div v-if="modelValue && $slots.default" class="mt-3 border-t border-border pt-3">
      <slot />
    </div>
  </div>
</template>
