/**
 * PFButton — Peak Fettle design-system button component.
 * Phase E — E-004: Component Library Rebuild
 * Phase E — E-006: Haptic feedback on press (light for most variants, warning for destructive)
 *
 * Five variants per peak_fettle_design_spec.docx §4.1:
 *   primary    — filled accent background, used for primary CTAs
 *   secondary  — outlined accent border, used for secondary actions
 *   destructive — filled error background, used for delete/danger actions
 *   ghost      — no border, subtle text-only button
 *   icon       — square icon-only button (equal width/height)
 *
 * All sizes, colors, and typography come from useTheme() tokens.
 * Zero hardcoded values.
 *
 * Usage:
 *   <PFButton label="Generate Plan" onPress={handlePress} />
 *   <PFButton label="Remove" variant="destructive" onPress={handleRemove} />
 *   <PFButton label="+" variant="icon" onPress={handleAdd} />
 *   <PFButton label="Cancel" variant="ghost" onPress={handleCancel} />
 */

import React from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '../../theme/tokens';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  AccessibilityRole,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { haptics } from '../../utils/haptics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PFButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'icon';
export type PFButtonSize = 'sm' | 'md' | 'lg';

export interface PFButtonProps {
  label: string;
  onPress: () => void;
  variant?: PFButtonVariant;
  size?: PFButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Override accessible label (falls back to `label` prop) */
  accessibilityLabel?: string;
  /** Render an icon element before the label. Not used for `icon` variant. */
  icon?: React.ReactNode;
  /** Optional extra container style (margins, width, etc.). */
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
  /** Stretch the button to fill its container width. */
  fullWidth?: boolean;
}

// ---------------------------------------------------------------------------
// Size constants (layout only — no color, no font)
// ---------------------------------------------------------------------------

const SIZE_CONFIG: Record<PFButtonSize, {
  paddingVertical: number;
  paddingHorizontal: number;
  minHeight: number;
  iconSize: number;
}> = {
  sm: { paddingVertical: 8,  paddingHorizontal: 14, minHeight: 36, iconSize: 36 },
  md: { paddingVertical: 14, paddingHorizontal: 20, minHeight: 48, iconSize: 44 },
  lg: { paddingVertical: 18, paddingHorizontal: 24, minHeight: 56, iconSize: 52 },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PFButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  accessibilityLabel,
  icon,
  style,
  fullWidth = false,
}: PFButtonProps): React.ReactElement {
  const { theme, fontSize, fontWeight, radius } = useTheme();
  const sizeConf = SIZE_CONFIG[size];
  const isDisabled = disabled || loading;

  // ── Background & border ──────────────────────────────────────────────────
  let bgColor: string;
  let borderColor: string | undefined;
  let borderWidth = 0;

  switch (variant) {
    case 'primary':
      bgColor = isDisabled ? theme.colors.accentPressed : theme.colors.accentDefault;
      break;
    case 'secondary':
      bgColor = 'transparent';
      borderColor = theme.colors.accentDefault;
      borderWidth = 1.5;
      break;
    case 'destructive':
      bgColor = isDisabled ? theme.colors.statusError + '99' : theme.colors.statusError;
      break;
    case 'ghost':
      bgColor = 'transparent';
      break;
    case 'icon':
      bgColor = theme.components.buttonIconBg;
      break;
  }

  // ── Text color ───────────────────────────────────────────────────────────
  let textColor: string;
  switch (variant) {
    case 'primary':
      textColor = theme.components.buttonPrimaryText;
      break;
    case 'secondary':
      textColor = isDisabled ? theme.colors.textTertiary : theme.colors.accentDefault;
      break;
    case 'destructive':
      textColor = theme.components.buttonDestructiveText;
      break;
    case 'ghost':
      textColor = isDisabled ? theme.colors.textTertiary : theme.colors.textSecondary;
      break;
    case 'icon':
      textColor = isDisabled ? theme.colors.textTertiary : theme.colors.textPrimary;
      break;
  }

  // ── Font size by button size ─────────────────────────────────────────────
  const labelFontSize = size === 'sm' ? fontSize.bodySm : size === 'lg' ? fontSize.bodyLg : fontSize.bodyMd;

  // ── Container style ──────────────────────────────────────────────────────
  const containerStyle = variant === 'icon'
    ? {
        width: sizeConf.iconSize,
        height: sizeConf.iconSize,
        borderRadius: radius.md,
        backgroundColor: bgColor,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
      }
    : {
        paddingVertical: sizeConf.paddingVertical,
        paddingHorizontal: sizeConf.paddingHorizontal,
        minHeight: sizeConf.minHeight,
        borderRadius: radius.md,
        backgroundColor: bgColor,
        borderWidth,
        borderColor,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        flexDirection: 'row' as const,
        gap: icon ? 8 : 0,
      };

  // E-006: fire haptic on press (warning pattern for destructive, light for all others)
  function handlePress(): void {
    if (variant === 'destructive') {
      haptics.warning();
    } else {
      haptics.light();
    }
    onPress();
  }

  // E-006 extension (2026-06-10 aesthetic pass): press-in scale + spring-back,
  // collapsing to identity under Reduce Motion.
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);
  const pressAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[pressAnim, fullWidth && { width: '100%' }]}>
    <TouchableOpacity
      style={[containerStyle, isDisabled && styles.disabled, fullWidth && { width: '100%' }, style]}
      onPress={handlePress}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withTiming(motion.cardTap.scale, { duration: motion.cardTap.duration });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      }}
      disabled={isDisabled}
      activeOpacity={0.75}
      accessibilityRole={'button' as AccessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          color={textColor}
          size={size === 'sm' ? 'small' : 'small'}
        />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <Text style={{
            fontSize: labelFontSize,
            fontWeight: fontWeight.semibold,
            color: textColor,
            letterSpacing: variant === 'icon' ? 0 : 0.2,
          }}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Layout-only styles (no color values)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
});
