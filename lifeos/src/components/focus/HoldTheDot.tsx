/**
 * HoldTheDot (TICKET-162) — one intervention option for the unlock gate
 * phase. Press-and-hold a large dot for 10 cumulative seconds. Releasing
 * pauses progress (forgiving — never resets to zero). Mirrors
 * BreathingGate's prop shape: { onComplete }.
 *
 * Progress is shown two ways (never color-only): a filling ring
 * (react-native-svg Circle strokeDashoffset, same technique as unlock.tsx's
 * wait ring) and a tabular-nums numeric seconds counter.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import { haptic } from '../../lib/haptics';
import { springs } from '../motion';

const HOLD_SECONDS = 10;
const TICK_MS = 100;
const DOT_SIZE = 132; // ≥120pt visual per spec
const R = 62;
const CIRC = 2 * Math.PI * R;

export function HoldTheDot({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();

  const [heldMs, setHeldMs] = useState(0);
  const [pressing, setPressing] = useState(false);
  const completedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scale = useSharedValue(1);

  const clearTimer = (): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (heldMs >= HOLD_SECONDS * 1000 && !completedRef.current) {
      completedRef.current = true;
      clearTimer();
      haptic.success();
      setTimeout(onComplete, 0);
    }
  }, [heldMs, onComplete]);

  const startHold = (): void => {
    if (completedRef.current) return;
    haptic.impact('light');
    setPressing(true);
    if (!reducedMotion) scale.value = withSpring(1.04, springs.press);
    clearTimer();
    intervalRef.current = setInterval(() => {
      setHeldMs((ms) => Math.min(HOLD_SECONDS * 1000, ms + TICK_MS));
    }, TICK_MS);
  };

  const pauseHold = (): void => {
    setPressing(false);
    if (!reducedMotion) scale.value = withSpring(1, springs.press);
    clearTimer();
    // Forgiving: progress is left exactly where it is, never reset.
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const secondsRemaining = Math.ceil((HOLD_SECONDS * 1000 - heldMs) / 1000);
  const progress = heldMs / (HOLD_SECONDS * 1000);

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.s6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Press and hold the dot. ${secondsRemaining} seconds remaining`}
        onPressIn={startHold}
        onPressOut={pauseHold}
        style={{ width: DOT_SIZE, height: DOT_SIZE, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width={DOT_SIZE} height={DOT_SIZE} style={{ position: 'absolute' }}>
          <Circle
            cx={DOT_SIZE / 2}
            cy={DOT_SIZE / 2}
            r={R}
            stroke={c.borderDefault}
            strokeWidth={8}
            fill="none"
          />
          <Circle
            cx={DOT_SIZE / 2}
            cy={DOT_SIZE / 2}
            r={R}
            stroke={c.accentDefault}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={CIRC * (1 - progress)}
            transform={`rotate(-90 ${DOT_SIZE / 2} ${DOT_SIZE / 2})`}
          />
        </Svg>
        <Animated.View
          style={[
            {
              width: DOT_SIZE * 0.62,
              height: DOT_SIZE * 0.62,
              borderRadius: (DOT_SIZE * 0.62) / 2,
              backgroundColor: pressing ? c.accentDefault : c.accentMuted,
              borderWidth: 2,
              borderColor: c.accentDefault,
            },
            reducedMotion ? undefined : animatedStyle,
          ]}
        />
      </Pressable>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: c.textPrimary,
          fontFamily: fontFamily.bold,
          fontSize: fontSize.heading2,
          fontVariant: ['tabular-nums'],
          marginTop: spacing.s5,
        }}
      >
        {secondsRemaining}s
      </Text>
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodySm,
          marginTop: spacing.s1,
          textAlign: 'center',
          paddingHorizontal: spacing.s6,
        }}
      >
        {pressing ? 'Keep holding…' : heldMs > 0 ? 'Paused — press and hold to keep going.' : 'Press and hold the dot for 10 seconds.'}
      </Text>
    </View>
  );
}
