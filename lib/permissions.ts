import { NIP07_METHODS } from '@/lib/nip07/types';

/** Reserved keys that must not be used as host or method (prototype pollution / reserved). */
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const VALID_METHODS = new Set<string>(Object.values(NIP07_METHODS));

export type PermissionDecision = 'allow' | 'deny';

export type PermissionEntry = {
  decision: PermissionDecision;
  created_at: number;
};

export type DomainPolicies = {
  [host: string]: {
    [method: string]: PermissionEntry;
  };
};

/** Returns the storage key for a profile's permissions. Falls back to legacy key when no profileId. */
function storageKey(profileId?: string): string {
  return profileId ? `domain_policies_${profileId}` : 'domain_policies';
}

function isSafeHost(host: string): boolean {
  if (typeof host !== 'string' || !host.trim()) return false;
  const normalized = host.trim().toLowerCase();
  if (RESERVED_KEYS.has(normalized)) return false;
  // Reject obvious non-hostnames (e.g. script payloads)
  if (normalized.length > 253) return false;
  if (/[\s<>"']/.test(normalized)) return false;
  return true;
}

function isSafeMethod(method: string): boolean {
  return typeof method === 'string' && method.length > 0 && VALID_METHODS.has(method);
}

/** Storage key for signEvent can be "signEvent" (all kinds) or "signEvent:<kind>" (per-kind). */
function isSafeMethodKey(key: string): boolean {
  if (typeof key !== 'string' || !key.length) return false;
  if (VALID_METHODS.has(key)) return true;
  if (key.startsWith('signEvent:')) {
    const kindPart = key.slice('signEvent:'.length);
    return /^\d+$/.test(kindPart) && kindPart.length <= 10;
  }
  return false;
}

function methodKey(method: string, kind?: number): string {
  if (method.startsWith('signEvent:') && /^signEvent:\d+$/.test(method)) return method;
  if (method === 'signEvent' && kind !== undefined) return `signEvent:${kind}`;
  return method;
}

export async function getPermissions(profileId?: string): Promise<DomainPolicies> {
  const key = storageKey(profileId);
  const raw = await chrome.storage.local.get(key);
  return (raw[key] as DomainPolicies) ?? {};
}

async function savePermissions(policies: DomainPolicies, profileId?: string): Promise<void> {
  const key = storageKey(profileId);
  await chrome.storage.local.set({ [key]: policies });
}

/**
 * Check permission for (host, method). For signEvent, pass kind to check per-kind first,
 * then fallback to "signEvent" (all kinds).
 */
export async function checkPermission(
  host: string,
  method: string,
  kind?: number,
  profileId?: string
): Promise<PermissionDecision | null> {
  if (!isSafeHost(host)) return null;
  if (method !== 'signEvent' && !isSafeMethod(method)) return null;
  if (method === 'signEvent' && kind !== undefined && (typeof kind !== 'number' || kind < 0))
    return null;

  const policies = await getPermissions(profileId);
  const hostPolicies = policies[host];
  if (!hostPolicies) return null;

  if (method === 'signEvent' && kind !== undefined) {
    const kindKey = `signEvent:${kind}`;
    const kindDecision = hostPolicies[kindKey]?.decision;
    if (kindDecision !== undefined && kindDecision !== null) return kindDecision;
    return hostPolicies['signEvent']?.decision ?? null;
  }

  return hostPolicies[method]?.decision ?? null;
}

/**
 * Set permission. For signEvent, pass kind to allow/deny that kind only;
 * otherwise "signEvent" applies to all kinds.
 */
export async function setPermission(
  host: string,
  method: string,
  decision: PermissionDecision,
  kind?: number,
  profileId?: string
): Promise<void> {
  if (!isSafeHost(host)) return;
  const key = methodKey(method, kind);
  if (!isSafeMethodKey(key)) return;

  const policies = await getPermissions(profileId);
  if (!policies[host]) policies[host] = {};
  policies[host][key] = { decision, created_at: Date.now() };
  await savePermissions(policies, profileId);
}

export async function removePermission(
  host: string,
  method: string,
  kind?: number,
  profileId?: string
): Promise<void> {
  if (!isSafeHost(host)) return;
  const key = methodKey(method, kind);
  if (!isSafeMethodKey(key)) return;

  const policies = await getPermissions(profileId);
  if (!policies[host]) return;
  delete policies[host][key];
  if (Object.keys(policies[host]).length === 0) delete policies[host];
  await savePermissions(policies, profileId);
}

export async function removeDomainPermissions(host: string, profileId?: string): Promise<void> {
  if (!isSafeHost(host)) return;
  const policies = await getPermissions(profileId);
  delete policies[host];
  await savePermissions(policies, profileId);
}

export async function clearAllPermissions(profileId?: string): Promise<void> {
  const key = storageKey(profileId);
  await chrome.storage.local.set({ [key]: {} });
}

/** Remove all permission data for a profile (used when deleting a profile). */
export async function deleteProfilePermissions(profileId: string): Promise<void> {
  await chrome.storage.local.remove(storageKey(profileId));
}
