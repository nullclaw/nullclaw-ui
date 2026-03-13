<script lang="ts">
  import { onMount } from 'svelte';
  import ChatScreen from './ChatScreen.svelte';
  import { createConnectionController } from '$lib/session/connection-controller.svelte';
  import type { ChatMessage } from '$lib/stores/session.svelte';

  let {
    wsUrl = '',
    pairingCode = '123456',
    initialMessages = [],
    autoSendMessage = '',
    onAutoSend,
  } = $props<{
    wsUrl?: string;
    pairingCode?: string;
    initialMessages?: ChatMessage[];
    autoSendMessage?: string;
    onAutoSend?: (() => void) | undefined;
  }>();

  const connection = createConnectionController('embedded');
  const session = connection.session;

  const clientState = $derived(connection.clientState);
  const isPaired = $derived(connection.isPaired);
  const endpointUrl = $derived(connection.endpointUrl);
  const pairingError = $derived(connection.pairingError);
  const trimmedAutoSendMessage = $derived(autoSendMessage.trim());
  let autoSendTriggered = $state(false);

  function handleSend(content: string) {
    connection.sendMessage(content);
  }

  function handleApproval(id: string, requestId: string | undefined, approved: boolean) {
    connection.sendApproval(id, requestId, approved);
  }

  $effect(() => {
    if (autoSendTriggered) return;
    if (!isPaired) return;
    if (!trimmedAutoSendMessage) return;
    if (initialMessages.length > 0) return;

    const sent = connection.sendMessage(trimmedAutoSendMessage);
    if (!sent) return;

    autoSendTriggered = true;
    onAutoSend?.();
  });

  onMount(() => {
    if (wsUrl && pairingCode) {
      void connection.connectWithPairing(wsUrl, pairingCode);
    }
    if (initialMessages.length > 0) {
      session.replaceHistory(initialMessages);
    }
    return () => connection.dispose();
  });
</script>

<div class="embed-root">
  {#if isPaired}
    <ChatScreen
      messages={session.messages}
      toolCalls={session.toolCalls}
      approvals={session.approvals}
      error={session.error}
      isStreaming={session.isStreaming}
      isAwaitingAssistant={session.isAwaitingAssistant}
      {endpointUrl}
      onSend={handleSend}
      onApproval={handleApproval}
    />
  {:else}
    <div class="connecting-state">
      {#if pairingError}
        <span class="error">{pairingError}</span>
      {:else if clientState === 'disconnected'}
        <span>Disconnected</span>
      {:else}
        <span class="pulse">Connecting...</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .embed-root {
    --bg: #030a05;
    --bg-surface: rgba(0, 20, 5, 0.7);
    --bg-hover: rgba(0, 40, 10, 0.8);
    --fg: #00ff41;
    --fg-dim: #00aa2a;
    --accent: #00ff41;
    --accent-dim: #008822;
    --error: #ff2a2a;
    --warning: #ffaa00;
    --border: rgba(0, 255, 65, 0.3);
    --border-glow: rgba(0, 255, 65, 0.5);
    --text-glow: 0 0 5px rgba(0, 255, 65, 0.4);
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    border-radius: 8px;
  }

  /* Base reset scoped to embed */
  .embed-root :global(*),
  .embed-root :global(*::before),
  .embed-root :global(*::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* Input/button/textarea defaults */
  .embed-root :global(input),
  .embed-root :global(button),
  .embed-root :global(textarea) {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.3s, box-shadow 0.3s, background-color 0.3s;
    text-shadow: var(--text-glow);
  }

  .embed-root :global(input:focus),
  .embed-root :global(textarea:focus) {
    border-color: var(--accent);
    box-shadow: 0 0 8px var(--border-glow);
  }

  .embed-root :global(button) {
    cursor: pointer;
    border-color: var(--accent-dim);
    color: var(--accent);
    text-transform: uppercase;
    font-weight: bold;
    letter-spacing: 1px;
  }

  .embed-root :global(button:hover:not(:disabled)) {
    background: var(--bg-hover);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--border-glow);
    text-shadow: 0 0 8px var(--accent);
  }

  .embed-root :global(button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Scrollbar */
  .embed-root :global(::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }

  .embed-root :global(::-webkit-scrollbar-track) {
    background: var(--bg-surface);
  }

  .embed-root :global(::-webkit-scrollbar-thumb) {
    background: var(--accent-dim);
    border-radius: 4px;
  }

  .embed-root :global(::-webkit-scrollbar-thumb:hover) {
    background: var(--accent);
  }

  .embed-root :global(::selection) {
    background: var(--accent-dim);
    color: var(--bg);
  }

  /* Keyframes needed by child components */
  @keyframes -global-typeWriter {
    from { width: 0; opacity: 0; }
    to { width: 100%; opacity: 1; }
  }

  @keyframes -global-blinkCursor {
    from, to { border-color: transparent; }
    50% { border-color: var(--accent); }
  }

  @keyframes -global-glitch {
    0% { transform: translate(0); }
    20% { transform: translate(-2px, 2px); }
    40% { transform: translate(-2px, -2px); }
    60% { transform: translate(2px, 2px); }
    80% { transform: translate(2px, -2px); }
    100% { transform: translate(0); }
  }

  @keyframes -global-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* .text-glow utility used by child components */
  .embed-root :global(.text-glow) {
    text-shadow: var(--text-glow);
  }

  .connecting-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--fg-dim);
    font-size: 0.875rem;
  }

  .connecting-state .error {
    color: var(--error);
  }

  .pulse {
    animation: blink 1.5s infinite;
  }
</style>
