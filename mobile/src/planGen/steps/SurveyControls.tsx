/**
 * SurveyControls.tsx — shared, themed UI primitives for the plan-builder wizard.
 * =============================================================================
 * These mirror the conventions in app/training-survey.tsx (useTheme + tokens,
 * ✓ checkmarks, 44pt touch targets) so the new deep survey feels native to the
 * app. Kept in src/planGen/steps so the route file (app/plan-survey.tsx) stays
 * slim. No hardcoded colors — everything routes through useTheme().
 * =============================================================================
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../theme/tokens';

// ── Section header ───────────────────────────────────────────────────────

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );
}

// ── Single-select option card ────────────────────────────────────────────

export function OptionCard<T>({
  label,
  subtitle,
  value,
  selected,
  onPress,
}: {
  label: string;
  subtitle?: string;
  value: T;
  selected: boolean;
  onPress: (v: T) => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: selected ? theme.colors.accentDefault + '1A' : theme.colors.bgElevated,
          borderColor: selected ? theme.colors.accentDefault : theme.colors.borderDefault,
          borderWidth: selected ? 1.5 : 1,
        },
      ]}
      onPress={() => onPress(value)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label + (subtitle ? ': ' + subtitle : '')}
    >
      <View style={styles.optionLabelGroup}>
        <Text style={[styles.optionLabel, { color: theme.colors.textPrimary }]}>{label}</Text>
        {subtitle ? (
          <Text style={[styles.optionSubtitle, { color: theme.colors.textTertiary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {selected ? (
        <Text style={[styles.optionCheck, { color: theme.colors.accentDefault }]}>{'✓'}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ── Single-select chip (compact, e.g. days/week) ─────────────────────────

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accentDefault : theme.colors.bgElevated,
          borderColor: selected ? theme.colors.accentDefault : theme.colors.borderDefault,
        },
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.chipText,
          { color: selected ? theme.components.buttonPrimaryText : theme.colors.textSecondary },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Multi-select chip ────────────────────────────────────────────────────

export function MultiChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accentDefault + '22' : theme.colors.bgElevated,
          borderColor: selected ? theme.colors.accentDefault : theme.colors.borderDefault,
          borderWidth: selected ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected ? theme.colors.accentDefault : theme.colors.textSecondary,
            fontWeight: selected ? fontWeight.semibold : fontWeight.regular,
          },
        ]}
      >
        {selected ? `✓ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

// ── Numeric text field (kg 1RMs / bodyweight) ────────────────────────────

export function NumberField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  suffix,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  suffix?: string;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View
        style={[
          styles.inputRow,
          { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgElevated },
        ]}
      >
        <TextInput
          style={[styles.numberInput, { color: theme.colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="decimal-pad"
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={accessibilityLabel}
          maxLength={6}
        />
        {suffix ? (
          <Text style={[styles.inputSuffix, { color: theme.colors.textTertiary }]}>{suffix}</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Free-text field (date of birth) ──────────────────────────────────────

export function TextField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  maxLength,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  maxLength?: number;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View
        style={[
          styles.inputRow,
          { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgElevated },
        ]}
      >
        <TextInput
          style={[styles.numberInput, { color: theme.colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={accessibilityLabel}
          maxLength={maxLength}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Hint text ────────────────────────────────────────────────────────────

export function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
  const { theme } = useTheme();
  return <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>{children}</Text>;
}

// ── Progress dots (step N of M) ──────────────────────────────────────────

export function ProgressDots({ total, current }: { total: number; current: number }): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.dotsRow} accessibilityLabel={t('misc:surveyControls.stepOfTotal', { current: current + 1, total })}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i <= current ? theme.colors.accentDefault : theme.colors.borderDefault,
              width: i === current ? 22 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: { gap: spacing.s3 },
  sectionTitle: { fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold },
  sectionSubtitle: { fontSize: fontSize.bodySm, lineHeight: 20, marginTop: -spacing.s1 },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    minHeight: 52,
  },
  optionLabelGroup: { flex: 1, gap: 2 },
  optionLabel: { fontSize: fontSize.bodyMd },
  optionSubtitle: { fontSize: fontSize.caption, lineHeight: 16 },
  optionCheck: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.bold },

  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: fontSize.bodySm },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: spacing.s2,
    minHeight: 52,
  },
  numberInput: { flex: 1, fontSize: fontSize.bodyLg, fontWeight: fontWeight.medium, minHeight: 36 },
  inputSuffix: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium },

  hint: { fontSize: fontSize.caption, lineHeight: 18 },

  dotsRow: { flexDirection: 'row', gap: spacing.s2, alignItems: 'center' },
  dot: { height: 8, borderRadius: radius.full },
});
