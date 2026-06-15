/**
 * PressableCard — animated pressable container with card-tap scale feedback.
 * Phase E — E-006: Motion & Haptics
 *
 * Wraps children in a Pressable (react-native core) with a Reanimated animated
 * View wrapper that scales to motion.cardTap.scale (0.97) on press-in and
 * springs back to 1.0 on press-out. Fires a light haptic on each tap. Collapses
 * all animation to identity when Reduce Motion is on.
 *
 * Intentionally uses react-native Pressable rather than GestureDetector so the
 * component never requires a GestureHandlerRootView ancestor — any screen can
 * mount it safely.
 *
 * Usage (replaces TouchableOpacity on interactive cards):
 *   <PressableCard onPress={handlePress} style={cardStyle}>
 *     <Text>Card content</Text>
 *   </PressableCard>
 *
 *   // Disable haptic for non-navigational cards:
 *   <PressableCard onPress={handlePress} haptic={false}>…</PressableCard>
 */

import React, { useCallback } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../../theme/tokens';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { haptics } from '../../utils/haptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PressableCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  /** Additional style for the animated container */
  style?: StyleProp<ViewStyle>;
  /** Fire light haptic on tap. Defaults to true. */
  haptic?: boolean;
  /** Whether the card is interactive. Defaults to true. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PressableCard({
  children,
  onPress,
  style,
  haptic = true,
  disabled = false,
}: PressableCardProps): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (!reduceMotion) {
      scale.value = withTiming(motion.cardTap.scale, {
        duration: motion.cardTap.duration,
      });
    }
  }, [reduceMotion, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (haptic) haptics.light();
    onPress?.();
  }, [haptic, onPress]);

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Animated.View style={[animatedStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
