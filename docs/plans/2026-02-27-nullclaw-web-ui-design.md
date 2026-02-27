# nullclaw-ui Design

## Purpose

Web chat client for nullclaw's WebChannel v1 protocol. Connects via WebSocket, supports WS-level pairing with one-time codes, JWT auth, and optional E2E encryption (X25519 + ChaCha20-Poly1305). Runs locally or on a server.

## Decisions

- **Framework**: SvelteKit SPA mode (ssr: false, adapter-static), Svelte 5 runes
- **Auth**: WS-level pairing protocol (pairing_request/pairing_result), not simple token auth
- **E2E**: Optional, toggle in pairing screen. Web Crypto API (no external crypto libs)
- **Sessions**: Single session at a time
- **Agent events**: tool_call/tool_result as collapsible details, approval_request with buttons
- **Style**: Minimal dark terminal aesthetic, monospace, hand-crafted CSS

## Architecture

```
src/
├── lib/
│   ├── protocol/
│   │   ├── client.svelte.ts    # WebSocket client + reconnect
│   │   ├── types.ts            # WebChannel v1 message types
│   │   └── e2e.ts              # X25519 + ChaCha20-Poly1305 (Web Crypto)
│   ├── stores/
│   │   └── session.svelte.ts   # Reactive session state
│   └── components/
│       ├── PairingScreen.svelte
│       ├── ChatScreen.svelte
│       ├── MessageBubble.svelte
│       ├── ToolCallBlock.svelte
│       ├── ApprovalPrompt.svelte
│       └── StatusBar.svelte
├── routes/
│   └── +page.svelte            # Single page: pairing or chat
├── app.html
└── app.css                     # Dark terminal theme
```

State machine: `disconnected -> pairing -> paired -> chatting`

## Pairing Flow

1. User enters WS URL (default ws://127.0.0.1:32123/ws) and 6-digit code
2. Optional E2E toggle generates ephemeral X25519 keypair
3. UI opens WebSocket, sends:
   ```json
   {"v":1,"type":"pairing_request","session_id":"sess-1","payload":{"pairing_code":"123456","client_pub":"<base64url>"}}
   ```
4. Server responds with pairing_result containing access_token and optional e2e.agent_pub
5. If E2E enabled, derive shared key: SHA256("webchannel-e2e-v1" || X25519(client_priv, agent_pub))
6. Store access_token in memory only. Transition to chat.

Error codes: pairing_already_used, pairing_e2e_required, invalid_code, locked_out.

## Messaging

Without E2E:
```json
{"v":1,"type":"user_message","session_id":"sess-1","payload":{"access_token":"<jwt>","content":"hello"}}
```

With E2E:
1. Serialize: {"content":"hello","sender_id":"ui-1"}
2. Random 12-byte nonce
3. ChaCha20-Poly1305 encrypt with shared key
4. Send: payload.e2e = {nonce: "<b64url>", ciphertext: "<b64url>"}

Receiving: check payload.content (plaintext) or payload.e2e (decrypt first).

## Inbound Event Handling

| Event | Rendering |
|-------|-----------|
| assistant_chunk | Append to current streaming message |
| assistant_final | Replace streaming content with final |
| tool_call | Collapsible block: tool name + arguments |
| tool_result | Append result to matching tool_call block |
| approval_request | Highlighted block with Approve/Deny buttons |
| error | Red banner or inline error message |

## UI Theme

- Background: #0a0a0a
- Accent: #00ff41 (matrix green)
- Font: JetBrains Mono / Fira Code / monospace fallback
- User messages: right-aligned, dim border
- Agent messages: left-aligned, green border
- StatusBar: connection dot (green/yellow/red), session ID, E2E lock icon

## Reconnection

- Exponential backoff: 1s, 2s, 4s, 8s, max 30s with jitter
- If valid access_token exists, reconnect and resume (skip pairing)
- If token rejected (unauthorized), return to pairing screen
