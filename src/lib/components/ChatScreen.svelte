<script lang="ts">
  import type {
    ChatMessage,
    ToolCall,
    ApprovalRequest,
  } from "$lib/stores/session.svelte";
  import { redactWebSocketAuthToken } from "$lib/protocol/ws-url";
  import MessageBubble from "./MessageBubble.svelte";
  import ToolCallBlock from "./ToolCallBlock.svelte";
  import ApprovalPrompt from "./ApprovalPrompt.svelte";
  import { onMount } from "svelte";

  interface Props {
    messages: ChatMessage[];
    toolCalls: ToolCall[];
    approvals: ApprovalRequest[];
    error: string | null;
    isStreaming: boolean;
    endpointUrl: string;
    onSend: (content: string) => void;
    onApproval: (
      id: string,
      requestId: string | undefined,
      approved: boolean,
    ) => void;
  }

  let {
    messages,
    toolCalls,
    approvals,
    error,
    isStreaming,
    endpointUrl,
    onSend,
    onApproval,
  }: Props = $props();

  let input = $state("");
  let messagesEnd: HTMLDivElement | undefined;
  let initComplete = $state(false);

  type TimelineItem =
    | { kind: "message"; data: ChatMessage }
    | { kind: "tool_call"; data: ToolCall }
    | { kind: "approval"; data: ApprovalRequest };

  const timeline = $derived.by(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({ kind: "message" as const, data: m })),
      ...toolCalls.map((t) => ({ kind: "tool_call" as const, data: t })),
      ...approvals.map((a) => ({ kind: "approval" as const, data: a })),
    ];
    items.sort((a, b) => a.data.timestamp - b.data.timestamp);
    return items;
  });

  const safeEndpointUrl = $derived(
    redactWebSocketAuthToken(endpointUrl) ?? endpointUrl,
  );

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    input = "";
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  $effect(() => {
    if (messages.length || toolCalls.length || approvals.length) {
      messagesEnd?.scrollIntoView({ behavior: "smooth" });
    }
  });

  onMount(() => {
    const timer = setTimeout(() => {
      initComplete = true;
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  });
</script>

<div class="chat-screen">
  <div class="messages">
    {#if timeline.length === 0}
      <div class="empty-state">
        <div class="ascii-logo glitch text-glow" data-text="NULLCLAW">
          NULLCLAW
        </div>
        <div class="init-sequence">
          <p class="typewriter-line-1">
            >> SYSTEM INITIALIZATION SEQUENCE STARTED
          </p>
          <p class="typewriter-line-2">>> LOADING KERNEL MODULES... [OK]</p>
          <p class="typewriter-line-3">
            >> MOUNTING VIRTUAL FILESYSTEM... [OK]
          </p>
          <p class="typewriter-line-4">
            >> ESTABLISHING SECURE E2E CHANNEL... [OK]
          </p>
          <p class="typewriter-line-5">
            >> CONNECTED TO ENDPOINT: {safeEndpointUrl}
          </p>
          {#if initComplete}
            <p class="ready-text text-glow">
              >> TERMINAL READY. AWAITING INPUT.
            </p>
          {:else}
            <p class="loading-text">
              >> STANDBY<span class="dot-blink">...</span>
            </p>
          {/if}
        </div>
      </div>
    {:else}
      {#each timeline as item (item.data.id)}
        {#if item.kind === "message"}
          <MessageBubble message={item.data} />
        {:else if item.kind === "tool_call"}
          <ToolCallBlock toolCall={item.data} />
        {:else if item.kind === "approval"}
          <ApprovalPrompt approval={item.data} onRespond={onApproval} />
        {/if}
      {/each}
    {/if}
    <div bind:this={messagesEnd}></div>
  </div>

  {#if error}
    <div class="error-bar">[!] {error}</div>
  {/if}

  <form class="input-area" onsubmit={handleSubmit}>
    <span class="prompt-prefix">~/$</span>
    <textarea
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="enter_command..."
      rows="1"
      class="text-glow"
    ></textarea>
    <button type="submit" disabled={!input.trim() || isStreaming}>
      EXEC
    </button>
  </form>
</div>

<style>
  .chat-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    scroll-behavior: smooth;
  }

  /* Empty State Styling */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--accent);
    font-family: var(--font-mono);
    opacity: 0.8;
  }

  .ascii-logo {
    font-size: 48px;
    font-weight: 700;
    letter-spacing: 8px;
    margin-bottom: 32px;
    position: relative;
    display: inline-block;
  }

  .ascii-logo.glitch::before,
  .ascii-logo.glitch::after {
    content: attr(data-text);
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
  }

  .ascii-logo.glitch::before {
    left: 2px;
    text-shadow: -2px 0 var(--error);
    clip: rect(24px, 550px, 90px, 0);
    animation: glitch 4s infinite linear alternate-reverse;
  }

  .ascii-logo.glitch::after {
    left: -2px;
    text-shadow: -2px 0 var(--accent-dim);
    clip: rect(85px, 550px, 140px, 0);
    animation: glitch 3s infinite linear alternate-reverse;
  }

  .init-sequence {
    text-align: left;
    max-width: 600px;
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    padding: 24px;
    border-left: 2px solid var(--accent-dim);
    border-radius: 4px;
    box-shadow: inset 0 0 20px rgba(0, 255, 65, 0.05);
  }

  .init-sequence p {
    margin: 8px 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    width: 0;
  }

  .typewriter-line-1 {
    animation: typeWriter 0.5s steps(40, end) forwards;
    animation-delay: 0s;
  }
  .typewriter-line-2 {
    animation: typeWriter 0.5s steps(40, end) forwards;
    animation-delay: 0.5s;
  }
  .typewriter-line-3 {
    animation: typeWriter 0.5s steps(40, end) forwards;
    animation-delay: 1s;
  }
  .typewriter-line-4 {
    animation: typeWriter 0.5s steps(40, end) forwards;
    animation-delay: 1.5s;
  }
  .typewriter-line-5 {
    animation: typeWriter 0.5s steps(40, end) forwards;
    animation-delay: 2s;
  }

  .ready-text {
    color: var(--accent) !important;
    font-weight: bold;
    margin-top: 16px !important;
    animation: typeWriter 0.5s steps(40, end) forwards;
  }

  .loading-text {
    color: var(--warning) !important;
    margin-top: 16px !important;
    animation: typeWriter 0.2s steps(40, end) forwards;
  }

  .dot-blink {
    animation: blink 1.5s infinite;
  }

  /* End Empty State */

  .error-bar {
    padding: 12px 16px;
    background: rgba(255, 42, 42, 0.15);
    border-top: 1px solid var(--error);
    border-bottom: 1px solid var(--error);
    color: var(--error);
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    text-shadow: 0 0 8px rgba(255, 42, 42, 0.8);
    animation: flashError 2s infinite alternate;
  }

  @keyframes flashError {
    0% {
      background: rgba(255, 42, 42, 0.15);
    }
    100% {
      background: rgba(255, 42, 42, 0.05);
    }
  }

  .input-area {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    gap: 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-surface);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.2);
  }

  .prompt-prefix {
    color: var(--accent-dim);
    font-weight: bold;
    font-size: 16px;
    text-shadow: var(--text-glow);
  }

  textarea {
    flex: 1;
    resize: none;
    min-height: 48px;
    max-height: 150px;
    line-height: 1.5;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid transparent;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    font-size: 16px;
    padding: 12px 8px;
    color: var(--accent);
  }

  textarea:focus {
    border-color: transparent;
    border-bottom: 1px solid var(--accent);
    box-shadow: none;
    background: rgba(0, 0, 0, 0.6);
  }

  textarea::placeholder {
    color: var(--border);
    opacity: 0.6;
  }

  .input-area button {
    align-self: flex-end;
    padding: 12px 24px;
    font-size: 14px;
    height: 48px;
  }
</style>
