<script lang="ts" setup>
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
} from 'reka-ui';

withDefaults(
  defineProps<{
    disabled?: boolean;
    delayDuration?: number;
    side?: 'top' | 'right' | 'bottom' | 'left';
    sideOffset?: number;
  }>(),
  {
    disabled: false,
    delayDuration: 300,
    side: 'bottom',
    sideOffset: 6,
  }
);
</script>

<template>
  <TooltipProvider :delay-duration="delayDuration">
    <TooltipRoot :disabled="disabled">
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="side"
          :side-offset="sideOffset"
          class="z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
          style="
            transition:
              opacity 120ms ease,
              transform 120ms ease;
          "
        >
          <slot name="content" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>
