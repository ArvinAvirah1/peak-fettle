/**
 * localProgress — on-device equivalents of the server progress analytics, so
 * free/local-first users (TICKET-094) never hang on a personal REST call when
 * opening the Trends chart. Mirrors the aggregation in src/api/progress.ts but
 * reads the local `sets` table instead of GET /sets.
 *
 * weight_kg (exact, schema v3) is preferred; weight_raw/8 is the legacy fallback.
 */

import { localDb } from '../db/localDb';
import type { ProgressSeries, ProgressPoint } from '../api/progress';

interface LocalLiftRow {
  workout_id: string;
  weight_kg: number | null;
  weight_raw: number | null;
  reps: number | null;
  logged_at: string;
}

/**
 * Per-session ProgressPoints for one exercise, oldest→newest, read entirely
 * from on-device SQLite. Same shape/maths as api/progress.getExerciseProgress so
 * LiftProgressChart renders identically on both tiers. Empty on any error.
 */
export async function getLocalExerciseProgress(exerciseId: string): Promise<ProgressSeries> {
  if (!exerciseId) return { exerciseId, points: [] };
  try {
    await localDb.init();
    const rows = await localDb.getAll<LocalLiftRow>(
      `SELECT workout_id, weight_kg, weight_raw, reps, logged_at
         FROM sets
        WHERE exercise_id = ? AND kind = 'lift'
        ORDER BY logged_at ASC`,
      [exerciseId],
    );

    // Group by session (workout_id), tracking the earliest timestamp.
    const sessionMap = new Map<string, { sets: LocalLiftRow[]; earliestAt: string }>();
    for (const s of rows) {
      const ts = s.logged_at ?? '';
      const entry = sessionMap.get(s.workout_id);
      if (entry) {
        entry.sets.push(s);
        if (ts < entry.earliestAt) entry.earliestAt = ts;
      } else {
        sessionMap.set(s.workout_id, { sets: [s], earliestAt: ts });
      }
    }

    const points: ProgressPoint[] = Array.from(sessionMap.values()).map(({ sets, earliestAt }) => {
      let e1rm = 0, topWeight = 0, volume = 0, bestReps = 0;
      for (const s of sets) {
        const w = s.weight_kg != null ? s.weight_kg : (s.weight_raw != null ? s.weight_raw / 8 : 0);
        const r = s.reps ?? 0;
        const e = w * (1 + r / 30); // Epley
        if (e > e1rm) e1rm = e;
        if (w > topWeight) topWeight = w;
        volume += w * r;
        if (r > bestReps) bestReps = r;
      }
      return {
        date: earliestAt.slice(0, 10),
        e1rm: Math.round(e1rm * 10) / 10,
        topWeight: Math.round(topWeight * 10) / 10,
        volume: Math.round(volume),
        bestReps,
      };
    });

    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { exerciseId, points };
  } catch {
    return { exerciseId, points: [] };
  }
}
