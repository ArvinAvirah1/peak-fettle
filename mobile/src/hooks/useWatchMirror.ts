/**
 * useWatchMirror -- TICKET-140 Stage A: pushes today's-workout mirror payload
 * to the paired Apple Watch over WatchConnectivity.
 *
 * Architecture (audits/TICKET-140-watch-sync-architecture-2026-07-04.md):
 *   - The watch is a PURE MIRROR. The phone is the only source of truth and
 *     the only thing that touches the local DB -- the watch NEVER talks REST
 *     and never computes anything itself.
 *   - No unit/locale logic in Swift: every display string (weight via
 *     constants/units.ts formatWeight, set-count/reps labels) is formatted
 *     HERE on the phone and shipped as plain strings.
 *   - Transport: applicationContext (latest-state, survives offline/killed
 *     watch app) -- see watchBridge.ts / modules/watch-connectivity.
 *
 * Data source: the SAME local selectors the home tab / widget bridge use --
 * schedule.ts's resolveNextUp() for "what's next", and the routines data
 * layer for the exercise list. No new queries are invented for "today's
 * workout": this hook is a thin re-projection of already-existing local
 * reads into the watch payload shape.
 *
 * "Done" derivation: there is no persisted "today's session progress" table
 * in the local schema -- WorkoutLoggerHost tracks loggedSetCount only in
 * in-memory session state while a stepper session is open. So this hook
 * independently reconstructs today's progress the same way
 * routines.ts#getLastPerformedMap matches a workout to a routine: by
 * `workouts.day_key = today` AND `workouts.session_type` matching the
 * routine name (trimmed, case-insensitive) -- then counts logged `sets` rows
 * per `exercise_id` against each exercise's `target_sets`. This is read-only
 * and best-effort; if nothing matches, every exercise simply shows done:false
 * (matches "haven't started yet" -- never a false positive).
 *
 * Push triggers (Stage A): app foreground, an incoming `{type:'refresh'}`
 * WatchConnectivity message (watch requests a re-push on session activate /
 * reachability change -- see watchBridge.ts), and the exported imperative
 * `pushWatchMirror()` (Stage B will additionally call this after each set
 * save; nothing calls it yet besides this hook itself).
 *
 * Never on the boot critical path: deferred via InteractionManager, same
 * discipline as widgetBridge.ts / intentBridge.ts in app/_layout.tsx
 * (CLAUDE.md section 5 -- the iOS 26 boot-frame TurboModule hazard).
 *
 * Free tier: zero REST. Every read here is localDb / AsyncStorage-backed
 * (loadSchedule, listRoutines, direct sets/workouts SELECTs) -- the same
 * local-first sources widgetBridge.ts already uses safely on both tiers.
 *
 * The PURE payload builder (buildWatchMirrorPayload) lives in the sibling
 * watchMirrorPayload.ts module (no react-native import) so it can be
 * `require()`d directly by a bare-node test harness -- see
 * src/hooks/__tests__/watchMirrorPayload.test.js.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, InteractionManager, Platform } from 'react-native';

import { localDb } from '../db/localDb';
import { loadSchedule, resolveNextUp } from '../data/schedule';
import { listRoutines } from '../data/routines';
import type { Routine, RoutineExercise } from '../data/routines';
import type { TierUser } from '../data/backup/tierPolicy';
import type { UnitSystem } from '../constants/units';
import {
  isWatchAvailable,
  updateWatchContext,
  subscribeToWatchMessages,
} from '../native/watchBridge';
import {
  buildWatchMirrorPayload,
  type BuildWatchMirrorInput,
  type WatchExerciseInput,
  type WatchMirrorPayload,
} from './watchMirrorPayload';

export type {
  WatchMirrorPayload,
  WatchTodayMirror,
  WatchExerciseMirror,
  BuildWatchMirrorInput,
  WatchExerciseInput,
} from './watchMirrorPayload';
export { buildWatchMirrorPayload } from './watchMirrorPayload';

// ---------------------------------------------------------------------------
// Local-data assembly (async -- the only part that touches localDb/schedule).
// Mirrors the read pattern in widgetBridge.ts / routines.ts#getLastPerformedMap.
// ---------------------------------------------------------------------------

interface TodaySetRow {
  exercise_id: string | null;
  weight_kg_val: number | null;
}

/** Best-effort match of today's logged sets against the resolved routine, by
 *  workouts.day_key = today AND session_type ~= routine name (same matching
 *  routines.ts#getLastPerformedMap already relies on). Returns a per-exercise
 *  {count, lastWeightKg} map keyed by exercise_id (lowercased/trimmed), or by
 *  name when exercise_id is absent (template/free-typed exercises, per
 *  RoutineExercise comments in api/routines.ts). */
async function loadTodayProgress(
  routineName: string,
  todayKey: string,
): Promise<Map<string, { count: number; lastWeightKg: number | null }>> {
  const out = new Map<string, { count: number; lastWeightKg: number | null }>();
  try {
    const workout = await localDb.getFirst<{ id: string }>(
      `SELECT id FROM workouts WHERE day_key = ? AND TRIM(LOWER(session_type)) = TRIM(LOWER(?)) ORDER BY created_at DESC LIMIT 1`,
      [todayKey, routineName],
    );
    if (!workout?.id) return out;
    const rows = await localDb.getAll<TodaySetRow>(
      `SELECT exercise_id, COALESCE(weight_kg, CAST(weight_raw AS REAL) / 8.0) AS weight_kg_val
         FROM sets WHERE workout_id = ? AND kind = 'lift'`,
      [workout.id],
    );
    for (const r of rows) {
      const key = (r.exercise_id ?? '').trim();
      if (!key) continue;
      const prev = out.get(key);
      out.set(key, {
        count: (prev?.count ?? 0) + 1,
        lastWeightKg: r.weight_kg_val ?? prev?.lastWeightKg ?? null,
      });
    }
  } catch {
    // best-effort -- a match failure just means every exercise shows done:false
  }
  return out;
}

function exerciseKey(ex: RoutineExercise): string {
  return (ex.exercise_id ?? ex.name ?? '').trim().toLowerCase();
}

/** Assembles today's mirror input from local data only (schedule + routines +
 *  today's logged sets). Returns null-today when nothing is scheduled or the
 *  schedule resolves to a rest day -- the watch then shows its no-data state. */
export async function assembleWatchMirrorInput(
  user: TierUser | null | undefined,
  now: Date = new Date(),
): Promise<BuildWatchMirrorInput> {
  const unitPref: UnitSystem = ((user as { unit_pref?: string } | null | undefined)?.unit_pref === 'lbs'
    ? 'lbs'
    : 'kg');

  const schedule = await loadSchedule();
  const nextUp = resolveNextUp(schedule, now);
  if (!nextUp || nextUp.isRest || !nextUp.slot.routineId) {
    return { today: null, unitPref };
  }

  let routine: Routine | null = null;
  try {
    const all = await listRoutines(user);
    routine = all.find((r) => r.id === nextUp.slot.routineId) ?? null;
  } catch {
    routine = null;
  }
  if (!routine) return { today: null, unitPref };

  const todayKey = now.toISOString().slice(0, 10);
  const progress = await loadTodayProgress(routine.name, todayKey);

  const exercises: WatchExerciseInput[] = routine.exercises.map((ex) => {
    const p = progress.get(exerciseKey(ex)) ?? progress.get((ex.name ?? '').trim().toLowerCase());
    return {
      name: ex.name,
      targetSets: ex.target_sets ?? 0,
      targetReps: ex.target_reps ?? null,
      targetWeightKg: p?.lastWeightKg ?? null,
      loggedSetCount: p?.count ?? 0,
    };
  });

  return {
    today: { workoutName: routine.name, exercises },
    unitPref,
  };
}

/** Full pipeline: local data -> pure builder -> v1 payload. */
export async function buildTodayWatchPayload(
  user: TierUser | null | undefined,
  now: Date = new Date(),
): Promise<WatchMirrorPayload> {
  const input = await assembleWatchMirrorInput(user, now);
  return buildWatchMirrorPayload(input, now);
}

// ---------------------------------------------------------------------------
// Imperative push + hook lifecycle
// ---------------------------------------------------------------------------

let lastUser: TierUser | null | undefined = null;

/**
 * Rebuilds and pushes the mirror payload right now. Exported so Stage B can
 * call it after a set save (nothing else calls it yet). Never throws --
 * mirrors the try/caught discipline of widgetBridge.ts#refreshWidget.
 */
export async function pushWatchMirror(now: Date = new Date()): Promise<void> {
  if (Platform.OS !== 'ios' || !isWatchAvailable()) return;
  try {
    const payload = await buildTodayWatchPayload(lastUser, now);
    await updateWatchContext(payload as unknown as Record<string, unknown>);
  } catch {
    // best-effort -- a failed push just means the watch shows stale/no data
    // until the next trigger (foreground, refresh handshake, or Stage B save).
  }
}

/**
 * Mounts the watch mirror lifecycle: pushes on foreground and on an
 * incoming `{type:'refresh'}` watch message. iOS-only; a no-op everywhere
 * else via watchBridge's guarded facade. Call once from app/_layout.tsx,
 * deferred off the boot frame (InteractionManager), same as the widget/
 * intent bridges.
 */
export function useWatchMirror(user: TierUser | null | undefined): void {
  const userRef = useRef(user);
  userRef.current = user;
  lastUser = user;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let cancelled = false;
    let unsubscribeMessages: (() => void) | null = null;
    let appStateSub: { remove: () => void } | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      void pushWatchMirror();

      unsubscribeMessages = subscribeToWatchMessages((message) => {
        if (message?.type === 'refresh') void pushWatchMirror();
      });

      const handleAppStateChange = (state: AppStateStatus): void => {
        if (state === 'active') void pushWatchMirror();
      };
      appStateSub = AppState.addEventListener('change', handleAppStateChange);
    });

    return () => {
      cancelled = true;
      task.cancel();
      unsubscribeMessages?.();
      appStateSub?.remove();
    };
  }, []);
}
