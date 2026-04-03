import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getRelayAuthProbeFromCache,
  invalidateRelayAuthProbeCache,
  relayAuthProbeCacheKey,
  setRelayAuthProbeCache,
} from './relay-auth-probe-cache';

beforeEach(() => {
  invalidateRelayAuthProbeCache();
});

describe('relay-auth-probe-cache', () => {
  it('stores and retrieves results', () => {
    const key = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    setRelayAuthProbeCache(key, { 'wss://a.com': 'nip42_ok' });
    expect(getRelayAuthProbeFromCache(key)?.['wss://a.com']).toBe('nip42_ok');
  });

  it('differentiates signing vs challenge-only cache keys', () => {
    const a = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    const b = relayAuthProbeCacheKey('p1', ['wss://a.com'], false);
    expect(a).not.toBe(b);
  });

  it('returns null for missing key', () => {
    expect(getRelayAuthProbeFromCache('nonexistent')).toBeNull();
  });

  it('returns a shallow copy (external mutation does not affect cache)', () => {
    const key = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    setRelayAuthProbeCache(key, { 'wss://a.com': 'ok' });
    const result = getRelayAuthProbeFromCache(key)!;
    result['wss://a.com'] = 'failed';
    expect(getRelayAuthProbeFromCache(key)!['wss://a.com']).toBe('ok');
  });

  it('expires entries after TTL', () => {
    const key = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    setRelayAuthProbeCache(key, { 'wss://a.com': 'nip42_ok' });

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(15 * 60 * 1000 + 1);
      expect(getRelayAuthProbeFromCache(key)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not expire entries before TTL', () => {
    const key = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    setRelayAuthProbeCache(key, { 'wss://a.com': 'ok' });

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(14 * 60 * 1000);
      expect(getRelayAuthProbeFromCache(key)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest entry when cache exceeds max size', () => {
    const firstKey = relayAuthProbeCacheKey('p1', ['wss://first.com'], true);
    setRelayAuthProbeCache(firstKey, { 'wss://first.com': 'ok' });

    for (let i = 0; i < 64; i++) {
      const key = relayAuthProbeCacheKey(`p${i}`, [`wss://relay-${i}.com`], false);
      setRelayAuthProbeCache(key, { [`wss://relay-${i}.com`]: 'ok' });
    }

    expect(getRelayAuthProbeFromCache(firstKey)).toBeNull();
  });

  it('invalidateRelayAuthProbeCache clears all entries', () => {
    const k1 = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    const k2 = relayAuthProbeCacheKey('p2', ['wss://b.com'], false);
    setRelayAuthProbeCache(k1, { 'wss://a.com': 'ok' });
    setRelayAuthProbeCache(k2, { 'wss://b.com': 'failed' });
    invalidateRelayAuthProbeCache();
    expect(getRelayAuthProbeFromCache(k1)).toBeNull();
    expect(getRelayAuthProbeFromCache(k2)).toBeNull();
  });

  it('overwrites existing entry for same key', () => {
    const key = relayAuthProbeCacheKey('p1', ['wss://a.com'], true);
    setRelayAuthProbeCache(key, { 'wss://a.com': 'ok' });
    setRelayAuthProbeCache(key, { 'wss://a.com': 'nip42_failed' });
    expect(getRelayAuthProbeFromCache(key)!['wss://a.com']).toBe('nip42_failed');
  });
});
