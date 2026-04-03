/**
 * Relay row UI statuses (connectivity + optional NIP-42 probe outcome).
 */

export type RelayUiProbeStatus =
  | 'connecting'
  | 'nip42_pending'
  | 'ok'
  | 'failed'
  | 'nip42_ok'
  | 'nip42_failed'
  | 'nip42_challenge_only';

export const RELAY_PROBE_TIMEOUT_MS = 5_000;
export const RELAY_PROBE_NIP42_WINDOW_MS = 600;

export function messageLooksLikeNip42AuthChallenge(data: string): boolean {
  try {
    const parsed = JSON.parse(data) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed[0] === 'AUTH' &&
      (typeof parsed[1] === 'string' || typeof parsed[1] === 'number')
    );
  } catch {
    return false;
  }
}

/**
 * Fallback when the background probe is unavailable: raw WebSocket reachability only.
 * If an AUTH frame appears without signing, reports `nip42_challenge_only`.
 */
export function runRelayUiProbes(
  relays: string[],
  onStatus: (url: string, status: RelayUiProbeStatus) => void
): void {
  if (!relays.length) return;

  for (const url of relays) {
    onStatus(url, 'connecting');
    try {
      const ws = new WebSocket(url);
      let opened = false;
      let sawAuth = false;
      let finished = false;
      let nip42Timer: ReturnType<typeof setTimeout> | undefined;

      const onMessage = (ev: MessageEvent) => {
        if (typeof ev.data === 'string' && messageLooksLikeNip42AuthChallenge(ev.data)) {
          sawAuth = true;
          onStatus(url, 'nip42_challenge_only');
        }
      };

      const onError = () => {
        clearTimeout(timer);
        finalize('failed');
      };
      const onClose = () => {
        clearTimeout(timer);
        if (!opened) finalize('failed');
      };
      const onOpen = () => {
        opened = true;
        clearTimeout(timer);
        nip42Timer = setTimeout(
          () => finalize(sawAuth ? 'nip42_challenge_only' : 'ok'),
          RELAY_PROBE_NIP42_WINDOW_MS
        );
      };

      const cleanup = () => {
        ws.removeEventListener('message', onMessage);
        ws.removeEventListener('error', onError);
        ws.removeEventListener('close', onClose);
        ws.removeEventListener('open', onOpen);
      };

      const finalize = (status: RelayUiProbeStatus) => {
        if (finished) return;
        if (status !== 'ok' && status !== 'nip42_challenge_only' && status !== 'failed') return;
        finished = true;
        if (nip42Timer !== undefined) clearTimeout(nip42Timer);
        cleanup();
        onStatus(url, status);
        try {
          if (ws.readyState === WebSocket.OPEN) ws.close(1000, 'probe');
        } catch {
          /* ignore */
        }
      };

      const timer = setTimeout(() => {
        finalize(opened ? 'ok' : 'failed');
      }, RELAY_PROBE_TIMEOUT_MS);

      ws.addEventListener('message', onMessage);
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
    } catch {
      onStatus(url, 'failed');
    }
  }
}
