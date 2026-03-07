<script lang="ts" setup>
import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    signerPubkey?: string;
    picture?: string;
    name?: string;
    size?: 'sm' | 'md' | 'lg';
  }>(),
  {
    size: 'md',
    signerPubkey: undefined,
    picture: undefined,
    name: undefined,
  }
);

const imgFailed = ref(false);

function avatarColor(pubkey?: string): string {
  if (!pubkey || pubkey.length < 6) return '#7c3aed';
  return '#' + pubkey.slice(0, 6);
}

const sizeClasses = {
  sm: 'size-5',
  md: 'size-7',
  lg: 'size-9',
};
</script>

<template>
  <div
    :class="[
      'rounded-full overflow-hidden shrink-0 flex items-center justify-center',
      sizeClasses[props.size],
    ]"
  >
    <img
      v-if="picture && !imgFailed"
      :src="picture"
      :alt="name || 'Profile avatar'"
      class="w-full h-full object-cover"
      @error="imgFailed = true"
    />
    <div v-else class="w-full h-full" :style="{ backgroundColor: avatarColor(signerPubkey) }" />
  </div>
</template>
