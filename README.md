# Bunker46 Extension

A **NIP-07 compliant** browser extension that exposes `window.nostr` to web pages. Instead of storing private keys in the browser, it forwards every signing request to a remote [NIP-46](https://nips.nostr.com/46) signer (such as [Bunker46](https://github.com/paulmillr/bunker46)) over Nostr relays.

## What it does

- **NIP-07 provider** — Injects `window.nostr` (getPublicKey, signEvent, getRelays, nip04/nip44) so Nostr apps can request signatures without holding keys locally.
- **Remote signer** — You connect once with a `bunker://` URI from your Bunker46 (or other NIP-46) instance; the extension keeps a session and proxies all allowed requests to it.
- **Per-domain permissions** — Each site must be allowed (once or always) before it can use your Nostr identity; you can revoke domains or individual methods from the popup.
- **nostrconnect:// links** — Clicking nostrconnect links opens your configured Bunker46 instance so you can add or manage connections there.
- **Chrome & Firefox** — Built with [WXT](https://wxt.dev); Chrome and Firefox (MV3) builds are supported.

## Development

```bash
pnpm install
pnpm run dev          # Chrome
pnpm run dev:firefox  # Firefox (MV3)
```

## Build

```bash
pnpm run build         # .output/chrome-mv3/
pnpm run build:firefox # .output/firefox-mv3/
pnpm run zip           # Pack Chrome build
pnpm run zip:firefox   # Pack Firefox build
```

Load the relevant `.output/<target>/` directory (or the zip) as an unpacked extension in Chrome or Firefox.

## Project layout

- `entrypoints/` — Background script, content script (NIP-07 bridge + nostrconnect), popup, permission prompt, redirect page.
- `public/` — Injected NIP-07 provider script and extension icons.
- `lib/` — Permissions storage, NIP-07 types, hex helpers.
- `components/ui/` — Vue UI components (shadcn-style).
- `docs/DESIGN.md` — Design and behaviour details.

## License

MIT — see [LICENSE](LICENSE).
