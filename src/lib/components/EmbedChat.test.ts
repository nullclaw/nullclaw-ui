import { render } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import EmbedChat from './EmbedChat.svelte';
import type { ChatMessage } from '$lib/stores/session.svelte';

const mockState = vi.hoisted(() => ({
  connection: null as any,
}));

vi.mock('$lib/session/connection-controller.svelte', () => ({
  createConnectionController: () => mockState.connection,
}));

function makeConnection() {
  return {
    session: {
      messages: [],
      toolCalls: [],
      approvals: [],
      error: null,
      isStreaming: false,
      replaceHistory: vi.fn(),
    },
    clientState: 'paired',
    isPaired: true,
    endpointUrl: 'ws://127.0.0.1:32123/ws',
    pairingError: null,
    connectWithPairing: vi.fn(),
    sendMessage: vi.fn(() => true),
    sendApproval: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('EmbedChat', () => {
  beforeEach(() => {
    mockState.connection = makeConnection();
  });

  it('auto-sends the starter message for a fresh paired session', async () => {
    const onAutoSend = vi.fn();

    render(EmbedChat, {
      props: {
        wsUrl: 'ws://127.0.0.1:32123/ws',
        pairingCode: '123456',
        autoSendMessage: 'Wake up, my friend!',
        onAutoSend,
      },
    });

    await Promise.resolve();

    expect(mockState.connection.connectWithPairing).toHaveBeenCalledWith(
      'ws://127.0.0.1:32123/ws',
      '123456',
    );
    expect(mockState.connection.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockState.connection.sendMessage).toHaveBeenCalledWith('Wake up, my friend!');
    expect(onAutoSend).toHaveBeenCalledTimes(1);
  });

  it('does not auto-send when bootstrapped history already exists', async () => {
    const initialMessages: ChatMessage[] = [
      {
        id: 'history-1',
        role: 'user',
        content: 'Wake up, my friend!',
        timestamp: Date.now(),
      },
    ];

    render(EmbedChat, {
      props: {
        wsUrl: 'ws://127.0.0.1:32123/ws',
        pairingCode: '123456',
        initialMessages,
        autoSendMessage: 'Wake up, my friend!',
      },
    });

    await Promise.resolve();

    expect(mockState.connection.session.replaceHistory).toHaveBeenCalledWith(initialMessages);
    expect(mockState.connection.sendMessage).not.toHaveBeenCalled();
  });

  it('does not mark bootstrap auto-send when sendMessage fails', async () => {
    mockState.connection.sendMessage = vi.fn(() => false);
    const onAutoSend = vi.fn();

    render(EmbedChat, {
      props: {
        wsUrl: 'ws://127.0.0.1:32123/ws',
        pairingCode: '123456',
        autoSendMessage: 'Wake up, my friend!',
        onAutoSend,
      },
    });

    await Promise.resolve();

    expect(mockState.connection.sendMessage).toHaveBeenCalledTimes(1);
    expect(onAutoSend).not.toHaveBeenCalled();
  });
});
