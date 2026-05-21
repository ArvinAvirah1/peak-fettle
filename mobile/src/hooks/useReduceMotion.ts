/**
 * useReduceMotion — Peak Fettle accessibility hook.
 * Phase E — E-006: Motion & Haptics
 *
 * Returns `true` when the OS "Reduce Motion" accessibility setting is active.
 *
 * Usage:
 *   const reduceMotion = useReduceMotion();
 *   const duration = reduceMotion ? motion.reducedMotion.duration : motion.percentileRing.duration;
 *
 * Implementation:
 *   - On mount, reads the current value from AccessibilityInfo.isReduceMotionEnabled()
 *   - Subscribes to the 'reduceMotionChanged' event for live updates
 *   - Falls back gracefully to false if AccessibilityInfo is unavailable
 *     (e.g., in test environments or web renderer)
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Read initial value
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));

    // Subscribe to changes (user toggles Setting mid-session)
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
