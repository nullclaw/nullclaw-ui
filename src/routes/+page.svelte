<script lang="ts">
  import { onMount } from 'svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import PairingScreen from '$lib/components/PairingScreen.svelte';
  import ChatScreen from '$lib/components/ChatScreen.svelte';
  import { NullclawClient } from '$lib/protocol/client.svelte';
  import { createSessionStore } from '$lib/stores/session.svelte';
  import {
    generateKeyPair,
    exportPublicKey,
    deriveSharedKey,
    bytesToBase64Url,
    base64UrlToBytes,
  } from '$lib/protocol/e2e';

  const sessionId = 'default';
  const AUTH_STORAGE_KEY = 'nullclaw_ui_auth_v1';
  const DEFAULT_TOKEN_TTL_SECS = 86_400;

  type StoredAuth = {
    url: string;
    access_token: string;
    shared_key: string;
    expires_at: number;
  };

  let client = $state<NullclawClient | null>(null);
  let pairingError = $state<string | null>(null);

  const session = createSessionStore();

  const clientState = $derived(client?.state ?? 'disconnected');
  const isPaired = $derived(clientState === 'paired' || clientState === 'chatting');

  function loadStoredAuth(): StoredAuth | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        typeof parsed.url !== 'string' ||
        typeof parsed.access_token !== 'string' ||
        typeof parsed.shared_key !== 'string' ||
        typeof parsed.expires_at !== 'number'
      ) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
      if (parsed.expires_at <= Date.now()) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
      return parsed as StoredAuth;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
  }

  function clearStoredAuth() {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function saveStoredAuth(url: string, accessToken: string, sharedKey: Uint8Array, expiresIn?: unknown) {
    if (typeof localStorage === 'undefined') return;
    const ttlSecs =
      typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
        ? Math.floor(expiresIn)
        : DEFAULT_TOKEN_TTL_SECS;
    const payload: StoredAuth = {
      url,
      access_token: accessToken,
      shared_key: bytesToBase64Url(sharedKey),
      expires_at: Date.now() + ttlSecs * 1000,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  }

  function attachClientHandlers(newClient: NullclawClient, endpointUrl: string, pairingKeyPair: CryptoKeyPair | null) {
    newClient.onEvent = async (event) => {
      if (event.type === 'pairing_result') {
        const payload = event.payload as any;
        if (pairingKeyPair && typeof payload?.e2e?.agent_pub === 'string' && typeof payload?.access_token === 'string') {
          try {
            const sharedKey = await deriveSharedKey(pairingKeyPair.privateKey, payload.e2e.agent_pub);
            newClient.setE2EKey(sharedKey);
            saveStoredAuth(endpointUrl, payload.access_token, sharedKey, payload.expires_in);
          } catch {
            pairingError = 'Could not complete secure pairing';
            clearStoredAuth();
            newClient.clearSessionAuth();
          }
        }
      } else if (event.type === 'error') {
        const payload = event.payload as any;
        if (payload?.code === 'unauthorized') {
          clearStoredAuth();
          session.clear();
        }
        if (newClient.state === 'pairing' || newClient.state === 'connecting') {
          pairingError = payload?.message ?? 'Pairing failed';
        }
      }

      session.handleEvent(event);
    };
  }

  async function connectWithPairing(url: string, code: string) {
    pairingError = null;
    clearStoredAuth();
    client?.disconnect();
    session.clear();

    const newClient = new NullclawClient(url, sessionId);
    let pairingKeyPair: CryptoKeyPair | null = null;
    attachClientHandlers(newClient, url, pairingKeyPair);
    client = newClient;
    client.connect();

    const waitForOpen = () =>
      new Promise<void>((resolve, reject) => {
        const check = setInterval(() => {
          if (newClient.state === 'pairing') {
            clearInterval(check);
            resolve();
          } else if (newClient.state === 'disconnected') {
            clearInterval(check);
            reject(new Error('Connection failed'));
          }
        }, 50);
        setTimeout(() => {
          clearInterval(check);
          reject(new Error('Timeout'));
        }, 10000);
      });

    try {
      await waitForOpen();
    } catch {
      pairingError = 'Could not connect to server';
      return;
    }

    try {
      pairingKeyPair = await generateKeyPair();
      const clientPub = await exportPublicKey(pairingKeyPair.publicKey);
      attachClientHandlers(newClient, url, pairingKeyPair);
      newClient.sendPairingRequest(code, clientPub);
    } catch {
      pairingError = 'Failed to initialize end-to-end encryption';
      newClient.disconnect();
      client = null;
    }
  }

  function restoreSavedSession() {
    const stored = loadStoredAuth();
    if (!stored) return;

    try {
      const sharedKey = base64UrlToBytes(stored.shared_key);
      if (sharedKey.length !== 32) {
        clearStoredAuth();
        return;
      }

      const restoredClient = new NullclawClient(stored.url, sessionId);
      restoredClient.restoreSession(stored.access_token, sharedKey);
      attachClientHandlers(restoredClient, stored.url, null);
      client = restoredClient;
      restoredClient.connect();
    } catch {
      clearStoredAuth();
    }
  }

  function handleSend(content: string) {
    if (!client) return;
    session.addUserMessage(content);
    client.sendMessage(content);
  }

  function handleApproval(id: string, requestId: string | undefined, approved: boolean) {
    if (!client) return;
    session.resolveApproval(id);
    client.sendApproval(approved, requestId);
  }

  onMount(() => {
    restoreSavedSession();
  });
</script>

<div class="app">
  <StatusBar
    state={clientState}
    {sessionId}
  />

  {#if isPaired}
    <ChatScreen
      messages={session.messages}
      toolCalls={session.toolCalls}
      approvals={session.approvals}
      error={session.error}
      isStreaming={session.isStreaming}
      onSend={handleSend}
      onApproval={handleApproval}
    />
  {:else}
    <PairingScreen
      connecting={clientState === 'connecting' || clientState === 'pairing'}
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
