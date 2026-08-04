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
import { toDateKey } from '../utils/dateHelpers';
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
  weight_centi: number | null;
  weight_unit: string | null;
}

interface TodayProgressEntry {
  count: number;
  lastWeightKg: number | null;
  /** v18 exact fixed-point entry mirrored from the set row (null on legacy rows). */
  lastWeightCenti: number | null;
  lastWeightUnit: string | null;
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
  userId: string,
): Promise<Map<string, TodayProgressEntry>> {
  const out = new Map<string, TodayProgressEntry>();
  // WATCH-05: no user id -> no attribution. Never guess across accounts on a
  // shared device; every exercise just shows done:false.
  if (!userId) return out;
  try {
    // WATCH-05: scoped by user_id like localWorkouts.ts. This is a read-only
    // best-effort path, so legacy pre-scoping rows (NULL/'' user_id) are
    // tolerated here instead of adopted (localWorkouts#adoptLegacyRows owns
    // the write that claims them).
    const workout = await localDb.getFirst<{ id: string }>(
      `SELECT id FROM workouts
        WHERE day_key = ? AND TRIM(LOWER(session_type)) = TRIM(LOWER(?))
          AND (user_id = ? OR user_id IS NULL OR user_id = '')
        ORDER BY created_at DESC LIMIT 1`,
      [todayKey, routineName, userId],
    );
    if (!workout?.id) return out;
    const rows = await localDb.getAll<TodaySetRow>(
      `SELECT exercise_id, COALESCE(weight_kg, CAST(weight_raw AS REAL) / 8.0) AS weight_kg_val,
              weight_centi, weight_unit
         FROM sets WHERE workout_id = ? AND kind = 'lift'`,
      [workout.id],
    );
    for (const r of rows) {
      // WATCH-03: lowercase at insert so it matches the lowercased lookup in
      // exerciseKey(). This also makes name-keyed rows (free-typed exercises
      // whose id column carries the name, not a library UUID) hit the name
      // fallback lookup. Rows with a truly NULL/blank exercise_id carry no
      // name in the sets schema, so they remain unattributable and are skipped.
      const key = (r.exercise_id ?? '').trim().toLowerCase();
      if (!key) continue;
      const prev = out.get(key);
      const hasWeight = r.weight_kg_val != null;
      out.set(key, {
        count: (prev?.count ?? 0) + 1,
        lastWeightKg: hasWeight ? r.weight_kg_val : prev?.lastWeightKg ?? null,
        // WATCH-07: carry the exact fixed-point entry alongside the kg value,
        // keeping the centi/unit pair from the SAME row as the kg it describes.
        lastWeightCenti: hasWeight ? r.weight_centi : prev?.lastWeightCenti ?? null,
        lastWeightUnit: hasWeight ? r.weight_unit : prev?.lastWeightUnit ?? null,
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
  // WATCH-06: the watch renders this payload under a hardcoded "Today", so a
  // future weekly slot ('Tomorrow' / a weekday name) must NOT be mirrored as
  // today's workout. 'Next up' (cycle schedules are day-agnostic -- the next
  // slot IS what you'd do today) passes through.
  if (nextUp.whenLabel !== 'Today' && nextUp.whenLabel !== 'Next up') {
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

  // WATCH-04: local-day key (toDateKey), never UTC toISOString -- west-of-UTC
  // evenings would otherwise match tomorrow's day_key (same family as UI-121).
  const todayKey = toDateKey(now);
  const userId = (user as { id?: string } | null | undefined)?.id ?? '';
  const progress = await loadTodayProgress(routine.name, todayKey, userId);

  const exercises: WatchExerciseInput[] = routine.exercises.map((ex) => {
    const p = progress.get(exerciseKey(ex)) ?? progress.get((ex.name ?? '').trim().toLowerCase());
    return {
      name: ex.name,
      targetSets: ex.target_sets ?? 0,
      targetReps: ex.target_reps ?? null,
      targetWeightKg: p?.lastWeightKg ?? null,
      targetWeightCenti: p?.lastWeightCenti ?? null,
      targetWeightUnit: p?.lastWeightUnit ?? null,
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

  // WATCH-11: keying the effect by user id makes a sign-out/user-switch re-run
  // it, so the mount-time pushWatchMirror() below re-pushes a cleared (signed
  // out) or new-user payload instead of leaving the previous user's workout
  // mirrored on the watch forever.
  const userId = (user as { id?: string } | null | undefined)?.id ?? null;

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
  }, [userId]);
}
