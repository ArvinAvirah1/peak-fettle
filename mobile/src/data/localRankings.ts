/**
 * localRankings — on-device replacement for the deprecated GET /percentile.
 *
 * The server percentile pipeline (user_percentile_rankings + weekly batch) was
 * dropped on 2026-06-12 in favour of on-device computation, but the Rankings
 * screen's only data source remained the (permanently empty) server response —
 * so no user ever saw a rank. This module builds the missing local source:
 * best estimated 1RM per competition lift from the on-device `sets` table,
 * shaped as PercentileRanking rows so the screen's existing on-device
 * strengthModelV3 overlay (localPercentiles / TierLadderCard) computes the
 * actual percentiles exactly as designed.
 *
 * Percentile fields are left null here — they are display-time values computed
 * by the screen from these inputs, not stored.
 *
 * Weight invariant: kg is read via COALESCE(weight_kg, weight_raw/8.0) —
 * weight_kg (v3 exact kg) is canonical, weight_raw (kg×8) is the lossy legacy
 * fallback. Epley parity with the old server estimate: kg × (1 + reps/30),
 * uncapped MAX across all logged sets of the lift.
 */

import { localDb } from '../db/localDb';
import { getExerciseNameMap } from './exerciseNames';
import { epley1Rm } from '../lib/oneRm';
import { MODEL_VERSION } from '../lib/strengthModelV3';
import type { PercentileRanking } from '../types/api';

/** Canonical server-style lift ids the Rankings screen already understands. */
type CompetitionLiftId = 'back_squat' | 'bench_press' | 'deadlift' | 'overhead_press';

const COMPETITION_LIFTS: CompetitionLiftId[] = [
  'back_squat',
  'bench_press',
  'deadlift',
  'overhead_press',
];

/**
 * Map an exercise id or display name to a competition lift. Conservative on
 * purpose: variations that are genuinely different lifts (front squat, RDL,
 * incline bench, dumbbell press) must NOT feed the powerlifting model.
 */
export function classifyCompetitionLift(
  exerciseId: string | null | undefined,
  displayName: string | null | undefined,
): CompetitionLiftId | null {
  for (const candidate of [exerciseId, displayName]) {
    if (!candidate) continue;
    const s = candidate.trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (!s) continue;
    // Squat — back squat only (bar position variants included).
    if (
      s === 'squat' ||
      s === 'back squat' ||
      s === 'barbell squat' ||
      s === 'barbell back squat' ||
      s === 'low bar squat' ||
      s === 'high bar squat' ||
      s === 'competition squat'
    ) {
      return 'back_squat';
    }
    // Bench — flat barbell bench only.
    if (
      s === 'bench' ||
      s === 'bench press' ||
      s === 'barbell bench press' ||
      s === 'flat bench press' ||
      s === 'flat barbell bench press' ||
      s === 'competition bench press'
    ) {
      return 'bench_press';
    }
    // Deadlift — conventional + sumo (both are competition pulls).
    if (
      s === 'deadlift' ||
      s === 'conventional deadlift' ||
      s === 'barbell deadlift' ||
      s === 'sumo deadlift' ||
      s === 'competition deadlift'
    ) {
      return 'deadlift';
    }
    // OHP — standing barbell press.
    if (
      s === 'ohp' ||
      s === 'overhead press' ||
      s === 'barbell overhead press' ||
      s === 'military press' ||
      s === 'strict press' ||
      s === 'standing barbell press' ||
      s === 'barbell shoulder press' ||
      s === 'shoulder press'
    ) {
      return 'overhead_press';
    }
  }
  return null;
}

interface SetRow {
  exercise_id: string | null;
  reps: number | null;
  kg: number | null;
  logged_at: string | null;
}

/**
 * Compute PercentileRanking-shaped rows from local sets: one row per
 * competition lift with any logged working sets, carrying the best Epley e1RM
 * as epley_estimate_kg. Empty array when nothing qualifies (screen shows its
 * empty state). Never throws — any failure degrades to [].
 */
export async function getLocalRankings(userId: string | null | undefined): Promise<PercentileRanking[]> {
  try {
    await localDb.init();
    // user_id scoping matches localWorkouts: legacy rows may carry NULL/''.
    const rows = await localDb.getAll<SetRow>(
      `SELECT exercise_id, reps,
              COALESCE(weight_kg, weight_raw / 8.0) AS kg,
              logged_at
         FROM sets
        WHERE reps > 0
          AND COALESCE(weight_kg, weight_raw / 8.0) > 0
          AND (user_id = ? OR user_id IS NULL OR user_id = '')`,
      [userId ?? ''],
    );
    if (rows.length === 0) return [];

    const nameMap = await getExerciseNameMap();
    const best = new Map<CompetitionLiftId, { e1rm: number; loggedAt: string }>();

    for (const row of rows) {
      if (!row.reps || !row.kg || row.kg <= 0) continue;
      const lift = classifyCompetitionLift(row.exercise_id, nameMap.get(row.exercise_id ?? ''));
      if (!lift) continue;
      const e1rm = epley1Rm(row.kg, row.reps);
      if (!Number.isFinite(e1rm) || e1rm <= 0) continue;
      const prev = best.get(lift);
      if (!prev || e1rm > prev.e1rm) {
        best.set(lift, { e1rm, loggedAt: row.logged_at ?? '' });
      }
    }

    return COMPETITION_LIFTS.filter((lift) => best.has(lift)).map((lift) => {
      const b = best.get(lift)!;
      return {
        lift_id: lift,
        // Display-time values — the screen computes these on-device from the
        // inputs below via strengthModelV3 (localPercentiles / TierLadderCard).
        percentile: null,
        percentile_simple: null,
        cohort_size_internal: null,
        is_estimated: true,
        epley_estimate_kg: Math.round(b.e1rm * 10) / 10,
        confirmed_1rm_kg: null,
        computed_at: b.loggedAt,
        model_version: MODEL_VERSION,
      };
    });
  } catch {
    return [];
  }
}
