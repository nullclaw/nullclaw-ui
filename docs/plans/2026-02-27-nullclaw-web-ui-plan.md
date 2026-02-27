# nullclaw-ui Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Svelte 5 / SvelteKit chat UI for nullclaw's WebChannel v1 protocol with WS-level pairing, JWT auth, optional E2E encryption, and a dark terminal aesthetic.

**Architecture:** SvelteKit SPA (ssr: false, adapter-static). Single page with state machine: disconnected → pairing → paired → chatting. Protocol layer (WebSocket client, types, E2E) in `src/lib/protocol/`. Reactive session state via Svelte 5 `$state` runes. Components for pairing screen, chat, tool calls, approvals.

**Tech Stack:** Svelte 5 + SvelteKit 2.x, TypeScript, Vitest, Web Crypto API (X25519), `@noble/ciphers` (ChaCha20-Poly1305 — not in browser Web Crypto), adapter-static.

**Note on E2E crypto:** Web Crypto supports X25519 for key exchange but does NOT support ChaCha20-Poly1305 in browsers. We use `@noble/ciphers` (~4KB) for the symmetric cipher only. X25519 key gen/derivation uses native Web Crypto.

---

### Task 1: Scaffold SvelteKit Project

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.css`, `src/routes/+layout.ts`, `src/routes/+page.svelte`

**Step 1: Create SvelteKit project**

Run in the project root (which already has `reference/` and `docs/`):

```bash
cd /Users/igorsomov/Code/nullclaw-ui
npx sv create . --template minimal --types ts --no-add-ons --no-install
```

If `sv create` refuses because directory is non-empty, use `--force` or create in a temp dir and copy files. The goal is a minimal SvelteKit skeleton with TypeScript.

**Step 2: Install dependencies**

```bash
npm install
npm install -D @sveltejs/adapter-static
npm install @noble/ciphers
```

**Step 3: Configure adapter-static and SPA mode**

`svelte.config.js`:
```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: 'index.html' }),
  }
};
```

`src/routes/+layout.ts`:
```ts
export const prerender = true;
export const ssr = false;
```

**Step 4: Add base CSS**

`src/app.css`:
```css
:root {
  --bg: #0a0a0a;
  --bg-surface: #111111;
  --bg-hover: #1a1a1a;
  --fg: #c0c0c0;
  --fg-dim: #666666;
  --accent: #00ff41;
  --accent-dim: #00aa2a;
  --error: #ff4444;
  --warning: #ffaa00;
  --border: #2a2a2a;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

input, button, textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 12px;
  outline: none;
}

input:focus, textarea:focus {
  border-color: var(--accent);
}

button {
  cursor: pointer;
  border-color: var(--accent-dim);
  color: var(--accent);
  transition: background 0.15s;
}

button:hover {
  background: var(--bg-hover);
}

::selection {
  background: var(--accent-dim);
  color: var(--bg);
}
```

**Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server on localhost:5173, blank page renders.

**Step 6: Commit**

```bash
git add -A
git commit -m "scaffold: SvelteKit SPA with adapter-static and dark theme"
```

---

### Task 2: Define Protocol Types

**Files:**
- Create: `src/lib/protocol/types.ts`
- Test: `src/lib/protocol/types.test.ts`

**Step 1: Write the types**

`src/lib/protocol/types.ts`:
```ts
// WebChannel v1 protocol types

export const PROTOCOL_VERSION = 1;

// -- Event types --

export type EventType =
  | 'pairing_request'
  | 'pairing_result'
  | 'user_message'
  | 'assistant_chunk'
  | 'assistant_final'
  | 'tool_call'
  | 'tool_result'
  | 'approval_request'
  | 'approval_response'
  | 'error';

// -- Envelope --

export interface Envelope {
  v: typeof PROTOCOL_VERSION;
  type: EventType;
  session_id: string;
  agent_id?: string;
  request_id?: string;
  payload?: Record<string, unknown>;
  content?: string; // legacy compat
}

// -- Client → Server payloads --

export interface PairingRequestPayload {
  pairing_code: string;
  client_pub?: string; // base64url X25519 public key
}

export interface UserMessagePayload {
  access_token: string;
  content?: string;      // plaintext mode
  sender_id?: string;
  e2e?: E2EPayload;      // encrypted mode
}

export interface ApprovalResponsePayload {
  approved: boolean;
  reason?: string;
}

// -- Server → Client payloads --

export interface PairingResultPayload {
  access_token: string;
  set_cookie?: string;
  e2e?: {
    agent_pub: string;   // base64url X25519 public key
  };
}

export interface AssistantPayload {
  content?: string;
  e2e?: E2EPayload;
}

export interface ToolCallPayload {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultPayload {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ApprovalRequestPayload {
  action: string;
  reason?: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

// -- E2E encryption --

export interface E2EPayload {
  nonce: string;      // base64url 12 bytes
  ciphertext: string; // base64url
}

// -- Error codes --

export type PairingErrorCode =
  | 'pairing_already_used'
  | 'pairing_e2e_required'
  | 'invalid_code'
  | 'locked_out'
  | 'unauthorized'
  | 'e2e_required';

// -- Typed message constructors --

export function makePairingRequest(
  sessionId: string,
  code: string,
  clientPub?: string,
): Envelope {
  const payload: PairingRequestPayload = { pairing_code: code };
  if (clientPub) payload.client_pub = clientPub;
  return { v: 1, type: 'pairing_request', session_id: sessionId, payload };
}

export function makeUserMessage(
  sessionId: string,
  accessToken: string,
  content: string,
  e2e?: E2EPayload,
): Envelope {
  const payload: UserMessagePayload = { access_token: accessToken };
  if (e2e) {
    payload.e2e = e2e;
  } else {
    payload.content = content;
  }
  return { v: 1, type: 'user_message', session_id: sessionId, payload };
}

export function makeApprovalResponse(
  sessionId: string,
  accessToken: string,
  approved: boolean,
  requestId?: string,
  reason?: string,
): Envelope {
  const payload: ApprovalResponsePayload & { access_token: string } = {
    access_token: accessToken,
    approved,
  };
  if (reason) payload.reason = reason;
  return {
    v: 1,
    type: 'approval_response',
    session_id: sessionId,
    request_id: requestId,
    payload,
  };
}
```

**Step 2: Write tests for message constructors**

`src/lib/protocol/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  makePairingRequest,
  makeUserMessage,
  makeApprovalResponse,
  PROTOCOL_VERSION,
} from './types';

describe('makePairingRequest', () => {
  it('creates envelope with code', () => {
    const msg = makePairingRequest('sess-1', '123456');
    expect(msg.v).toBe(PROTOCOL_VERSION);
    expect(msg.type).toBe('pairing_request');
    expect(msg.session_id).toBe('sess-1');
    expect((msg.payload as any).pairing_code).toBe('123456');
    expect((msg.payload as any).client_pub).toBeUndefined();
  });

  it('includes client_pub when provided', () => {
    const msg = makePairingRequest('sess-1', '123456', 'AAAA');
    expect((msg.payload as any).client_pub).toBe('AAAA');
  });
});

describe('makeUserMessage', () => {
  it('creates plaintext message', () => {
    const msg = makeUserMessage('sess-1', 'tok', 'hello');
    expect(msg.type).toBe('user_message');
    expect((msg.payload as any).content).toBe('hello');
    expect((msg.payload as any).access_token).toBe('tok');
    expect((msg.payload as any).e2e).toBeUndefined();
  });

  it('creates e2e message', () => {
    const e2e = { nonce: 'n', ciphertext: 'ct' };
    const msg = makeUserMessage('sess-1', 'tok', 'hello', e2e);
    expect((msg.payload as any).e2e).toEqual(e2e);
    expect((msg.payload as any).content).toBeUndefined();
  });
});

describe('makeApprovalResponse', () => {
  it('creates approval with request_id', () => {
    const msg = makeApprovalResponse('sess-1', 'tok', true, 'req-1');
    expect(msg.type).toBe('approval_response');
    expect(msg.request_id).toBe('req-1');
    expect((msg.payload as any).approved).toBe(true);
  });
});
```

**Step 3: Configure Vitest**

Add to `vite.config.ts`:
```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

**Step 4: Run tests**

```bash
npx vitest run
```

Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add src/lib/protocol/types.ts src/lib/protocol/types.test.ts vite.config.ts
git commit -m "feat: WebChannel v1 protocol types and message constructors"
```

---

### Task 3: E2E Encryption Module

**Files:**
- Create: `src/lib/protocol/e2e.ts`
- Test: `src/lib/protocol/e2e.test.ts`

**Step 1: Write the failing test**

`src/lib/protocol/e2e.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateKeyPair, deriveSharedKey, encrypt, decrypt, exportPublicKey } from './e2e';

describe('E2E crypto', () => {
  it('generates X25519 keypair', async () => {
    const kp = await generateKeyPair();
    expect(kp.privateKey).toBeDefined();
    expect(kp.publicKey).toBeDefined();
  });

  it('exports public key as base64url', async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    expect(pub).toMatch(/^[A-Za-z0-9_-]+$/); // base64url no padding
  });

  it('derives shared key and encrypts/decrypts roundtrip', async () => {
    const clientKp = await generateKeyPair();
    const serverKp = await generateKeyPair();

    const clientPub = await exportPublicKey(clientKp.publicKey);
    const serverPub = await exportPublicKey(serverKp.publicKey);

    const clientShared = await deriveSharedKey(clientKp.privateKey, serverPub);
    const serverShared = await deriveSharedKey(serverKp.privateKey, clientPub);

    // Both sides should derive the same key
    expect(new Uint8Array(clientShared)).toEqual(new Uint8Array(serverShared));

    const plaintext = '{"content":"hello","sender_id":"ui-1"}';
    const { nonce, ciphertext } = encrypt(clientShared, plaintext);

    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);

    const decrypted = decrypt(serverShared, nonce, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it('decrypt fails with wrong key', async () => {
    const kp1 = await generateKeyPair();
    const kp2 = await generateKeyPair();
    const kp3 = await generateKeyPair();

    const pub2 = await exportPublicKey(kp2.publicKey);
    const pub3 = await exportPublicKey(kp3.publicKey);

    const sharedCorrect = await deriveSharedKey(kp1.privateKey, pub2);
    const sharedWrong = await deriveSharedKey(kp1.privateKey, pub3);

    const { nonce, ciphertext } = encrypt(sharedCorrect, 'secret');
    expect(() => decrypt(sharedWrong, nonce, ciphertext)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/protocol/e2e.test.ts
```

Expected: FAIL (module not found).

**Step 3: Write implementation**

`src/lib/protocol/e2e.ts`:
```ts
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';

const E2E_LABEL = 'webchannel-e2e-v1';

// -- Base64url helpers --

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// -- X25519 key exchange (Web Crypto) --

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64Url(raw);
}

async function importPublicKey(base64url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(base64url);
  return crypto.subtle.importKey('raw', raw, { name: 'X25519' }, true, []);
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  remotePubBase64url: string,
): Promise<Uint8Array> {
  const remotePub = await importPublicKey(remotePubBase64url);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: remotePub },
    privateKey,
    256,
  );
  // SHA-256(label || shared_secret)
  const label = new TextEncoder().encode(E2E_LABEL);
  const combined = new Uint8Array(label.length + sharedBits.byteLength);
  combined.set(label);
  combined.set(new Uint8Array(sharedBits), label.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hash);
}

// -- ChaCha20-Poly1305 symmetric encryption --

export function encrypt(
  sharedKey: Uint8Array,
  plaintext: string,
): { nonce: string; ciphertext: string } {
  const nonce = randomBytes(12);
  const cipher = chacha20poly1305(sharedKey, nonce);
  const data = new TextEncoder().encode(plaintext);
  const sealed = cipher.encrypt(data);
  return {
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(sealed),
  };
}

export function decrypt(
  sharedKey: Uint8Array,
  nonceB64: string,
  ciphertextB64: string,
): string {
  const nonce = fromBase64Url(nonceB64);
  const ciphertext = fromBase64Url(ciphertextB64);
  const cipher = chacha20poly1305(sharedKey, nonce);
  const decrypted = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(decrypted);
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/protocol/e2e.test.ts
```

Expected: All 4 tests pass.

**Step 5: Commit**

```bash
git add src/lib/protocol/e2e.ts src/lib/protocol/e2e.test.ts
git commit -m "feat: E2E encryption with X25519 + ChaCha20-Poly1305"
```

---

### Task 4: WebSocket Client

**Files:**
- Create: `src/lib/protocol/client.svelte.ts`
- Test: `src/lib/protocol/client.test.ts`

**Step 1: Write the failing test**

`src/lib/protocol/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NullclawClient, type ClientState } from './client.svelte';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0; // CONNECTING
  onopen: (() => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }

  // Helpers for tests
  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }
  simulateClose(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' });
  }
}

describe('NullclawClient', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('connects and sends pairing request', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.connect();

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws.url).toBe('ws://localhost:32123/ws');

    ws.simulateOpen();
    client.sendPairingRequest('123456');

    expect(ws.sent.length).toBe(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('pairing_request');
    expect(msg.payload.pairing_code).toBe('123456');
  });

  it('handles pairing result', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e) => events.push(e);
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({
      v: 1,
      type: 'pairing_result',
      session_id: 'sess-1',
      payload: { access_token: 'jwt-123' },
    }));

    expect(client.accessToken).toBe('jwt-123');
    expect(client.state).toBe('paired' as ClientState);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('pairing_result');
  });

  it('sends user message with token', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // Simulate successful pairing
    ws.simulateMessage(JSON.stringify({
      v: 1, type: 'pairing_result', session_id: 'sess-1',
      payload: { access_token: 'jwt-123' },
    }));

    client.sendMessage('hello');
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('user_message');
    expect(msg.payload.content).toBe('hello');
    expect(msg.payload.access_token).toBe('jwt-123');
  });

  it('dispatches assistant_final to event handler', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e) => events.push(e);
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({
      v: 1, type: 'assistant_final', session_id: 'sess-1',
      payload: { content: 'hi there' },
    }));

    expect(events.length).toBe(1);
    expect(events[0].type).toBe('assistant_final');
    expect(events[0].payload.content).toBe('hi there');
  });

  it('handles error events', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e) => events.push(e);
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({
      v: 1, type: 'error', session_id: 'sess-1',
      payload: { message: 'unauthorized', code: 'unauthorized' },
    }));

    expect(events[0].type).toBe('error');
    expect(events[0].payload.code).toBe('unauthorized');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/protocol/client.test.ts
```

Expected: FAIL (module not found).

**Step 3: Write implementation**

`src/lib/protocol/client.svelte.ts`:
```ts
import {
  type Envelope,
  type E2EPayload,
  type PairingResultPayload,
  type ErrorPayload,
  makePairingRequest,
  makeUserMessage,
  makeApprovalResponse,
} from './types';
import { encrypt, decrypt, type E2EState } from './e2e';

export type ClientState = 'disconnected' | 'connecting' | 'pairing' | 'paired' | 'chatting';

export class NullclawClient {
  state: ClientState = $state('disconnected');
  accessToken: string | null = $state(null);
  onEvent: ((event: Envelope) => void) | null = null;

  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private e2eState: { sharedKey: Uint8Array } | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  constructor(url: string, sessionId: string) {
    this.url = url;
    this.sessionId = sessionId;
  }

  connect() {
    this.shouldReconnect = true;
    this.state = 'connecting';
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.state = 'pairing';
      this.reconnectAttempt = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data as string);
    };

    this.ws.onclose = (event: CloseEvent) => {
      const wasConnected = this.state !== 'disconnected' && this.state !== 'connecting';
      this.ws = null;
      this.state = 'disconnected';
      if (this.shouldReconnect && wasConnected && this.accessToken) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.state = 'disconnected';
    this.accessToken = null;
    this.e2eState = null;
  }

  sendPairingRequest(code: string, clientPub?: string) {
    const msg = makePairingRequest(this.sessionId, code, clientPub);
    this.send(msg);
  }

  sendMessage(content: string) {
    if (!this.accessToken) return;

    let e2e: E2EPayload | undefined;
    if (this.e2eState) {
      const plainObj = JSON.stringify({ content, sender_id: 'ui-1' });
      e2e = encrypt(this.e2eState.sharedKey, plainObj);
    }

    const msg = makeUserMessage(this.sessionId, this.accessToken, content, e2e);
    this.send(msg);
    this.state = 'chatting';
  }

  sendApproval(approved: boolean, requestId?: string, reason?: string) {
    if (!this.accessToken) return;
    const msg = makeApprovalResponse(this.sessionId, this.accessToken, approved, requestId, reason);
    this.send(msg);
  }

  setE2EKey(sharedKey: Uint8Array) {
    this.e2eState = { sharedKey };
  }

  private send(msg: Envelope) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleMessage(raw: string) {
    let msg: Envelope;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'pairing_result') {
      const payload = msg.payload as PairingResultPayload;
      this.accessToken = payload.access_token;
      this.state = 'paired';
    }

    if (msg.type === 'error') {
      const payload = msg.payload as ErrorPayload;
      if (payload.code === 'unauthorized') {
        this.accessToken = null;
        this.state = 'pairing';
      }
    }

    // Decrypt E2E if present
    if (msg.payload && 'e2e' in msg.payload && this.e2eState) {
      const e2e = msg.payload.e2e as E2EPayload;
      try {
        const decrypted = decrypt(this.e2eState.sharedKey, e2e.nonce, e2e.ciphertext);
        const parsed = JSON.parse(decrypted);
        (msg.payload as any).content = parsed.content;
      } catch {
        // Decryption failed, pass event as-is
      }
    }

    this.onEvent?.(msg);
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30000);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, jitter);
  }
}
```

**Note:** The `$state` runes will require adjustments when running in Vitest (non-Svelte context). The test file may need a mock or the runes may need to be plain properties in the test. If Vitest doesn't handle `$state` from `.svelte.ts` files, change the test to import from a `.ts` wrapper or use `svelte.config.js` Vitest preprocessor. The scaffold already includes `@sveltejs/kit/vite` plugin which handles `.svelte.ts` compilation in tests.

**Step 4: Run tests**

```bash
npx vitest run src/lib/protocol/client.test.ts
```

Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add src/lib/protocol/client.svelte.ts src/lib/protocol/client.test.ts
git commit -m "feat: WebSocket client with pairing, messaging, reconnection"
```

---

### Task 5: Session State Store

**Files:**
- Create: `src/lib/stores/session.svelte.ts`

**Step 1: Write the store**

`src/lib/stores/session.svelte.ts`:
```ts
import type { Envelope } from '$lib/protocol/types';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  streaming?: boolean;  // true while receiving chunks
  type?: string;        // original event type
}

export interface ToolCall {
  id: string;
  requestId?: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: { ok: boolean; result?: unknown; error?: string };
  timestamp: number;
}

export interface ApprovalRequest {
  id: string;
  requestId?: string;
  action: string;
  reason?: string;
  resolved?: boolean;
  timestamp: number;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

export function createSessionStore() {
  let messages = $state<ChatMessage[]>([]);
  let toolCalls = $state<ToolCall[]>([]);
  let approvals = $state<ApprovalRequest[]>([]);
  let streamingMessageId = $state<string | null>(null);
  let error = $state<string | null>(null);

  function addUserMessage(content: string) {
    messages.push({
      id: nextId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    });
  }

  function handleEvent(event: Envelope) {
    const payload = event.payload as any;
    error = null;

    switch (event.type) {
      case 'assistant_chunk': {
        const content = payload?.content ?? '';
        if (streamingMessageId) {
          const msg = messages.find((m) => m.id === streamingMessageId);
          if (msg) msg.content += content;
        } else {
          const id = nextId();
          messages.push({
            id,
            role: 'assistant',
            content,
            timestamp: Date.now(),
            streaming: true,
          });
          streamingMessageId = id;
        }
        break;
      }

      case 'assistant_final': {
        const content = payload?.content ?? event.content ?? '';
        if (streamingMessageId) {
          const msg = messages.find((m) => m.id === streamingMessageId);
          if (msg) {
            msg.content = content;
            msg.streaming = false;
          }
          streamingMessageId = null;
        } else {
          messages.push({
            id: nextId(),
            role: 'assistant',
            content,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'tool_call': {
        toolCalls.push({
          id: nextId(),
          requestId: event.request_id,
          name: payload.name,
          arguments: payload.arguments,
          timestamp: Date.now(),
        });
        break;
      }

      case 'tool_result': {
        const tc = toolCalls.findLast((t) => t.requestId === event.request_id && !t.result);
        if (tc) {
          tc.result = { ok: payload.ok, result: payload.result, error: payload.error };
        }
        break;
      }

      case 'approval_request': {
        approvals.push({
          id: nextId(),
          requestId: event.request_id,
          action: payload.action,
          reason: payload.reason,
          timestamp: Date.now(),
        });
        break;
      }

      case 'error': {
        error = payload?.message ?? 'Unknown error';
        break;
      }
    }
  }

  function clear() {
    messages = [];
    toolCalls = [];
    approvals = [];
    streamingMessageId = null;
    error = null;
  }

  function resolveApproval(id: string) {
    const a = approvals.find((x) => x.id === id);
    if (a) a.resolved = true;
  }

  return {
    get messages() { return messages; },
    get toolCalls() { return toolCalls; },
    get approvals() { return approvals; },
    get error() { return error; },
    get isStreaming() { return streamingMessageId !== null; },
    addUserMessage,
    handleEvent,
    clear,
    resolveApproval,
  };
}
```

**Step 2: Verify it compiles**

```bash
npx vitest run --passWithNoTests
```

Expected: passes (no tests for this file yet — it's tightly coupled to Svelte reactivity, will be tested via integration).

**Step 3: Commit**

```bash
git add src/lib/stores/session.svelte.ts
git commit -m "feat: reactive session store with message/tool/approval handling"
```

---

### Task 6: StatusBar Component

**Files:**
- Create: `src/lib/components/StatusBar.svelte`

**Step 1: Write component**

`src/lib/components/StatusBar.svelte`:
```svelte
<script lang="ts">
  import type { ClientState } from '$lib/protocol/client.svelte';

  interface Props {
    state: ClientState;
    sessionId: string;
    e2eEnabled: boolean;
  }

  let { state, sessionId, e2eEnabled }: Props = $props();

  const statusColor = $derived(
    state === 'chatting' || state === 'paired' ? 'var(--accent)'
    : state === 'connecting' || state === 'pairing' ? 'var(--warning)'
    : 'var(--error)'
  );

  const statusText = $derived(
    state === 'disconnected' ? 'disconnected'
    : state === 'connecting' ? 'connecting...'
    : state === 'pairing' ? 'pairing...'
    : state === 'paired' ? 'paired'
    : 'connected'
  );
</script>

<header class="status-bar">
  <div class="left">
    <span class="dot" style:background={statusColor}></span>
    <span class="status-text">{statusText}</span>
  </div>
  <div class="center">
    <span class="session-id">{sessionId}</span>
  </div>
  <div class="right">
    {#if e2eEnabled}
      <span class="e2e-badge" title="End-to-end encrypted">&#x1f512; e2e</span>
    {:else}
      <span class="e2e-off" title="No encryption">&#x1f513;</span>
    {/if}
  </div>
</header>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    gap: 12px;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .center {
    flex: 1;
    text-align: center;
    color: var(--fg-dim);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-text {
    color: var(--fg-dim);
  }

  .session-id {
    font-size: 11px;
  }

  .e2e-badge {
    color: var(--accent);
  }

  .e2e-off {
    color: var(--fg-dim);
  }
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/StatusBar.svelte
git commit -m "feat: StatusBar component with connection and E2E indicators"
```

---

### Task 7: PairingScreen Component

**Files:**
- Create: `src/lib/components/PairingScreen.svelte`

**Step 1: Write component**

`src/lib/components/PairingScreen.svelte`:
```svelte
<script lang="ts">
  interface Props {
    defaultUrl?: string;
    connecting?: boolean;
    error?: string | null;
    onConnect: (url: string, code: string, e2eEnabled: boolean) => void;
  }

  let { defaultUrl = 'ws://127.0.0.1:32123/ws', connecting = false, error = null, onConnect }: Props = $props();

  let url = $state(defaultUrl);
  let code = $state('');
  let e2eEnabled = $state(false);

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) return;
    onConnect(url, trimmed, e2eEnabled);
  }

  function handleCodeInput(e: Event) {
    const input = e.target as HTMLInputElement;
    // Only digits, max 6
    code = input.value.replace(/\D/g, '').slice(0, 6);
  }
</script>

<div class="pairing-screen">
  <div class="card">
    <h1 class="title">nullclaw</h1>
    <p class="subtitle">webchannel pairing</p>

    <form onsubmit={handleSubmit}>
      <label class="field">
        <span class="label">endpoint</span>
        <input
          type="text"
          bind:value={url}
          placeholder="ws://127.0.0.1:32123/ws"
          disabled={connecting}
        />
      </label>

      <label class="field">
        <span class="label">pairing code</span>
        <input
          type="text"
          value={code}
          oninput={handleCodeInput}
          placeholder="000000"
          maxlength="6"
          inputmode="numeric"
          autocomplete="off"
          disabled={connecting}
          class="code-input"
        />
      </label>

      <label class="field toggle">
        <input type="checkbox" bind:checked={e2eEnabled} disabled={connecting} />
        <span class="label">end-to-end encryption (X25519 + ChaCha20)</span>
      </label>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" disabled={connecting || code.length !== 6}>
        {connecting ? 'connecting...' : 'connect'}
      </button>
    </form>
  </div>
</div>

<style>
  .pairing-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }

  .card {
    width: 100%;
    max-width: 400px;
    padding: 32px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-surface);
  }

  .title {
    font-size: 24px;
    color: var(--accent);
    font-weight: 400;
    margin-bottom: 4px;
  }

  .subtitle {
    color: var(--fg-dim);
    font-size: 13px;
    margin-bottom: 24px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field.toggle {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .field.toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }

  .label {
    font-size: 12px;
    color: var(--fg-dim);
    text-transform: lowercase;
  }

  .code-input {
    font-size: 24px;
    letter-spacing: 8px;
    text-align: center;
    padding: 12px;
  }

  .error {
    color: var(--error);
    font-size: 13px;
    padding: 8px;
    border: 1px solid var(--error);
    border-radius: 4px;
    background: rgba(255, 68, 68, 0.1);
  }

  button[type="submit"] {
    padding: 12px;
    font-size: 14px;
    text-transform: lowercase;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/PairingScreen.svelte
git commit -m "feat: PairingScreen with URL, code input, and E2E toggle"
```

---

### Task 8: Message Components (MessageBubble, ToolCallBlock, ApprovalPrompt)

**Files:**
- Create: `src/lib/components/MessageBubble.svelte`
- Create: `src/lib/components/ToolCallBlock.svelte`
- Create: `src/lib/components/ApprovalPrompt.svelte`

**Step 1: MessageBubble**

`src/lib/components/MessageBubble.svelte`:
```svelte
<script lang="ts">
  import type { ChatMessage } from '$lib/stores/session.svelte';

  interface Props {
    message: ChatMessage;
  }

  let { message }: Props = $props();

  const isUser = $derived(message.role === 'user');
  const time = $derived(new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
</script>

<div class="bubble" class:user={isUser} class:assistant={!isUser}>
  <div class="content">
    {#if message.streaming}
      <span class="text">{message.content}</span><span class="cursor">&#x2588;</span>
    {:else}
      <span class="text">{message.content}</span>
    {/if}
  </div>
  <span class="timestamp">{time}</span>
</div>

<style>
  .bubble {
    max-width: 80%;
    padding: 8px 12px;
    border-radius: 6px;
    margin: 4px 0;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .user {
    align-self: flex-end;
    border: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .assistant {
    align-self: flex-start;
    border: 1px solid var(--accent-dim);
    background: rgba(0, 255, 65, 0.03);
  }

  .content {
    font-size: 14px;
    line-height: 1.5;
  }

  .cursor {
    color: var(--accent);
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }

  .timestamp {
    display: block;
    font-size: 10px;
    color: var(--fg-dim);
    margin-top: 4px;
    text-align: right;
  }
</style>
```

**Step 2: ToolCallBlock**

`src/lib/components/ToolCallBlock.svelte`:
```svelte
<script lang="ts">
  import type { ToolCall } from '$lib/stores/session.svelte';

  interface Props {
    toolCall: ToolCall;
  }

  let { toolCall }: Props = $props();
</script>

<details class="tool-call">
  <summary>
    <span class="icon">&#x2699;</span>
    <span class="name">{toolCall.name}</span>
    {#if toolCall.result}
      <span class="status" class:ok={toolCall.result.ok} class:fail={!toolCall.result.ok}>
        {toolCall.result.ok ? 'ok' : 'fail'}
      </span>
    {:else}
      <span class="status pending">running...</span>
    {/if}
  </summary>
  <div class="body">
    <div class="section">
      <span class="label">arguments</span>
      <pre>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
    </div>
    {#if toolCall.result}
      <div class="section">
        <span class="label">result</span>
        {#if toolCall.result.error}
          <pre class="error-text">{toolCall.result.error}</pre>
        {:else}
          <pre>{JSON.stringify(toolCall.result.result, null, 2)}</pre>
        {/if}
      </div>
    {/if}
  </div>
</details>

<style>
  .tool-call {
    margin: 4px 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    max-width: 90%;
  }

  summary {
    padding: 6px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-dim);
    user-select: none;
  }

  summary:hover {
    background: var(--bg-hover);
  }

  .icon { font-size: 14px; }
  .name { color: var(--fg); }

  .status {
    margin-left: auto;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .ok { color: var(--accent); border: 1px solid var(--accent-dim); }
  .fail { color: var(--error); border: 1px solid var(--error); }
  .pending { color: var(--warning); border: 1px solid var(--warning); }

  .body {
    padding: 8px 10px;
    border-top: 1px solid var(--border);
  }

  .section { margin-bottom: 8px; }
  .label {
    display: block;
    font-size: 10px;
    color: var(--fg-dim);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  pre {
    background: var(--bg);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
    margin: 0;
  }

  .error-text { color: var(--error); }
</style>
```

**Step 3: ApprovalPrompt**

`src/lib/components/ApprovalPrompt.svelte`:
```svelte
<script lang="ts">
  import type { ApprovalRequest } from '$lib/stores/session.svelte';

  interface Props {
    approval: ApprovalRequest;
    onRespond: (id: string, requestId: string | undefined, approved: boolean) => void;
  }

  let { approval, onRespond }: Props = $props();
</script>

<div class="approval" class:resolved={approval.resolved}>
  <div class="header">
    <span class="icon">&#x26a0;</span>
    <span class="label">approval required</span>
  </div>
  <div class="action">{approval.action}</div>
  {#if approval.reason}
    <div class="reason">{approval.reason}</div>
  {/if}
  {#if !approval.resolved}
    <div class="buttons">
      <button class="approve" onclick={() => onRespond(approval.id, approval.requestId, true)}>
        approve
      </button>
      <button class="deny" onclick={() => onRespond(approval.id, approval.requestId, false)}>
        deny
      </button>
    </div>
  {:else}
    <div class="resolved-text">resolved</div>
  {/if}
</div>

<style>
  .approval {
    margin: 4px 0;
    border: 1px solid var(--warning);
    border-radius: 6px;
    padding: 12px;
    background: rgba(255, 170, 0, 0.05);
    max-width: 80%;
  }

  .approval.resolved {
    opacity: 0.5;
    border-color: var(--border);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--warning);
    margin-bottom: 8px;
  }

  .icon { font-size: 16px; }

  .action {
    font-size: 14px;
    margin-bottom: 4px;
  }

  .reason {
    font-size: 12px;
    color: var(--fg-dim);
    margin-bottom: 8px;
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  .approve {
    border-color: var(--accent-dim);
    color: var(--accent);
  }

  .deny {
    border-color: var(--error);
    color: var(--error);
  }

  .resolved-text {
    font-size: 12px;
    color: var(--fg-dim);
  }
</style>
```

**Step 4: Commit**

```bash
git add src/lib/components/MessageBubble.svelte src/lib/components/ToolCallBlock.svelte src/lib/components/ApprovalPrompt.svelte
git commit -m "feat: MessageBubble, ToolCallBlock, and ApprovalPrompt components"
```

---

### Task 9: ChatScreen Component

**Files:**
- Create: `src/lib/components/ChatScreen.svelte`

**Step 1: Write component**

`src/lib/components/ChatScreen.svelte`:
```svelte
<script lang="ts">
  import type { ChatMessage, ToolCall, ApprovalRequest } from '$lib/stores/session.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import ToolCallBlock from './ToolCallBlock.svelte';
  import ApprovalPrompt from './ApprovalPrompt.svelte';

  interface Props {
    messages: ChatMessage[];
    toolCalls: ToolCall[];
    approvals: ApprovalRequest[];
    error: string | null;
    isStreaming: boolean;
    onSend: (content: string) => void;
    onApproval: (id: string, requestId: string | undefined, approved: boolean) => void;
  }

  let { messages, toolCalls, approvals, error, isStreaming, onSend, onApproval }: Props = $props();

  let input = $state('');
  let messagesEnd: HTMLDivElement;

  // Build timeline of all items sorted by timestamp
  type TimelineItem =
    | { kind: 'message'; data: ChatMessage }
    | { kind: 'tool_call'; data: ToolCall }
    | { kind: 'approval'; data: ApprovalRequest };

  const timeline = $derived.by(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({ kind: 'message' as const, data: m })),
      ...toolCalls.map((t) => ({ kind: 'tool_call' as const, data: t })),
      ...approvals.map((a) => ({ kind: 'approval' as const, data: a })),
    ];
    items.sort((a, b) => a.data.timestamp - b.data.timestamp);
    return items;
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    input = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  $effect(() => {
    // Scroll to bottom on new messages
    if (messages.length || toolCalls.length || approvals.length) {
      messagesEnd?.scrollIntoView({ behavior: 'smooth' });
    }
  });
</script>

<div class="chat-screen">
  <div class="messages">
    {#each timeline as item (item.data.id)}
      {#if item.kind === 'message'}
        <MessageBubble message={item.data} />
      {:else if item.kind === 'tool_call'}
        <ToolCallBlock toolCall={item.data} />
      {:else if item.kind === 'approval'}
        <ApprovalPrompt approval={item.data} onRespond={onApproval} />
      {/if}
    {/each}
    <div bind:this={messagesEnd}></div>
  </div>

  {#if error}
    <div class="error-bar">{error}</div>
  {/if}

  <form class="input-area" onsubmit={handleSubmit}>
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="type a message..."
      rows="1"
      disabled={isStreaming}
    ></textarea>
    <button type="submit" disabled={!input.trim() || isStreaming}>
      &#x23CE;
    </button>
  </form>
</div>

<style>
  .chat-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .error-bar {
    padding: 8px 16px;
    background: rgba(255, 68, 68, 0.1);
    border-top: 1px solid var(--error);
    color: var(--error);
    font-size: 13px;
  }

  .input-area {
    display: flex;
    padding: 12px 16px;
    gap: 8px;
    border-top: 1px solid var(--border);
    background: var(--bg-surface);
  }

  textarea {
    flex: 1;
    resize: none;
    min-height: 36px;
    max-height: 120px;
    line-height: 1.5;
  }

  .input-area button {
    align-self: flex-end;
    padding: 8px 16px;
    font-size: 18px;
  }
</style>
```

**Step 2: Commit**

```bash
git add src/lib/components/ChatScreen.svelte
git commit -m "feat: ChatScreen with timeline, input, and auto-scroll"
```

---

### Task 10: Wire Everything in +page.svelte

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Write the page orchestrator**

`src/routes/+page.svelte`:
```svelte
<script lang="ts">
  import StatusBar from '$lib/components/StatusBar.svelte';
  import PairingScreen from '$lib/components/PairingScreen.svelte';
  import ChatScreen from '$lib/components/ChatScreen.svelte';
  import { NullclawClient } from '$lib/protocol/client.svelte';
  import { createSessionStore } from '$lib/stores/session.svelte';
  import { generateKeyPair, exportPublicKey, deriveSharedKey } from '$lib/protocol/e2e';

  const sessionId = `sess-${Date.now()}`;
  let client: NullclawClient | null = $state(null);
  let pairingError = $state<string | null>(null);
  let e2eEnabled = $state(false);
  let e2eKeyPair: CryptoKeyPair | null = null;

  const session = createSessionStore();

  // Derived from client state
  const clientState = $derived(client?.state ?? 'disconnected');
  const isPaired = $derived(clientState === 'paired' || clientState === 'chatting');

  async function handleConnect(url: string, code: string, useE2e: boolean) {
    pairingError = null;
    e2eEnabled = useE2e;

    const newClient = new NullclawClient(url, sessionId);

    newClient.onEvent = async (event) => {
      if (event.type === 'pairing_result') {
        const payload = event.payload as any;
        // Handle E2E key exchange
        if (e2eEnabled && payload?.e2e?.agent_pub && e2eKeyPair) {
          const sharedKey = await deriveSharedKey(e2eKeyPair.privateKey, payload.e2e.agent_pub);
          newClient.setE2EKey(sharedKey);
        }
      } else if (event.type === 'error') {
        const payload = event.payload as any;
        if (newClient.state === 'pairing') {
          pairingError = payload?.message ?? 'Pairing failed';
        }
      }

      // Forward all events to session store
      session.handleEvent(event);
    };

    client = newClient;
    client.connect();

    // Wait for WebSocket to open, then send pairing request
    // Use a simple poll since WS open is fast
    const waitForOpen = () => new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (client?.state === 'pairing') {
          clearInterval(check);
          resolve();
        } else if (client?.state === 'disconnected') {
          clearInterval(check);
          reject(new Error('Connection failed'));
        }
      }, 50);
      setTimeout(() => { clearInterval(check); reject(new Error('Timeout')); }, 10000);
    });

    try {
      await waitForOpen();
    } catch {
      pairingError = 'Could not connect to server';
      return;
    }

    // Generate E2E keypair if enabled
    let clientPub: string | undefined;
    if (useE2e) {
      e2eKeyPair = await generateKeyPair();
      clientPub = await exportPublicKey(e2eKeyPair.publicKey);
    }

    client.sendPairingRequest(code, clientPub);
  }

  function handleSend(content: string) {
    if (!client) return;
    session.addUserMessage(content);
    client.sendMessage(content);
  }

  function handleApproval(id: string, requestId: string | undefined, approved: boolean) {
    if (!client) return;
    session.resolveApproval(id);
    client.sendApproval(approved, requestId);
  }

  function handleDisconnect() {
    client?.disconnect();
    client = null;
    session.clear();
    pairingError = null;
    e2eKeyPair = null;
  }
</script>

<div class="app">
  <StatusBar
    state={clientState}
    {sessionId}
    {e2eEnabled}
  />

  {#if isPaired}
    <ChatScreen
      messages={session.messages}
      toolCalls={session.toolCalls}
      approvals={session.approvals}
      error={session.error}
      isStreaming={session.isStreaming}
      onSend={handleSend}
      onApproval={handleApproval}
    />
  {:else}
    <PairingScreen
      connecting={clientState === 'connecting' || clientState === 'pairing'}
      error={pairingError}
      onConnect={handleConnect}
    />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
</style>
```

**Step 2: Also create the layout file**

`src/routes/+layout.ts`:
```ts
export const prerender = true;
export const ssr = false;
```

**Step 3: Verify dev server**

```bash
npm run dev
```

Expected: App shows on localhost:5173 with pairing screen.

**Step 4: Build for production**

```bash
npm run build
```

Expected: Static files in `build/` directory.

**Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/+layout.ts
git commit -m "feat: wire pairing, chat, and E2E in page orchestrator"
```

---

### Task 11: Manual Smoke Test

**No files changed — verification only.**

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Open in browser**

Go to `http://localhost:5173`. Verify:
- Dark terminal theme renders
- Pairing screen shows with URL input, code input, E2E toggle
- StatusBar shows "disconnected" with red dot
- Code input only accepts 6 digits
- Connect button is disabled until code is 6 digits

**Step 3: Test connection attempt to non-existent server**

Enter code `123456`, click Connect. Verify:
- Status changes to "connecting..." briefly
- Error message: "Could not connect to server"
- Returns to pairing screen

**Step 4: Build and preview**

```bash
npm run build && npm run preview
```

Verify: Same behavior at `http://localhost:4173`.

**Step 5: Commit any fixes discovered during smoke test**

```bash
git add -A && git commit -m "fix: smoke test fixes" --allow-empty
```

---

### Task 12: Production Build Verification

**Step 1: Verify static output**

```bash
ls -la build/
```

Expected: `index.html`, `_app/` directory with JS/CSS bundles.

**Step 2: Serve with any static server**

```bash
npx serve build
```

Verify: Works as standalone static site.

**Step 3: Final commit if all clean**

```bash
git status
```

If clean, no commit needed. Done.

---

## Summary of Commits

1. `scaffold: SvelteKit SPA with adapter-static and dark theme`
2. `feat: WebChannel v1 protocol types and message constructors`
3. `feat: E2E encryption with X25519 + ChaCha20-Poly1305`
4. `feat: WebSocket client with pairing, messaging, reconnection`
5. `feat: reactive session store with message/tool/approval handling`
6. `feat: StatusBar component with connection and E2E indicators`
7. `feat: PairingScreen with URL, code input, and E2E toggle`
8. `feat: MessageBubble, ToolCallBlock, and ApprovalPrompt components`
9. `feat: ChatScreen with timeline, input, and auto-scroll`
10. `feat: wire pairing, chat, and E2E in page orchestrator`
11. `fix: smoke test fixes` (if needed)
