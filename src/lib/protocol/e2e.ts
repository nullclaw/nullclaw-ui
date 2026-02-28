import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/ciphers/utils.js';

const E2E_LABEL = 'webchannel-e2e-v1';

// -- Base64url helpers --

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const mod = s.length % 4;
  const pad = mod === 0 ? '' : '='.repeat(4 - mod);
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(buf: Uint8Array): string {
  return toBase64Url(buf);
}

export function base64UrlToBytes(s: string): Uint8Array {
  return fromBase64Url(s);
}

// -- X25519 key exchange (Web Crypto) --

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const generated = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  if (!('privateKey' in generated) || !('publicKey' in generated)) {
    throw new Error('WebCrypto did not return X25519 key pair');
  }
  return generated;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64Url(raw);
}

async function importPublicKey(base64url: string): Promise<CryptoKey> {
  const raw = fromBase64Url(base64url);
  const rawBuffer: ArrayBuffer =
    raw.byteOffset === 0 && raw.byteLength === raw.buffer.byteLength
      ? (raw.buffer as ArrayBuffer)
      : raw.slice().buffer;
  return crypto.subtle.importKey('raw', rawBuffer, { name: 'X25519' }, true, []);
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  remotePubBase64url: string,
): Promise<Uint8Array> {
  const remotePub = await importPublicKey(remotePubBase64url);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'X25519', public: remotePub },
    privateKey,
    256,
  );
  // SHA-256(label || shared_secret)
  const label = new TextEncoder().encode(E2E_LABEL);
  const combined = new Uint8Array(label.length + sharedBits.byteLength);
  combined.set(label);
  combined.set(new Uint8Array(sharedBits), label.length);
  const hash = await crypto.subtle.digest('SHA-256', combined);
  return new Uint8Array(hash);
}

// -- ChaCha20-Poly1305 symmetric encryption --

export function encrypt(
  sharedKey: Uint8Array,
  plaintext: string,
): { nonce: string; ciphertext: string } {
  const nonce = randomBytes(12);
  const cipher = chacha20poly1305(sharedKey, nonce);
  const data = new TextEncoder().encode(plaintext);
  const sealed = cipher.encrypt(data);
  return {
    nonce: toBase64Url(nonce),
    ciphertext: toBase64Url(sealed),
  };
}

export function decrypt(
  sharedKey: Uint8Array,
  nonceB64: string,
  ciphertextB64: string,
): string {
  const nonce = fromBase64Url(nonceB64);
  const ciphertext = fromBase64Url(ciphertextB64);
  const cipher = chacha20poly1305(sharedKey, nonce);
  const decrypted = cipher.decrypt(ciphertext);
  return new TextDecoder().decode(decrypted);
}
