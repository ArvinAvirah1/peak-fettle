/**
 * Backdate Workout screen — log a session for a PAST date (2026-07-14).
 *
 * For workouts done without the phone (forgot it / deliberately left it in the
 * locker): pick the day it happened, add exercises + the sets performed, save.
 * Persistence is tier-branched in src/data/backdateWorkout.ts (local-first for
 * free, POST /workouts + /sets with `loggedAt` for Pro) — this screen is
 * tier-agnostic.
 *
 * Navigated to via router.push('/backdate-workout') (Workout History header
 * CTA) or router.push('/backdate-workout?date=YYYY-MM-DD') (empty day view).
 * Registered in _layout.tsx as name="backdate-workout".
 *
 * The calendar is a small pure-JS month grid (NO native date-picker dependency
 * — this screen must stay OTA-shippable). Today and future days are disabled:
 * today's training belongs in the live logger.
 *
 * v1 scope: strength (lift) sets — weight × reps per set. Cardio backdating is
 * deliberately out (duration/distance entry is a different form).
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Ionicons } from '../src/components/Icon';
import { ScreenLayout } from '../src/components/ui';
import { ExercisePicker } from '../src/components/ExercisePicker';
import { useTheme } from '../src/theme/ThemeContext';
import { fontFamily, fontSize, spacing, radius } from '../src/theme/tokens';
import { useAuth } from '../src/hooks/useAuth';
import {
  logBackdatedWorkout,
  BackdateError,
  BackdateSetEntry,
} from '../src/data/backdateWorkout';
import {
  displayToKg,
  displayToCenti,
  parseWeightInput,
  UnitSystem,
} from '../src/constants/units';
import { Exercise } from '../src/types/api';

// ---------------------------------------------------------------------------
// Date helpers (local-time, YYYY-MM-DD keys — same convention as the hooks)
// ---------------------------------------------------------------------------

function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isValidPastDayKey(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return v < toDayKey(new Date());
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDayKey(d);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** Weeks (Mon-first) covering the given month; null = padding cell. */
function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // 0 = Monday
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------------------------------------------------------------------
// Form state shapes
// ---------------------------------------------------------------------------

interface DraftSet {
  weight: string; // display-unit text as typed
  reps: string;
}

interface DraftExercise {
  exerciseId: string;
  name: string;
  sets: DraftSet[];
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BackdateWorkoutScreen(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const unitPref: UnitSystem = user?.unit_pref === 'lbs' ? 'lbs' : 'kg';
  const unitLabel = unitPref === 'lbs' ? 'lbs' : 'kg';

  const params = useLocalSearchParams<{ date?: string }>();
  const todayKey = useMemo(() => toDayKey(new Date()), []);

  // ── Date state ─────────────────────────────────────────────────────────────
  const [dayKey, setDayKey] = useState<string>(() =>
    isValidPastDayKey(params.date) ? params.date : yesterdayKey(),
  );
  const [viewYm, setViewYm] = useState<{ year: number; month: number }>(() => {
    const [y, m] = dayKey.split('-').map(Number);
    return { year: y ?? new Date().getFullYear(), month: (m ?? 1) - 1 };
  });

  // ── Exercises / sets state ─────────────────────────────────────────────────
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Calendar handlers ──────────────────────────────────────────────────────
  const weeks = useMemo(
    () => monthGrid(viewYm.year, viewYm.month),
    [viewYm],
  );

  const shiftMonth = useCallback((delta: number) => {
    setViewYm((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const keyForCell = useCallback(
    (day: number) => toDayKey(new Date(viewYm.year, viewYm.month, day)),
    [viewYm],
  );

  // Next month is pointless once the visible month contains today.
  const canGoForward =
    viewYm.year < new Date().getFullYear() ||
    (viewYm.year === new Date().getFullYear() && viewYm.month < new Date().getMonth());

  // ── Exercise / set handlers ────────────────────────────────────────────────
  const handleExercisePicked = useCallback((exercise: Exercise) => {
    setPickerVisible(false);
    if (exercise.category === 'cardio') {
      Alert.alert(
        t('screens2:backdateWorkout.liftsOnlyTitle'),
        t('screens2:backdateWorkout.liftsOnlyBody'),
      );
      return;
    }
    setExercises((prev) => [
      ...prev,
      { exerciseId: exercise.id, name: exercise.name, sets: [{ weight: '', reps: '' }] },
    ]);
  }, [t]);

  const updateSet = useCallback(
    (exIdx: number, setIdx: number, field: keyof DraftSet, value: string) => {
      setExercises((prev) =>
        prev.map((ex, i) =>
          i !== exIdx
            ? ex
            : {
                ...ex,
                sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, [field]: value })),
              },
        ),
      );
    },
    [],
  );

  const addSetRow = useCallback((exIdx: number) => {
    setExercises((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        // Prefill the new row's weight from the previous row — the common case
        // is straight sets at one working weight.
        const last = ex.sets[ex.sets.length - 1];
        return { ...ex, sets: [...ex.sets, { weight: last?.weight ?? '', reps: '' }] };
      }),
    );
  }, []);

  const removeSetRow = useCallback((exIdx: number, setIdx: number) => {
    setExercises((prev) =>
      prev
        .map((ex, i) =>
          i !== exIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIdx) },
        )
        .filter((ex) => ex.sets.length > 0),
    );
  }, []);

  const removeExercise = useCallback((exIdx: number) => {
    setExercises((prev) => prev.filter((_, i) => i !== exIdx));
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const completeEntries = useMemo(() => {
    const entries: BackdateSetEntry[] = [];
    for (const ex of exercises) {
      for (const s of ex.sets) {
        const weightDisplay = parseWeightInput(s.weight);
        const reps = parseInt(s.reps, 10);
        if (weightDisplay == null || weightDisplay < 0) continue;
        if (!Number.isFinite(reps) || reps < 1) continue;
        entries.push({
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          reps,
          weightKg: displayToKg(weightDisplay, unitPref),
          weightCenti: displayToCenti(weightDisplay),
          weightUnit: unitPref,
        });
      }
    }
    return entries;
  }, [exercises, unitPref]);

  const handleSave = useCallback(async () => {
    if (saving || completeEntries.length === 0) return;
    setSaving(true);
    try {
      await logBackdatedWorkout(user, userId, dayKey, null, completeEntries);
      Alert.alert(
        t('screens2:backdateWorkout.savedTitle'),
        t('screens2:backdateWorkout.savedBody', {
          count: completeEntries.length,
          date: dayKey,
        }),
        [{ text: t('screens2:backdateWorkout.done'), onPress: () => router.back() }],
      );
    } catch (err) {
      if (err instanceof BackdateError) {
        Alert.alert(t('screens2:backdateWorkout.partialTitle'), err.message);
      } else {
        Alert.alert(
          t('screens2:backdateWorkout.errorTitle'),
          err instanceof Error ? err.message : t('screens2:backdateWorkout.errorBody'),
        );
      }
    } finally {
      setSaving(false);
    }
  }, [saving, completeEntries, user, userId, dayKey, router, t]);

  const saveDisabled = saving || completeEntries.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ScreenLayout scrollable keyboardAvoiding edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: c.textSecondary }]}>
          {t('screens2:backdateWorkout.intro')}
        </Text>

        {/* ── Calendar card ───────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
          <View style={styles.calHeader}>
            <TouchableOpacity
              onPress={() => shiftMonth(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('screens2:backdateWorkout.prevMonth')}
            >
              <Ionicons name="chevron-back" size={18} color={c.accentDefault} />
            </TouchableOpacity>
            <Text style={[styles.calTitle, { color: c.textPrimary }]}>
              {MONTH_NAMES[viewYm.month]} {viewYm.year}
            </Text>
            <TouchableOpacity
              onPress={() => shiftMonth(1)}
              disabled={!canGoForward}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('screens2:backdateWorkout.nextMonth')}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={canGoForward ? c.accentDefault : c.textTertiary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.calWeekRow}>
            {WEEKDAY_HEADERS.map((w, i) => (
              <Text key={`${w}-${i}`} style={[styles.calWeekday, { color: c.textTertiary }]}>
                {w}
              </Text>
            ))}
          </View>

          {weeks.map((week, wi) => (
            <View key={wi} style={styles.calWeekRow}>
              {week.map((day, di) => {
                if (day == null) {
                  return <View key={di} style={styles.calCell} />;
                }
                const cellKey = keyForCell(day);
                const disabled = cellKey >= todayKey;
                const selected = cellKey === dayKey;
                return (
                  <TouchableOpacity
                    key={di}
                    style={[
                      styles.calCell,
                      selected && { backgroundColor: c.accentDefault, borderRadius: radius.md },
                    ]}
                    disabled={disabled}
                    onPress={() => setDayKey(cellKey)}
                    accessibilityRole="button"
                    accessibilityLabel={cellKey}
                    accessibilityState={{ selected, disabled }}
                  >
                    <Text
                      style={[
                        styles.calDay,
                        {
                          color: disabled
                            ? c.textTertiary
                            : selected
                              ? theme.components.buttonPrimaryText
                              : c.textPrimary,
                        },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* ── Exercises ───────────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('screens2:backdateWorkout.exercisesSection')}
        </Text>

        {exercises.length === 0 ? (
          <Text style={[styles.emptyHint, { color: c.textSecondary }]}>
            {t('screens2:backdateWorkout.noExercisesHint')}
          </Text>
        ) : (
          exercises.map((ex, exIdx) => (
            <View
              key={`${ex.exerciseId}-${exIdx}`}
              style={[styles.card, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}
            >
              <View style={styles.exerciseHeader}>
                <Text style={[styles.exerciseName, { color: c.textPrimary }]} numberOfLines={1}>
                  {ex.name}
                </Text>
                <TouchableOpacity
                  onPress={() => removeExercise(exIdx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('screens2:backdateWorkout.removeExercise', { name: ex.name })}
                >
                  <Ionicons name="trash-outline" size={18} color={c.textTertiary} />
                </TouchableOpacity>
              </View>

              {ex.sets.map((s, setIdx) => (
                <View key={setIdx} style={styles.setRow}>
                  <Text style={[styles.setOrdinal, { color: c.textTertiary }]}>{setIdx + 1}</Text>
                  <TextInput
                    style={[styles.setInput, { color: c.textPrimary, borderColor: c.borderDefault, backgroundColor: c.bgTertiary }]}
                    value={s.weight}
                    onChangeText={(v) => updateSet(exIdx, setIdx, 'weight', v)}
                    placeholder={unitLabel}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="decimal-pad"
                    accessibilityLabel={t('screens2:backdateWorkout.weightInput', { n: setIdx + 1 })}
                  />
                  <Text style={[styles.setTimes, { color: c.textTertiary }]}>×</Text>
                  <TextInput
                    style={[styles.setInput, { color: c.textPrimary, borderColor: c.borderDefault, backgroundColor: c.bgTertiary }]}
                    value={s.reps}
                    onChangeText={(v) => updateSet(exIdx, setIdx, 'reps', v)}
                    placeholder={t('screens2:backdateWorkout.repsPlaceholder')}
                    placeholderTextColor={c.textTertiary}
                    keyboardType="number-pad"
                    accessibilityLabel={t('screens2:backdateWorkout.repsInput', { n: setIdx + 1 })}
                  />
                  <TouchableOpacity
                    onPress={() => removeSetRow(exIdx, setIdx)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('screens2:backdateWorkout.removeSet', { n: setIdx + 1 })}
                  >
                    <Ionicons name="close" size={16} color={c.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={styles.addSetBtn}
                onPress={() => addSetRow(exIdx)}
                accessibilityRole="button"
                accessibilityLabel={t('screens2:backdateWorkout.addSet')}
              >
                <Ionicons name="add" size={14} color={c.accentDefault} />
                <Text style={[styles.addSetLabel, { color: c.accentDefault }]}>
                  {t('screens2:backdateWorkout.addSet')}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <TouchableOpacity
          style={[styles.addExerciseBtn, { borderColor: c.accentDefault }]}
          onPress={() => setPickerVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('screens2:backdateWorkout.addExercise')}
        >
          <Ionicons name="add" size={16} color={c.accentDefault} />
          <Text style={[styles.addExerciseLabel, { color: c.accentDefault }]}>
            {t('screens2:backdateWorkout.addExercise')}
          </Text>
        </TouchableOpacity>

        {/* ── Save ────────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: c.accentDefault },
            saveDisabled && styles.saveBtnDisabled,
          ]}
          onPress={handleSave}
          disabled={saveDisabled}
          accessibilityRole="button"
          accessibilityLabel={t('screens2:backdateWorkout.save')}
        >
          <Text style={[styles.saveLabel, { color: theme.components.buttonPrimaryText }]}>
            {saving
              ? t('screens2:backdateWorkout.saving')
              : t('screens2:backdateWorkout.saveFor', { date: dayKey, count: completeEntries.length })}
          </Text>
        </TouchableOpacity>
        <View style={styles.bottomSpacer} />
      </ScrollView>

      <ExercisePicker
        visible={pickerVisible}
        onSelect={handleExercisePicked}
        onClose={() => setPickerVisible(false)}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles (colors injected inline from theme — tokens only here)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  intro: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    marginTop: spacing.s3,
    marginBottom: spacing.s4,
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s4,
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  calTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
  },
  calCell: {
    flex: 1,
    aspectRatio: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDay: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.s3,
  },
  emptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    marginBottom: spacing.s4,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  exerciseName: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    flexShrink: 1,
    marginRight: spacing.s3,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s2,
    gap: spacing.s2,
  },
  setOrdinal: {
    width: 18,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
    fontVariant: ['tabular-nums'],
  },
  setInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
  },
  setTimes: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.s1,
    gap: 4,
  },
  addSetLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: spacing.s3,
    marginBottom: spacing.s5,
    gap: 4,
  },
  addExerciseLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },
  saveBtn: {
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.s4,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
  },
  bottomSpacer: { height: spacing.s8 },
});
