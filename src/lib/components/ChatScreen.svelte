<script lang="ts">
  import type { ChatMessage, ToolCall, ApprovalRequest } from '$lib/stores/session.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import ToolCallBlock from './ToolCallBlock.svelte';
  import ApprovalPrompt from './ApprovalPrompt.svelte';

  interface Props {
    messages: ChatMessage[];
    toolCalls: ToolCall[];
    approvals: ApprovalRequest[];
    error: string | null;
    isStreaming: boolean;
    onSend: (content: string) => void;
    onApproval: (id: string, requestId: string | undefined, approved: boolean) => void;
  }

  let { messages, toolCalls, approvals, error, isStreaming, onSend, onApproval }: Props = $props();

  let input = $state('');
  let messagesEnd: HTMLDivElement;

  type TimelineItem =
    | { kind: 'message'; data: ChatMessage }
    | { kind: 'tool_call'; data: ToolCall }
    | { kind: 'approval'; data: ApprovalRequest };

  const timeline = $derived.by(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({ kind: 'message' as const, data: m })),
      ...toolCalls.map((t) => ({ kind: 'tool_call' as const, data: t })),
      ...approvals.map((a) => ({ kind: 'approval' as const, data: a })),
    ];
    items.sort((a, b) => a.data.timestamp - b.data.timestamp);
    return items;
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    input = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  $effect(() => {
    if (messages.length || toolCalls.length || approvals.length) {
      messagesEnd?.scrollIntoView({ behavior: 'smooth' });
    }
  });
</script>

<div class="chat-screen">
  <div class="messages">
    {#each timeline as item (item.data.id)}
      {#if item.kind === 'message'}
        <MessageBubble message={item.data} />
      {:else if item.kind === 'tool_call'}
        <ToolCallBlock toolCall={item.data} />
      {:else if item.kind === 'approval'}
        <ApprovalPrompt approval={item.data} onRespond={onApproval} />
      {/if}
    {/each}
    <div bind:this={messagesEnd}></div>
  </div>

  {#if error}
    <div class="error-bar">{error}</div>
  {/if}

  <form class="input-area" onsubmit={handleSubmit}>
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="type a message..."
      rows="1"
      disabled={isStreaming}
    ></textarea>
    <button type="submit" disabled={!input.trim() || isStreaming}>
      ⏎
    </button>
  </form>
</div>

<style>
  .chat-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .error-bar {
    padding: 8px 16px;
    background: rgba(255, 68, 68, 0.1);
    border-top: 1px solid var(--error);
    color: var(--error);
    font-size: 13px;
  }

  .input-area {
    display: flex;
    padding: 12px 16px;
    gap: 8px;
    border-top: 1px solid var(--border);
    background: var(--bg-surface);
  }

  textarea {
    flex: 1;
    resize: none;
    min-height: 36px;
    max-height: 120px;
    line-height: 1.5;
  }

  .input-area button {
    align-self: flex-end;
    padding: 8px 16px;
    font-size: 18px;
  }
</style>
