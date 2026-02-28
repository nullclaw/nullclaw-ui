# nullclaw-ui Architecture

## Goals

- Keep data flow predictable from transport to UI.
- Isolate protocol/transport logic from visual components.
- Support safe session restoration after page reload.
- Prefer explicit state transitions and explicit error handling.

## Layers

### 1) Presentation (`src/routes`, `src/lib/components`)

- `src/routes/+page.svelte` is the top-level screen.
- Components in `src/lib/components/*` are presentation-focused and should not own transport logic.
- UI actions are passed through callbacks (`onSend`, `onConnect`, `onApproval`, `onLogout`).

### 2) Application orchestration (`src/lib/session/connection-controller.svelte.ts`)

- Creates and manages the lifecycle of `NullclawClient`.
- Orchestrates core scenarios:
  - `connectWithPairing(url, code)`
  - `restoreSavedSession()`
  - `sendMessage(content)`
  - `sendApproval(id, requestId, approved)`
  - `logout()`
- Bridges transport events into session store updates.
- Persists/restores auth and shared key via `auth-storage`.

### 3) Domain state (`src/lib/stores/session.svelte.ts`)

Single timeline store for:

- messages (`messages`)
- tool calls (`toolCalls`)
- approvals (`approvals`)
- local errors (`error`)

Responsibilities:

- Normalize incoming envelopes for rendering.
- Manage assistant streaming lifecycle (chunk append/finalization).
- Ensure stream cleanup when an error arrives mid-stream.

### 4) Transport + protocol (`src/lib/protocol/*`)

- `client.svelte.ts`:
  - WebSocket lifecycle
  - envelope parsing/validation
  - reconnect policy (backoff + jitter)
  - E2E encryption/decryption
  - client state transitions
- `types.ts`: protocol event and payload types + constructors.
- `e2e.ts`: key exchange + symmetric crypto helpers.

### 5) Persistence + UI preferences

- `src/lib/session/auth-storage.ts`: auth persistence with TTL and payload validation.
- `src/lib/ui/preferences.ts` + `src/lib/theme.ts`: theme/effects persistence + body-class application.

## Data Flow

1. `+page.svelte` creates `connectionController`.
2. Controller subscribes to `NullclawClient.onEvent`.
3. Controller forwards envelopes to `session.handleEvent(event)`.
4. UI renders reactive store data.
5. User actions flow back to controller APIs.

## Client State Machine

`NullclawClient.state` values:

- `disconnected`
- `connecting`
- `pairing`
- `paired`
- `chatting`

Main transitions:

- `connect()` -> `connecting`
- `onopen` -> `paired` (if token exists) or `pairing` (no token)
- successful `pairing_result` -> `paired`
- successful `sendMessage()` -> `chatting`
- `disconnect()`/socket close -> `disconnected` (optional reconnect path)

## Invariants

- UI components should not create or own WebSocket connections.
- Only controller code writes auth persistence.
- Session store should not perform network calls.
- Error during streaming must always clear in-flight streaming state.
- `unauthorized` must clear local auth/session artifacts.

## Extending the System

For a new protocol event:

1. Add event/payload type to `types.ts`.
2. Allow event in `EVENT_TYPES` (`client.svelte.ts`).
3. Handle event in `session.handleEvent()`.
4. Render it in UI components.
5. Add tests for protocol/store/component behavior.

For a new UI preference:

1. Add persistence and coercion logic (`theme.ts` or dedicated module).
2. Wire through `preferences.ts`.
3. Connect it from `+page.svelte` to the relevant component.
