import { describe, expect, it } from 'vitest';
import { canUseNip46SecretForRelayProbe } from './relay-auth-probe';

describe('canUseNip46SecretForRelayProbe', () => {
  it('returns true when every probe URL is in the session relay set', () => {
    expect(
      canUseNip46SecretForRelayProbe(['wss://a.com', 'wss://b.com'], ['wss://a.com', 'wss://b.com'])
    ).toBe(true);
  });

  it('normalizes URLs like nostr-tools', () => {
    expect(canUseNip46SecretForRelayProbe(['wss://a.com/'], ['wss://a.com'])).toBe(true);
  });

  it('returns false when a probe URL is not in the session set', () => {
    expect(canUseNip46SecretForRelayProbe(['wss://a.com'], ['wss://evil.com'])).toBe(false);
  });

  it('returns false for empty session relays', () => {
    expect(canUseNip46SecretForRelayProbe([], ['wss://a.com'])).toBe(false);
  });
});
