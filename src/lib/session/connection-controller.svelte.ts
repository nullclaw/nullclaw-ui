import { NullclawClient } from '$lib/protocol/client.svelte';
import { createSessionStore } from '$lib/stores/session.svelte';
import {
  clearStoredAuth,
  loadStoredAuth,
  parseStoredSharedKey,
  saveStoredAuth,
} from '$lib/session/auth-storage';
import {
  deriveSharedKey,
  exportPublicKey,
  generateKeyPair,
} from '$lib/protocol/e2e';

const DEFAULT_ENDPOINT_URL = 'ws://unknown';
const PAIRING_TIMEOUT_MS = 10_000;
const PAIRING_STATE_POLL_MS = 50;

type ClientBindings = {
  setPairingKeyPair: (pairingKeyPair: CryptoKeyPair | null) => void;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function createConnectionController(sessionId: string) {
  let client = $state<NullclawClient | null>(null);
  let pairingError = $state<string | null>(null);
  let lastEndpointUrl = $state<string | null>(null);

  const session = createSessionStore();

  const clientState = $derived(client?.state ?? 'disconnected');
  const isPaired = $derived(clientState === 'paired' || clientState === 'chatting');
  const endpointUrl = $derived(client?.url ?? lastEndpointUrl ?? DEFAULT_ENDPOINT_URL);

  function attachClientHandlers(newClient: NullclawClient, endpointUrl: string): ClientBindings {
    let pairingKeyPair: CryptoKeyPair | null = null;

    newClient.onEvent = async (event) => {
      const payload = asObject(event.payload);

      if (event.type === 'pairing_result') {
        const e2ePayload = asObject(payload?.e2e);
        const agentPub =
          e2ePayload && typeof e2ePayload.agent_pub === 'string' ? e2ePayload.agent_pub : null;
        const accessToken =
          payload && typeof payload.access_token === 'string' ? payload.access_token : null;
        const expiresIn = payload?.expires_in;

        if (pairingKeyPair && agentPub && accessToken) {
          try {
            const sharedKey = await deriveSharedKey(pairingKeyPair.privateKey, agentPub);
            newClient.setE2EKey(sharedKey);
            saveStoredAuth(endpointUrl, accessToken, sharedKey, expiresIn);
            lastEndpointUrl = endpointUrl;
          } catch {
            pairingError = 'Could not complete secure pairing';
            clearStoredAuth();
            newClient.clearSessionAuth();
          }
        }
      } else if (event.type === 'error') {
        if (payload?.code === 'unauthorized') {
          clearStoredAuth();
          session.clear();
          lastEndpointUrl = null;
        }

        if (newClient.state === 'pairing' || newClient.state === 'connecting') {
          pairingError = typeof payload?.message === 'string' ? payload.message : 'Pairing failed';
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
    timeoutMs = PAIRING_TIMEOUT_MS,
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
          finish(() => reject(new Error('Connection replaced')));
          return;
        }

        if (nextClient.state === 'pairing') {
          finish(resolve);
          return;
        }

        if (nextClient.state === 'disconnected') {
          finish(() => reject(new Error('Connection failed')));
        }
      }, PAIRING_STATE_POLL_MS);

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('Connection timeout')));
      }, timeoutMs);
    });
  }

  async function connectWithPairing(url: string, code: string): Promise<void> {
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
      pairingError = 'Could not connect to server';
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

      const sent = newClient.sendPairingRequest(code, clientPub);
      if (!sent) {
        pairingError = 'Pairing request could not be sent';
        newClient.disconnect();
        if (client === newClient) {
          client = null;
        }
      }
    } catch {
      pairingError = 'Failed to initialize end-to-end encryption';
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

  function sendMessage(content: string): boolean {
    if (!client) return false;

    const sent = client.sendMessage(content);
    if (!sent) {
      session.setError('Could not send message. Connection is not ready.');
      return false;
    }

    session.addUserMessage(content);
    return true;
  }

  function sendApproval(id: string, requestId: string | undefined, approved: boolean): boolean {
    if (!client) return false;

    const sent = client.sendApproval(approved, requestId);
    if (!sent) {
      session.setError('Could not send approval response. Connection is not ready.');
      return false;
    }

    session.resolveApproval(id);
    return true;
  }

  function logout() {
    if (client) {
      client.disconnect();
    }
    clearStoredAuth();
    session.clear();
    client = null;
    lastEndpointUrl = null;
    pairingError = null;
  }

  function dispose() {
    client?.disconnect();
    client = null;
  }

  return {
    get session() {
      return session;
    },
    get clientState() {
      return clientState;
    },
    get isPaired() {
      return isPaired;
    },
    get endpointUrl() {
      return endpointUrl;
    },
    get pairingError() {
      return pairingError;
    },
    connectWithPairing,
    restoreSavedSession,
    sendMessage,
    sendApproval,
    logout,
    dispose,
  };
}

export type ConnectionController = ReturnType<typeof createConnectionController>;
