/**
 * DailyWeightCard — daily weight check-in (founder 2026-08-04).
 *
 * One component, mounted on BOTH the Home tab and the Health tab, so a weight
 * typed on either screen is the same write and both re-render off the same
 * localDb subscription (useDailyWeight watches `bodyweight_daily`).
 *
 * The card's job is to make the WEEKLY median self-computing: once the current
 * ISO week has DERIVED_MIN_SAMPLES readings, the median of those readings takes
 * over from the estimate the user used to type on the rankings card. The
 * progress line ("2 of 3 this week") exists to make that threshold legible —
 * otherwise the rankings card silently changing shape is unexplained.
 *
 * Weight handling follows CLAUDE.md §2: the typed value goes to the data layer
 * as (displayValue, unit) and is stored exactly; display comes back through
 * formatSetWeight / setWeightToInputValue. No conversion arithmetic here.
 *
 * Local-first: every read/write is on-device SQLite. No REST call on any tier.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius, a11y } from '../theme/tokens';
import { useDailyWeight } from '../hooks/useDailyWeight';
import { DERIVED_MIN_SAMPLES } from '../data/bodyweightDaily';
import {
  UnitSystem,
  formatSetWeight,
  formatWeight,
  kgToInputValue,
  parseWeightInput,
  setWeightToInputValue,
} from '../constants/units';

interface Props {
  unitPref: UnitSystem;
  /** Home tab renders the tighter variant (it already carries a lot of cards). */
  compact?: boolean;
  /** Fired after a weight is successfully saved. The in-logger prompt uses this
   *  to close itself, so saving doubles as "continue" and the user never has to
   *  tap Save and then dismiss. */
  onSaved?: () => void;
}

export function DailyWeightCard({
  unitPref,
  compact = false,
  onSaved,
}: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { today, weekCount, isDerivable, weekly, healthPrefill, isLoading, log } = useDailyWeight();
  const [value, setValue] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const unitLabel = unitPref === 'lbs' ? 'lbs' : 'kg';

  // The input's effective text: whatever the user has typed this session,
  // otherwise the exact stored entry when editing, otherwise the Health sample
  // offered as a starting point. `value === null` means "untouched".
  const inputValue = useMemo(() => {
    if (value !== null) return value;
    if (today && editing) return setWeightToInputValue(today, unitPref);
    if (!today && healthPrefill != null) return kgToInputValue(healthPrefill, unitPref);
    return '';
  }, [value, today, editing, healthPrefill, unitPref]);

  // Only call it a Health prefill while it is genuinely still the untouched
  // Health value — once the user types, the hint would be a lie.
  const showingHealthPrefill = value === null && !today && healthPrefill != null;

  if (isLoading) return null;

  const handleSave = async (): Promise<void> => {
    const num = parseWeightInput(inputValue);
    if (num == null || !(num > 0) || saving) return;
    setSaving(true);
    try {
      await log(num, unitPref);
      setValue(null);
      setEditing(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const showInput = !today || editing;
  const remaining = Math.max(0, DERIVED_MIN_SAMPLES - weekCount);

  // Progress line. Below the threshold it counts down to it; at or above it,
  // it reports the median that is now driving the rankings tier.
  const progressLine = isDerivable
    ? weekly?.source === 'derived' && weekly.weight_kg > 0
      ? t('components:dailyWeightCard.medianDerived', {
          value: formatWeight(weekly.weight_kg, unitPref, 1),
          count: weekly.sample_count ?? weekCount,
        })
      : t('components:dailyWeightCard.readingsThisWeek', { count: weekCount })
    : t('components:dailyWeightCard.needMore', { count: remaining });

  return (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
      ]}
    >
      <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>
        {t('components:dailyWeightCard.kicker')}
      </Text>

      {today && !editing ? (
        // ── Logged state: today's value + an explicit way back into editing ──
        <View style={styles.loggedRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.loggedValue, { color: theme.colors.textPrimary }]}>
              {formatSetWeight(today, unitPref)}
            </Text>
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t('components:dailyWeightCard.loggedToday')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={t('components:dailyWeightCard.editAccessibilityLabel')}
            style={styles.editBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.editLabel, { color: theme.colors.accentDefault }]}>
              {t('common:edit')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
            {t('components:dailyWeightCard.title')}
          </Text>
          {!compact ? (
            <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
              {t('components:dailyWeightCard.subtitle')}
            </Text>
          ) : null}
        </>
      )}

      {showInput ? (
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
            value={inputValue}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder={unitLabel}
            placeholderTextColor={theme.colors.textTertiary}
            accessibilityLabel={t('components:dailyWeightCard.inputAccessibilityLabel', {
              unit: unitLabel,
            })}
          />
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.colors.accentDefault }]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t('components:dailyWeightCard.saveAccessibilityLabel')}
          >
            <Text style={[styles.saveLabel, { color: theme.components.buttonPrimaryText }]}>
              {t('common:save')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showingHealthPrefill ? (
        <Text style={[styles.hint, { color: theme.colors.textTertiary }]}>
          {t('components:dailyWeightCard.healthPrefill')}
        </Text>
      ) : null}

      <Text style={[styles.progress, { color: theme.colors.textTertiary }]}>{progressLine}</Text>
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
  cardCompact: {
    padding: spacing.s3,
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
  },
  loggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loggedValue: {
    fontSize: fontSize.heading3,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  editBtn: {
    minHeight: a11y.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.s2,
  },
  editLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginTop: spacing.s3,
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
    minHeight: a11y.minTouchTarget,
  },
  saveLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
  },
  hint: {
    fontSize: fontSize.micro,
    marginTop: spacing.s2,
  },
  progress: {
    fontSize: fontSize.caption,
    marginTop: spacing.s3,
  },
});
