import {
  PROTOCOL_VERSION,
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

const WS_CONNECTING_STATE = 0;
const WS_OPEN_STATE = 1;
const RECONNECT_BASE_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const EVENT_TYPES = new Set([
  'pairing_request',
  'pairing_result',
  'user_message',
  'assistant_chunk',
  'assistant_final',
  'tool_call',
  'tool_result',
  'approval_request',
  'approval_response',
  'error',
]);

type EnvelopeObject = Record<string, unknown>;

export class NullclawClient {
  state: ClientState = $state('disconnected');
  accessToken: string | null = $state(null);
  onEvent: ((event: Envelope) => void) | null = null;

  private ws: WebSocket | null = null;
  public url: string;
  private sessionId: string;
  private e2eState: { sharedKey: Uint8Array } | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private connectionSeq = 0;

  constructor(url: string, sessionId: string) {
    this.url = url;
    this.sessionId = sessionId;
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WS_CONNECTING_STATE || this.ws.readyState === WS_OPEN_STATE)
    ) {
      return;
    }

    this.shouldReconnect = true;
    this.clearReconnectTimer();
    this.state = 'connecting';

    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.state = 'disconnected';
      this.emitClientError('Could not open WebSocket connection', 'invalid_websocket_url');
      return;
    }

    const seq = ++this.connectionSeq;
    this.ws = socket;

    socket.onopen = () => {
      if (!this.isSocketCurrent(socket, seq)) return;
      this.state = this.accessToken ? 'paired' : 'pairing';
      this.reconnectAttempt = 0;
    };

    socket.onmessage = (event: MessageEvent) => {
      if (!this.isSocketCurrent(socket, seq)) return;
      if (typeof event.data !== 'string') return;
      this.handleMessage(event.data);
    };

    socket.onclose = () => {
      if (!this.isSocketCurrent(socket, seq)) return;

      const wasSessionReady = this.state === 'paired' || this.state === 'chatting';
      this.ws = null;
      this.state = 'disconnected';

      if (this.shouldReconnect && wasSessionReady && this.accessToken) {
        this.scheduleReconnect();
      }
    };

    socket.onerror = () => {
      // onclose will follow on transport failures
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.connectionSeq++;

    const socket = this.ws;
    this.ws = null;

    if (
      socket &&
      (socket.readyState === WS_CONNECTING_STATE || socket.readyState === WS_OPEN_STATE)
    ) {
      socket.close();
    }

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
    this.state = this.ws?.readyState === WS_OPEN_STATE ? 'pairing' : 'disconnected';
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
      try {
        e2e = encrypt(this.e2eState.sharedKey, plainObj);
      } catch {
        this.emitClientError('Could not encrypt outgoing message', 'e2e_encrypt_failed');
        return;
      }
    }

    const msg = makeUserMessage(this.sessionId, this.accessToken, content, e2e);
    if (this.send(msg)) {
      this.state = 'chatting';
    }
  }

  sendApproval(approved: boolean, requestId?: string, reason?: string) {
    if (!this.accessToken) return;
    const msg = makeApprovalResponse(this.sessionId, this.accessToken, approved, requestId, reason);
    this.send(msg);
  }

  setE2EKey(sharedKey: Uint8Array) {
    this.e2eState = { sharedKey: new Uint8Array(sharedKey) };
  }

  private asObject(value: unknown): EnvelopeObject | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as EnvelopeObject;
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
    if (typeof obj.expires_in === 'number' && Number.isFinite(obj.expires_in) && obj.expires_in > 0) {
      parsed.expires_in = Math.floor(obj.expires_in);
    }

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

  private parseEnvelope(raw: string): Envelope | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const obj = this.asObject(parsed);
    if (!obj) return null;
    if (obj.v !== PROTOCOL_VERSION) return null;
    if (typeof obj.type !== 'string' || !EVENT_TYPES.has(obj.type)) return null;
    if (typeof obj.session_id !== 'string' || obj.session_id.length === 0) return null;

    const envelope: Envelope = {
      v: PROTOCOL_VERSION,
      type: obj.type as Envelope['type'],
      session_id: obj.session_id,
    };

    if (typeof obj.agent_id === 'string') envelope.agent_id = obj.agent_id;
    if (typeof obj.request_id === 'string') envelope.request_id = obj.request_id;
    if ('payload' in obj) envelope.payload = obj.payload;
    if (typeof obj.content === 'string') envelope.content = obj.content;

    return envelope;
  }

  private tryDecryptMessage(msg: Envelope) {
    if (!this.e2eState) return;
    const payloadObj = this.asObject(msg.payload);
    if (!payloadObj) return;

    const e2eRaw = this.asObject(payloadObj.e2e);
    if (!e2eRaw || typeof e2eRaw.nonce !== 'string' || typeof e2eRaw.ciphertext !== 'string') {
      return;
    }

    const e2e: E2EPayload = { nonce: e2eRaw.nonce, ciphertext: e2eRaw.ciphertext };

    try {
      const decrypted = decrypt(this.e2eState.sharedKey, e2e.nonce, e2e.ciphertext);
      const parsed = JSON.parse(decrypted);
      const decryptedObj = this.asObject(parsed);
      if (decryptedObj && typeof decryptedObj.content === 'string') {
        payloadObj.content = decryptedObj.content;
      }
    } catch {
      // Ignore malformed encrypted payloads and pass through raw event.
    }
  }

  private send(msg: Envelope): boolean {
    if (this.ws?.readyState !== WS_OPEN_STATE) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private handleMessage(raw: string) {
    const msg = this.parseEnvelope(raw);
    if (!msg) return;

    if (msg.type === 'pairing_result') {
      const payload = this.parsePairingResultPayload(msg.payload);
      if (!payload) {
        this.emitClientError('Received malformed pairing result', 'malformed_pairing_result');
        return;
      }
      this.accessToken = payload.access_token;
      this.state = 'paired';
      msg.payload = payload;
    }

    if (msg.type === 'error') {
      const payload = this.parseErrorPayload(msg.payload);
      if (!payload) {
        this.emitClientError('Received malformed error payload', 'malformed_error_payload');
        return;
      }
      msg.payload = payload;
      if (payload.code === 'unauthorized') {
        this.clearSessionAuth();
      }
    }

    this.tryDecryptMessage(msg);
    this.onEvent?.(msg);
  }

  private scheduleReconnect() {
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    const jitter = delay * (0.5 + Math.random() * 0.5);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, jitter);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private emitClientError(message: string, code = 'client_error') {
    this.onEvent?.({
      v: PROTOCOL_VERSION,
      type: 'error',
      session_id: this.sessionId,
      payload: { message, code } satisfies ErrorPayload,
    });
  }

  private isSocketCurrent(socket: WebSocket, seq: number): boolean {
    return this.ws === socket && this.connectionSeq === seq;
  }
}
