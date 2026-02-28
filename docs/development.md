# Development

## Prerequisites

- `Node.js` 20+
- `npm` 10+

Check versions:

```bash
node -v
npm -v
```

## Local Run

```bash
npm install
npm run dev
```

Default dev URL: `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

Build output directory: `build/`.

## Project Structure

```text
src/
  routes/
    +layout.svelte
    +layout.ts
    +page.svelte
  lib/
    components/                  UI components
    protocol/                    WebChannel client + types + crypto
    session/                     orchestration + auth storage
    stores/                      session store
    ui/                          UI preferences
    theme.ts                     themes/effects
```

## Code Conventions

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) consistently.
- Keep components thin; place orchestration/side effects in dedicated modules.
- Keep transport logic in `protocol/*` + `connection-controller`.
- Guard all unknown payloads (`asObject`, `asString`, `asBoolean` style checks).
- Isolate side effects (WebSocket, localStorage, document class mutations).

## Adding Features

1. Identify target layer:
   - protocol event
   - session model
   - UI behavior
2. Add or update protocol types/validation.
3. Add handling in controller/store.
4. Update UI component(s).
5. Add/adjust tests.
6. Run `npm run test` and `npm run check`.

## Debugging Tips

- Use `StatusBar` + diagnostics modal to inspect endpoint/session state.
- Force socket closures on backend to verify reconnect behavior.
- Inspect and reset localStorage when debugging restore logic.
