/**
 * GoalRing — circular goal-progress ring for the Health dashboard tab.
 *
 * Pure react-native-svg (Svg/Circle/G) driven by RN's `Animated.Value` +
 * listener, mirroring the proven ScoreDial/AnimatedArc pattern in
 * ReadinessCard.tsx (Animated.Circle isn't natively available, so the arc's
 * strokeDashoffset is snapshotted into component state via a listener rather
 * than reaching for Reanimated's useAnimatedProps, which has no existing
 * precedent in this codebase driving an SVG prop).
 *
 * Geometry: size×size viewBox, r = (size − strokeWidth) / 2, drawn inside a
 * <G rotation={-90} origin="{cx},{cy}"> so 0% starts at 12 o'clock and fills
 * clockwise. Progress is clamped to [0, 1] for the visual fill even when the
 * caller passes a value > 1 (met-but-over-100% state).
 *
 * Center label: value (line 1) + unit/goal-met caption (line 2), rendered as
 * plain <Text> absolutely positioned over the SVG — NOT inside the SVG — so
 * platform font rendering / tabular-nums / adjustsFontSizeToFit all work
 * exactly like everywhere else in the app.
 *
 * Accessibility: the wrapping View carries accessibilityRole="progressbar" +
 * accessibilityValue; the SVG itself is hidden from the accessibility tree
 * (importantForAccessibility="no-hide-descendants") so VoiceOver reads the
 * wrapper's label once instead of diving into vector paths.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated as RNAnimated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { motion } from '../../theme/tokens';
import { Ionicons } from '../Icon';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GoalRingProps {
  /** Outer SVG size (both width and height), in points. */
  size: number;
  /** Ring stroke width, in points. */
  strokeWidth: number;
  /** Progress fraction (value / goal). May exceed 1 — visual fill clamps at 1.0. */
  pct: number;
  /** Ring fill color (theme token resolved by the caller). */
  color: string;
  /** Ring track color (theme token resolved by the caller). */
  trackColor: string;
  /** Center line-1 value text, e.g. "8,432" or "—". */
  label: string;
  /** Center line-2 caption, e.g. "steps" — hidden when `met` is true (a checkmark renders instead). */
  sublabel: string;
  /** Whether the goal is met (value >= goal) — swaps the center caption for a checkmark + accent value color. */
  met: boolean;
  /** Accessibility label, e.g. "Steps: 8,432 of 10,000". */
  accessibilityLabel: string;
  /** Accessibility value bounds. */
  accessibilityNow: number;
  accessibilityMax: number;
}

// Reanimated isn't used here (see file header) — RN's Animated.Value is
// driven with useNativeDriver:false because SVG stroke props can't use the
// native driver, exactly like ReadinessCard's ScoreDial.
const AnimatedAccessor = RNAnimated;

export function GoalRing({
  size,
  strokeWidth,
  pct,
  color,
  trackColor,
  label,
  sublabel,
  met,
  accessibilityLabel,
  accessibilityNow,
  accessibilityMax,
}: GoalRingProps): React.ReactElement {
  const { theme, fontSize, fontWeight } = useTheme();
  const reduceMotion = useReduceMotion();

  const clamped = Math.min(1, Math.max(0, pct));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const animVal = useRef(new AnimatedAccessor.Value(reduceMotion ? clamped : 0)).current;
  const [dashOffset, setDashOffset] = useState(circumference * (1 - (reduceMotion ? clamped : 0)));

  useEffect(() => {
    if (reduceMotion) {
      animVal.setValue(clamped);
      setDashOffset(circumference * (1 - clamped));
      return;
    }
    const anim = RNAnimated.timing(animVal, {
      toValue: clamped,
      duration: motion.percentileRing.duration,
      useNativeDriver: false, // SVG stroke props cannot use the native driver
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, reduceMotion]);

  useEffect(() => {
    const id = animVal.addListener(({ value }) => {
      setDashOffset(circumference * (1 - Math.min(1, Math.max(0, value))));
    });
    return () => animVal.removeListener(id);
  }, [animVal, circumference]);

  const valueColor = met ? color : theme.colors.textPrimary;

  return (
    <View
      style={styles.column}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: accessibilityMax, now: accessibilityNow }}
    >
      <View style={{ width: size, height: size }}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Circle cx={cx} cy={cy} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          <G rotation={-90} origin={`${cx}, ${cy}`}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={dashOffset}
            />
          </G>
        </Svg>

        {/* Center label — absolute-fill over the SVG */}
        <View style={StyleSheet.absoluteFillObject}>
          <View style={styles.centerContent}>
            <Text
              style={[
                styles.value,
                {
                  fontSize: fontSize.bodyMd,
                  fontWeight: fontWeight.bold,
                  color: valueColor,
                  fontVariant: ['tabular-nums'],
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {label}
            </Text>
            {met ? (
              <Ionicons name="checkmark-circle" size={14} color={color} style={styles.metIcon} />
            ) : (
              <Text
                style={[styles.sublabel, { fontSize: fontSize.micro, color: theme.colors.textTertiary }]}
                numberOfLines={1}
              >
                {sublabel}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout-only styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  column: {
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  value: {
    textAlign: 'center',
  },
  sublabel: {
    textAlign: 'center',
    marginTop: 1,
  },
  metIcon: {
    marginTop: 2,
  },
});
