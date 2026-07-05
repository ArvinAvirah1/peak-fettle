/**
 * motion.tsx — the single shared motion vocabulary for Life OS.
 *
 * Every screen should reuse these helpers and `springs` rather than
 * hand-rolling durations/spring configs — that keeps the app feeling like
 * one coherent product instead of a pile of bespoke animations. Durations
 * come from `motion` in theme/tokens.ts (micro-interactions 150-300ms,
 * exits ~65% of enters); do not invent new magic numbers here or downstream.
 *
 * Reduce-motion contract (checked via `useReducedMotion()` from reanimated,
 * which is synchronous and reactive):
 *   - PressableScale: no scale transform; opacity dips to 0.85 while pressed.
 *   - FadeSlideIn: renders a plain View, no entering animation.
 *   - SpringReorder: renders a plain View, no layout transition.
 *   - Celebration: no particles at all; onDone fires immediately (via a
 *     JS timeout) and the component renders null so callers can show their
 *     own static badge instead (see T170).
 *
 * Exported API:
 *   - PressableScale  — spring scale-down on press, no layout shift.
 *   - FadeSlideIn     — entrance fade + slide up, staggered by index.
 *   - SpringReorder   — wraps a list row so position changes animate.
 *   - Celebration     — full-screen confetti burst overlay.
 *   - springs         — shared spring physics vocabulary (press/gentle/bouncy).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  WithSpringConfig,
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { motion } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Shared spring vocabulary
// ---------------------------------------------------------------------------

/** Shared spring configs so Wave 2 uses one physics vocabulary. */
export const springs: {
  press: WithSpringConfig;
  gentle: WithSpringConfig;
  bouncy: WithSpringConfig;
} = {
  // Snappy — for immediate press feedback.
  press: { damping: 18, stiffness: 380, mass: 0.7 },
  // Smooth — for reorder/layout transitions, no overshoot wobble.
  gentle: { damping: 20, stiffness: 180, mass: 1 },
  // Springy — for celebrations/badges where a little overshoot reads as fun.
  bouncy: { damping: 10, stiffness: 220, mass: 0.8 },
};

// ---------------------------------------------------------------------------
// PressableScale
// ---------------------------------------------------------------------------

/** Spring scale-down on press (no layout shift). Wraps Pressable. */
export function PressableScale(
  props: PressableProps & {
    children: React.ReactNode;
    scaleTo?: number;
    style?: StyleProp<ViewStyle>;
  },
): React.ReactElement {
  const { children, scaleTo = 0.97, style, onPressIn, onPressOut, ...rest } = props;
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pressedOpacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: pressedOpacity.value,
  }));

  useEffect(
    () => () => {
      cancelAnimation(scale);
      cancelAnimation(pressedOpacity);
    },
    [scale, pressedOpacity],
  );

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (reducedMotion) {
          pressedOpacity.value = withTiming(0.85, { duration: motion.microMs });
        } else {
          scale.value = withSpring(scaleTo, springs.press);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (reducedMotion) {
          pressedOpacity.value = withTiming(1, { duration: motion.microMs });
        } else {
          scale.value = withSpring(1, springs.press);
        }
        onPressOut?.(e);
      }}
      style={style}
    >
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// FadeSlideIn
// ---------------------------------------------------------------------------

/** Entrance: fade + slide up. index staggers by motion.staggerMs. */
export function FadeSlideIn({
  children,
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(motion.enterMs).delay(index * motion.staggerMs)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// SpringReorder
// ---------------------------------------------------------------------------

/** Wrap list rows so position changes animate with a spring layout transition. */
export function SpringReorder({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View
      layout={LinearTransition.springify()
        .damping(springs.gentle.damping ?? 20)
        .stiffness(springs.gentle.stiffness ?? 180)
        .mass(springs.gentle.mass ?? 1)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Celebration
// ---------------------------------------------------------------------------

const CELEBRATION_DURATION_MS = 1400;
const MAX_PARTICLES = 199;

function ConfettiParticle({
  index,
  screenWidth,
  screenHeight,
  colors,
}: {
  index: number;
  screenWidth: number;
  screenHeight: number;
  colors: string[];
}): React.ReactElement {
  // Deterministic pseudo-random spread derived from the index via
  // multiplicative hashing + trig — no random/clock APIs.
  const hash = Math.sin(index * 12.9898) * 43758.5453;
  const frac = hash - Math.floor(hash);
  const hash2 = Math.sin(index * 78.233 + 1.7) * 12543.112;
  const frac2 = hash2 - Math.floor(hash2);

  const startX = frac * screenWidth;
  const driftX = (frac2 - 0.5) * screenWidth * 0.6;
  const fallDistance = screenHeight * (0.55 + frac2 * 0.5);
  const size = 4 + Math.round((frac * 6) % 6);
  const isRound = index % 3 === 0;
  const rotateTo = 180 + frac2 * 540 * (index % 2 === 0 ? 1 : -1);
  const delay = Math.round((frac * 220) % 260);
  const color = colors[index % colors.length];

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, {
        duration: CELEBRATION_DURATION_MS - delay,
        easing: Easing.out(Easing.quad),
      }),
    );
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = progress.value * fallDistance;
    const translateX = progress.value * driftX;
    const rotate = progress.value * rotateTo;
    const opacity = 1 - Math.max(0, progress.value - 0.7) / 0.3;
    return {
      transform: [
        { translateX },
        { translateY },
        { rotate: `${rotate}deg` },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX,
          top: -size * 2,
          width: size,
          height: size * (isRound ? 1 : 1.6),
          borderRadius: isRound ? size / 2 : 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

/** Full-screen confetti burst overlay. Renders null when not running. */
export function Celebration({
  run,
  onDone,
  particleCount = 120,
}: {
  run: boolean;
  onDone?: () => void;
  particleCount?: number;
}): React.ReactElement | null {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = useMemo(
    () => [
      theme.colors.accentDefault,
      theme.colors.statusSuccess,
      theme.colors.accentPressed,
      theme.colors.textSecondary,
    ],
    [theme],
  );

  const count = Math.min(particleCount, MAX_PARTICLES);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!run) {
      setMounted(false);
      return;
    }

    if (reducedMotion) {
      setMounted(false);
      timeoutRef.current = setTimeout(() => {
        onDone?.();
      }, 0);
      return;
    }

    setMounted(true);
    timeoutRef.current = setTimeout(() => {
      setMounted(false);
      onDone?.();
    }, CELEBRATION_DURATION_MS + 120);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, reducedMotion]);

  if (!mounted) {
    return null;
  }

  const particles = Array.from({ length: count }, (_, i) => i);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        overflow: 'hidden',
      }}
    >
      {particles.map((i) => (
        <ConfettiParticle key={i} index={i} screenWidth={width} screenHeight={height} colors={colors} />
      ))}
    </View>
  );
}
