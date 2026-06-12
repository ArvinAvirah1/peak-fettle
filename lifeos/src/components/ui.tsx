/**
 * Base UI kit — ScreenLayout, Card, PFButton, PFInput, SectionTitle, EmptyState.
 * Token-driven (no raw hex in screens), 44pt touch targets, pressed feedback
 * via opacity (no layout-shifting transforms).
 */

import React from 'react';
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
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../theme/tokens';
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

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}): React.ReactElement {
  const { theme } = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.colors.bgSecondary,
    borderColor: theme.colors.borderDefault,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.82 : 1 }, style]}
    >
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
  const bg =
    variant === 'primary' ? c.accentDefault : variant === 'destructive' ? c.statusError : 'transparent';
  const fg =
    variant === 'primary' || variant === 'destructive'
      ? c.textOnAccent
      : variant === 'secondary'
        ? c.textPrimary
        : c.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
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

export function EmptyState({
  icon,
  title,
  body,
  cta,
  onPress,
}: {
  icon: string;
  title: string;
  body: string;
  cta?: string;
  onPress?: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.s12, paddingHorizontal: spacing.s6 }}>
      <Ionicons name={icon} size={40} color={theme.colors.textTertiary} />
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
    </View>
  );
}
