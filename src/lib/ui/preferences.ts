import {
  applyEffectsEnabled,
  applyTheme,
  coerceTheme,
  loadEffectsEnabled,
  loadTheme,
  saveEffectsEnabled,
  saveTheme,
  type ThemeName,
} from '$lib/theme';

export interface UiPreferences {
  theme: ThemeName;
  effectsEnabled: boolean;
}

export function loadUiPreferences(
  fallbackTheme: ThemeName = 'matrix',
  fallbackEffectsEnabled = true,
): UiPreferences {
  return {
    theme: loadTheme(fallbackTheme),
    effectsEnabled: loadEffectsEnabled(fallbackEffectsEnabled),
  };
}

export function applyUiPreferences(preferences: UiPreferences) {
  applyTheme(preferences.theme);
  applyEffectsEnabled(preferences.effectsEnabled);
}

export function persistThemePreference(theme: ThemeName) {
  saveTheme(theme);
  applyTheme(theme);
}

export function persistEffectsPreference(enabled: boolean) {
  saveEffectsEnabled(enabled);
  applyEffectsEnabled(enabled);
}

export function resolveThemePreference(input: string, currentTheme: ThemeName): ThemeName {
  return coerceTheme(input, currentTheme);
}
