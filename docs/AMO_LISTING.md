# Mozilla Add-ons (AMO) listing copy

Use these in the [AMO Developer Hub](https://addons.mozilla.org/developers/) when submitting or editing the Bunker46 extension.

---

## Summary (250 characters max)

**Suggested summary:**

Use Nostr apps in Firefox without storing your keys in the browser. Bunker46 Extension connects to your remote Nostr signer (Bunker46 or any NIP-46 server) and lets sites use your identity only when you allow them—with per-site permissions you control.

_(~180 characters)_

**Shorter option (~130 chars):**

Use Nostr apps without keeping keys in the browser. Connect to a remote signer (Bunker46/NIP-46); the extension proxies signing and asks you per site.

---

## Description

Use this in the "Description" field. AMO supports basic HTML.

```html
<p>
  Bunker46 Extension lets you use Nostr-enabled websites without storing your private keys in the
  browser. Your keys stay on your own Nostr signer (such as
  <a href="https://github.com/dsbaars/bunker46">Bunker46</a> or any
  <a href="https://nips.be/46">NIP-46</a> server); the extension only forwards signing requests when
  you approve them.
</p>

<h3>What it does</h3>
<ul>
  <li>
    <strong>NIP-07 provider</strong> — Exposes <code>window.nostr</code> (getPublicKey, signEvent,
    getRelays, nip04/nip44) so Nostr apps can request signatures without holding keys locally.
  </li>
  <li>
    <strong>Remote signer</strong> — Connect with a bunker URI or via nostrconnect (QR + copyable
    URI for your bunker app to scan). Session is saved so you stay connected after restart.
  </li>
  <li>
    <strong>Per-domain permissions</strong> — Each site must be allowed (once or always) before it
    can use your Nostr identity. Revoke domains or individual methods from the Permissions tab.
  </li>
  <li>
    <strong>Privacy mode</strong> — When enabled in Settings, <code>window.nostr</code> is only
    exposed on domains you add to a whitelist, reducing fingerprinting. Manage the whitelist in
    Permissions.
  </li>
  <li>
    <strong>Extension icon badge</strong> — Optional in Settings: show how many permissions the
    current tab has on the extension icon.
  </li>
  <li>
    <strong>Full logout</strong> — Disconnect asks for confirmation, then clears the session, all
    permissions, and the privacy whitelist in one step.
  </li>
  <li>
    <strong>nostrconnect links</strong> — Clicking nostrconnect links opens your configured Bunker46
    instance so you can add or manage connections there.
  </li>
</ul>

<h3>Privacy &amp; security</h3>
<p>
  Private keys never leave your signer. The extension only stores your session and per-site
  permission choices locally. It does not collect or transmit personal data.
</p>

<p>
  Requires a Nostr signer that supports NIP-46 (e.g. Bunker46). Open source —
  <a href="https://github.com/dsbaars/bunker46-extension">GitHub</a>.
</p>
```

---

## Plain-text description (if HTML is not accepted)

If the submission form expects plain text only:

```
Bunker46 Extension lets you use Nostr-enabled websites without storing your private keys in the browser. Your keys stay on your own Nostr signer (such as Bunker46 or any NIP-46 server); the extension only forwards signing requests when you approve them.

What it does:
• NIP-07 provider — Exposes window.nostr (getPublicKey, signEvent, getRelays, nip04/nip44) so Nostr apps can request signatures without holding keys locally.
• Remote signer — Connect with a bunker URI or via nostrconnect (QR + copyable URI for your bunker app to scan). Session is saved so you stay connected after restart.
• Per-domain permissions — Each site must be allowed (once or always) before it can use your Nostr identity. Revoke domains or individual methods from the Permissions tab.
• Privacy mode — When enabled in Settings, window.nostr is only exposed on domains you add to a whitelist, reducing fingerprinting. Manage the whitelist in Permissions.
• Extension icon badge — Optional in Settings: show how many permissions the current tab has on the extension icon.
• Full logout — Disconnect asks for confirmation, then clears the session, all permissions, and the privacy whitelist in one step.
• nostrconnect links — Clicking nostrconnect links opens your configured Bunker46 instance so you can add or manage connections there.

Privacy & security: Private keys never leave your signer. The extension only stores your session and per-site permission choices locally. It does not collect or transmit personal data.

Requires a Nostr signer that supports NIP-46 (e.g. Bunker46). Open source: https://github.com/dsbaars/bunker46-extension
```
