<script lang="ts" setup>
import { cn } from '@/lib/utils';
</script>

<template>
  <label
    :class="
      cn(
        'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        $attrs.class as string | undefined
      )
    "
  >
    <slot />
  </label>
</template>
