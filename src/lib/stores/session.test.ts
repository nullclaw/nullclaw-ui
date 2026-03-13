import { describe, expect, it } from 'vitest';
import { createSessionStore } from './session.svelte';
import type { Envelope } from '$lib/protocol/types';

function makeEvent(overrides: Partial<Envelope>): Envelope {
  return {
    v: 1,
    type: 'assistant_chunk',
    session_id: 'sess-1',
    ...overrides,
  } as Envelope;
}

describe('createSessionStore', () => {
  it('keeps streamed assistant content when final message has no content', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({ type: 'assistant_chunk', payload: { content: 'Hello ' } }),
    );
    session.handleEvent(
      makeEvent({ type: 'assistant_chunk', payload: { content: 'world' } }),
    );
    session.handleEvent(
      makeEvent({ type: 'assistant_final', payload: {} }),
    );

    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe('Hello world');
    expect(session.messages[0].streaming).toBe(false);
    expect(session.isStreaming).toBe(false);
  });

  it('accepts assistant_chunk legacy content fallback', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({ type: 'assistant_chunk', content: 'legacy chunk' }),
    );
    session.handleEvent(
      makeEvent({ type: 'assistant_final', payload: {} }),
    );

    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe('legacy chunk');
    expect(session.messages[0].streaming).toBe(false);
    expect(session.isStreaming).toBe(false);
  });

  it('clears streaming state when error arrives mid-stream', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({ type: 'assistant_chunk', payload: { content: 'partial' } }),
    );
    expect(session.isStreaming).toBe(true);

    session.handleEvent(
      makeEvent({ type: 'error', payload: { message: 'stream failed' } }),
    );

    expect(session.isStreaming).toBe(false);
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe('partial');
    expect(session.messages[0].streaming).toBe(false);
    expect(session.error).toBe('stream failed');
  });

  it('applies tool_result without request_id to the latest unresolved call', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({
        type: 'tool_call',
        request_id: 'req-1',
        payload: { name: 'shell', arguments: { cmd: 'pwd' } },
      }),
    );
    session.handleEvent(
      makeEvent({
        type: 'tool_call',
        request_id: 'req-2',
        payload: { name: 'shell', arguments: { cmd: 'ls' } },
      }),
    );

    session.handleEvent(
      makeEvent({
        type: 'tool_result',
        payload: { ok: true, result: { output: 'ok' } },
      }),
    );

    expect(session.toolCalls).toHaveLength(2);
    expect(session.toolCalls[0].result).toBeUndefined();
    expect(session.toolCalls[1].result).toEqual({
      ok: true,
      result: { output: 'ok' },
      error: undefined,
    });
  });

  it('deduplicates unresolved approval requests by request_id', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({
        type: 'approval_request',
        request_id: 'req-approval-1',
        payload: { action: 'delete-file', reason: 'requested by user' },
      }),
    );
    session.handleEvent(
      makeEvent({
        type: 'approval_request',
        request_id: 'req-approval-1',
        payload: { action: 'delete-file', reason: 'duplicate event' },
      }),
    );

    expect(session.approvals).toHaveLength(1);
    expect(session.approvals[0].action).toBe('delete-file');
  });

  it('falls back to safe defaults for malformed payloads', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({ type: 'tool_call', payload: null }),
    );
    session.handleEvent(
      makeEvent({ type: 'error', payload: { message: 123 } as unknown as Record<string, unknown> }),
    );

    expect(session.toolCalls).toHaveLength(1);
    expect(session.toolCalls[0].name).toBe('unknown_tool');
    expect(session.error).toBe('Unknown error');
  });

  it('sets local errors explicitly via setError', () => {
    const session = createSessionStore();

    session.setError('Local transport error');
    expect(session.error).toBe('Local transport error');

    session.setError(null);
    expect(session.error).toBeNull();
  });

  it('tracks waiting-for-response state before the first assistant event', () => {
    const session = createSessionStore();

    session.addUserMessage('hello');
    expect(session.isAwaitingAssistant).toBe(true);
    expect(session.isStreaming).toBe(false);

    session.handleEvent(
      makeEvent({ type: 'assistant_chunk', payload: { content: 'hi' } }),
    );

    expect(session.isAwaitingAssistant).toBe(false);
    expect(session.isStreaming).toBe(true);
  });

  it('clears waiting-for-response state when a tool call starts first', () => {
    const session = createSessionStore();

    session.addUserMessage('check something');
    expect(session.isAwaitingAssistant).toBe(true);

    session.handleEvent(
      makeEvent({
        type: 'tool_call',
        request_id: 'req-1',
        payload: { name: 'shell', arguments: { cmd: 'pwd' } },
      }),
    );

    expect(session.isAwaitingAssistant).toBe(false);
  });

  it('replaces transcript with restored history and clears transient state', () => {
    const session = createSessionStore();

    session.handleEvent(
      makeEvent({
        type: 'tool_call',
        request_id: 'req-tool-1',
        payload: { name: 'shell', arguments: { cmd: 'pwd' } },
      }),
    );
    session.handleEvent(
      makeEvent({
        type: 'approval_request',
        request_id: 'req-approval-1',
        payload: { action: 'delete-file', reason: 'requested by user' },
      }),
    );
    session.setError('transport error');

    session.replaceHistory([
      {
        id: 'history-1',
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
      {
        id: 'history-2',
        role: 'assistant',
        content: 'hi',
        timestamp: 2,
        streaming: true,
      },
    ]);

    expect(session.messages).toEqual([
      {
        id: 'history-1',
        role: 'user',
        content: 'hello',
        timestamp: 1,
        order: expect.any(Number),
        streaming: false,
      },
      {
        id: 'history-2',
        role: 'assistant',
        content: 'hi',
        timestamp: 2,
        order: expect.any(Number),
        streaming: false,
      },
    ]);
    expect(session.toolCalls).toHaveLength(0);
    expect(session.approvals).toHaveLength(0);
    expect(session.error).toBeNull();
    expect(session.isStreaming).toBe(false);
  });
});
