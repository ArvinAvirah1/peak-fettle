/**
 * Routines page — TICKET-061/083
 * Dedicated bottom-tab screen for managing user-saved workout routines.
 *
 * Sections:
 *   • Header: "Routines" + "＋ New" button (no back button — this is a tab)
 *   • YOURS: list of user routines with Start / Edit / Delete actions
 *   • STARTER SPLITS: template chips — tap to duplicate into user routines
 *
 * "▶ Start" → navigates to log tab with ?routineId=xxx so the Log tab
 * auto-opens the Focus Stepper for that routine.
 *
 * UI follows set-logging-stepper-flow.html §2, Option A.
 * Moved from mobile/app/routines.tsx → mobile/app/(tabs)/routines.tsx (TICKET-083).
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontFamily, fontSize, spacing, radius, stepperPalette } from '../../src/theme/tokens';
import {
  getRoutines,
  createRoutine,
  deleteRoutine,
  Routine,
} from '../../src/api/routines';
import { getTemplates, getTemplate, WorkoutTemplate } from '../../src/api/templates';
import RoutineEditorSheet from '../../src/components/RoutineEditorSheet';
import { useTourAnchor } from '../../src/components/tour/WelcomeTour'; // TICKET-095
import ScheduleEditorSheet from '../../src/components/ScheduleEditorSheet'; // TICKET-097
import { loadSchedule, resolveNextUp, advanceSavedCycle, Schedule, NextUp } from '../../src/data/schedule';

// ── Types ────────────────────────────────────────────────────────────────────

// The name sheet is now only used for creating a new routine; editing exercises
// (and renaming) happens in the full-screen RoutineEditorSheet.
type SheetMode = 'new' | null;

// ── Component ────────────────────────────────────────────────────────────────

export default function RoutinesPage(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  // TICKET-095: anchor the "＋ New" button so the welcome tour can spotlight it.
  const newRoutineAnchor = useTourAnchor('routines-new');
  // TICKET-097: schedule editor + next-up.
  const scheduleAnchor = useTourAnchor('routines-create-schedule');
  const [scheduleEditorVisible, setScheduleEditorVisible] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  // Full-screen exercise editor (rename + add/remove/reorder exercises).
  const [editorRoutine, setEditorRoutine] = useState<Routine | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        getRoutines(),
        // BUGFIX (TICKET-074 #4): the previous filter `discipline: 'strength'`
        // matched NOTHING — the seeded disciplines are 'general_strength' /
        // 'powerlifting' / 'running' (see db/schema.sql CHECK). A bogus filter
        // returned zero rows, so the STARTER SPLITS row was always empty and
        // "tapping a template did nothing". Fetch all seeded templates instead.
        getTemplates(),
      ]);
      setRoutines(r);
      setTemplates(t.slice(0, 8)); // show up to 8 starter splits
    } catch {
      // silently fail; user sees empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // TICKET-097: load the on-device schedule (+ reload after editing).
  const reloadSchedule = useCallback(async () => {
    setSchedule(await loadSchedule());
  }, []);
  useEffect(() => { reloadSchedule(); }, [reloadSchedule]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNewSheet = useCallback(() => {
    setNameInput('');
    setSheetMode('new');
  }, []);

  /** Edit now opens the full editor (rename + add/remove/reorder exercises). */
  const openEditor = useCallback((routine: Routine) => {
    setEditorRoutine(routine);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorRoutine(null);
  }, []);

  const handleEditorSaved = useCallback((updated: Routine) => {
    setRoutines((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setEditorRoutine(null);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetMode(null);
    setNameInput('');
  }, []);

  // Create a new (empty) named routine, then immediately open the editor so the
  // user can enumerate its exercises — a routine can't be started until it has
  // at least one (see handleStart).
  const handleSave = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    try {
      const r = await createRoutine({ name, exercises: [] });
      setRoutines((prev) => [r, ...prev]);
      closeSheet();
      setEditorRoutine(r);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save routine');
    } finally {
      setSaving(false);
    }
  }, [nameInput, closeSheet]);

  const handleDelete = useCallback((routine: Routine) => {
    Alert.alert(
      'Delete routine',
      `Delete "${routine.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoutine(routine.id);
              setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
            } catch {
              Alert.alert('Error', 'Could not delete routine');
            }
          },
        },
      ],
    );
  }, []);

  /** Duplicate a starter split template into a user routine */
  const handleDuplicateTemplate = useCallback(async (tpl: WorkoutTemplate) => {
    setSaving(true);
    try {
      // The starter-split list (GET /templates) returns summaries only — the
      // sessions/exercises live on GET /templates/:id. Without this fetch the
      // routine would be created EMPTY (the old bug: tap "did nothing" useful).
      const full = tpl.sessions && tpl.sessions.length > 0 ? tpl : await getTemplate(tpl.id);
      // Build exercises from the first template session.
      const exercises = (full.sessions?.[0]?.exercises ?? []).map((ex) => ({
        // TICKET-088: omit exercise_id — template exercises have no library UUID
        // yet. Sending '' failed the server's uuid() check (400). The schema now
        // treats exercise_id as optional/nullable; `name` is the source of truth.
        exercise_id: undefined,
        name: ex.exercise_name,
        target_sets: ex.sets,
        target_reps: ex.reps,
      }));
      const r = await createRoutine({ name: full.name, exercises });
      setRoutines((prev) => [r, ...prev]);
      Alert.alert('Routine added', `"${full.name}" has been added to your routines.`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not duplicate template');
    } finally {
      setSaving(false);
    }
  }, []);

  /** Start a routine → navigate to Home with routineId param (TICKET-084).
   *  Blocked until the routine has at least one exercise — there's nothing to
   *  log otherwise. We prompt the user to add exercises instead. */
  const handleStart = useCallback((routine: Routine) => {
    if (routine.exercises.length === 0) {
      Alert.alert(
        'Add an exercise first',
        `"${routine.name}" has no exercises yet. Add at least one before starting.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Edit routine', onPress: () => setEditorRoutine(routine) },
        ],
      );
      return;
    }
    router.push(`/(tabs)?routineId=${routine.id}&routineName=${encodeURIComponent(routine.name)}`);
  }, [router]);

  // ── TICKET-097: schedule handlers + next-up ─────────────────────────────────
  const openScheduleEditor = useCallback(() => setScheduleEditorVisible(true), []);
  const handleScheduleSaved = useCallback((s: Schedule) => {
    setSchedule(s);
    setScheduleEditorVisible(false);
  }, []);
  const handleStartNextUp = useCallback((nu: NextUp) => {
    if (nu.isRest || !nu.slot.routineId) {
      Alert.alert('Rest day', 'Today is a rest day in your schedule. Enjoy the recovery.');
      return;
    }
    const name = routines.find((r) => r.id === nu.slot.routineId)?.name ?? nu.slot.routineName ?? '';
    router.push(`/(tabs)?routineId=${nu.slot.routineId}&routineName=${encodeURIComponent(name)}`);
    // Cycle advances on START of a slot (Phase 1 semantics — see src/data/schedule.ts).
    if (schedule?.mode === 'cycle') {
      advanceSavedCycle().then(reloadSchedule).catch(() => {});
    }
  }, [router, routines, schedule, reloadSchedule]);

  const hasSchedule =
    !!schedule && (schedule.cycle.length > 0 || schedule.weekly.some((x) => !!x));
  const nextUp = hasSchedule ? resolveNextUp(schedule) : null;
  const nextUpName =
    nextUp && nextUp.slot.routineId
      ? routines.find((r) => r.id === nextUp.slot.routineId)?.name ?? nextUp.slot.routineName ?? 'Routine'
      : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bgPrimary }]}>
      {/* ── Page header (no back button — this is a tab screen) ───────────── */}
      <View style={[styles.pageHeader, { borderBottomColor: c.borderDefault }]}>
        <Text style={[styles.pageTitle, { color: c.textPrimary }]}>Routines</Text>
        <TouchableOpacity
          ref={newRoutineAnchor.ref}
          style={[styles.newPill, { backgroundColor: c.accentDefault }]}
          onPress={openNewSheet}
          accessibilityRole="button"
          accessibilityLabel="New routine"
        >
          <Text style={[styles.newPillLabel, { color: theme.components.buttonPrimaryText }]}>＋ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={c.accentDefault} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── TICKET-097: Schedule / Next up ──────────────────────────── */}
          <View style={{ backgroundColor: c.bgSecondary, borderColor: c.borderDefault, borderWidth: 1, borderRadius: radius.md, padding: spacing.s4, marginBottom: spacing.s4 }}>
            {nextUp ? (
              <>
                <Text style={{ color: c.textTertiary, fontFamily: fontFamily.bold, fontSize: fontSize.caption, letterSpacing: 0.5, marginBottom: spacing.s2 }}>
                  {nextUp.whenLabel.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.s2 }}>
                  <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.bodyLg, flex: 1 }} numberOfLines={1}>
                    {nextUp.isRest ? 'Rest day' : nextUpName}
                  </Text>
                  {!nextUp.isRest ? (
                    <TouchableOpacity
                      onPress={() => handleStartNextUp(nextUp)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s1, backgroundColor: c.accentDefault, borderRadius: radius.md, paddingHorizontal: spacing.s3, paddingVertical: spacing.s2 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Start ${nextUpName ?? 'next workout'}`}
                    >
                      <Ionicons name="play" size={13} color={theme.components.buttonPrimaryText} />
                      <Text style={{ color: theme.components.buttonPrimaryText, fontFamily: fontFamily.bold, fontSize: fontSize.bodySm }}>Start</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            ) : (
              <Text style={{ color: c.textSecondary, fontSize: fontSize.bodySm }}>
                Plan your week or build a repeating split — e.g. Push → Pull → Legs and back again.
              </Text>
            )}
            <TouchableOpacity
              ref={scheduleAnchor.ref}
              onPress={openScheduleEditor}
              style={{ marginTop: spacing.s3, borderWidth: 1, borderColor: c.accentDefault, borderRadius: radius.md, paddingVertical: spacing.s2, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel={hasSchedule ? 'Edit schedule' : 'Create schedule'}
            >
              <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semiBold, fontSize: fontSize.bodySm }}>
                {hasSchedule ? 'Edit schedule' : 'Create schedule'}
              </Text>
            </TouchableOpacity>
          </View>
          {/* ── YOURS section ──────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>YOURS</Text>

          {routines.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                No routines yet — tap ＋ New to create one, or duplicate a starter split below.
              </Text>
            </View>
          ) : (
            routines.map((routine) => (
              <View
                key={routine.id}
                style={[styles.routineCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}
              >
                <View style={styles.routineCardTop}>
                  <Text style={[styles.routineName, { color: c.textPrimary }]} numberOfLines={1}>
                    {routine.name}
                  </Text>
                  <Text style={[styles.routineMeta, { color: c.textTertiary }]}>
                    {routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={styles.routineCardActions}>
                  {(() => {
                    const startable = routine.exercises.length > 0;
                    const startColor = startable ? c.accentDefault : c.textTertiary;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.actionBtnPrimary,
                          { borderColor: startColor },
                          !startable && styles.actionBtnDisabled,
                        ]}
                        onPress={() => handleStart(routine)}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !startable }}
                        accessibilityLabel={
                          startable
                            ? `Start ${routine.name}`
                            : `Start ${routine.name} (add an exercise first)`
                        }
                      >
                        <Ionicons name="play" size={13} color={startColor} />
                        <Text style={[styles.actionBtnPrimaryLabel, { color: startColor }]}>Start</Text>
                      </TouchableOpacity>
                    );
                  })()}
                  <TouchableOpacity
                    style={[styles.actionBtnGhost, { borderColor: c.borderDefault }]}
                    onPress={() => openEditor(routine)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${routine.name}`}
                  >
                    <Ionicons name="pencil" size={13} color={c.textSecondary} />
                    <Text style={[styles.actionBtnGhostLabel, { color: c.textSecondary }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(routine)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${routine.name}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={c.statusError} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* ── STARTER SPLITS section ────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: spacing.s4 }]}>
            STARTER SPLITS · tap to duplicate
          </Text>
          <View style={styles.chipsRow}>
            {templates.map((tpl) => (
              <TouchableOpacity
                key={tpl.id}
                style={[styles.templateChip, { borderColor: c.borderDefault, backgroundColor: c.bgSecondary }]}
                onPress={() => handleDuplicateTemplate(tpl)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Add ${tpl.name} to your routines`}
              >
                <Text style={[styles.templateChipLabel, { color: c.textSecondary }]} numberOfLines={1}>
                  {tpl.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── New routine name sheet ─────────────────────────────────────────── */}
      <Modal
        visible={sheetMode !== null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        {/* KeyboardAvoidingView lifts the bottom sheet above the keyboard so the
            name field is visible while typing (previously it sat behind the
            keyboard — the user was typing blind). */}
        <KeyboardAvoidingView
          style={styles.sheetKav}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
          <View style={[styles.sheet, { backgroundColor: stepperPalette.card, borderColor: stepperPalette.accentLine }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New routine</Text>
            <TextInput
              style={styles.sheetInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="e.g. Push A"
              placeholderTextColor={stepperPalette.muted}
              autoFocus
              maxLength={100}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancelBtn} onPress={closeSheet}>
                <Text style={styles.sheetCancelLabel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sheetSaveBtn, !nameInput.trim() && styles.sheetSaveBtnDisabled]}
                onPress={handleSave}
                disabled={saving || !nameInput.trim()}
              >
                {saving
                  ? <ActivityIndicator size="small" color={stepperPalette.accentInk} />
                  : <Text style={styles.sheetSaveLabel}>Create</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Full-screen routine editor (rename + add/remove/reorder exercises) ─ */}
      <RoutineEditorSheet
        visible={editorRoutine !== null}
        routine={editorRoutine}
        onClose={closeEditor}
        onSaved={handleEditorSaved}
      />

      {/* ── TICKET-097: Schedule editor ──────────────────────────────────── */}
      <ScheduleEditorSheet
        visible={scheduleEditorVisible}
        routines={routines.map((r) => ({ id: r.id, name: r.name }))}
        onClose={() => setScheduleEditorVisible(false)}
        onSaved={handleScheduleSaved}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    gap: spacing.s3,
  },
  pageTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.heading3,
  },
  newPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  newPillLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.s4, paddingBottom: spacing.s12 },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
    marginBottom: spacing.s3,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
  routineCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  routineCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  routineName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    flex: 1,
  },
  routineMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
  },
  routineCardActions: {
    flexDirection: 'row',
    gap: spacing.s2,
    alignItems: 'center',
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
  },
  actionBtnPrimaryLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  actionBtnGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
  },
  actionBtnGhostLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
  },
  deleteBtn: { padding: spacing.s2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  templateChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  templateChipLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },
  actionBtnDisabled: { opacity: 0.5 },
  // Sheet
  sheetKav: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    padding: spacing.s4,
    paddingBottom: spacing.s12,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    alignSelf: 'center',
    marginBottom: spacing.s4,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
    color: stepperPalette.text,
    marginBottom: spacing.s3,
  },
  sheetInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    marginBottom: spacing.s4,
  },
  sheetActions: { flexDirection: 'row', gap: spacing.s3 },
  sheetCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  sheetCancelLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  sheetSaveBtn: {
    flex: 1,
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  sheetSaveBtnDisabled: { opacity: 0.4 },
  sheetSaveLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },
});
