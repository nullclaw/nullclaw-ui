// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EFFECTS_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from '$lib/theme';
import {
  applyUiPreferences,
  loadUiPreferences,
  persistEffectsPreference,
  persistThemePreference,
  resolveThemePreference,
} from './preferences';

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

describe('ui preferences', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MockStorage());
    document.body.className = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads defaults when storage is empty', () => {
    const preferences = loadUiPreferences('matrix', true);
    expect(preferences).toEqual({ theme: 'matrix', effectsEnabled: true });
  });

  it('loads persisted values and applies them to body classes', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'amber');
    localStorage.setItem(EFFECTS_STORAGE_KEY, 'false');

    const preferences = loadUiPreferences('matrix', true);
    expect(preferences).toEqual({ theme: 'amber', effectsEnabled: false });

    applyUiPreferences(preferences);
    expect(document.body.classList.contains('theme-amber')).toBe(true);
    expect(document.body.classList.contains('effects-disabled')).toBe(true);
  });

  it('persists theme and effects preferences', () => {
    persistThemePreference('dracula');
    persistEffectsPreference(false);

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dracula');
    expect(localStorage.getItem(EFFECTS_STORAGE_KEY)).toBe('false');
    expect(document.body.classList.contains('theme-dracula')).toBe(true);
    expect(document.body.classList.contains('effects-disabled')).toBe(true);
  });

  it('resolves invalid themes to current value', () => {
    expect(resolveThemePreference('matrix', 'amber')).toBe('matrix');
    expect(resolveThemePreference('bad-theme', 'amber')).toBe('amber');
  });
});
