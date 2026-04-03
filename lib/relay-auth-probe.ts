import { makeAuthEvent } from 'nostr-tools/nip42';
import { finalizeEvent } from 'nostr-tools/pure';
import { normalizeURL } from 'nostr-tools/utils';

export type RelayAuthProbeResult =
  | 'ok'
  | 'failed'
  | 'nip42_ok'
  | 'nip42_failed'
  | 'nip42_challenge_only';

const CONNECT_MS = 10_000;
const NO_AUTH_AFTER_OPEN_MS = 2_000;
const WAIT_OK_MS = 10_000;

export function canUseNip46SecretForRelayProbe(
  sessionRelays: string[],
  probeRelays: string[]
): boolean {
  if (!sessionRelays.length) return false;
  const allowed = new Set(sessionRelays.map((r) => normalizeURL(r)));
  return probeRelays.every((r) => allowed.has(normalizeURL(r)));
}

function connectWebSocket(url: string, timeoutMs: number): Promise<WebSocket | null> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (ws: WebSocket | null) => {
      if (finished) return;
      finished = true;
      resolve(ws);
    };
    try {
      const ws = new WebSocket(url);
      const t = setTimeout(() => {
        // Don't call ws.close() in CONNECTING state — it triggers
        // "WebSocket is closed before the connection is established" warnings.
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.close(1000, 'probe-timeout');
          } catch {
            /* ignore */
          }
        }
        finish(null);
      }, timeoutMs);
      ws.addEventListener(
        'open',
        () => {
          clearTimeout(t);
          finish(ws);
        },
        { once: true }
      );
      ws.addEventListener(
        'error',
        () => {
          clearTimeout(t);
          finish(null);
        },
        { once: true }
      );
      ws.addEventListener(
        'close',
        () => {
          clearTimeout(t);
          finish(null);
        },
        { once: true }
      );
    } catch {
      finish(null);
    }
  });
}

/**
 * Probe a relay for NIP-42: connect, wait for AUTH challenge, optionally sign + wait for OK.
 * Without a secret, a received challenge yields `nip42_challenge_only`.
 */
export async function probeRelayAuthStatus(
  relayUrl: string,
  clientSecret: Uint8Array | null
): Promise<RelayAuthProbeResult> {
  const normUrl = normalizeURL(relayUrl);
  const ws = await connectWebSocket(relayUrl, CONNECT_MS);
  if (!ws) return 'failed';

  return new Promise((resolve) => {
    let settled = false;
    let authInFlight = false;
    let okTimer: ReturnType<typeof setTimeout> | undefined;
    let onOkListener: ((e: MessageEvent) => void) | undefined;

    const cleanup = () => {
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', failFromSocket);
      ws.removeEventListener('close', onClose);
      if (onOkListener) ws.removeEventListener('message', onOkListener);
    };

    const done = (r: RelayAuthProbeResult) => {
      if (settled) return;
      settled = true;
      if (okTimer !== undefined) clearTimeout(okTimer);
      cleanup();
      try {
        if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'probe');
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const noAuthTimer = setTimeout(() => done('ok'), NO_AUTH_AFTER_OPEN_MS);

    const failFromSocket = () => {
      clearTimeout(noAuthTimer);
      done(authInFlight ? 'nip42_failed' : 'failed');
    };

    const onClose = () => {
      if (!settled) failFromSocket();
    };

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      let data: unknown;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!Array.isArray(data) || data.length < 2) return;

      if (data[0] === 'AUTH' && (typeof data[1] === 'string' || typeof data[1] === 'number')) {
        clearTimeout(noAuthTimer);
        ws.removeEventListener('message', onMessage);

        const challenge = String(data[1]);
        if (!clientSecret) {
          done('nip42_challenge_only');
          return;
        }

        let authId: string;
        try {
          const template = makeAuthEvent(normUrl, challenge);
          const signed = finalizeEvent(template, clientSecret);
          authId = signed.id;
          authInFlight = true;
          ws.send(JSON.stringify(['AUTH', signed]));
        } catch {
          done('nip42_failed');
          return;
        }

        okTimer = setTimeout(() => done('nip42_failed'), WAIT_OK_MS);
        onOkListener = (e: MessageEvent) => {
          if (typeof e.data !== 'string') return;
          let d: unknown;
          try {
            d = JSON.parse(e.data);
          } catch {
            return;
          }
          if (!Array.isArray(d) || d[0] !== 'OK' || d[1] !== authId) return;
          done(d[2] === true ? 'nip42_ok' : 'nip42_failed');
        };
        ws.addEventListener('message', onOkListener);
      }
    };

    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', failFromSocket);
    ws.addEventListener('close', onClose);
  });
}
