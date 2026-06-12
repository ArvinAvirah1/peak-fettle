/**
 * BreathingGate (TICKET-104, Q19) — one guided breath cycle set before the
 * wait timer on escalated unlock attempts. Reduced-motion fallback is a
 * textual count (no scaling circle). Always interruptible: the parent keeps
 * its "Never mind" escape visible.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../theme/tokens';

const PHASES = [
  { label: 'Breathe in', seconds: 4 },
  { label: 'Hold', seconds: 4 },
  { label: 'Breathe out', seconds: 6 },
] as const;
const CYCLES = 3;

export function BreathingGate({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(PHASES[0].seconds);
  const completedRef = useRef(false);

  const scale = useSharedValue(0.6);

  useEffect(() => {
    if (reducedMotion) return;
    // in (grow 4s) → hold (4s) → out (shrink 6s), repeated
    scale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 4000 }),
        withTiming(0.6, { duration: 6000, easing: Easing.in(Easing.quad) })
      ),
      CYCLES,
      false
    );
  }, [reducedMotion, scale]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        // advance phase
        setPhaseIndex((p) => {
          const nextPhase = (p + 1) % PHASES.length;
          if (nextPhase === 0) {
            setCycle((cy) => {
              const nextCycle = cy + 1;
              if (nextCycle >= CYCLES && !completedRef.current) {
                completedRef.current = true;
                setTimeout(onComplete, 0);
              }
              return nextCycle;
            });
          }
          return nextPhase;
        });
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onComplete]);

  // re-seed seconds when phase changes
  useEffect(() => {
    setSecondsLeft(PHASES[phaseIndex].seconds);
  }, [phaseIndex]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.s6 }}>
      {!reducedMotion ? (
        <Animated.View
          style={[
            {
              width: 140,
              height: 140,
              borderRadius: 70,
              backgroundColor: c.accentMuted,
              borderWidth: 2,
              borderColor: c.accentDefault,
            },
            circleStyle,
          ]}
        />
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: c.textPrimary,
          fontFamily: fontFamily.semibold,
          fontSize: fontSize.heading3,
          marginTop: spacing.s5,
        }}
      >
        {PHASES[phaseIndex].label}
      </Text>
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodyMd,
          marginTop: spacing.s1,
          fontVariant: ['tabular-nums'],
        }}
      >
        {secondsLeft}s · cycle {Math.min(cycle + 1, CYCLES)} of {CYCLES}
      </Text>
    </View>
  );
}
