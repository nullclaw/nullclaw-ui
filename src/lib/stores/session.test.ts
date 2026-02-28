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
});
