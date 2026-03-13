import { mount, unmount } from 'svelte';
import EmbedChat from './components/EmbedChat.svelte';
import type { ChatMessage } from '$lib/stores/session.svelte';

export interface ModuleOptions {
  instanceUrl?: string;
  wsUrl?: string;
  pairingCode?: string;
  initialMessages?: ChatMessage[];
  autoSendMessage?: string;
  onAutoSend?: () => void;
  theme?: string;
  token?: string;
}

export function create(container: HTMLElement, opts: ModuleOptions) {
  const wsUrl = opts.wsUrl || opts.instanceUrl || '';
  const pairingCode = opts.pairingCode || '123456';
  const initialMessages = opts.initialMessages || [];
  const autoSendMessage = opts.autoSendMessage || '';
  const onAutoSend = opts.onAutoSend;

  const component = mount(EmbedChat, {
    target: container,
    props: { wsUrl, pairingCode, initialMessages, autoSendMessage, onAutoSend },
  });

  return {
    destroy() {
      unmount(component);
    },
  };
}
