/**
 * haptics.ts — Peak Fettle haptic feedback utilities.
 * Phase E — E-006: Motion & Haptics
 *
 * Thin wrappers around expo-haptics that:
 *   1. Guard against platforms where haptics are unavailable (Android baseline,
 *      web renderer, Expo Go without native support).
 *   2. Provide named feedback patterns that map to Peak Fettle UX events.
 *
 * Spec §7 haptic patterns:
 *   light   — button taps, list row taps, tab switches
 *   medium  — form submission, PR badge trigger, plan generation start
 *   success — set logged, plan saved, streak maintained
 *   warning — delete / destructive action confirmation
 *   error   — validation failure, network error
 *
 * Usage:
 *   import { haptics } from '../utils/haptics';
 *   haptics.light();      // button tap
 *   haptics.success();    // set logged
 */

import * as Haptics from 'expo-haptics';

function safeHaptic(fn: () => Promise<void>): void {
  fn().catch(() => {
    // Haptics unavailable (Android without vibration, web, etc.) — silently ignore.
  });
}

export const haptics = {
  /** Light tap — button presses, row taps, tab switches */
  light(): void {
    safeHaptic(() =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    );
  },

  /** Medium impact — form submissions, plan generation start */
  medium(): void {
    safeHaptic(() =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    );
  },

  /** Heavy impact — destructive actions, modal confirmations */
  heavy(): void {
    safeHaptic(() =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    );
  },

  /** Success notification — set logged, plan saved, streak maintained */
  success(): void {
    safeHaptic(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },

  /** Warning notification — delete / destructive action confirmation */
  warning(): void {
    safeHaptic(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    );
  },

  /** Error notification — validation failure, network error */
  error(): void {
    safeHaptic(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    );
  },
};
