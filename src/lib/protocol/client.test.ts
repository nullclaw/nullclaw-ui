import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We can't use $state runes outside Svelte compilation, so we test the
// client logic via a plain wrapper. The .svelte.ts file compiles to JS
// where $state becomes regular properties when processed by the Svelte
// Vite plugin during test runs.

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
    this.onmessage?.({ data } as any);
  }
  simulateClose(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code, reason: '' } as any);
  }
}

// Import after mocking may be needed — let's use dynamic import
let NullclawClient: any;

describe('NullclawClient', () => {
  beforeEach(async () => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    // Dynamic import to ensure mock is in place
    const mod = await import('./client.svelte');
    NullclawClient = mod.NullclawClient;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('connects and sends pairing request', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.connect();

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();
    expect(ws.url).toBe('ws://localhost:32123/ws');

    ws.simulateOpen();
    const sent = client.sendPairingRequest('123456');
    expect(sent).toBe(true);

    expect(ws.sent.length).toBe(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('pairing_request');
    expect(msg.payload.pairing_code).toBe('123456');
  });

  it('returns false for pairing request when socket is not open', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.readyState = 3;

    const sent = client.sendPairingRequest('123456');
    expect(sent).toBe(false);
  });

  it('does not open duplicate sockets on repeated connect calls', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');

    client.connect();
    client.connect();

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('handles pairing result', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e: any) => events.push(e);
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
    expect(client.state).toBe('paired');
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

    const sent = client.sendMessage('hello');
    expect(sent).toBe(true);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('user_message');
    expect(msg.payload.content).toBe('hello');
    expect(msg.payload.access_token).toBe('jwt-123');
  });

  it('dispatches assistant_final to event handler', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e: any) => events.push(e);
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

  it('decrypts e2e assistant_chunk payload before dispatch', async () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    const sharedKey = new Uint8Array(32).fill(7);
    client.restoreSession('jwt-123', sharedKey);
    client.onEvent = (e: any) => events.push(e);
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const { encrypt } = await import('./e2e');
    const encrypted = encrypt(sharedKey, JSON.stringify({ content: 'chunk-1' }));

    ws.simulateMessage(JSON.stringify({
      v: 1,
      type: 'assistant_chunk',
      session_id: 'sess-1',
      payload: { e2e: encrypted },
    }));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('assistant_chunk');
    expect(events[0].payload.content).toBe('chunk-1');
  });

  it('does not switch to chatting when socket is not open', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage(JSON.stringify({
      v: 1, type: 'pairing_result', session_id: 'sess-1',
      payload: { access_token: 'jwt-123' },
    }));

    ws.readyState = 3; // CLOSED
    const sent = client.sendMessage('hello');

    expect(sent).toBe(false);
    expect(client.state).toBe('paired');
    expect(ws.sent.length).toBe(0);
  });

  it('reconnects with backoff when paired socket closes unexpectedly', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.restoreSession('jwt-123', new Uint8Array(32).fill(7));
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateClose(1006);

    expect(client.state).toBe('disconnected');
    expect(MockWebSocket.instances.length).toBe(1);

    // delay = 1000 * (0.5 + random() * 0.5) with random()=0 => 500ms
    vi.advanceTimersByTime(499);
    expect(MockWebSocket.instances.length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('does not reconnect after explicit disconnect()', () => {
    vi.useFakeTimers();

    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.restoreSession('jwt-123', new Uint8Array(32).fill(7));
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    client.disconnect();
    ws.simulateClose(1000);

    vi.advanceTimersByTime(30_000);
    expect(MockWebSocket.instances.length).toBe(1);
    expect(client.state).toBe('disconnected');
  });

  it('restores auth and skips pairing on reconnect', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.restoreSession('jwt-123', new Uint8Array(32).fill(7));
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    expect(client.state).toBe('paired');
    expect(ws.sent.length).toBe(0);

    const sent = client.sendMessage('hello');
    expect(sent).toBe(true);
    expect(ws.sent.length).toBe(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('user_message');
    expect(msg.payload.access_token).toBe('jwt-123');
    expect(msg.payload.e2e).toBeDefined();
  });

  it('handles error events', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e: any) => events.push(e);
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

  it('returns false for approval send when socket is closed', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({
      v: 1, type: 'pairing_result', session_id: 'sess-1',
      payload: { access_token: 'jwt-123' },
    }));

    ws.readyState = 3;
    const sent = client.sendApproval(true, 'req-1');
    expect(sent).toBe(false);
    expect(ws.sent).toHaveLength(0);
  });

  it('ignores malformed envelopes', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e: any) => events.push(e);
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(
      JSON.stringify({
        v: 999,
        type: 'assistant_final',
        session_id: 'sess-1',
        payload: { content: 'unexpected' },
      }),
    );
    ws.simulateMessage(
      JSON.stringify({
        v: 1,
        type: 'assistant_final',
        session_id: '',
        payload: { content: 'unexpected' },
      }),
    );

    expect(events).toHaveLength(0);
  });

  it('emits client error when websocket constructor throws', () => {
    class ThrowingWebSocket {
      constructor() {
        throw new Error('boom');
      }
    }

    vi.stubGlobal('WebSocket', ThrowingWebSocket);

    const client = new NullclawClient('::::invalid-url::::', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e: any) => events.push(e);
    client.connect();

    expect(client.state).toBe('disconnected');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].payload.code).toBe('invalid_websocket_url');
  });

  it('emits protocol error for malformed pairing_result payload', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    const events: any[] = [];
    client.onEvent = (e: any) => events.push(e);
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({
      v: 1,
      type: 'pairing_result',
      session_id: 'sess-1',
      payload: {},
    }));

    expect(client.accessToken).toBeNull();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('error');
    expect(events[0].payload.code).toBe('malformed_pairing_result');
  });
});
