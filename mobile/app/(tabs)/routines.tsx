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
  Share,
  Animated as RNAnimated,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '../../src/components/Icon';
import MuscleMap from '../../src/components/MuscleMap';
import { muscleGroupsForRoutine } from '../../src/data/muscleRegions';
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
import type { WorkoutTemplate } from '../../src/api/templates';
import { getStarterSplits } from '../../src/data/starterSplits';
import { TemplateDetailSheet, SheetExercise } from '../../src/components/TemplateDetailSheet';
import RoutineEditorSheet from '../../src/components/RoutineEditorSheet';
import { useTourAnchor } from '../../src/components/tour/WelcomeTour'; // TICKET-095
import ScheduleEditorSheet from '../../src/components/ScheduleEditorSheet'; // TICKET-097
import { loadSchedule, resolveNextUp, skipToNext, Schedule, NextUp, ScheduleSlot } from '../../src/data/schedule';
import { localDb } from '../../src/db/localDb'; // TICKET-097: react to schedule changes
import { createShareLink } from '../../src/data/shareLinks'; // TICKET-138
import { useTranslation } from 'react-i18next';

// ── Types ────────────────────────────────────────────────────────────────────

type SheetMode = 'new' | null;

/** Starter-split goal filters (option 14). */
type GoalFilter = 'all' | 'strength' | 'hypertrophy' | 'ppl' | 'full-body';

const GOAL_CHIPS: { key: GoalFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'tabs:routines.goalAll' },
  { key: 'strength', labelKey: 'tabs:routines.goalStrength' },
  { key: 'hypertrophy', labelKey: 'tabs:routines.goalHypertrophy' },
  { key: 'ppl', labelKey: 'tabs:routines.goalPpl' },
  { key: 'full-body', labelKey: 'tabs:routines.goalFullBody' },
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Compact relative label for an ISO timestamp, e.g. "2d ago", "3w ago". */
function relativeFromIso(iso: string | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return null;
  const day = 86_400_000;
  const days = Math.floor(diffMs / day);
  if (days === 0) return t('tabs:routines.relToday');
  if (days === 1) return t('tabs:routines.relYesterday');
  if (days < 7) return t('tabs:routines.relDaysAgo', { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t('tabs:routines.relWeeksAgo', { count: weeks });
  const months = Math.floor(days / 30);
  return months <= 1 ? t('tabs:routines.relMonthAgo') : t('tabs:routines.relMonthsAgo', { count: months });
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

// ── Module-level cache ─────────────────────────────────────────────────────────
// Seeded from the previous load so re-entering the tab paints the real list
// instantly instead of an empty/loading shell. The SELECT is local-first SQLite
// (free) and resolves in a few ms, but even that flashes on a fast re-focus; the
// cache removes the flash. Persists for the app session (module scope), survives
// unmount/remount of the screen, and is updated on every successful load.
let cachedRoutines: Routine[] = [];
let cachedLastPerformed: Map<string, string> = new Map();

// ── Component ────────────────────────────────────────────────────────────────

export default function RoutinesPage(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { t } = useTranslation();

  // TICKET-095: anchor the "＋ New" button so the welcome tour can spotlight it.
  const newRoutineAnchor = useTourAnchor('routines-new');
  // TICKET-097: schedule editor + next-up.
  const scheduleAnchor = useTourAnchor('routines-create-schedule');
  const [scheduleEditorVisible, setScheduleEditorVisible] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  // ── State ─────────────────────────────────────────────────────────────────
  // Seed from the module cache so re-entry paints the real list immediately —
  // the page shell + section headers always render (no full-screen spinner gate).
  const [routines, setRoutines] = useState<Routine[]>(cachedRoutines);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(getStarterSplits());
  const [lastPerformed, setLastPerformed] = useState<Map<string, string>>(cachedLastPerformed);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  // Full-screen exercise editor (rename + add/remove/reorder exercises).
  const [editorRoutine, setEditorRoutine] = useState<Routine | null>(null);
  // Inline rename after a duplicate (option 6): the row id being renamed.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Starter-split preview sheet (option 1). Splits are bundled on-device, so
  // there is no async fetch / loading state for the preview anymore.
  const [previewTpl, setPreviewTpl] = useState<WorkoutTemplate | null>(null);
  // Goal filter for starter splits (option 14).
  const [goalFilter, setGoalFilter] = useState<GoalFilter>('all');
  // Lightweight toast (option 6).
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new RNAnimated.Value(0)).current;
  // 2026-07-14 outage postmortem: a failed list fetch used to fail SILENTLY,
  // so a Pro user with an unreachable server saw an empty list that looked
  // exactly like data loss ("I have to remake all of my routines"). Track the
  // failure so the UI can say "your routines are safe" instead.
  const [loadError, setLoadError] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      // Only the user's OWN routines are awaited — they come from on-device
      // SQLite (free) and resolve instantly. Starter splits are now bundled
      // on-device (getStarterSplits), so the page no longer blocks on a cold
      // GET /templates round-trip (the #1 startup-lag complaint).
      const r = await listRoutines(user);
      cachedRoutines = r; // refresh the module cache for instant re-entry
      setRoutines(r);
      setLoadError(false);
      setTemplates(getStarterSplits());
      // Best-effort last-performed (option 5) — never blocks the list render.
      getLastPerformedMap(user, r)
        .then((m) => {
          cachedLastPerformed = m;
          setLastPerformed(m);
        })
        .catch(() => {});
    } catch {
      // Keep whatever the cache last showed, but SAY the fetch failed — an
      // unexplained empty list reads as data loss (2026-07-14 outage).
      setLoadError(true);
    }
  }, [user]);

  // Refresh on every focus (not just first mount). useFocusEffect re-runs each
  // time the tab regains focus, so the list self-heals the intermittent blank
  // (e.g. when a routine was created/edited on another screen) without ever
  // blocking the shell — cached data stays on screen while loadData resolves.
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

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
      Alert.alert(t('tabs:routines.errorTitle'), err instanceof Error ? err.message : t('tabs:routines.couldNotSaveRoutine'));
    } finally {
      setSaving(false);
    }
  }, [nameInput, closeSheet, user, userId]);

  const handleDelete = useCallback((routine: Routine) => {
    Alert.alert(
      t('tabs:routines.deleteRoutineTitle'),
      t('tabs:routines.deleteRoutineMessage', { name: routine.name }),
      [
        { text: t('tabs:routines.cancel'), style: 'cancel' },
        {
          text: t('tabs:routines.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoutine(user, routine.id);
              setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
            } catch {
              Alert.alert(t('tabs:routines.errorTitle'), t('tabs:routines.couldNotDeleteRoutine'));
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
      showToast(t('tabs:routines.copiedToYours'));
      setRenamingId(copy.id);
      setRenameValue(copy.name);
    } catch (err) {
      Alert.alert(t('tabs:routines.errorTitle'), err instanceof Error ? err.message : t('tabs:routines.couldNotDuplicateRoutine'));
    }
  }, [user, userId, showToast]);

  // TICKET-138: share a routine via a server-hosted link + OS share sheet.
  // Creating a share link is an explicit, user-initiated network action —
  // allowed on BOTH tiers (see tierPolicy.ts comment next to the weekly-signal
  // carve-out). It always requires an account (server-hosted), so it is
  // gated on being signed in at all, never on is_paid.
  const [sharingId, setSharingId] = useState<string | null>(null);
  const handleShare = useCallback(async (routine: Routine) => {
    if (!userId) {
      Alert.alert(t('tabs:routines.signInRequiredTitle'), t('tabs:routines.signInRequiredMessage'));
      return;
    }
    if (routine.exercises.length === 0) {
      Alert.alert(t('tabs:routines.addExerciseFirstTitle'), t('tabs:routines.addExerciseFirstMessage', { name: routine.name }));
      return;
    }
    setSharingId(routine.id);
    try {
      const link = await createShareLink(routine.id);
      await Share.share({
        message: t('tabs:routines.shareMessage', { name: routine.name, link: link.deep_link, previewUrl: link.preview_url }),
        url: link.deep_link, // iOS uses `url` when present
      });
    } catch (err) {
      Alert.alert(t('tabs:routines.errorTitle'), err instanceof Error ? err.message : t('tabs:routines.couldNotCreateShareLink'));
    } finally {
      setSharingId(null);
    }
  }, [userId]);

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
      Alert.alert(t('tabs:routines.errorTitle'), t('tabs:routines.couldNotRenameRoutine'));
    }
  }, [renamingId, renameValue, routines, user]);

  // Add a starter split to "Yours". Multi-day splits (Push/Pull/Legs) become ONE
  // routine PER DAY so each maps to a real session — which also feeds the
  // per-routine history folders on Home. All bundled, so no network is needed.
  const handleUseTemplate = useCallback(async (tpl: WorkoutTemplate) => {
    setSaving(true);
    try {
      const sessions = tpl.sessions ?? [];
      if (sessions.length === 0) throw new Error('This split has no sessions.');
      const created: Routine[] = [];
      for (const session of sessions) {
        const exercises = (session.exercises ?? []).map((ex) => ({
          // TICKET-088: bundled exercises have no library UUID — name is source of truth.
          exercise_id: undefined,
          name: ex.exercise_name,
          target_sets: ex.sets,
          target_reps: ex.reps,
        }));
        const name = sessions.length > 1 ? session.session_name : tpl.name;
        created.push(await createRoutine(user, { name, exercises }, userId));
      }
      setRoutines((prev) => [...created, ...prev]);
      setPreviewTpl(null);
      showToast(created.length > 1 ? t('tabs:routines.addedRoutinesCount', { count: created.length }) : t('tabs:routines.copiedToYours'));
    } catch (err) {
      Alert.alert(t('tabs:routines.errorTitle'), err instanceof Error ? err.message : t('tabs:routines.couldNotAddSplit'));
    } finally {
      setSaving(false);
    }
  }, [user, userId, showToast]);

  // Open the starter-split preview sheet (option 1). Splits are bundled on-device
  // with their full session/exercise lists, so this is instant — no fetch.
  const openPreview = useCallback((tpl: WorkoutTemplate) => {
    setPreviewTpl(tpl);
  }, []);

  /** Start a routine → navigate to Home with routineId param (TICKET-084). */
  const handleStart = useCallback((routine: Routine) => {
    if (routine.exercises.length === 0) {
      Alert.alert(
        t('tabs:routines.addExerciseFirstTitle'),
        t('tabs:routines.addExerciseFirstBeforeStartMessage', { name: routine.name }),
        [
          { text: t('tabs:routines.notNow'), style: 'cancel' },
          { text: t('tabs:routines.editRoutine'), onPress: () => setEditorRoutine(routine) },
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
      Alert.alert(t('tabs:routines.restDayTitle'), t('tabs:routines.restDayMessage'));
      return;
    }
    const name = routines.find((r) => r.id === nu.slot.routineId)?.name ?? nu.slot.routineName ?? '';
    router.push(`/(tabs)?routineId=${nu.slot.routineId}&routineName=${encodeURIComponent(name)}`);
  }, [router, routines]);

  // Skip the current next-up without logging it: advance the cycle pointer (or,
  // for a weekly schedule, skip today so next-up jumps to the next training day).
  const handleSkipNextUp = useCallback(async () => {
    const next = await skipToNext();
    if (next) setSchedule(next);
  }, []);

  const hasSchedule =
    !!schedule && (schedule.cycle.length > 0 || schedule.weekly.some((x) => !!x));
  const nextUp = hasSchedule ? resolveNextUp(schedule) : null;
  // Skipping only makes sense when there's somewhere else to go: a cycle with
  // more than one slot, or any weekly schedule (skip to the next training day).
  const canSkip =
    !!nextUp &&
    !!schedule &&
    (schedule.mode === 'weekly' ? true : schedule.cycle.length > 1);
  const nextUpName =
    nextUp && nextUp.slot.routineId
      ? routines.find((r) => r.id === nextUp.slot.routineId)?.name ?? nextUp.slot.routineName ?? t('tabs:routines.routineFallbackName')
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
      if (slot?.routineId) map.set(slot.routineId, t('tabs:routines.nextInCycle'));
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

  // Build the exercise list for the preview sheet (option 1). Multi-day splits
  // show EVERY day's exercises, prefixed with the day name (e.g. "Push · …") so
  // the user sees the whole split before adding it.
  const previewExercises: SheetExercise[] = useMemo(() => {
    if (!previewTpl) return [];
    const sessions = previewTpl.sessions ?? [];
    const multiDay = sessions.length > 1;
    const out: SheetExercise[] = [];
    for (const session of sessions) {
      for (const ex of session.exercises ?? []) {
        out.push({
          name: multiDay ? `${session.session_name} · ${ex.exercise_name}` : ex.exercise_name,
          sets: ex.sets,
          reps: ex.reps,
          rest_s: ex.rest_seconds,
          form_cue: ex.form_cue,
        });
      }
    }
    return out;
  }, [previewTpl]);

  // ── Swipe action renderers (option 7) ───────────────────────────────────────
  const renderRightActions = useCallback((routine: Routine) => () => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.bgElevated }]}
        onPress={() => handleShare(routine)}
        disabled={sharingId === routine.id}
        accessibilityRole="button"
        accessibilityLabel={t('tabs:routines.shareRoutine', { name: routine.name })}
      >
        {sharingId === routine.id ? (
          <ActivityIndicator size="small" color={c.accentDefault} />
        ) : (
          <Ionicons name="share-outline" size={18} color={c.accentDefault} />
        )}
        <Text style={[styles.swipeActionLabel, { color: c.accentDefault }]}>{t('tabs:routines.share')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.accentSecondary }]}
        onPress={() => handleDuplicateRoutine(routine)}
        accessibilityRole="button"
        accessibilityLabel={t('tabs:routines.duplicateRoutine', { name: routine.name })}
      >
        <Ionicons name="copy-outline" size={18} color={c.accentDefault} />
        <Text style={[styles.swipeActionLabel, { color: c.accentDefault }]}>{t('tabs:routines.copy')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.bgElevated }]}
        onPress={() => openEditor(routine)}
        accessibilityRole="button"
        accessibilityLabel={t('tabs:routines.editRoutineLabel', { name: routine.name })}
      >
        <Ionicons name="pencil" size={18} color={c.textSecondary} />
        <Text style={[styles.swipeActionLabel, { color: c.textSecondary }]}>{t('tabs:routines.edit')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, { backgroundColor: c.statusError }]}
        onPress={() => handleDelete(routine)}
        accessibilityRole="button"
        accessibilityLabel={t('tabs:routines.deleteRoutineLabel', { name: routine.name })}
      >
        <Ionicons name="trash-outline" size={18} color={theme.components.buttonDestructiveText} />
        <Text style={[styles.swipeActionLabel, { color: theme.components.buttonDestructiveText }]}>
          {t('tabs:routines.delete2')}
        </Text>
      </TouchableOpacity>
    </View>
  ), [c, theme, handleShare, sharingId, handleDuplicateRoutine, openEditor, handleDelete]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    // 2026-07-21: plain View, NOT SafeAreaView. This screen renders under the
    // tab navigator's header, which already clears the notch; on the New
    // Architecture SafeAreaView pads the raw window inset regardless of
    // position, so a top edge here doubled the clearance (~60pt dead band).
    <View style={[styles.root, { backgroundColor: c.bgPrimary }]}>
      <GestureHandlerRootView style={styles.root}>
        {/* ── Page header — single clear "＋ New" (option 4) ─────────────── */}
        <View style={[styles.pageHeader, { borderBottomColor: c.borderDefault }]}>
          <Text style={[styles.pageTitle, { color: c.textPrimary }]}>{t('tabs:routines.pageTitle')}</Text>
          <TouchableOpacity
            ref={newRoutineAnchor.ref}
            style={[styles.newPill, { backgroundColor: c.accentDefault }]}
            onPress={openNewSheet}
            accessibilityRole="button"
            accessibilityLabel={t('tabs:routines.newRoutine')}
          >
            <Ionicons name="add" size={16} color={theme.components.buttonPrimaryText} />
            <Text style={[styles.newPillLabel, { color: theme.components.buttonPrimaryText }]}>{t('tabs:routines.new')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
            {/* ── TICKET-097: Schedule / Next up (scheduling lives here now) ─ */}
            <View style={[styles.nextUpCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              {nextUp ? (
                <>
                  <View style={styles.nextUpKickerRow}>
                    <Text style={[styles.nextUpKicker, { color: c.textTertiary }]}>
                      {nextUp.whenLabel.toUpperCase()}
                    </Text>
                    {canSkip ? (
                      <TouchableOpacity
                        onPress={handleSkipNextUp}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('tabs:routines.skipLabel', { what: nextUp.isRest ? t('tabs:routines.restDayLower') : nextUpName ?? t('tabs:routines.thisRoutine') })}
                      >
                        <Text style={[styles.nextUpSkip, { color: c.accentDefault }]}>{t('tabs:routines.skip')}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={styles.nextUpRow}>
                    <Text style={[styles.nextUpName, { color: c.textPrimary }]} numberOfLines={1}>
                      {nextUp.isRest ? t('tabs:routines.restDay') : nextUpName}
                    </Text>
                    {!nextUp.isRest ? (
                      <TouchableOpacity
                        onPress={() => handleStartNextUp(nextUp)}
                        style={[styles.nextUpStart, { backgroundColor: c.accentDefault }]}
                        accessibilityRole="button"
                        accessibilityLabel={t('tabs:routines.startLabel', { name: nextUpName ?? t('tabs:routines.nextWorkoutFallback') })}
                      >
                        <Ionicons name="play" size={13} color={theme.components.buttonPrimaryText} />
                        <Text style={[styles.nextUpStartLabel, { color: theme.components.buttonPrimaryText }]}>
                          {t('tabs:routines.start')}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={[styles.nextUpHint, { color: c.textSecondary }]}>
                  {t('tabs:routines.nextUpHint')}
                </Text>
              )}
              <TouchableOpacity
                ref={scheduleAnchor.ref}
                onPress={openScheduleEditor}
                style={[styles.scheduleBtn, { borderColor: c.accentDefault }]}
                accessibilityRole="button"
                accessibilityLabel={hasSchedule ? t('tabs:routines.editSchedule') : t('tabs:routines.createSchedule')}
              >
                <Ionicons name="calendar-outline" size={14} color={c.accentDefault} />
                <Text style={[styles.scheduleBtnLabel, { color: c.accentDefault }]}>
                  {hasSchedule ? t('tabs:routines.editSchedule') : t('tabs:routines.createSchedule')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── YOURS section (shared section grammar — option 12) ──────── */}
            <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>{t('tabs:routines.yoursSectionLabel')}</Text>

            {loadError ? (
              // Fetch failed: reassure + retry. NEVER render the "no routines
              // yet" empty state on a failed fetch — it reads as data loss.
              <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Ionicons name="cloud-offline-outline" size={28} color={c.textTertiary} />
                <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('tabs:routines.loadFailedTitle')}</Text>
                <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                  {t('tabs:routines.loadFailedBody')}
                </Text>
                <TouchableOpacity
                  style={[styles.emptyPrimaryBtn, { backgroundColor: c.accentDefault }]}
                  onPress={() => { void loadData(); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('tabs:routines.loadFailedRetry')}
                >
                  <Text style={[styles.emptyPrimaryLabel, { color: theme.components.buttonPrimaryText }]}>
                    {t('tabs:routines.loadFailedRetry')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {routines.length === 0 && !loadError ? (
              // Real empty state + CTAs (option 3).
              <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Ionicons name="barbell-outline" size={28} color={c.textTertiary} />
                <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('tabs:routines.noRoutinesYet')}</Text>
                <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                  {t('tabs:routines.noRoutinesBody')}
                </Text>
                <TouchableOpacity
                  style={[styles.emptyPrimaryBtn, { backgroundColor: c.accentDefault }]}
                  onPress={openNewSheet}
                  accessibilityRole="button"
                  accessibilityLabel={t('tabs:routines.buildFirstRoutine')}
                >
                  <Text style={[styles.emptyPrimaryLabel, { color: theme.components.buttonPrimaryText }]}>
                    {t('tabs:routines.buildFirstRoutine')}
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.emptyOr, { color: c.textTertiary }]}>{t('tabs:routines.orDuplicateBelow')}</Text>
              </View>
            ) : (
              routines.map((routine) => {
                const startable = routine.exercises.length > 0;
                const last = relativeFromIso(lastPerformed.get(routine.id), t);
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
                            accessibilityLabel={t('tabs:routines.renameRoutine')}
                          />
                        ) : (
                          <TouchableOpacity
                            style={styles.routineNameWrap}
                            onPress={() => openEditor(routine)}
                            accessibilityRole="button"
                            accessibilityLabel={t('tabs:routines.editRoutineLabel', { name: routine.name })}
                          >
                            <Text style={[styles.routineName, { color: c.textPrimary }]} numberOfLines={1}>
                              {routine.name}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {/* P2: compact muscle map (right of the name). Non-interactive so
                            it never intercepts the name tap; shown only when the routine
                            has exercises to highlight. */}
                        {routine.exercises.length > 0 ? (
                          <View pointerEvents="none" style={styles.routineMap}>
                            <MuscleMap
                              groups={muscleGroupsForRoutine(routine.exercises)}
                              size={36}
                              view="front"
                            />
                          </View>
                        ) : null}
                      </View>

                      {/* Meta badges: exercise count · last performed */}
                      <View style={styles.metaRow}>
                        <View style={[styles.metaBadge, { backgroundColor: c.bgTertiary }]}>
                          <Ionicons name="list-outline" size={12} color={c.textSecondary} />
                          <Text style={[styles.metaBadgeText, { color: c.textSecondary }]}>
                            {t('tabs:routines.exerciseCount', { count: routine.exercises.length })}
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
                            accessibilityLabel={t('tabs:routines.scheduledEditSchedule', { chip })}
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
                            startable ? t('tabs:routines.startLabel', { name: routine.name }) : t('tabs:routines.startRoutineDisabled', { name: routine.name })
                          }
                        >
                          <Ionicons name="play" size={13} color={startable ? c.accentDefault : c.textTertiary} />
                          <Text style={[styles.actionBtnPrimaryLabel, { color: startable ? c.accentDefault : c.textTertiary }]}>
                            {t('tabs:routines.start')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtnGhost, { borderColor: c.borderDefault }]}
                          onPress={() => openEditor(routine)}
                          accessibilityRole="button"
                          accessibilityLabel={t('tabs:routines.editRoutineLabel', { name: routine.name })}
                        >
                          <Ionicons name="pencil" size={13} color={c.textSecondary} />
                          <Text style={[styles.actionBtnGhostLabel, { color: c.textSecondary }]}>{t('tabs:routines.edit')}</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.swipeHint, { color: c.textTertiary }]}>{t('tabs:routines.swipeForMore')}</Text>
                    </View>
                  </ReanimatedSwipeable>
                );
              })
            )}

            {/* ── STARTER SPLITS section (shared section grammar — option 12) ─ */}
            <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: spacing.s5 }]}>
              {t('tabs:routines.starterSplitsSectionLabel')}
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
                    accessibilityLabel={t('tabs:routines.filterByGoal', { goal: t(g.labelKey as any) })}
                  >
                    <Text
                      style={[
                        styles.goalChipLabel,
                        { color: active ? theme.components.buttonPrimaryText : c.textSecondary },
                      ]}
                    >
                      {t(g.labelKey as any)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {filteredTemplates.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
                <Text style={[styles.emptyBody, { color: c.textSecondary, textAlign: 'center' }]}>
                  {t('tabs:routines.noStarterSplitsMatch')}
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
                    accessibilityLabel={t('tabs:routines.previewTemplate', { name: tpl.name })}
                  >
                    <View style={styles.templateCardTop}>
                      <Text style={[styles.templateName, { color: c.textPrimary }]} numberOfLines={1}>
                        {tpl.name}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={c.textTertiary} />
                    </View>
                    <Text style={[styles.templateMeta, { color: c.textSecondary }]} numberOfLines={1}>
                      {[
                        days ? t('tabs:routines.dayCount', { count: days }) : null,
                        exercises ? t('tabs:routines.exercisesCountPlain', { count: exercises }) : null,
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
              <Text style={styles.sheetTitle}>{t('tabs:routines.newRoutine')}</Text>
              <TextInput
                style={styles.sheetInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder={t('tabs:routines.pushAPlaceholder')}
                placeholderTextColor={stepperPalette.muted}
                autoFocus
                maxLength={100}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.sheetCancelBtn} onPress={closeSheet}>
                  <Text style={styles.sheetCancelLabel}>{t('tabs:routines.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetSaveBtn, !nameInput.trim() && styles.sheetSaveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving || !nameInput.trim()}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={stepperPalette.accentInk} />
                    : <Text style={styles.sheetSaveLabel}>{t('tabs:routines.create')}</Text>
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
          startLabel={saving ? t('tabs:routines.adding') : t('tabs:routines.useThis')}
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
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.s4, paddingBottom: spacing.s16 },

  // Next up / schedule card
  nextUpCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s4,
  },
  nextUpKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  nextUpKicker: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
  },
  nextUpSkip: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
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
  routineMap: { marginLeft: spacing.s2 },
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
