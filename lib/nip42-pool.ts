import type { SubscribeManyParams, SubCloser } from 'nostr-tools/abstract-pool';
import { finalizeEvent } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';
import type { Event, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import { ResilientPool, type ResilientPoolOptions } from '@/lib/resilient-pool';

export type Nip42ResilientPoolOptions = Omit<ResilientPoolOptions, 'automaticallyAuth'>;

/** normalizeURL throws on malformed input; '' never matches a normalized relay URL. */
function safeNormalize(url: string): string {
  try {
    return normalizeURL(url);
  } catch {
    return '';
  }
}

function normalizedRelaySet(urls: string[]): Set<string> {
  const set = new Set<string>();
  for (const url of urls) {
    const normalized = safeNormalize(url);
    if (normalized) set.add(normalized);
  }
  return set;
}

/**
 * Supplies signing for nostr-tools' built-in NIP-42 flow, restricted to the relays
 * the caller names.
 *
 * A kind-22242 AUTH event hands the relay a non-repudiable link between the profile's
 * client pubkey and the user's IP, and nostr-tools signs on receipt of *any* unsolicited
 * AUTH frame. An unscoped pool therefore authenticates to every relay it touches,
 * including third parties queried only for public data. Only relays passed as
 * `authorizedRelays` — the ones the user's own session already uses — get a signer.
 */
export class Nip42ResilientPool extends ResilientPool {
  private readonly signAuth: (evt: EventTemplate) => Promise<VerifiedEvent>;
  private readonly authorized: Set<string>;

  constructor(
    nip46ClientSecret: Uint8Array,
    authorizedRelays: string[],
    options?: Nip42ResilientPoolOptions
  ) {
    const sign = (evt: EventTemplate): Promise<VerifiedEvent> =>
      Promise.resolve(finalizeEvent(evt, nip46ClientSecret));
    const authorized = normalizedRelaySet(authorizedRelays);

    super({
      ...options,
      automaticallyAuth: (relayUrl: string) =>
        authorized.has(safeNormalize(relayUrl)) ? sign : null,
    });
    this.signAuth = sign;
    this.authorized = authorized;
  }

  /**
   * Signer for the reactive `auth-required:` path of a single call, or undefined when
   * the call touches a relay we may not authenticate to. `params.onauth` carries no
   * relay URL, so it can only be offered when every relay in the call is authorized.
   */
  private onauthFor(
    relays: string[]
  ): ((evt: EventTemplate) => Promise<VerifiedEvent>) | undefined {
    if (!relays.length) return undefined;
    return relays.every((r) => this.authorized.has(safeNormalize(r))) ? this.signAuth : undefined;
  }

  override subscribe(relays: string[], filter: Filter, params?: SubscribeManyParams): SubCloser {
    return super.subscribe(relays, filter, {
      ...params,
      onauth: params?.onauth ?? this.onauthFor(relays),
    });
  }

  override publish(
    relays: string[],
    event: Event,
    params?: {
      onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
      maxWait?: number;
      abort?: AbortSignal;
    }
  ): Promise<string>[] {
    return super.publish(relays, event, {
      ...params,
      onauth: params?.onauth ?? this.onauthFor(relays),
    });
  }

  override async publishResilient(
    relays: string[],
    event: Event,
    params?: {
      onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
      maxWait?: number;
      abort?: AbortSignal;
    }
  ): Promise<{ successful: string[]; failed: Array<{ url: string; error: string }> }> {
    return super.publishResilient(relays, event, {
      ...params,
      onauth: params?.onauth ?? this.onauthFor(relays),
    });
  }
}
