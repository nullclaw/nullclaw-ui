<script lang="ts">
  import type { ToolCall } from '$lib/stores/session.svelte';

  interface Props {
    toolCall: ToolCall;
  }

  let { toolCall }: Props = $props();
</script>

<details class="tool-call">
  <summary>
    <span class="icon">⚙</span>
    <span class="name">{toolCall.name}</span>
    {#if toolCall.result}
      <span class="status" class:ok={toolCall.result.ok} class:fail={!toolCall.result.ok}>
        {toolCall.result.ok ? 'ok' : 'fail'}
      </span>
    {:else}
      <span class="status pending">running...</span>
    {/if}
  </summary>
  <div class="body">
    <div class="section">
      <span class="label">arguments</span>
      <pre>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
    </div>
    {#if toolCall.result}
      <div class="section">
        <span class="label">result</span>
        {#if toolCall.result.error}
          <pre class="error-text">{toolCall.result.error}</pre>
        {:else}
          <pre>{JSON.stringify(toolCall.result.result, null, 2)}</pre>
        {/if}
      </div>
    {/if}
  </div>
</details>

<style>
  .tool-call {
    margin: 4px 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 12px;
    max-width: 90%;
  }

  summary {
    padding: 6px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-dim);
    user-select: none;
  }

  summary:hover {
    background: var(--bg-hover);
  }

  .icon { font-size: 14px; }
  .name { color: var(--fg); }

  .status {
    margin-left: auto;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .ok { color: var(--accent); border: 1px solid var(--accent-dim); }
  .fail { color: var(--error); border: 1px solid var(--error); }
  .pending { color: var(--warning); border: 1px solid var(--warning); }

  .body {
    padding: 8px 10px;
    border-top: 1px solid var(--border);
  }

  .section { margin-bottom: 8px; }
  .label {
    display: block;
    font-size: 10px;
    color: var(--fg-dim);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  pre {
    background: var(--bg);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
    margin: 0;
  }

  .error-text { color: var(--error); }
</style>
