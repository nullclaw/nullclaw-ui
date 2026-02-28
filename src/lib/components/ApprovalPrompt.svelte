<script lang="ts">
  import type { ApprovalRequest } from '$lib/stores/session.svelte';

  interface Props {
    approval: ApprovalRequest;
    onRespond: (id: string, requestId: string | undefined, approved: boolean) => void;
  }

  let { approval, onRespond }: Props = $props();
</script>

<div class="approval" class:resolved={approval.resolved}>
  <div class="header">
    <span class="icon">⚠</span>
    <span class="label">approval required</span>
  </div>
  <div class="action">{approval.action}</div>
  {#if approval.reason}
    <div class="reason">{approval.reason}</div>
  {/if}
  {#if !approval.resolved}
    <div class="buttons">
      <button class="approve" onclick={() => onRespond(approval.id, approval.requestId, true)}>
        approve
      </button>
      <button class="deny" onclick={() => onRespond(approval.id, approval.requestId, false)}>
        deny
      </button>
    </div>
  {:else}
    <div class="resolved-text">resolved</div>
  {/if}
</div>

<style>
  .approval {
    margin: 4px 0;
    border: 1px solid var(--warning);
    border-radius: 6px;
    padding: 12px;
    background: rgba(255, 170, 0, 0.05);
    max-width: 80%;
  }

  .approval.resolved {
    opacity: 0.5;
    border-color: var(--border);
  }

  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--warning);
    margin-bottom: 8px;
  }

  .icon { font-size: 16px; }

  .action {
    font-size: 14px;
    margin-bottom: 4px;
  }

  .reason {
    font-size: 12px;
    color: var(--fg-dim);
    margin-bottom: 8px;
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  .approve {
    border-color: var(--accent-dim);
    color: var(--accent);
  }

  .deny {
    border-color: var(--error);
    color: var(--error);
  }

  .resolved-text {
    font-size: 12px;
    color: var(--fg-dim);
  }
</style>
