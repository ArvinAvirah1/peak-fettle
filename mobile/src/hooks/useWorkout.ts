/**
 * useWorkout — manages the active workout for the current day.
 *
 * On mount: ensures a workout exists for today via createWorkout() (idempotent).
 * Returns the workout, all sets logged today, loading state, and mutation helpers.
 *
 * TODO(TICKET-027): swap for PowerSync hook after sync layer lands
 */

import { useState, useEffect, useCallback } from 'react';
import { createWorkout } from '../api/workouts';
import {
  getSetsForWorkout,
  logSet as apiLogSet,
  deleteSet as apiDeleteSet,
} from '../api/sets';
import { Workout, WorkoutSet, LogSetPayload } from '../types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseWorkoutResult {
  workout: Workout | null;
  sets: WorkoutSet[];
  isLoading: boolean;
  error: string | null;
  logSet: (payload: LogSetPayload) => Promise<WorkoutSet>;
  deleteSet: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useWorkout(): UseWorkoutResult {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const todayKey = getTodayKey();
      // createWorkout is idempotent — safe to call on every mount/refetch
      const w = await createWorkout(todayKey);
      setWorkout(w);

      // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
      const s = await getSetsForWorkout(w.id);
      setSets(s);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load workout';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
  const logSet = useCallback(
    async (payload: LogSetPayload): Promise<WorkoutSet> => {
      const newSet = await apiLogSet(payload);
      setSets((prev) => [...prev, newSet]);
      return newSet;
    },
    []
  );

  // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
  const deleteSet = useCallback(async (id: string): Promise<void> => {
    await apiDeleteSet(id);
    setSets((prev) => prev.filter((s) => s.id !== id));
  }, []);

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
