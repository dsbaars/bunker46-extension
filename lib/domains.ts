/**
 * Build the sorted, deduplicated list of domains that have permissions or are
 * on the Nostr whitelist.
 */
export function getPermissionDomains(permissionKeys: string[], whitelist: string[]): string[] {
  return [...new Set([...permissionKeys, ...whitelist])].sort();
}

/**
 * Filter `domains` by `query` (case-insensitive substring match) and pin
 * `currentDomain` to the top of the result when it appears in the list.
 *
 * - If `query` is empty, all domains are returned.
 * - If `currentDomain` is empty or not in the filtered list, order is unchanged.
 */
export function filterAndPinDomains(
  domains: string[],
  query: string,
  currentDomain: string
): string[] {
  const q = query.trim().toLowerCase();
  const filtered = q ? domains.filter((h) => h.toLowerCase().includes(q)) : domains;

  const current = currentDomain.toLowerCase();
  if (!current) return filtered;

  return [...filtered].sort((a, b) => {
    const aIsCurrent = a.toLowerCase() === current;
    const bIsCurrent = b.toLowerCase() === current;
    if (aIsCurrent && !bIsCurrent) return -1;
    if (!aIsCurrent && bIsCurrent) return 1;
    return 0;
  });
}
