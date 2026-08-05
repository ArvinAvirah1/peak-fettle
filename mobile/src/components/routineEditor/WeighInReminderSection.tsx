/**
 * WeighInReminderSection — per-routine daily weigh-in reminder (founder 2026-08-04).
 *
 * Rendered inside RoutineEditorSheet, which covers BOTH founder-requested entry
 * points: creating a routine on the Routines tab opens this same editor
 * immediately after the name prompt (see handleSave in app/(tabs)/routines.tsx),
 * so "set up" and "edit" are one surface — no duplicated config UI to drift.
 *
 * Two independent channels, per the founder's answer:
 *   • an in-logger prompt at session START or END (their choice), and/or
 *   • a repeating local notification on chosen weekdays at a chosen time.
 *
 * The time picker is hand-rolled from steppers ON PURPOSE: pulling in
 * @react-native-community/datetimepicker would be a NATIVE dependency and force
 * a full `eas build` for the whole feature (CLAUDE.md OTA section). Steppers
 * keep this JS-only and therefore OTA-shippable.
 *
 * This component is presentational — it owns no persistence. The editor holds
 * the draft and writes it through data/routineReminders.ts on save, so the
 * reminder lands in the same "Save routine" action as everything else rather
 * than committing behind the user's back.
 */

import React from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { stepperPalette, fontSize, spacing, radius, a11y } from '../../theme/tokens';
import { InAppTiming, RoutineReminder } from '../../data/routineReminders';

// English fallbacks; render sites translate. Index 0 = Sunday, matching the
// notify_days storage convention (and JS getDay()).
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_CHIPS = ['S', 'M', 'T', 'W', 'Th', 'F', 'S'];

function weekdayChip(i: number, t: TFunction): string {
  return t(`components:scheduleEditorSheet.weekdayChip.${WEEKDAY_KEYS[i]}`, {
    defaultValue: WEEKDAY_CHIPS[i],
  });
}
function weekdayName(i: number, t: TFunction): string {
  return t(`components:scheduleEditorSheet.weekdayName.${WEEKDAY_KEYS[i]}`, {
    defaultValue: WEEKDAY_CHIPS[i],
  });
}

/** 24h -> "6:30 PM". Local-format enough for a reminder row without pulling in
 *  a date library; hour/minute are already plain numbers in state. */
function formatTime(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

interface Props {
  value: RoutineReminder;
  onChange: (next: RoutineReminder) => void;
}

export function WeighInReminderSection({ value, onChange }: Props): React.ReactElement {
  const { t } = useTranslation();

  const patch = (partial: Partial<RoutineReminder>): void => onChange({ ...value, ...partial });

  const toggleDay = (day: number): void => {
    const has = value.notify_days.includes(day);
    const next = has
      ? value.notify_days.filter((d) => d !== day)
      : [...value.notify_days, day].sort((a, b) => a - b);
    patch({ notify_days: next });
  };

  // Hour wraps 0–23, minute steps in 5s and wraps 0–55 — a weigh-in reminder
  // never needs finer than 5-minute resolution, and wrapping avoids dead-end
  // taps at the ends of the range.
  const stepHour = (delta: number): void =>
    patch({ notify_hour: (value.notify_hour + delta + 24) % 24 });
  const stepMinute = (delta: number): void =>
    patch({ notify_minute: (value.notify_minute + delta * 5 + 60) % 60 });

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{t('components:weighInReminder.title')}</Text>
          <Text style={styles.rowSub}>{t('components:weighInReminder.subtitle')}</Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={(enabled) => patch({ enabled })}
          trackColor={{ false: stepperPalette.line, true: stepperPalette.accentSurface }}
          thumbColor={value.enabled ? stepperPalette.accent : stepperPalette.muted}
          accessibilityLabel={t('components:weighInReminder.toggleAccessibilityLabel')}
        />
      </View>

      {value.enabled ? (
        <>
          {/* ── In-app prompt timing ── */}
          <Text style={styles.label}>{t('components:weighInReminder.promptWhen')}</Text>
          <View style={styles.segmentRow}>
            {(['start', 'end'] as InAppTiming[]).map((timing) => {
              const selected = value.in_app_timing === timing;
              return (
                <TouchableOpacity
                  key={timing}
                  onPress={() => patch({ in_app_timing: timing })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: selected ? stepperPalette.accentSurface : 'transparent',
                      borderColor: selected ? stepperPalette.accentLine : stepperPalette.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: selected ? stepperPalette.accent : stepperPalette.muted },
                    ]}
                  >
                    {timing === 'start'
                      ? t('components:weighInReminder.atStart')
                      : t('components:weighInReminder.atEnd')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Optional scheduled notification ── */}
          <View style={[styles.row, styles.rowSpaced]}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t('components:weighInReminder.notifyTitle')}</Text>
              <Text style={styles.rowSub}>{t('components:weighInReminder.notifySubtitle')}</Text>
            </View>
            <Switch
              value={value.notify_enabled}
              onValueChange={(notify_enabled) => patch({ notify_enabled })}
              trackColor={{ false: stepperPalette.line, true: stepperPalette.accentSurface }}
              thumbColor={value.notify_enabled ? stepperPalette.accent : stepperPalette.muted}
              accessibilityLabel={t('components:weighInReminder.notifyToggleAccessibilityLabel')}
            />
          </View>

          {value.notify_enabled ? (
            <>
              <Text style={styles.label}>{t('components:weighInReminder.days')}</Text>
              <View style={styles.chipRow}>
                {WEEKDAY_CHIPS.map((_, i) => {
                  const selected = value.notify_days.includes(i);
                  return (
                    <TouchableOpacity
                      key={`${i}`}
                      onPress={() => toggleDay(i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={weekdayName(i, t)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? stepperPalette.accentSurface : 'transparent',
                          borderColor: selected ? stepperPalette.accentLine : stepperPalette.line,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          { color: selected ? stepperPalette.accent : stepperPalette.muted },
                        ]}
                      >
                        {weekdayChip(i, t)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('components:weighInReminder.time')}</Text>
              <View style={styles.timeRow}>
                <Stepper
                  label={t('components:weighInReminder.hour')}
                  onDown={() => stepHour(-1)}
                  onUp={() => stepHour(1)}
                />
                <Text style={styles.timeValue}>
                  {formatTime(value.notify_hour, value.notify_minute)}
                </Text>
                <Stepper
                  label={t('components:weighInReminder.minute')}
                  onDown={() => stepMinute(-1)}
                  onUp={() => stepMinute(1)}
                />
              </View>

              {value.notify_days.length === 0 ? (
                <Text style={styles.warn}>{t('components:weighInReminder.noDaysWarning')}</Text>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** −/+ pair for one time component. Kept local — nothing else needs it. */
function Stepper({
  label,
  onDown,
  onUp,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
}): React.ReactElement {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        onPress={onDown}
        style={styles.stepperBtn}
        accessibilityRole="button"
        accessibilityLabel={`${label} −`}
      >
        <Text style={styles.stepperLabel}>−</Text>
      </TouchableOpacity>
      <Text style={styles.stepperCaption}>{label}</Text>
      <TouchableOpacity
        onPress={onUp}
        style={styles.stepperBtn}
        accessibilityRole="button"
        accessibilityLabel={`${label} +`}
      >
        <Text style={styles.stepperLabel}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.lg,
    backgroundColor: stepperPalette.card,
    padding: spacing.s4,
    marginTop: spacing.s4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  rowSpaced: {
    marginTop: spacing.s4,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSize.bodyMd,
    fontWeight: '700',
    color: stepperPalette.text,
  },
  rowSub: {
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    marginTop: 2,
  },
  label: {
    fontSize: fontSize.micro,
    letterSpacing: 1.1,
    color: stepperPalette.muted,
    marginTop: spacing.s4,
    marginBottom: spacing.s2,
    textTransform: 'uppercase',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    minWidth: a11y.minTouchTarget,
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s2,
  },
  chipLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  timeValue: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.heading3,
    fontWeight: '700',
    color: stepperPalette.text,
    fontVariant: ['tabular-nums'],
  },
  stepper: {
    alignItems: 'center',
  },
  stepperBtn: {
    minWidth: a11y.minTouchTarget,
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
  },
  stepperLabel: {
    fontSize: fontSize.bodyLg,
    fontWeight: '700',
    color: stepperPalette.text,
  },
  stepperCaption: {
    fontSize: fontSize.micro,
    color: stepperPalette.muted,
    marginVertical: 2,
    textTransform: 'uppercase',
  },
  warn: {
    fontSize: fontSize.micro,
    color: stepperPalette.muted,
    marginTop: spacing.s3,
  },
});
