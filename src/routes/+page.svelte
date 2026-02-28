<script lang="ts">
  import { onMount } from "svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import PairingScreen from "$lib/components/PairingScreen.svelte";
  import ChatScreen from "$lib/components/ChatScreen.svelte";
  import { NullclawClient } from "$lib/protocol/client.svelte";
  import { createSessionStore } from "$lib/stores/session.svelte";
  import {
    clearStoredAuth,
    loadStoredAuth,
    parseStoredSharedKey,
    saveStoredAuth,
  } from "$lib/session/auth-storage";
  import {
    applyTheme,
    coerceTheme,
    loadTheme,
    saveTheme,
    type ThemeName,
  } from "$lib/theme";
  import {
    generateKeyPair,
    exportPublicKey,
    deriveSharedKey,
  } from "$lib/protocol/e2e";

  const sessionId = "default";

  let client = $state<NullclawClient | null>(null);
  let pairingError = $state<string | null>(null);
  let currentTheme = $state<ThemeName>("matrix");
  let lastEndpointUrl = $state<string | null>(null);

  const session = createSessionStore();

  const clientState = $derived(client?.state ?? "disconnected");
  const isPaired = $derived(
    clientState === "paired" || clientState === "chatting",
  );
  const endpointUrl = $derived(client?.url ?? lastEndpointUrl ?? "ws://unknown");

  function asObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  type ClientBindings = {
    setPairingKeyPair: (pairingKeyPair: CryptoKeyPair | null) => void;
  };

  function attachClientHandlers(
    newClient: NullclawClient,
    endpointUrl: string,
  ): ClientBindings {
    let pairingKeyPair: CryptoKeyPair | null = null;

    newClient.onEvent = async (event) => {
      const payload = asObject(event.payload);

      if (event.type === "pairing_result") {
        const e2ePayload = asObject(payload?.e2e);
        const agentPub =
          e2ePayload && typeof e2ePayload.agent_pub === "string"
            ? e2ePayload.agent_pub
            : null;
        const accessToken =
          payload && typeof payload.access_token === "string"
            ? payload.access_token
            : null;
        const expiresIn = payload?.expires_in;

        if (
          pairingKeyPair &&
          agentPub &&
          accessToken
        ) {
          try {
            const sharedKey = await deriveSharedKey(
              pairingKeyPair.privateKey,
              agentPub,
            );
            newClient.setE2EKey(sharedKey);
            saveStoredAuth(
              endpointUrl,
              accessToken,
              sharedKey,
              expiresIn,
            );
            lastEndpointUrl = endpointUrl;
          } catch {
            pairingError = "Could not complete secure pairing";
            clearStoredAuth();
            newClient.clearSessionAuth();
          }
        }
      } else if (event.type === "error") {
        if (payload?.code === "unauthorized") {
          clearStoredAuth();
          session.clear();
          lastEndpointUrl = null;
        }
        if (newClient.state === "pairing" || newClient.state === "connecting") {
          pairingError =
            typeof payload?.message === "string"
              ? payload.message
              : "Pairing failed";
        }
      }

      session.handleEvent(event);
    };

    return {
      setPairingKeyPair(value: CryptoKeyPair | null) {
        pairingKeyPair = value;
      },
    };
  }

  function waitForPairingState(
    nextClient: NullclawClient,
    timeoutMs = 10_000,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearInterval(check);
        clearTimeout(timeout);
        callback();
      };

      const check = setInterval(() => {
        if (client !== nextClient) {
          finish(() => reject(new Error("Connection replaced")));
          return;
        }

        if (nextClient.state === "pairing") {
          finish(resolve);
          return;
        }

        if (nextClient.state === "disconnected") {
          finish(() => reject(new Error("Connection failed")));
        }
      }, 50);

      const timeout = setTimeout(() => {
        finish(() => reject(new Error("Connection timeout")));
      }, timeoutMs);
    });
  }

  async function connectWithPairing(url: string, code: string) {
    pairingError = null;
    clearStoredAuth();
    client?.disconnect();
    session.clear();

    const newClient = new NullclawClient(url, sessionId);
    const handlers = attachClientHandlers(newClient, url);
    client = newClient;
    lastEndpointUrl = url;
    client.connect();

    try {
      await waitForPairingState(newClient);
    } catch {
      pairingError = "Could not connect to server";
      if (client === newClient) {
        newClient.disconnect();
        client = null;
      }
      return;
    }

    try {
      const pairingKeyPair = await generateKeyPair();
      const clientPub = await exportPublicKey(pairingKeyPair.publicKey);
      handlers.setPairingKeyPair(pairingKeyPair);
      newClient.sendPairingRequest(code, clientPub);
    } catch {
      pairingError = "Failed to initialize end-to-end encryption";
      if (client === newClient) {
        newClient.disconnect();
        client = null;
      }
    }
  }

  function restoreSavedSession() {
    const stored = loadStoredAuth();
    if (!stored) return;

    const sharedKey = parseStoredSharedKey(stored.shared_key);
    if (!sharedKey) {
      clearStoredAuth();
      return;
    }

    const restoredClient = new NullclawClient(stored.url, sessionId);
    restoredClient.restoreSession(stored.access_token, sharedKey);
    attachClientHandlers(restoredClient, stored.url);
    client = restoredClient;
    lastEndpointUrl = stored.url;
    restoredClient.connect();
  }

  function handleSend(content: string) {
    if (!client) return;
    session.addUserMessage(content);
    client.sendMessage(content);
  }

  function handleApproval(
    id: string,
    requestId: string | undefined,
    approved: boolean,
  ) {
    if (!client) return;
    session.resolveApproval(id);
    client.sendApproval(approved, requestId);
  }

  function handleThemeChange(theme: string) {
    const nextTheme = coerceTheme(theme, currentTheme);
    currentTheme = nextTheme;
    saveTheme(nextTheme);
    applyTheme(nextTheme);
  }

  function handleLogout() {
    if (client) {
      client.disconnect();
    }
    clearStoredAuth();
    session.clear();
    client = null;
    lastEndpointUrl = null;
    pairingError = null;
  }

  onMount(() => {
    currentTheme = loadTheme(currentTheme);
    applyTheme(currentTheme);
    restoreSavedSession();

    return () => {
      client?.disconnect();
      client = null;
    };
  });
</script>

<div class="app">
  <StatusBar
    state={clientState}
    {sessionId}
    {endpointUrl}
    {currentTheme}
    onThemeChange={handleThemeChange}
    onLogout={handleLogout}
  />

  {#if isPaired}
    <ChatScreen
      messages={session.messages}
      toolCalls={session.toolCalls}
      approvals={session.approvals}
      error={session.error}
      isStreaming={session.isStreaming}
      {endpointUrl}
      onSend={handleSend}
      onApproval={handleApproval}
    />
  {:else}
    <PairingScreen
      connecting={clientState === "connecting" || clientState === "pairing"}
      error={pairingError}
      onConnect={connectWithPairing}
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
