# Protocol and E2E

This document reflects the actual frontend behavior.

## Envelope

All protocol messages use this envelope:

```json
{
  "v": 1,
  "type": "event_name",
  "session_id": "string",
  "agent_id": "optional",
  "request_id": "optional",
  "payload": {}
}
```

Validation in `src/lib/protocol/client.svelte.ts` requires:

- `v === 1`
- known event `type`
- non-empty `session_id`

Invalid envelopes are ignored.

## Supported Events

### UI -> Core

- `pairing_request`
- `user_message`
- `approval_response`

### Core -> UI

- `pairing_result`
- `assistant_chunk`
- `assistant_final`
- `tool_call`
- `tool_result`
- `approval_request`
- `error`

## Pairing Flow

1. UI opens WebSocket endpoint.
2. Once client reaches `pairing`, UI sends `pairing_request` with:
   - `pairing_code` (6 digits)
   - `client_pub` (base64url X25519 public key)
3. Core responds with `pairing_result` containing:
   - `access_token`
   - optional `expires_in`
   - optional `e2e.agent_pub`
4. UI derives shared key and enables E2E mode.
5. Auth + shared key are persisted in local storage.

## E2E Cryptography

Implementation: `src/lib/protocol/e2e.ts`.

- Key exchange: `X25519` via WebCrypto.
- Key derivation: `SHA-256("webchannel-e2e-v1" || shared_secret)`.
- Symmetric encryption: `ChaCha20-Poly1305`.
- Nonce: random 12-byte value.

E2E payload format:

```json
{
  "nonce": "base64url",
  "ciphertext": "base64url"
}
```

### Outgoing message encryption

`sendMessage(content)` behavior:

- If E2E key exists: wrap plaintext object (`content`, `sender_id`) and encrypt to `payload.e2e`.
- If E2E key is not available: send `payload.content` in plaintext mode.

### Incoming message decryption

For `assistant_*` events, if `payload.e2e` is present, client attempts decryption.
If decryption fails, the event is still processed safely without crashing the UI.

## Errors and Resilience

### Error payload

For `type = "error"`, expected payload shape:

```json
{
  "message": "string",
  "code": "optional string"
}
```

Malformed error payloads produce a local client-side error event.

### Unauthorized handling

When `payload.code === "unauthorized"`:

- client clears in-memory auth (`accessToken`, E2E key)
- controller clears persisted auth
- session store is reset

### Reconnect policy

Reconnect is attempted only when all conditions hold:

- socket closes unexpectedly
- previous state was `paired` or `chatting`
- access token exists
- reconnect is enabled (`shouldReconnect = true`)

Backoff strategy:

- base delay: 1000 ms
- exponential growth up to 30 s
- jitter: 50-100% of computed delay

## Request Correlation

`request_id` is used to correlate:

- `tool_call` <-> `tool_result`
- `approval_request` <-> `approval_response`

If a `tool_result` arrives without `request_id`, store falls back to the latest unresolved tool call.
