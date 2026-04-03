import { normalizeURL } from 'nostr-tools/utils';
import type { RelayUiProbeStatus } from '@/lib/relay-ui-probe';

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 64;

const probeCache = new Map<string, { at: number; results: Record<string, RelayUiProbeStatus> }>();

export function relayAuthProbeCacheKey(
  profileId: string | null,
  relayUrls: string[],
  usedSigningSecret: boolean
): string {
  const sorted = [...relayUrls].map((u) => normalizeURL(u)).sort();
  return `${profileId ?? 'none'}|${usedSigningSecret ? '1' : '0'}|${sorted.join('\0')}`;
}

export function getRelayAuthProbeFromCache(key: string): Record<string, RelayUiProbeStatus> | null {
  const e = probeCache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    probeCache.delete(key);
    return null;
  }
  return { ...e.results };
}

export function setRelayAuthProbeCache(
  key: string,
  results: Record<string, RelayUiProbeStatus>
): void {
  probeCache.delete(key);
  if (probeCache.size >= MAX_ENTRIES) {
    const oldest = probeCache.keys().next().value;
    if (oldest !== undefined) probeCache.delete(oldest);
  }
  probeCache.set(key, { at: Date.now(), results: { ...results } });
}

export function invalidateRelayAuthProbeCache(): void {
  probeCache.clear();
}
