import type { Envelope } from '$lib/protocol/types';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  streaming?: boolean; // true while receiving chunks
  type?: string; // original event type
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

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
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

  function appendAssistantChunk(chunk: string) {
    if (streamingMessageId) {
      const msg = messages.find((m) => m.id === streamingMessageId);
      if (msg) {
        msg.content += chunk;
        return;
      }
      streamingMessageId = null;
    }

    const id = nextId();
    messages.push({
      id,
      role: 'assistant',
      content: chunk,
      timestamp: Date.now(),
      streaming: true,
    });
    streamingMessageId = id;
  }

  function finalizeAssistantMessage(finalContent: string | null) {
    if (streamingMessageId) {
      const msg = messages.find((m) => m.id === streamingMessageId);
      if (msg) {
        if (typeof finalContent === 'string' && finalContent.length > 0) {
          msg.content = finalContent;
        }
        msg.streaming = false;
      } else if (typeof finalContent === 'string' && finalContent.length > 0) {
        messages.push({
          id: nextId(),
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
        });
      }

      streamingMessageId = null;
      return;
    }

    if (typeof finalContent !== 'string' || finalContent.length === 0) return;
    messages.push({
      id: nextId(),
      role: 'assistant',
      content: finalContent,
      timestamp: Date.now(),
    });
  }

  function applyToolResult(event: Envelope, payload: Record<string, unknown>) {
    const result = {
      ok: asBoolean(payload.ok) ?? false,
      result: payload.result,
      error: asString(payload.error) ?? undefined,
    };

    let toolCall: ToolCall | undefined;
    if (event.request_id) {
      toolCall = toolCalls.findLast((t) => t.requestId === event.request_id && !t.result);
    }
    if (!toolCall) {
      toolCall = toolCalls.findLast((t) => !t.result);
    }

    if (toolCall) {
      toolCall.result = result;
      return;
    }

    toolCalls.push({
      id: nextId(),
      requestId: event.request_id,
      name: 'unknown_tool',
      arguments: {},
      result,
      timestamp: Date.now(),
    });
  }

  function handleEvent(event: Envelope) {
    const payload = asObject(event.payload);
    error = null;

    switch (event.type) {
      case 'assistant_chunk': {
        const content = asString(payload?.content) ?? '';
        if (!content) break;
        appendAssistantChunk(content);
        break;
      }

      case 'assistant_final': {
        const content = asString(payload?.content) ?? asString(event.content);
        finalizeAssistantMessage(content);
        break;
      }

      case 'tool_call': {
        const argumentsPayload = asObject(payload?.arguments) ?? {};
        toolCalls.push({
          id: nextId(),
          requestId: event.request_id,
          name: asString(payload?.name) ?? 'unknown_tool',
          arguments: argumentsPayload,
          timestamp: Date.now(),
        });
        break;
      }

      case 'tool_result': {
        if (!payload) break;
        applyToolResult(event, payload);
        break;
      }

      case 'approval_request': {
        if (
          event.request_id &&
          approvals.some((approval) => approval.requestId === event.request_id && !approval.resolved)
        ) {
          break;
        }

        approvals.push({
          id: nextId(),
          requestId: event.request_id,
          action: asString(payload?.action) ?? 'unknown_action',
          reason: asString(payload?.reason) ?? undefined,
          timestamp: Date.now(),
        });
        break;
      }

      case 'error': {
        error = asString(payload?.message) ?? 'Unknown error';
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
    get messages() {
      return messages;
    },
    get toolCalls() {
      return toolCalls;
    },
    get approvals() {
      return approvals;
    },
    get error() {
      return error;
    },
    get isStreaming() {
      return streamingMessageId !== null;
    },
    addUserMessage,
    handleEvent,
    clear,
    resolveApproval,
  };
}
