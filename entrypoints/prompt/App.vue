<script lang="ts" setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import Button from '@/components/ui/Button.vue';
import Badge from '@/components/ui/Badge.vue';
import Separator from '@/components/ui/Separator.vue';
import {
  ShieldAlert,
  Globe,
  FileSignature,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from '@lucide/vue';
import { t, getMethodLabel } from '@/lib/i18n';
import { tokenizeJson } from '@/lib/json-highlight';

type GroupedRequest = { requestId: string; event: unknown };

const groupKey = ref('');
const host = ref('');
const method = ref('');
const eventKind = ref<number | null>(null);
const decided = ref(false);
const rawMessageExpanded = ref(false);

/** All requests the prompt decides on at once: same client, same permission scope. */
const requests = ref<GroupedRequest[]>([]);
const pageIndex = ref(0);
/** Requests the user took out of the batch; they are denied when the decision is sent. */
const skipped = ref<string[]>([]);

const isSignEvent = computed(() => method.value === 'signEvent');
const isGroup = computed(() => requests.value.length > 1);
const currentRequest = computed<GroupedRequest | null>(
  () => requests.value[pageIndex.value] ?? null
);
const currentEvent = computed(() => currentRequest.value?.event ?? null);
/** Only signEvent carries a payload worth stepping through. */
const canReviewIndividually = computed(
  () => isGroup.value && requests.value.some((r) => r.event != null)
);
const isCurrentSkipped = computed(
  () => currentRequest.value != null && skipped.value.includes(currentRequest.value.requestId)
);

const rawEventJson = computed(() => {
  if (currentEvent.value == null) return '';
  return JSON.stringify(currentEvent.value, null, 2).trim();
});
const rawEventTokens = computed(() => (rawEventJson.value ? tokenizeJson(rawEventJson.value) : []));

async function loadGroup(): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_PERMISSION_GROUP' });
    const list = Array.isArray(res?.requests) ? (res.requests as GroupedRequest[]) : [];
    requests.value = list;
    if (pageIndex.value > list.length - 1) pageIndex.value = Math.max(0, list.length - 1);
    skipped.value = skipped.value.filter((id) => list.some((r) => r.requestId === id));
  } catch {
    /* background may be restarting; keep whatever is on screen */
  }
}

/** Requests can still join this group while the prompt is open. */
function onBackgroundMessage(msg: { type?: string; groupKey?: string }): void {
  if (msg?.type === 'PERMISSION_GROUP_UPDATED' && msg.groupKey === groupKey.value) void loadGroup();
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  groupKey.value = params.get('groupKey') ?? '';
  host.value = params.get('host') ?? 'unknown';
  method.value = params.get('method') ?? 'unknown';

  const kindParam = params.get('eventKind');
  if (kindParam) eventKind.value = parseInt(kindParam, 10);

  chrome.runtime.onMessage.addListener(onBackgroundMessage);
  await loadGroup();

  await nextTick();
  resizeWindowToContent();
});

onUnmounted(() => {
  chrome.runtime.onMessage.removeListener(onBackgroundMessage);
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

watch([requests, rawMessageExpanded, skipped], () => {
  nextTick(() => resizeWindowToContent());
});

function step(delta: number): void {
  const next = pageIndex.value + delta;
  if (next < 0 || next > requests.value.length - 1) return;
  pageIndex.value = next;
}

function toggleSkip(): void {
  const current = currentRequest.value;
  if (!current) return;
  skipped.value = skipped.value.includes(current.requestId)
    ? skipped.value.filter((id) => id !== current.requestId)
    : [...skipped.value, current.requestId];
}

function respond(decision: string) {
  if (decided.value) return;
  decided.value = true;
  chrome.runtime.sendMessage({
    type: 'PERMISSION_RESPONSE',
    decision,
    skipped: skipped.value,
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
      <Badge v-if="isGroup" class="ml-auto shrink-0">
        {{ t('promptRequestCount', String(requests.length)) }}
      </Badge>
    </div>

    <!-- Per-request pager (signEvent groups only) -->
    <div v-if="canReviewIndividually" class="flex items-center gap-1 w-full shrink-0">
      <Button
        variant="ghost"
        size="icon"
        class="size-7 shrink-0"
        :disabled="pageIndex === 0"
        :aria-label="t('promptPreviousRequest')"
        @click="step(-1)"
      >
        <ChevronLeft class="size-3.5" />
      </Button>
      <span
        class="flex-1 text-center text-xs text-muted-foreground"
        :class="{ 'line-through': isCurrentSkipped }"
      >
        {{ t('promptRequestPager', String(pageIndex + 1), String(requests.length)) }}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="size-7 shrink-0"
        :disabled="pageIndex >= requests.length - 1"
        :aria-label="t('promptNextRequest')"
        @click="step(1)"
      >
        <ChevronRight class="size-3.5" />
      </Button>
      <Button variant="outline" size="sm" class="h-7 shrink-0" @click="toggleSkip">
        {{ isCurrentSkipped ? t('promptIncludeRequest') : t('promptSkipRequest') }}
      </Button>
    </div>

    <!-- Raw message (signEvent only), collapsible -->
    <div v-if="isSignEvent && currentEvent != null" class="w-full flex flex-col gap-1.5 min-h-0">
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
        :class="{ 'opacity-50': isCurrentSkipped }"
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
    <div class="flex flex-col gap-0.5 w-full shrink-0">
      <p v-if="isGroup" class="text-[10px] text-muted-foreground text-center w-full">
        {{ t('promptAppliesToGroup') }}
      </p>
      <p
        v-if="skipped.length > 0"
        class="text-[10px] text-muted-foreground text-center w-full italic"
      >
        {{ t('promptSkippedNote') }}
      </p>
      <p
        v-if="isSignEvent && eventKind !== null"
        class="text-[10px] text-muted-foreground text-center w-full"
      >
        {{ t('promptAllowAlwaysForKindHint') }}
      </p>
    </div>
  </div>
</template>
