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
 * Columns that physically exist on the local `user_profile` table
 * (see CREATE_USER_PROFILE in mobile/src/db/localSchema.ts). Any payload field
 * NOT in this map is still propagated in-session via updateUser(), but has no
 * on-device column to persist to (e.g. notification opt-outs, primary_discipline,
 * fcm_token, use_1rm_confirmation) and is intentionally skipped for the SQLite
 * write. `equipment_profile` is stored as a JSON string.
 */
type LocalColumn =
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
  | 'season_phase';

/**
 * Build the (columns, values) for the local upsert from a profile payload.
 * Returns null when the payload touches no locally-stored column (e.g. a pure
 * notification-preference toggle) — the caller then skips the SQLite write but
 * still updates the in-session user.
 */
function localColumnsFor(
  payload: PatchProfilePayload
): { columns: LocalColumn[]; values: unknown[] } | null {
  const columns: LocalColumn[] = [];
  const values: unknown[] = [];

  const put = (col: LocalColumn, value: unknown): void => {
    columns.push(col);
    values.push(value);
  };

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

  if (columns.length === 0) return null;
  return { columns, values };
}

/**
 * Upsert the payload's locally-stored columns into the single-row `user_profile`
 * table (id='active'). Uses INSERT … ON CONFLICT so it works whether or not the
 * row already exists (the row is not auto-seeded by the migrations).
 */
async function writeLocalProfile(payload: PatchProfilePayload): Promise<void> {
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
function userPatchFor(payload: PatchProfilePayload): Partial<User> {
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
  payload: PatchProfilePayload,
  updateUser?: (patch: Partial<User>) => void
): Promise<void> {
  if (isLocalFirst(user)) {
    // Free / local-first: write on-device only — NO personal REST call.
    await writeLocalProfile(payload);
  } else {
    // Pro: server is the source of truth (live multi-device sync).
    await patchProfile(payload);
  }

  // Both branches: reflect the change in the in-memory user immediately.
  // Done AFTER a successful write so a failed write never leaves the in-session
  // user showing a value that wasn't persisted.
  updateUser?.(userPatchFor(payload));
}
