/**
 * ScheduleEditorSheet — TICKET-097 (Phase 1) + Schedule-builder redesign (2026-06-13)
 *
 * Full-screen editor for a training split. Two modes:
 *   • Weekly ("Day of week") — assign a routine (or rest) to each weekday.
 *   • Cycle  ("Repeating cycle") — a repeating "train N, rest M" rhythm, with a
 *              routine assignable per training slot. Same-type days (Push A /
 *              Push B) map to DIFFERENT routines (just distinct routineIds).
 *
 * Redesign (all 14 options):
 *   1  Safe-area header — SafeAreaView edges top+bottom; close/title/Save clear
 *      of the status bar and the home indicator.
 *   2  No infinite spinner — content renders immediately; a ≤1s skeleton covers
 *      the (now-fast) local read, then content; load never blocks the UI.
 *   3  Segmented control with an animated thumb for the two modes.
 *   4  Day-of-week chips — 7 round toggle chips (S M T W Th F S), ≥44pt.
 *   5  Repeating-cycle stepper ("Train N days, rest M") with a live preview.
 *   6  Routine-per-slot picker; "Rest" is a first-class option.
 *   7  Live 2-week preview grid that updates as you edit.
 *   8  Sticky Save bar — disabled until valid, with a reason.
 *   9  Time-of-day + optional reminder toggle.
 *   10 Confirm-on-dismiss when there are unsaved changes.
 *   11 Slide-in modal motion (animationType="slide").
 *   12 First-time explainer (one muted line on first open).
 *   13 Inline validation near the control, not a silent dead Save.
 *   14 Local-first persistence — saveSchedule writes the on-device `schedule`
 *      table for free (local-first) users; Pro keeps its existing behaviour
 *      (the schedule store is local for both tiers today — see src/data/schedule.ts).
 *
 * Persists via src/data/schedule.ts. Widgets (Phase 2) read the same store.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, spacing, radius } from '../theme/tokens';
import { useReduceMotion } from '../hooks/useReduceMotion';
import {
  Schedule,
  ScheduleMode,
  ScheduleSlot,
  emptySchedule,
  loadSchedule,
  saveSchedule,
} from '../data/schedule';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

interface RoutineLite { id: string; name: string; }

interface Props {
  visible: boolean;
  routines: RoutineLite[];
  onClose: () => void;
  onSaved: (schedule: Schedule) => void;
}

// Full names for the weekly rows / picker context; chip labels are separate so
// Thursday reads "Th" (distinct from Tuesday "T"). English fallback arrays —
// render sites translate via weekdayName()/weekdayChip() below.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_CHIPS = ['S', 'M', 'T', 'W', 'Th', 'F', 'S']; // option 4 — exact labels
const FIRST_OPEN_KEY = '@peak_fettle/schedule_editor_seen';

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Pure lookups called only from this file's own render — take `t` per the
 * render-site translation rule. */
function weekdayName(i: number, t: TFunction): string {
  return t(`components:scheduleEditorSheet.weekdayName.${WEEKDAY_KEYS[i]}`, { defaultValue: WEEKDAYS[i] });
}
function weekdayChip(i: number, t: TFunction): string {
  return t(`components:scheduleEditorSheet.weekdayChip.${WEEKDAY_KEYS[i]}`, { defaultValue: WEEKDAY_CHIPS[i] });
}

type PickerTarget =
  | { kind: 'cycle'; index: number }
  | { kind: 'weekly'; weekday: number }
  | null;

// A cell in the 2-week preview grid (option 7).
interface PreviewCell { label: string; routineName: string | null; isRest: boolean; isToday: boolean; }

export default function ScheduleEditorSheet({ visible, routines, onClose, onSaved }: Props): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<Schedule>(() => emptySchedule('weekly'));
  const [skeleton, setSkeleton] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [dirty, setDirty] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  // Cycle-builder inputs (option 5). Derived into draft.cycle on change/save.
  const [trainDays, setTrainDays] = useState(3);
  const [restDays, setRestDays] = useState(1);
  // Per-train-slot routine assignments for cycle mode (length === trainDays).
  const [cycleRoutines, setCycleRoutines] = useState<(ScheduleSlot | null)[]>([null, null, null]);
  const [showValidation, setShowValidation] = useState(false);

  // ── Load (option 2: never block; ≤1s skeleton, then content) ────────────────
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // Render the editor immediately. Show a light skeleton only while the local
    // read is in flight, and force it down within 1s so a slow/hung read can
    // never leave an infinite spinner (the localDb deadlock is fixed; this is
    // belt-and-braces per option 2).
    setSkeleton(true);
    setDirty(false);
    setShowValidation(false);
    const safety = setTimeout(() => { if (!cancelled) setSkeleton(false); }, 1000);

    loadSchedule()
      .then((s) => {
        if (cancelled) return;
        const initial = s ?? emptySchedule('weekly');
        setDraft(initial);
        hydrateCycleInputs(initial);
      })
      .catch(() => { /* fall back to the empty draft already in state */ })
      .finally(() => { if (!cancelled) { clearTimeout(safety); setSkeleton(false); } });

    // First-time explainer (option 12)
    AsyncStorage.getItem(FIRST_OPEN_KEY)
      .then((seen) => { if (!cancelled) setShowExplainer(seen == null); })
      .catch(() => { if (!cancelled) setShowExplainer(true); });

    return () => { cancelled = true; clearTimeout(safety); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Derive the train/rest stepper inputs from a loaded cycle schedule so a saved
  // cycle re-opens with the same N/M and per-slot routines.
  const hydrateCycleInputs = useCallback((s: Schedule) => {
    if (s.mode !== 'cycle' || s.cycle.length === 0) {
      setTrainDays(3);
      setRestDays(1);
      setCycleRoutines([null, null, null]);
      return;
    }
    const leadingTrain: ScheduleSlot[] = [];
    let i = 0;
    while (i < s.cycle.length && s.cycle[i]?.routineId) { leadingTrain.push(s.cycle[i] as ScheduleSlot); i++; }
    let rest = 0;
    while (i < s.cycle.length && !s.cycle[i]?.routineId) { rest++; i++; }
    const t = Math.max(1, leadingTrain.length || 1);
    setTrainDays(t);
    setRestDays(rest);
    const slots: (ScheduleSlot | null)[] = [];
    for (let k = 0; k < t; k++) slots.push(leadingTrain[k] ?? null);
    setCycleRoutines(slots);
  }, []);

  // Keep cycleRoutines length in sync with trainDays.
  useEffect(() => {
    setCycleRoutines((prev) => {
      if (prev.length === trainDays) return prev;
      const next = prev.slice(0, trainDays);
      while (next.length < trainDays) next.push(null);
      return next;
    });
  }, [trainDays]);

  // ── Mutators (all flip `dirty` for the confirm-on-dismiss guard) ────────────
  const markDirty = useCallback(() => setDirty(true), []);

  const setMode = useCallback((mode: ScheduleMode) => {
    setDraft((d) => (d.mode === mode ? d : { ...d, mode }));
    setShowValidation(false);
    markDirty();
  }, [markDirty]);

  const toggleWeekday = useCallback((i: number) => {
    setDraft((d) => {
      const weekly = d.weekly.slice();
      // Toggle between "unset" and a placeholder training slot. Assigning a
      // routine is a second step via the row picker below.
      weekly[i] = weekly[i] ? null : { routineId: null };
      return { ...d, weekly };
    });
    markDirty();
  }, [markDirty]);

  // Max days for each leg and for the total cycle.
  const MAX_CYCLE = 14;
  // Refs mirror the state values so the cross-leg cap can read the sibling value
  // synchronously without a stale closure.
  const trainDaysRef = useRef(trainDays);
  const restDaysRef = useRef(restDays);
  useEffect(() => { trainDaysRef.current = trainDays; }, [trainDays]);
  useEffect(() => { restDaysRef.current = restDays; }, [restDays]);

  const adjustTrain = useCallback((delta: number) => {
    setTrainDays((n) => {
      const maxAllowed = Math.min(MAX_CYCLE, MAX_CYCLE - restDaysRef.current);
      return Math.max(1, Math.min(maxAllowed, n + delta));
    });
    markDirty();
  }, [markDirty]);
  const adjustRest = useCallback((delta: number) => {
    setRestDays((r) => {
      const maxAllowed = Math.min(MAX_CYCLE, MAX_CYCLE - trainDaysRef.current);
      return Math.max(0, Math.min(maxAllowed, r + delta));
    });
    markDirty();
  }, [markDirty]);

  // ── Picker apply (option 6) ─────────────────────────────────────────────────
  const applyPick = useCallback((slot: ScheduleSlot | null) => {
    if (!picker) { setPicker(null); return; }
    if (picker.kind === 'cycle') {
      setCycleRoutines((prev) => {
        const next = prev.slice();
        next[picker.index] = slot;
        return next;
      });
    } else {
      setDraft((d) => {
        const weekly = d.weekly.slice();
        weekly[picker.weekday] = slot;
        return { ...d, weekly };
      });
    }
    setShowValidation(false);
    markDirty();
    setPicker(null);
  }, [picker, markDirty]);

  // ── Time of day + reminder (option 9) ───────────────────────────────────────
  const adjustTime = useCallback((field: 'h' | 'm', delta: number) => {
    setDraft((d) => {
      const parts = (d.timeOfDay ?? '07:00').split(':');
      let h = parseInt(parts[0] ?? '7', 10) || 0;
      let m = parseInt(parts[1] ?? '0', 10) || 0;
      if (field === 'h') h = (h + delta + 24) % 24;
      else m = (m + delta + 60) % 60;
      const timeOfDay = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      return { ...d, timeOfDay };
    });
    markDirty();
  }, [markDirty]);
  const setReminder = useCallback((on: boolean) => {
    setDraft((d) => ({
      ...d,
      reminderEnabled: on,
      // Enabling a reminder without a time defaults to a sensible morning slot.
      timeOfDay: on && !d.timeOfDay ? '07:00' : d.timeOfDay,
    }));
    markDirty();
  }, [markDirty]);

  // ── Compose the cycle from the stepper + per-slot routines ──────────────────
  const buildCycleSlots = useCallback((): ScheduleSlot[] => {
    const slots: ScheduleSlot[] = [];
    for (let k = 0; k < trainDays; k++) slots.push(cycleRoutines[k] ?? { routineId: null });
    for (let k = 0; k < restDays; k++) slots.push({ routineId: null });
    return slots;
  }, [trainDays, restDays, cycleRoutines]);

  // ── Validation (option 8 + 13) ──────────────────────────────────────────────
  const validation = useMemo<{ valid: boolean; reason: string | null }>(() => {
    if (draft.mode === 'weekly') {
      const hasTrainingDay = draft.weekly.some((s) => s && s.routineId);
      const hasSelected = draft.weekly.some((s) => s != null);
      if (!hasSelected) return { valid: false, reason: t('components:scheduleEditorSheet.pickAtLeastOneDay') };
      if (!hasTrainingDay) return { valid: false, reason: t('components:scheduleEditorSheet.assignRoutineToAtLeastOneDay') };
      return { valid: true, reason: null };
    }
    // cycle
    const assigned = cycleRoutines.slice(0, trainDays).filter((s) => s && s.routineId).length;
    if (assigned === 0) return { valid: false, reason: t('components:scheduleEditorSheet.assignRoutineToAtLeastOneTrainingDay') };
    return { valid: true, reason: null };
  }, [draft.mode, draft.weekly, cycleRoutines, trainDays, t]);

  // ── 2-week preview grid (option 7) ──────────────────────────────────────────
  const preview = useMemo<PreviewCell[]>(() => {
    const cells: PreviewCell[] = [];
    const now = new Date();
    const todayIdx = now.getDay();
    if (draft.mode === 'weekly') {
      for (let day = 0; day < 14; day++) {
        const dow = (todayIdx + day) % 7;
        const slot = draft.weekly[dow] ?? null;
        cells.push({
          label: weekdayChip(dow, t) ?? '',
          routineName: slot?.routineId ? (slot.routineName ?? t('components:scheduleEditorSheet.routineFallback')) : null,
          isRest: !slot || !slot.routineId,
          isToday: day === 0,
        });
      }
    } else {
      const loop = buildCycleSlots();
      for (let day = 0; day < 14; day++) {
        const slot = loop.length > 0 ? loop[day % loop.length] : null;
        cells.push({
          label: `D${day + 1}`,
          routineName: slot?.routineId ? (slot.routineName ?? t('components:scheduleEditorSheet.routineFallback')) : null,
          isRest: !slot || !slot.routineId,
          isToday: day === 0,
        });
      }
    }
    return cells;
  }, [draft.mode, draft.weekly, buildCycleSlots, t]);

  // ── Save (option 14 — local-first store via saveSchedule) ───────────────────
  const handleSave = useCallback(async () => {
    if (!validation.valid) { setShowValidation(true); return; }
    setSaving(true);
    try {
      const toSave: Schedule =
        draft.mode === 'cycle'
          ? { ...draft, cycle: buildCycleSlots(), position: 0 }
          : draft;
      await saveSchedule(toSave);
      setDirty(false);
      onSaved(toSave);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [validation.valid, draft, buildCycleSlots, onSaved, onClose]);

  // ── Dismiss with unsaved-changes confirm (option 10) ────────────────────────
  const requestClose = useCallback(() => {
    if (!dirty) { onClose(); return; }
    Alert.alert(
      t('components:scheduleEditorSheet.discardChangesTitle'),
      t('components:scheduleEditorSheet.discardChangesBody'),
      [
        { text: t('components:scheduleEditorSheet.keepEditing'), style: 'cancel' },
        { text: t('components:scheduleEditorSheet.discard'), style: 'destructive', onPress: () => { setDirty(false); onClose(); } },
      ],
      { cancelable: true },
    );
  }, [dirty, onClose, t]);

  const dismissExplainer = useCallback(() => {
    setShowExplainer(false);
    AsyncStorage.setItem(FIRST_OPEN_KEY, '1').catch(() => { /* non-fatal */ });
  }, []);

  // ── Segmented thumb animation (option 3) ────────────────────────────────────
  const SEG_OPTIONS: { mode: ScheduleMode; label: string }[] = [
    { mode: 'weekly', label: t('components:scheduleEditorSheet.dayOfWeek') },
    { mode: 'cycle', label: t('components:scheduleEditorSheet.repeatingCycle') },
  ];
  const activeSegIndex = draft.mode === 'weekly' ? 0 : 1;
  const thumbAnim = useRef(new Animated.Value(activeSegIndex)).current;
  const [segWidth, setSegWidth] = useState(0);
  useEffect(() => {
    if (reduceMotion) { thumbAnim.setValue(activeSegIndex); return; }
    Animated.timing(thumbAnim, {
      toValue: activeSegIndex,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [activeSegIndex, reduceMotion, thumbAnim]);
  const thumbTranslate = thumbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segWidth / 2],
  });

  const timeLabel = useMemo(() => {
    const parts = (draft.timeOfDay ?? '07:00').split(':');
    const h = parseInt(parts[0] ?? '7', 10) || 0;
    const m = parseInt(parts[1] ?? '0', 10) || 0;
    const ampm = h >= 12 ? t('components:scheduleEditorSheet.pm') : t('components:scheduleEditorSheet.am');
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }, [draft.timeOfDay, t]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={requestClose} presentationStyle="fullScreen">
      {/* Option 1 — safe-area root; header sits below the status bar, sticky bar above the home indicator */}
      <SafeAreaView style={[styles.root, { backgroundColor: c.bgPrimary }]} edges={['top', 'bottom']}>
        {/* Header — explicit paddingTop so the close/save buttons clear the Dynamic Island */}
        <View style={[styles.header, { borderBottomColor: c.borderDefault, paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel={t('components:scheduleEditorSheet.closeAccessibilityLabel')}
            style={styles.headerIconBtn}
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={c.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary, fontWeight: fontWeight.bold }]} numberOfLines={1}>
            {t('components:scheduleEditorSheet.trainingSchedule')}
          </Text>
          {/* Header Save is a quiet mirror of the sticky bar; primary CTA is the sticky bar */}
          <View style={styles.headerIconBtn} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.s4, paddingBottom: spacing.s8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Option 12 — first-time explainer (one muted line) */}
          {showExplainer ? (
            <Pressable
              onPress={dismissExplainer}
              accessibilityRole="button"
              accessibilityLabel={t('components:scheduleEditorSheet.dismissTipAccessibilityLabel')}
              style={[styles.explainer, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}
            >
              <Ionicons name="information-circle-outline" size={16} color={c.textTertiary} />
              <Text style={{ color: c.textTertiary, fontSize: fontSize.caption, flex: 1 }}>
                {t('components:scheduleEditorSheet.explainerBody')}
              </Text>
            </Pressable>
          ) : null}

          {/* Option 3 — segmented control with animated thumb */}
          <View
            style={[styles.segment, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}
            onLayout={(e) => setSegWidth(e.nativeEvent.layout.width - 8 /* track padding */)}
            accessibilityRole="tablist"
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.segThumb,
                {
                  backgroundColor: c.accentDefault,
                  width: segWidth > 0 ? segWidth / 2 : '50%',
                  transform: [{ translateX: thumbTranslate }],
                },
              ]}
            />
            {SEG_OPTIONS.map((opt) => {
              const active = draft.mode === opt.mode;
              return (
                <TouchableOpacity
                  key={opt.mode}
                  onPress={() => setMode(opt.mode)}
                  style={styles.segBtn}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                >
                  <Text
                    style={{
                      color: active ? theme.components.buttonPrimaryText : c.textSecondary,
                      fontWeight: fontWeight.semibold,
                      fontSize: fontSize.bodySm,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Body — skeleton (option 2) or content */}
          {skeleton ? (
            <View style={styles.skeletonWrap}>
              {[0, 1, 2].map((k) => (
                <View key={k} style={[styles.skeletonRow, { backgroundColor: c.bgSecondary }]} />
              ))}
            </View>
          ) : draft.mode === 'weekly' ? (
            <>
              {/* Option 4 — day-of-week chips */}
              <Text style={[styles.sectionLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold }]}>
                {t('components:scheduleEditorSheet.trainingDays')}
              </Text>
              <View style={styles.chipRow}>
                {WEEKDAY_CHIPS.map((_, i) => {
                  const selected = draft.weekly[i] != null;
                  const chipLabel = weekdayChip(i, t);
                  return (
                    <TouchableOpacity
                      key={`${chipLabel}-${i}`}
                      onPress={() => toggleWeekday(i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={selected ? t('components:scheduleEditorSheet.weekdaySelectedAccessibilityLabel', { name: weekdayName(i, t) }) : weekdayName(i, t)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: selected ? c.accentSecondary : 'transparent',
                          borderColor: selected ? c.accentDefault : c.borderDefault,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? c.accentDefault : c.textSecondary,
                          fontWeight: fontWeight.semibold,
                          fontSize: fontSize.bodySm,
                        }}
                      >
                        {chipLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* Option 13 — inline validation near the control */}
              {showValidation && !validation.valid ? (
                <Text style={[styles.inlineError, { color: c.statusError }]}>{validation.reason}</Text>
              ) : null}

              {/* Option 6 — routine-per-day picker for selected days */}
              {draft.weekly.some((s) => s != null) ? (
                <>
                  <Text style={[styles.sectionLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold, marginTop: spacing.s4 }]}>
                    {t('components:scheduleEditorSheet.assignRoutines')}
                  </Text>
                  {WEEKDAYS.map((_, i) => {
                    const slot = draft.weekly[i] ?? null;
                    if (slot == null) return null;
                    const wd = weekdayName(i, t);
                    return (
                      <View key={wd} style={[styles.slotRow, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                        <Text style={{ color: c.textSecondary, fontSize: fontSize.bodySm, width: 92 }}>{wd}</Text>
                        <Pressable
                          onPress={() => setPicker({ kind: 'weekly', weekday: i })}
                          style={styles.slotPick}
                          accessibilityRole="button"
                          accessibilityLabel={t('components:scheduleEditorSheet.assignDayAccessibilityLabel', { day: wd })}
                        >
                          <Text style={{ color: slot.routineId ? c.textPrimary : c.textTertiary, fontSize: fontSize.bodySm }} numberOfLines={1}>
                            {slot.routineId ? (slot.routineName ?? t('components:scheduleEditorSheet.routineFallback')) : t('components:scheduleEditorSheet.tapToChooseRoutine')}
                          </Text>
                        </Pressable>
                        <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
                      </View>
                    );
                  })}
                </>
              ) : null}
            </>
          ) : (
            <>
              {/* Option 5 — repeating-cycle stepper */}
              <Text style={[styles.sectionLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold }]}>
                {t('components:scheduleEditorSheet.rhythm')}
              </Text>
              <View style={[styles.stepperCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Stepper
                  label={t('components:scheduleEditorSheet.train')}
                  unit={t('components:scheduleEditorSheet.dayUnit', { count: trainDays })}
                  value={trainDays}
                  onDec={() => adjustTrain(-1)}
                  onInc={() => adjustTrain(1)}
                  c={c}
                  fontWeight={fontWeight}
                />
                <View style={[styles.stepperDivider, { backgroundColor: c.borderDefault }]} />
                <Stepper
                  label={t('components:scheduleEditorSheet.rest')}
                  unit={t('components:scheduleEditorSheet.dayUnit', { count: restDays })}
                  value={restDays}
                  onDec={() => adjustRest(-1)}
                  onInc={() => adjustRest(1)}
                  c={c}
                  fontWeight={fontWeight}
                />
              </View>
              <Text style={{ color: c.textTertiary, fontSize: fontSize.caption, marginTop: spacing.s2 }}>
                {t('components:scheduleEditorSheet.repeatsEvery', { count: trainDays + restDays })}
              </Text>

              {/* Option 6 — routine per training slot */}
              <Text style={[styles.sectionLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold, marginTop: spacing.s4 }]}>
                {t('components:scheduleEditorSheet.routinePerTrainingDay')}
              </Text>
              {Array.from({ length: trainDays }).map((_, i) => {
                const slot = cycleRoutines[i] ?? null;
                return (
                  <View key={i} style={[styles.slotRow, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                    <Text style={{ color: c.textSecondary, fontSize: fontSize.bodySm, width: 92 }}>{t('components:scheduleEditorSheet.trainSlotLabel', { index: i + 1 })}</Text>
                    <Pressable
                      onPress={() => setPicker({ kind: 'cycle', index: i })}
                      style={styles.slotPick}
                      accessibilityRole="button"
                      accessibilityLabel={t('components:scheduleEditorSheet.assignTrainingDayAccessibilityLabel', { index: i + 1 })}
                    >
                      <Text style={{ color: slot?.routineId ? c.textPrimary : c.textTertiary, fontSize: fontSize.bodySm }} numberOfLines={1}>
                        {slot?.routineId ? (slot.routineName ?? t('components:scheduleEditorSheet.routineFallback')) : t('components:scheduleEditorSheet.tapToChooseRoutine')}
                      </Text>
                    </Pressable>
                    <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
                  </View>
                );
              })}
              {showValidation && !validation.valid ? (
                <Text style={[styles.inlineError, { color: c.statusError }]}>{validation.reason}</Text>
              ) : null}
            </>
          )}

          {/* Option 9 — time of day + optional reminder */}
          {!skeleton ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold, marginTop: spacing.s5 }]}>
                {t('components:scheduleEditorSheet.timeOfDay')}
              </Text>
              <View style={[styles.timeRow, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Ionicons name="time-outline" size={18} color={c.textSecondary} />
                <View style={styles.timeStepGroup}>
                  <TouchableOpacity onPress={() => adjustTime('h', -1)} style={styles.timeStepBtn} accessibilityLabel={t('components:scheduleEditorSheet.earlierHour')}>
                    <Ionicons name="remove" size={18} color={c.accentDefault} />
                  </TouchableOpacity>
                  <Text style={{ color: c.textPrimary, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, minWidth: 92, textAlign: 'center' }}>
                    {timeLabel}
                  </Text>
                  <TouchableOpacity onPress={() => adjustTime('h', 1)} style={styles.timeStepBtn} accessibilityLabel={t('components:scheduleEditorSheet.laterHour')}>
                    <Ionicons name="add" size={18} color={c.accentDefault} />
                  </TouchableOpacity>
                </View>
                <View style={styles.timeStepGroup}>
                  <TouchableOpacity onPress={() => adjustTime('m', -5)} style={styles.timeStepBtn} accessibilityLabel={t('components:scheduleEditorSheet.fiveMinEarlier')}>
                    <Text style={{ color: c.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>{t('components:scheduleEditorSheet.minus5m')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => adjustTime('m', 5)} style={styles.timeStepBtn} accessibilityLabel={t('components:scheduleEditorSheet.fiveMinLater')}>
                    <Text style={{ color: c.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>{t('components:scheduleEditorSheet.plus5m')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.reminderRow, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Ionicons name="notifications-outline" size={18} color={c.textSecondary} />
                <Text style={{ color: c.textPrimary, fontSize: fontSize.bodySm, flex: 1 }}>{t('components:scheduleEditorSheet.remindMe')}</Text>
                <Switch
                  value={draft.reminderEnabled}
                  onValueChange={setReminder}
                  trackColor={{ false: c.bgTertiary, true: c.accentSecondary }}
                  thumbColor={draft.reminderEnabled ? c.accentDefault : c.textTertiary}
                  accessibilityLabel={t('components:scheduleEditorSheet.toggleReminderAccessibilityLabel')}
                />
              </View>

              {/* Option 7 — live 2-week preview grid */}
              <Text style={[styles.sectionLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold, marginTop: spacing.s5 }]}>
                {t('components:scheduleEditorSheet.next2Weeks')}
              </Text>
              <View style={styles.previewGrid}>
                {preview.map((cell, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.previewCell,
                      {
                        backgroundColor: cell.isRest ? c.bgSecondary : c.accentSecondary,
                        borderColor: cell.isToday ? c.accentDefault : c.borderDefault,
                        borderWidth: cell.isToday ? 2 : 1,
                      },
                    ]}
                    accessibilityLabel={t('components:scheduleEditorSheet.previewCellAccessibilityLabel', {
                      label: cell.label,
                      status: cell.isRest ? t('components:scheduleEditorSheet.rest') : (cell.routineName ?? t('components:scheduleEditorSheet.training')),
                    })}
                  >
                    <Text style={{ color: c.textTertiary, fontSize: fontSize.micro }}>{cell.label}</Text>
                    <Text
                      style={{
                        color: cell.isRest ? c.textTertiary : c.accentDefault,
                        fontSize: fontSize.micro,
                        fontWeight: fontWeight.semibold,
                      }}
                      numberOfLines={1}
                    >
                      {cell.isRest ? t('components:scheduleEditorSheet.rest') : (cell.routineName ?? '•')}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>

        {/* Option 8 — sticky Save bar (disabled until valid, with a reason) */}
        <View style={[styles.saveBar, { backgroundColor: c.bgPrimary, borderTopColor: c.borderDefault }]}>
          {!validation.valid ? (
            <Text style={{ color: c.textTertiary, fontSize: fontSize.caption, marginBottom: spacing.s2 }} numberOfLines={1}>
              {validation.reason}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !validation.valid}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !validation.valid }}
            accessibilityLabel={t('components:scheduleEditorSheet.saveScheduleAccessibilityLabel')}
            style={[
              styles.saveBtn,
              {
                backgroundColor: validation.valid ? c.accentDefault : c.bgTertiary,
                opacity: saving ? 0.7 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.components.buttonPrimaryText} />
            ) : (
              <Text
                style={{
                  color: validation.valid ? theme.components.buttonPrimaryText : c.textTertiary,
                  fontWeight: fontWeight.bold,
                  fontSize: fontSize.bodyMd,
                }}
              >
                {t('components:scheduleEditorSheet.saveSchedule')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Routine picker (option 6) */}
        <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
            <Text style={{ color: c.textPrimary, fontWeight: fontWeight.bold, fontSize: fontSize.bodyMd, marginBottom: spacing.s3 }}>
              {t('components:scheduleEditorSheet.assignARoutine')}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity onPress={() => applyPick({ routineId: null })} style={[styles.pickerItem, { borderBottomColor: c.borderDefault }]}>
                <Ionicons name="moon-outline" size={18} color={c.textSecondary} />
                <Text style={{ color: c.textSecondary, fontSize: fontSize.bodyMd, marginLeft: spacing.s2 }}>{t('components:scheduleEditorSheet.restDay')}</Text>
              </TouchableOpacity>
              {routines.length === 0 ? (
                <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm, paddingVertical: spacing.s3 }}>
                  {t('components:scheduleEditorSheet.noRoutinesYet')}
                </Text>
              ) : (
                routines.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => applyPick({ routineId: r.id, routineName: r.name })}
                    style={[styles.pickerItem, { borderBottomColor: c.borderDefault }]}
                  >
                    <Ionicons name="barbell-outline" size={18} color={c.accentDefault} />
                    <Text style={{ color: c.textPrimary, fontSize: fontSize.bodyMd, marginLeft: spacing.s2, flex: 1 }} numberOfLines={1}>{r.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity onPress={() => setPicker(null)} style={styles.pickerCancel} accessibilityRole="button" accessibilityLabel={t('common:cancel')}>
              <Text style={{ color: c.textTertiary, fontSize: fontSize.bodySm }}>{t('common:cancel')}</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

// ── Small stepper sub-component (option 5) ────────────────────────────────────
function Stepper({
  label, unit, value, onDec, onInc, c, fontWeight,
}: {
  label: string;
  unit: string;
  value: number;
  onDec: () => void;
  onInc: () => void;
  c: ReturnType<typeof useTheme>['theme']['colors'];
  fontWeight: ReturnType<typeof useTheme>['fontWeight'];
}): React.ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.stepper}>
      <Text style={{ color: c.textSecondary, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity onPress={onDec} style={[styles.stepperBtn, { borderColor: c.borderDefault }]} accessibilityRole="button" accessibilityLabel={t('components:scheduleEditorSheet.decreaseAccessibilityLabel', { label })}>
          <Ionicons name="remove" size={18} color={c.accentDefault} />
        </TouchableOpacity>
        <Text style={{ color: c.textPrimary, fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, minWidth: 28, textAlign: 'center' }}>
          {value}
        </Text>
        <TouchableOpacity onPress={onInc} style={[styles.stepperBtn, { borderColor: c.borderDefault }]} accessibilityRole="button" accessibilityLabel={t('components:scheduleEditorSheet.increaseAccessibilityLabel', { label })}>
          <Ionicons name="add" size={18} color={c.accentDefault} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: c.textTertiary, fontSize: fontSize.caption }}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  headerIconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.bodyLg, flex: 1, textAlign: 'center' },

  explainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s4,
  },

  // Segmented control
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.full,
    padding: 4,
    marginBottom: spacing.s5,
    position: 'relative',
  },
  segThumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radius.full,
  },
  segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s2, minHeight: 36 },

  sectionLabel: { fontSize: fontSize.bodySm, marginBottom: spacing.s2 },

  // Day chips (≥44pt)
  chipRow: { flexDirection: 'row', justifyContent: 'space-between' },
  chip: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inlineError: { fontSize: fontSize.caption, marginTop: spacing.s2 },

  // Cycle stepper
  stepperCard: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.s3 },
  stepper: { flex: 1, alignItems: 'center', gap: spacing.s1 },
  stepperDivider: { width: 1 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  stepperBtn: {
    width: 44, height: 44, borderRadius: radius.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  // Assignment rows
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s2,
    minHeight: 48,
  },
  slotPick: { flex: 1, paddingVertical: spacing.s2, justifyContent: 'center' },

  // Time + reminder
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  timeStepGroup: { flexDirection: 'row', alignItems: 'center' },
  timeStepBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.s1 },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginTop: spacing.s2,
    minHeight: 48,
  },

  // Preview grid
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  previewCell: {
    width: '13%',
    aspectRatio: 0.8,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s1,
    gap: 2,
  },

  // Skeleton (option 2)
  skeletonWrap: { gap: spacing.s2 },
  skeletonRow: { height: 48, borderRadius: radius.md, opacity: 0.5 },

  // Sticky save bar
  saveBar: { borderTopWidth: 1, paddingHorizontal: spacing.s4, paddingTop: spacing.s3, paddingBottom: spacing.s3 },
  saveBtn: { borderRadius: radius.md, paddingVertical: spacing.s4, alignItems: 'center', justifyContent: 'center', minHeight: 52 },

  // Routine picker
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  pickerSheet: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '18%',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
  },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.s3, borderBottomWidth: 1 },
  pickerCancel: { alignItems: 'center', paddingTop: spacing.s3 },
});
