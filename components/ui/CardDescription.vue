<script lang="ts" setup>
import { cn } from '@/lib/utils';
</script>

<template>
  <p :class="cn('text-sm text-muted-foreground', $attrs.class as string | undefined)">
    <slot />
  </p>
</template>
