import { generateSecretKey } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@/lib/hex';

export type Session = {
  signerPubkey: string;
  relays: string[];
  /**
   * Bunker URI for reconnection, always stored without its `secret`.
   *
   * Kept because it carries the *remote signer's* pubkey, which can differ from
   * `signerPubkey` (the user's) and cannot be reconstructed from the rest of the session.
   */
  bunkerUri?: string;
};

export type Profile = {
  id: string;
  name?: string;
  picture?: string;
  /** Session is absent when the profile exists but has no active connection. */
  session?: Session;
  /** Per-profile NIP-46 client secret (hex). Each profile has its own keypair for security. */
  clientSecretHex: string;
};

export type ProfilesMap = Record<string, Profile>;

/** Lightweight shape returned to the popup — no secrets. */
export type ProfileSummary = {
  id: string;
  name?: string;
  picture?: string;
  signerPubkey?: string;
  connected: boolean;
};

export const STORAGE_KEY_PROFILES = 'profiles';
export const STORAGE_KEY_ACTIVE_PROFILE_ID = 'activeProfileId';

/** Legacy storage keys from before multi-profile support. */
const LEGACY_KEY_SESSION = 'nip46_session';
const LEGACY_KEY_CLIENT_SECRET = 'nip46_client_secret_hex';
const LEGACY_KEY_DOMAIN_POLICIES = 'domain_policies';
const LEGACY_KEY_WHITELIST = 'privacyModeWhitelist';

export async function getProfiles(): Promise<ProfilesMap> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_PROFILES);
  return (raw[STORAGE_KEY_PROFILES] as ProfilesMap) ?? {};
}

export async function saveProfiles(profiles: ProfilesMap): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PROFILES]: profiles });
}

export async function getActiveProfileId(): Promise<string | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_ACTIVE_PROFILE_ID);
  return (raw[STORAGE_KEY_ACTIVE_PROFILE_ID] as string | null | undefined) ?? null;
}

export async function setActiveProfileId(id: string | null): Promise<void> {
  if (id === null) {
    await chrome.storage.local.remove(STORAGE_KEY_ACTIVE_PROFILE_ID);
  } else {
    await chrome.storage.local.set({ [STORAGE_KEY_ACTIVE_PROFILE_ID]: id });
  }
}

/**
 * Drop the `secret` from a bunker URI before it is stored.
 *
 * The secret is a one-time connect token: the bunker authorizes the client pubkey on first
 * connect, and `reconnectFromSession()` never sends it again. Keeping it on disk only widens
 * what an attacker with filesystem access to the browser profile walks away with.
 *
 * Returns the input unchanged when it cannot be parsed — nothing can be stripped from a URI
 * we cannot read, and it would have failed to reconnect anyway.
 */
export function stripBunkerUriSecret(uri: string): string {
  try {
    const parsed = new URL(uri.trim());
    if (!parsed.searchParams.has('secret')) return uri;
    parsed.searchParams.delete('secret');
    return parsed.toString();
  } catch {
    return uri;
  }
}

/**
 * One-time sweep for installs that stored a bunker URI before {@link stripBunkerUriSecret}
 * existed. Idempotent, and only writes when something actually changed.
 */
export async function stripStoredBunkerSecrets(): Promise<void> {
  const profiles = await getProfiles();
  let changed = false;

  for (const [id, profile] of Object.entries(profiles)) {
    const uri = profile.session?.bunkerUri;
    if (!uri) continue;
    const stripped = stripBunkerUriSecret(uri);
    if (stripped === uri) continue;
    profiles[id] = { ...profile, session: { ...profile.session!, bunkerUri: stripped } };
    changed = true;
  }

  if (changed) await saveProfiles(profiles);
}

/** Generate a brand-new client keypair for a profile. */
export function generateNewClientSecret(): { hex: string; bytes: Uint8Array } {
  const bytes = generateSecretKey();
  return { hex: bytesToHex(bytes), bytes };
}

/** Decode the stored hex client secret to bytes. */
export function getClientSecretBytes(profile: Profile): Uint8Array {
  return hexToBytes(profile.clientSecretHex);
}

/** Map the full profiles map to lightweight summaries (no secrets). */
export function profilesToSummaries(profiles: ProfilesMap): ProfileSummary[] {
  return Object.values(profiles).map((p) => ({
    id: p.id,
    name: p.name,
    picture: p.picture,
    signerPubkey: p.session?.signerPubkey,
    connected: !!p.session?.signerPubkey,
  }));
}

/**
 * One-time migration from old single-session storage to profile-based storage.
 * Idempotent — safe to call on every background startup.
 */
export async function migrateToProfiles(): Promise<void> {
  const raw = await chrome.storage.local.get([
    LEGACY_KEY_SESSION,
    LEGACY_KEY_CLIENT_SECRET,
    LEGACY_KEY_DOMAIN_POLICIES,
    LEGACY_KEY_WHITELIST,
    STORAGE_KEY_PROFILES,
  ]);

  // Already migrated: profiles key exists
  if (raw[STORAGE_KEY_PROFILES] !== undefined) return;

  const legacySession = raw[LEGACY_KEY_SESSION] as Session | undefined;
  const legacyClientSecret = raw[LEGACY_KEY_CLIENT_SECRET] as string | undefined;
  const legacyDomainPolicies = raw[LEGACY_KEY_DOMAIN_POLICIES];
  const legacyWhitelist = raw[LEGACY_KEY_WHITELIST];

  // Fresh install: no legacy data — just initialize empty profiles store
  if (!legacySession && !legacyClientSecret) {
    await chrome.storage.local.set({ [STORAGE_KEY_PROFILES]: {} });
    return;
  }

  // Existing install: wrap legacy data into the first profile
  const profileId = crypto.randomUUID();
  const clientSecretHex = legacyClientSecret ?? bytesToHex(generateSecretKey());
  const profile: Profile = {
    id: profileId,
    clientSecretHex,
    session: legacySession,
  };

  const profiles: ProfilesMap = { [profileId]: profile };
  const toWrite: Record<string, unknown> = {
    [STORAGE_KEY_PROFILES]: profiles,
    [STORAGE_KEY_ACTIVE_PROFILE_ID]: profileId,
  };

  if (legacyDomainPolicies !== undefined) {
    toWrite[`domain_policies_${profileId}`] = legacyDomainPolicies;
  }
  if (legacyWhitelist !== undefined) {
    toWrite[`privacyModeWhitelist_${profileId}`] = legacyWhitelist;
  }

  await chrome.storage.local.set(toWrite);

  // Verify the write landed before removing legacy keys to avoid data loss.
  const verify = await chrome.storage.local.get(STORAGE_KEY_PROFILES);
  if (verify[STORAGE_KEY_PROFILES] !== undefined) {
    await chrome.storage.local.remove([
      LEGACY_KEY_SESSION,
      LEGACY_KEY_CLIENT_SECRET,
      LEGACY_KEY_DOMAIN_POLICIES,
      LEGACY_KEY_WHITELIST,
    ]);
  }
}
