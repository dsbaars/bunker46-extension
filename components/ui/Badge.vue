<script lang="ts" setup>
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-transparent bg-secondary text-muted-foreground',
        outline: 'text-foreground border-border',
        success: 'border-transparent bg-success/15 text-success',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type BadgeVariants = VariantProps<typeof badgeVariants>;

defineProps<{
  variant?: BadgeVariants['variant'];
}>();
</script>

<template>
  <span :class="cn(badgeVariants({ variant }), $attrs.class as string | undefined)">
    <slot />
  </span>
</template>
