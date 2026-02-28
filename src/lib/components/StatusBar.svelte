<script lang="ts">
  import type { ClientState } from "$lib/protocol/client.svelte";
  import { THEME_OPTIONS, type ThemeName } from "$lib/theme";
  import ConnectionModal from "$lib/components/ConnectionModal.svelte";

  interface Props {
    state: ClientState;
    sessionId: string;
    endpointUrl?: string;
    currentTheme: ThemeName;
    effectsEnabled: boolean;
    onThemeChange: (theme: string) => void;
    onEffectsChange: (enabled: boolean) => void;
    onLogout: () => void;
  }

  let {
    state: clientState,
    sessionId,
    endpointUrl,
    currentTheme,
    effectsEnabled,
    onThemeChange,
    onEffectsChange,
    onLogout,
  }: Props = $props();

  const statusClass = $derived(
    clientState === "chatting" || clientState === "paired"
      ? "status-ok"
      : clientState === "connecting" || clientState === "pairing"
        ? "status-warn"
        : "status-err",
  );

  const statusText = $derived(
    clientState === "disconnected"
      ? "OFFLINE"
      : clientState === "connecting"
        ? "CONNECTING..."
        : clientState === "pairing"
          ? "PAIRING..."
          : clientState === "paired"
            ? "LINK_ESTABLISHED"
            : "ACTIVE",
  );

  const isConnected = $derived(
    clientState === "chatting" || clientState === "paired",
  );

  const displayAddress = $derived.by(() => {
    if (!isConnected) return "sys@nullclaw";
    if (!endpointUrl) return "nullclaw@unknown";
    try {
      const url = new URL(endpointUrl);
      return `nullclaw@${url.host}`;
    } catch {
      return "nullclaw@connected";
    }
  });

  const canLogout = $derived(clientState !== "disconnected");

  let isThemeMenuOpen = $state(false);
  let isConnectionModalOpen = $state(false);

  function handleWindowClick() {
    if (isThemeMenuOpen) {
      isThemeMenuOpen = false;
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />

{#if isConnectionModalOpen}
  <ConnectionModal
    state={clientState}
    {sessionId}
    {endpointUrl}
    onClose={() => (isConnectionModalOpen = false)}
  />
{/if}

<header class="status-bar">
  <div class="left">
    <div class="segment status-segment {statusClass}">
      <span class="status-text">{statusText}</span>
    </div>
    <div class="segment breadcrumb">
      <span>{displayAddress}</span>
    </div>
  </div>
  <div class="center">
    <span class="session-id">[ SESSION: {sessionId} ]</span>
  </div>
  <div class="right">
    <div class="segment theme-switcher">
      <button
        class="fx-toggle"
        onclick={() => onEffectsChange(!effectsEnabled)}
        title={effectsEnabled
          ? "Disable visual effects"
          : "Enable visual effects"}
      >
        FX:{effectsEnabled ? "ON" : "OFF"}
      </button>
      <div class="dropdown-wrapper">
        <button
          class="theme-select-btn"
          onclick={(e) => {
            e.stopPropagation();
            isThemeMenuOpen = !isThemeMenuOpen;
          }}
        >
          {currentTheme} ▼
        </button>
        {#if isThemeMenuOpen}
          <div class="theme-menu">
            {#each THEME_OPTIONS as theme}
              <button
                class="theme-option {currentTheme === theme.value
                  ? 'active'
                  : ''}"
                onclick={() => {
                  onThemeChange(theme.value);
                  isThemeMenuOpen = false;
                }}
              >
                {theme.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    <button
      class="segment e2e-badge e2e-btn"
      title="View Connection Diagnostics"
      onclick={() => (isConnectionModalOpen = true)}
    >
      <span class="icon">🔒</span> E2E_SECURE
    </button>
    {#if canLogout}
      <div class="segment logout">
        <button class="logout-btn" onclick={onLogout}>LOGOUT</button>
      </div>
    {/if}
  </div>
</header>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-surface);
    border-bottom: 2px solid var(--border);
    font-size: 12px;
    font-family: var(--font-mono);
    font-weight: bold;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    z-index: 100;
    transition:
      background-color 0.5s ease,
      border-color 0.5s ease;
  }

  .left,
  .right {
    display: flex;
    align-items: stretch;
    height: 100%;
  }

  .segment {
    padding: 6px 16px;
    display: flex;
    align-items: center;
    border-right: 1px solid var(--border);
    transition:
      border-color 0.5s ease,
      background-color 0.5s ease,
      color 0.5s ease;
  }

  .right .segment {
    border-left: 1px solid var(--border);
    border-right: none;
  }

  .status-segment {
    color: var(--bg);
    text-shadow: none;
    letter-spacing: 1px;
  }

  .status-ok {
    background: var(--accent);
  }
  .status-warn {
    background: var(--warning);
  }
  .status-err {
    background: var(--error);
  }

  .breadcrumb {
    color: var(--accent-dim);
    background: rgba(0, 255, 65, 0.05);
  }

  .center {
    flex: 1;
    text-align: center;
    color: var(--fg-dim);
    letter-spacing: 2px;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 16px;
  }

  .session-id {
    font-size: 11px;
  }

  .e2e-badge {
    color: var(--accent);
    background: rgba(0, 255, 65, 0.1);
    letter-spacing: 1px;
    gap: 6px;
  }

  .e2e-btn {
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    outline: none;
    transition: all 0.2s ease;
  }

  .e2e-btn:hover {
    background: rgba(0, 255, 65, 0.2);
    text-shadow: 0 0 8px var(--accent);
  }

  .icon {
    font-size: 10px;
  }

  .theme-switcher {
    padding: 0;
  }

  .dropdown-wrapper {
    position: relative;
    display: flex;
    height: 100%;
    align-items: stretch;
  }

  .theme-select-btn {
    background: transparent;
    color: var(--fg);
    border: none;
    padding: 6px 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    outline: none;
    cursor: pointer;
    text-transform: uppercase;
    transition:
      color 0.2s ease,
      text-shadow 0.2s ease,
      background-color 0.2s ease;
  }

  .theme-select-btn:hover {
    color: var(--accent);
    background: rgba(0, 255, 65, 0.05); /* very subtle hover */
  }

  .theme-menu {
    position: absolute;
    top: 100%;
    right: -1px;
    background: var(--bg-surface);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border);
    border-top: none;
    box-shadow:
      0 4px 15px rgba(0, 0, 0, 0.8),
      0 0 10px var(--border-glow);
    display: flex;
    flex-direction: column;
    min-width: 130px;
    width: 100%;
    z-index: 200;
    transform-origin: top;
    animation: menu-down 0.2s ease-out forwards;
  }

  @keyframes menu-down {
    from {
      opacity: 0;
      transform: scaleY(0.9);
    }
    to {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  .theme-option {
    background: transparent;
    color: var(--fg-dim);
    border: none;
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    text-align: left;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.2s ease;
  }

  .theme-option:last-child {
    border-bottom: none;
  }

  .theme-option:hover {
    background: var(--bg-hover);
    color: var(--accent);
    text-shadow: 0 0 5px var(--accent);
    padding-left: 20px;
  }

  .theme-option.active {
    color: var(--bg);
    background: var(--accent);
    text-shadow: none;
  }

  .fx-toggle {
    background: transparent;
    color: var(--fg-dim);
    border: none;
    padding: 6px 12px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    outline: none;
    cursor: pointer;
    text-shadow: none;
    transition:
      color 0.2s ease,
      text-shadow 0.2s ease;
  }

  .fx-toggle:hover {
    color: var(--fg);
  }

  .logout {
    padding: 0;
  }

  .logout-btn {
    background: transparent;
    border: none;
    color: var(--error);
    padding: 6px 16px;
    height: 100%;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    text-transform: uppercase;
    transition: all 0.2s ease;
  }

  .logout-btn:hover {
    background: rgba(255, 42, 42, 0.15);
    text-shadow: 0 0 8px var(--error);
  }
</style>
