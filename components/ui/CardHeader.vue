<script lang="ts" setup>
import { cn } from '@/lib/utils';
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5 p-5 pb-0', $attrs.class as string | undefined)">
    <slot />
  </div>
</template>
