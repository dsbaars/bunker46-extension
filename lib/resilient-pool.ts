/**
 * ResilientPool - A resilient pool for nostr-tools that tolerates relay failures.
 *
 * When using SimplePool from nostr-tools with NIP-46 bunker connections,
 * if any relay fails to connect, the entire connection fails.
 *
 * ResilientPool extends AbstractSimplePool and uses Promise.allSettled
 * instead of Promise.all for relay connections. This allows connections
 * to proceed as long as at least one relay is responsive.
 */

import {
  AbstractSimplePool,
  type AbstractPoolConstructorOptions,
  type SubscribeManyParams,
  type SubCloser,
} from 'nostr-tools/abstract-pool';
import { verifyEvent } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';
import type { AbstractRelay, Subscription } from 'nostr-tools/abstract-relay';
import type { Filter, Event, EventTemplate, VerifiedEvent } from 'nostr-tools';

export interface ResilientPoolOptions extends Omit<
  AbstractPoolConstructorOptions,
  'verifyEvent' | 'websocketImplementation' | 'maxWaitForConnection'
> {
  /**
   * Minimum number of relays that must connect successfully for subscriptions/publishes.
   * Default: 1
   */
  minSuccessfulRelays?: number;

  /**
   * Maximum time to wait for relay connections in milliseconds.
   * Default: 10000
   */
  maxWaitForConnection?: number;

  /**
   * Called when partial success occurs (some relays connected, some failed).
   */
  onPartialSuccess?: (successfulRelays: string[], failedRelays: string[]) => void;
}

/**
 * A resilient pool that tolerates relay failures.
 *
 * Unlike SimplePool which fails if any relay is unreachable,
 * ResilientPool continues as long as at least one relay (or minSuccessfulRelays) works.
 */
export class ResilientPool extends AbstractSimplePool {
  public minSuccessfulRelays: number;
  public onPartialSuccess?: (successfulRelays: string[], failedRelays: string[]) => void;

  constructor(options?: ResilientPoolOptions) {
    super({
      verifyEvent,
      websocketImplementation: typeof WebSocket !== 'undefined' ? WebSocket : undefined,
      maxWaitForConnection: options?.maxWaitForConnection ?? 10000,
      ...options,
    } as AbstractPoolConstructorOptions);

    this.minSuccessfulRelays = options?.minSuccessfulRelays ?? 1;
    this.onPartialSuccess = options?.onPartialSuccess;
  }

  /**
   * Override subscribeMap to use Promise.allSettled instead of Promise.all.
   * This allows the subscription to proceed even if some relays fail to connect.
   */
  subscribeMap(
    requests: { url: string; filter: Filter }[],
    params: SubscribeManyParams
  ): SubCloser {
    const grouped = new Map<string, Filter[]>();
    for (const req of requests) {
      const { url, filter } = req;
      if (!grouped.has(url)) grouped.set(url, []);
      grouped.get(url)!.push(filter);
    }
    const groupedRequests = Array.from(grouped.entries()).map(([url, filters]) => ({
      url,
      filters,
    }));

    if (this.trackRelays) {
      params.receivedEvent = (relay: AbstractRelay, id: string) => {
        let set = this.seenOn.get(id);
        if (!set) {
          set = new Set();
          this.seenOn.set(id, set);
        }
        set.add(relay);
      };
    }

    const _knownIds = new Set<string>();
    const subs: Subscription[] = [];
    const successfulRelays: string[] = [];
    const failedRelays: string[] = [];

    // Track which relays actually connected successfully
    const connectedIndexes: Set<number> = new Set();

    // batch all EOSEs into a single - only for CONNECTED relays
    const eosesReceived: boolean[] = [];
    let handleEose = (i: number) => {
      if (!connectedIndexes.has(i)) return; // ignore EOSEs from relays that didn't connect
      if (eosesReceived[i]) return;
      eosesReceived[i] = true;
      // Only trigger oneose when ALL successfully connected relays have sent EOSE
      if (
        eosesReceived.filter((_, idx) => connectedIndexes.has(idx) && eosesReceived[idx]).length ===
        connectedIndexes.size
      ) {
        params.oneose?.();
        handleEose = () => {};
      }
    };

    // batch all closes into a single - only for CONNECTED relays
    const closesReceived: string[] = [];
    let handleClose = (i: number, reason: string) => {
      if (!connectedIndexes.has(i)) return; // ignore closes from relays that didn't connect
      if (closesReceived[i]) return;
      handleEose(i);
      closesReceived[i] = reason;
      // Only trigger onclose when ALL successfully connected relays have closed
      if (
        closesReceived.filter((_, idx) => connectedIndexes.has(idx) && closesReceived[idx])
          .length === connectedIndexes.size
      ) {
        params.onclose?.(closesReceived.filter((_, idx) => connectedIndexes.has(idx)));
        handleClose = () => {};
      }
    };

    const localAlreadyHaveEventHandler = (id: string) => {
      if (params.alreadyHaveEvent?.(id)) {
        return true;
      }
      const have = _knownIds.has(id);
      _knownIds.add(id);
      return have;
    };

    // Use allSettled to connect to relays
    const allOpened = Promise.allSettled(
      groupedRequests.map(async ({ url, filters }, i) => {
        if (this.allowConnectingToRelay?.(url, ['read', filters]) === false) {
          failedRelays.push(url);
          throw new Error('connection skipped by allowConnectingToRelay');
        }

        let relay: AbstractRelay;
        try {
          relay = await this.ensureRelay(url, {
            connectionTimeout:
              this.maxWaitForConnection < (params.maxWait || 0)
                ? Math.max(params.maxWait! * 0.8, params.maxWait! - 1000)
                : this.maxWaitForConnection,
            abort: params.abort,
          });
        } catch (err) {
          this.onRelayConnectionFailure?.(url);
          failedRelays.push(url);
          throw err;
        }

        this.onRelayConnectionSuccess?.(url);
        successfulRelays.push(url);
        connectedIndexes.add(i);

        const subscription = relay.subscribe(filters, {
          ...params,
          oneose: () => handleEose(i),
          onclose: (reason: string) => {
            if (reason.startsWith('auth-required: ') && params.onauth) {
              relay
                .auth(params.onauth)
                .then(() => {
                  relay.subscribe(filters, {
                    ...params,
                    oneose: () => handleEose(i),
                    onclose: (reason: string) => {
                      handleClose(i, reason);
                    },
                    alreadyHaveEvent: localAlreadyHaveEventHandler,
                    eoseTimeout: params.maxWait,
                    abort: params.abort,
                  });
                })
                .catch((err: Error) => {
                  handleClose(i, `auth was required and attempted, but failed with: ${err}`);
                });
            } else {
              handleClose(i, reason);
            }
          },
          alreadyHaveEvent: localAlreadyHaveEventHandler,
          eoseTimeout: params.maxWait,
          abort: params.abort,
        });

        subs.push(subscription);
        return { relay, subscription, url };
      })
    )
      .then((results) => {
        // Check if we have enough successful connections
        const successCount = results.filter((r) => r.status === 'fulfilled').length;
        const totalRelays = groupedRequests.length;

        if (successCount > 0 && successCount < totalRelays) {
          // Partial success
          this.onPartialSuccess?.(successfulRelays, failedRelays);
        }

        if (successCount < this.minSuccessfulRelays) {
          const errorMsg = `Not enough relays connected: ${successCount}/${this.minSuccessfulRelays} required`;
          // Close any successful subscriptions
          subs.forEach((sub) => sub.close(errorMsg));
          // Trigger onclose with error
          params.onclose?.(failedRelays.map((url) => `${normalizeURL(url)}: connection failed`));
          // Don't throw - just signal failure through callbacks
          // The subscription will be empty but won't cause unhandled rejections
        }

        return results;
      })
      .catch(() => {
        // Swallow errors - they're already handled through callbacks
      });

    return {
      async close(reason?: string) {
        try {
          await allOpened;
        } catch {
          // Connection already failed, nothing to close
        }
        subs.forEach((sub) => {
          sub.close(reason);
        });
      },
    };
  }

  /**
   * Override publish to tolerate partial failures.
   * Returns promises that resolve if at least minSuccessfulRelays succeed.
   */
  publish(
    relays: string[],
    event: Event,
    params?: {
      onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
      maxWait?: number;
      abort?: AbortSignal;
    }
  ): Promise<string>[] {
    const normalizedUrls = [...new Set(relays.map(normalizeURL))];
    const publishPromises = normalizedUrls.map(async (url) => {
      if (this.allowConnectingToRelay?.(url, ['write', event]) === false) {
        throw new Error('connection skipped by allowConnectingToRelay');
      }

      let relay: AbstractRelay;
      try {
        relay = await this.ensureRelay(url, {
          connectionTimeout:
            this.maxWaitForConnection < (params?.maxWait || 0)
              ? Math.max(params!.maxWait! * 0.8, params!.maxWait! - 1000)
              : this.maxWaitForConnection,
          abort: params?.abort,
        });
      } catch (err) {
        this.onRelayConnectionFailure?.(url);
        throw new Error(`connection failure: ${String(err)}`, { cause: err });
      }

      return (relay as unknown as { publish: (event: Event) => Promise<string> })
        .publish(event)
        .catch(async (err: Error) => {
          if (err.message?.startsWith('auth-required: ') && params?.onauth) {
            await relay.auth(params.onauth);
            return (relay as unknown as { publish: (event: Event) => Promise<string> }).publish(
              event
            );
          }
          throw err;
        })
        .then((reason: string) => {
          if (this.trackRelays) {
            let set = this.seenOn.get(event.id);
            if (!set) {
              set = new Set();
              this.seenOn.set(event.id, set);
            }
            set.add(relay);
          }
          return reason;
        });
    });

    return publishPromises;
  }

  /**
   * Publish to relays and wait for at least minSuccessfulRelays to accept.
   * Returns successful relay URLs if enough succeeded, throws if not enough.
   */
  async publishResilient(
    relays: string[],
    event: Event,
    params?: {
      onauth?: (evt: EventTemplate) => Promise<VerifiedEvent>;
      maxWait?: number;
      abort?: AbortSignal;
    }
  ): Promise<{ successful: string[]; failed: Array<{ url: string; error: string }> }> {
    const normalizedUrls = [...new Set(relays.map(normalizeURL))];
    const results = await Promise.allSettled(this.publish(relays, event, params));

    const successful: string[] = [];
    const failed: Array<{ url: string; error: string }> = [];

    results.forEach((result, i) => {
      const url = normalizedUrls[i];
      if (result.status === 'fulfilled') {
        successful.push(url);
      } else {
        failed.push({ url, error: result.reason?.message || String(result.reason) });
      }
    });

    if (successful.length > 0 && failed.length > 0) {
      this.onPartialSuccess?.(
        successful,
        failed.map((f) => f.url)
      );
    }

    if (successful.length < this.minSuccessfulRelays) {
      throw new Error(
        `Not enough relays accepted the event: ${successful.length}/${this.minSuccessfulRelays} required`
      );
    }

    return { successful, failed };
  }
}

export default ResilientPool;
