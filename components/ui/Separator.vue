<script lang="ts" setup>
import { cn } from '@/lib/utils';

defineProps<{
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}>();
</script>

<template>
  <div v-if="label" :class="cn('flex items-center gap-3', $attrs.class as string | undefined)">
    <div class="h-px flex-1 bg-border" />
    <span class="text-xs text-muted-foreground">{{ label }}</span>
    <div class="h-px flex-1 bg-border" />
  </div>
  <div
    v-else
    role="separator"
    :class="
      cn(
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
        'bg-border',
        $attrs.class as string | undefined
      )
    "
  />
</template>
