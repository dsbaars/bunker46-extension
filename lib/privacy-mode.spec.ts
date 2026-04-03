import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getPrivacyMode,
  setPrivacyMode,
  getNostrWhitelist,
  addToNostrWhitelist,
  removeFromNostrWhitelist,
  clearNostrWhitelist,
  deleteProfileWhitelist,
  shouldExposeNostrForHost,
} from './privacy-mode';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('privacy-mode', () => {
  it('defaults to privacy mode disabled', async () => {
    expect(await getPrivacyMode()).toBe(false);
  });

  it('setPrivacyMode / getPrivacyMode roundtrip', async () => {
    await setPrivacyMode(true);
    expect(await getPrivacyMode()).toBe(true);
    await setPrivacyMode(false);
    expect(await getPrivacyMode()).toBe(false);
  });
});

describe('whitelist', () => {
  it('starts empty', async () => {
    expect(await getNostrWhitelist()).toEqual([]);
  });

  it('addToNostrWhitelist adds and sorts entries', async () => {
    await addToNostrWhitelist('Zebra.com');
    await addToNostrWhitelist('alpha.com');
    expect(await getNostrWhitelist()).toEqual(['alpha.com', 'zebra.com']);
  });

  it('addToNostrWhitelist normalizes to lowercase and trims', async () => {
    await addToNostrWhitelist('  Example.COM  ');
    expect(await getNostrWhitelist()).toEqual(['example.com']);
  });

  it('addToNostrWhitelist deduplicates', async () => {
    await addToNostrWhitelist('x.com');
    await addToNostrWhitelist('X.COM');
    expect(await getNostrWhitelist()).toEqual(['x.com']);
  });

  it('addToNostrWhitelist rejects empty host', async () => {
    await addToNostrWhitelist('');
    await addToNostrWhitelist('   ');
    expect(await getNostrWhitelist()).toEqual([]);
  });

  it('addToNostrWhitelist rejects hosts with HTML-unsafe characters', async () => {
    await addToNostrWhitelist('<script>alert(1)</script>');
    await addToNostrWhitelist('" onmouseover="alert(1)"');
    await addToNostrWhitelist("host'name");
    expect(await getNostrWhitelist()).toEqual([]);
  });

  it('addToNostrWhitelist rejects hosts longer than 253 characters', async () => {
    await addToNostrWhitelist('a'.repeat(254) + '.com');
    expect(await getNostrWhitelist()).toEqual([]);
  });

  it('addToNostrWhitelist rejects hosts with whitespace', async () => {
    await addToNostrWhitelist('host name.com');
    await addToNostrWhitelist('host\tname.com');
    expect(await getNostrWhitelist()).toEqual([]);
  });

  it('removeFromNostrWhitelist removes existing entry', async () => {
    await addToNostrWhitelist('a.com');
    await addToNostrWhitelist('b.com');
    await removeFromNostrWhitelist('a.com');
    expect(await getNostrWhitelist()).toEqual(['b.com']);
  });

  it('removeFromNostrWhitelist is a no-op for missing entry', async () => {
    await addToNostrWhitelist('a.com');
    await removeFromNostrWhitelist('missing.com');
    expect(await getNostrWhitelist()).toEqual(['a.com']);
  });

  it('clearNostrWhitelist empties the list', async () => {
    await addToNostrWhitelist('a.com');
    await addToNostrWhitelist('b.com');
    await clearNostrWhitelist();
    expect(await getNostrWhitelist()).toEqual([]);
  });

  it('per-profile whitelist is isolated', async () => {
    await addToNostrWhitelist('shared.com');
    await addToNostrWhitelist('profile-only.com', 'profile-1');
    expect(await getNostrWhitelist()).toEqual(['shared.com']);
    expect(await getNostrWhitelist('profile-1')).toEqual(['profile-only.com']);
  });

  it('deleteProfileWhitelist removes profile-specific data', async () => {
    await addToNostrWhitelist('x.com', 'p1');
    await deleteProfileWhitelist('p1');
    expect(await getNostrWhitelist('p1')).toEqual([]);
  });
});

describe('shouldExposeNostrForHost', () => {
  it('exposes on all hosts when privacy mode is off', async () => {
    expect(await shouldExposeNostrForHost('anything.com')).toBe(true);
  });

  it('blocks non-whitelisted hosts when privacy mode is on', async () => {
    await setPrivacyMode(true);
    expect(await shouldExposeNostrForHost('blocked.com')).toBe(false);
  });

  it('allows whitelisted hosts when privacy mode is on', async () => {
    await setPrivacyMode(true);
    await addToNostrWhitelist('allowed.com');
    expect(await shouldExposeNostrForHost('allowed.com')).toBe(true);
  });

  it('matches case-insensitively', async () => {
    await setPrivacyMode(true);
    await addToNostrWhitelist('Example.COM');
    expect(await shouldExposeNostrForHost('EXAMPLE.com')).toBe(true);
  });
});
