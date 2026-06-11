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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

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

export interface RestTimerControls {
  /** Start (or restart) the rest countdown. duration defaults to hook's current duration. */
  start: (durationSec?: number) => void;
  /** Cancel the running timer. */
  cancel: () => void;
  /** Adjust duration by ±step (clamped to MIN/MAX). Does not restart running timer. */
  adjustDuration: (delta: number) => void;
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

  // ── Compute seconds left from end timestamp ────────────────────────────
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

  // ── Tick interval ─────────────────────────────────────────────────────
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

  // ── AppState resume: recompute immediately on foreground ───────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') recompute();
    });
    return () => sub.remove();
  }, [recompute]);

  // ── Notification channel (Android) ────────────────────────────────────
  useEffect(() => {
    Notifications.setNotificationChannelAsync(NOTIF_CHANNEL, {
      name: 'Rest Timer',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 200, 100, 200],
    }).catch(() => {});
  }, []);

  // ── Start ──────────────────────────────────────────────────────────────
  const start = useCallback(
    (durationSec?: number) => {
      const d = durationSec ?? duration;
      const clamped = Math.max(REST_TIMER_MIN, Math.min(REST_TIMER_MAX, d));

      // Cancel any existing notification
      if (notifIdRef.current) {
        Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
        notifIdRef.current = null;
      }

      const end = Date.now() + clamped * 1000;
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
    },
    [duration],
  );

  // ── Cancel ─────────────────────────────────────────────────────────────
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
  }, []);

  // ── Adjust duration ────────────────────────────────────────────────────
  const adjustDuration = useCallback((delta: number) => {
    setDuration((d) => Math.max(REST_TIMER_MIN, Math.min(REST_TIMER_MAX, d + delta)));
  }, []);

  // ── Clean up on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) clearInterval(tickRef.current);
      // Do NOT cancel the notification on unmount — it should still fire
      // even if the component tree is torn down (background / swipe-kill).
    };
  }, []);

  return {
    start,
    cancel,
    adjustDuration,
    state: {
      secondsLeft,
      duration,
      active: secondsLeft !== null && secondsLeft > 0,
    },
  };
}
