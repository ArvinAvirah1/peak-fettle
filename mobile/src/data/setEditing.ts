/**
 * setEditing — tier-branched edit/delete for an ALREADY-LOGGED set.
 *
 * The day-detail screen (workout-day.tsx) lets the user fix a mistyped weight or
 * reps, or remove a set, for any past session. There was no update path before:
 *   • Free / local-first → UPDATE the on-device `sets` row in place. weight_kg is
 *     the exact-kg source of truth (schema v3); weight_raw (kg×8) is kept derived
 *     for the legacy percentile path. Both are written so reads via
 *     COALESCE(weight_kg, weight_raw/8.0) stay correct.
 *   • Pro (server) → the REST API has no PATCH /sets/:id, so we REPLACE the row:
 *     delete the old set, then re-log the correction at the SAME set_index. This
 *     reuses the proven endpoints (same approach the in-session stepper uses) and
 *     adds no new server contract.
 *
 * Callers convert the user's DISPLAY value to exact kg via displayToKg() BEFORE
 * calling — this module stores kg verbatim (see constants/units.ts).
 */

import { localDb } from '../db/localDb';
import { isLocalFirst, TierUser } from './backup/tierPolicy';
import { deleteSet as apiDeleteSet, logSet as apiLogSet } from '../api/sets';

export interface LiftSetEdit {
  /** Set row id. */
  id: string;
  /** Owning workout id (needed for the Pro re-log path). */
  workoutId: string;
  /** Exercise id (needed for the Pro re-log path; '' is tolerated server-side). */
  exerciseId: string;
  /** Position within the exercise group, preserved on the Pro re-log. */
  setIndex: number;
  /** Corrected weight in EXACT kilograms (already unit-converted by the caller). */
  weightKg: number;
  /** Fixed-point exact entry: typed value × 100 in the typed unit (v18). */
  weightCenti?: number | null;
  /** Unit the corrected weight was typed in ('kg' | 'lbs'). */
  weightUnit?: 'kg' | 'lbs' | null;
  /** Corrected rep count. */
  reps: number;
  /** Corrected RIR, or null/undefined to leave unset. */
  rir?: number | null;
}

/** kg → weight_raw (kg×8) SMALLINT, matching the log path's encoding. */
function encodeWeightRaw(weightKg: number): number {
  return Math.round(weightKg * 8);
}

/** Apply an edit to a previously-logged lift set. */
export async function updateLiftSet(
  user: TierUser | null | undefined,
  edit: LiftSetEdit,
): Promise<void> {
  if (isLocalFirst(user)) {
    await localDb.init();
    await localDb.execute(
      `UPDATE sets SET weight_kg = ?, weight_raw = ?, weight_centi = ?, weight_unit = ?, reps = ?, rir = ? WHERE id = ?`,
      [edit.weightKg, encodeWeightRaw(edit.weightKg),
       edit.weightCenti ?? null, edit.weightUnit ?? null,
       edit.reps, edit.rir ?? null, edit.id],
      { tables: ['sets'] },
    );
    return;
  }
  // Pro: no PATCH route — replace the row. DATA-02: re-log FIRST, delete SECOND,
  // so a failure can never lose the original set (sets(workout_id,set_index) is a
  // non-unique index, so a brief duplicate at the same set_index is tolerated and
  // removed by the delete below).
  await apiLogSet({
    kind: 'lift',
    workoutId: edit.workoutId,
    exerciseId: edit.exerciseId,
    setIndex: edit.setIndex,
    reps: edit.reps,
    weightKg: edit.weightKg,
    ...(edit.weightCenti != null && edit.weightUnit != null
      ? { weightCenti: edit.weightCenti, weightUnit: edit.weightUnit }
      : {}),
    ...(edit.rir != null ? { rir: edit.rir } : {}),
  });
  await apiDeleteSet(edit.id);
}

/** Delete a previously-logged set (lift or cardio). */
export async function deleteSetById(
  user: TierUser | null | undefined,
  id: string,
): Promise<void> {
  if (isLocalFirst(user)) {
    await localDb.init();
    await localDb.execute('DELETE FROM sets WHERE id = ?', [id], { tables: ['sets'] });
    return;
  }
  await apiDeleteSet(id);
}
