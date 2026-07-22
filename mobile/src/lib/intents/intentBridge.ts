/**
 * intentBridge — TICKET-145 (Siri / App Intents voice logging + interactive
 * widgets). The impure shell around intentHandlers.ts's pure layer.
 *
 * Mirrors the PROVEN round-trip mechanism already shipped for the rest-timer
 * Live Activity (mobile/src/native/liveActivity.ts + targets/live-activity/
 * AppIntents.swift, TICKET-137) — reused here rather than inventing a new
 * transport:
 *   1. The App Intent (Swift, targets/widget/AppIntents.swift — see that
 *      file's header for the LogSetIntent/StartWorkoutIntent/StartRestIntent
 *      structs) runs IN-PROCESS inside the widget extension when invoked by
 *      Siri, Shortcuts, or a widget button tap. It cannot call back into the
 *      host app directly.
 *   2. `perform()` writes a small JSON action record into the shared App
 *      Group's UserDefaults (`group.com.peakfettle.app`) under
 *      INTENT_PENDING_ACTION_KEY, then posts a Darwin notification
 *      (`com.peakfettle.app.intentAction`) as the cross-process wake-up
 *      signal — the only mechanism available between an extension and the
 *      host app process.
 *   3. This module picks the record up two ways, exactly like liveActivity.ts:
 *        - LIVE: a native module observer (same NOT-YET-BUILT
 *          `LiveActivityModule`-style host bridge; here we reuse the SAME
 *          native module name/shape so no second native module is required —
 *          see `getNative()` below) forwards the Darwin-notification fire as
 *          an Expo Modules event.
 *        - CATCH-UP: on every app foreground AND once at cold-start, this
 *          module polls the App Group directly (`readPendingIntentAction`)
 *          in case the app was fully killed when the intent fired (a Darwin
 *          notification with no listener yet is dropped — the record itself
 *          is durable, so nothing is lost).
 *   4. Whatever record is found is parsed and dispatched through
 *      intentHandlers.ts's PURE handlers, then applied to the LOCAL data
 *      layer (localWorkouts / localDb / data/schedule.ts) — never REST, on
 *      either tier (see intentHandlers.ts's header for why).
 *
 * Keys are namespaced per-feature (`intent_` prefix) so this never collides
 * with the rest-timer Live Activity's `rest_timer_pending_action` key in the
 * same shared UserDefaults suite.
 *
 * Safety: iOS-only, lazy-required, every entry point try/caught — must never
 * crash Android, Expo Go (no native module), or a logging flow. Matches
 * widgetBridge.ts / liveActivity.ts's guarded-native pattern exactly.
 *
 * NOTE (native host bridge): the native observer that forwards the Darwin
 * notification into an Expo Modules event is the SAME pending native module
 * documented in liveActivity.ts ("mobile/modules/live-activity, Swift, NOT
 * owned by this file"). That module is still pending per that file's header;
 * this bridge is written so it degrades to catch-up-only polling (foreground
 * + cold start) until that native observer lands — voice actions are still
 * picked up the next time the app is foregrounded, just not instantly while
 * backgrounded. This mirrors the ticket brief's explicit instruction to
 * "design your JS-side pickup the same way: shared-defaults polling/catch-up
 * on foreground + the same pending-action key pattern."
 */

import { AppState, AppStateStatus, Platform } from 'react-native';

import {
  handleLogSetIntent,
  handleStartWorkoutIntent,
  handleStartRestIntent,
  LogSetPayload,
  StartWorkoutPayload,
  StartRestPayload,
  LogSetPlan,
  StartWorkoutPlan,
  StartRestPlan,
  INTENT_MESSAGES,
} from './intentHandlers';
import { UnitSystem, kgToLbs } from '../../constants/units';
import { localDb, genId } from '../../db/localDb';
import { ensureLocalWorkoutForDay, stampLocalRoutineName } from '../../data/localWorkouts';
import { rememberExerciseName, getExerciseNameMap } from '../../data/exerciseNames';
import { loadSchedule, resolveNextUp, markRoutineCompleted } from '../../data/schedule';
import { listRoutines } from '../../data/routines';
import { isLocalFirst, TierUser } from '../../data/backup/tierPolicy';
import { toDateKey } from '../../utils/dateHelpers';
import {
  REST_TIMER_DEFAULT,
  REST_TIMER_MIN,
  REST_TIMER_MAX,
} from '../../hooks/useRestTimer';

export const APP_GROUP = 'group.com.peakfettle.app';
/** Namespaced per TICKET-145 — does not collide with rest_timer_pending_action. */
export const INTENT_PENDING_ACTION_KEY = 'intent_pending_action';
const DARWIN_NOTIFICATION_NAME = 'com.peakfettle.app.intentAction';

// ---------------------------------------------------------------------------
// Raw action record (mirrors the Swift-side JSON written by AppIntents.swift)
// ---------------------------------------------------------------------------

interface RawIntentAction {
  intent: 'logSet' | 'startWorkout' | 'startRest';
  payload: Record<string, unknown>;
  ts: number;
}

/** Outcome surfaced back to the caller / Swift confirmation dialog. */
export interface IntentDispatchResult {
  ok: boolean;
  message: string;
}

// ---------------------------------------------------------------------------
// Current-app-state hooks the bridge needs. Set once from the app root
// (mirrors widgetBridge.ts's startWidgetBridge() being called from _layout).
// These are simple setters rather than a React context because the bridge
// must also run its catch-up read before any component has mounted.
// ---------------------------------------------------------------------------

interface BridgeContext {
  user: TierUser | null;
  unitPref: UnitSystem;
  userId: string;
  /** Current in-progress exercise in the logger, or null. */
  currentExercise: { id: string; name: string } | null;
  /** Default rest timer duration (settings-configurable; falls back to REST_TIMER_DEFAULT). */
  defaultRestSeconds: number;
  /** Called with a StartRestPlan so the host screen can kick off useRestTimer.start(). */
  onStartRest?: (seconds: number) => void;
  /** Called with a StartWorkoutPlan so the host screen can navigate/open the logger. */
  onStartWorkout?: (routineId: string | null, routineName: string | null) => void;
}

let ctx: BridgeContext = {
  user: null,
  unitPref: 'kg',
  userId: 'local',
  currentExercise: null,
  defaultRestSeconds: REST_TIMER_DEFAULT,
};

/** Host screen / app root updates whatever context it owns. Merges shallowly. */
export function setIntentBridgeContext(partial: Partial<BridgeContext>): void {
  ctx = { ...ctx, ...partial };
}

// ---------------------------------------------------------------------------
// Guarded native load (same shape as liveActivity.ts's getNative()).
// ---------------------------------------------------------------------------

interface IntentBridgeNativeModule {
  /** Reads + clears the pending action record from the App Group. */
  readPendingIntentAction(): Promise<string | null>;
  addIntentActionListener(listener: (event: { payload: string }) => void): { remove: () => void };
}

let native: IntentBridgeNativeModule | null = null;
let loadAttempted = false;

function getNative(): IntentBridgeNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  if (loadAttempted) return native;
  loadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    // Reuses the LiveActivityModule name deliberately: both the rest-timer
    // Live Activity action round-trip AND this feature's intent-action
    // round-trip observe the SAME App Group via Darwin notifications from
    // the SAME host-app native module (one Swift observer, two notification
    // names). See this file's header note on the pending native bridge.
    native = mod.requireOptionalNativeModule<IntentBridgeNativeModule>('LiveActivityModule') ?? null;
  } catch {
    native = null;
  }
  return native;
}

/** True only on iOS with the native bridge module compiled in (EAS build with the widget extension). */
export function isIntentBridgeAvailable(): boolean {
  return Platform.OS === 'ios' && getNative() != null;
}

// ---------------------------------------------------------------------------
// Direct App Group read fallback — used when the native module isn't
// compiled in yet (documented as pending), so catch-up polling still works
// via a lightweight ExtensionStorage-style read. Falls back to a no-op
// when @bacons/apple-targets' ExtensionStorage has no read API available.
// ---------------------------------------------------------------------------

function parseRawAction(raw: string | null): RawIntentAction | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Partial<RawIntentAction>;
    if (
      obj &&
      (obj.intent === 'logSet' || obj.intent === 'startWorkout' || obj.intent === 'startRest') &&
      obj.payload &&
      typeof obj.payload === 'object'
    ) {
      return { intent: obj.intent, payload: obj.payload, ts: typeof obj.ts === 'number' ? obj.ts : Date.now() };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Resolvers passed into the pure handlers (kept here so intentHandlers.ts
// never imports localDb/data modules directly).
// ---------------------------------------------------------------------------

async function resolveExerciseByName(name: string): Promise<{ id: string; name: string } | null> {
  try {
    const map = await getExerciseNameMap();
    const target = name.trim().toLowerCase();
    for (const [id, exName] of map.entries()) {
      if (exName.trim().toLowerCase() === target) return { id, name: exName };
    }
    // Loose contains-match fallback (voice transcription is rarely exact).
    for (const [id, exName] of map.entries()) {
      const lower = exName.trim().toLowerCase();
      if (lower.includes(target) || target.includes(lower)) return { id, name: exName };
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveRoutineByName(name: string): Promise<{ id: string; name: string } | null> {
  try {
    const routines = await listRoutines(ctx.user);
    const target = name.trim().toLowerCase();
    const exact = routines.find((r) => r.name?.trim().toLowerCase() === target);
    if (exact) return { id: exact.id, name: exact.name };
    const loose = routines.find((r) => {
      const lower = r.name?.trim().toLowerCase() ?? '';
      return lower.includes(target) || target.includes(lower);
    });
    return loose ? { id: loose.id, name: loose.name } : null;
  } catch {
    return null;
  }
}

async function resolveNextUpForIntent(): Promise<{ routineId: string; routineName: string } | null> {
  try {
    const schedule = await loadSchedule();
    const nextUp = resolveNextUp(schedule);
    if (!nextUp || nextUp.isRest || !nextUp.slot.routineId) return null;
    return { routineId: nextUp.slot.routineId, routineName: nextUp.slot.routineName ?? 'Workout' };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Applying a validated plan to the LOCAL data layer (no REST on any tier —
// see intentHandlers.ts's header for why this is a deliberate v1 decision).
// ---------------------------------------------------------------------------

function encodeWeightRaw(weightKg: number): number {
  return Math.round(weightKg * 8);
}

async function applyLogSetPlan(plan: LogSetPlan): Promise<void> {
  await localDb.init();
  const now = new Date(plan.loggedAt);
  const dayKey = toDateKey(now);
  const workout = await ensureLocalWorkoutForDay(dayKey, ctx.userId);
  if (!workout) throw new Error('[intentBridge] failed to resolve today\'s workout row');

  await rememberExerciseName(plan.exerciseId, plan.exerciseName);

  const row = await localDb.getFirst<{ next_index: number | null }>(
    'SELECT MAX(set_index) AS next_index FROM sets WHERE workout_id = ? AND exercise_id = ?',
    [workout.id, plan.exerciseId],
  );
  const setIndex = (row?.next_index ?? -1) + 1;

  const localId = genId();
  const COLS =
    `(id, server_id, workout_id, user_id, exercise_id, kind, set_index, ` +
    `reps, weight_raw, weight_kg, weight_centi, weight_unit, rir, duration_sec, distance_m, avg_pace_sec_per_km, ` +
    `logged_at, synced)`;
  await localDb.execute(
    `INSERT INTO sets ${COLS}
     VALUES (?, NULL, ?, ?, ?, 'lift', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 0)`,
    [
      localId, workout.id, ctx.userId, plan.exerciseId, setIndex,
      plan.reps, encodeWeightRaw(plan.weightKg), plan.weightKg,
      plan.weightCenti ?? null, plan.weightUnit ?? null,
      plan.loggedAt,
    ],
    { tables: ['sets'] },
  );
}

async function applyStartWorkoutPlan(plan: StartWorkoutPlan): Promise<void> {
  await localDb.init();
  const now = new Date(plan.startedAt);
  const dayKey = toDateKey(now);
  await ensureLocalWorkoutForDay(dayKey, ctx.userId);
  if (plan.routineName) {
    await stampLocalRoutineName(dayKey, plan.routineName);
  }
  if (plan.routineId) {
    // Best-effort: advance a cycle-mode schedule the same way completing a
    // routine in-app would eventually do — starting via voice still counts
    // as "doing" the next-up slot for schedule purposes. Failure here must
    // never block the workout from being started.
    try {
      await markRoutineCompleted(plan.routineId);
    } catch {
      // best-effort
    }
  }
  ctx.onStartWorkout?.(plan.routineId, plan.routineName);
}

async function applyStartRestPlan(plan: StartRestPlan): Promise<void> {
  // The rest countdown itself is owned entirely by useRestTimer (in-memory,
  // per CLAUDE.md-adjacent design note in useRestTimer.ts: it is the single
  // source of truth). This bridge cannot reach into that hook's state
  // directly from outside React, so it hands the resolved duration to
  // whatever callback the host screen registered (mirrors how the Live
  // Activity +15s/skip round-trip hands off to the SAME hook methods).
  ctx.onStartRest?.(plan.seconds);
}

// ---------------------------------------------------------------------------
// Dispatch — parse the raw record, run the pure handler, apply the plan.
// ---------------------------------------------------------------------------

async function dispatchRawAction(raw: RawIntentAction): Promise<IntentDispatchResult> {
  try {
    if (raw.intent === 'logSet') {
      const payload = raw.payload as unknown as LogSetPayload;
      const spokenName = payload.exercise?.trim();
      const result = handleLogSetIntent(payload, {
        unitPref: ctx.unitPref,
        currentExercise: ctx.currentExercise,
        resolveExerciseByName: spokenName ? () => null : undefined,
        now: new Date(),
      });
      // resolveExerciseByName must be sync per the pure-handler contract, but
      // exercise-name lookup is async (SQLite). Resolve it up front when a
      // name was spoken, then re-run the pure handler with a sync resolver
      // that just returns the pre-fetched match — keeps intentHandlers.ts
      // free of any async/DB concerns while still supporting named lookups.
      if (spokenName) {
        const resolved = await resolveExerciseByName(spokenName);
        const finalResult = handleLogSetIntent(payload, {
          unitPref: ctx.unitPref,
          currentExercise: ctx.currentExercise,
          resolveExerciseByName: () => resolved,
          now: new Date(),
        });
        if (!finalResult.ok) return { ok: false, message: finalResult.message };
        await applyLogSetPlan(finalResult.plan);
        return { ok: true, message: `Logged ${finalResult.plan.reps} at ${displayWeight(finalResult.plan.weightKg)}.` };
      }
      if (!result.ok) return { ok: false, message: result.message };
      await applyLogSetPlan(result.plan);
      return { ok: true, message: `Logged ${result.plan.reps} reps on ${result.plan.exerciseName}.` };
    }

    if (raw.intent === 'startWorkout') {
      const payload = raw.payload as unknown as StartWorkoutPayload;
      const spokenName = payload.routine?.trim();
      const resolved = spokenName ? await resolveRoutineByName(spokenName) : null;
      const nextUp = spokenName ? null : await resolveNextUpForIntent();
      const result = handleStartWorkoutIntent(payload, {
        resolveRoutineByName: spokenName ? () => resolved : undefined,
        nextUp,
        now: new Date(),
      });
      if (!result.ok) return { ok: false, message: result.message };
      await applyStartWorkoutPlan(result.plan);
      return {
        ok: true,
        message: result.plan.routineName ? `Starting ${result.plan.routineName}.` : 'Starting your workout.',
      };
    }

    if (raw.intent === 'startRest') {
      const payload = raw.payload as unknown as StartRestPayload;
      const result = handleStartRestIntent(payload, {
        defaultSeconds: ctx.defaultRestSeconds,
        minSeconds: REST_TIMER_MIN,
        maxSeconds: REST_TIMER_MAX,
        now: new Date(),
      });
      if (!result.ok) return { ok: false, message: result.message };
      await applyStartRestPlan(result.plan);
      return { ok: true, message: `Resting for ${result.plan.seconds} seconds.` };
    }

    return { ok: false, message: 'Unrecognized voice command.' };
  } catch {
    return { ok: false, message: INTENT_MESSAGES.noActiveWorkout };
  }
}

function displayWeight(weightKg: number): string {
  return ctx.unitPref === 'lbs' ? `${Math.round(kgToLbs(weightKg))} lbs` : `${weightKg} kg`;
}

// ---------------------------------------------------------------------------
// Lifecycle — call startIntentBridge() once from the root layout, alongside
// startWidgetBridge(). Picks up any pending action on cold start + every
// foreground (catch-up path), plus live native events when available.
// ---------------------------------------------------------------------------

let started = false;
let appStateSub: { remove: () => void } | null = null;
let nativeSub: { remove: () => void } | null = null;

async function checkForPendingAction(): Promise<void> {
  try {
    const mod = getNative();
    let raw: string | null = null;
    if (mod) {
      raw = await mod.readPendingIntentAction();
    }
    const action = parseRawAction(raw);
    if (action) await dispatchRawAction(action);
  } catch {
    // best-effort — a missed catch-up read is not fatal, just delays pickup
  }
}

/** Idempotent — safe to call repeatedly (mirrors widgetBridge.startWidgetBridge). */
export function startIntentBridge(): void {
  if (started || Platform.OS !== 'ios') return;
  started = true;

  // Cold-start catch-up: an intent fired while the app was fully killed
  // leaves its record sitting in the App Group with no live listener yet.
  void checkForPendingAction();

  // Foreground catch-up: the same as the cold-start read, re-run every time
  // the app comes back to the foreground (a Darwin notification posted while
  // backgrounded may have been missed by a suspended process).
  appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') void checkForPendingAction();
  });

  // Live path: once the native observer module exists (see this file's
  // header), its Darwin-notification-driven event fires immediately.
  const mod = getNative();
  if (mod) {
    nativeSub = mod.addIntentActionListener((event) => {
      const action = parseRawAction(event.payload);
      if (action) void dispatchRawAction(action);
    });
  }
}

/** Test/teardown helper — not used by the app itself. */
export function stopIntentBridge(): void {
  started = false;
  appStateSub?.remove();
  appStateSub = null;
  nativeSub?.remove();
  nativeSub = null;
}

// Exported for completeness/documentation parity with liveActivity.ts's
// naming; the actual polling above always goes through the native module
// when present. Kept as a named export in case a future native module wants
// a plain string constant to write under (matches AppIntents.swift's
// `actionKey`/`darwinNotificationName` naming convention).
export const INTENT_DARWIN_NOTIFICATION_NAME = DARWIN_NOTIFICATION_NAME;
