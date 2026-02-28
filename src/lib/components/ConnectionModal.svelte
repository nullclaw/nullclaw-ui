<script lang="ts">
    import type { ClientState } from "$lib/protocol/client.svelte";

    interface Props {
        state: ClientState;
        sessionId: string;
        endpointUrl?: string;
        onClose: () => void;
    }

    let { state, sessionId, endpointUrl, onClose }: Props = $props();

    function handleBackdropClick() {
        onClose();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            onClose();
        }
    }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div
        class="modal-content"
        onclick={(e) => e.stopPropagation()}
        role="presentation"
    >
        <div class="modal-header">
            <h2>SYS_DIAGNOSTICS_REPORT</h2>
            <button class="close-btn" onclick={onClose} aria-label="Close">
                [X]
            </button>
        </div>

        <div class="modal-body">
            <div class="info-line">
                <span class="label">ENDPOINT_URI:</span>
                <span class="value">{endpointUrl || "UNRESOLVED"}</span>
            </div>

            <div class="info-line">
                <span class="label">ACTIVE_SESSION_ID:</span>
                <span class="value">{sessionId}</span>
            </div>

            <div class="info-line">
                <span class="label">CONNECTION_STATE:</span>
                <span class="value status-{state}">{state.toUpperCase()}</span>
            </div>

            <div class="divider"></div>

            <div class="info-line">
                <span class="label">E2E_STATUS:</span>
                <span class="value e2e-active"
                    >ACTIVE <span class="icon">🔒</span></span
                >
            </div>

            <div class="info-line">
                <span class="label">E2E_PROTOCOL:</span>
                <span class="value">X25519 (ECDH) + AES-256-GCM</span>
            </div>

            <div class="info-line">
                <span class="label">E2E_KEY_DERIVATION:</span>
                <span class="value">HKDF-SHA256</span>
            </div>

            <div class="divider"></div>

            <div class="info-line">
                <span class="label">CLI_VERSION:</span>
                <span class="value">Nullclaw v1.0.0</span>
            </div>
        </div>

        <div class="modal-footer">
            <button class="ack-btn" onclick={onClose}>ACKNOWLEDGE</button>
        </div>
    </div>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fade-in 0.2s ease-out;
    }

    .modal-content {
        background: var(--bg-surface);
        border: 2px solid var(--border);
        box-shadow:
            0 0 20px rgba(0, 0, 0, 0.8),
            0 0 15px var(--border-glow);
        width: 90%;
        max-width: 500px;
        padding: 24px;
        animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes slide-up {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--border);
        padding-bottom: 16px;
        margin-bottom: 24px;
    }

    .modal-header h2 {
        font-size: 16px;
        color: var(--accent);
        margin: 0;
        letter-spacing: 2px;
        text-shadow: var(--text-glow);
    }

    .close-btn {
        background: transparent;
        border: none;
        color: var(--fg-dim);
        font-size: 16px;
        padding: 0;
        box-shadow: none;
    }

    .close-btn:hover {
        color: var(--error);
        text-shadow: 0 0 8px var(--error);
        background: transparent;
    }

    .modal-body {
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1.6;
    }

    .info-line {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 6px 0;
        border-bottom: 1px dotted rgba(255, 255, 255, 0.1);
    }

    .info-line:last-child {
        border-bottom: none;
    }

    .info-line .label {
        color: var(--fg-dim);
        margin-right: 16px;
        white-space: nowrap;
    }

    .info-line .value {
        color: var(--fg);
        text-align: right;
        word-break: break-all;
    }

    .divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.2);
        margin: 12px 0;
    }
    .value.status-chatting,
    .value.status-paired {
        color: var(--accent);
        border-color: var(--border);
    }

    .value.status-connecting,
    .value.status-pairing {
        color: var(--warning);
        border-color: rgba(255, 170, 0, 0.3);
    }

    .value.status-disconnected {
        color: var(--error);
        border-color: rgba(255, 42, 42, 0.3);
    }

    .value.e2e-active {
        color: var(--accent);
        border-color: var(--border);
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        margin-top: 32px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .ack-btn {
        padding: 10px 24px;
        font-size: 12px;
    }
</style>
