import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
}

let createConnectionController: any;
let saveStoredAuth: any;

describe('createConnectionController', () => {
  beforeEach(async () => {
    MockWebSocket.instances = [];
    vi.stubGlobal('localStorage', new MockStorage());
    vi.stubGlobal('WebSocket', MockWebSocket);

    const authMod = await import('./auth-storage');
    saveStoredAuth = authMod.saveStoredAuth;

    const mod = await import('./connection-controller.svelte');
    createConnectionController = mod.createConnectionController;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('restores saved session and reconnects with saved endpoint', () => {
    saveStoredAuth('ws://localhost:32123/ws', 'token-1', new Uint8Array(32).fill(7), 3600);

    const controller = createConnectionController('sess-1');
    controller.restoreSavedSession();

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://localhost:32123/ws');

    ws.simulateOpen();

    expect(controller.clientState).toBe('paired');
    expect(controller.endpointUrl).toBe('ws://localhost:32123/ws');
  });

  it('sets local error when send fails on closed socket', () => {
    saveStoredAuth('ws://localhost:32123/ws', 'token-1', new Uint8Array(32).fill(7), 3600);

    const controller = createConnectionController('sess-1');
    controller.restoreSavedSession();

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.readyState = 3;
    const sent = controller.sendMessage('hello');

    expect(sent).toBe(false);
    expect(controller.session.error).toBe('Could not send message. Connection is not ready.');
  });
});
