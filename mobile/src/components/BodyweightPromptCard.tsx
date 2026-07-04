/**
 * BodyweightPromptCard — weekly median-weight check-in (founder 2026-06-10).
 *
 * Bodyweight guides the strength calculations, so users are prompted weekly
 * for their MEDIAN weight for the week. Renders nothing once this week's
 * entry exists. The tier ladder is gated on this data being fresh.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { useBodyweight } from '../hooks/useBodyweight';
import { displayToKg, kgToLbs, UnitSystem } from '../constants/units';

interface Props {
  unitPref: UnitSystem;
}

export function BodyweightPromptCard({ unitPref }: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { latest, hasThisWeek, isLoading, log } = useBodyweight();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  if (isLoading || hasThisWeek) return null;

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
});
