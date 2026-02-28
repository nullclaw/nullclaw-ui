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
    client.sendPairingRequest('123456');

    expect(ws.sent.length).toBe(1);
    const msg = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('pairing_request');
    expect(msg.payload.pairing_code).toBe('123456');
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

    client.sendMessage('hello');
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
    client.sendMessage('hello');

    expect(client.state).toBe('paired');
    expect(ws.sent.length).toBe(0);
  });

  it('restores auth and skips pairing on reconnect', () => {
    const client = new NullclawClient('ws://localhost:32123/ws', 'sess-1');
    client.restoreSession('jwt-123', new Uint8Array(32).fill(7));
    client.connect();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    expect(client.state).toBe('paired');
    expect(ws.sent.length).toBe(0);

    client.sendMessage('hello');
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
