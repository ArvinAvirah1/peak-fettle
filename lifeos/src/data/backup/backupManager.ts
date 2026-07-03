/**
 * backupManager (Life OS deviation #4 — wiring the E2E backup envelope) —
 * mirrors mobile/src/data/backup/backupManager.ts (TICKET-094, Agent G), ported
 * onto lifeos's own pure doc builder (src/data/backup.ts) and its own
 * crypto/key-store modules (this directory). Reuses the SAME server route,
 * /user/backup-blob, that mobile calls (peak-fettle-agents/server/routes/
 * backup.js is untouched — read-only).
 *
 * Owns:
 *   - ensureKeyAndCode() — load or generate the data key + recovery code.
 *   - backupNow()        — encrypt + upload + persist last_backup_at.
 *   - getStatus()        — local timestamp + server status + stale flag.
 *   - restoreFromServer()— decrypt + restore DB via keychain or recovery code.
 *   - maybeAutoBackup()  — 6-hour debounce wrapper; swallows errors; no key logs.
 *
 * API shapes (identical to mobile — same server route):
 *   PUT /user/backup-blob  body: { envelope }  → { updated_at }
 *   GET /user/backup-blob                      → { envelope, updated_at }
 *   GET /user/backup-blob/status               → { exists, updated_at, bytes }
 *
 * LOCAL-FIRST INVARIANT: every exported function here is non-throwing — all
 * failure paths return { ok: false, reason } (or the analogous shape) so a
 * network hiccup can never crash the UI or block the rest of the app. This
 * mirrors the CLAUDE.md rule that free/local-first users must never be at the
 * mercy of a REST round-trip; backup is opt-in and best-effort on top of that.
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
  restoreBackupToDb,
  LIFEOS_BACKUP_SCHEMA_VERSION,
  type LifeOsExportDoc,
} from '../backup';

// ---------------------------------------------------------------------------
// Crypto contract (this directory — ported verbatim from mobile's Agent E files)
// ---------------------------------------------------------------------------

import {
  generateDataKey,
  generateRecoveryCode,
  createKeyWrap,
  encryptBackup,
  decryptWithKey,
  decryptWithRecoveryCode,
  unwrapDataKey,
  type Envelope,
  type KeyWrap,
} from './blobCrypto';
import {
  saveDataKey,
  loadDataKey,
  saveKeyWrap,
  loadKeyWrap,
} from './keyStore';

// ---------------------------------------------------------------------------
// AsyncStorage key
// ---------------------------------------------------------------------------

const LAST_BACKUP_AT_KEY = '@peak_fettle_lifeos/last_backup_at';

// ---------------------------------------------------------------------------
// In-memory handoff for the recovery code
// (never persisted — UI must read and clear synchronously)
// ---------------------------------------------------------------------------

let pendingRecoveryCode: string | null = null;

/** Read and clear the pending recovery code. Screens call this once on mount. */
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
  | { ok: true; at: string; needsRecoveryAck?: true }
  | { ok: false; reason: string };

export interface BackupStatus {
  lastLocalAt: string | null;
  server: { exists: boolean; updated_at: string | null } | null;
  stale: boolean;
}

export type RestoreResult =
  | { ok: true; restored: number; needsAppReselect: true }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Expo getRandomBytes via dynamic require (matches blobCrypto RNG pattern). */
function getRng(): (n: number) => Uint8Array {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExpoCrypto = require('expo-crypto');
  return (n: number) => ExpoCrypto.getRandomBytes(n);
}

/** Count rows across every table of a parsed backup doc (for the UI summary). */
function countRows(doc: LifeOsExportDoc): number {
  return Object.values(doc.tables).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
}

// ---------------------------------------------------------------------------
// ensureKeyAndCode
// ---------------------------------------------------------------------------

/**
 * Load the data key from the keychain. If absent, generate a fresh key +
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
    const freshCode = generateRecoveryCode(rng);
    const newWrap = await createKeyWrap(keyBytes, freshCode, rng);
    await saveKeyWrap(newWrap);
    return { dataKey: keyBytes, recoveryCode: freshCode, isNew: false, keyWrap: newWrap, needsRecoveryAck: true };
  }

  // First backup — generate key + code + wrap.
  const dataKey = generateDataKey(rng);
  const recoveryCode = generateRecoveryCode(rng);

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
 *   1. Init DB + build export doc (src/data/backup.ts buildBackupFromDb).
 *   2. Canonicalize plaintext.
 *   3. Ensure (or generate) the data key.
 *   4. Encrypt envelope (blobCrypto.encryptBackup).
 *   5. PUT to /user/backup-blob.
 *   6. Persist last_backup_at.
 *   7. If a new key was generated and the recovery code has not yet been
 *      acknowledged, stash the code in pendingRecoveryCode and return
 *      needsRecoveryAck:true so the caller can surface it.
 *
 * Never throws — every failure path returns { ok: false, reason }.
 */
export async function backupNow(): Promise<BackupNowResult> {
  try {
    await localDb.init();
    const doc = await buildBackupFromDb(localDb);
    const plaintext = canonicalize(doc);

    const { dataKey, recoveryCode, isNew, keyWrap, needsRecoveryAck } = await ensureKeyAndCode();

    const rng = getRng();
    const envelope = await encryptBackup(plaintext, dataKey, keyWrap, rng);

    const response = await apiClient.put<{ updated_at: string }>(
      '/user/backup-blob',
      { envelope },
    );

    const at = response.data.updated_at ?? new Date().toISOString();
    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, at);

    if ((isNew || needsRecoveryAck) && recoveryCode) {
      // Stash the code for a recovery-code screen to consume. NEVER log it.
      pendingRecoveryCode = recoveryCode;
      return { ok: true, at, needsRecoveryAck: true };
    }

    return { ok: true, at };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns local last-backup timestamp, server status, and a stale flag.
 * stale = no backup in >7 days. Never throws — server unreachable => null.
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
// restoreFromServer
// ---------------------------------------------------------------------------

/**
 * Restore flow:
 *   1. GET /user/backup-blob.
 *   2. Try keychain key first (same-ecosystem reinstall path).
 *   3. If no keychain key, require recoveryCode to be supplied.
 *      On success: unwrap + re-save the data key so future backups reuse it.
 *   4. Decrypt → JSON.parse → restoreBackupToDb (src/data/backup.ts, which
 *      validates format + schemaVersion itself and wipes+reinserts every
 *      backup table) → set last_backup_at.
 *
 * Always returns needsAppReselect:true on success — the caller (UI) is
 * responsible for the two device-scoped re-setup prompts (re-pick blocked
 * apps, re-tag apps) since FamilyActivitySelection tokens and app labels are
 * NOT portable across devices/reinstalls (see src/data/backup.ts header).
 *
 * Never throws — every failure path returns { ok: false, reason }.
 */
export async function restoreFromServer(
  opts: { recoveryCode?: string } = {},
): Promise<RestoreResult> {
  try {
    const res = await apiClient.get<{ envelope: unknown; updated_at: string }>(
      '/user/backup-blob',
    );
    const envelope = res.data.envelope as Envelope;

    let plaintext: string;

    const storedKeyB64 = await loadDataKey();
    if (storedKeyB64) {
      // Keychain path.
      const dataKey = Uint8Array.from(Buffer.from(storedKeyB64, 'base64'));
      plaintext = decryptWithKey(envelope, dataKey);
    } else if (opts.recoveryCode) {
      // Recovery-code path.
      plaintext = await decryptWithRecoveryCode(envelope, opts.recoveryCode);
      const recoveredKey = await unwrapDataKey(envelope, opts.recoveryCode);
      await saveDataKey(Buffer.from(recoveredKey).toString('base64'));
      await saveKeyWrap({
        salt: envelope.salt,
        wrap_iv: envelope.wrap_iv,
        wrapped_key: envelope.wrapped_key,
      });
    } else {
      return { ok: false, reason: 'No keychain key found. Enter your recovery code to restore.' };
    }

    let doc: LifeOsExportDoc;
    try {
      doc = JSON.parse(plaintext) as LifeOsExportDoc;
    } catch {
      return { ok: false, reason: 'Backup payload was not valid JSON after decryption.' };
    }
    if (!doc || doc.format !== 'lifeos-backup') {
      return { ok: false, reason: 'Not a Life OS backup document.' };
    }
    if (typeof doc.schemaVersion !== 'number' || doc.schemaVersion > LIFEOS_BACKUP_SCHEMA_VERSION) {
      return {
        ok: false,
        reason: 'This backup is from a newer app version — update the app first.',
      };
    }

    await localDb.init();
    await restoreBackupToDb(localDb, doc);

    const serverAt = res.data.updated_at ?? new Date().toISOString();
    await AsyncStorage.setItem(LAST_BACKUP_AT_KEY, serverAt);

    return { ok: true, restored: countRows(doc), needsAppReselect: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { ok: false, reason };
  }
}

// ---------------------------------------------------------------------------
// maybeAutoBackup
// ---------------------------------------------------------------------------

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/**
 * Debounced auto-backup, one-shot on data change / app open:
 *   - Skip if last_backup_at is within the last 6 hours.
 *   - Never throw — swallow all errors with console.warn.
 *   - NEVER log key material.
 *
 * Cheap to port from mobile's backupManager (same debounce cadence, same
 * non-throwing contract) so Life OS gets the identical "quietly keep a
 * server copy fresh" behavior without any extra scheduling infrastructure.
 */
export async function maybeAutoBackup(
  reason: 'background' | 'launch' | 'data-change',
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
      console.warn('[LO/backup] maybeAutoBackup(' + reason + ') failed:', result.reason);
    }
    // If needsRecoveryAck — don't navigate from a background trigger; the
    // pendingRecoveryCode will be picked up next time the user opens the
    // data-handling screen.
  } catch (err) {
    // Swallow — auto-backup must never crash the app.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[LO/backup] maybeAutoBackup(' + reason + ') error:', msg);
  }
}
