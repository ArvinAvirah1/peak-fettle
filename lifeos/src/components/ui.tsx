/**
 * Base UI kit — ScreenLayout, Card, PFButton, PFInput, SectionTitle, EmptyState.
 * Token-driven (no raw hex in screens), 44pt touch targets, pressed feedback
 * via opacity (no layout-shifting transforms) plus a subtle spring scale +
 * haptic on interactive primitives (TICKET-150 "Summit depth pass").
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { elevation, fontFamily, fontSize, gradientsFor, hairline, HIT_TARGET, radius, spacing } from '../theme/tokens';
import { haptic } from '../lib/haptics';
import { springs, FadeSlideIn } from './motion';
import { Ionicons } from './Icon';

// ---------------------------------------------------------------------------

export function ScreenLayout({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}): React.ReactElement {
  const { theme } = useTheme();
  const inner = padded ? { paddingHorizontal: spacing.s4, paddingBottom: spacing.s8 } : undefined;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------

export type CardVariant = 'elevated' | 'outlined' | 'gradient';

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  variant = 'outlined',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  variant?: CardVariant;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  const base: ViewStyle = {
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  };

  let variantStyle: ViewStyle;
  let gradientLayer: React.ReactNode = null;

  if (variant === 'elevated') {
    variantStyle = {
      backgroundColor: c.bgElevated,
      borderWidth: hairline,
      borderColor: c.borderDefault,
      ...elevation.low,
    };
  } else if (variant === 'gradient') {
    // Subtle two-stop "gradient" built from layered Views (no linear-gradient
    // dep installed) — a base fill plus a semi-transparent top-stop overlay,
    // both sourced from theme tokens so text contrast (AA) is preserved.
    const stops = gradientsFor(theme.name).surface;
    variantStyle = {
      backgroundColor: stops[1],
      overflow: 'hidden',
    };
    gradientLayer = (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '60%',
          backgroundColor: stops[0],
          opacity: 0.35,
        }}
      />
    );
  } else {
    // 'outlined' — DEFAULT, preserves today's exact look.
    variantStyle = {
      backgroundColor: c.bgSecondary,
      borderColor: c.borderDefault,
      borderWidth: 1,
    };
  }

  const composed = [base, variantStyle, style];

  if (!onPress) {
    return (
      <View style={composed}>
        {gradientLayer}
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      style={({ pressed }) => [...composed, { opacity: pressed ? 0.82 : 1 }]}
    >
      {gradientLayer}
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

export function SectionTitle({ children, top = spacing.s6 }: { children: string; top?: number }): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: theme.colors.textSecondary,
        fontFamily: fontFamily.semibold,
        fontSize: fontSize.bodySm,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        marginTop: top,
        marginBottom: spacing.s2,
      }}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------

export function PFButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bg =
    variant === 'primary' ? c.accentDefault : variant === 'destructive' ? c.statusError : 'transparent';
  const fg =
    variant === 'primary' || variant === 'destructive'
      ? c.textOnAccent
      : variant === 'secondary'
        ? c.textPrimary
        : c.textSecondary;

  const canInteract = !disabled && !loading;

  return (
    <Animated.View style={reducedMotion ? undefined : animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || loading }}
        disabled={disabled || loading}
        onPressIn={() => {
          if (!canInteract || reducedMotion) return;
          scale.value = withSpring(0.97, springs.press);
        }}
        onPressOut={() => {
          if (!canInteract || reducedMotion) return;
          scale.value = withSpring(1, springs.press);
        }}
        onPress={() => {
          if (canInteract) {
            if (variant === 'destructive') {
              haptic.warning();
            } else {
              haptic.impact('light');
            }
          }
          onPress();
        }}
        style={({ pressed }) => [
          {
            minHeight: HIT_TARGET + 4,
            borderRadius: radius.md,
            backgroundColor: pressed && variant === 'primary' ? c.accentPressed : bg,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: c.borderDefault,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            paddingHorizontal: spacing.s5,
            opacity: disabled || loading ? 0.45 : pressed ? 0.88 : 1,
          },
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={18} color={fg} style={{ marginRight: spacing.s2 }} /> : null}
            <Text style={{ color: fg, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>{label}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------

export function PFInput({
  label,
  error,
  helper,
  style,
  ...inputProps
}: TextInputProps & { label: string; error?: string | null; helper?: string }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ marginBottom: spacing.s4 }}>
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.medium,
          fontSize: fontSize.bodySm,
          marginBottom: spacing.s1,
        }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.textTertiary}
        style={[
          {
            minHeight: HIT_TARGET,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? c.statusError : c.borderDefault,
            backgroundColor: c.bgSecondary,
            color: c.textPrimary,
            paddingHorizontal: spacing.s3,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyMd,
          },
          style,
        ]}
        {...inputProps}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: c.statusError, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s1 }}
        >
          {error}
        </Text>
      ) : helper ? (
        <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s1 }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

export type EmptyStateIllustration = 'habits' | 'goals' | 'focus' | 'mood' | 'generic';

/**
 * Small decorative composition (~104pt) built only from token-colored Views —
 * no SVG, no images, no emoji. Purely decorative: hidden from a11y trees.
 */
function EmptyStateIllustrationView({ kind }: { kind: EmptyStateIllustration }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const SIZE = 104;

  const wrapProps = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  };

  if (kind === 'habits') {
    // Three stacked rounded bars, the top one "checked" with an accent dot.
    const barWidths = [SIZE * 0.9, SIZE * 0.72, SIZE * 0.56];
    return (
      <View {...wrapProps} style={{ width: SIZE, height: SIZE, justifyContent: 'center' }}>
        {barWidths.map((w, i) => (
          <View
            key={i}
            style={{
              width: w,
              height: 14,
              borderRadius: radius.sm,
              backgroundColor: i === 0 ? c.accentMuted : c.bgElevated,
              borderWidth: 1,
              borderColor: c.borderDefault,
              marginBottom: spacing.s2,
              alignSelf: 'center',
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {i === 0 ? (
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.full,
                  backgroundColor: c.accentDefault,
                  marginLeft: spacing.s2,
                }}
              />
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  if (kind === 'goals') {
    // Concentric rings with an accent core.
    return (
      <View {...wrapProps} style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: SIZE,
            height: SIZE,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: c.borderDefault,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: SIZE * 0.68,
            height: SIZE * 0.68,
            borderRadius: radius.full,
            borderWidth: 2,
            borderColor: c.accentMuted,
          }}
        />
        <View
          style={{
            width: SIZE * 0.34,
            height: SIZE * 0.34,
            borderRadius: radius.full,
            backgroundColor: c.accentDefault,
          }}
        />
      </View>
    );
  }

  if (kind === 'focus') {
    // A shield-ish rounded diamond with a hairline orbit ring.
    return (
      <View {...wrapProps} style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: SIZE * 0.86,
            height: SIZE * 0.86,
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: c.borderDefault,
            transform: [{ rotate: '20deg' }],
          }}
        />
        <View
          style={{
            width: SIZE * 0.5,
            height: SIZE * 0.5,
            borderRadius: radius.lg,
            backgroundColor: c.bgElevated,
            borderWidth: 2,
            borderColor: c.accentDefault,
            transform: [{ rotate: '45deg' }],
          }}
        />
      </View>
    );
  }

  if (kind === 'mood') {
    // A soft cluster of overlapping circles.
    return (
      <View {...wrapProps} style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: SIZE * 0.62,
            height: SIZE * 0.62,
            borderRadius: radius.full,
            backgroundColor: c.accentMuted,
            top: SIZE * 0.06,
            left: SIZE * 0.08,
          }}
        />
        <View
          style={{
            position: 'absolute',
            width: SIZE * 0.44,
            height: SIZE * 0.44,
            borderRadius: radius.full,
            backgroundColor: c.bgElevated,
            borderWidth: 1,
            borderColor: c.borderDefault,
            bottom: SIZE * 0.08,
            right: SIZE * 0.1,
          }}
        />
        <View
          style={{
            width: SIZE * 0.26,
            height: SIZE * 0.26,
            borderRadius: radius.full,
            backgroundColor: c.accentDefault,
          }}
        />
      </View>
    );
  }

  // 'generic' — overlapping rounded squares.
  return (
    <View {...wrapProps} style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: SIZE * 0.66,
          height: SIZE * 0.66,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.borderDefault,
          backgroundColor: c.bgElevated,
          transform: [{ rotate: '-8deg' }],
        }}
      />
      <View
        style={{
          width: SIZE * 0.5,
          height: SIZE * 0.5,
          borderRadius: radius.lg,
          backgroundColor: c.accentMuted,
          borderWidth: 1,
          borderColor: c.accentDefault,
          transform: [{ rotate: '10deg' }],
        }}
      />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  cta,
  onPress,
  illustration,
}: {
  icon: string;
  title: string;
  body: string;
  cta?: string;
  onPress?: () => void;
  illustration?: EmptyStateIllustration;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <FadeSlideIn style={{ alignItems: 'center', paddingVertical: spacing.s12, paddingHorizontal: spacing.s6 }}>
      {illustration ? (
        <EmptyStateIllustrationView kind={illustration} />
      ) : (
        <Ionicons name={icon} size={40} color={theme.colors.textTertiary} />
      )}
      <Text
        style={{
          color: theme.colors.textPrimary,
          fontFamily: fontFamily.semibold,
          fontSize: fontSize.heading3,
          marginTop: spacing.s4,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodyMd,
          marginTop: spacing.s2,
          textAlign: 'center',
          lineHeight: 24,
        }}
      >
        {body}
      </Text>
      {cta && onPress ? <PFButton label={cta} onPress={onPress} style={{ marginTop: spacing.s5, alignSelf: 'stretch' }} /> : null}
    </FadeSlideIn>
  );
}
