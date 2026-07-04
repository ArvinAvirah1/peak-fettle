/**
 * liveActivity — TICKET-137 bridge facade for the iOS rest-timer Live Activity
 * (ActivityKit / Dynamic Island) + Android ongoing-notification fallback.
 *
 * Design rules (mirrors lifeos/src/native/blocking.ts — the proven facade
 * pattern for an optional native module in this codebase):
 *   - Everything degrades gracefully: when the native module is absent
 *     (Android without the local module compiled in, iOS simulator without
 *     the widget-extension target, Expo Go, or a JS-only test run) every call
 *     is a harmless no-op and `isLiveActivityAvailable()` is false. The rest
 *     timer itself (useRestTimer.ts) MUST keep working with zero native side.
 *   - Zero network: every call here only touches on-device ActivityKit state
 *     / the App Group. No REST, no auth — safe on the free tier.
 *   - useRestTimer.ts remains the SINGLE SOURCE OF TRUTH for the countdown.
 *     This module only starts/updates/ends the OS-level surface; it never
 *     owns timing state itself (the Live Activity's own countdown text is
 *     native `Text(timerInterval:)`, driven by the end date we pass in, so
 *     there is no per-second bridge traffic).
 *
 * Round-trip action mechanism (+15s / Skip), documented once here:
 *   1. The Live Activity's SwiftUI view has two buttons wired to App Intents
 *      (`RestTimerAddIntent`, `RestTimerSkipIntent`, defined in
 *      mobile/targets/live-activity/AppIntents.swift). App Intents run
 *      IN-PROCESS inside the widget extension, not the host app.
 *   2. Each intent's `perform()` writes a small JSON action record
 *      (`{ action: 'add15' | 'skip', activityId, ts }`) into the shared
 *      App Group's UserDefaults under `REST_TIMER_ACTION_KEY`, then posts a
 *      Darwin notification (`CFNotificationCenterPostNotification`,
 *      name `com.peakfettle.app.restTimerAction`) — Darwin notifications are
 *      the only cross-process wake-up signal available between an extension
 *      and the host app (no shared-memory callback is possible).
 *   3. The host app's native module (mobile/modules/live-activity, Swift)
 *      registers a `CFNotificationCenterAddObserver` for that Darwin name at
 *      module init. On fire, it reads + clears the action record from the
 *      App Group and emits it to JS as an Expo Modules event
 *      (`onRestTimerAction`).
 *   4. This facade subscribes once (`subscribeToActions`) and forwards the
 *      parsed action to whatever `useRestTimer` registered — see
 *      `mobile/src/hooks/useRestTimer.ts` (`restTimer.start`'s
 *      `wireLiveActivityActions` effect).
 *   5. If the app is killed, the extension keeps writing the action record;
 *      the NEXT app launch's module-init observer registration can also poll
 *      the App Group once at startup (`readPendingAction`) as a catch-up path
 *      so a +15s/Skip tap is never silently lost.
 *
 * Native side (not built by this ticket's owner — see targets/live-activity/
 * and the "new native bridge module" scaffold below): a local Expo module
 * named `LiveActivityModule` exposing:
 *   startActivity(payload: string) -> Promise<string /* activityId *\/>
 *   updateActivity(activityId: string, payload: string) -> Promise<void>
 *   endActivity(activityId: string, finalPayload: string | null) -> Promise<void>
 *   endAllActivities() -> Promise<void>          // stale-activity guard
 *   readPendingAction() -> Promise<string | null> // JSON or null, clears on read
 *   addActionListener / removeActionListeners     // Expo Modules event emitter
 */

import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Everything the Live Activity / Dynamic Island needs to render one frame. */
export interface RestActivityContentState {
  /** Absolute epoch-ms the rest period ends — native renders via Text(timerInterval:), no per-second bridge traffic. */
  endEpochMs: number;
  /** Epoch-ms the rest period started (needed for the progress bar's 0..1 range). */
  startEpochMs: number;
  /** Current exercise name shown in the expanded/compact views. */
  exerciseName: string;
  /** "3 / 5" style set progress string (already formatted — no locale logic in Swift). */
  setProgress: string;
  /** Next target (e.g. "Next: Incline DB Press") or null if this is the last exercise. */
  nextTarget: string | null;
  /** True once the countdown reaches 0 — the activity shows a "Rest complete" state briefly before self-ending. */
  finished: boolean;
}

export type RestActivityAction =
  | { type: 'add15'; activityId: string; ts: number }
  | { type: 'skip'; activityId: string; ts: number };

type ActionListener = (action: RestActivityAction) => void;

interface LiveActivityNativeModule {
  startActivity(payloadJson: string): Promise<string>;
  updateActivity(activityId: string, payloadJson: string): Promise<void>;
  endActivity(activityId: string, finalPayloadJson: string | null): Promise<void>;
  endAllActivities(): Promise<void>;
  readPendingAction(): Promise<string | null>;
  addActionListener(listener: (event: { payload: string }) => void): { remove: () => void };
}

// ---------------------------------------------------------------------------
// Guarded load — NEVER throw at import time. iOS-only; absent everywhere else
// (Android goes through the separate ongoing-notification path in this same
// facade; Expo Go / bare JS test runs get a full no-op).
// ---------------------------------------------------------------------------

let native: LiveActivityNativeModule | null = null;
let loadAttempted = false;

function getNative(): LiveActivityNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  if (loadAttempted) return native;
  loadAttempted = true;
  try {
    // Typed explicitly (rather than a generic on the require() call itself)
    // so this compiles the same whether or not expo-modules-core's own
    // types happen to be resolved by the surrounding tsconfig/module setup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-modules-core') as {
      requireOptionalNativeModule: <T>(name: string) => T | null;
    };
    native = mod.requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivityModule') ?? null;
  } catch {
    native = null;
  }
  return native;
}

/** True only on iOS 16.1+ with the LiveActivityModule compiled in (EAS build with the widget extension). */
export function isLiveActivityAvailable(): boolean {
  return Platform.OS === 'ios' && getNative() != null;
}

// ---------------------------------------------------------------------------
// Lifecycle — start / update / end
// ---------------------------------------------------------------------------

/** Starts a new Live Activity; returns its activityId, or null if unavailable. Never throws. */
export async function startRestActivity(state: RestActivityContentState): Promise<string | null> {
  const mod = getNative();
  if (!mod) return null;
  try {
    return await mod.startActivity(JSON.stringify(state));
  } catch {
    return null;
  }
}

/** Pushes a fresh content state to an existing activity (e.g. +15s adjust, exercise advance). Never throws. */
export async function updateRestActivity(activityId: string, state: RestActivityContentState): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  try {
    await mod.updateActivity(activityId, JSON.stringify(state));
  } catch {
    // best-effort — a failed update just means the Island shows stale text
    // until the next tick; the in-app countdown (source of truth) is unaffected.
  }
}

/**
 * Ends the activity. `finalState` (optional) is shown briefly (e.g. "Rest
 * complete") before the system dismisses it; pass null to dismiss immediately.
 */
export async function endRestActivity(activityId: string, finalState?: RestActivityContentState): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  try {
    await mod.endActivity(activityId, finalState ? JSON.stringify(finalState) : null);
  } catch {
    // best-effort
  }
}

/**
 * Stale-activity self-expiry guard: ends EVERY Live Activity this app owns.
 * Call on cold launch before starting a new one, so a session that was
 * killed mid-rest (activityId lost from JS memory) can't leave an orphaned
 * Dynamic Island/lock-screen entry counting down forever (or to a stale
 * "0:00" that never clears — ActivityKit has no app-independent GC for us).
 */
export async function endAllRestActivities(): Promise<void> {
  const mod = getNative();
  if (!mod) return;
  try {
    await mod.endAllActivities();
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Action round-trip (+15s / Skip from the Island/lock-screen back into JS)
// ---------------------------------------------------------------------------

let subscribed = false;
let listeners: ActionListener[] = [];
let nativeSub: { remove: () => void } | null = null;

function parseAction(raw: string): RestActivityAction | null {
  try {
    const obj = JSON.parse(raw) as { action?: string; activityId?: string; ts?: number };
    if (obj.action === 'add15' && obj.activityId) {
      return { type: 'add15', activityId: obj.activityId, ts: obj.ts ?? Date.now() };
    }
    if (obj.action === 'skip' && obj.activityId) {
      return { type: 'skip', activityId: obj.activityId, ts: obj.ts ?? Date.now() };
    }
    return null;
  } catch {
    return null;
  }
}

function fanOut(action: RestActivityAction): void {
  for (const l of listeners) {
    try {
      l(action);
    } catch {
      // a listener throwing must never break the others
    }
  }
}

/**
 * Subscribes to +15s/Skip actions coming from the extension. Safe to call
 * repeatedly (idempotent) — real work (native event subscription + the
 * catch-up read) happens once per app lifetime. Returns an unsubscribe for
 * this specific listener.
 */
export function subscribeToRestActions(listener: ActionListener): () => void {
  listeners.push(listener);

  if (!subscribed) {
    subscribed = true;
    const mod = getNative();
    if (mod) {
      // Live path: the module's Darwin-notification observer fires this
      // event whenever the extension writes a new action record.
      nativeSub = mod.addActionListener((event) => {
        const action = parseAction(event.payload);
        if (action) fanOut(action);
      });
      // Catch-up path: an action written while the app was fully killed
      // (Darwin notification has no listener yet) is still sitting in the
      // App Group — read it once at subscribe time so it isn't lost.
      mod.readPendingAction()
        .then((raw) => {
          if (!raw) return;
          const action = parseAction(raw);
          if (action) fanOut(action);
        })
        .catch(() => {});
    }
  }

  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
