/**
 * localReset — full teardown of on-device personal state for sign-out and
 * account-deletion (BUGFIX 2026-06-30, Bug 3).
 *
 * WHY THIS EXISTS
 * ---------------
 * `logout()` / `_clearAuthState()` in AuthContext historically cleared ONLY the
 * refresh token + the cached SecureStore profile. They left behind:
 *   • every local SQLite personal-data table (workouts, sets, routines,
 *     user_profile, streaks, constraints, …) — the previous user's data,
 *   • the `outbox` (pending sync writes) and the `migration_state` ledger
 *     (Free→Pro upload bookkeeping),
 *   • the AsyncStorage first-launch / onboarding / tour / tooltip / consent /
 *     cache flags.
 *
 * That stale state is what made sign-out "glitchy, only fixed by delete +
 * reinstall": after signing back in (especially as a DIFFERENT account) the app
 * showed the prior user's data, skipped the intro/onboarding it should re-run,
 * and generally behaved as if a foreign session were half-present. Reinstalling
 * was the only way to clear it. This module makes the teardown COMPLETE and
 * IDEMPOTENT so a fresh sign-in always starts clean without a reinstall.
 *
 * WHAT IT CLEARS
 * --------------
 *   1. Local SQLite: all personal-data tables (BACKUP_TABLES — the canonical
 *      list of on-device user tables) PLUS the two bookkeeping tables `outbox`
 *      and `migration_state` (session-scoped, must not leak to the next user).
 *      Global/library tables (workout_templates/template_sessions/
 *      template_exercises, exercise_names cache, app_settings) are intentionally
 *      NOT wiped — they hold no personal data and re-fetching them on every
 *      logout would be wasteful. `app_settings`/theme are handled via the
 *      AsyncStorage key list below where user-scoped.
 *   2. AsyncStorage: the first-launch / onboarding / tour / tooltip / consent /
 *      recovery-ack / last-backup / catalog-cache flags, so a fresh sign-in
 *      re-runs the intro/onboarding and does not inherit the prior user's
 *      "already seen" state.
 *
 * WHAT IT DOES NOT TOUCH
 * ----------------------
 *   • The refresh token + cached profile in SecureStore — AuthContext owns those
 *     (cleared in `_clearAuthState`). Kept separate so this module has no auth
 *     dependency and can be unit-tested in isolation.
 *   • The user's chosen THEME (`@peak_fettle/theme`) — a device-level display
 *     preference, not personal data; wiping it would flip the app back to the
 *     default theme on every sign-out, which is a worse experience and not part
 *     of the bug. (Kept deliberately; revisit only if product wants it reset.)
 *
 * SAFETY
 * ------
 * Best-effort and NEVER throws: each table DELETE and each AsyncStorage removal
 * is individually guarded so one failure cannot abort the rest or block the
 * logout/redirect. A partial wipe is still strictly better than none, and the
 * operation is idempotent (safe to re-run).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDb } from '../db/localDb';
import { BACKUP_TABLES } from './backup/exportEngine';

/**
 * Session-scoped bookkeeping tables that are NOT in BACKUP_TABLES (they hold no
 * user data to back up) but MUST be cleared on logout so the next user does not
 * inherit a pending outbox or a foreign Free→Pro migration ledger.
 *   • outbox          — queued set inserts/deletes awaiting server sync.
 *   • migration_state — (entity, local_id) → server_id ledger for migrateToPro.
 *                       Clearing it on logout means a NEW account's first upgrade
 *                       re-evaluates from scratch instead of skipping rows keyed
 *                       to the previous account's local ids.
 *   • migration_snapshots — pre-schema-migration safety snapshots. The payload
 *                       is a FULL JSON backup of the personal tables (built by
 *                       exportEngine.buildBackupFromDb), so leaving it behind
 *                       after sign-out leaks the prior user's entire dataset to
 *                       whoever signs in next on this device. (VERIFY 2026-07-01)
 */
const SESSION_BOOKKEEPING_TABLES: string[] = [
  'outbox',
  'migration_state',
  'migration_snapshots',
];

/** Every local table cleared on a full teardown (personal data + bookkeeping). */
export const LOCAL_RESET_TABLES: string[] = [
  ...BACKUP_TABLES,
  ...SESSION_BOOKKEEPING_TABLES,
];

/**
 * AsyncStorage keys cleared on a full teardown. These are the first-launch /
 * onboarding / tour / tooltip / consent / cache flags that must not survive into
 * the next user's session. Mirrors the `@peak_fettle/*` keys used across the app
 * (splash, WelcomeTour, Tooltip, ScheduleEditorSheet, onboarding, backupManager,
 * exerciseNames) — excluding `@peak_fettle/theme` (a device display preference,
 * see module header).
 */
export const LOCAL_RESET_ASYNC_KEYS: string[] = [
  '@peak_fettle/first_launch_done',   // splash intro gate — re-run intro for a new user
  '@peak_fettle/tour_seen',           // WelcomeTour
  '@peak_fettle/tooltip_seen',        // Tooltip
  '@peak_fettle/schedule_editor_seen',// ScheduleEditorSheet first-open coachmark
  '@peak_fettle/recovery_code_ack',   // backup recovery-code acknowledgement
  '@peak_fettle/healthkit_consent',   // onboarding HealthKit consent
  '@peak_fettle/last_backup_at',      // per-user last blob-backup timestamp
  '@peak_fettle/exercise_catalog_cached_at', // exercise-name cache freshness
  '@peak_fettle/rest_default_sec',    // per-user default rest timer
];

/**
 * Delete the pre-migration snapshot FILES (`pf_premigration_v<N>.json` in the
 * app document directory). On a real device writeMigrationSnapshot prefers
 * expo-file-system over the migration_snapshots table, and each file is a FULL
 * JSON backup of the personal tables — the same prior-user leak as the table,
 * just on disk. Dynamic require (no hard import) mirrors migrations.ts:
 * bundle-safe, and a plain no-op in node/web where the module is absent.
 * Best-effort: never throws. (VERIFY 2026-07-01)
 */
async function deleteMigrationSnapshotFiles(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require('expo-file-system') as {
      documentDirectory: string | null;
      readDirectoryAsync(uri: string): Promise<string[]>;
      deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
    };
    if (!FS.documentDirectory) return;
    const entries = await FS.readDirectoryAsync(FS.documentDirectory);
    const snapshots = entries.filter((name) => /^pf_premigration_v\d+\.json$/.test(name));
    for (const name of snapshots) {
      try {
        await FS.deleteAsync(`${FS.documentDirectory}${name}`, { idempotent: true });
      } catch {
        // Best-effort: one undeletable file must not abort the rest.
      }
    }
  } catch {
    // expo-file-system unavailable (node/web) or directory unreadable — no-op.
  }
}

/**
 * Wipe all on-device personal data + session bookkeeping + onboarding flags.
 *
 * Idempotent and best-effort: never throws. Call from BOTH the sign-out path and
 * the account-deletion path (either tier) BEFORE / alongside clearing the auth
 * token, so a subsequent sign-in starts from a clean device with no reinstall.
 */
export async function clearAllLocalPersonalData(): Promise<void> {
  // 1. SQLite tables. Ensure the DB is open first so DELETE targets a real table;
  //    a missing/never-created table just no-ops under our per-table guard.
  try {
    await localDb.init();
  } catch {
    // If init fails we still attempt the AsyncStorage clear below.
  }

  for (const table of LOCAL_RESET_TABLES) {
    try {
      await localDb.execute(`DELETE FROM ${table}`, [], { tables: [table] });
    } catch {
      // Best-effort: a missing table or a transient SQLite error must not abort
      // the rest of the teardown.
    }
  }

  // 2. AsyncStorage flags. multiRemove is atomic-ish and cheaper than N calls;
  //    fall back to per-key removal if it throws so one bad key can't block all.
  try {
    await AsyncStorage.multiRemove(LOCAL_RESET_ASYNC_KEYS);
  } catch {
    for (const key of LOCAL_RESET_ASYNC_KEYS) {
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        // ignore individual failures
      }
    }
  }

  // 3. Pre-migration snapshot files on disk (device path of the same leak the
  //    migration_snapshots table covers). Best-effort, never throws.
  await deleteMigrationSnapshotFiles();
}
