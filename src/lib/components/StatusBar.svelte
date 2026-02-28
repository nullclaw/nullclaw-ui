<script lang="ts">
  import type { ClientState } from '$lib/protocol/client.svelte';

  interface Props {
    state: ClientState;
    sessionId: string;
  }

  let { state, sessionId }: Props = $props();

  const statusColor = $derived(
    state === 'chatting' || state === 'paired' ? 'var(--accent)'
    : state === 'connecting' || state === 'pairing' ? 'var(--warning)'
    : 'var(--error)'
  );

  const statusText = $derived(
    state === 'disconnected' ? 'disconnected'
    : state === 'connecting' ? 'connecting...'
    : state === 'pairing' ? 'pairing...'
    : state === 'paired' ? 'paired'
    : 'connected'
  );
</script>

<header class="status-bar">
  <div class="left">
    <span class="dot" style:background={statusColor}></span>
    <span class="status-text">{statusText}</span>
  </div>
  <div class="center">
    <span class="session-id">{sessionId}</span>
  </div>
  <div class="right">
    <span class="e2e-badge" title="End-to-end encrypted">🔒 e2e</span>
  </div>
</header>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    gap: 12px;
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .center {
    flex: 1;
    text-align: center;
    color: var(--fg-dim);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-text {
    color: var(--fg-dim);
  }

  .session-id {
    font-size: 11px;
  }

  .e2e-badge {
    color: var(--accent);
  }
</style>
