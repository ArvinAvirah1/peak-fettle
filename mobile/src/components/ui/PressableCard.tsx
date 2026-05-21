/**
 * PressableCard — animated pressable container with card-tap scale feedback.
 * Phase E — E-006: Motion & Haptics
 *
 * Wraps children in a Reanimated Pressable that scales to motion.cardTap.scale
 * (0.97) on press-in and springs back to 1.0 on press-out. Fires a light haptic
 * on each tap. Collapses all animation to identity when Reduce Motion is on.
 *
 * Usage (replaces TouchableOpacity on interactive cards):
 *   <PressableCard onPress={handlePress} style={cardStyle}>
 *     <Text>Card content</Text>
 *   </PressableCard>
 *
 *   // Disable haptic for non-navigational cards:
 *   <PressableCard onPress={handlePress} haptic={false}>…</PressableCard>
 */

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
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

  const tap = Gesture.Tap()
    .enabled(!disabled)
    .onBegin(() => {
      if (!reduceMotion) {
        scale.value = withTiming(motion.cardTap.scale, {
          duration: motion.cardTap.duration,
        });
      }
    })
    .onFinalize((_, success) => {
      scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      if (success && onPress) {
        if (haptic) haptics.light();
        onPress();
      }
    });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={[animatedStyle, style]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
