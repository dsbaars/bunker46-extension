<script lang="ts" setup>
import { cn } from '@/lib/utils';
</script>

<template>
  <div :class="cn('flex items-center p-5 pt-0', $attrs.class as string | undefined)">
    <slot />
  </div>
</template>
