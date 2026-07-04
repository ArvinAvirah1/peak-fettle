/**
 * useRestTimer — timestamp-based rest countdown with local notification.
 *
 * Spec §6: store target end timestamp; schedule a local notification at end;
 * UI countdown derives from timestamp (survives background/kill); cancel on
 * next set. Per-exercise rest from plan's rest_seconds, default 120s,
 * adjustable ±15s.
 *
 * expo-notifications is present (package.json verified). Uses
 * scheduleNotificationAsync for the local alarm; cancels with identifier.
 *
 * TICKET-137: this hook remains the SINGLE SOURCE OF TRUTH for the rest
 * countdown. It additionally drives:
 *   - iOS: an ActivityKit Live Activity / Dynamic Island (mobile/src/native/
 *     liveActivity.ts — guarded, no-ops when the native module/extension is
 *     absent). The Island's own countdown text is native (Text(timerInterval:)),
 *     so we only push a new content state on start/adjust/exercise-change/end
 *     — never per-second. `setSessionContext` lets the host screen
 *     (WorkoutLoggerHost) feed the exercise name / set progress / next target
 *     the Island displays, without this hook needing to know about routines.
 *   - Android: an ongoing notification approximation (mobile/src/native/
 *     androidRestNotification.ts) with the same +15s/Skip actions.
 *   - Both platforms round-trip +15s/Skip taps back into THIS hook's
 *     start/adjustDuration, so a lock-screen action and an in-app tap have
 *     identical effect.
 *   - Stale-activity guard: on first mount (app cold-start) we end any
 *     Live Activity left over from a session that was killed mid-rest, so a
 *     killed app can never leave an orphaned/stuck Island entry.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  isLiveActivityAvailable,
  startRestActivity,
  updateRestActivity,
  endRestActivity,
  endAllRestActivities,
  subscribeToRestActions,
  RestActivityContentState,
} from '../native/liveActivity';
import {
  postAndroidRestOngoing,
  dismissAndroidRestOngoing,
  subscribeToAndroidRestActions,
} from '../native/androidRestNotification';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REST_TIMER_DEFAULT = 120;
export const REST_TIMER_STEP = 15;
export const REST_TIMER_MIN = 15;
export const REST_TIMER_MAX = 600;

const NOTIF_CHANNEL = 'rest-timer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RestTimerState {
  /** Seconds remaining (null = timer idle). */
  secondsLeft: number | null;
  /** Current target duration in seconds. */
  duration: number;
  /** True while countdown is running. */
  active: boolean;
}

/**
 * TICKET-137: display context for the Live Activity / Dynamic Island / Android
 * ongoing notification. Purely presentational — the host screen
 * (WorkoutLoggerHost) owns routine/exercise state and calls
 * `setSessionContext` whenever it changes; this hook never reaches into
 * routine state itself.
 */
export interface RestTimerSessionContext {
  exerciseName: string;
  /** e.g. "3 / 5" — already formatted, no locale logic pushed to native code. */
  setProgress: string;
  /** e.g. "Next: Incline DB Press", or null if this is the last exercise. */
  nextTarget: string | null;
}

const DEFAULT_CONTEXT: RestTimerSessionContext = {
  exerciseName: 'Rest',
  setProgress: '',
  nextTarget: null,
};

export interface RestTimerControls {
  /** Start (or restart) the rest countdown. duration defaults to hook's current duration. */
  start: (durationSec?: number) => void;
  /** Cancel the running timer. */
  cancel: () => void;
  /** Adjust duration by ±step (clamped to MIN/MAX). Does not restart running timer. */
  adjustDuration: (delta: number) => void;
  /** TICKET-137: update what the Live Activity / ongoing notification displays (exercise, progress, next target). */
  setSessionContext: (ctx: RestTimerSessionContext) => void;
  state: RestTimerState;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRestTimer(initialDuration = REST_TIMER_DEFAULT): RestTimerControls {
  const [duration, setDuration] = useState(initialDuration);
  const [endTs, setEndTs] = useState<number | null>(null);   // epoch ms
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const notifIdRef = useRef<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── TICKET-137: Live Activity / ongoing-notification state ───────────
  // activityIdRef — iOS ActivityKit activity id for the CURRENT rest period
  // (null when no activity is live, e.g. Android or the native module absent).
  const activityIdRef = useRef<string | null>(null);
  // sessionCtxRef — last context the host screen pushed via setSessionContext.
  // A ref (not state) because it must not itself trigger the tick/start
  // effects — it's read at the moment start()/finish fire.
  const sessionCtxRef = useRef<RestTimerSessionContext>(DEFAULT_CONTEXT);
  // startTsRef — the CURRENT rest period's start timestamp (for the Island's
  // progress bar, which needs a 0..1 range, not just an end date).
  const startTsRef = useRef<number>(Date.now());
  // endTsRef — mirrors endTs for the action-listener effect (see below),
  // which intentionally does not depend on endTs so it never tears down
  // and re-subscribes the native +15s/Skip listeners on every tick.
  const endTsRef = useRef<number | null>(null);
  useEffect(() => {
    endTsRef.current = endTs;
  }, [endTs]);

  // ── Compute seconds left from end timestamp ────────────────────
  const recompute = useCallback(() => {
    setEndTs((ts) => {
      if (ts === null) return null;
      const left = Math.round((ts - Date.now()) / 1000);
      if (left <= 0) {
        setSecondsLeft(0);
        // don't call cancel here — let the 0 state be visible for a beat
        return null;
      }
      setSecondsLeft(left);
      return ts;
    });
  }, []);

  // ── TICKET-137: stale-activity self-expiry guard ────────────────
  // On first mount (effectively app cold-start, since useRestTimer is
  // instantiated once near the app root by WorkoutLoggerHost), end any
  // Live Activity left over from a session that was killed mid-rest. A
  // killed app cannot run its own cleanup, so without this an old countdown
  // could sit in the Dynamic Island/lock screen forever (or freeze at 0:00).
  // No-op on Android / when the native module or extension is absent.
  useEffect(() => {
    void endAllRestActivities();
  }, []);

  // ── TICKET-137: build the native content-state payload from current state ─
  const buildContentState = useCallback(
    (endEpochMs: number, finished: boolean): RestActivityContentState => {
      const ctx = sessionCtxRef.current;
      return {
        endEpochMs,
        startEpochMs: startTsRef.current,
        exerciseName: ctx.exerciseName,
        setProgress: ctx.setProgress,
        nextTarget: ctx.nextTarget,
        finished,
      };
    },
    [],
  );

  // ── Tick interval ──────────────────────────────────────────
  useEffect(() => {
    if (endTs === null) {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    // Start fresh tick
    tickRef.current = setInterval(recompute, 500);
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [endTs, recompute]);

  // ── AppState resume: recompute immediately on foreground ───────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') recompute();
    });
    return () => sub.remove();
  }, [recompute]);

  // ── Notification channel (Android) ──────────────────────
  useEffect(() => {
    Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
      name: 'Rest Timer',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 200, 100, 200],
    }).catch(() => {});
  }, []);

  // ── Start ───────────────────────────────────────────────────────
  const start = useCallback(
    (durationSec?: number) => {
      const d = durationSec ?? duration;
      const clamped = Math.max(REST_TIMER_MIN, Math.min(REST_TIMER_MAX, d));

      // Cancel any existing notification
      if (notifIdRef.current) {
        Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
        notifIdRef.current = null;
      }

      const now = Date.now();
      const end = now + clamped * 1000;
      setEndTs(end);
      setSecondsLeft(clamped);

      // Schedule local notification
      Notifications.scheduleNotificationAsync({
        content: {
          title: 'Rest complete',
          body: 'Time for your next set.',
          sound: 'default',
          data: { type: 'rest_timer' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: clamped,
          repeats: false,
          channelId: NOTIF_CHANNEL,
        },
      })
        .then((id) => { notifIdRef.current = id; })
        .catch(() => {});

      // ── TICKET-137: Live Activity (iOS) / ongoing notification (Android) ──
      // A "restart" (e.g. the next set's rest) reuses the SAME activity via
      // update when one is already live (smoother than end+start — avoids a
      // flicker/re-materialize on the Island), otherwise starts a fresh one.
      startTsRef.current = now;
      if (Platform.OS === 'ios' && isLiveActivityAvailable()) {
        const content = buildContentState(end, false);
        if (activityIdRef.current) {
          void updateRestActivity(activityIdRef.current, content);
        } else {
          void startRestActivity(content).then((id) => {
            activityIdRef.current = id;
          });
        }
      } else if (Platform.OS === 'android') {
        const ctx = sessionCtxRef.current;
        void postAndroidRestOngoing({
          exerciseName: ctx.exerciseName,
          setProgress: ctx.setProgress,
          secondsLeft: clamped,
          finished: false,
        });
      }
    },
    [duration, buildContentState],
  );

  // ── Cancel ─────────────────────────────────────────────────
  const cancel = useCallback(() => {
    if (notifIdRef.current) {
      Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
      notifIdRef.current = null;
    }
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setEndTs(null);
    setSecondsLeft(null);

    // TICKET-137: tear down the native surface immediately — "cancel" covers
    // both an explicit Skip and the next-set auto-cancel, so the Island/
    // notification must never keep counting down past this point.
    if (activityIdRef.current) {
      const id = activityIdRef.current;
      activityIdRef.current = null;
      void endRestActivity(id);
    }
    void dismissAndroidRestOngoing();
  }, []);

  // ── Adjust duration ────────────────────────────────────────
  const adjustDuration = useCallback((delta: number) => {
    setDuration((d) => Math.max(REST_TIMER_MIN, Math.min(REST_TIMER_MAX, d + delta)));
  }, []);

  // ── TICKET-137: session context (exercise/progress/next target) ────
  const setSessionContext = useCallback((ctx: RestTimerSessionContext) => {
    sessionCtxRef.current = ctx;
    // Push immediately if a rest period (and thus an activity/notification)
    // is currently live, so switching exercises mid-rest updates the Island
    // without waiting for the next start()/adjust.
    if (endTs === null) return;
    if (Platform.OS === 'ios' && activityIdRef.current) {
      void updateRestActivity(activityIdRef.current, buildContentState(endTs, false));
    } else if (Platform.OS === 'android' && secondsLeft !== null) {
      void postAndroidRestOngoing({
        exerciseName: ctx.exerciseName,
        setProgress: ctx.setProgress,
        secondsLeft,
        finished: false,
      });
    }
  }, [endTs, secondsLeft, buildContentState]);

  // ── TICKET-137: finish transition — push a brief "finished" state, then
  // end the native surface. Fires exactly once per countdown reaching 0
  // (guarded by finishHandledRef so the always-on tick effect below doesn't
  // re-trigger it every 500ms while secondsLeft stays at 0).
  const finishHandledRef = useRef(false);
  useEffect(() => {
    if (secondsLeft === 0 && !finishHandledRef.current) {
      finishHandledRef.current = true;
      const finalState = buildContentState(Date.now(), true);
      if (Platform.OS === 'ios' && activityIdRef.current) {
        const id = activityIdRef.current;
        activityIdRef.current = null;
        void endRestActivity(id, finalState);
      } else if (Platform.OS === 'android') {
        void postAndroidRestOngoing({
          exerciseName: sessionCtxRef.current.exerciseName,
          setProgress: sessionCtxRef.current.setProgress,
          secondsLeft: 0,
          finished: true,
        });
      }
    } else if (secondsLeft !== 0) {
      finishHandledRef.current = false;
    }
  }, [secondsLeft, buildContentState]);

  // ── TICKET-137: +15s / Skip round-trip from the Island / ongoing notif ──
  // iOS: App Intent → App Group + Darwin notification → native module event
  // → subscribeToRestActions. Android: notification action → JS listener
  // directly (no native module needed there — see androidRestNotification.ts).
  // Both funnel into the SAME hook methods a user tapping in-app would use,
  // so behavior is identical regardless of entry point.
  const startRef = useRef(start);
  startRef.current = start;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  useEffect(() => {
    const applyAdd15 = () => {
      // Extend the CURRENT countdown by 15s (not the base `duration` — an
      // in-progress rest should grow from where it is, mirroring the in-app
      // "+30s" affordance in WorkoutLoggerHost). endTsRef mirrors the latest
      // endTs (kept in sync by the effect below) so this reads fresh state
      // without needing endTs in this effect's deps (which would tear down
      // and re-subscribe the native listeners on every tick).
      const now = Date.now();
      const base = endTsRef.current !== null && endTsRef.current > now ? endTsRef.current : now;
      const nextEnd = base + REST_TIMER_STEP * 1000;
      const remaining = Math.max(1, Math.round((nextEnd - now) / 1000));
      startRef.current(remaining);
    };
    const applySkip = () => cancelRef.current();

    const unsubIos = subscribeToRestActions((action) => {
      if (action.type === 'add15') applyAdd15();
      else if (action.type === 'skip') applySkip();
    });
    const unsubAndroid = subscribeToAndroidRestActions(applyAdd15, applySkip);
    return () => {
      unsubIos();
      unsubAndroid();
    };
  }, []);

  // ── Clean up on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) clearInterval(tickRef.current);
      // Do NOT cancel the notification on unmount — it should still fire
      // even if the component tree is torn down (background / swipe-kill).
      // Same rule for the Live Activity / Android ongoing notification: a
      // torn-down component (backgrounded app) must not end an in-progress
      // rest's on-screen surface — only an explicit cancel()/finish does.
    };
  }, []);

  return {
    start,
    cancel,
    adjustDuration,
    setSessionContext,
    state: {
      secondsLeft,
      duration,
      active: secondsLeft !== null && secondsLeft > 0,
    },
  };
}
