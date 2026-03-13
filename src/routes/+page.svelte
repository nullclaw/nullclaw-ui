<script lang="ts">
  import { onMount } from "svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import PairingScreen from "$lib/components/PairingScreen.svelte";
  import ChatScreen from "$lib/components/ChatScreen.svelte";
  import { createConnectionController } from "$lib/session/connection-controller.svelte";
  import { type ThemeName } from "$lib/theme";
  import {
    applyUiPreferences,
    loadUiPreferences,
    persistEffectsPreference,
    persistThemePreference,
    resolveThemePreference,
  } from "$lib/ui/preferences";

  const sessionId = "default";
  const connection = createConnectionController(sessionId);
  const session = connection.session;

  let currentTheme = $state<ThemeName>("matrix");
  let effectsEnabled = $state<boolean>(true);

  const clientState = $derived(connection.clientState);
  const isPaired = $derived(connection.isPaired);
  const endpointUrl = $derived(connection.endpointUrl);
  const pairingError = $derived(connection.pairingError);

  function handleSend(content: string) {
    connection.sendMessage(content);
  }

  function handleApproval(
    id: string,
    requestId: string | undefined,
    approved: boolean,
  ) {
    connection.sendApproval(id, requestId, approved);
  }

  function handleThemeChange(theme: string) {
    const nextTheme = resolveThemePreference(theme, currentTheme);
    currentTheme = nextTheme;
    persistThemePreference(nextTheme);
  }

  function handleEffectsChange(enabled: boolean) {
    effectsEnabled = enabled;
    persistEffectsPreference(enabled);
  }

  function handleLogout() {
    connection.logout();
  }

  onMount(() => {
    const preferences = loadUiPreferences(currentTheme, true);
    currentTheme = preferences.theme;
    effectsEnabled = preferences.effectsEnabled;
    applyUiPreferences(preferences);

    // Auto-connect if ws and code query params are present (embedded mode)
    const params = new URLSearchParams(window.location.search);
    const wsParam = params.get("ws");
    const codeParam = params.get("code");
    if (wsParam && codeParam) {
      connection.connectWithPairing(wsParam, codeParam);
    } else {
      connection.restoreSavedSession();
    }

    return () => {
      connection.dispose();
    };
  });
</script>

<div class="app">
  <StatusBar
    state={clientState}
    {sessionId}
    {endpointUrl}
    {currentTheme}
    {effectsEnabled}
    onThemeChange={handleThemeChange}
    onEffectsChange={handleEffectsChange}
    onLogout={handleLogout}
  />

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
    <PairingScreen
      connecting={clientState === "connecting" || clientState === "pairing"}
      error={pairingError}
      onConnect={connection.connectWithPairing}
    />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
</style>
