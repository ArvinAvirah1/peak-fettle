/**
 * appSettings — device-local key/value configuration store.
 *
 * A tiny on-device KV layer over the `app_settings` table (schema v5,
 * mobile/src/db/localSchema.ts). This is per-INSTALL config, NOT user data:
 * it is deliberately excluded from the TICKET-094 backup registry
 * (BACKUP_TABLES) and never syncs to the server. Both free and Pro users read
 * and write it the same way — there is no tier branch and NO REST call (so it
 * is local-first by construction and safe to call on mount).
 *
 * Generic surface:
 *   • getSetting(key)        — the stored string value, or null if unset.
 *   • setSetting(key, value) — idempotent upsert, stamps updated_at (ISO).
 *
 * Typed convenience for the first consumer (rest-timer default):
 *   • getRestTimerDefaultSec() — parsed seconds, defaulting to 120.
 *   • setRestTimerDefaultSec(n) — clamps to a sane positive integer and stores.
 *
 * All reads are best-effort: any SQLite failure resolves to the default/null
 * rather than throwing, so a settings read can never block a screen.
 */

import { localDb } from '../db/localDb';

const REST_TIMER_DEFAULT_SEC_KEY = 'rest_timer_default_sec';
const REST_TIMER_FALLBACK_SEC = 120;

// ---------------------------------------------------------------------------
// Generic KV
// ---------------------------------------------------------------------------

/** Read a single setting by key. Returns null when unset or on any failure. */
export async function getSetting(key: string): Promise<string | null> {
  try {
    await localDb.init();
    const row = await localDb.getFirst<{ value: string | null }>(
      'SELECT value FROM app_settings WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  } catch {
    // best-effort device config — never surface to the UI
    return null;
  }
}

/** Upsert a single setting (idempotent). Stamps updated_at as an ISO string. */
export async function setSetting(key: string, value: string): Promise<void> {
  await localDb.init();
  await localDb.execute(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()],
    { tables: ['app_settings'] },
  );
}

// ---------------------------------------------------------------------------
// Typed convenience — rest-timer default (seconds)
// ---------------------------------------------------------------------------

/**
 * The default rest-timer length in seconds. Falls back to 120 when unset,
 * unparseable, or non-positive.
 */
export async function getRestTimerDefaultSec(): Promise<number> {
  const raw = await getSetting(REST_TIMER_DEFAULT_SEC_KEY);
  if (raw == null) return REST_TIMER_FALLBACK_SEC;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return REST_TIMER_FALLBACK_SEC;
  return n;
}

/**
 * Persist the default rest-timer length. Coerces to a positive integer; a
 * non-finite or non-positive input falls back to 120 so the stored value is
 * always sane.
 */
export async function setRestTimerDefaultSec(n: number): Promise<void> {
  const sec = Number.isFinite(n) && n > 0 ? Math.round(n) : REST_TIMER_FALLBACK_SEC;
  await setSetting(REST_TIMER_DEFAULT_SEC_KEY, String(sec));
}
