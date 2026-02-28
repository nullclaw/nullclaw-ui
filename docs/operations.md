# Operations and Releases

## Production Build

```bash
npm ci
npm run test
npm run check
npm run build
```

Output is generated into `build/` (static app bundle).

## Deployment Model

This project uses `@sveltejs/adapter-static` with `fallback: index.html`.

Implications:

- Deploy to any static hosting/CDN.
- Configure route fallback to `index.html` for SPA navigation.

## Runtime Configuration

WebSocket endpoint is currently user-entered in `PairingScreen`.
Default value: `ws://127.0.0.1:32123/ws`.

To change default endpoint, update initial `url` in `src/lib/components/PairingScreen.svelte`.

## Sensitive Data Handling

`nullclaw_ui_auth_v1` in local storage includes:

- endpoint URL
- `access_token`
- `shared_key` (base64url)
- `expires_at`

Security expectations:

- clear on logout and `unauthorized`
- enforce TTL expiration behavior
- avoid running in untrusted browser environments

## Release Checklist

1. Ensure docs match current runtime behavior.
2. Run `npm run test` and `npm run check`.
3. Manual verification of pairing, chat, approvals, logout.
4. Build production bundle.
5. Confirm diagnostics panel reflects actual E2E/runtime details.

## Troubleshooting

### Pairing does not start

- Verify WebSocket endpoint format.
- Ensure backend is reachable from browser/network.
- Ensure PIN is exactly 6 digits.

### Messages are not sent

- Client is not in `paired`/`chatting` state.
- Socket was closed or token was rejected.
- Check error bar in chat screen.

### Session does not restore after reload

- Stored auth expired (`expires_at`).
- Shared key in storage is invalid.
- Backend rejects saved token (`unauthorized`).
