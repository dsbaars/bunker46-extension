# Bunker46 Extension — Security Assessment

**Assessor:** Shannon (autonomous AI pentesting agent)  
**Scope:** TypeScript WXT browser extension codebase  
**Method:** Static analysis + attack-surface mapping; no live exploitation.

---

## Step 1: Extension Architecture Analysis

### 1.1 Configuration and Manifest

**`wxt.config.ts`:**

- **Permissions:** `['storage', 'tabs']` (no `host_permissions` in config; WXT typically derives host access from content script `matches` in MV3).
- **Web-accessible resources:** `nostr-provider.js` with `matches: ['<all_urls>']` — any page can load this script (by design for NIP-07).
- **CSP:** No custom `content_security_policy` in config; default WXT/Vite CSP applies.
- **Dev:** Dev server on port 3456; Firefox `browser_specific_settings` with `@bunker46-extension` and `data_collection_permissions: required: ['none']`.

**Effective manifest (WXT-generated):**

- Content script from `entrypoints/content.ts` has `matches: ['<all_urls>']`, so the extension effectively has broad host access (and in MV3 often gets implicit host permission for those matches).
- No `executeScript`/`scripting` permission — no dynamic script injection from background.

### 1.2 Entrypoints Map

| Entrypoint     | Path                           | Role                                                                                                                                                                                                           |
| -------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Background     | `entrypoints/background.ts`    | Service worker: session, NIP-46 signer, permission checks, message router. Uses `defineBackground(async () => { ... })` for init; `chrome.runtime.onMessage.addListener` registered at top level.              |
| Content script | `entrypoints/content.ts`       | `defineContentScript({ matches: ['<all_urls>'], runAt: 'document_start' })`. Injects `nostr-provider.js` via `<script src="...">`, bridges `nip07-request` to background, handles `nostrconnect:` link clicks. |
| Popup UI       | `entrypoints/popup/`           | Vue 3 SPA: connection, permissions, settings; reads/writes `chrome.storage.local` and sends many message types to background.                                                                                  |
| Prompt UI      | `entrypoints/prompt/`          | Vue 3: permission prompt; reads `requestId`/`host`/`method` from URL (set by background), sends `PERMISSION_RESPONSE` and `GET_RAW_EVENT`.                                                                     |
| Redirect       | `entrypoints/redirect/main.ts` | Extension page: reads `?uri=` (or `?nostrconnect=`), loads `bunker46BaseUrl` from storage, redirects to `{baseUrl}/connections?import={uri}`.                                                                  |

**Unlisted / lib:**

- `lib/permissions.ts`, `lib/privacy-mode.ts` — storage wrappers for domain policies and privacy whitelist.
- `lib/nip07/types.ts` — NIP-07 types; no runtime validation.
- `public/nostr-provider.js` — plain JS, runs in **page (main) world**; communicates with content script via `CustomEvent` and `window.postMessage`.

### 1.3 WXT-Specific Patterns

- **`defineContentScript()`:** Single content script with `matches: ['<all_urls>']`, `runAt: 'document_start'`, `main(ctx)` with `ctx.isValid` check after async.
- **`defineBackground()`:** Only used for startup (load session, reconnect); message handling is in a top-level `chrome.runtime.onMessage.addListener` (works correctly with WXT).
- **`browser.*` / `chrome.*`:** Code uses `chrome.*` consistently; no `browser.*` polyfill needed in Chrome.
- **Storage:** All persistence via `chrome.storage.local` (no sync); keys in constants (e.g. `domain_policies`, `nip46_client_secret_hex`, `nip46_session`).
- **No `@` path leakage:** Imports use `@/lib/...`; build resolves to extension paths; no user-controlled path resolution.

### 1.4 TypeScript and Message Passing

- **env.d.ts:** Declares `chrome` with `runtime.sendMessage(msg: unknown, cb?)`, `storage.local`, `windows`, `tabs` (partial). No strict typing for message payloads.
- **Background listener:** `msg` typed as object with optional `type`, `uri`, `method`, `params`, `host`, `requestId`, `decision`, `enabled`. No runtime schema or allowlist of `msg.type` before dispatch; unknown types fall through to `{ error: 'Unknown message type' }`.
- **NIP-07:** `NIP07SignEventInput` used for `validateSignEventInput()`; NIP04/NIP44 params passed as `msg.params[0] as string`, `msg.params[1] as string` without runtime string checks.

---

## Step 2: Extension-Specific Attack Surface Mapping

### 2.1 Manifest & Permissions

| Issue                    | Finding                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad permissions        | `storage` + `tabs` plus content script on `<all_urls>` gives the extension access to all hosts for messaging and tab listing.                                                          |
| Unused permissions       | `tabs` is used (query, create, badge, getLastFocused). No obvious unused permission.                                                                                                   |
| Host granularity         | No explicit `host_permissions` in config; content script `matches` drive scope. Narrowing would require restricting `matches` (and possibly breaking NIP-07 on arbitrary Nostr sites). |
| Web-accessible resources | `nostr-provider.js` with `<all_urls>` is intentional so any site can get `window.nostr`; increases surface (any page can trigger NIP-07 flows).                                        |

### 2.2 Content Scripts

| Issue             | Finding                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DOM XSS           | No `innerHTML`, `document.write`, or `eval()` in content script or provider; safe DOM usage (e.g. `document.createElement`, `appendChild`).                                                                                                      |
| URL matching      | `matches: ['<all_urls>']` — script runs on every page; no injection into unintended sites beyond “everywhere.”                                                                                                                                   |
| Message passing   | Content script only sends: `SHOULD_INJECT_NOSTR`, `OPEN_NOSTRCONNECT_URI`, and NIP-07 method types. It does **not** send privileged types (e.g. `REMOVE_PERMISSION`, `FULL_LOGOUT`). Origin for NIP-07 is taken from `sender.url` in background. |
| Dynamic injection | Provider injected via `script.src = chrome.runtime.getURL('nostr-provider.js')`; URL is extension-controlled, not page-controlled.                                                                                                               |
| postMessage       | Content script uses `window.postMessage({ type: 'nip07-response', payload }, '*')`; any page can listen; payload is the response for the page’s own request (by design).                                                                         |

### 2.3 Background / Service Worker

| Issue            | Finding                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Message listener | Single listener handles all types. **No sender validation** for privileged operations: any extension context (popup, prompt, options, or a future content-script path) could send `REMOVE_PERMISSION`, `FULL_LOGOUT`, `GET_PERMISSIONS`, `GET_NOSTR_WHITELIST`, etc. Content script **currently** does not send these; risk is XSS in an extension page or future code that forwards messages. |
| Storage          | Sensitive data in `chrome.storage.local`: `nip46_client_secret_hex`, `nip46_session` (signer pubkey, relays, bunker URI). Unencrypted; accessible to any code with storage access (e.g. malicious extension, disk access).                                                                                                                                                                     |
| Alarms/timers    | No `chrome.alarms` or timer-based C2; NIP-46 uses WebSocket/pool from nostr-tools.                                                                                                                                                                                                                                                                                                             |
| Native messaging | Not used.                                                                                                                                                                                                                                                                                                                                                                                      |

**PERMISSION_RESPONSE:**  
Host and method are taken from `sender.url` (prompt page’s URL, which the background set when opening the prompt). So `allow_always` / `deny_always` apply to the host/method in that URL; no forgery from the page. **GET_RAW_EVENT:** Any extension context can send `GET_RAW_EVENT` with a `requestId`; if an attacker could predict or obtain a valid `requestId`, they could read a pending sign event (sensitive). `requestId` is `Math.random().toString(36).slice(2) + Date.now()` — moderate entropy.

### 2.4 WXT-Specific

| Issue             | Finding                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `browser.*` usage | All usage is inside extension scripts; no unsafe top-level or cross-context use. |
| CSP in config     | No CSP override in `wxt.config.ts` that would weaken defaults.                   |
| `@` alias         | Used only for imports; no user input in path resolution.                         |
| WAR               | Only `nostr-provider.js`; necessary for NIP-07.                                  |

### 2.5 TypeScript / Data Handling

| Issue                     | Finding                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `any` in message handlers | Message payload typed with optional fields; no `any` on the main handler; `params` is `unknown[]`.                                                                                                                                                                                                                   |
| Unsafe casts              | NIP04/NIP44: `msg.params[0] as string`, `msg.params[1] as string` with no runtime check — non-string values could cause type confusion or backend errors. Storage reads: multiple `raw[key] as string` or `as string[]` without validation.                                                                          |
| Storage schema            | Policies and whitelist are plain objects; no schema validation. `setPermission(host, method, decision)` does not validate `host`/`method` (e.g. reject `__proto__`, `constructor`, or non-hostname strings); could lead to odd storage entries or, in theory, prototype pollution depending on engine/serialization. |
| signEvent validation      | `validateSignEventInput()` checks `kind`, `content`, `tags` (Array.isArray), `created_at`; it does **not** validate that `tags` elements are `string[]`. Backend may reject or misinterpret; robustness rather than critical vuln.                                                                                   |

### 2.6 Redirect Page

- **Input:** `uri` (or `nostrconnect`) from `window.location.search`.
- **Flow:** Load `bunker46BaseUrl` from storage → redirect to `{baseUrl}/connections?import={encodeURIComponent(uri)}`.
- **Risk:** If a user opens e.g. `redirect.html?uri=https://evil.com`, the bunker app receives `import=https://evil.com`. Open redirect is determined by how the bunker app handles `import`; the extension passes user-controlled data through.

---

## Step 3: Proof-of-Concept Exploitation

### 3.1 Vulnerability Table

| #   | Vulnerability                                 | Location                                                     | Attack Vector                                                                                                                                                         | Impact                                                                      | WXT-Safe Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Broad `<all_urls>` content script             | `content.ts` + manifest                                      | Content script and provider run on every page; any site can trigger NIP-07 and permission prompts                                                                     | Medium (intended for NIP-07; maximizes prompt fatigue and phishing surface) | Consider optional host allowlist or privacy-mode-only injection to reduce exposure                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2   | No sender validation for privileged messages  | `background.ts` (onMessage)                                  | If an extension page is compromised (XSS) or a future content path forwards messages, attacker could send `REMOVE_PERMISSION`, `FULL_LOGOUT`, `GET_PERMISSIONS`, etc. | High (if XSS exists)                                                        | Restrict privileged message types to extension pages: e.g. require `sender.url && sender.url.startsWith(chrome.runtime.getURL(''))` for types like `REMOVE_PERMISSION`, `FULL_LOGOUT`, `GET_PERMISSIONS`, `GET_NOSTR_WHITELIST`, `ADD_TO_NOSTR_WHITELIST`, `REMOVE_FROM_NOSTR_WHITELIST`, `SET_SHOW_NOSTR_BADGE`, `CONNECT_BUNKER_URI`, `CONNECT_VIA_NOSTRCONNECT`, `DISCONNECT`, `FULL_LOGOUT`, `GET_RAW_EVENT`, `REMOVE_PERMISSION`, `REMOVE_DOMAIN_PERMISSIONS`, `PERMISSION_RESPONSE` |
| 3   | Sensitive data in storage unencrypted         | `background.ts`, `lib/permissions.ts`, `lib/privacy-mode.ts` | Malicious extension or physical access to profile can read `nip46_client_secret_hex` and `nip46_session`                                                              | High (key/session theft)                                                    | Document risk; consider encrypting secrets with a key derived from user auth or hardware-bound storage where available                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | NIP04/NIP44 params not validated as strings   | `background.ts` (NIP04*\* / NIP44*\* branches)               | Page sends e.g. `params: [{}, []]`; backend receives non-strings; possible type confusion or DoS                                                                      | Medium                                                                      | Validate `typeof msg.params[0] === 'string' && typeof msg.params[1] === 'string'` (and length/format if needed) before calling signer                                                                                                                                                                                                                                                                                                                                                     |
| 5   | Host/method not validated in setPermission    | `lib/permissions.ts`                                         | Caller could pass `__proto__` or `constructor` as host/method; could pollute object prototype or store junk                                                           | Low–Medium                                                                  | Reject reserved keys and validate host (e.g. valid hostname or allowlist pattern) and method (e.g. allowlist of NIP-07 method names)                                                                                                                                                                                                                                                                                                                                                      |
| 6   | GET_RAW_EVENT from any extension context      | `background.ts`                                              | Extension page (or future content path) sends `GET_RAW_EVENT` with guessed/predictable `requestId` to read pending sign event                                         | Low (requestId has moderate entropy)                                        | Only allow `GET_RAW_EVENT` when `sender.url` is the prompt page (e.g. same-origin as `prompt.html`)                                                                                                                                                                                                                                                                                                                                                                                       |
| 7   | Redirect passes user-controlled uri to bunker | `entrypoints/redirect/main.ts`                               | User opens `redirect.html?uri=https://evil.com` → bunker gets `import=https://evil.com`; open redirect depends on bunker app                                          | Low (bunker app responsibility)                                             | Validate `uri` is a nostrconnect/bunker URI format before redirect; document that bunker must validate `import`                                                                                                                                                                                                                                                                                                                                                                           |
| 8   | signEvent tags not strictly validated         | `background.ts` (validateSignEventInput)                     | `tags` only checked as Array; elements not enforced as `string[][]`                                                                                                   | Low (robustness)                                                            | Optionally validate each tag is array of strings before sending to signer                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 3.2 Example Payloads (Simulated)

**1. Privileged message from extension page (simulated — requires XSS in popup/prompt):**

```javascript
// Injected in extension context (e.g. popup XSS)
chrome.runtime.sendMessage({ type: 'FULL_LOGOUT' });
chrome.runtime.sendMessage({
  type: 'REMOVE_PERMISSION',
  host: 'trusted-nostr.app',
  method: 'signEvent',
});
chrome.runtime.sendMessage({ type: 'ADD_TO_NOSTR_WHITELIST', host: 'evil.com' });
```

**2. NIP04/NIP44 type confusion (from page via NIP-07):**

```javascript
// In page with window.nostr
window.nostr.nip04.encrypt({ toString: () => 'malicious' }, 'data');
// or
window.nostr.nip44.decrypt(null, undefined);
```

**3. Prototype pollution attempt (if host not validated):**

```javascript
// From extension context only (popup/background); not from content script
chrome.runtime.sendMessage({
  type: 'REMOVE_PERMISSION',
  host: '__proto__',
  method: 'polluted',
});
// Then setPermission('__proto__', 'signEvent', 'allow') could affect prototype
```

**4. Redirect open-redirect (user must open URL):**

```
chrome-extension://<id>/redirect.html?uri=https://evil.com/phishing
```

**5. GET_RAW_EVENT information disclosure (extension context; requestId guess):**

```javascript
// requestId = random base36 (11 chars) + Date.now(); brute force or leak
chrome.runtime.sendMessage({ type: 'GET_RAW_EVENT', requestId: 'leaked_or_guessed_id' }, (r) =>
  console.log(r.event)
);
```

---

## Summary

- **Architecture:** Single background, one content script on `<all_urls>`, popup/prompt/redirect UI; NIP-07 provider in main world via WAR; clear separation of roles.
- **Strengths:** No DOM XSS (no innerHTML/eval/document.write); NIP-07 origin from `sender.url`; PERMISSION_RESPONSE host/method from prompt URL; content script does not send privileged message types.
- **Prioritized fixes:** (1) Restrict privileged message types to extension pages (sender URL check). (2) Validate NIP04/NIP44 params as strings. (3) Validate host/method in `setPermission`. (4) Optional: restrict GET_RAW_EVENT to prompt page; validate redirect `uri` format; tighten signEvent `tags` validation.
- **Documentation:** Document unencrypted storage of client secret and session; document that redirect passes user-controlled `uri` to the bunker app.
