/**
 * Lift-progress data layer — TICKET-086.
 *
 * Fetches raw sets for an exercise and aggregates them into per-session
 * ProgressPoints with four metrics: e1RM, top-set weight, volume, best reps.
 *
 * All weights stay in kg; the chart/caller is responsible for unit formatting.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProgressPoint {
  /** YYYY-MM-DD — derived from the earliest set.created_at in the session. */
  date: string;
  /** Best Epley e1RM in the session = max(weight_kg * (1 + reps / 30)). */
  e1rm: number;
  /** Heaviest weight_kg in any single set this session. */
  topWeight: number;
  /** Sum of weight_kg * reps over all sets this session. */
  volume: number;
  /** Max reps in any single set this session. */
  bestReps: number;
}

export interface ProgressSeries {
  exerciseId: string;
  /** Chronological (oldest → newest). */
  points: ProgressPoint[];
}

// ---------------------------------------------------------------------------
// Internal types matching the /sets response shape
// ---------------------------------------------------------------------------

interface RawSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  kind: string; // 'lift' | 'cardio'
  weight_kg: number;
  reps: number;
  // TICKET-090: the `sets` table column is `logged_at`, not `created_at`.
  // The server returns `logged_at`; `created_at` was always undefined here.
  logged_at?: string; // ISO timestamp
  created_at?: string; // legacy/fallback — not a real column
}

interface SetsResponse {
  sets: RawSet[];
}

// ---------------------------------------------------------------------------
// Main fetch + aggregation
// ---------------------------------------------------------------------------

/**
 * Fetch up to 100 lift sets for the given exercise and aggregate them into
 * per-session ProgressPoints sorted oldest→newest.
 *
 * Returns `{ exerciseId, points: [] }` on any network or parse error — the
 * chart shows an empty state rather than crashing.
 */
export async function getExerciseProgress(
  exerciseId: string,
): Promise<ProgressSeries> {
  try {
    const response = await apiClient.get<SetsResponse>('/sets', {
      params: { exercise_id: exerciseId, limit: 100 },
    });

    const raw: RawSet[] = response.data?.sets ?? [];

    // Keep only lift sets (cardio sets have no meaningful weight×reps data)
    const liftSets = raw.filter((s) => s.kind === 'lift');

    // Group by workout_id
    const sessionMap = new Map<
      string,
      {
        sets: RawSet[];
        earliestAt: string;
      }
    >();

    for (const s of liftSets) {
      const ts = s.logged_at ?? s.created_at ?? '';
      const entry = sessionMap.get(s.workout_id);
      if (entry) {
        entry.sets.push(s);
        if (ts < entry.earliestAt) {
          entry.earliestAt = ts;
        }
      } else {
        sessionMap.set(s.workout_id, {
          sets: [s],
          earliestAt: ts,
        });
      }
    }

    // Build one ProgressPoint per session
    const points: ProgressPoint[] = Array.from(sessionMap.values()).map(
      ({ sets, earliestAt }) => {
        let e1rmRaw = 0;
        let topWeightRaw = 0;
        let volumeRaw = 0;
        let bestRepsRaw = 0;

        for (const s of sets) {
          const w = s.weight_kg ?? 0;
          const r = s.reps ?? 0;
          // Epley formula: e1RM = weight * (1 + reps / 30)
          const e1rmSet = w * (1 + r / 30);
          if (e1rmSet > e1rmRaw) e1rmRaw = e1rmSet;
          if (w > topWeightRaw) topWeightRaw = w;
          volumeRaw += w * r;
          if (r > bestRepsRaw) bestRepsRaw = r;
        }

        // Derive YYYY-MM-DD from the earliest set timestamp in this session
        const date = earliestAt.slice(0, 10);

        return {
          date,
          e1rm: Math.round(e1rmRaw * 10) / 10,
          topWeight: Math.round(topWeightRaw * 10) / 10,
          volume: Math.round(volumeRaw),
          bestReps: bestRepsRaw,
        };
      },
    );

    // Sort oldest → newest
    points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return { exerciseId, points };
  } catch (err) {
    console.warn(
      '[PF] progress/getExerciseProgress:',
      err instanceof Error ? err.message : String(err),
    );
    return { exerciseId, points: [] };
  }
}
