/**
 * PercentileBar — animated horizontal progress bar for a percentile value.
 *
 * Props:
 *   percentile  — 0–100; the fill width is this percentage of the track
 *   height      — bar height in px (default 8)
 *
 * Animation: fill slides in from 0 → percentile% over 600 ms with an
 * ease-out curve on mount. Uses React Native's built-in Animated API — no
 * external library required.
 *
 * Color coding (matches spec):
 *   ≥75  → green  #22c55e
 *   40–74 → amber  #f59e0b
 *   <40  → red    #ef4444
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentileColor(percentile: number): string {
  if (percentile >= 75) return '#22c55e';
  if (percentile >= 40) return '#f59e0b';
  return '#ef4444';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PercentileBarProps {
  percentile: number; // 0–100
  height?: number;
}

export function PercentileBar({
  percentile,
  height = 8,
}: PercentileBarProps): React.ReactElement {
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Clamp to [0, 100] defensively in case of upstream data issues.
    const target = Math.min(100, Math.max(0, percentile));
    Animated.timing(animatedWidth, {
      toValue: target,
      duration: 600,
      useNativeDriver: false, // width is a layout property — cannot use native driver
    }).start();
  }, [percentile, animatedWidth]);

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
      style={[styles.track, { height }]}
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
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 99,
  },
});
