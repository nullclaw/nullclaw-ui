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
        endpointUrl: "wss://host.example/ws?token=super-secret&foo=bar",
        onSend: vi.fn(),
        onApproval: vi.fn(),
      },
    });

    const text = container.textContent ?? "";
    expect(text).toContain("wss://host.example/ws?token=***&foo=bar");
    expect(text).not.toContain("super-secret");
  });
});
