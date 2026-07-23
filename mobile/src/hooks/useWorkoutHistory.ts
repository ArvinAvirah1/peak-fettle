/**
 * useWorkoutHistory — fetches the last 30 days of workouts + their sets,
 * computes PR flags (client-side, approximate), and derives the week streak.
 *
 * Tier branching (SPEC-094A Agent P):
 *   isLocalFirst(user) → reads from localDb (on-device SQLite); no REST calls.
 *   Pro (syncsToServer) → unchanged existing REST behaviour.
 *
 * Returns:
 *   history  — array of { workout, sets (with is_pr), liftNames }
 *   streak   — consecutive-week count (see useStreak)
 *   isLoading
 *   error
 *   refetch
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useTableChange } from './useTableChange';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { localDb } from '../db/localDb';
import { getWorkouts } from '../api/workouts';
import { getSetsForWorkout } from '../api/sets';
import { getExercises } from '../api/exercises';
import {
  getExerciseNameMap,
  ensureExerciseCatalogCached,
  displayExerciseName,
} from '../data/exerciseNames';
import { Workout, WorkoutSet, LiftSet, CardioSet, Exercise } from '../types/api';
import { computeStreak } from './useStreak';
import { isDropRow } from '../components/loggerLogic';
import { toDateKey, daysAgo } from '../utils/dateHelpers';

// ---------------------------------------------------------------------------
// Extended types (unchanged public API)
// ---------------------------------------------------------------------------

export interface LiftSetWithPR extends LiftSet {
  is_pr: boolean;
}

export type WorkoutSetWithPR = LiftSetWithPR | Exclude<WorkoutSet, LiftSet>;

export interface WorkoutHistoryEntry {
  workout: Workout;
  sets: WorkoutSetWithPR[];
  /** Display names of exercises logged (lift sets only, unique, ordered). */
  liftNames: string[];
}

export interface UseWorkoutHistoryResult {
  history: WorkoutHistoryEntry[];
  streak: number;
  /** TICKET-091: exercise_id → display name, for callers that list lifts. */
  exerciseNames: Map<string, string>;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// PR computation (unchanged)
// ---------------------------------------------------------------------------

function computePRIds(allLiftSets: LiftSet[]): Set<string> {
  const bestWeight = new Map<string, number>();
  for (const s of allLiftSets) {
    // S1 PR guard: a DROP row (fatigue set) must NOT set or claim a PR. The local
    // row carries metrics_json; the server LiftSet does not (undefined → not a
    // drop). Cheap string check — no JSON.parse in this hot path.
    if (isDropRow((s as LiftSet & { metrics_json?: string | null }).metrics_json)) continue;
    const key = `${s.exercise_id}:${s.reps}`;
    const current = bestWeight.get(key) ?? -Infinity;
    if (s.weight_kg > current) bestWeight.set(key, s.weight_kg);
  }
  const prIds = new Set<string>();
  for (const s of allLiftSets) {
    if (isDropRow((s as LiftSet & { metrics_json?: string | null }).metrics_json)) continue;
    const key = `${s.exercise_id}:${s.reps}`;
    if (s.weight_kg >= (bestWeight.get(key) ?? -Infinity)) prIds.add(s.id);
  }
  return prIds;
}

// ---------------------------------------------------------------------------
// Local DB row types
// ---------------------------------------------------------------------------

interface WorkoutRow {
  id: string;
  user_id: string;
  day_key: string;
  notes: string | null;
  session_type: string | null;
  routine_name: string | null;
  created_at: string;
  updated_at: string;
}

interface SetRow {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  kind: string;
  set_index: number;
  reps: number | null;
  weight_raw: number | null;
  weight_kg: number | null;  // REAL exact kg (v3); preferred over weight_raw
  rir: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  metrics_json: string | null;  // S1 drop/superset tags (device-only, v6+)
  logged_at: string;
}

function rowToSet(row: SetRow): WorkoutSet {
  if (row.kind === 'lift') {
    return {
      id: row.id, workout_id: row.workout_id, user_id: row.user_id,
      exercise_id: row.exercise_id, kind: 'lift',
      set_index: row.set_index, reps: row.reps ?? 0,
      weight_kg: row.weight_kg != null ? row.weight_kg : (row.weight_raw != null ? row.weight_raw / 8 : 0),
      rir: row.rir, logged_at: row.logged_at,
      // S1: carry the device-only metrics_json so the PR guard can exclude drop
      // rows. Extra field beyond the LiftSet contract — harmless to downstream.
      metrics_json: row.metrics_json ?? null,
    } as LiftSet;
  }
  return {
    id: row.id, workout_id: row.workout_id, user_id: row.user_id,
    exercise_id: row.exercise_id, kind: 'cardio',
    set_index: row.set_index, duration_sec: row.duration_sec ?? 0,
    distance_m: row.distance_m, avg_pace_sec_per_km: row.avg_pace_sec_per_km,
    logged_at: row.logged_at,
  } as CardioSet;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkoutHistory(): UseWorkoutHistoryResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const today = new Date();
      const from  = daysAgo(30, today);
      const to    = toDateKey(today);

      if (localFirst) {
        // ── Free path: localDb ──────────────────────────────────────────────
        await localDb.init();

        const localWorkouts = await localDb.getAll<WorkoutRow>(
          `SELECT * FROM workouts WHERE day_key >= ? AND day_key <= ?
           ORDER BY day_key DESC`,
          [from, to]
        );

        const domainWorkouts: Workout[] = localWorkouts.map((w) => ({
          id: w.id, user_id: w.user_id, day_key: w.day_key, notes: w.notes,
          session_type: (w.session_type ?? null) as Workout['session_type'],
          routine_name: w.routine_name ?? null,
          created_at: w.created_at, updated_at: w.updated_at,
        }));

        // Resolve exercise names from the on-device id→name cache (populated at
        // log/pick time + a best-effort global-catalogue backfill). Never shows
        // a raw UUID. Kick the backfill in the background so already-logged sets
        // that predate the cache resolve on a subsequent open — without blocking.
        const exerciseMap = await getExerciseNameMap();
        void ensureExerciseCatalogCached();

        // Fetch ALL sets for the window in ONE query (was N+1: one SELECT per
        // workout). With up to ~60 rows in 30 days this is well under SQLite's
        // host-parameter limit and turns N round-trips into a single one.
        const setsByWorkout = new Map<string, WorkoutSet[]>();
        if (domainWorkouts.length > 0) {
          const ids = domainWorkouts.map((w) => w.id);
          const placeholders = ids.map(() => '?').join(',');
          const allRows = await localDb.getAll<SetRow>(
            `SELECT * FROM sets WHERE workout_id IN (${placeholders}) ORDER BY set_index ASC`,
            ids
          );
          for (const row of allRows) {
            const arr = setsByWorkout.get(row.workout_id) ?? [];
            arr.push(rowToSet(row));
            setsByWorkout.set(row.workout_id, arr);
          }
        }
        const setsArrays: WorkoutSet[][] = domainWorkouts.map(
          (w) => setsByWorkout.get(w.id) ?? []
        );

        const allLiftSets: LiftSet[] = [];
        for (const sets of setsArrays) {
          for (const s of sets) {
            if (s.kind === 'lift') allLiftSets.push(s as LiftSet);
          }
        }
        const prIds = computePRIds(allLiftSets);

        // ── Merge all workout rows for the same day into ONE entry ────────────
        // The cold-start race (now fixed forward) could already have left two
        // rows per day on-device — one real, one empty. Grouping by day_key and
        // unioning their sets collapses the visible duplicate, and dropping days
        // with no sets that aren't rest days removes the "0 sets / No lifts
        // recorded" noise the user saw.
        interface DayGroup { workouts: Workout[]; sets: WorkoutSet[] }
        const byDay = new Map<string, DayGroup>();
        domainWorkouts.forEach((workout, idx) => {
          const g = byDay.get(workout.day_key) ?? { workouts: [], sets: [] };
          g.workouts.push(workout);
          g.sets.push(...(setsArrays[idx] ?? []));
          byDay.set(workout.day_key, g);
        });

        const entries: WorkoutHistoryEntry[] = [];
        for (const g of byDay.values()) {
          const isRestDay = g.workouts.some((w) => w.session_type === 'rest_day');
          if (g.sets.length === 0 && !isRestDay) continue; // drop empty non-rest day

          // Representative row: prefer one carrying a routine label, then a rest
          // day, else the earliest. day_key/session_type/routine_name are all the
          // consumers read.
          const rep =
            g.workouts.find((w) => w.routine_name) ??
            g.workouts.find((w) => w.session_type === 'rest_day') ??
            g.workouts[0]!; // group is only created when a workout is pushed

          const ordered = [...g.sets].sort((a, b) =>
            (a.logged_at ?? '').localeCompare(b.logged_at ?? '')
          );
          const setsWithPR: WorkoutSetWithPR[] = ordered.map((s) =>
            s.kind === 'lift' ? { ...(s as LiftSet), is_pr: prIds.has(s.id) } : s
          );

          const seen = new Set<string>();
          const liftNames: string[] = [];
          for (const s of ordered) {
            if (s.kind !== 'lift') continue;
            const ls = s as LiftSet;
            if (!ls.exercise_id || seen.has(ls.exercise_id)) continue;
            seen.add(ls.exercise_id);
            liftNames.push(displayExerciseName(ls.exercise_id, exerciseMap));
          }
          entries.push({ workout: rep, sets: setsWithPR, liftNames });
        }
        entries.sort((a, b) => b.workout.day_key.localeCompare(a.workout.day_key));

        setExerciseNames(exerciseMap);
        setHistory(entries);
        // Streak counts only real activity days (sets or rest day) — an empty
        // "started but logged nothing" row must not extend the streak.
        setStreak(computeStreak(entries.map((e) => e.workout)));
        return;
      }

      // ── Pro path: REST (unchanged) ────────────────────────────────────────
      const [workouts, exerciseLibrary] = await Promise.all([
        getWorkouts(from, to),
        getExercises(),
      ]);

      const exerciseMap = new Map<string, string>();
      for (const category of Object.values(exerciseLibrary.exercises)) {
        for (const ex of category as Exercise[]) {
          exerciseMap.set(ex.id, ex.name);
        }
      }
      setExerciseNames(exerciseMap);

      const setsArrays = await Promise.all(
        workouts.map((w) => getSetsForWorkout(w.id))
      );

      const allLiftSets: LiftSet[] = [];
      for (const sets of setsArrays) {
        for (const s of sets) {
          if (s.kind === 'lift') allLiftSets.push(s as LiftSet);
        }
      }

      const prIds = computePRIds(allLiftSets);

      const entries: WorkoutHistoryEntry[] = workouts.map((workout, idx) => {
        const rawSets = setsArrays[idx] ?? [];
        const setsWithPR: WorkoutSetWithPR[] = rawSets.map((s) => {
          if (s.kind === 'lift') {
            return { ...(s as LiftSet), is_pr: prIds.has(s.id) };
          }
          return s;
        });
        const seen = new Set<string>();
        const liftNames: string[] = [];
        for (const s of rawSets) {
          if (s.kind === 'lift') {
            const liftSet = s as LiftSet;
            if (!liftSet.exercise_id) continue;
            const name = exerciseMap.get(liftSet.exercise_id) ?? liftSet.exercise_id;
            if (!seen.has(name)) {
              seen.add(name);
              liftNames.push(name);
            }
          }
        }
        return { workout, sets: setsWithPR, liftNames };
      });

      entries.sort((a, b) => b.workout.day_key.localeCompare(a.workout.day_key));

      setHistory(entries);
      setStreak(computeStreak(workouts));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load workout history';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [localFirst]);

  useEffect(() => {
    load();
  }, [load]);

  // Home-staleness fix (2026-07-22): history/streak/Recent Activity read a
  // mount-time snapshot while the logger host writes sets through its own hook
  // instance — a finished workout never appeared until an app restart. React to
  // local sets/workouts writes. Local-first only (a Pro reload is a REST fan-out
  // per workout; Pro refreshes on screen focus / workout finish instead).
  useTableChange(['sets', 'workouts'], () => void load(), {
    enabled: localFirst,
    debounceMs: 900,
  });

  return { history, streak, exerciseNames, isLoading, error, refetch: load };
}
