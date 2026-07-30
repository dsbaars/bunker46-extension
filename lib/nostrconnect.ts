/**
 * Validation for `nostrconnect:` URIs handed to us by a web page.
 *
 * A page can put any string on an anchor and have the content script forward it, so the
 * URI is untrusted input: it decides which connection request the user's bunker app is
 * asked to approve. Accept only what NIP-46 actually defines — a client pubkey and at
 * least one relay.
 */

export const NOSTRCONNECT_PREFIX = 'nostrconnect://';

const HEX64 = /^[0-9a-f]{64}$/i;

/** True for `nostrconnect://<64-hex client pubkey>?relay=ws(s)://…`. */
export function isValidNostrConnectUri(uri: unknown): uri is string {
  if (typeof uri !== 'string' || !uri.startsWith(NOSTRCONNECT_PREFIX)) return false;

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  // Non-special scheme: the client pubkey lands in `hostname` and keeps its case.
  if (!HEX64.test(parsed.hostname)) return false;
  // A path segment would mean the authority is not the whole pubkey.
  if (parsed.pathname && parsed.pathname !== '/') return false;

  return parsed.searchParams
    .getAll('relay')
    .some((relay) => relay.startsWith('wss://') || relay.startsWith('ws://'));
}
