/**
 * NIP-07 window.nostr provider — runs in page (main) context.
 * Sends requests via custom event (nip07-request). Receives responses via postMessage
 * so Firefox can read the payload (CustomEvent.detail from extension is not readable in FF).
 * @see https://nips.nostr.com/7
 */
(function () {
  var EVENT_REQ = 'nip07-request';
  var RESPONSE_TYPE = 'nip07-response';
  var TIMEOUT_MS = 60000;

  function send(method, params) {
    return new Promise(function (resolve, reject) {
      var id = Math.random().toString(36).slice(2) + Date.now();
      function onMessage(e) {
        if (e.source !== window || e.data?.type !== RESPONSE_TYPE) return;
        var p = e.data.payload;
        if (!p || p.id !== id) return;
        window.removeEventListener('message', onMessage);
        if (p.error) reject(new Error(p.error));
        else resolve(p.result);
      }
      window.addEventListener('message', onMessage);
      document.dispatchEvent(
        new CustomEvent(EVENT_REQ, {
          detail: { id: id, method: method, params: params || [] },
        })
      );
      setTimeout(function () {
        window.removeEventListener('message', onMessage);
        reject(new Error('NIP-07 request timeout'));
      }, TIMEOUT_MS);
    });
  }

  function checkEvent(event) {
    if (!event || typeof event !== 'object') return 'Event must be an object';
    if (typeof event.kind !== 'number') return 'Event must have kind (number)';
    if (typeof event.content !== 'string') return 'Event must have content (string)';
    if (!Array.isArray(event.tags)) return 'Event must have tags (array of string arrays)';
    if (typeof event.created_at !== 'number') return 'Event must have created_at (number)';
    return null;
  }

  window.nostr = {
    getPublicKey: function () {
      return send('getPublicKey', []);
    },
    signEvent: function (event) {
      var err = checkEvent(event);
      if (err) return Promise.reject(new Error(err));
      return send('signEvent', [event]);
    },
    getRelays: function () {
      return send('getRelays', []);
    },
    nip04: {
      encrypt: function (pubkey, plaintext) {
        return send('nip04_encrypt', [pubkey, plaintext]);
      },
      decrypt: function (pubkey, ciphertext) {
        return send('nip04_decrypt', [pubkey, ciphertext]);
      },
    },
    nip44: {
      encrypt: function (pubkey, plaintext) {
        return send('nip44_encrypt', [pubkey, plaintext]);
      },
      decrypt: function (pubkey, ciphertext) {
        return send('nip44_decrypt', [pubkey, ciphertext]);
      },
    },
  };
})();
