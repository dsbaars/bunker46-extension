<script setup lang="ts">
import { Loader2, CheckCircle2, XCircle, Lock } from 'lucide-vue-next';
import { t } from '@/lib/i18n';
import type { RelayUiProbeStatus } from '@/lib/relay-ui-probe';

defineProps<{
  status: RelayUiProbeStatus | undefined;
}>();
</script>

<template>
  <span class="inline-flex shrink-0 items-center gap-0.5">
    <template v-if="!status || status === 'connecting'">
      <Loader2 class="size-3 animate-spin text-muted-foreground/50" />
    </template>
    <template v-else-if="status === 'nip42_pending'">
      <Loader2 class="size-3 animate-spin text-amber-500/90" />
      <Lock
        class="size-3 text-amber-500"
        :title="t('relayNip42AuthPendingTitle')"
        :aria-label="t('relayNip42AuthPendingTitle')"
      />
    </template>
    <template v-else-if="status === 'ok'">
      <CheckCircle2 class="size-3 text-green-500" />
    </template>
    <template v-else-if="status === 'failed'">
      <XCircle class="size-3 text-destructive" />
    </template>
    <template v-else-if="status === 'nip42_ok'">
      <CheckCircle2 class="size-3 text-green-500" />
      <Lock
        class="size-3 text-green-600"
        :title="t('relayNip42AuthSuccessTitle')"
        :aria-label="t('relayNip42AuthSuccessTitle')"
      />
    </template>
    <template v-else-if="status === 'nip42_failed'">
      <XCircle class="size-3 text-destructive" />
      <Lock
        class="size-3 text-destructive"
        :title="t('relayNip42AuthFailedTitle')"
        :aria-label="t('relayNip42AuthFailedTitle')"
      />
    </template>
    <template v-else-if="status === 'nip42_challenge_only'">
      <CheckCircle2 class="size-3 text-green-500" />
      <Lock
        class="size-3 text-amber-500"
        :title="t('relayNip42ChallengeOnlyTitle')"
        :aria-label="t('relayNip42ChallengeOnlyTitle')"
      />
    </template>
  </span>
</template>
