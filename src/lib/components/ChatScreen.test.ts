import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/svelte";
import ChatScreen from "./ChatScreen.svelte";

describe("ChatScreen", () => {
  it("redacts websocket auth token in endpoint banner", () => {
    const { container } = render(ChatScreen, {
      props: {
        messages: [],
        toolCalls: [],
        approvals: [],
        error: null,
        isStreaming: false,
        isAwaitingAssistant: false,
        endpointUrl: "wss://host.example/ws?token=super-secret&foo=bar",
        onSend: vi.fn(),
        onApproval: vi.fn(),
      },
    });

    const text = container.textContent ?? "";
    expect(text).toContain("wss://host.example/ws?token=***&foo=bar");
    expect(text).not.toContain("super-secret");
  });

  it("keeps the textarea editable while assistant is streaming", () => {
    const { container } = render(ChatScreen, {
      props: {
        messages: [],
        toolCalls: [],
        approvals: [],
        error: null,
        isStreaming: true,
        isAwaitingAssistant: false,
        endpointUrl: "wss://host.example/ws",
        onSend: vi.fn(),
        onApproval: vi.fn(),
      },
    });

    const textarea = container.querySelector("textarea");
    const submit = container.querySelector('button[type="submit"]');

    expect(textarea).not.toBeNull();
    expect(textarea instanceof HTMLTextAreaElement).toBe(true);
    expect(textarea?.hasAttribute("disabled")).toBe(false);
    expect(submit instanceof HTMLButtonElement).toBe(true);
    expect((submit as HTMLButtonElement | null)?.disabled).toBe(true);
  });

  it("shows a thinking indicator before the first assistant token arrives", () => {
    const { container } = render(ChatScreen, {
      props: {
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: "hello",
            timestamp: 1,
          },
        ],
        toolCalls: [],
        approvals: [],
        error: null,
        isStreaming: false,
        isAwaitingAssistant: true,
        endpointUrl: "wss://host.example/ws",
        onSend: vi.fn(),
        onApproval: vi.fn(),
      },
    });

    expect(container.textContent ?? "").toContain("thinking");
  });

  it("keeps deterministic history order when timestamps are identical", () => {
    const { container } = render(ChatScreen, {
      props: {
        messages: [
          {
            id: "msg-2",
            role: "assistant",
            content: "second",
            timestamp: 1000,
            order: 2,
          },
          {
            id: "msg-1",
            role: "user",
            content: "first",
            timestamp: 1000,
            order: 1,
          },
        ],
        toolCalls: [],
        approvals: [],
        error: null,
        isStreaming: false,
        isAwaitingAssistant: false,
        endpointUrl: "wss://host.example/ws",
        onSend: vi.fn(),
        onApproval: vi.fn(),
      },
    });

    const text = container.textContent ?? "";
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });
});
