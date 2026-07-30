# Bunker46 Extension — Security Assessment

**Assessor:** Shannon (autonomous AI pentesting agent)
**Scope:** TypeScript WXT browser extension codebase
**Method:** Static analysis + attack-surface mapping; no live exploitation.

**Originally assessed at:** `dce17d6`
**Last verified against:** `61b1957`

> **How to read this document.** Sections 1–2 describe the extension as it stands. Section 3 lists
> the findings that are still open; section 4 records what was reviewed and found clean, so a later
> round does not repeat the work. Resolved findings have been removed and the remaining ones
> renumbered, so finding IDs do not carry across revisions of this document.
>
> Two review rounds have been done: the original pass at `dce17d6`, and a second covering the
> surface added since (multi-profile, prompt grouping, NIP-42 relay authentication, per-kind
> `signEvent` permissions, kind-0 metadata fetching, the options page).
>
> When changing security-relevant code, update this file and bump "Last verified against".

---

## Step 1: Extension Architecture Analysis

### 1.1 Configuration and Manifest

**`wxt.config.ts`:**

- **Permissions:** `['storage', 'tabs']` on Firefox, `['storage', 'tabs', 'windows']` elsewhere
  ([wxt.config.ts:22](../wxt.config.ts#L22)). `windows` backs the permission prompt popup
  (`chrome.windows.create` / `getLastFocused` / `onRemoved`). No `host_permissions` in config;
  WXT derives host access from content script `matches` in MV3.
- **Web-accessible resources:** `nostr-provider.js` with `matches: ['<all_urls>']` — any page can
  load this script (by design for NIP-07).
- **CSP:** No custom `content_security_policy` in config; default WXT/Vite CSP applies.
- **Dev:** Dev server on port 3456; Firefox `browser_specific_settings` with `@bunker46-extension`
  and `data_collection_permissions: required: ['none']`.

**Effective manifest (WXT-generated):**

- Content script from `entrypoints/content.ts` has `matches: ['<all_urls>']`, so the extension
  effectively has broad host access (and in MV3 often gets implicit host permission for those
  matches).
- No `executeScript`/`scripting` permission — no dynamic script injection from background.
- No `externally_connectable` — web pages cannot `sendMessage` to the background directly; all
  page-originated messages go through the content script.

### 1.2 Entrypoints Map

| Entrypoint     | Path                           | Role                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background     | `entrypoints/background.ts`    | Service worker: profiles, session, NIP-46 signer, permission queue, permission checks, badge, relay probing, message router. `defineBackground()` runs `migrateToProfiles()` + session load/reconnect; `chrome.runtime.onMessage.addListener` registered at top level.    |
| Content script | `entrypoints/content.ts`       | `defineContentScript({ matches: ['<all_urls>'], runAt: 'document_start' })`. Asks background whether to inject (`SHOULD_INJECT_NOSTR`), injects `nostr-provider.js` via `<script src="...">`, bridges `nip07-request` to background, handles `nostrconnect:` link clicks. |
| Popup UI       | `entrypoints/popup/`           | Vue 3 SPA: connection, profiles, permissions, relay settings; reads/writes `chrome.storage.local` and sends many message types to background.                                                                                                                             |
| Options page   | `entrypoints/options/`         | Full-tab mount of the popup's `App.vue` ("maximize"). Same trust level as the popup — an extension page, covered by `isExtensionPage`.                                                                                                                                    |
| Prompt UI      | `entrypoints/prompt/`          | Vue 3: permission prompt for a _group_ of concurrent requests; reads `groupKey`/`host`/`method` from URL (set by background), sends `GET_PERMISSION_GROUP` and `PERMISSION_RESPONSE`. The group is frozen when the window opens, so the prompt never receives updates.    |
| Redirect       | `entrypoints/redirect/main.ts` | Extension page: reads `?uri=` (or `?nostrconnect=`), requires `useBunker46 === true`, loads `bunker46BaseUrl` from storage, redirects to `{baseUrl}/connections?import={uri}`.                                                                                            |

**Unlisted / lib:**

- `lib/profiles.ts` — multi-profile store: per-profile NIP-46 client secret and session, plus the
  one-time `migrateToProfiles()` from the old single-session keys. **Holds the extension's secrets.**
- `lib/permissions.ts` — per-profile domain policies, including per-kind `signEvent:<kind>` scopes.
- `lib/permission-queue.ts` — groups concurrent permission requests into one prompt; owns the
  prompt queue and request IDs.
- `lib/privacy-mode.ts` — privacy mode flag and per-profile injection whitelist.
- `lib/nip42-pool.ts`, `lib/resilient-pool.ts` — relay pool that answers NIP-42 `AUTH` challenges by
  signing with the NIP-46 client secret, restricted to an explicit list of authorized relays.
- `lib/relay-auth-probe.ts`, `lib/relay-auth-probe-cache.ts`, `lib/relay-ui-probe.ts` — relay
  reachability / NIP-42 capability probing, plus its cache.
- `lib/nostrconnect.ts` — validator for `nostrconnect:` URIs arriving from a web page.
- `lib/domains.ts` — domain list helpers for the popup's permissions tab (dedupe, filter, pin).
  Display-only; not on the permission-decision path.
- `lib/constants.ts` — default and fallback relay lists.
- `lib/hex.ts`, `lib/utils.ts`, `lib/i18n.ts`, `lib/json-highlight.ts` — helpers. `json-highlight.ts`
  tokenizes raw events for display; it emits tokens, not HTML.
- `lib/nip07/types.ts` — NIP-07 types and the `NIP07_METHODS` allowlist used by `lib/permissions.ts`.
- `public/nostr-provider.js` — plain JS, runs in **page (main) world**; communicates with content
  script via `CustomEvent` and `window.postMessage`.
- `components/ui/` — shared Vue components, incl. `ProfileAvatar.vue` (renders the remote `picture`
  URL from kind-0 metadata).

### 1.3 WXT-Specific Patterns

- **`defineContentScript()`:** Single content script with `matches: ['<all_urls>']`,
  `runAt: 'document_start'`, `main(ctx)` with `ctx.isValid` check after async. Injection is gated
  per-host by `SHOULD_INJECT_NOSTR` → `shouldExposeNostrForHost()`
  ([content.ts:33](../entrypoints/content.ts#L33), [privacy-mode.ts:60](../lib/privacy-mode.ts#L60)).
- **`defineBackground()`:** Used for startup (migration, load profile, reconnect); message handling
  is in a top-level `chrome.runtime.onMessage.addListener` (works correctly with WXT).
- **`browser.*` / `chrome.*`:** Code uses `chrome.*` consistently; no `browser.*` polyfill needed.
- **Storage:** All persistence via `chrome.storage.local` (no sync). Current keys:
  - `profiles` — map of profiles, each with `clientSecretHex` and optional `session`
    (`signerPubkey`, `relays`, and a `bunkerUri` stored without its one-time `secret`)
  - `activeProfileId`
  - `domain_policies_<profileId>` — permissions, per profile
  - `privacyModeWhitelist_<profileId>` — injection whitelist, per profile
  - `privacyMode`, `showNostrBadge`, `nostrConnectRelays`, `useBunker46`, `bunker46BaseUrl`,
    `multiProfileEnabled`, `specifyNostrConnectRelays`
  - **Legacy** (migrated away and deleted by `migrateToProfiles()`): `nip46_session`,
    `nip46_client_secret_hex`, `domain_policies`, `privacyModeWhitelist`
    ([profiles.ts:36-39](../lib/profiles.ts#L36-L39), [profiles.ts:139-144](../lib/profiles.ts#L139-L144))
- **No `@` path leakage:** Imports use `@/lib/...`; build resolves to extension paths; no
  user-controlled path resolution.

### 1.4 TypeScript and Message Passing

- **env.d.ts:** Declares `chrome` with `runtime.sendMessage/getURL/id`, `storage.local`, `windows`,
  `tabs` (partial). No strict typing for message payloads.
- **Background listener:** `msg` typed as an object with optional `type`, `uri`, `method`, `params`,
  `host`, `approved`, `decision`, `enabled`, `profileId`, `asNewProfile`, `name`, `relays`.
- **Sender gating:** `PRIVILEGED_MESSAGE_TYPES` is an explicit allowlist of 20 types that may only
  come from extension pages; `GET_PERMISSION_GROUP` and `PERMISSION_RESPONSE` are further restricted
  to the prompt page ([background.ts:871-913](../entrypoints/background.ts#L871-L913)). The content
  script may therefore only send `SHOULD_INJECT_NOSTR`, `OPEN_NOSTRCONNECT_URI`, and the NIP-07
  method types. Unknown types fall through to `{ error: 'Unknown message type' }`.
- **Payload validation:** Per-field, not schema-based. `validateSignEventInput()` for `signEvent`
  ([background.ts:75](../entrypoints/background.ts#L75)), run before the permission decision;
  `validateNip04Nip44Params()` enforces two string arguments on all four NIP-04/NIP-44 branches
  ([background.ts:915](../entrypoints/background.ts#L915)); `isValidNostrConnectUri()` for
  page-supplied `nostrconnect:` URIs.

---

## Step 2: Extension-Specific Attack Surface Mapping

### 2.1 Manifest & Permissions

| Issue                    | Finding                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad permissions        | `storage` + `tabs` (+ `windows` off Firefox) plus content script on `<all_urls>` gives the extension access to all hosts for messaging and tab listing.                                |
| Unused permissions       | All three are used (`storage` throughout, `tabs` for query/create/badge/getLastFocused, `windows` for the prompt window). No obvious unused permission.                                |
| Host granularity         | No explicit `host_permissions` in config; content script `matches` drive scope. Narrowing would require restricting `matches` (and possibly breaking NIP-07 on arbitrary Nostr sites). |
| Web-accessible resources | `nostr-provider.js` with `<all_urls>` is intentional so any site can get `window.nostr`; increases surface (any page can trigger NIP-07 flows).                                        |

### 2.2 Content Scripts

| Issue             | Finding                                                                                                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOM XSS           | No `innerHTML`, `document.write`, or `eval()` in content script or provider; safe DOM usage (e.g. `document.createElement`, `appendChild`).                                                                                              |
| URL matching      | `matches: ['<all_urls>']` — script runs on every page, but provider injection is gated per-host by `SHOULD_INJECT_NOSTR` (privacy mode / whitelist).                                                                                     |
| Message passing   | Content script only sends `SHOULD_INJECT_NOSTR`, `OPEN_NOSTRCONNECT_URI`, and NIP-07 method types. It cannot send privileged types — they are rejected by sender gating in the background. Origin for NIP-07 is taken from `sender.url`. |
| Dynamic injection | Provider injected via `script.src = chrome.runtime.getURL('nostr-provider.js')`; URL is extension-controlled, not page-controlled.                                                                                                       |
| User gestures     | The `nostrconnect:` link handler requires `e.isTrusted`, so a page cannot trigger the handoff with a synthetic click.                                                                                                                    |
| postMessage       | Content script uses `window.postMessage({ type: 'nip07-response', payload }, '*')`; any page can listen; payload is the response for the page's own request (by design).                                                                 |

### 2.3 Background / Service Worker

| Issue            | Finding                                                                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message listener | Single listener handles all types, with a two-tier sender gate: `PRIVILEGED_MESSAGE_TYPES` requires an extension page (`sender.url.startsWith(chrome.runtime.getURL(''))`), and `GET_PERMISSION_GROUP` / `PERMISSION_RESPONSE` additionally require `prompt.html`. Residual risk is XSS in an extension page. |
| Non-gated types  | Only `SHOULD_INJECT_NOSTR`, `OPEN_NOSTRCONNECT_URI` and the NIP-07 method types sit outside the privileged set — the ones the content script legitimately needs. `OPEN_NOSTRCONNECT_URI` validates its URI before acting.                                                                                     |
| Storage          | The only secret at rest is the per-profile `clientSecretHex` in `chrome.storage.local` under `profiles`; the bunker URI's one-time `secret` is stripped before storing. Unencrypted, so readable by anything with profile-directory access. See finding 1.                                                    |
| Network          | Outbound WebSockets to session relays, hardcoded kind-0 relays (`wss://purplepag.es`, `wss://relay.primal.net`, `wss://relay.damus.io`), NIP-65 relay lists, and probe targets. Only session relays ever receive a NIP-42 signature. Outbound HTTP for remote avatar images — see finding 3.                  |
| Alarms/timers    | No `chrome.alarms` or timer-based C2; NIP-46 uses WebSocket/pool from nostr-tools.                                                                                                                                                                                                                            |
| Native messaging | Not used.                                                                                                                                                                                                                                                                                                     |

**PERMISSION_RESPONSE:** the prompt page is the only allowed sender, and the permission group is
derived from the prompt window's own URL (`promptGroupKeyFromSender`,
[background.ts:906](../entrypoints/background.ts#L906)), not from the message body.
`GET_PERMISSION_GROUP` works the same way and takes no identifier from the message, so there is no
guessable id to forge. The decision applies only to the request IDs the prompt reports as approved.

### 2.4 WXT-Specific

| Issue             | Finding                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `browser.*` usage | All usage is inside extension scripts; no unsafe top-level or cross-context use. |
| CSP in config     | No CSP override in `wxt.config.ts` that would weaken defaults.                   |
| `@` alias         | Used only for imports; no user input in path resolution.                         |
| WAR               | Only `nostr-provider.js`; necessary for NIP-07.                                  |

### 2.5 TypeScript / Data Handling

| Issue                     | Finding                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `any` in message handlers | Message payload typed with optional fields; no `any` on the main handler; `params` is `unknown[]`.                                                                                                                                                                                                                                      |
| Unsafe casts              | Storage reads use `raw[key] as T` without validation (e.g. `getProfiles()` casts to `ProfilesMap`). Corrupted or attacker-written storage is trusted.                                                                                                                                                                                   |
| Storage schema            | Policies, whitelist and profiles are plain objects with no schema validation, but host/method keys are guarded: `RESERVED_KEYS` rejects `__proto__`/`constructor`/`prototype`, `isSafeHost()` rejects junk, and methods must be in `NIP07_METHODS` or match `signEvent:<digits>` ([permissions.ts:4-49](../lib/permissions.ts#L4-L49)). |
| signEvent validation      | `validateSignEventInput()` requires an integer `kind >= 0`, a string `content`, an array `tags` and a numeric `created_at`. It does **not** validate that `tags` elements are `string[]` — see finding 5.                                                                                                                               |

### 2.6 Redirect Page

- **Input:** `uri` (or `nostrconnect`) from `window.location.search`.
- **Flow:** require `useBunker46 === true` → load `bunker46BaseUrl` from storage → redirect to
  `{baseUrl}/connections?import={encodeURIComponent(uri)}`
  ([redirect/main.ts:17-34](../entrypoints/redirect/main.ts#L17-L34)).
- **Risk:** the `uri` is not checked to be a `nostrconnect:`/`bunker://` URI — see finding 4. The
  `OPEN_NOSTRCONNECT_URI` path in the background does validate; this page does not.

---

## Step 3: Open findings

Renumbered when the resolved findings were removed, so these IDs do not match earlier revisions of
this document.

| #   | Vulnerability                                 | Location                                   | Attack vector                                                                                                                                                                          | Severity                                                                         | Fix                                                                                                                         |
| --- | --------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Client secret stored unencrypted              | `lib/profiles.ts` (`profiles` key)         | Filesystem access to the browser profile (malware running as the user, an unlocked stolen machine, an unencrypted backup) yields each profile's `clientSecretHex`                      | Medium (bearer credential; see §3.1)                                             | Optional passphrase lock is the only real defence — see §3.1 for why encryption without a user secret does not help         |
| 2   | Broad `<all_urls>` content script             | `content.ts` + manifest                    | Content script runs on every page; any site can trigger NIP-07 and permission prompts                                                                                                  | Medium (intended for NIP-07; maximizes prompt fatigue and phishing surface)      | Partially mitigated by the privacy-mode injection gate; consider making the whitelist the default posture                   |
| 3   | Remote avatar loaded in extension pages       | `ProfileAvatar.vue:40-46`, `background.ts` | `picture` from kind-0 is bound to `<img :src>`; default MV3 CSP constrains only `script-src`/`object-src`, so a request leaves on every popup open, leaking IP + UA + a per-victim URL | Low (attacker must control the connected pubkey's kind-0)                        | Add `content_security_policy.extension_pages` with `img-src 'self' data:;`; inline avatars as data URIs if wanted           |
| 4   | Redirect passes user-controlled uri to bunker | `entrypoints/redirect/main.ts`             | User opens `redirect.html?uri=https://evil.com` → bunker gets `import=https://evil.com`; open redirect depends on bunker app                                                           | Low (bunker app responsibility; gated on `useBunker46`, page not web-accessible) | Reuse `isValidNostrConnectUri()` from `lib/nostrconnect.ts` before redirecting; document that bunker must validate `import` |
| 5   | signEvent tags not strictly validated         | `background.ts` (`validateSignEventInput`) | `tags` only checked as Array; elements not enforced as `string[][]`                                                                                                                    | Low (robustness)                                                                 | Validate each tag is an array of strings before sending to the signer                                                       |

### 3.1 Finding 1 — what the stored secret is actually worth

The extension never holds the user's identity key. That key lives in the remote bunker; this is the
point of the bunker + extension split. What is stored is `clientSecretHex`, the per-profile NIP-46
_client_ keypair — an authorization, not an identity.

That does not make it harmless. Combined with `signerPubkey` and `relays` (both non-secret), it is a
**bearer credential**: whoever holds it can connect to the bunker as the authorized client and
request signatures under the user's real pubkey, up to whatever the bunker's policy allows. What
differs from a stolen `nsec` is the recovery path, not the immediate blast radius:

|                    | `nsec` held by the extension                 | client secret + bunker                                 |
| ------------------ | -------------------------------------------- | ------------------------------------------------------ |
| Revocable          | No — the identity is permanently compromised | Yes, revoke the connection in the bunker               |
| Constrainable      | No                                           | Yes, the bunker can enforce per-method/per-kind policy |
| Observable         | No                                           | Yes, the bunker sees every request                     |
| Reusable elsewhere | Yes, importable into any client              | No                                                     |

Hence Medium rather than High, and materially better than extensions that keep the `nsec` itself.

**What has been done.** The bunker URI's `secret` is a one-time connect token: the bunker authorizes
the client pubkey on first connect and `reconnectFromSession()` never sends it again. It is now
stripped before the session is stored (`stripBunkerUriSecret`), and a startup sweep
(`stripStoredBunkerSecrets`) cleans up installs that predate this. Zero UX cost, one fewer secret at
rest.

**Why encryption at rest does not fix the rest.** The service worker must reconnect unattended, so
any key it can derive without the user is equally derivable by an attacker with the same file
access. Two consequences:

- Wrapping the secret with a non-extractable WebCrypto key in IndexedDB raises the bar against
  "grep the LevelDB for 64 hex characters" and casual exposure through backups, but Chrome's own key
  material is recoverable with OS-user access. Obfuscation-grade; it would overstate the protection
  in this document.
- The client key **cannot** be a non-extractable `CryptoKey` in its own right: WebCrypto has no
  secp256k1, so the raw bytes must exist in JS memory. Any "hardware-bound key" plan is off the
  table.

**The one option that works** is an optional passphrase lock: derive a key with PBKDF2/Argon2 from a
user passphrase, encrypt `clientSecretHex`, and keep the extension locked until unlocked — NIP-07
requests fail with an "unlock" error until then. It genuinely defends against profile-directory
theft, at the cost of unattended reconnect. Opt-in, so the trade-off is the user's.

Absent that, this is an accepted risk and should be stated in user-facing docs, along with the fact
that the extension contacts three hardcoded relays for profile metadata.

### 3.2 Finding 4 — reproduction

```
chrome-extension://<id>/redirect.html?uri=https://evil.com/phishing
```

`redirect.html` is not in `web_accessible_resources`, so a web page can neither navigate to it nor
frame it; the user has to open the URL themselves.

---

## Step 4: Areas reviewed and found clean

Recorded so a later round does not repeat the work.

- **Sender gating.** All 20 privileged types are gated; `isExtensionPage` covers `options.html` too.
  The only ungated types are the three the content script needs.
- **Group keys.** `groupKeyFor` includes the profile id and the host, and hostnames cannot contain
  `|`, so neither two origins nor two profiles can ever share a prompt group.
- **Per-kind permissions.** `methodKey` is the single source of truth for both the group key and the
  storage key, so check and store cannot diverge; `isSafeMethodKey` enforces `/^\d+$/` on the kind
  part. No kind-X-via-kind-Y bypass exists.
- **Prompt group lifetime.** The group is frozen when its prompt opens, so it cannot grow under the
  user's cursor; the decision applies only to the request IDs the prompt reports as approved, and
  anything else fails closed. `handleWindowClosed` denies the whole group; a late `onRemoved` after
  `resolve()` is a no-op. Only one prompt is on screen at a time.
- **NIP-42 signing.** `Nip42ResilientPool` signs AUTH only for relays passed as authorized, and the
  reactive `auth-required:` signer is offered only when every relay in a call is authorized. A
  hostile relay cannot obtain a signature over chosen content in any case: `makeAuthEvent` fixes
  `kind: 22242` and `content: ""`, and only the challenge tag value is attacker-influenced.
- **`canUseNip46SecretForRelayProbe`** ([relay-auth-probe.ts:12-19](../lib/relay-auth-probe.ts#L12-L19))
  compares fully normalized URLs by exact match and fails closed on malformed input.
- **Relay probe cache.** Key includes the profile id and the `usedSigningSecret` flag, so an unsigned
  result can never be served for a signed request; in-memory only, invalidated on
  connect/disconnect/switch/remove/logout.
- **Secret exposure to the UI.** `profilesToSummaries` projects exactly
  `{id, name, picture, signerPubkey, connected}`; no message handler returns `clientSecretHex` or
  `session.bunkerUri`, and `redactBunkerUriForLog` strips `secret` from console output.
- **Cross-extension storage.** `chrome.storage.local` is per-extension and there is no API for one
  extension to read another's; a malicious extension is not a vector for the stored client secret.
- **`migrateToProfiles`.** Idempotent, scopes legacy data to the first profile, and verifies the
  write landed before deleting legacy keys. Each new profile mints a fresh key. (Robustness gap, not
  security: a legacy session without a legacy client secret gets a new key and becomes unusable.)
- **Profile isolation.** `domain_policies_<id>` and `privacyModeWhitelist_<id>` are per-profile and
  both are deleted on `REMOVE_PROFILE`. A request carries its profile from entry through to the
  stored rule, and is rejected if the active profile changed while its prompt was open.
- **`lib/domains.ts`** is display-only and not on the permission-decision path — not an
  origin-confusion vector.
- **`lib/json-highlight.ts`** returns `{type, text}` tokens rendered via `{{ }}`; Vue escapes them.
  Not an HTML sink.
- **Injection sinks.** No `v-html`, `insertAdjacentHTML`, `eval` or `new Function` anywhere. All
  `:src` bindings are extension-internal or generated data URIs, except `ProfileAvatar` (finding 3).
- **Frames.** `all_frames` is not set, so `sender.url` is always the top document — no sub-frame
  origin confusion. `new URL(...).hostname` is IDNA-punycoded, so homographs show as `xn--…`.
- **Prompt host display.** The host is shown in full (wrapping, never truncated) with a `title`, so
  the registrable domain cannot be hidden behind an ellipsis.
- **Options page trust model.** Extension-origin document, matched by `isExtensionPage`, and not in
  `web_accessible_resources` — a web page can neither navigate to it nor frame it.

### Open questions

1. Whether the bunker46 web app validates its `import` parameter — this sets the real severity of
   finding 4.
2. Whether the remote signer clamps far-future/far-past `created_at`; the extension only checks
   `typeof === 'number'`.

---

## Summary

- **Architecture:** Single background service worker, one content script on `<all_urls>`,
  popup/options/prompt/redirect UI; NIP-07 provider in main world via WAR; multi-profile secret
  store; grouped permission prompts.
- **Strengths:** No DOM XSS; NIP-07 origin taken from `sender.url`; privileged messages gated to
  extension pages and prompt-only messages gated to `prompt.html`; permission scope derived from the
  prompt window's own URL and applied only to what the prompt showed; prototype-pollution guards on
  permission keys; per-kind permission keys cannot diverge between check and store; NIP-42 signing
  scoped to session relays; profiles isolated at rest and across a switch.
- **Open items, in priority order:**
  1. **Finding 1** (Medium) — the client secret is a revocable bearer credential, not an identity
     key, and no unattended encryption scheme improves on that. The remaining move is an optional
     passphrase lock; until then it is an accepted, documented risk. See §3.1.
  2. **Finding 2** (Medium) — inherent to NIP-07; only worth revisiting if the whitelist becomes the
     default posture.
  3. **Findings 3, 4, 5** (Low) — an `extension_pages` CSP with `img-src`, redirect `uri`
     validation, and `tags` element validation. All three are small, self-contained changes.
