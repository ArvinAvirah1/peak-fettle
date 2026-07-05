/**
 * MomentumRing (TICKET-164) — Today's hero: a streak-weighted momentum ring
 * with the big percentage numeral at its center and a streak chip below.
 *
 * Same SVG ring technique as unlock.tsx / HoldTheDot.tsx (Circle +
 * strokeDasharray/strokeDashoffset, round linecap, track = borderDefault,
 * fill = accentDefault). At percent >= 1 the fill switches to statusSuccess
 * so a fully-done morning reads as an unambiguous win — but the numeral +
 * caption are ALWAYS rendered too (color is never the only signal).
 *
 * The ring's fill sweep animates in with reanimated withTiming on mount,
 * gated by useReducedMotion (reduced motion = static, no animation).
 */

import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import { Ionicons } from '../Icon';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 176;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const CENTER = SIZE / 2;
const RING_ANIM_MS = 700;

export function MomentumRing({
  percent,
  doneCount,
  dueCount,
  streak,
  size = SIZE,
}: {
  /** 0..1 */
  percent: number;
  doneCount: number;
  dueCount: number;
  streak: number;
  size?: number;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();

  const clamped = Number.isFinite(percent) ? Math.max(0, Math.min(1, percent)) : 0;
  const isComplete = dueCount > 0 && clamped >= 1;
  const ringColor = isComplete ? c.statusSuccess : c.accentDefault;

  const scale = size / SIZE;
  const r = R;
  const circ = CIRC;
  const center = CENTER;
  const strokeWidth = STROKE;

  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = clamped;
      return;
    }
    progress.value = withTiming(clamped, {
      duration: RING_ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circ * (1 - progress.value),
  }));

  const pct = Math.round(clamped * 100);
  const streakLabel = streak > 0 ? `${streak}-day streak` : 'Start your streak today';

  return (
    <View
      accessible
      accessibilityLabel={`Momentum ${pct} percent. ${doneCount} of ${dueCount} habits done today. ${streakLabel}.`}
      style={{ alignItems: 'center', marginTop: spacing.s2, marginBottom: spacing.s2 }}
    >
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ scale }] }}>
          <Circle cx={center} cy={center} r={r} stroke={c.borderDefault} strokeWidth={strokeWidth} fill="none" />
          <AnimatedCircle
            cx={center}
            cy={center}
            r={r}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            animatedProps={reducedMotion ? undefined : animatedProps}
            strokeDashoffset={reducedMotion ? circ * (1 - clamped) : undefined}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <Text
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.display,
            fontVariant: ['tabular-nums'],
          }}
        >
          {pct}%
        </Text>
        <Text
          style={{
            color: c.textSecondary,
            fontFamily: fontFamily.medium,
            fontSize: fontSize.bodySm,
            fontVariant: ['tabular-nums'],
            marginTop: spacing.s1,
          }}
        >
          {doneCount} of {dueCount} today
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: spacing.s3,
          paddingHorizontal: spacing.s3,
          paddingVertical: spacing.s1,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: c.borderDefault,
          backgroundColor: c.bgElevated,
        }}
      >
        <Ionicons name="flame-outline" size={16} color={c.accentDefault} />
        <Text
          style={{
            color: c.textSecondary,
            fontFamily: fontFamily.medium,
            fontSize: fontSize.bodySm,
            marginLeft: spacing.s1,
            fontVariant: ['tabular-nums'],
          }}
        >
          {streakLabel}
        </Text>
      </View>
    </View>
  );
}
