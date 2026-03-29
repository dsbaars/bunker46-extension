<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import ProfileAvatar from '@/components/ui/ProfileAvatar.vue';
import { ChevronDown, Pencil, UserPlus } from 'lucide-vue-next';
import { t } from '@/lib/i18n';
import type { ProfileSummary } from '../types';

defineProps<{
  multiProfileEnabled: boolean;
  allProfiles: ProfileSummary[];
  showProfileSwitcher: boolean;
  activeProfileSummary?: ProfileSummary;
  activeProfileIdRef: string | null;
  reconnecting: boolean;
  connected: boolean;
  activeProfileName?: string;
  profileDisplayName: (profile: ProfileSummary) => string;
}>();

defineEmits<{
  (e: 'toggle-open'): void;
  (e: 'close'): void;
  (e: 'switch-profile', profileId: string): void;
  (e: 'rename-profile', profile: ProfileSummary): void;
  (e: 'add-profile'): void;
}>();
</script>

<template>
  <div v-if="multiProfileEnabled && allProfiles.length > 0" class="relative border-b border-border">
    <div v-if="showProfileSwitcher" class="fixed inset-0 z-30" @click="$emit('close')" />

    <button
      class="flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-muted/50 cursor-pointer"
      :title="t('switchProfile')"
      @click="$emit('toggle-open')"
    >
      <ProfileAvatar
        :signer-pubkey="activeProfileSummary?.signerPubkey"
        :picture="activeProfileSummary?.picture"
        :name="activeProfileSummary?.name"
        size="sm"
      />
      <span class="flex-1 min-w-0 text-sm font-medium truncate">
        {{
          activeProfileSummary
            ? profileDisplayName(activeProfileSummary)
            : reconnecting
              ? t('connecting')
              : connected
                ? (activeProfileName ?? t('loading'))
                : t('offline')
        }}
      </span>
      <ChevronDown
        class="size-4 text-muted-foreground shrink-0 transition-transform"
        :class="{ 'rotate-180': showProfileSwitcher }"
      />
    </button>

    <div
      v-if="showProfileSwitcher"
      class="absolute left-0 right-0 top-full z-40 rounded-b-lg border border-t-0 border-border bg-card shadow-lg"
    >
      <div
        v-for="profile in allProfiles"
        :key="profile.id"
        class="flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-muted/50 first:rounded-none last:rounded-b-none"
        :class="{ 'bg-muted/30': profile.id === activeProfileIdRef }"
      >
        <button
          class="flex flex-1 min-w-0 items-center gap-2.5 cursor-pointer text-left"
          @click="$emit('switch-profile', profile.id)"
        >
          <ProfileAvatar
            :signer-pubkey="profile.signerPubkey"
            :picture="profile.picture"
            :name="profile.name"
            size="sm"
          />
          <span class="flex-1 min-w-0 text-sm truncate">{{ profileDisplayName(profile) }}</span>
          <span
            v-if="profile.id === activeProfileIdRef"
            class="size-1.5 rounded-full bg-success shrink-0"
          />
        </button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          :title="t('renameProfile')"
          @click.stop="$emit('rename-profile', profile)"
        >
          <Pencil class="size-3.5" />
        </Button>
      </div>

      <div class="border-t border-border">
        <button
          class="flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-muted/50 cursor-pointer rounded-b-lg text-sm text-muted-foreground"
          @click="$emit('add-profile')"
        >
          <UserPlus class="size-4 shrink-0" />
          {{ t('addAnotherConnection') }}
        </button>
      </div>
    </div>
  </div>
</template>
