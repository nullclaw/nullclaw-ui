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
  payload?: unknown;
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
  expires_in?: number;
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
  | 'pairing_invalid_code'
  | 'pairing_locked_out'
  | 'pairing_code_expired'
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
