<script module lang="ts">
  import { marked } from "marked";
  import { markedHighlight } from "marked-highlight";
  import hljs from "highlight.js";
  import "highlight.js/styles/atom-one-dark.css";

  let highlightConfigured = false;
  if (!highlightConfigured) {
    marked.use(
      markedHighlight({
        langPrefix: "hljs language-",
        highlight(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : "plaintext";
          return hljs.highlight(code, { language }).value;
        },
      }),
    );
    highlightConfigured = true;
  }
</script>

<script lang="ts">
  import type { ChatMessage } from "$lib/stores/session.svelte";
  import DOMPurify from "isomorphic-dompurify";

  interface Props {
    message: ChatMessage;
  }

  let { message }: Props = $props();

  const isUser = $derived(message.role === "user");
  const time = $derived(
    new Date(message.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  );

  const rawHtml = $derived(
    marked.parse(message.content, { breaks: true, gfm: true }) as string,
  );
  const safeHtml = $derived(DOMPurify.sanitize(rawHtml));

  function setupCopy(node: HTMLElement) {
    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (
        target.tagName === "CODE" &&
        target.parentElement?.tagName !== "PRE"
      ) {
        copyText(target, target.textContent || "");
        return;
      }

      const pre = target.closest("pre");
      if (pre) {
        const codeEl = pre.querySelector("code");
        if (codeEl) {
          copyText(pre, codeEl.textContent || "");
        }
      }
    };

    const copyText = async (el: HTMLElement, text: string) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);

        const originalTx = el.style.transform;
        const originalFilter = el.style.filter;
        const originalTransition = el.style.transition;

        el.style.transition = "all 0.1s ease";
        el.style.transform = "scale(0.98)";
        el.style.filter = "brightness(1.5)";

        setTimeout(() => {
          el.style.transform = originalTx;
          el.style.filter = originalFilter;

          setTimeout(() => {
            el.style.transition = originalTransition;
          }, 100);
        }, 150);
      } catch (err) {
        console.error("Failed to copy", err);
      }
    };

    node.addEventListener("click", handleClick);
    return {
      destroy() {
        node.removeEventListener("click", handleClick);
      },
    };
  }
</script>

<div class="bubble-container" class:user={isUser} class:assistant={!isUser}>
  <div class="meta">
    <span class="prompt">
      {#if isUser}
        <span class="user-prompt">user@nullclaw</span><span class="punct"
          >:~#</span
        >
      {:else}
        <span class="sys-prompt">system@nullclaw</span><span class="punct"
          >:~$</span
        >
      {/if}
    </span>
    <span class="timestamp">[{time}]</span>
  </div>
  <div class="content typewriter">
    <div class="markdown-body" use:setupCopy>
      {@html safeHtml}
    </div>
    {#if message.streaming}
      <span class="cursor">█</span>
    {/if}
  </div>
</div>

<style>
  .bubble-container {
    width: 100%;
    padding: 8px 12px;
    margin: 4px 0;
    font-family: var(--font-mono);
    border-left: 2px solid transparent;
    transition: background 0.3s;
  }

  .user {
    border-left-color: var(--accent-dim);
    background: rgba(0, 0, 0, 0.2);
  }

  .assistant {
    border-left-color: var(--warning);
    background: rgba(255, 170, 0, 0.03);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 4px;
    opacity: 0.8;
  }

  .prompt {
    font-weight: bold;
  }

  .user-prompt {
    color: var(--accent);
  }

  .sys-prompt {
    color: var(--warning);
  }

  .punct {
    color: var(--fg-dim);
    margin-left: 4px;
    margin-right: 8px;
  }

  .timestamp {
    color: var(--fg-dim);
    font-size: 10px;
  }

  .content {
    font-size: 14px;
    line-height: 1.6;
    word-wrap: break-word;
    white-space: pre-wrap;
    color: var(--fg);
    text-shadow: var(--text-glow);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .markdown-body {
    flex: 1;
    min-width: 100%;
  }

  /* Specific Markdown Styling corresponding to console UI */
  :global(.markdown-body p) {
    margin: 0 0 8px 0;
  }

  :global(.markdown-body p:last-child) {
    margin-bottom: 0;
  }

  :global(.markdown-body strong) {
    color: var(--accent);
    font-weight: 900;
    text-shadow: 0 0 8px var(--accent-dim);
  }

  :global(.markdown-body em) {
    color: var(--warning);
    font-style: italic;
  }

  :global(.markdown-body code:not(pre code)) {
    background: rgba(255, 42, 42, 0.15); /* error color bg */
    color: var(--error);
    padding: 2px 4px;
    border-radius: 2px;
    font-size: 0.9em;
    text-shadow: none;
    border: 1px solid rgba(255, 42, 42, 0.3);
  }

  :global(.markdown-body pre) {
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border);
    padding: 12px;
    overflow-x: auto;
    border-radius: 4px;
    margin: 8px 0;
    box-shadow: inset 0 0 10px rgba(0, 255, 65, 0.05); /* very subtle accent glow inside */
  }

  :global(.markdown-body pre code) {
    background: none;
    color: var(--fg);
    padding: 0;
    border: none;
    text-shadow: none;
  }

  :global(.markdown-body ul, .markdown-body ol) {
    margin: 4px 0 8px 24px;
    padding: 0;
  }

  :global(.markdown-body li) {
    margin-bottom: 4px;
  }

  :global(.markdown-body blockquote) {
    border-left: 2px dashed var(--warning);
    margin: 8px 0;
    padding-left: 12px;
    color: var(--fg-dim);
    background: rgba(255, 170, 0, 0.05);
  }

  /* Animates the text container like it's typing */
  .typewriter {
    overflow: hidden;
    animation: typeWriter 0.5s steps(40, end);
  }

  .cursor {
    color: var(--accent);
    animation: blink 1s step-end infinite;
    text-shadow: var(--border-glow);
    margin-left: -4px;
    display: inline-block;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
