import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  profilesToSummaries,
  migrateToProfiles,
  generateNewClientSecret,
  getClientSecretBytes,
} from './profiles';
import type { Profile, Session } from './profiles';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('profiles', () => {
  it('getProfiles returns empty object initially', async () => {
    const profiles = await getProfiles();
    expect(profiles).toEqual({});
  });

  it('saveProfiles and getProfiles roundtrip', async () => {
    const { hex } = generateNewClientSecret();
    const profile: Profile = {
      id: 'test-id',
      name: 'Test',
      clientSecretHex: hex,
      session: { signerPubkey: 'abc', relays: ['wss://x.com'] },
    };
    await saveProfiles({ 'test-id': profile });
    const loaded = await getProfiles();
    expect(loaded['test-id']).toBeDefined();
    expect(loaded['test-id'].id).toBe('test-id');
    expect(loaded['test-id'].name).toBe('Test');
    expect(loaded['test-id'].clientSecretHex).toBe(hex);
    expect(loaded['test-id'].session?.signerPubkey).toBe('abc');
  });

  it('getActiveProfileId returns null initially', async () => {
    expect(await getActiveProfileId()).toBeNull();
  });

  it('setActiveProfileId and getActiveProfileId roundtrip', async () => {
    await setActiveProfileId('profile-1');
    expect(await getActiveProfileId()).toBe('profile-1');
    await setActiveProfileId(null);
    expect(await getActiveProfileId()).toBeNull();
  });

  it('profilesToSummaries maps profiles without exposing clientSecretHex', () => {
    const profiles: Record<string, Profile> = {
      a: {
        id: 'a',
        name: 'Alice',
        clientSecretHex: 'secret',
        session: { signerPubkey: 'pk1', relays: [] },
      },
      b: {
        id: 'b',
        clientSecretHex: 'other',
        session: undefined,
      },
    };
    const summaries = profilesToSummaries(profiles);
    expect(summaries).toHaveLength(2);
    const alice = summaries.find((s) => s.id === 'a');
    const bob = summaries.find((s) => s.id === 'b');
    expect(alice).toMatchObject({ id: 'a', name: 'Alice', signerPubkey: 'pk1', connected: true });
    expect(alice).not.toHaveProperty('clientSecretHex');
    expect(bob).toMatchObject({ id: 'b', connected: false });
    expect(bob?.signerPubkey).toBeUndefined();
  });

  it('generateNewClientSecret returns hex and bytes', () => {
    const a = generateNewClientSecret();
    const b = generateNewClientSecret();
    expect(a.hex).toMatch(/^[0-9a-f]+$/);
    expect(a.bytes).toBeInstanceOf(Uint8Array);
    expect(a.bytes.length).toBe(32);
    expect(b.hex).not.toBe(a.hex);
  });

  it('getClientSecretBytes decodes profile clientSecretHex', () => {
    const { hex, bytes } = generateNewClientSecret();
    const profile: Profile = { id: 'x', clientSecretHex: hex };
    const decoded = getClientSecretBytes(profile);
    expect(decoded).toEqual(bytes);
  });

  describe('migrateToProfiles', () => {
    it('fresh install: initializes empty profiles', async () => {
      await migrateToProfiles();
      const profiles = await getProfiles();
      expect(profiles).toEqual({});
    });

    it('existing install: migrates legacy session to one profile', async () => {
      const legacySession: Session = {
        signerPubkey: 'legacy-pubkey',
        relays: ['wss://relay'],
      };
      const legacySecret = 'aabbcc';
      await fakeBrowser.storage.local.set({
        nip46_session: legacySession,
        nip46_client_secret_hex: legacySecret,
        domain_policies: { 'example.com': {} },
        privacyModeWhitelist: ['x.com'],
      });

      await migrateToProfiles();

      const profiles = await getProfiles();
      const ids = Object.keys(profiles);
      expect(ids).toHaveLength(1);
      const profile = profiles[ids[0]!];
      expect(profile.clientSecretHex).toBe(legacySecret);
      expect(profile.session).toEqual(legacySession);
      expect(await getActiveProfileId()).toBe(ids[0]);

      const stored = await fakeBrowser.storage.local.get(null);
      expect(stored).toHaveProperty(`domain_policies_${ids[0]}`);
      expect(stored).toHaveProperty(`privacyModeWhitelist_${ids[0]}`);
      expect(stored).not.toHaveProperty('nip46_session');
      expect(stored).not.toHaveProperty('nip46_client_secret_hex');
      expect(stored).not.toHaveProperty('domain_policies');
      expect(stored).not.toHaveProperty('privacyModeWhitelist');
    });

    it('idempotent: does not run when profiles already exist', async () => {
      const { hex } = generateNewClientSecret();
      await saveProfiles({ existing: { id: 'existing', clientSecretHex: hex } as Profile });
      await setActiveProfileId('existing');
      await fakeBrowser.storage.local.set({
        nip46_session: { signerPubkey: 'x', relays: [] },
        nip46_client_secret_hex: 'old',
      });

      await migrateToProfiles();

      const profiles = await getProfiles();
      expect(profiles).toHaveProperty('existing');
      expect(profiles).not.toHaveProperty('x'); // no new profile from legacy
      const stored = await fakeBrowser.storage.local.get('nip46_session');
      expect(stored.nip46_session).toBeDefined(); // legacy left intact (migration skipped)
    });
  });
});
