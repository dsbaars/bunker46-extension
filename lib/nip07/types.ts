/**
 * NIP-07: window.nostr capability for web browsers
 * https://nips.nostr.com/7
 *
 * Required: getPublicKey, signEvent
 * Optional: nip04.encrypt/decrypt, nip44.encrypt/decrypt
 * Common extension: getRelays
 */

/** Event shape required by NIP-07 signEvent (extension adds id, pubkey, sig) */
export type NIP07SignEventInput = {
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
};

/** Full signed event returned by signEvent */
export type NIP07SignedEvent = NIP07SignEventInput & {
  id: string;
  pubkey: string;
  sig: string;
};

export const NIP07_METHODS = {
  getPublicKey: 'getPublicKey',
  signEvent: 'signEvent',
  getRelays: 'getRelays',
  nip04_encrypt: 'nip04_encrypt',
  nip04_decrypt: 'nip04_decrypt',
  nip44_encrypt: 'nip44_encrypt',
  nip44_decrypt: 'nip44_decrypt',
} as const;

export type NIP07MethodName = keyof typeof NIP07_METHODS;
