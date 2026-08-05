/**
 * BodyweightPromptCard — weekly median-weight check-in (founder 2026-06-10).
 *
 * Bodyweight guides the strength calculations, so users are prompted weekly
 * for their MEDIAN weight for the week. Renders nothing once this week's
 * entry exists. The tier ladder is gated on this data being fresh.
 *
 * v19 (founder 2026-08-04): manual entry is now the FALLBACK path, not the
 * primary one. Once the current ISO week has DERIVED_MIN_SAMPLES daily
 * check-ins (see data/bodyweightDaily.ts) the median is computed from those
 * readings and this card stops offering an input — a remembered estimate must
 * not be able to overwrite real measurements. In that state it collapses to a
 * one-line attribution so the number driving the tier ladder is still
 * explained rather than silently appearing.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { useBodyweight } from '../hooks/useBodyweight';
import { useDailyWeight } from '../hooks/useDailyWeight';
import { displayToKg, formatWeight, kgToLbs, UnitSystem } from '../constants/units';

interface Props {
  unitPref: UnitSystem;
}

export function BodyweightPromptCard({ unitPref }: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { latest, hasThisWeek, isLoading, log } = useBodyweight();
  // withHealthPrefill: false — this card only needs the week's reading COUNT to
  // decide manual-vs-derived; it has no daily input to prefill, so a HealthKit
  // query on every rankings mount would be pure waste.
  const { weekCount, isDerivable, isLoading: dailyLoading } = useDailyWeight({
    withHealthPrefill: false,
  });
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  if (isLoading || dailyLoading) return null;

  // Enough daily readings this week → the median is computed, not typed.
  // Show where it came from instead of an input the user must not use.
  if (isDerivable) {
    return latest ? (
      <View style={styles.derivedRow}>
        <Text style={[styles.derivedText, { color: theme.colors.textTertiary }]}>
          {t('components:bodyweightPromptCard.derivedFromDaily', {
            value: formatWeight(latest.weight_kg, unitPref, 1),
            count: latest.sample_count ?? weekCount,
          })}
        </Text>
      </View>
    ) : null;
  }

  if (hasThisWeek) return null;

  const unitLabel = unitPref === 'lbs' ? 'lb' : 'kg';
  const lastDisplay =
    latest != null
      ? `${(unitPref === 'lbs' ? kgToLbs(latest.weight_kg) : latest.weight_kg).toFixed(1)} ${unitLabel}`
      : null;

  const handleSave = async () => {
    const num = parseFloat(value);
    if (!(num > 0) || saving) return;
    setSaving(true);
    try {
      await log(displayToKg(num, unitPref));
    } finally {
      setSaving(false);
      setValue('');
    }
  };

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
      ]}
    >
      <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>{t('components:bodyweightPromptCard.kicker')}</Text>
      <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
        {t('components:bodyweightPromptCard.title')}
      </Text>
      <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
        {t('components:bodyweightPromptCard.subtitle')}
        {lastDisplay ? ` ${t('components:bodyweightPromptCard.lastLogged', { value: lastDisplay })}` : ''}
      </Text>
      <View style={styles.row}>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: theme.colors.bgPrimary,
              borderColor: theme.colors.borderDefault,
              color: theme.colors.textPrimary,
            },
          ]}
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder={unitLabel}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={t('components:bodyweightPromptCard.inputAccessibilityLabel', { unit: unitLabel })}
        />
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.colors.accentDefault }]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('components:bodyweightPromptCard.saveAccessibilityLabel')}
        >
          <Text style={[styles.saveLabel, { color: theme.components.buttonPrimaryText }]}>{t('common:save')}</Text>
        </TouchableOpacity>
      </View>
      {/* Points at the daily check-in so the user knows this estimate is
          replaceable by real readings rather than a permanent chore. */}
      <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
        {t('components:bodyweightPromptCard.dailyHint', { count: weekCount })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s4,
  },
  kicker: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: spacing.s1,
  },
  title: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  sub: {
    fontSize: fontSize.caption,
    marginTop: spacing.s1,
    marginBottom: spacing.s3,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s3,
    fontSize: fontSize.bodyMd,
  },
  saveBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.s5,
    justifyContent: 'center',
  },
  saveLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
  },
  hint: {
    fontSize: fontSize.micro,
    marginTop: spacing.s2,
  },
  derivedRow: {
    marginBottom: spacing.s3,
    paddingHorizontal: spacing.s1,
  },
  derivedText: {
    fontSize: fontSize.caption,
  },
});
