// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import StatusBar from './StatusBar.svelte';

describe('StatusBar', () => {
  it('renders connected endpoint and dispatches theme/logout actions', async () => {
    const onThemeChange = vi.fn();
    const onEffectsChange = vi.fn();
    const onLogout = vi.fn();

    const { getByRole, getByText } = render(StatusBar, {
      props: {
        state: 'paired',
        sessionId: 'sess-1',
        endpointUrl: 'ws://127.0.0.1:32123/ws',
        currentTheme: 'matrix',
        effectsEnabled: true,
        onThemeChange,
        onEffectsChange,
        onLogout,
      },
    });

    expect(getByText('nullclaw@127.0.0.1:32123')).toBeTruthy();
    expect(getByText('[ SESSION: sess-1 ]')).toBeTruthy();

    await fireEvent.click(getByRole('button', { name: 'matrix ▼' }));
    await fireEvent.click(getByRole('button', { name: 'Amber' }));
    expect(onThemeChange).toHaveBeenCalledWith('amber');

    await fireEvent.click(getByRole('button', { name: 'FX:ON' }));
    expect(onEffectsChange).toHaveBeenCalledWith(false);

    await fireEvent.click(getByRole('button', { name: 'LOGOUT' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('hides logout and shows local address when disconnected', () => {
    const { queryByRole, getByText } = render(StatusBar, {
      props: {
        state: 'disconnected',
        sessionId: 'sess-2',
        currentTheme: 'dracula',
        effectsEnabled: false,
        onThemeChange: vi.fn(),
        onEffectsChange: vi.fn(),
        onLogout: vi.fn(),
      },
    });

    expect(getByText('sys@nullclaw')).toBeTruthy();
    expect(queryByRole('button', { name: 'LOGOUT' })).toBeNull();
  });
});
