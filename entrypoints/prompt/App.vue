<script lang="ts" setup>
import { ref, onMounted, computed, nextTick, watch } from 'vue';
import Button from '@/components/ui/Button.vue';
import Separator from '@/components/ui/Separator.vue';
import { ShieldAlert, Globe, FileSignature, ChevronDown, ChevronUp } from 'lucide-vue-next';
import { t, getMethodLabel } from '@/lib/i18n';
import { tokenizeJson } from '@/lib/json-highlight';

const requestId = ref('');
const host = ref('');
const method = ref('');
const eventKind = ref<number | null>(null);
const decided = ref(false);
const rawEvent = ref<unknown>(null);
const rawMessageExpanded = ref(false);

const isSignEvent = computed(() => method.value === 'signEvent');
const rawEventJson = computed(() => {
  if (rawEvent.value == null) return '';
  return JSON.stringify(rawEvent.value, null, 2).trim();
});
const rawEventTokens = computed(() => (rawEventJson.value ? tokenizeJson(rawEventJson.value) : []));

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

  await nextTick();
  resizeWindowToContent();
});

/** Resize the prompt window to fit content (no scrollbar). */
function resizeWindowToContent(): void {
  try {
    const frameHeight = window.outerHeight - window.innerHeight;
    const contentHeight = document.documentElement.scrollHeight;
    const newHeight = Math.min(Math.max(contentHeight + frameHeight, 280), 600);
    chrome.windows?.getCurrent?.((win: { id?: number } | null) => {
      if (win?.id != null) chrome.windows.update(win.id, { height: Math.round(newHeight) });
    });
  } catch {
    /* ignore */
  }
}

watch([rawEvent, rawMessageExpanded], () => {
  nextTick(() => resizeWindowToContent());
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
      <h1 class="text-sm font-semibold">{{ t('promptPermissionRequest') }}</h1>
    </div>

    <!-- Domain -->
    <div class="flex flex-col items-center gap-1.5 w-full">
      <div
        class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border w-full justify-center min-h-0"
      >
        <Globe class="size-4 text-muted-foreground shrink-0" />
        <span class="text-sm font-medium truncate">{{ host }}</span>
      </div>

      <p class="text-xs text-muted-foreground text-center">{{ t('promptWantsAccess') }}</p>
    </div>

    <!-- Method info -->
    <div class="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-secondary/50 w-full min-h-0">
      <FileSignature class="size-4 text-muted-foreground shrink-0" />
      <div class="flex flex-col gap-0.5 min-w-0">
        <span class="text-sm font-medium">{{ getMethodLabel(method) }}</span>
        <span v-if="eventKind !== null" class="text-xs text-muted-foreground">
          {{ t('promptEventKind', String(eventKind)) }}
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
        <span>{{
          rawMessageExpanded ? t('promptHideRawMessage') : t('promptViewRawMessage')
        }}</span>
        <ChevronDown v-if="!rawMessageExpanded" class="size-3.5 shrink-0" />
        <ChevronUp v-else class="size-3.5 shrink-0" />
      </Button>
      <div
        v-show="rawMessageExpanded"
        class="rounded-lg border border-border bg-card overflow-auto max-h-32 min-h-0 json-pre"
      >
        <pre class="p-3 text-xs whitespace-pre-wrap wrap-break-word m-0"><span
          v-for="(tok, i) in rawEventTokens"
          :key="i"
          :class="'json-' + tok.type"
        >{{ tok.text }}</span></pre>
      </div>
    </div>

    <Separator class="shrink-0" />

    <!-- Decision buttons -->
    <div class="grid grid-cols-2 gap-2 w-full shrink-0">
      <Button variant="default" class="w-full" @click="respond('allow_always')">
        {{ t('promptAllowAlways') }}
      </Button>
      <Button variant="outline" class="w-full" @click="respond('allow_once')">
        {{ t('promptAllowOnce') }}
      </Button>
      <Button variant="outline" class="w-full" @click="respond('deny_once')">
        {{ t('promptDenyOnce') }}
      </Button>
      <Button variant="destructive" class="w-full" @click="respond('deny_always')">
        {{ t('promptDenyAlways') }}
      </Button>
    </div>
    <p
      v-if="isSignEvent && eventKind !== null"
      class="text-[10px] text-muted-foreground text-center w-full shrink-0"
    >
      {{ t('promptAllowAlwaysForKindHint') }}
    </p>
  </div>
</template>
