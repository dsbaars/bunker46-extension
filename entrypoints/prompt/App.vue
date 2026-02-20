<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import Button from '@/components/ui/Button.vue';
import Separator from '@/components/ui/Separator.vue';
import { ShieldAlert, Globe, FileSignature, ChevronDown, ChevronUp } from 'lucide-vue-next';

const METHOD_LABELS: Record<string, string> = {
  getPublicKey: 'Get Public Key',
  signEvent: 'Sign Event',
  getRelays: 'Get Relays',
  nip04_encrypt: 'NIP-04 Encrypt',
  nip04_decrypt: 'NIP-04 Decrypt',
  nip44_encrypt: 'NIP-44 Encrypt',
  nip44_decrypt: 'NIP-44 Decrypt',
};

const requestId = ref('');
const host = ref('');
const method = ref('');
const eventKind = ref<number | null>(null);
const decided = ref(false);
const rawEvent = ref<unknown>(null);
const rawMessageExpanded = ref(false);

const isSignEvent = computed(() => method.value === 'signEvent');
const rawEventJson = computed(() =>
  rawEvent.value != null ? JSON.stringify(rawEvent.value, null, 2) : ''
);

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  requestId.value = params.get('requestId') ?? '';
  host.value = params.get('host') ?? 'unknown';
  method.value = params.get('method') ?? 'unknown';

  const kindParam = params.get('eventKind');
  if (kindParam) eventKind.value = parseInt(kindParam, 10);

  if (method.value === 'signEvent' && requestId.value) {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'GET_RAW_EVENT',
        requestId: requestId.value,
      });
      if (res?.event != null) rawEvent.value = res.event;
    } catch {
      /* ignore */
    }
  }
});

function respond(decision: string) {
  if (decided.value) return;
  decided.value = true;
  chrome.runtime.sendMessage({
    type: 'PERMISSION_RESPONSE',
    requestId: requestId.value,
    decision,
  });
  setTimeout(() => window.close(), 100);
}
</script>

<template>
  <div class="flex flex-col items-center p-4 gap-3">
    <!-- Icon + Title -->
    <div class="flex flex-col items-center gap-1.5">
      <div class="flex items-center justify-center size-10 rounded-full bg-primary/15">
        <ShieldAlert class="size-5 text-primary" />
      </div>
      <h1 class="text-sm font-semibold">Permission Request</h1>
    </div>

    <!-- Domain -->
    <div class="flex flex-col items-center gap-1.5 w-full">
      <div
        class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border w-full justify-center min-h-0"
      >
        <Globe class="size-4 text-muted-foreground shrink-0" />
        <span class="text-sm font-medium truncate">{{ host }}</span>
      </div>

      <p class="text-xs text-muted-foreground text-center">wants to access your Nostr identity</p>
    </div>

    <!-- Method info -->
    <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 w-full min-h-0">
      <FileSignature class="size-4 text-muted-foreground shrink-0" />
      <div class="flex flex-col gap-0.5 min-w-0">
        <span class="text-sm font-medium">{{ METHOD_LABELS[method] ?? method }}</span>
        <span v-if="eventKind !== null" class="text-xs text-muted-foreground">
          Event kind {{ eventKind }}
        </span>
      </div>
    </div>

    <!-- Raw message (signEvent only), collapsible -->
    <div v-if="isSignEvent && rawEvent != null" class="w-full flex flex-col gap-1.5 min-h-0">
      <Button
        variant="ghost"
        size="sm"
        class="w-full justify-between h-8 text-xs text-muted-foreground hover:text-foreground"
        @click="rawMessageExpanded = !rawMessageExpanded"
      >
        <span>{{ rawMessageExpanded ? 'Hide raw message' : 'View raw message' }}</span>
        <ChevronDown v-if="!rawMessageExpanded" class="size-3.5 shrink-0" />
        <ChevronUp v-else class="size-3.5 shrink-0" />
      </Button>
      <div
        v-show="rawMessageExpanded"
        class="rounded-lg border border-border bg-card overflow-auto max-h-32 min-h-0"
      >
        <pre class="p-3 text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word m-0">{{
          rawEventJson
        }}</pre>
      </div>
    </div>

    <Separator class="shrink-0" />

    <!-- Decision buttons -->
    <div class="grid grid-cols-2 gap-2 w-full shrink-0">
      <Button variant="default" class="w-full" @click="respond('allow_always')">
        Allow Always
      </Button>
      <Button variant="outline" class="w-full" @click="respond('allow_once')"> Allow Once </Button>
      <Button variant="outline" class="w-full" @click="respond('deny_once')"> Deny </Button>
      <Button variant="destructive" class="w-full" @click="respond('deny_always')">
        Deny Always
      </Button>
    </div>
  </div>
</template>
