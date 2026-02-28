<script lang="ts">
  interface Props {
    connecting?: boolean;
    error?: string | null;
    onConnect: (url: string, code: string, e2eEnabled: boolean) => void;
  }

  let { connecting = false, error = null, onConnect }: Props = $props();

  let url = $state('ws://127.0.0.1:32123/ws');
  let code = $state('');
  let e2eEnabled = $state(false);

  function handleSubmit(e: Event) {
    e.preventDefault();
    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) return;
    onConnect(url, trimmed, e2eEnabled);
  }

  function handleCodeInput(e: Event) {
    const input = e.target as HTMLInputElement;
    code = input.value.replace(/\D/g, '').slice(0, 6);
  }
</script>

<div class="pairing-screen">
  <div class="card">
    <h1 class="title">nullclaw</h1>
    <p class="subtitle">webchannel pairing</p>

    <form onsubmit={handleSubmit}>
      <label class="field">
        <span class="label">endpoint</span>
        <input
          type="text"
          bind:value={url}
          placeholder="ws://127.0.0.1:32123/ws"
          disabled={connecting}
        />
      </label>

      <label class="field">
        <span class="label">pairing code</span>
        <input
          type="text"
          value={code}
          oninput={handleCodeInput}
          placeholder="000000"
          maxlength="6"
          inputmode="numeric"
          autocomplete="off"
          disabled={connecting}
          class="code-input"
        />
      </label>

      <label class="field toggle">
        <input type="checkbox" bind:checked={e2eEnabled} disabled={connecting} />
        <span class="label">end-to-end encryption (X25519 + ChaCha20)</span>
      </label>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" disabled={connecting || code.length !== 6}>
        {connecting ? 'connecting...' : 'connect'}
      </button>
    </form>
  </div>
</div>

<style>
  .pairing-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 20px;
  }

  .card {
    width: 100%;
    max-width: 400px;
    padding: 32px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-surface);
  }

  .title {
    font-size: 24px;
    color: var(--accent);
    font-weight: 400;
    margin-bottom: 4px;
  }

  .subtitle {
    color: var(--fg-dim);
    font-size: 13px;
    margin-bottom: 24px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field.toggle {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .field.toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }

  .label {
    font-size: 12px;
    color: var(--fg-dim);
    text-transform: lowercase;
  }

  .code-input {
    font-size: 24px;
    letter-spacing: 8px;
    text-align: center;
    padding: 12px;
  }

  .error {
    color: var(--error);
    font-size: 13px;
    padding: 8px;
    border: 1px solid var(--error);
    border-radius: 4px;
    background: rgba(255, 68, 68, 0.1);
  }

  button[type="submit"] {
    padding: 12px;
    font-size: 14px;
    text-transform: lowercase;
  }

  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
