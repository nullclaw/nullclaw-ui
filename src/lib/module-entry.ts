import { mount, unmount } from 'svelte';
import EmbedChat from './components/EmbedChat.svelte';
import type { ChatMessage } from '$lib/stores/session.svelte';

export interface ModuleOptions {
  instanceUrl?: string;
  wsUrl?: string;
  pairingCode?: string;
  initialMessages?: ChatMessage[];
  theme?: string;
  token?: string;
}

export function create(container: HTMLElement, opts: ModuleOptions) {
  const wsUrl = opts.wsUrl || opts.instanceUrl || '';
  const pairingCode = opts.pairingCode || '123456';
  const initialMessages = opts.initialMessages || [];

  const component = mount(EmbedChat, {
    target: container,
    props: { wsUrl, pairingCode, initialMessages },
  });

  return {
    destroy() {
      unmount(component);
    },
  };
}
