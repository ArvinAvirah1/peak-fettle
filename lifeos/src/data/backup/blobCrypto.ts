/**
 * blobCrypto (Life OS port of TICKET-094 Workstream B / Agent E) — deviation #4
 *
 * Pure AES-256-GCM encryption/decryption for the E2E backup blob. Envelope
 * format v1 is IDENTICAL to mobile/src/data/backup/blobCrypto.ts (same fields,
 * same algorithm, same KDF params) — the server route (peak-fettle-agents/
 * server/routes/backup.js) validates this exact shape and is shared by both
 * apps, so the format cannot drift between them.
 *
 * Dependencies: @noble/ciphers (gcm), @noble/hashes (scryptAsync) — both are
 * already pinned in lifeos/package.json at the same versions mobile uses.
 * NO React-Native or Expo imports at the module level — RNG is injected for
 * testability; the production default lazily requires expo-crypto.
 *
 * SECURITY INVARIANTS (enforced here):
 *   • Math.random is never used for key material.
 *   • Key material is never logged.
 *   • Recovery code is never persisted by this module.
 */

import { gcm } from '@noble/ciphers/aes';
import { scryptAsync } from '@noble/hashes/scrypt';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The exact on-disk envelope — must match the server's validateEnvelope(). */
export interface Envelope {
  format: 'pf-encrypted-backup';
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'scrypt';
  kdf_params: { N: number; r: number; p: number };
  salt: string;        // base64-encoded 16 bytes — scrypt salt for KEK
  wrap_iv: string;     // base64-encoded 12 bytes — IV for wrapping data key
  wrapped_key: string; // base64-encoded 48 bytes — AES-256-GCM(KEK, dataKey)
  iv: string;          // base64-encoded 12 bytes — IV for payload
  ct: string;          // base64-encoded ciphertext of canonicalized export doc
  created_at: string;  // ISO 8601
}

/** Persisted key-wrap fields — ciphertext safe to store; recovery code never stored. */
export interface KeyWrap {
  salt: string;
  wrap_iv: string;
  wrapped_key: string;
}

/** Injected RNG signature — returns exactly n cryptographically-random bytes. */
export type RngFn = (n: number) => Uint8Array;

// ---------------------------------------------------------------------------
// Crockford base32 alphabet + codec
// ---------------------------------------------------------------------------

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function crockfordEncode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += CROCKFORD_ALPHABET[(value >>> bits) & 0x1f]!;
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 0x1f]!;
  }
  return output;
}

function crockfordDecode(s: string): Uint8Array {
  const normalized = normalizeRecoveryCode(s);
  const lookup: Record<string, number> = {};
  for (let i = 0; i < CROCKFORD_ALPHABET.length; i++) {
    lookup[CROCKFORD_ALPHABET[i]!] = i;
  }
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const v = lookup[char];
    if (v === undefined) throw new Error('DECODE_FAILED: invalid Crockford base32 character: ' + char);
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(output);
}

// ---------------------------------------------------------------------------
// Recovery code helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a recovery code: strip dashes and whitespace, uppercase,
 * map visually ambiguous characters: I→1, L→1, O→0.
 */
export function normalizeRecoveryCode(s: string): string {
  return s
    .replace(/[\s\-]/g, '')
    .toUpperCase()
    .replace(/I/g, '1')
    .replace(/L/g, '1')
    .replace(/O/g, '0');
}

// ---------------------------------------------------------------------------
// KDF
// ---------------------------------------------------------------------------

const KDF_PARAMS = { N: 32768, r: 8, p: 1 } as const;

/**
 * Derive a 256-bit Key Encryption Key from a recovery code and salt via scrypt.
 */
export async function deriveKek(code: string, salt: Uint8Array): Promise<Uint8Array> {
  const normalized = normalizeRecoveryCode(code);
  const key = await scryptAsync(normalized, salt, { ...KDF_PARAMS, dkLen: 32 });
  return key;
}

// ---------------------------------------------------------------------------
// Base64 helpers (runtime-agnostic: Buffer in Node, global btoa/atob on RN/web)
// ---------------------------------------------------------------------------

function bytesToB64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function b64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Production RNG (lazy — avoids importing expo-crypto at module load time)
// ---------------------------------------------------------------------------

function productionRng(n: number): Uint8Array {
  // Dynamic require so the module itself has no Expo/RN import at the top level.
  // This keeps the file importable in pure-Node tests without expo-crypto installed.
  let expoCrypto: { getRandomBytes: (n: number) => Uint8Array } | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    expoCrypto = require('expo-crypto') as { getRandomBytes: (n: number) => Uint8Array };
  } catch {
    throw new Error(
      'RNG_UNAVAILABLE: expo-crypto is not installed. Run: npx expo install expo-crypto',
    );
  }
  if (!expoCrypto || typeof expoCrypto.getRandomBytes !== 'function') {
    throw new Error(
      'RNG_UNAVAILABLE: expo-crypto is not installed. Run: npx expo install expo-crypto',
    );
  }
  return expoCrypto.getRandomBytes(n);
}

// ---------------------------------------------------------------------------
// Core key generation
// ---------------------------------------------------------------------------

/**
 * Generate a random 256-bit (32-byte) data key.
 * @param rng Injected RNG — defaults to expo-crypto.getRandomBytes.
 */
export function generateDataKey(rng: RngFn = productionRng): Uint8Array {
  return rng(32);
}

/**
 * Generate a random recovery code: 120 bits of entropy, Crockford base32,
 * formatted as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (6 groups × 4 characters).
 * @param rng Injected RNG — defaults to expo-crypto.getRandomBytes.
 */
export function generateRecoveryCode(rng: RngFn = productionRng): string {
  const bytes = rng(15);
  const encoded = crockfordEncode(bytes);
  const padded = encoded.padEnd(24, '0');
  return [
    padded.slice(0, 4),
    padded.slice(4, 8),
    padded.slice(8, 12),
    padded.slice(12, 16),
    padded.slice(16, 20),
    padded.slice(20, 24),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Encrypt / Decrypt
// ---------------------------------------------------------------------------

/**
 * Create a new KeyWrap — derive a fresh KEK from the recovery code and a fresh
 * 16-byte salt, then wrap the data key under it. Call once when a new
 * key+code is generated; persist via keyStore.saveKeyWrap.
 */
export async function createKeyWrap(
  dataKey: Uint8Array,
  recoveryCode: string,
  rng: RngFn = productionRng,
): Promise<KeyWrap> {
  const salt = rng(16);
  const wrapIv = rng(12);
  const kek = await deriveKek(recoveryCode, salt);
  const wrappedKey = gcm(kek, wrapIv).encrypt(dataKey);
  return {
    salt: bytesToB64(salt),
    wrap_iv: bytesToB64(wrapIv),
    wrapped_key: bytesToB64(wrappedKey),
  };
}

/**
 * Encrypt a backup plaintext string.
 *
 * Accepts a pre-computed KeyWrap (from keyStore) and copies its fields verbatim
 * into the envelope — no KEK derivation here. Only the payload IV is fresh per
 * call.
 *
 * @param plaintext canonicalize(buildBackupFromDb(localDb)) — UTF-8 string
 * @param dataKey   32-byte AES-256 data key
 * @param keyWrap   pre-computed wrap from keyStore.loadKeyWrap()
 * @param rng       Injected RNG — defaults to expo-crypto.getRandomBytes
 */
export async function encryptBackup(
  plaintext: string,
  dataKey: Uint8Array,
  keyWrap: KeyWrap,
  rng: RngFn = productionRng,
): Promise<Envelope> {
  const payloadIv = rng(12);

  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ct = gcm(dataKey, payloadIv).encrypt(plaintextBytes);

  return {
    format: 'pf-encrypted-backup',
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'scrypt',
    kdf_params: { N: KDF_PARAMS.N, r: KDF_PARAMS.r, p: KDF_PARAMS.p },
    salt: keyWrap.salt,
    wrap_iv: keyWrap.wrap_iv,
    wrapped_key: keyWrap.wrapped_key,
    iv: bytesToB64(payloadIv),
    ct: bytesToB64(ct),
    created_at: new Date().toISOString(),
  };
}

/**
 * Decrypt a backup envelope using the data key directly (keychain path).
 * Throws 'DECRYPT_FAILED' on GCM tag mismatch or any other decryption error.
 */
export function decryptWithKey(env: Envelope, dataKey: Uint8Array): string {
  try {
    const iv = b64ToBytes(env.iv);
    const ct = b64ToBytes(env.ct);
    const plaintext = gcm(dataKey, iv).decrypt(ct);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('DECRYPT_FAILED: authentication tag mismatch or corrupt envelope');
  }
}

/**
 * Unwrap the data key from the envelope using the recovery code.
 * Throws 'DECRYPT_FAILED' if the recovery code is wrong or the wrapped_key is tampered.
 */
export async function unwrapDataKey(env: Envelope, code: string): Promise<Uint8Array> {
  try {
    const salt = b64ToBytes(env.salt);
    const kek = await deriveKek(code, salt);
    const wrapIv = b64ToBytes(env.wrap_iv);
    const wrappedKey = b64ToBytes(env.wrapped_key);
    const dataKey = gcm(kek, wrapIv).decrypt(wrappedKey);
    return dataKey;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('DECRYPT_FAILED')) throw err;
    throw new Error('DECRYPT_FAILED: wrong recovery code or tampered wrapped_key');
  }
}

/**
 * Decrypt a backup envelope using only the recovery code (new-ecosystem path).
 * Derives the KEK, unwraps the data key, then decrypts the payload.
 */
export async function decryptWithRecoveryCode(env: Envelope, code: string): Promise<string> {
  const dataKey = await unwrapDataKey(env, code);
  return decryptWithKey(env, dataKey);
}
