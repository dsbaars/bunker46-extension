import type { SubscribeManyParams, SubCloser } from 'nostr-tools/abstract-pool';
import { finalizeEvent } from 'nostr-tools/pure';
import type { Event, EventTemplate, Filter, VerifiedEvent } from 'nostr-tools';
import { ResilientPool, type ResilientPoolOptions } from '@/lib/resilient-pool';

export type Nip42ResilientPoolOptions = Omit<ResilientPoolOptions, 'automaticallyAuth'>;

/**
 * Supplies signing for nostr-tools' built-in NIP-42 flow.
 *
 * `AbstractRelay` already parses `AUTH`, builds the kind-22242 template, and invokes
 * `onauth` / `automaticallyAuth`. We only provide the signing key via `finalizeEvent`.
 */
export class Nip42ResilientPool extends ResilientPool {
  private readonly signAuth: (evt: EventTemplate) => Promise<VerifiedEvent>;

  constructor(nip46ClientSecret: Uint8Array, options?: Nip42ResilientPoolOptions) {
    const sign = (evt: EventTemplate): Promise<VerifiedEvent> =>
      Promise.resolve(finalizeEvent(evt, nip46ClientSecret));

    super({ ...options, automaticallyAuth: () => sign });
    this.signAuth = sign;
  }

  subscribe(relays: string[], filter: Filter, params?: SubscribeManyParams): SubCloser {
    return super.subscribe(relays, filter, {
      ...params,
      onauth: params?.onauth ?? this.signAuth,
    });
  }

  publish(
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
      onauth: params?.onauth ?? this.signAuth,
    });
  }

  async publishResilient(
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
      onauth: params?.onauth ?? this.signAuth,
    });
  }
}
