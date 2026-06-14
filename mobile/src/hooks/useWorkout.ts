/**
 * useWorkout — manages the active workout for the current day.
 *
 * On mount: ensures a workout exists for today.
 * Returns the workout, all sets logged today, loading state, and mutation helpers.
 *
 * Tier branching (TICKET-094 / SPEC-094A Agent P):
 *   isLocalFirst(user) → reads/writes localDb (on-device SQLite); never calls
 *                         personal REST endpoints.
 *   Pro (syncsToServer) → unchanged existing behaviour via REST API.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { localDb, genId } from '../db/localDb';
import { createWorkout } from '../api/workouts';
import {
  getSetsForWorkout,
  logSet as apiLogSet,
  deleteSet as apiDeleteSet,
} from '../api/sets';
import { Workout, WorkoutSet, LiftSet, CardioSet, LogSetPayload } from '../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Local DB row types (mirrors localSchema.ts)
// ---------------------------------------------------------------------------

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
  logged_at: string;
}

interface WorkoutRow {
  id: string;
  user_id: string;
  day_key: string;
  notes: string | null;
  session_type: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSet(row: SetRow): WorkoutSet {
  if (row.kind === 'lift') {
    return {
      id: row.id,
      workout_id: row.workout_id,
      user_id: row.user_id,
      exercise_id: row.exercise_id,
      kind: 'lift',
      set_index: row.set_index,
      reps: row.reps ?? 0,
      weight_kg: row.weight_kg != null ? row.weight_kg : (row.weight_raw != null ? row.weight_raw / 8 : 0),
      rir: row.rir,
      logged_at: row.logged_at,
    } as LiftSet;
  }
  return {
    id: row.id,
    workout_id: row.workout_id,
    user_id: row.user_id,
    exercise_id: row.exercise_id,
    kind: 'cardio',
    set_index: row.set_index,
    duration_sec: row.duration_sec ?? 0,
    distance_m: row.distance_m,
    avg_pace_sec_per_km: row.avg_pace_sec_per_km,
    logged_at: row.logged_at,
  } as CardioSet;
}

function encodeWeightRaw(weightKg: number): number {
  return Math.round(weightKg * 8);
}

// ---------------------------------------------------------------------------
// Hook return shape (unchanged — preserves exported API)
// ---------------------------------------------------------------------------

export interface UseWorkoutResult {
  workout:   Workout | null;
  sets:      WorkoutSet[];
  isLoading: boolean;
  error:     string | null;
  logSet:    (payload: LogSetPayload) => Promise<WorkoutSet>;
  deleteSet: (id: string) => Promise<void>;
  refetch:   () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkout(): UseWorkoutResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);
  const userId = user?.id ?? '';

  const [workout,   setWorkout]   = useState<Workout | null>(null);
  const [sets,      setSets]      = useState<WorkoutSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // ── Load function ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const todayKey = getTodayKey();

      if (localFirst) {
        // ── Free path: localDb ──────────────────────────────────────────────
        await localDb.init();

        // Upsert today's workout row in local SQLite.
        let workoutRow = await localDb.getFirst<WorkoutRow>(
          'SELECT * FROM workouts WHERE day_key = ? ORDER BY created_at ASC LIMIT 1',
          [todayKey]
        );
        if (!workoutRow) {
          const newId  = genId();
          const now    = new Date().toISOString();
          await localDb.execute(
            `INSERT INTO workouts (id, user_id, day_key, notes, session_type,
               created_at, updated_at, synced)
             VALUES (?, ?, ?, NULL, NULL, ?, ?, 0)`,
            [newId, userId, todayKey, now, now],
            { tables: ['workouts'] }
          );
          workoutRow = await localDb.getFirst<WorkoutRow>(
            'SELECT * FROM workouts WHERE id = ?',
            [newId]
          );
        }

        if (!workoutRow) throw new Error('Could not initialise local workout');

        const w: Workout = {
          id:           workoutRow.id,
          user_id:      workoutRow.user_id,
          day_key:      workoutRow.day_key,
          notes:        workoutRow.notes,
          session_type: (workoutRow.session_type ?? null) as Workout['session_type'],
          created_at:   workoutRow.created_at,
          updated_at:   workoutRow.updated_at,
        };
        setWorkout(w);

        const setRows = await localDb.getAll<SetRow>(
          'SELECT * FROM sets WHERE workout_id = ? ORDER BY set_index ASC',
          [w.id]
        );
        setSets(setRows.map(rowToSet));
      } else {
        // ── Pro path: REST (unchanged) ──────────────────────────────────────
        const w = await createWorkout(todayKey);
        setWorkout(w);
        const s = await getSetsForWorkout(w.id);
        setSets(s);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workout');
    } finally {
      setIsLoading(false);
    }
  }, [localFirst, userId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── logSet ─────────────────────────────────────────────────────────────────

  const logSet = useCallback(
    async (payload: LogSetPayload): Promise<WorkoutSet> => {
      if (localFirst) {
        if (!workout) throw new Error('Workout not ready');
        const localId  = genId();
        const loggedAt = new Date().toISOString();
        const COLS =
          `(id, server_id, workout_id, user_id, exercise_id, kind, set_index, ` +
          `reps, weight_raw, weight_kg, rir, duration_sec, distance_m, avg_pace_sec_per_km, ` +
          `logged_at, synced)`;

        let newSet: WorkoutSet;
        if (payload.kind === 'lift') {
          await localDb.execute(
            // weight_kg = exact entered kg (source of truth); weight_raw derived.
            `INSERT INTO sets ${COLS}
             VALUES (?, NULL, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 0)`,
            [localId, workout.id, userId, payload.exerciseId, payload.setIndex,
             payload.reps, encodeWeightRaw(payload.weightKg), payload.weightKg,
             payload.rir ?? null, loggedAt],
            { tables: ['sets'] }
          );
          newSet = {
            id: localId, workout_id: workout.id, user_id: userId,
            exercise_id: payload.exerciseId, kind: 'lift',
            set_index: payload.setIndex, reps: payload.reps,
            weight_kg: payload.weightKg, rir: payload.rir ?? null,
            logged_at: loggedAt,
          } as LiftSet;
        } else {
          await localDb.execute(
            `INSERT INTO sets ${COLS}
             VALUES (?, NULL, ?, ?, ?, 'cardio', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 0)`,
            [localId, workout.id, userId, payload.exerciseId, payload.setIndex,
             payload.durationSec, payload.distanceM ?? null,
             payload.avgPaceSecPerKm ?? null, loggedAt],
            { tables: ['sets'] }
          );
          newSet = {
            id: localId, workout_id: workout.id, user_id: userId,
            exercise_id: payload.exerciseId, kind: 'cardio',
            set_index: payload.setIndex, duration_sec: payload.durationSec,
            distance_m: payload.distanceM ?? null,
            avg_pace_sec_per_km: payload.avgPaceSecPerKm ?? null,
            logged_at: loggedAt,
          } as CardioSet;
        }
        setSets((prev) => [...prev, newSet]);
        return newSet;
      } else {
        // Pro: REST API (unchanged)
        const newSet = await apiLogSet(payload);
        setSets((prev) => [...prev, newSet]);
        return newSet;
      }
    },
    [localFirst, workout, userId]
  );

  // ── deleteSet ───────────────────────────────────────────────────────────────

  const deleteSet = useCallback(
    async (id: string): Promise<void> => {
      if (localFirst) {
        await localDb.execute(
          'DELETE FROM sets WHERE id = ?',
          [id],
          { tables: ['sets'] }
        );
        setSets((prev) => prev.filter((s) => s.id !== id));
      } else {
        await apiDeleteSet(id);
        setSets((prev) => prev.filter((s) => s.id !== id));
      }
    },
    [localFirst]
  );

  return {
    workout,
    sets,
    isLoading,
    error,
    logSet,
    deleteSet,
    refetch: load,
  };
}
