# Testing

This project uses `Vitest` (`jsdom` environment) and `@testing-library/svelte`.

## Commands

```bash
npm run test
npm run test:watch
npm run check
```

## Current Coverage

### Protocol layer

- `src/lib/protocol/types.test.ts`
  - envelope constructor correctness
- `src/lib/protocol/e2e.test.ts`
  - key generation
  - shared-key derivation
  - encrypt/decrypt roundtrip
  - decrypt failure with wrong key
- `src/lib/protocol/client.test.ts`
  - connect/pair/send flows
  - `pairing_result`, `assistant_final` handling
  - E2E decrypt path for `assistant_chunk`
  - reconnect/backoff behavior
  - guards against duplicate connect and send-on-closed-socket

### Session and persistence layer

- `src/lib/stores/session.test.ts`
  - streaming chunk/final behavior
  - legacy content fallback
  - tool/approval correlation
  - error handling
- `src/lib/session/auth-storage.test.ts`
  - save/load/clear flows
  - malformed/expired payload cleanup
- `src/lib/session/connection-controller.test.ts`
  - session restore
  - local send-error behavior

### UI layer

- `src/lib/components/PairingScreen.test.ts`
  - PIN sanitization
  - submit validation
- `src/lib/components/StatusBar.test.ts`
  - endpoint/session rendering
  - theme/effects/logout callbacks
- `src/lib/theme.test.ts`, `src/lib/ui/preferences.test.ts`
  - theme/effects persistence and body class behavior

## Testing Principles

- One test should assert one behavioral guarantee.
- Prefer observable behavior over private implementation details.
- Use mocked WebSocket for transport tests.
- Use in-memory mocked `Storage` for persistence tests.
- Use user-level interactions for component tests.

## Recommended Next Coverage

- Component tests for:
  - `ChatScreen`
  - `MessageBubble`
  - `ToolCallBlock`
  - `ApprovalPrompt`
- Full flow integration smoke test: pairing -> chatting.
- Optional browser E2E coverage (for example with Playwright + mock backend).

## Minimum Pre-Merge Check

1. `npm run test`
2. `npm run check`
3. Manual smoke:
   - successful pairing
   - send message
   - error handling
   - logout and reconnect
