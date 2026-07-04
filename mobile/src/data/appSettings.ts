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
 * TICKET-128 — effort display (RIR ⇄ RPE):
 *   • getEffortDisplay() — 'rir' | 'rpe', defaulting to 'rir' (unchanged
 *     behavior for existing users — the display-layer toggle is opt-in).
 *   • setEffortDisplay(mode) — persists the choice; any other string is
 *     ignored (falls back to 'rir') so a corrupt stored value never breaks
 *     a screen.
 *   The STORED set value (`sets.rir`) is unaffected either way — this
 *   setting only controls how RIR is presented (see loggerLogic.ts's
 *   rirToRpe/formatEffort, which do the pure conversion).
 *
 * TICKET-141 — autoregulation suggestions (in-session load suggestions):
 *   • getAutoregSuggestionsEnabled() — boolean, defaulting to FALSE. v1 ships
 *     dark; the founder flips it after a self-test week (per the ticket's
 *     acceptance criterion 5). Purely a display/compute gate — the rule
 *     module (lib/trainingEngine/v2/autoregulation.ts) is never invoked when
 *     this is off, so there is zero extra work done for users who haven't
 *     opted in.
 *   • setAutoregSuggestionsEnabled(enabled) — persists the flag.
 *
 * All reads are best-effort: any SQLite failure resolves to the default/null
 * rather than throwing, so a settings read can never block a screen.
 */

import { localDb } from '../db/localDb';

const REST_TIMER_DEFAULT_SEC_KEY = 'rest_timer_default_sec';
const REST_TIMER_FALLBACK_SEC = 120;

const EFFORT_DISPLAY_KEY = 'effort_display';
const EFFORT_DISPLAY_FALLBACK: EffortDisplay = 'rir';

const AUTOREG_SUGGESTIONS_ENABLED_KEY = 'autoreg_suggestions_enabled';

/** Display mode for logged effort: raw RIR, or RPE (10 − RIR, 5–10 band). */
export type EffortDisplay = 'rir' | 'rpe';

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

// ---------------------------------------------------------------------------
// Typed convenience — effort display mode (TICKET-128, RIR ⇄ RPE)
// ---------------------------------------------------------------------------

/**
 * The user's preferred effort-display mode. Defaults to 'rir' when unset or
 * when the stored value is anything other than 'rir'/'rpe' — this keeps
 * existing users' behavior unchanged (RIR was always the only display).
 */
export async function getEffortDisplay(): Promise<EffortDisplay> {
  const raw = await getSetting(EFFORT_DISPLAY_KEY);
  return raw === 'rpe' ? 'rpe' : EFFORT_DISPLAY_FALLBACK;
}

/**
 * Persist the effort-display mode. Only 'rir'/'rpe' are accepted; anything
 * else is coerced to the 'rir' fallback so a bad caller can never store junk.
 * This is display-only — it never touches how sets.rir is written.
 */
export async function setEffortDisplay(mode: EffortDisplay): Promise<void> {
  const value: EffortDisplay = mode === 'rpe' ? 'rpe' : 'rir';
  await setSetting(EFFORT_DISPLAY_KEY, value);
}

// ---------------------------------------------------------------------------
// Typed convenience — autoregulation suggestions flag (TICKET-141)
// ---------------------------------------------------------------------------

/**
 * Whether in-session autoregulation suggestions (next-load hints computed by
 * lib/trainingEngine/v2/autoregulation.ts) should render in the logger.
 * Defaults to FALSE (off) — v1 ships dark per the ticket's acceptance
 * criteria; only an explicit 'true' stored value turns it on.
 */
export async function getAutoregSuggestionsEnabled(): Promise<boolean> {
  const raw = await getSetting(AUTOREG_SUGGESTIONS_ENABLED_KEY);
  return raw === 'true';
}

/** Persist the autoregulation-suggestions flag. */
export async function setAutoregSuggestionsEnabled(enabled: boolean): Promise<void> {
  await setSetting(AUTOREG_SUGGESTIONS_ENABLED_KEY, enabled ? 'true' : 'false');
}
