<script lang="ts">
  import type { ChatMessage } from '$lib/stores/session.svelte';

  interface Props {
    message: ChatMessage;
  }

  let { message }: Props = $props();

  const isUser = $derived(message.role === 'user');
  const time = $derived(new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
</script>

<div class="bubble" class:user={isUser} class:assistant={!isUser}>
  <div class="content">
    {#if message.streaming}
      <span class="text">{message.content}</span><span class="cursor">█</span>
    {:else}
      <span class="text">{message.content}</span>
    {/if}
  </div>
  <span class="timestamp">{time}</span>
</div>

<style>
  .bubble {
    max-width: 80%;
    padding: 8px 12px;
    border-radius: 6px;
    margin: 4px 0;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .user {
    align-self: flex-end;
    border: 1px solid var(--border);
    background: var(--bg-surface);
  }

  .assistant {
    align-self: flex-start;
    border: 1px solid var(--accent-dim);
    background: rgba(0, 255, 65, 0.03);
  }

  .content {
    font-size: 14px;
    line-height: 1.5;
  }

  .cursor {
    color: var(--accent);
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    50% { opacity: 0; }
  }

  .timestamp {
    display: block;
    font-size: 10px;
    color: var(--fg-dim);
    margin-top: 4px;
    text-align: right;
  }
</style>
