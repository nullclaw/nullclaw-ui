import { base64UrlToBytes, bytesToBase64Url } from '$lib/protocol/e2e';

export const AUTH_STORAGE_KEY = 'nullclaw_ui_auth_v1';
export const DEFAULT_TOKEN_TTL_SECS = 86_400;

export interface StoredAuth {
  url: string;
  access_token: string;
  shared_key: string;
  expires_at: number;
}

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isStoredAuth(value: unknown): value is StoredAuth {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.url === 'string' &&
    typeof obj.access_token === 'string' &&
    typeof obj.shared_key === 'string' &&
    typeof obj.expires_at === 'number'
  );
}

export function loadStoredAuth(): StoredAuth | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isStoredAuth(parsed)) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (parsed.expires_at <= Date.now()) {
      storage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    storage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function clearStoredAuth() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(AUTH_STORAGE_KEY);
}

export function saveStoredAuth(
  url: string,
  accessToken: string,
  sharedKey: Uint8Array,
  expiresIn?: unknown,
) {
  const storage = getStorage();
  if (!storage) return;

  const ttlSecs = isPositiveFiniteNumber(expiresIn)
    ? Math.floor(expiresIn)
    : DEFAULT_TOKEN_TTL_SECS;

  const payload: StoredAuth = {
    url,
    access_token: accessToken,
    shared_key: bytesToBase64Url(sharedKey),
    expires_at: Date.now() + ttlSecs * 1000,
  };

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

export function parseStoredSharedKey(sharedKey: string): Uint8Array | null {
  try {
    const decoded = base64UrlToBytes(sharedKey);
    if (decoded.length !== 32) return null;
    return decoded;
  } catch {
    return null;
  }
}
