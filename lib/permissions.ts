const STORAGE_KEY = 'domain_policies';

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

export async function getPermissions(): Promise<DomainPolicies> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  return (raw[STORAGE_KEY] as DomainPolicies) ?? {};
}

async function savePermissions(policies: DomainPolicies): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: policies });
}

export async function checkPermission(
  host: string,
  method: string
): Promise<PermissionDecision | null> {
  const policies = await getPermissions();
  return policies[host]?.[method]?.decision ?? null;
}

export async function setPermission(
  host: string,
  method: string,
  decision: PermissionDecision
): Promise<void> {
  const policies = await getPermissions();
  if (!policies[host]) policies[host] = {};
  policies[host][method] = { decision, created_at: Date.now() };
  await savePermissions(policies);
}

export async function removePermission(host: string, method: string): Promise<void> {
  const policies = await getPermissions();
  if (!policies[host]) return;
  delete policies[host][method];
  if (Object.keys(policies[host]).length === 0) delete policies[host];
  await savePermissions(policies);
}

export async function removeDomainPermissions(host: string): Promise<void> {
  const policies = await getPermissions();
  delete policies[host];
  await savePermissions(policies);
}
