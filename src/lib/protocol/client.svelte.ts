import {
  type Envelope,
  type E2EPayload,
  type PairingResultPayload,
  type ErrorPayload,
  makePairingRequest,
  makeUserMessage,
  makeApprovalResponse,
} from './types';
import { encrypt, decrypt } from './e2e';

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

  private asObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private parsePairingResultPayload(value: unknown): PairingResultPayload | null {
    const obj = this.asObject(value);
    if (!obj) return null;
    if (typeof obj.access_token !== 'string' || obj.access_token.length === 0) return null;

    const parsed: PairingResultPayload = {
      access_token: obj.access_token,
    };
    if (typeof obj.set_cookie === 'string') parsed.set_cookie = obj.set_cookie;
    const e2e = this.asObject(obj.e2e);
    if (e2e && typeof e2e.agent_pub === 'string') {
      parsed.e2e = { agent_pub: e2e.agent_pub };
    }
    return parsed;
  }

  private parseErrorPayload(value: unknown): ErrorPayload | null {
    const obj = this.asObject(value);
    if (!obj) return null;
    if (typeof obj.message !== 'string' || obj.message.length === 0) return null;
    return {
      message: obj.message,
      code: typeof obj.code === 'string' ? obj.code : undefined,
    };
  }

  constructor(url: string, sessionId: string) {
    this.url = url;
    this.sessionId = sessionId;
  }

  connect() {
    this.shouldReconnect = true;
    this.state = 'connecting';
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.state = this.accessToken ? 'paired' : 'pairing';
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

  restoreSession(accessToken: string, sharedKey: Uint8Array) {
    this.accessToken = accessToken;
    this.e2eState = { sharedKey: new Uint8Array(sharedKey) };
    this.state = 'paired';
  }

  clearSessionAuth() {
    this.accessToken = null;
    this.e2eState = null;
    if (this.ws?.readyState === 1) {
      this.state = 'pairing';
    } else {
      this.state = 'disconnected';
    }
  }

  getSessionAuth(): { accessToken: string; sharedKey: Uint8Array } | null {
    if (!this.accessToken || !this.e2eState) return null;
    return {
      accessToken: this.accessToken,
      sharedKey: new Uint8Array(this.e2eState.sharedKey),
    };
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
      const payload = this.parsePairingResultPayload(msg.payload);
      if (!payload) return;
      this.accessToken = payload.access_token;
      this.state = 'paired';
    }

    if (msg.type === 'error') {
      const payload = this.parseErrorPayload(msg.payload);
      if (!payload) return;
      if (payload.code === 'unauthorized') {
        this.clearSessionAuth();
      }
    }

    // Decrypt E2E if present
    const payloadObj = this.asObject(msg.payload);
    if (payloadObj && 'e2e' in payloadObj && this.e2eState) {
      const e2eRaw = this.asObject(payloadObj.e2e);
      if (!e2eRaw || typeof e2eRaw.nonce !== 'string' || typeof e2eRaw.ciphertext !== 'string') {
        this.onEvent?.(msg);
        return;
      }
      const e2e: E2EPayload = { nonce: e2eRaw.nonce, ciphertext: e2eRaw.ciphertext };
      try {
        const decrypted = decrypt(this.e2eState.sharedKey, e2e.nonce, e2e.ciphertext);
        const parsed = JSON.parse(decrypted);
        if (typeof parsed?.content === 'string') {
          payloadObj.content = parsed.content;
        }
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
