/**
 * routineHistory — past sessions grouped by the routine that produced them.
 *
 * Powers the "BY ROUTINE" folders at the bottom of Home (one folder per routine
 * the user has actually trained — Push / Pull / Legs, etc.) and the per-routine
 * sessions screen (routine-history.tsx). Grouping key is `workouts.routine_name`,
 * stamped on-device when a routine/template session starts (stampLocalRoutineName)
 * or via the server routine link for Pro.
 *
 * Tier-branched, local-first (TICKET-094): free users read on-device SQLite with
 * NO REST calls; Pro reads the existing GET /workouts list (which already carries
 * routine_name + totals) and groups client-side.
 */

import { localDb } from '../db/localDb';
import { isLocalFirst, TierUser } from './backup/tierPolicy';
import { apiClient } from '../api/client';

export interface RoutineFolder {
  /** The routine name as stamped on the workout (exact match key). */
  routineName: string;
  /** Number of distinct days this routine was trained. */
  sessionCount: number;
  /** Most recent training day (YYYY-MM-DD), or null. */
  lastDayKey: string | null;
}

export interface RoutineSessionRow {
  dayKey: string;
  setCount: number;
  volumeKg: number;
}

// Pro /workouts row shape (mirrors workout-history.tsx).
interface ApiWorkoutRow {
  day_key: string;
  routine_name?: string | null;
  total_sets?: number;
  total_volume_kg?: number;
}

/** One folder per routine the user has trained, most-recent first. */
export async function getRoutineFolders(
  user: TierUser | null | undefined,
): Promise<RoutineFolder[]> {
  if (isLocalFirst(user)) {
    try {
      await localDb.init();
      const rows = await localDb.getAll<{ name: string; cnt: number; last: string | null }>(
        `SELECT routine_name AS name,
                COUNT(DISTINCT day_key) AS cnt,
                MAX(day_key) AS last
           FROM workouts
          WHERE routine_name IS NOT NULL AND TRIM(routine_name) <> ''
          GROUP BY routine_name
          ORDER BY last DESC`,
      );
      return rows.map((r) => ({
        routineName: r.name,
        sessionCount: r.cnt ?? 0,
        lastDayKey: r.last ?? null,
      }));
    } catch {
      return [];
    }
  }

  // Pro: group the server workout list by routine_name.
  try {
    const res = await apiClient.get<ApiWorkoutRow[]>('/workouts');
    const rows = Array.isArray(res.data) ? res.data : [];
    const byName = new Map<string, { days: Set<string>; last: string }>();
    for (const w of rows) {
      const name = (w.routine_name ?? '').trim();
      if (!name) continue;
      const entry = byName.get(name) ?? { days: new Set<string>(), last: '' };
      entry.days.add(w.day_key);
      if (w.day_key > entry.last) entry.last = w.day_key;
      byName.set(name, entry);
    }
    return Array.from(byName.entries())
      .map(([routineName, v]) => ({
        routineName,
        sessionCount: v.days.size,
        lastDayKey: v.last || null,
      }))
      .sort((a, b) => (b.lastDayKey ?? '').localeCompare(a.lastDayKey ?? ''));
  } catch {
    return [];
  }
}

/** Every session (distinct day) for a given routine, most-recent first. */
export async function getRoutineSessions(
  user: TierUser | null | undefined,
  routineName: string,
): Promise<RoutineSessionRow[]> {
  if (!routineName) return [];

  if (isLocalFirst(user)) {
    try {
      await localDb.init();
      const rows = await localDb.getAll<{ day_key: string; set_count: number; volume_kg: number }>(
        `SELECT w.day_key AS day_key,
                COUNT(s.id) AS set_count,
                COALESCE(SUM(
                  CASE WHEN s.kind = 'lift'
                       THEN COALESCE(s.weight_kg, s.weight_raw / 8.0) * COALESCE(s.reps, 0)
                       ELSE 0 END
                ), 0) AS volume_kg
           FROM workouts w
           LEFT JOIN sets s ON s.workout_id = w.id
          WHERE w.routine_name = ?
          GROUP BY w.day_key
          ORDER BY w.day_key DESC`,
        [routineName],
      );
      return rows.map((r) => ({
        dayKey: r.day_key,
        setCount: r.set_count ?? 0,
        volumeKg: r.volume_kg ?? 0,
      }));
    } catch {
      return [];
    }
  }

  // Pro: filter the server workout list by routine_name.
  try {
    const res = await apiClient.get<ApiWorkoutRow[]>('/workouts');
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows
      .filter((w) => (w.routine_name ?? '').trim() === routineName)
      .map((w) => ({
        dayKey: w.day_key,
        setCount: w.total_sets ?? 0,
        volumeKg: w.total_volume_kg ?? 0,
      }))
      .sort((a, b) => b.dayKey.localeCompare(a.dayKey));
  } catch {
    return [];
  }
}
