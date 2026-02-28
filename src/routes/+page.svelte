<script lang="ts">
  import StatusBar from '$lib/components/StatusBar.svelte';
  import PairingScreen from '$lib/components/PairingScreen.svelte';
  import ChatScreen from '$lib/components/ChatScreen.svelte';
  import { NullclawClient } from '$lib/protocol/client.svelte';
  import { createSessionStore } from '$lib/stores/session.svelte';
  import { generateKeyPair, exportPublicKey, deriveSharedKey } from '$lib/protocol/e2e';

  const sessionId = `sess-${Date.now()}`;
  let client = $state<NullclawClient | null>(null);
  let pairingError = $state<string | null>(null);
  let e2eEnabled = $state(false);
  let e2eKeyPair: CryptoKeyPair | null = null;

  const session = createSessionStore();

  const clientState = $derived(client?.state ?? 'disconnected');
  const isPaired = $derived(clientState === 'paired' || clientState === 'chatting');

  async function handleConnect(url: string, code: string, useE2e: boolean) {
    pairingError = null;
    e2eEnabled = useE2e;

    const newClient = new NullclawClient(url, sessionId);

    newClient.onEvent = async (event) => {
      if (event.type === 'pairing_result') {
        const payload = event.payload as any;
        if (e2eEnabled && payload?.e2e?.agent_pub && e2eKeyPair) {
          const sharedKey = await deriveSharedKey(e2eKeyPair.privateKey, payload.e2e.agent_pub);
          newClient.setE2EKey(sharedKey);
        }
      } else if (event.type === 'error') {
        const payload = event.payload as any;
        if (newClient.state === 'pairing' || newClient.state === 'connecting') {
          pairingError = payload?.message ?? 'Pairing failed';
        }
      }

      session.handleEvent(event);
    };

    client = newClient;
    client.connect();

    // Wait for WebSocket to open
    const waitForOpen = () => new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (client?.state === 'pairing') {
          clearInterval(check);
          resolve();
        } else if (client?.state === 'disconnected') {
          clearInterval(check);
          reject(new Error('Connection failed'));
        }
      }, 50);
      setTimeout(() => { clearInterval(check); reject(new Error('Timeout')); }, 10000);
    });

    try {
      await waitForOpen();
    } catch {
      pairingError = 'Could not connect to server';
      return;
    }

    // Generate E2E keypair if enabled
    let clientPub: string | undefined;
    if (useE2e) {
      e2eKeyPair = await generateKeyPair();
      clientPub = await exportPublicKey(e2eKeyPair.publicKey);
    }

    client.sendPairingRequest(code, clientPub);
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
</script>

<div class="app">
  <StatusBar
    state={clientState}
    {sessionId}
    {e2eEnabled}
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
      onConnect={handleConnect}
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
