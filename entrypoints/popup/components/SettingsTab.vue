<script setup lang="ts">
import ChoiceCard from '@/components/ui/ChoiceCard.vue';
import Label from '@/components/ui/Label.vue';
import Input from '@/components/ui/Input.vue';
import Button from '@/components/ui/Button.vue';
import { t } from '@/lib/i18n';

defineProps<{
  multiProfileEnabled: boolean;
  canDisableMultiProfile: boolean;
  privacyMode: boolean;
  showNostrBadge: boolean;
  useBunker46: boolean;
  baseUrl: string;
  specifyNostrConnectRelays: boolean;
  nostrConnectRelaysInput: string;
}>();

defineEmits<{
  (e: 'update:multi-profile-enabled', value: boolean): void;
  (e: 'update:privacy-mode', value: boolean): void;
  (e: 'update:show-nostr-badge', value: boolean): void;
  (e: 'update:use-bunker46', value: boolean): void;
  (e: 'update:base-url', value: string): void;
  (e: 'update:specify-nostr-connect-relays', value: boolean): void;
  (e: 'update:nostr-connect-relays-input', value: string): void;
  (e: 'set-multi-profile-enabled'): void;
  (e: 'set-privacy-mode-enabled'): void;
  (e: 'set-show-nostr-badge-enabled'): void;
  (e: 'set-use-bunker46-enabled'): void;
  (e: 'save-base-url'): void;
  (e: 'set-specify-nostr-connect-relays-enabled'): void;
  (e: 'save-nostr-connect-relays'): void;
}>();
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4 overflow-x-hidden p-5">
    <ChoiceCard
      :model-value="multiProfileEnabled"
      :label="t('settingsMultiProfile')"
      :description="t('settingsMultiProfileHint')"
      :disabled="!canDisableMultiProfile"
      :hide-slot-content="canDisableMultiProfile"
      @update:model-value="
        $emit('update:multi-profile-enabled', !!$event);
        $emit('set-multi-profile-enabled');
      "
    >
      <p v-if="!canDisableMultiProfile" class="text-xs text-muted-foreground">
        {{ t('settingsMultiProfileDisabledHint') }}
      </p>
    </ChoiceCard>

    <ChoiceCard
      :model-value="privacyMode"
      :label="t('privacyMode')"
      :description="t('privacyModeHint') + ' ' + t('privacyModeSitesHint')"
      hide-slot-content
      @update:model-value="
        $emit('update:privacy-mode', !!$event);
        $emit('set-privacy-mode-enabled');
      "
    />

    <ChoiceCard
      :model-value="showNostrBadge"
      :label="t('showBadge')"
      :description="t('showBadgeHint')"
      hide-slot-content
      @update:model-value="
        $emit('update:show-nostr-badge', !!$event);
        $emit('set-show-nostr-badge-enabled');
      "
    />

    <ChoiceCard
      :model-value="useBunker46"
      :label="t('settingsUseBunker46')"
      :description="t('settingsUseBunker46Hint')"
      @update:model-value="
        $emit('update:use-bunker46', !!$event);
        $emit('set-use-bunker46-enabled');
      "
    >
      <div class="flex flex-col gap-2" data-testid="settings-bunker46-url-section">
        <Label class="text-xs">{{ t('settingsBunkerUrl') }}</Label>
        <Input
          :model-value="baseUrl"
          :placeholder="t('settingsBunkerUrlPlaceholder')"
          class="text-xs"
          data-testid="settings-bunker46-url-input"
          @update:model-value="$emit('update:base-url', String($event))"
          @click.stop
        />
        <p class="text-xs text-muted-foreground">{{ t('settingsBunkerUrlHint') }}</p>
        <Button size="sm" class="w-fit" @click.stop="$emit('save-base-url')">
          {{ t('save') }}
        </Button>
      </div>
    </ChoiceCard>

    <ChoiceCard
      :model-value="specifyNostrConnectRelays"
      data-testid="settings-nostrconnect-card"
      :label="t('settingsSpecifyNostrConnectRelays')"
      :description="t('settingsSpecifyNostrConnectRelaysHint')"
      @update:model-value="
        $emit('update:specify-nostr-connect-relays', !!$event);
        $emit('set-specify-nostr-connect-relays-enabled');
      "
    >
      <div class="flex flex-col gap-2" data-testid="settings-nostrconnect-relays-section">
        <Label class="text-xs">{{ t('settingsNostrConnectRelays') }}</Label>
        <textarea
          :value="nostrConnectRelaysInput"
          :placeholder="t('settingsNostrConnectRelaysPlaceholder')"
          rows="3"
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          @input="
            $emit('update:nostr-connect-relays-input', ($event.target as HTMLTextAreaElement).value)
          "
          @click.stop
        />
        <p class="text-xs text-muted-foreground">
          {{ t('settingsNostrConnectRelaysHint') }}
        </p>
        <Button size="sm" class="w-fit" @click.stop="$emit('save-nostr-connect-relays')">
          {{ t('save') }}
        </Button>
      </div>
    </ChoiceCard>
  </div>
</template>
