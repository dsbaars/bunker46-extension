const STORAGE_KEY_PRIVACY_MODE = 'privacyMode';
const STORAGE_KEY_NOSTR_WHITELIST = 'privacyModeWhitelist';

export async function getPrivacyMode(): Promise<boolean> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_PRIVACY_MODE);
  return raw[STORAGE_KEY_PRIVACY_MODE] === true;
}

export async function setPrivacyMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_PRIVACY_MODE]: enabled });
}

export async function getNostrWhitelist(): Promise<string[]> {
  const raw = await chrome.storage.local.get(STORAGE_KEY_NOSTR_WHITELIST);
  const list = raw[STORAGE_KEY_NOSTR_WHITELIST];
  return Array.isArray(list) ? list : [];
}

export async function addToNostrWhitelist(host: string): Promise<void> {
  const list = await getNostrWhitelist();
  const normalized = host.trim().toLowerCase();
  if (!normalized || list.includes(normalized)) return;
  await chrome.storage.local.set({
    [STORAGE_KEY_NOSTR_WHITELIST]: [...list, normalized].sort(),
  });
}

export async function removeFromNostrWhitelist(host: string): Promise<void> {
  const list = await getNostrWhitelist();
  const normalized = host.trim().toLowerCase();
  if (!normalized) return;
  const next = list.filter((h) => h !== normalized);
  if (next.length === list.length) return;
  await chrome.storage.local.set({ [STORAGE_KEY_NOSTR_WHITELIST]: next });
}

export async function clearNostrWhitelist(): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY_NOSTR_WHITELIST]: [] });
}

/**
 * When privacy mode is off, nostr is exposed on all origins.
 * When privacy mode is on, only whitelisted hostnames get window.nostr.
 */
export async function shouldExposeNostrForHost(host: string): Promise<boolean> {
  const enabled = await getPrivacyMode();
  if (!enabled) return true;
  const list = await getNostrWhitelist();
  return list.includes(host.trim().toLowerCase());
}
