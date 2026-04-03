/** Default relays for Nostr Connect URI (used when connecting via QR/URI). */
export const DEFAULT_NOSTRCONNECT_RELAYS = ['wss://relay.nsec.app'];

/** Public profile directory relay (kind 0 metadata lookups). */
export const PURPLE_PAGES_RELAY = 'wss://purplepag.es';

/** Fallback relays for kind 0 when session / purplepag miss or are slow. */
export const KIND0_FALLBACK_RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io'] as const;

export const NIP46_APP_NAME = 'Bunker46 Extension';
