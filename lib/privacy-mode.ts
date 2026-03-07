const STORAGE_KEY_PRIVACY_MODE = 'privacyMode';

/** Returns the storage key for a profile's whitelist. Falls back to legacy key when no profileId. */
function whitelistKey(profileId?: string): string {
  return profileId ? `privacyModeWhitelist_${profileId}` : 'privacyModeWhitelist';
}

export async function getPrivacyMode(): Promise<boolean> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_PRIVACY_MODE);
  return raw[STORAGE_KEY_PRIVACY_MODE] === true;
}

export async function setPrivacyMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PRIVACY_MODE]: enabled });
}

export async function getNostrWhitelist(profileId?: string): Promise<string[]> {
  const key = whitelistKey(profileId);
  const raw = await chrome.storage.local.get(key);
  const list = raw[key];
  return Array.isArray(list) ? list : [];
}

export async function addToNostrWhitelist(host: string, profileId?: string): Promise<void> {
  const list = await getNostrWhitelist(profileId);
  const normalized = host.trim().toLowerCase();
  if (!normalized || list.includes(normalized)) return;
  await chrome.storage.local.set({
    [whitelistKey(profileId)]: [...list, normalized].sort(),
  });
}

export async function removeFromNostrWhitelist(host: string, profileId?: string): Promise<void> {
  const list = await getNostrWhitelist(profileId);
  const normalized = host.trim().toLowerCase();
  if (!normalized) return;
  const next = list.filter((h) => h !== normalized);
  if (next.length === list.length) return;
  await chrome.storage.local.set({ [whitelistKey(profileId)]: next });
}

export async function clearNostrWhitelist(profileId?: string): Promise<void> {
  await chrome.storage.local.set({ [whitelistKey(profileId)]: [] });
}

/** Remove all whitelist data for a profile (used when deleting a profile). */
export async function deleteProfileWhitelist(profileId: string): Promise<void> {
  await chrome.storage.local.remove(whitelistKey(profileId));
}

/**
 * When privacy mode is off, nostr is exposed on all origins.
 * When privacy mode is on, only whitelisted hostnames get window.nostr.
 */
export async function shouldExposeNostrForHost(host: string, profileId?: string): Promise<boolean> {
  const enabled = await getPrivacyMode();
  if (!enabled) return true;
  const list = await getNostrWhitelist(profileId);
  return list.includes(host.trim().toLowerCase());
}
