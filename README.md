# nullclaw-ui

A terminal-style web interface for `nullclaw`.
The app uses WebSocket + `WebChannel v1` and supports PIN pairing, streaming assistant responses, tool-call rendering, approval prompts, and end-to-end encryption.

![Nullclaw Pairing Screen](docs/assets/pairing-screen.png)

## Features

- Connect to an agent via `ws://...` endpoint and a 6-digit pairing PIN.
- E2E session bootstrap: X25519 key exchange + ChaCha20-Poly1305 message encryption.
- Streaming assistant UI (`assistant_chunk` -> `assistant_final`).
- Tool timeline support (`tool_call` / `tool_result`).
- Approval flow support (`approval_request` -> `approval_response`).
- Session restore from `localStorage` with token TTL.
- Theme and visual-effects preferences persisted locally.

## Stack

- `Svelte 5` (Runes API)
- `SvelteKit 2`
- `Vite 7`
- `Vitest 4` + `@testing-library/svelte`
- `@noble/ciphers` for ChaCha20-Poly1305

The app is built as a static site (`adapter-static`, `fallback: index.html`, `ssr = false`).

## Quick Start

### 1) Requirements

- `Node.js` 20+ (LTS recommended)
- `npm` 10+

### 2) Install

```bash
npm install
```

### 3) Run locally

```bash
npm run dev
```

Open `http://localhost:5173`.

### 4) Pair with an agent

1. Enter the WebSocket endpoint (default: `ws://127.0.0.1:32123/ws`).
2. Enter a 6-digit pairing PIN.
3. After `pairing_result`, the UI switches to chat mode.

## Scripts

- `npm run dev` - local development server.
- `npm run build` - production build.
- `npm run preview` - preview built app.
- `npm run cli -- run` - serve built UI via local CLI entrypoint.
- `npm run test` - run Vitest suite.
- `npm run test:watch` - run Vitest in watch mode.
- `npm run check` - `svelte-kit sync` + `svelte-check`.
- `npm run check:watch` - `svelte-check` in watch mode.

## Global CLI Usage

GitHub release artifacts include a runnable CLI bundle with `build/` assets and launchers.
After extracting a release archive, put the launcher on your `$PATH`:

```bash
chmod +x nullclaw-ui/nullclaw-ui
sudo ln -sf "$(pwd)/nullclaw-ui/nullclaw-ui" /usr/local/bin/nullclaw-ui
nullclaw-ui run --host 127.0.0.1 --port 4173
```

Notes:

- Requires `Node.js 20+` available as `node`.
- Windows users can use `nullclaw-ui.cmd` from the extracted folder.
- `nullclaw-ui run` serves the built static UI bundle with SPA fallback routing and still requires a reachable `nullclaw` WebSocket backend.

## Architecture (Short)

- [`src/routes/+page.svelte`](src/routes/+page.svelte): page composition root.
- [`src/lib/session/connection-controller.svelte.ts`](src/lib/session/connection-controller.svelte.ts): pairing/session orchestration, restore, logout.
- [`src/lib/protocol/client.svelte.ts`](src/lib/protocol/client.svelte.ts): WebSocket client, envelope validation, reconnect.
- [`src/lib/stores/session.svelte.ts`](src/lib/stores/session.svelte.ts): timeline state (messages/tool calls/approvals/errors).
- [`src/lib/protocol/e2e.ts`](src/lib/protocol/e2e.ts): cryptography.
- [`src/lib/ui/preferences.ts`](src/lib/ui/preferences.ts) + [`src/lib/theme.ts`](src/lib/theme.ts): UI preferences.

Detailed docs:

- [Architecture](docs/architecture.md)
- [Protocol and E2E](docs/protocol.md)
- [Development](docs/development.md)
- [Testing](docs/testing.md)
- [Operations and Releases](docs/operations.md)

## Browser Storage

`localStorage` keys:

- `nullclaw_ui_auth_v1` - endpoint URL, `access_token`, `shared_key`, `expires_at`.
- `nullclaw_ui_theme` - current theme.
- `nullclaw_ui_effects` - visual effects toggle.

Auth token and shared key are cleared automatically when TTL expires or when the session is rejected (`unauthorized`).

## Build and Deploy

```bash
npm run build
```

Static output: `build/`. Deploy to any static hosting/CDN with `index.html` fallback configured.

## Limitations

- X25519 requires modern WebCrypto support in the browser.
- Endpoint is currently user-entered in UI (not env-configured).
- This repository is UI-only and expects an available WebSocket backend.
