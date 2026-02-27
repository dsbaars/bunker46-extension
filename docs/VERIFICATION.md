# Verification checklist (for Opus 4.6 Step 4)

Use this when running the **Step 4 — Opus 4.6: Quick check** from the plan.

## Handoff brief (from plan)

_"The extension has been fully implemented (background, content script, popup, redirect) using the structure and screens you designed. Please do a **quick check**:_

- _Does the project structure match what you designed?_
- _Are all screens present and using shadcn + Lucide as intended?_
- _Any visual or structural issues to fix?_
  _Report back with a short list of corrections (if any) or confirmation that everything is implemented correctly."_

## What was implemented

- **Step 1:** Installed Shadcn deps (reka-ui, class-variance-authority, clsx, tailwind-merge, lucide-vue-next), `lib/utils.ts` with `cn()`, Tailwind 4 `@theme` in `entrypoints/popup/style.css`, WXT + Vue + Tailwind wired in `wxt.config.ts`.
- **Step 2 (design):** `docs/DESIGN.md`, `components/ui/` (Button, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Input, Badge), popup `App.vue` with connection status, copy nostrconnect URI, connect with bunker URI, disconnect, settings (base URL), redirect page at `entrypoints/redirect/`.
- **Step 3 (implementation):** Background NIP-46 client (keypair, session, nostrconnect URI, bunker URI connect, WAIT_NOSTRCONNECT, disconnect, NIP-07 handlers). Content script injects `window.nostr` and bridges to background. Popup wired to background. Redirect page reads `?uri=` and redirects to `{baseUrl}/connections?import=...`.

## Quick checks

1. **Structure:** `entrypoints/` (background, content, popup, redirect), `components/ui/`, `lib/` (utils, hex, constants), `docs/`.
2. **Screens:** Popup shows Connected/Not connected, Copy URI, bunker URI input + Connect, Disconnect, Settings (base URL). Redirect shows "Redirecting…" and redirects when `uri` is nostrconnect.
3. **Build:** `pnpm run build` and `pnpm run compile` both succeed.
