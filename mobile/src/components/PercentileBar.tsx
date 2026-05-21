/**
 * PercentileBar — animated horizontal progress bar for a percentile value.
 *
 * E-001 update: migrated all hardcoded hex values to semantic tokens via useTheme().
 * E-006 update: duration now reads from motion.percentileRing token; respects
 *               OS Reduce Motion setting via useReduceMotion() (collapses to 0 ms).
 *
 * Props:
 *   percentile  — 0–100; the fill width is this percentage of the track
 *   height      — bar height in px (default 6; spec §5.5)
 *
 * Animation: fill slides in from 0 → percentile% over motion.percentileRing.duration
 * (800 ms) with an ease-out curve on mount. Collapses to instant when Reduce Motion
 * is enabled. Uses React Native's built-in Animated API — no external library required.
 *
 * Color coding (spec §6.7):
 *   ≥75  → statusSuccess (green)
 *   ≥50  → accentDefault (teal)
 *   <50  → default (subdued)
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { motion } from '../theme/tokens';
import { useReduceMotion } from '../hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PercentileBarProps {
  percentile: number; // 0–100
  height?: number;
}

export function PercentileBar({
  percentile,
  height = 6,
}: PercentileBarProps): React.ReactElement {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Clamp to [0, 100] defensively in case of upstream data issues.
    const target = Math.min(100, Math.max(0, percentile));

    // E-006: use motion token duration; collapse to 0 when Reduce Motion is on.
    const duration = reduceMotion
      ? motion.reducedMotion.duration
      : motion.percentileRing.duration;

    Animated.timing(animatedWidth, {
      toValue: target,
      duration,
      useNativeDriver: false, // width is a layout property — cannot use native driver
    }).start();
  }, [percentile, animatedWidth, reduceMotion]);

  // Color coding per spec §6.7 using semantic tokens:
  //   ≥75 → green | ≥50 → teal accent | <50 → default accent (subdued)
  function percentileColor(p: number): string {
    if (p >= 75) return theme.colors.statusSuccess;
    if (p >= 50) return theme.colors.accentDefault;
    return theme.colors.accentSecondary;
  }

  const fillColor = percentileColor(percentile);

  // Interpolate the animated 0–100 value into a "0%"–"100%" string so the
  // fill view stretches relative to its parent track.
  const widthInterpolated = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[
        styles.track,
        { height, backgroundColor: theme.colors.bgTertiary, borderRadius: theme.components.cardBorderRadius / 4 },
      ]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percentile }}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            width: widthInterpolated,
            height,
            backgroundColor: fillColor,
            borderRadius: theme.components.cardBorderRadius / 4,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    // borderRadius applied inline from theme tokens
  },
});
