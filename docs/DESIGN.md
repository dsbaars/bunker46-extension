# Bunker46 Extension -- Design

## What this is

A **NIP-07 compliant** browser extension that exposes `window.nostr` to web pages. Instead of holding private keys locally, it proxies every signing request to a remote NIP-46 signer (such as Bunker46) over Nostr relays. Includes per-domain permission control similar to nos2x.

## NIP-07 provider (basis)

The extension implements the [NIP-07](https://nips.nostr.com/7) `window.nostr` API as the foundation:

- **Required:** `getPublicKey(): Promise<string>`, `signEvent(event): Promise<Event>` (event: `{ created_at, kind, tags, content }`; returns full event with `id`, `pubkey`, `sig`).
- **Optional:** `nip04.encrypt(pubkey, plaintext)`, `nip04.decrypt(pubkey, ciphertext)`, `nip44.encrypt`, `nip44.decrypt`.
- **Common extension:** `getRelays(): Promise<Record<string, { read: boolean, write: boolean }>>`.

The provider runs in the page (main) world. To avoid CSP blocking inline scripts, it is loaded from a **separate file** (`public/nostr-provider.js`) listed in `web_accessible_resources`. The content script runs at `document_start`, registers a listener for `nip07-request`, then injects `<script src="chrome-extension://.../nostr-provider.js">` so the provider executes in the page context and sets `window.nostr`. The content script bridges requests to the background via `chrome.runtime.sendMessage`; the background enforces permissions and forwards allowed requests to the NIP-46 signer. Input validation for `signEvent` is done both in the provider script and in the background.

## Project structure

```
bunker46-extension/
├── entrypoints/
│   ├── background.ts            # NIP-46 client, session, permissions, message handler
│   ├── content.ts               # Injects window.nostr bridge, intercepts nostrconnect links
│   ├── redirect/
│   │   ├── index.html           # "Opening in Bunker46…" stub
│   │   └── main.ts              # Reads ?uri=, gets bunker46BaseUrl, redirects to Bunker46
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── style.css            # Tailwind 4 + @theme (shadcn dark palette)
│   │   └── App.vue              # Popup root with Connection/Permissions tabs
│   └── prompt/
│       ├── index.html
│       ├── main.ts
│       ├── style.css            # Same dark theme
│       └── App.vue              # Permission approval popup (Allow/Deny)
├── components/
│   └── ui/                      # shadcn-style primitives (CVA + Reka UI patterns)
│       ├── Badge.vue
│       ├── Button.vue
│       ├── Card.vue / CardHeader / CardTitle / CardDescription / CardContent / CardFooter
│       ├── Input.vue
│       ├── Label.vue
│       └── Separator.vue
├── lib/
│   ├── utils.ts                 # cn() helper (clsx + tailwind-merge)
│   ├── hex.ts                   # bytesToHex / hexToBytes
│   ├── constants.ts             # DEFAULT_NOSTRCONNECT_RELAYS, NIP46_APP_NAME
│   ├── permissions.ts           # Domain permission storage and helpers
│   └── nip07/
│       └── types.ts             # NIP-07 event types and method names
├── env.d.ts
├── wxt.config.ts
└── package.json
```

## Connection flow

The extension connects to a remote NIP-46 signer using a single method:

**Bunker URI** -- Paste a `bunker://` URI from the remote signer into the extension popup. The background script uses `nostr-tools/nip46` `BunkerSigner.fromBunker()` to establish the connection over Nostr relays.

A "Get URI from Bunker46" button opens the configured Bunker46 instance's connections page in a new tab for convenience.

## Nostrconnect URI handling

Sites that use [NIP-46 Connect](https://github.com/nostr-protocol/nips/blob/master/46.md) (e.g. "Connect with Nostr") often navigate to a `nostrconnect://` URI. Browsers do not let extensions register as protocol handlers for custom schemes, so the extension cannot intercept programmatic navigation. It **can** intercept **link clicks** on `<a href="nostrconnect://...">`.

- **Content script:** Listens for clicks in the capture phase. If the click target is a link whose `href` starts with `nostrconnect:`, it prevents the default action and opens the extension redirect page with the full URI in the query:  
  `chrome.runtime.getURL('redirect.html') + '?uri=' + encodeURIComponent(nostrconnectUri)` (new tab).
- **Redirect page** (`redirect/index.html` + `main.ts`):
  - Reads `uri` (or `nostrconnect`) from the query.
  - Loads `bunker46BaseUrl` from `chrome.storage.local` (default `http://localhost:5173`).
  - Redirects the browser to `{bunker46BaseUrl}/connections?import={encodeURIComponent(uri)}`.

So when a user **clicks** a nostrconnect link, they are sent to Bunker46’s connections/import flow with the URI. Programmatic `window.location = "nostrconnect://..."` is not interceptable; the user can still use "Get URI from Bunker46" and complete the flow in Bunker46 if the app only triggers navigation.

## Domain permission system

When a website calls `window.nostr` methods, the extension checks per-domain permissions before forwarding the request to the remote signer.

### Permission flow

1. Content script injects `window.nostr` bridge into every page
2. Web page calls a NIP-07 method (e.g., `signEvent`)
3. Content script forwards the request to the background service worker
4. Background extracts the hostname from `sender.url`
5. Background checks stored permissions via `checkPermission(host, method)`
6. If no policy exists: opens a prompt window via `chrome.windows.create`
7. User decides: Allow Always, Allow Once, Deny, or Deny Always
8. "Always" decisions are persisted to `chrome.storage.local`
9. The original request is resolved or rejected based on the decision

### Permission storage

Stored in `chrome.storage.local` under the `domain_policies` key:

```
{
  "example.com": {
    "getPublicKey": { "decision": "allow", "created_at": 1708000000000 },
    "signEvent": { "decision": "deny", "created_at": 1708000000000 }
  }
}
```

### Prompt window

A 400x380px popup window centered on the last focused browser window. Shows:

- Shield icon + "Permission Request" heading
- The requesting domain prominently displayed
- The requested method (and event kind for signEvent)
- Four decision buttons: Allow Always, Allow Once, Deny, Deny Always
- Closing the window without a decision = deny once

### Permission management

The popup has a "Permissions" tab showing all stored domain policies. Users can:

- See which domains have which permissions
- Revoke individual method permissions per domain
- Revoke all permissions for a domain

## UI design

### Theme

Dark-only, using oklch color space for perceptual consistency. Tokens defined in
Tailwind 4 `@theme` and used as direct utility classes (`bg-primary`, `text-muted-foreground`, etc.).

### Popup layout

**Header** (always visible):

- App icon (Shield in primary/15 background) + "Bunker46" / "NIP-07 Remote Signer"
- Connection badge: green "Connected" or neutral "Offline"

**Tab bar** -- two tabs:

- **Connection** -- connect/disconnect flow
- **Permissions** -- domain permission management

**Connection tab -- Disconnected state**:

- Single card with bunker:// URI paste input + Connect button
- "Get URI from Bunker46" button opens the configured Bunker46 instance
- Collapsible settings in footer for configuring the Bunker46 base URL

**Connection tab -- Connected state**:

- Signer pubkey card (truncated, click to copy, monospace)
- Security note about NIP-46 proxying
- Disconnect button

**Permissions tab**:

- Empty state with ShieldCheck icon when no permissions exist
- Domain cards with method badges (Allowed/Denied) and revoke buttons

**Error banner** -- shown between tabs and content when any operation fails.

### Component library

All under `components/ui/`, following shadcn-vue conventions:

- **Button** -- CVA variants: default, destructive, outline, secondary, ghost, link.
  Sizes: default, sm, lg, icon.
- **Card** -- Composable: Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter.
- **Input** -- v-model support, focus ring, monospace option via class.
- **Badge** -- Variants: default, secondary, outline, success, destructive.
- **Separator** -- Horizontal/vertical + optional label (e.g., "or" divider).
- **Label** -- Accessible label.

### Icons

Lucide icons: Shield, ShieldAlert, ShieldCheck, Link2, Unplug, Settings2, Loader2,
KeyRound, Globe, FileSignature, Trash2, ExternalLink, ChevronDown, ChevronUp.
