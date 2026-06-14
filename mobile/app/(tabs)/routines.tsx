/**
 * Routines page — TICKET-061/083 · redesign (094-A UI overhaul).
 *
 * A dedicated bottom-tab screen for managing user-saved workout routines and
 * discovering starter splits. Tier-agnostic: all routine CRUD goes through
 * src/data/routines (local-first for free users, REST for Pro) so the UI is
 * identical on both tiers.
 *
 * Sections (shared "section grammar" — one header style throughout):
 *   • Next up / schedule card (TICKET-097)
 *   • YOURS — rich routine cards (day/exercise count, last-performed, schedule
 *     chip) with swipe actions (duplicate / edit / delete) + a real empty state.
 *   • STARTER SPLITS — preview cards filterable by goal; tapping opens a real
 *     preview sheet with a "Use this" duplicate CTA.
 *
 * Header carries a single clear "＋ New". Scheduling moved into the next-up card
 * (decluttered out of the section headers).
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
  Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontFamily, fontSize, spacing, radius, stepperPalette } from '../../src/theme/tokens';
import { useAuth } from '../../src/hooks/useAuth';
import {
  listRoutines,
  createRoutine,
  deleteRoutine,
  duplicateRoutine,
  patchRoutine,
  getLastPerformedMap,
  Routine,
} from '../../src/data/routines';
import { getTemplates, getTemplate, WorkoutTemplate } from '../../src/api/templates';
import { TemplateDetailSheet, SheetExercise } from '../../src/components/TemplateDetailSheet';
import RoutineEditorSheet from '../../src/components/RoutineEditorSheet';
import { useTourAnchor } from '../../src/components/tour/WelcomeTour'; // TICKET-095
import ScheduleEditorSheet from '../../src/components/ScheduleEditorSheet'; // TICKET-097
import { loadSchedule, resolveNextUp, Schedule, NextUp, ScheduleSlot } from '../../src/data/schedule';
import { localDb } from '../../src/db/localDb'; // TICKET-097: react to schedule changes

// ── Types ────────────────────────────────────────────────────────────────────

type SheetMode = 'new' | null;

/** Starter-split goal filters (option 14). */
type GoalFilter = 'all' | 'strength' | 'hypertrophy' | 'ppl' | 'full-body';

const GOAL_CHIPS: { key: GoalFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'strength', label: 'Strength' },
  { key: 'hypertrophy', label: 'Hypertrophy' },
  { key: 'ppl', label: 'PPL' },
  { key: 'full-body', label: 'Full body' },
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Compact relative label for an ISO timestamp, e.g. "2d ago", "3w ago". */
function relativeFromIso(iso: string | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return null;
  const day = 86_400_000;
  const days = Math.floor(diffMs / day);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? '1mo ago' : `${months}mo ago`;
}

/**
 * Classify a starter split into goal buckets for the goal filter (option 14).
 * Best-effort heuristic over name + discipline; a template can match several.
 */
function templateGoals(tpl: WorkoutTemplate): Set<GoalFilter> {
  const goals = new Set<GoalFilter>(['all']);
  const hay = `${tpl.name} ${tpl.discipline}`.toLowerCase();
  if (/push|pull|leg|ppl/.test(hay)) goals.add('ppl');
  if (/full[\s-]?body|total[\s-]?body/.test(hay)) goals.add('full-body');
  if (/power|strength|5x5|5\/3\/1|531|texas/.test(hay) || tpl.discipline === 'powerlifting' || tpl.discipline === 'general_strength') {
    goals.add('strength');
  }
  if (/hypertroph|bodybuild|volume|ppl|bro|split/.test(hay)) goals.add('hypertrophy');
  return goals;
}

/** Day + exercise counts for a starter-split preview card (option 2). */
function templateCounts(tpl: WorkoutTemplate): { days: number; exercises: number } {
  const days = tpl.sessions?.length ?? tpl.days_per_week ?? 0;
  const exercises = (tpl.sessions ?? []).reduce((n, s) => n + (s.exercises?.length ?? 0), 0);
  return { days, exercises };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RoutinesPage(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { user } = useAuth();
  const userId = user?.id ?? '';

  // TICKET-095: anchor the "＋ New" button so the welcome tour can spotlight it.
  const newRoutineAnchor = useTourAnchor('routines-new');
  // TICKET-097: schedule editor + next-up.
  const scheduleAnchor = useTourAnchor('routines-create-schedule');
  const [scheduleEditorVisible, setScheduleEditorVisible] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [lastPerformed, setLastPerformed] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  // Full-screen exercise editor (rename + add/remove/reorder exercises).
  const [editorRoutine, setEditorRoutine] = useState<Routine | null>(null);
  // Inline rename after a duplicate (option 6): the row id being renamed.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Starter-split preview sheet (option 1).
  const [previewTpl, setPreviewTpl] = useState<WorkoutTemplate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Goal filter for starter splits (option 14).
  const [goalFilter, setGoalFilter] = useState<GoalFilter>('all');
  // Lightweight toast (option 6).
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        // Tier-branched: local-first for free users, REST for Pro.
        listRoutines(user),
        // Starter splits — fetch all seeded templates (the old discipline:'strength'
        // filter matched nothing; TICKET-074 #4).
        getTemplates(),
      ]);
      setRoutines(r);
      setTemplates(t);
      // Best-effort last-performed (option 5) — never blocks the list render.
      getLastPerformedMap(user, r).then(setLastPerformed).catch(() => {});
    } catch {
      // silently fail; user sees empty list
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  // TICKET-097: load the on-device schedule (+ reload after editing).
  const reloadSchedule = useCallback(async () => {
    setSchedule(await loadSchedule());
  }, []);
  useEffect(() => { reloadSchedule(); }, [reloadSchedule]);
  // TICKET-097: refresh next-up when the schedule changes — e.g. a workout finished
  // and advanced the cycle from WorkoutLoggerHost.
  useEffect(() => {
    const unsub = localDb.subscribe((tables) => {
      if (tables.has('schedule')) reloadSchedule();
    });
    return unsub;
  }, [reloadSchedule]);

  // ── Toast ────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    RNAnimated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    setTimeout(() => {
      RNAnimated.timing(toastOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        () => setToast(null),
      );
    }, 1800);
  }, [toastOpacity]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNewSheet = useCallback(() => {
    setNameInput('');
    setSheetMode('new');
  }, []);

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

  // Create a new (empty) named routine, then open the editor so the user can
  // enumerate its exercises (a routine can't be started until it has one).
  const handleSave = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    try {
      const r = await createRoutine(user, { name, exercises: [] }, userId);
      setRoutines((prev) => [r, ...prev]);
      closeSheet();
      setEditorRoutine(r);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save routine');
    } finally {
      setSaving(false);
    }
  }, [nameInput, closeSheet, user, userId]);

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
              await deleteRoutine(user, routine.id);
              setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
            } catch {
              Alert.alert('Error', 'Could not delete routine');
            }
          },
        },
      ],
    );
  }, [user]);

  // Duplicate an existing routine — one tap → toast → inline rename (option 6).
  const handleDuplicateRoutine = useCallback(async (routine: Routine) => {
    try {
      const copy = await duplicateRoutine(user, routine, userId);
      setRoutines((prev) => [copy, ...prev]);
      showToast('Copied to Yours');
      setRenamingId(copy.id);
      setRenameValue(copy.name);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not duplicate routine');
    }
  }, [user, userId, showToast]);

  // Commit the inline rename (option 6).
  const commitRename = useCallback(async () => {
    const id = renamingId;
    if (!id) return;
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const current = routines.find((r) => r.id === id);
    if (!current || current.name === name) return;
    // Optimistic update; reconcile on the patch result.
    setRoutines((prev) => prev.map((r) => (r.id === id ? { ...r, name } : r)));
    try {
      const updated = await patchRoutine(user, id, { name });
      setRoutines((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch {
      // Roll back to whatever we had.
      setRoutines((prev) => prev.map((r) => (r.id === id ? current : r)));
      Alert.alert('Error', 'Could not rename routine');
    }
  }, [renamingId, renameValue, routines, user]);

  // Duplicate a starter-split template into a user routine (used by the preview).
  const handleUseTemplate = useCallback(async (tpl: WorkoutTemplate) => {
    setSaving(true);
    try {
      // The list endpoint returns summaries only — sessions/exercises live on
      // GET /templates/:id. getTemplate() now returns the UNWRAPPED template.
      const full = tpl.sessions && tpl.sessions.length > 0 ? tpl : await getTemplate(tpl.id);
      const exercises = (full.sessions?.[0]?.exercises ?? []).map((ex) => ({
        // TICKET-088: template exercises have no library UUID — name is source of truth.
        exercise_id: undefined,
        name: ex.exercise_name,
        target_sets: ex.sets,
        target_reps: ex.reps,
      }));
      const r = await createRoutine(user, { name: full.name, exercises }, userId);
      setRoutines((prev) => [r, ...prev]);
      setPreviewTpl(null);
      showToast('Copied to Yours');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not duplicate template');
    } finally {
      setSaving(false);
    }
  }, [user, userId, showToast]);

  // Open the starter-split preview sheet (option 1) — fetch the full template so
  // the sheet lists real exercises.
  const openPreview = useCallback(async (tpl: WorkoutTemplate) => {
    setPreviewTpl(tpl);
    if (tpl.sessions && tpl.sessions.length > 0) return;
    setPreviewLoading(true);
    try {
      const full = await getTemplate(tpl.id);
      setPreviewTpl(full);
    } catch {
      // Keep the summary; the sheet shows a graceful empty state.
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  /** Start a routine → navigate to Home with routineId param (TICKET-084). */
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
  }, [router, routines]);

  const hasSchedule =
    !!schedule && (schedule.cycle.length > 0 || schedule.weekly.some((x) => !!x));
  const nextUp = hasSchedule ? resolveNextUp(schedule) : null;
  const nextUpName =
    nextUp && nextUp.slot.routineId
      ? routines.find((r) => r.id === nextUp.slot.routineId)?.name ?? nextUp.slot.routineName ?? 'Routine'
      : null;

  // Per-routine schedule chip text (option 13): which weekdays / cycle position
  // a routine is scheduled on. Computed once per schedule/routines change.
  const scheduleChips = useMemo(() => {
    const map = new Map<string, string>();
    if (!schedule) return map;
    if (schedule.mode === 'weekly') {
      const byRoutine = new Map<string, string[]>();
      schedule.weekly.forEach((slot, idx) => {
        if (slot?.routineId) {
          const arr = byRoutine.get(slot.routineId) ?? [];
          arr.push(WEEKDAY_SHORT[idx] ?? '');
          byRoutine.set(slot.routineId, arr);
        }
      });
      byRoutine.forEach((days, rid) => map.set(rid, days.join('·')));
    } else {
      // cycle: mark the routine that is the immediate next slot.
      const slot: ScheduleSlot | undefined = schedule.cycle[
        ((schedule.position % schedule.cycle.length) + schedule.cycle.length) %
          (schedule.cycle.length || 1)
      ];
      if (slot?.routineId) map.set(slot.routineId, 'Next in cycle');
    }
    return map;
  }, [schedule]);

  // Filtered starter splits (option 14).
  const filteredTemplates = useMemo(() => {
    const list = goalFilter === 'all'
      ? templates
      : templates.filter((t) => templateGoals(t).has(goalFilter));
    return list.slice(0, 12);
  }, [templates, goalFilter]);

  // Build the exercise list for the preview sheet (option 1).
  const previewExercises: SheetExercise[] = useMemo(() => {
    if (!previewTpl) return [];
    const session = previewTpl.sessions?.[0];
    return (session?.exercises ?? []).map((ex) => ({
      name: ex.exercise_name,
      sets: ex.sets,
      reps: ex.reps,
      rest_s: ex.rest_seconds,
      form_cue: ex.form_cue,
    }));
  }, [previewTpl]);

  // ── Swipe action renderers (option 7) ───────────────────────────────────────
  const renderRightActions = useCallback((routine: Routine) => () => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.accentSecondary }]}
        onPress={() => handleDuplicateRoutine(routine)}
        accessibilityRole="button"
        accessibilityLabel={`Duplicate ${routine.name}`}
      >
        <Ionicons name="copy-outline" size={18} color={c.accentDefault} />
        <Text style={[styles.swipeActionLabel, { color: c.accentDefault }]}>Copy</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.bgElevated }]}
        onPress={() => openEditor(routine)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${routine.name}`}
      >
        <Ionicons name="pencil" size={18} color={c.textSecondary} />
        <Text style={[styles.swipeActionLabel, { color: c.textSecondary }]}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.statusError }]}
        onPress={() => handleDelete(routine)}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${routine.name}`}
      >
        <Ionicons name="trash-outline" size={18} color={theme.components.buttonDestructiveText} />
        <Text style={[styles.swipeActionLabel, { color: theme.components.buttonDestructiveText }]}>
          Delete
        </Text>
      </TouchableOpacity>
    </View>
  ), [c, theme, handleDuplicateRoutine, openEditor, handleDelete]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bgPrimary }]} edges={['top']}>
      <GestureHandlerRootView style={styles.root}>
        {/* ── Page header — single clear "＋ New" (option 4) ─────────────── */}
        <View style={[styles.pageHeader, { borderBottomColor: c.borderDefault }]}>
          <Text style={[styles.pageTitle, { color: c.textPrimary }]}>Routines</Text>
          <TouchableOpacity
            ref={newRoutineAnchor.ref}
            style={[styles.newPill, { backgroundColor: c.accentDefault }]}
            onPress={openNewSheet}
            accessibilityRole="button"
            accessibilityLabel="New routine"
          >
            <Ionicons name="add" size={16} color={theme.components.buttonPrimaryText} />
            <Text style={[styles.newPillLabel, { color: theme.components.buttonPrimaryText }]}>New</Text>
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
            {/* ── TICKET-097: Schedule / Next up (scheduling lives here now) ─ */}
            <View style={[styles.nextUpCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              {nextUp ? (
                <>
                  <Text style={[styles.nextUpKicker, { color: c.textTertiary }]}>
                    {nextUp.whenLabel.toUpperCase()}
                  </Text>
                  <View style={styles.nextUpRow}>
                    <Text style={[styles.nextUpName, { color: c.textPrimary }]} numberOfLines={1}>
                      {nextUp.isRest ? 'Rest day' : nextUpName}
                    </Text>
                    {!nextUp.isRest ? (
                      <TouchableOpacity
                        onPress={() => handleStartNextUp(nextUp)}
                        style={[styles.nextUpStart, { backgroundColor: c.accentDefault }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Start ${nextUpName ?? 'next workout'}`}
                      >
                        <Ionicons name="play" size={13} color={theme.components.buttonPrimaryText} />
                        <Text style={[styles.nextUpStartLabel, { color: theme.components.buttonPrimaryText }]}>
                          Start
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={[styles.nextUpHint, { color: c.textSecondary }]}>
                  Plan your week or build a repeating split — e.g. Push → Pull → Legs and back again.
                </Text>
              )}
              <TouchableOpacity
                ref={scheduleAnchor.ref}
                onPress={openScheduleEditor}
                style={[styles.scheduleBtn, { borderColor: c.accentDefault }]}
                accessibilityRole="button"
                accessibilityLabel={hasSchedule ? 'Edit schedule' : 'Create schedule'}
              >
                <Ionicons name="calendar-outline" size={14} color={c.accentDefault} />
                <Text style={[styles.scheduleBtnLabel, { color: c.accentDefault }]}>
                  {hasSchedule ? 'Edit schedule' : 'Create schedule'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── YOURS section (shared section grammar — option 12) ──────── */}
            <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>YOURS</Text>

            {routines.length === 0 ? (
              // Real empty state + CTAs (option 3).
              <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Ionicons name="barbell-outline" size={28} color={c.textTertiary} />
                <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No routines yet</Text>
                <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                  Build your own session, or duplicate a starter split to get going fast.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyPrimaryBtn, { backgroundColor: c.accentDefault }]}
                  onPress={openNewSheet}
                  accessibilityRole="button"
                  accessibilityLabel="Build your first routine"
                >
                  <Text style={[styles.emptyPrimaryLabel, { color: theme.components.buttonPrimaryText }]}>
                    Build your first routine
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.emptyOr, { color: c.textTertiary }]}>or duplicate a starter split below</Text>
              </View>
            ) : (
              routines.map((routine) => {
                const startable = routine.exercises.length > 0;
                const last = relativeFromIso(lastPerformed.get(routine.id));
                const chip = scheduleChips.get(routine.id);
                const isRenaming = renamingId === routine.id;
                return (
                  <ReanimatedSwipeable
                    key={routine.id}
                    renderRightActions={renderRightActions(routine)}
                    overshootRight={false}
                    friction={2}
                    rightThreshold={40}
                  >
                    {/* Rich routine card (option 5) */}
                    <View style={[styles.routineCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                      <View style={styles.routineCardTop}>
                        {isRenaming ? (
                          <TextInput
                            style={[styles.renameInput, { color: c.textPrimary, borderColor: c.accentDefault, backgroundColor: c.bgTertiary }]}
                            value={renameValue}
                            onChangeText={setRenameValue}
                            onBlur={commitRename}
                            onSubmitEditing={commitRename}
                            autoFocus
                            selectTextOnFocus
                            maxLength={100}
                            returnKeyType="done"
                            accessibilityLabel="Rename routine"
                          />
                        ) : (
                          <TouchableOpacity
                            style={styles.routineNameWrap}
                            onPress={() => openEditor(routine)}
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${routine.name}`}
                          >
                            <Text style={[styles.routineName, { color: c.textPrimary }]} numberOfLines={1}>
                              {routine.name}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Meta badges: exercise count · last performed */}
                      <View style={styles.metaRow}>
                        <View style={[styles.metaBadge, { backgroundColor: c.bgTertiary }]}>
                          <Ionicons name="list-outline" size={12} color={c.textSecondary} />
                          <Text style={[styles.metaBadgeText, { color: c.textSecondary }]}>
                            {routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}
                          </Text>
                        </View>
                        {last ? (
                          <View style={[styles.metaBadge, { backgroundColor: c.bgTertiary }]}>
                            <Ionicons name="time-outline" size={12} color={c.textSecondary} />
                            <Text style={[styles.metaBadgeText, { color: c.textSecondary }]}>{last}</Text>
                          </View>
                        ) : null}
                        {chip ? (
                          // Per-routine schedule chip (option 13) — tap to edit schedule.
                          <TouchableOpacity
                            style={[styles.metaBadge, { backgroundColor: c.accentSecondary }]}
                            onPress={openScheduleEditor}
                            accessibilityRole="button"
                            accessibilityLabel={`Scheduled ${chip} — edit schedule`}
                          >
                            <Ionicons name="calendar-outline" size={12} color={c.accentDefault} />
                            <Text style={[styles.metaBadgeText, { color: c.accentDefault }]}>{chip}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {/* Actions */}
                      <View style={styles.routineCardActions}>
                        <TouchableOpacity
                          style={[
                            styles.actionBtnPrimary,
                            { borderColor: startable ? c.accentDefault : c.textTertiary },
                            !startable && styles.actionBtnDisabled,
                          ]}
                          onPress={() => handleStart(routine)}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !startable }}
                          accessibilityLabel={
                            startable ? `Start ${routine.name}` : `Start ${routine.name} (add an exercise first)`
                          }
                        >
                          <Ionicons name="play" size={13} color={startable ? c.accentDefault : c.textTertiary} />
                          <Text style={[styles.actionBtnPrimaryLabel, { color: startable ? c.accentDefault : c.textTertiary }]}>
                            Start
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtnGhost, { borderColor: c.borderDefault }]}
                          onPress={() => openEditor(routine)}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${routine.name}`}
                        >
                          <Ionicons name="pencil" size={13} color={c.textSecondary} />
                          <Text style={[styles.actionBtnGhostLabel, { color: c.textSecondary }]}>Edit</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.swipeHint, { color: c.textTertiary }]}>Swipe left for more</Text>
                    </View>
                  </ReanimatedSwipeable>
                );
              })
            )}

            {/* ── STARTER SPLITS section (shared section grammar — option 12) ─ */}
            <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: spacing.s5 }]}>
              STARTER SPLITS
            </Text>

            {/* Goal filter chips (option 14) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.goalChipsScroll}
              contentContainerStyle={styles.goalChipsRow}
            >
              {GOAL_CHIPS.map((g) => {
                const active = goalFilter === g.key;
                return (
                  <TouchableOpacity
                    key={g.key}
                    style={[
                      styles.goalChip,
                      {
                        backgroundColor: active ? c.accentDefault : c.bgSecondary,
                        borderColor: active ? c.accentDefault : c.borderDefault,
                      },
                    ]}
                    onPress={() => setGoalFilter(g.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Filter starter splits by ${g.label}`}
                  >
                    <Text
                      style={[
                        styles.goalChipLabel,
                        { color: active ? theme.components.buttonPrimaryText : c.textSecondary },
                      ]}
                    >
                      {g.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredTemplates.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Text style={[styles.emptyBody, { color: c.textSecondary, textAlign: 'center' }]}>
                  No starter splits match this goal.
                </Text>
              </View>
            ) : (
              // Preview cards, not bare pills (option 2).
              filteredTemplates.map((tpl) => {
                const { days, exercises } = templateCounts(tpl);
                return (
                  <TouchableOpacity
                    key={tpl.id}
                    style={[styles.templateCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}
                    onPress={() => openPreview(tpl)}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${tpl.name}`}
                  >
                    <View style={styles.templateCardTop}>
                      <Text style={[styles.templateName, { color: c.textPrimary }]} numberOfLines={1}>
                        {tpl.name}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
                    </View>
                    <Text style={[styles.templateMeta, { color: c.textSecondary }]} numberOfLines={1}>
                      {[
                        days ? `${days} day${days !== 1 ? 's' : ''}` : null,
                        exercises ? `${exercises} exercises` : null,
                        tpl.discipline,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {tpl.description ? (
                      <Text style={[styles.templateDesc, { color: c.textTertiary }]} numberOfLines={2}>
                        {tpl.description}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}

        {/* ── Toast (option 6) ─────────────────────────────────────────────── */}
        {toast ? (
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.toast, { backgroundColor: c.bgElevated, borderColor: c.borderDefault, opacity: toastOpacity }]}
          >
            <Ionicons name="checkmark-circle" size={16} color={c.accentDefault} />
            <Text style={[styles.toastText, { color: c.textPrimary }]}>{toast}</Text>
          </RNAnimated.View>
        ) : null}

        {/* ── New routine name sheet ─────────────────────────────────────── */}
        <Modal
          visible={sheetMode !== null}
          transparent
          animationType="slide"
          onRequestClose={closeSheet}
        >
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

        {/* ── Starter-split preview sheet (option 1) ───────────────────────── */}
        <TemplateDetailSheet
          visible={previewTpl !== null}
          onClose={() => setPreviewTpl(null)}
          title={previewTpl?.name ?? ''}
          description={previewTpl?.description}
          exercises={previewExercises}
          onStart={() => { if (previewTpl) handleUseTemplate(previewTpl); }}
          startLabel={previewLoading ? 'Loading…' : saving ? 'Adding…' : 'Use this'}
        />

        {/* ── Full-screen routine editor ───────────────────────────────────── */}
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
      </GestureHandlerRootView>
    </SafeAreaView>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 44,
  },
  newPillLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.s4, paddingBottom: spacing.s16 },

  // Next up / schedule card
  nextUpCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s4,
  },
  nextUpKicker: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
    marginBottom: spacing.s2,
  },
  nextUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  nextUpName: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
  },
  nextUpStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 44,
  },
  nextUpStartLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  nextUpHint: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    marginTop: spacing.s3,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    minHeight: 44,
  },
  scheduleBtnLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },

  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
    marginBottom: spacing.s3,
  },

  // Empty state
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s5,
    marginBottom: spacing.s3,
    alignItems: 'center',
    gap: spacing.s2,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    marginTop: spacing.s1,
  },
  emptyBody: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyPrimaryBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s3,
    marginTop: spacing.s2,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyPrimaryLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  emptyOr: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
  },

  // Routine card
  routineCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  routineCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.s2,
  },
  routineNameWrap: { flex: 1 },
  routineName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
  },
  renameInput: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    marginBottom: spacing.s3,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s2,
    paddingVertical: 4,
  },
  metaBadgeText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.caption,
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
    minHeight: 44,
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
    minHeight: 44,
  },
  actionBtnGhostLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
  },
  actionBtnDisabled: { opacity: 0.5 },
  swipeHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.micro,
    textAlign: 'right',
    marginTop: spacing.s2,
  },

  // Swipe actions
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.s3,
  },
  swipeAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swipeActionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
  },

  // Starter-split goal chips
  goalChipsScroll: { marginBottom: spacing.s3 },
  goalChipsRow: { flexDirection: 'row', gap: spacing.s2, paddingRight: spacing.s4 },
  goalChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 36,
    justifyContent: 'center',
  },
  goalChipLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },

  // Starter-split preview cards
  templateCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  templateCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s1,
  },
  templateName: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    marginRight: spacing.s2,
  },
  templateMeta: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
  },
  templateDesc: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: 18,
    marginTop: spacing.s2,
  },

  // Toast
  toast: {
    position: 'absolute',
    left: spacing.s4,
    right: spacing.s4,
    bottom: spacing.s8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
  },
  toastText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },

  // New-routine sheet
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
