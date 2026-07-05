/**
 * haptics.ts — the ONLY permitted import site for `expo-haptics` in app/ and src/.
 *
 * Screens and components must never import `expo-haptics` directly — always
 * go through the `haptic` object exported here. This keeps haptic semantics
 * consistent app-wide and gives us one place to add the in-app kill switch.
 *
 * Semantic vocabulary — pick by MOMENT, not by "does it feel good":
 *   - haptic.success()   Completion moments: habit checked off, stack finished,
 *                        goal milestone.
 *   - haptic.warning()   Cautionary moments: destructive-action confirm, limit
 *                        reached.
 *   - haptic.error()     Failure feedback: a write failed, an action was
 *                        rejected.
 *   - haptic.selection() Selection changes: segmented controls, pickers, tab
 *                        changes.
 *   - haptic.impact(style?) Physical press feedback: buttons, swipe
 *                        thresholds. Defaults to 'light'.
 *
 * Non-punitive product rule: haptics celebrate and inform, never punish.
 * Do NOT wire `haptic.error()` (or any buzz) to a user "failing" at
 * something soft like a missed habit or a skipped day — that is not a
 * rejected action, it's normal life. Reserve error() for genuine write/
 * action failures (e.g. a save request bounced).
 *
 * Two independent layers can suppress feedback, and both are expected:
 *   1. The OS-level switch (iOS Settings > Sounds & Haptics) — expo-haptics
 *      already respects this natively, we do nothing extra for it.
 *   2. Our in-app preference (`lo_haptics_enabled` in AsyncStorage) — the
 *      kill switch below. Defaults to enabled (true), including for the
 *      brief window before the persisted value has loaded, so first-launch
 *      feedback still works.
 *
 * Every method here is fire-and-forget: it returns void synchronously and
 * can never throw or produce an unhandled rejection, so haptics can never
 * crash or delay UI.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ImpactStyle = 'light' | 'medium' | 'heavy';

const STORAGE_KEY = 'lo_haptics_enabled';

// Default to enabled until the persisted preference has loaded.
let enabled = true;
let loaded = false;

function loadPreferenceOnce(): void {
  if (loaded) return;
  loaded = true;
  void AsyncStorage.getItem(STORAGE_KEY)
    .then((value) => {
      if (value !== null) {
        enabled = value === 'true';
      }
    })
    .catch(() => {
      // Keep the default (enabled) on read failure.
    });
}

function supportsHaptics(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function run(fn: () => Promise<void>): void {
  loadPreferenceOnce();
  if (!enabled || !supportsHaptics()) return;
  try {
    void fn().catch(() => {
      // Swallow — haptics must never surface an error to the caller.
    });
  } catch {
    // Synchronous throw guard — should not happen with expo-haptics, but
    // haptics must never crash or delay UI regardless.
  }
}

const impactStyleMap: Record<ImpactStyle, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export const haptic = {
  /** Completion moments: habit checked off, stack finished, goal milestone. */
  success(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },

  /** Cautionary moments: destructive-action confirm, limit reached. */
  warning(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },

  /** Failure feedback: a write failed, an action was rejected. */
  error(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },

  /** Selection changes: segmented controls, pickers, tab changes. */
  selection(): void {
    run(() => Haptics.selectionAsync());
  },

  /** Physical press feedback: buttons, swipe thresholds. Default 'light'. */
  impact(style: ImpactStyle = 'light'): void {
    run(() => Haptics.impactAsync(impactStyleMap[style]));
  },
};

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
  loaded = true;
  void AsyncStorage.setItem(STORAGE_KEY, on ? 'true' : 'false').catch(() => {
    // Best-effort persistence — the in-memory cache is already updated.
  });
}

export function isHapticsEnabled(): boolean {
  return enabled;
}
