<script lang="ts" setup>
import { cn } from '@/lib/utils';
</script>

<template>
  <div :class="cn('p-5', $attrs.class as string | undefined)">
    <slot />
  </div>
</template>
