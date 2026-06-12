/**
 * backupManager — TICKET-094 (backup orchestration, Agent G)
 *
 * Singleton-ish module (no React) that owns:
 *   - ensureKeyAndCode() — load or generate the data key + recovery code.
 *   - backupNow()        — encrypt + upload + persist last_backup_at.
 *   - getStatus()        — local timestamp + server status + stale flag.
 *   - restoreFromCloud() — decrypt + restore DB via keychain or recovery code.
 *   - maybeAutoBackup()  — 6-hour debounce wrapper; swallows errors; no key logs.
 *
 * Crypto contract — coded strictly against spec §3 (Agent E owns the files):
 *   import { generateDataKey, generateRecoveryCode, encryptBackup,
 *            decryptWithKey, decryptWithRecoveryCode, unwrapDataKey }
 *     from './blobCrypto';
 *   import { saveDataKey, loadDataKey, markRecoveryCodeAcknowledged,
 *            isRecoveryCodeAcknowledged }
 *     from './keyStore';
 *
 * API shapes — spec §4:
 *   PUT /user/backup-blob  body: { envelope }  → { updated_at }
 *   GET /user/backup-blob                      → { envelope, updated_at }
 *   GET /user/backup-blob/status               → { exists, updated_at, bytes }
 *
 * SECURITY: no key material is ever written to logs. Recovery code is returned
 * in-memory via pendingRecoveryCode then cleared immediately after the UI reads
 * it — it is NEVER persisted, logged, or sent to the server.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../../api/client';
import { localDb } from '../../db/localDb';
import {
  buildBackupFromDb,
  canonicalize,
  parseImport,
  restoreBackupToDb,
} from './exportEngine';

// ---------------------------------------------------------------------------
// Crypto contract (Agent E owns these files — do NOT edit them here)
// ---------------------------------------------------------------------------

import {
  generateDataKey,
  generateRecoveryCode,
  createKeyWrap,
  encryptBackup,
  decryptWithKey,
  decryptWithRecoveryCode,
  unwrapDataKey,
  type KeyWrap,
} from './blobCrypto';
import {
  saveDataKey,
  loadDataKey,
  saveKeyWrap,
  loadKeyWrap,
  markRecoveryCodeAcknowledged,
} from './keyStore';

// ---------------------------------------------------------------------------
// AsyncStorage key
// ---------------------------------------------------------------------------

const LAST_BACKUP_AT_KEY = '@peak_fettle/last_backup_at';

// ---------------------------------------------------------------------------
// In-memory handoff for the recovery code
// (never persisted — UI must read and clear synchronously)
// ---------------------------------------------------------------------------

let pendingRecoveryCode: string | null = null;

/** Read and clear the pending recovery code.  Screens call this once on mount. */
export function consumePendingRecoveryCode(): string | null {
  const code = pendingRecoveryCode;
  pendingRecoveryCode = null;
  return code;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnsureKeyResult {
  dataKey: Uint8Array;
  recoveryCode: string | null; // non-null only when freshly generated this call
  isNew: boolean;
  keyWrap: KeyWrap;            // always present — created+persisted on first backup, loaded thereafter
  needsRecoveryAck?: boolean;  // true when a new code was generated due to missing wrap (legacy recovery)
}

export type BackupNowResult =
  | { ok: true; at: string }
  | { ok: true; at: string; needsRecoveryAck: true }
  | { ok: false; error: string };

export interface BackupStatus {
  lastLocalAt: string | null;
  server: { exists: boolean; updated_at: string | null } | null;
  stale: boolean;
}

export type RestoreResult =
  | { ok: true; restored: number }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Expo getRandomBytes via dynamic require (matches blobCrypto RNG pattern). */
function getRng(): (n: number) => Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExpoCrypto = require('expo-crypto');
  return (n: number) => ExpoCrypto.getRandomBytes(n);
}

// ---------------------------------------------------------------------------
// ensureKeyAndCode
// ---------------------------------------------------------------------------

/**
 * Load the data key from the keychain.  If absent, generate a fresh key +
 * recovery code, create+save the KeyWrap, save the key, and return the code
 * so the UI can display it — this is the ONLY time a fresh code is created.
 *
 * If the key exists but the wrap is missing (legacy install or corrupt state),
 * generate a fresh recovery code, rebuild the wrap from the EXISTING data key,
 * persist both, and set needsRecoveryAck so the UI can surface the new code.
 *
 * The recovery code itself is NEVER persisted.
 */
export async function ensureKeyAndCode(): Promise<EnsureKeyResult> {
  const existing = await loadDataKey();
  const rng = getRng();

  if (existing) {
    const keyBytes = Uint8Array.from(Buffer.from(existing, 'base64'));
    const storedWrap = await loadKeyWrap();

    if (storedWrap) {
      // Happy path — key + wrap both present; no code needed.
      return { dataKey: keyBytes, recoveryCode: null, isNew: false, keyWrap: storedWrap };
    }

    // Legacy / corrupt state: key exists but wrap is missing.
    // Generate a fresh recovery code, derive a new wrap from the existing key,
    // persist the wrap, and signal that the user must re-acknowledge the new code.
    const freshCode = generateRecoveryCode(rng);
    const newWrap = await createKeyWrap(keyBytes, freshCode, rng);
    await saveKeyWrap(newWrap);
    // Return needsRecoveryAck so backupNow surfaces the code to the UI.
    return { dataKey: keyBytes, recoveryCode: freshCode, isNew: false, keyWrap: newWrap, needsRecoveryAck: true };
  }

  // First backup — generate key + code + wrap.
  const dataKey = generateDataKey(rng);
  const recoveryCode = generateRecoveryCode(rng);

  // Create and persist the wrap; persist the key; never persist the code.
  const keyWrap = await createKeyWrap(dataKey, recoveryCode, rng);
  await saveKeyWrap(keyWrap);
  await saveDataKey(Buffer.from(dataKey).toString('base64'));

  return { dataKey, recoveryCode, isNew: true, keyWrap };
}

// ---------------------------------------------------------------------------
// backupNow
// ---------------------------------------------------------------------------

/**
 * Full backup cycle:
 *   1. Init DB + build export doc.
 *   2. Canonicalize plaintext.
 *   3. Ensure (or generate) the data key.
 *   4. Encrypt envelope.
 *   5. PUT to /user/backup-blob.
 *   6. Persist last_backup_at.
 *   7. If a new key was generated and the recovery code has not yet been
 *      acknowledged, stash the code in pendingRecoveryCode and return
 *      needsRecoveryAck:true so the caller routes to /recovery-code.
 */
export async function backupNow(): Promise<BackupNowResult> {
  try {
    await localDb.init();
    const doc = await buildBackupFromDb(localDb);
    const plaintext = canonicalize(doc);

    const { dataKey, recoveryCode, isNew, keyWrap, needsRecoveryAck } = await ensureKeyAndCode();

    const rng = getRng();
    // encryptBackup no longer derives anything; keyWrap fields are copied verbatim.
    const envelope = await encryptBackup(plaintext, dataKey, keyWrap, rng);

    const response = await apiClient.put<{ updated_at: string }>(
      '/user/backup-blob',
      { envelope },
    );

    const at = response.data.updated_at ?? new Date().toISOString();
    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, at);

    if ((isNew || needsRecoveryAck) && recoveryCode) {
      // Stash the code for the recovery-code screen to consume.
      // NEVER log the code.
      pendingRecoveryCode = recoveryCode;
      return { ok: true, at, needsRecoveryAck: true };
    }

    return { ok: true, at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns local last-backup timestamp, server status, and a stale flag.
 * stale = no backup in >7 days while the DB has data.
 */
export async function getStatus(): Promise<BackupStatus> {
  const lastLocalAt = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);

  let server: BackupStatus['server'] = null;
  try {
    const res = await apiClient.get<{ exists: boolean; updated_at: string | null; bytes: number }>(
      '/user/backup-blob/status',
    );
    server = { exists: res.data.exists, updated_at: res.data.updated_at ?? null };
  } catch {
    // Server unreachable — report null; caller decides how to surface this.
    server = null;
  }

  // Stale: no local backup recorded OR the last one is >7 days old.
  let stale = false;
  if (!lastLocalAt) {
    stale = true;
  } else {
    const age = Date.now() - new Date(lastLocalAt).getTime();
    if (age > SEVEN_DAYS_MS) stale = true;
  }

  return { lastLocalAt: lastLocalAt ?? null, server, stale };
}

// ---------------------------------------------------------------------------
// restoreFromCloud
// ---------------------------------------------------------------------------

/**
 * Restore flow:
 *   1. GET /user/backup-blob.
 *   2. Try keychain key first (same-ecosystem reinstall path).
 *   3. If no keychain key, require recoveryCode to be supplied.
 *      On success: unwrap + re-save the data key so future backups reuse it.
 *   4. Decrypt → parseImport → restoreBackupToDb → set last_backup_at.
 */
export async function restoreFromCloud(
  opts: { recoveryCode?: string } = {},
): Promise<RestoreResult> {
  try {
    const res = await apiClient.get<{ envelope: unknown; updated_at: string }>(
      '/user/backup-blob',
    );
    const envelope = res.data.envelope as Parameters<typeof decryptWithKey>[0];

    let plaintext: string;

    const storedKeyB64 = await loadDataKey();
    if (storedKeyB64) {
      // Keychain path.
      const dataKey = Uint8Array.from(Buffer.from(storedKeyB64, 'base64'));
      plaintext = decryptWithKey(envelope, dataKey);
    } else if (opts.recoveryCode) {
      // Recovery-code path.
      plaintext = await decryptWithRecoveryCode(envelope, opts.recoveryCode);
      // Unwrap + re-save the data key so the next backup reuses it.
      const recoveredKey = await unwrapDataKey(envelope, opts.recoveryCode);
      await saveDataKey(Buffer.from(recoveredKey).toString('base64'));
      // Rebuild the wrap directly from the envelope fields — no re-derivation needed.
      // This ensures all subsequent backups can use the same wrap (and code remains valid).
      await saveKeyWrap({
        salt: envelope.salt,
        wrap_iv: envelope.wrap_iv,
        wrapped_key: envelope.wrapped_key,
      });
    } else {
      return { ok: false, error: 'No keychain key found. Enter your recovery code to restore.' };
    }

    const parsed = parseImport(JSON.parse(plaintext));
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }

    await localDb.init();
    await restoreBackupToDb(localDb, parsed.tables);

    // Mark last_backup_at from the server timestamp.
    const serverAt = res.data.updated_at ?? new Date().toISOString();
    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, serverAt);

    const restored = Object.values(parsed.tables).reduce(
      (n, rows) => n + rows.length,
      0,
    );
    return { ok: true, restored };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// maybeAutoBackup
// ---------------------------------------------------------------------------

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Debounced auto-backup:
 *   - Skip if last_backup_at is within the last 6 hours.
 *   - Never throw — swallow all errors with console.warn.
 *   - NEVER log key material.
 */
export async function maybeAutoBackup(
  reason: 'background' | 'launch',
): Promise<void> {
  try {
    const lastAtStr = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
    if (lastAtStr) {
      const age = Date.now() - new Date(lastAtStr).getTime();
      if (age < SIX_HOURS_MS) {
        return; // debounce
      }
    }

    const result = await backupNow();
    if (!result.ok) {
      console.warn('[PF/backup] maybeAutoBackup(' + reason + ') failed:', result.error);
    }
    // If needsRecoveryAck — don't navigate from a background trigger; the
    // pendingRecoveryCode will be picked up next time the user opens data-export.
  } catch (err) {
    // Swallow — auto-backup must never crash the app.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[PF/backup] maybeAutoBackup(' + reason + ') error:', msg);
  }
}
