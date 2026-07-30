import { describe, it, expect } from 'vitest';
import { isValidNostrConnectUri } from '@/lib/nostrconnect';

const PUBKEY = 'a'.repeat(64);

describe('isValidNostrConnectUri', () => {
  it('accepts a well-formed URI', () => {
    expect(isValidNostrConnectUri(`nostrconnect://${PUBKEY}?relay=wss%3A%2F%2Frelay.example`)).toBe(
      true
    );
  });

  it('accepts ws:// relays and extra params', () => {
    expect(
      isValidNostrConnectUri(
        `nostrconnect://${PUBKEY}?relay=ws%3A%2F%2Flocalhost%3A7000&secret=abc&name=App`
      )
    ).toBe(true);
  });

  it('accepts an uppercase pubkey', () => {
    expect(
      isValidNostrConnectUri(`nostrconnect://${'A'.repeat(64)}?relay=wss%3A%2F%2Fr.example`)
    ).toBe(true);
  });

  it('rejects a non-pubkey authority', () => {
    expect(isValidNostrConnectUri('nostrconnect://evil.com?relay=wss%3A%2F%2Fr.example')).toBe(
      false
    );
    expect(isValidNostrConnectUri(`nostrconnect://${'a'.repeat(63)}?relay=wss%3A%2F%2Fr`)).toBe(
      false
    );
    expect(isValidNostrConnectUri(`nostrconnect://${'z'.repeat(64)}?relay=wss%3A%2F%2Fr`)).toBe(
      false
    );
  });

  it('rejects a URI with no usable relay', () => {
    expect(isValidNostrConnectUri(`nostrconnect://${PUBKEY}`)).toBe(false);
    expect(isValidNostrConnectUri(`nostrconnect://${PUBKEY}?relay=https%3A%2F%2Fevil.com`)).toBe(
      false
    );
  });

  it('rejects a path after the pubkey', () => {
    expect(
      isValidNostrConnectUri(`nostrconnect://${PUBKEY}/extra?relay=wss%3A%2F%2Fr.example`)
    ).toBe(false);
  });

  it('rejects other schemes and non-strings', () => {
    expect(isValidNostrConnectUri(`https://${PUBKEY}?relay=wss%3A%2F%2Fr.example`)).toBe(false);
    expect(isValidNostrConnectUri('bunker://' + PUBKEY + '?relay=wss%3A%2F%2Fr')).toBe(false);
    expect(isValidNostrConnectUri('')).toBe(false);
    expect(isValidNostrConnectUri(undefined)).toBe(false);
    expect(isValidNostrConnectUri(null)).toBe(false);
  });
});
