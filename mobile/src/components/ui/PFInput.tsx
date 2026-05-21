/**
 * PFInput — Peak Fettle design-system text input component.
 * Phase E — E-004: Component Library Rebuild
 *
 * Wraps React Native TextInput with:
 *   - Label (optional, renders above the input)
 *   - Error state (red border + error message below)
 *   - Focused state (accent border)
 *   - Disabled state (reduced opacity)
 *
 * All colors, spacing, and typography come from useTheme() tokens.
 * Zero hardcoded values.
 *
 * Usage:
 *   <PFInput
 *     label="Email"
 *     value={email}
 *     onChangeText={setEmail}
 *     placeholder="you@example.com"
 *     error={fieldErrors.email}
 *   />
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PFInputProps extends TextInputProps {
  /** Label rendered above the input. Omit to skip. */
  label?: string;
  /** Validation error string. Renders in red below input when provided. */
  error?: string;
  /** Hint text rendered below the input (when no error). */
  hint?: string;
  /** Disabled renders the input at reduced opacity and prevents interaction. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PFInput({
  label,
  error,
  hint,
  disabled = false,
  ...inputProps
}: PFInputProps): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  // Border color: error > focused > default
  const borderColor = error
    ? theme.components.inputBorderError
    : isFocused
      ? theme.components.inputBorderActive
      : theme.components.inputBorder;

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      {/* Label */}
      {label ? (
        <Text style={{
          fontSize: fontSize.bodySm,
          fontWeight: fontWeight.semibold,
          color: error ? theme.colors.statusError : theme.colors.textSecondary,
          marginBottom: spacing.s1,
        }}>
          {label}
        </Text>
      ) : null}

      {/* Input */}
      <TextInput
        style={{
          backgroundColor: theme.components.inputBg,
          borderColor,
          borderWidth: isFocused || error ? 1.5 : 1,
          borderRadius: radius.md,
          paddingHorizontal: spacing.s4,
          paddingVertical: spacing.s3 + 2,
          fontSize: fontSize.bodyMd,
          color: theme.components.inputText,
          minHeight: 48,
        }}
        placeholderTextColor={theme.components.inputPlaceholder}
        editable={!disabled}
        onFocus={(e) => {
          setIsFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          inputProps.onBlur?.(e);
        }}
        {...inputProps}
      />

      {/* Error message */}
      {error ? (
        <Text style={{
          fontSize: fontSize.bodySm,
          color: theme.colors.statusError,
          marginTop: spacing.s1,
        }}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={{
          fontSize: fontSize.caption,
          color: theme.colors.textTertiary,
          marginTop: spacing.s1,
        }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout-only styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  disabled: {
    opacity: 0.5,
  },
});
