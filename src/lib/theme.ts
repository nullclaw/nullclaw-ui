export const THEME_STORAGE_KEY = 'nullclaw_ui_theme';
export const EFFECTS_STORAGE_KEY = 'nullclaw_ui_effects';

export const SUPPORTED_THEMES = ['matrix', 'dracula', 'synthwave', 'amber', 'light'] as const;
export type ThemeName = (typeof SUPPORTED_THEMES)[number];

export const THEME_OPTIONS: Array<{ value: ThemeName; label: string }> = [
  { value: 'matrix', label: 'Matrix' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'synthwave', label: 'Synthwave' },
  { value: 'amber', label: 'Amber' },
  { value: 'light', label: 'Light Mode' },
];

const THEME_CLASS_PREFIX = 'theme-';
const THEME_CLASS_NAMES = new Set(SUPPORTED_THEMES.map((theme) => `${THEME_CLASS_PREFIX}${theme}`));

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function isThemeName(value: string): value is ThemeName {
  return SUPPORTED_THEMES.includes(value as ThemeName);
}

export function coerceTheme(value: string, fallback: ThemeName = 'matrix'): ThemeName {
  return isThemeName(value) ? value : fallback;
}

export function loadTheme(fallback: ThemeName = 'matrix'): ThemeName {
  const storage = getStorage();
  if (!storage) return fallback;

  const storedTheme = storage.getItem(THEME_STORAGE_KEY);
  if (!storedTheme) return fallback;

  return coerceTheme(storedTheme, fallback);
}

export function saveTheme(theme: ThemeName) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(THEME_STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemeName) {
  if (typeof document === 'undefined') return;

  for (const className of Array.from(document.body.classList)) {
    if (THEME_CLASS_NAMES.has(className)) {
      document.body.classList.remove(className);
    }
  }

  document.body.classList.add(`${THEME_CLASS_PREFIX}${theme}`);
}

export function loadEffectsEnabled(fallback: boolean = false): boolean {
  const storage = getStorage();
  if (!storage) return fallback;

  const stored = storage.getItem(EFFECTS_STORAGE_KEY);
  if (stored === null) return fallback;
  if (stored !== 'true' && stored !== 'false') return fallback;

  return stored === 'true';
}

export function saveEffectsEnabled(enabled: boolean) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(EFFECTS_STORAGE_KEY, String(enabled));
}

export function applyEffectsEnabled(enabled: boolean) {
  if (typeof document === 'undefined') return;

  if (enabled) {
    document.body.classList.remove('effects-disabled');
  } else {
    document.body.classList.add('effects-disabled');
  }
}
