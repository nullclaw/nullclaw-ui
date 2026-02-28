// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EFFECTS_STORAGE_KEY,
  applyEffectsEnabled,
  THEME_STORAGE_KEY,
  applyTheme,
  coerceTheme,
  isThemeName,
  loadEffectsEnabled,
  loadTheme,
  saveEffectsEnabled,
  saveTheme,
} from './theme';

class MockStorage implements Storage {
  private map = new Map<string, string>();

  get length() {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('theme utilities', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = new MockStorage();
    vi.stubGlobal('localStorage', storage);
    document.body.className = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates and coerces theme names', () => {
    expect(isThemeName('matrix')).toBe(true);
    expect(isThemeName('unknown')).toBe(false);
    expect(coerceTheme('light')).toBe('light');
    expect(coerceTheme('unknown', 'amber')).toBe('amber');
  });

  it('persists and restores theme from storage', () => {
    saveTheme('dracula');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dracula');
    expect(loadTheme()).toBe('dracula');
  });

  it('falls back for unknown stored theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'bad-theme');
    expect(loadTheme('synthwave')).toBe('synthwave');
  });

  it('applies theme class while preserving unrelated body classes', () => {
    document.body.classList.add('layout-ready');
    document.body.classList.add('theme-matrix');

    applyTheme('amber');

    expect(document.body.classList.contains('layout-ready')).toBe(true);
    expect(document.body.classList.contains('theme-matrix')).toBe(false);
    expect(document.body.classList.contains('theme-amber')).toBe(true);

    applyTheme('light');
    expect(document.body.classList.contains('theme-amber')).toBe(false);
    expect(document.body.classList.contains('theme-light')).toBe(true);
  });

  it('persists, loads and applies visual effects preference', () => {
    expect(loadEffectsEnabled(true)).toBe(true);

    saveEffectsEnabled(false);
    expect(localStorage.getItem(EFFECTS_STORAGE_KEY)).toBe('false');
    expect(loadEffectsEnabled(true)).toBe(false);

    applyEffectsEnabled(false);
    expect(document.body.classList.contains('effects-disabled')).toBe(true);

    saveEffectsEnabled(true);
    expect(loadEffectsEnabled(false)).toBe(true);
    applyEffectsEnabled(true);
    expect(document.body.classList.contains('effects-disabled')).toBe(false);

    localStorage.setItem(EFFECTS_STORAGE_KEY, 'invalid');
    expect(loadEffectsEnabled(false)).toBe(false);
  });
});
