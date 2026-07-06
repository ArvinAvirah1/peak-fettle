/**
 * profile — tier-branched profile writer (TICKET-094, workstream D).
 *
 * Single entry point the settings/onboarding/survey screens call instead of
 * hitting `patchProfile()` (the personal REST endpoint) directly. It routes the
 * write per the locked tier policy (mobile/src/data/backup/tierPolicy.ts):
 *
 *   • Pro  (syncsToServer)  → PATCH /user/profile via the existing patchProfile()
 *                             (server is the source of truth + live multi-device
 *                             sync, exactly as before).
 *   • Free (isLocalFirst)   → upsert the on-device single-row `user_profile`
 *                             table (id='active'); NO personal REST call. Free
 *                             accounts are local-first and have no server row to
 *                             write — a PATCH would 401/404 or silently no-op.
 *
 * In BOTH branches we additionally call AuthContext.updateUser() (passed in by
 * the caller — the writer is a plain module, not a hook) so the in-memory `user`
 * object reflects the change immediately without a re-fetch. updateUser() also
 * persists the profile to SecureStore, so the change survives a cold start.
 *
 * Errors propagate to the caller so the screen can revert its optimistic toggle
 * and show a real failure (D-3) — this writer never swallows a write error.
 */

import { localDb } from '../db/localDb';
import { isLocalFirst } from './backup/tierPolicy';
import { patchProfile, PatchProfilePayload } from '../api/user';
import { User } from '../types/api';

const ROW_ID = 'active';

/**
 * Profile payload this writer accepts. It is PatchProfilePayload plus the few
 * fields that have an on-device column but are not (yet) part of the server
 * PATCH contract — currently just `display_name`.
 *
 * `display_name` is editable on the Profile screen (P3a). FREE users persist it
 * to the on-device `user_profile.display_name` column (added by migration v6);
 * for PRO users it is forwarded to patchProfile() best-effort — server
 * `users.display_name` write support is a later Phase-6 task. Keeping the extra
 * field here (rather than widening PatchProfilePayload) avoids touching the API
 * module while still letting saveProfile route a username edit by tier.
 */
export type ProfilePayload = PatchProfilePayload & {
  display_name?: string | null;
  /**
   * Expanded Training-Engine survey fields (2026-06-19). These have on-device
   * `user_profile` columns (schema v8) and feed the on-device plan engine; the
   * array fields are JSON-encoded for SQLite. As of Task 3 (2026-06-19) they are
   * ALSO part of the server PATCH /user/profile contract: for PRO users they sync
   * to the matching `users` columns (20260619_expanded_survey_fields.sql); the
   * handler degrades gracefully if that migration has not run yet. FREE users
   * persist them on-device only (local-first).
   */
  /** Chosen discipline the plan is built around (general_strength, powerlifting, …). */
  primary_focus?: string | null;
  /** Injury/limitation region tokens (lower_back, knees, …). */
  injuries?: string[] | null;
  /** Prioritised muscle-group labels (chest, back, legs, …). */
  muscle_priorities?: string[] | null;
  /** Current body weight in canonical kg. */
  bodyweight_kg?: number | null;
  /** Weekdays the user trains (0=Sun … 6=Sat). */
  training_days?: number[] | null;
  /** Date of birth, ISO yyyy-mm-dd (recovery defaults). */
  birth_date?: string | null;
};

/**
 * Columns that physically exist on the local `user_profile` table
 * (see CREATE_USER_PROFILE in mobile/src/db/localSchema.ts). Any payload field
 * NOT in this map is still propagated in-session via updateUser(), but has no
 * on-device column to persist to (e.g. notification opt-outs, primary_discipline,
 * fcm_token, use_1rm_confirmation) and is intentionally skipped for the SQLite
 * write. `equipment_profile` is stored as a JSON string.
 */
type LocalColumn =
  | 'display_name'
  | 'unit_pref'
  | 'theme_preference'
  | 'experience_level'
  | 'weight_class_kg'
  | 'sex'
  | 'show_wilks'
  | 'training_goal'
  | 'sessions_per_week'
  | 'session_minutes'
  | 'goal_weight_kg'
  | 'equipment_profile'
  | 'season_phase'
  // v8 expanded-survey columns:
  | 'primary_focus'
  | 'injuries'
  | 'muscle_priorities'
  | 'bodyweight_kg'
  | 'training_days'
  | 'birth_date';

/**
 * Build the (columns, values) for the local upsert from a profile payload.
 * Returns null when the payload touches no locally-stored column (e.g. a pure
 * notification-preference toggle) — the caller then skips the SQLite write but
 * still updates the in-session user.
 */
function localColumnsFor(
  payload: ProfilePayload
): { columns: LocalColumn[]; values: unknown[] } | null {
  const columns: LocalColumn[] = [];
  const values: unknown[] = [];

  const put = (col: LocalColumn, value: unknown): void => {
    columns.push(col);
    values.push(value);
  };

  if (payload.display_name !== undefined) put('display_name', payload.display_name);
  if (payload.unit_pref !== undefined) put('unit_pref', payload.unit_pref);
  if (payload.theme_preference !== undefined) put('theme_preference', payload.theme_preference);
  if (payload.experience_level !== undefined) put('experience_level', payload.experience_level);
  if (payload.weight_class_kg !== undefined) put('weight_class_kg', payload.weight_class_kg);
  if (payload.sex !== undefined) put('sex', payload.sex);
  if (payload.show_wilks !== undefined) put('show_wilks', payload.show_wilks ? 1 : 0);
  if (payload.training_goal !== undefined) put('training_goal', payload.training_goal);
  if (payload.sessions_per_week !== undefined) put('sessions_per_week', payload.sessions_per_week);
  if (payload.session_minutes !== undefined) put('session_minutes', payload.session_minutes);
  if (payload.goal_weight_kg !== undefined) put('goal_weight_kg', payload.goal_weight_kg);
  if (payload.equipment_profile !== undefined) {
    put('equipment_profile', JSON.stringify(payload.equipment_profile));
  }
  if (payload.season_phase !== undefined) put('season_phase', payload.season_phase);

  // ── v8 expanded-survey columns ──────────────────────────────────────────
  if (payload.primary_focus !== undefined) put('primary_focus', payload.primary_focus);
  if (payload.injuries !== undefined) {
    // null clears the column; an array is JSON-encoded.
    put('injuries', payload.injuries == null ? null : JSON.stringify(payload.injuries));
  }
  if (payload.muscle_priorities !== undefined) {
    put('muscle_priorities', payload.muscle_priorities == null ? null : JSON.stringify(payload.muscle_priorities));
  }
  if (payload.bodyweight_kg !== undefined) put('bodyweight_kg', payload.bodyweight_kg);
  if (payload.training_days !== undefined) {
    put('training_days', payload.training_days == null ? null : JSON.stringify(payload.training_days));
  }
  if (payload.birth_date !== undefined) put('birth_date', payload.birth_date);

  if (columns.length === 0) return null;
  return { columns, values };
}

/**
 * Upsert the payload's locally-stored columns into the single-row `user_profile`
 * table (id='active'). Uses INSERT … ON CONFLICT so it works whether or not the
 * row already exists (the row is not auto-seeded by the migrations).
 */
async function writeLocalProfile(payload: ProfilePayload): Promise<void> {
  const mapped = localColumnsFor(payload);
  if (!mapped) return; // nothing local to persist (e.g. notification toggle)

  const { columns, values } = mapped;
  const updatedAt = new Date().toISOString();

  // INSERT column list: id + mapped columns + updated_at.
  const insertCols = ['id', ...columns, 'updated_at'];
  const placeholders = insertCols.map(() => '?').join(', ');
  const insertValues = [ROW_ID, ...values, updatedAt];

  // ON CONFLICT update set: mapped columns + updated_at (never id).
  const updateAssignments = [...columns, 'updated_at']
    .map((col) => `${col} = excluded.${col}`)
    .join(', ');

  await localDb.execute(
    `INSERT INTO user_profile (${insertCols.join(', ')})
     VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updateAssignments}`,
    insertValues,
    { tables: ['user_profile'] }
  );
}

/**
 * The patch the in-session AuthContext user accepts. PatchProfilePayload uses the
 * same snake_case field names as User, so the overlap maps 1:1. `show_wilks` and
 * the rest already match; equipment_profile/training_goal/etc. live only on the
 * extended (any-cast) user shape the survey screens read, so they're forwarded
 * verbatim.
 */
function userPatchFor(payload: ProfilePayload): Partial<User> {
  // PatchProfilePayload is a structural superset of the User fields we touch.
  // Forwarding the whole payload keeps in-memory state in lockstep with what was
  // requested (the survey/onboarding screens read training_* off `user as any`).
  return payload as unknown as Partial<User>;
}

/**
 * Persist a partial profile update for the current user, routed by tier.
 *
 * @param user        the authenticated user (for the tier branch). null is
 *                    treated as local-first.
 * @param payload     the fields to update (same shape as patchProfile()).
 * @param updateUser  AuthContext.updateUser — propagates the change in-session
 *                    and to SecureStore. Optional so callers in non-auth
 *                    contexts (tests) can omit it.
 *
 * Throws on write failure so the caller can revert any optimistic UI (D-3).
 */
export async function saveProfile(
  user: User | null | undefined,
  payload: ProfilePayload,
  updateUser?: (patch: Partial<User>) => void
): Promise<void> {
  if (isLocalFirst(user)) {
    // Free / local-first: write on-device only — NO personal REST call.
    await writeLocalProfile(payload);
  } else {
    // Pro: server is the source of truth (live multi-device sync).
    // NOTE: `payload` may carry `display_name` (P3a), which is not yet part of
    // the server PATCH /user/profile contract. It is forwarded best-effort — the
    // server ignores unknown fields today.
    // TODO(Phase-6): add server-side `users.display_name` write support so a Pro
    // username edit persists + syncs across devices; until then it survives only
    // in-session via updateUser() below.
    await patchProfile(payload as PatchProfilePayload);
  }

  // Both branches: reflect the change in the in-memory user immediately.
  // Done AFTER a successful write so a failed write never leaves the in-session
  // user showing a value that wasn't persisted.
  updateUser?.(userPatchFor(payload));
}

// ---------------------------------------------------------------------------
// Local profile reader — for survey/onboarding pre-fill on a cold start.
// ---------------------------------------------------------------------------

/**
 * The locally-persisted survey/profile fields, parsed back into the shapes the
 * survey screen renders (arrays decoded from JSON). Every field may be null.
 */
export interface LocalProfileSnapshot {
  display_name: string | null;
  experience_level: string | null;
  sex: string | null;
  weight_class_kg: number | null;
  unit_pref: string | null;
  theme_preference: string | null;
  show_wilks: boolean | null;
  training_goal: string | null;
  sessions_per_week: number | null;
  session_minutes: number | null;
  goal_weight_kg: number | null;
  equipment_profile: string[] | null;
  season_phase: string | null;
  primary_focus: string | null;
  injuries: string[] | null;
  muscle_priorities: string[] | null;
  bodyweight_kg: number | null;
  training_days: number[] | null;
  birth_date: string | null;
}

function parseArr<T>(raw: unknown): T[] | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : null;
  } catch {
    return null;
  }
}

/**
 * Read the on-device `user_profile` row (id='active'). Used by the training
 * survey to PRE-FILL the form on a cold start for free/local-first users, whose
 * survey answers live only in SQLite (the in-session `user` from SecureStore
 * carries the cached server profile, not the local survey fields). Returns null
 * when there is no saved row / the table is absent. Newer (v8) columns are
 * selected defensively with a fallback to the legacy set so a pre-migration
 * install still hydrates the core fields. Best-effort: never throws.
 */
export async function loadLocalProfile(): Promise<LocalProfileSnapshot | null> {
  const legacy =
    'display_name, experience_level, sex, weight_class_kg, unit_pref, theme_preference, ' +
    'show_wilks, training_goal, sessions_per_week, session_minutes, goal_weight_kg, ' +
    'equipment_profile, season_phase, birth_date';
  const extended =
    legacy + ', primary_focus, injuries, muscle_priorities, bodyweight_kg, training_days';

  let row: Record<string, unknown> | null = null;
  try {
    row = await localDb.getFirst<Record<string, unknown>>(
      `SELECT ${extended} FROM user_profile WHERE id = ?`,
      [ROW_ID],
    );
  } catch {
    try {
      row = await localDb.getFirst<Record<string, unknown>>(
        `SELECT ${legacy} FROM user_profile WHERE id = ?`,
        [ROW_ID],
      );
    } catch {
      return null;
    }
  }
  if (!row) return null;

  const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

  return {
    display_name: str(row.display_name),
    experience_level: str(row.experience_level),
    sex: str(row.sex),
    weight_class_kg: num(row.weight_class_kg),
    unit_pref: str(row.unit_pref),
    theme_preference: str(row.theme_preference),
    show_wilks: row.show_wilks == null ? null : !!row.show_wilks,
    training_goal: str(row.training_goal),
    sessions_per_week: num(row.sessions_per_week),
    session_minutes: num(row.session_minutes),
    goal_weight_kg: num(row.goal_weight_kg),
    equipment_profile: parseArr<string>(row.equipment_profile),
    season_phase: str(row.season_phase),
    primary_focus: str(row.primary_focus),
    injuries: parseArr<string>(row.injuries),
    muscle_priorities: parseArr<string>(row.muscle_priorities),
    bodyweight_kg: num(row.bodyweight_kg),
    training_days: parseArr<number>(row.training_days),
    birth_date: str(row.birth_date),
  };
}
