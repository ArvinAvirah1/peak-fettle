/**
 * Log tab — active workout header + set list + exercise picker + set entry form.
 *
 * TICKET-017: core set-tracking flow.
 * TICKET-027: PowerSync offline sync integration (read path wired; sync indicator added).
 *
 * Data architecture (post TICKET-027):
 *   READ  — usePowerSyncWorkout(todayKey): reactive SQLite queries via PowerSync.
 *           Updates automatically when sync pushes new data or local writes land.
 *   WRITE — apiLogSet / apiDeleteSet called directly. PowerSync connector queues
 *           these via uploadData() → Express API → Postgres → sync back to SQLite.
 *           createWorkout() is called once on mount to ensure today's row exists
 *           server-side; PowerSync syncs it down so the reactive query picks it up.
 *
 * Sections:
 *   A. Workout header  — date, set count, elapsed timer, sync indicator, "+" button
 *   B. Rest day link   — shown when no sets logged yet
 *   C. Set list        — sets grouped by exercise, trash to delete
 *   D. ExercisePicker  — modal search + browse
 *   E. SetEntryForm    — modal lift/cardio form
 *   F. Rest timer banner — dismissible countdown after each set
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '../../src/components/Icon';
import { useAuth } from '../../src/hooks/useAuth';
import { usePowerSyncLog } from '../../src/hooks/usePowerSyncLog';
import { ExercisePicker } from '../../src/components/ExercisePicker';
// SetEntryForm is kept on disk but no longer rendered as the primary path (TICKET-080 §3)
// import { SetEntryForm } from '../../src/components/SetEntryForm';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { formatWeight } from '../../src/constants/units';
import { Exercise, WorkoutSet, LiftSet, CardioSet } from '../../src/types/api';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';
import { logRestDay, undoRestDay } from '../../src/api/workouts';
import { getExercises } from '../../src/api/exercises';
import { getRoutine } from '../../src/api/routines';
import { getPersonalBest, getPersonalBests, PersonalBest } from '../../src/api/sets';
import { ScreenLayout } from '../../src/components/ui';
import { RoutineStrip, RoutineSession, RoutineSessionExercise } from '../../src/components/RoutineStrip';
import StepperLogger, { LoggedSet } from '../../src/components/StepperLogger';
import { suggestNextExercise, suggestNextExercises, SessionExercise, SuggestCandidate } from '../../src/utils/smartSuggest';
// TICKET-082 Part B: alternatives API (created by Agent 3; import against frozen contract)
// eslint-disable-next-line @typescript-eslint/no-var-requires
let getAlternativesApi: ((exerciseId: string, opts?: { avoid?: string; limit?: number }) => Promise<import('../../src/api/alternatives').AlternativesResult>) | null = null;
try {
  // Dynamic require so the file compiles even if Agent 3 hasn't created it yet
  // at parse time. At runtime it will be present.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getAlternativesApi = require('../../src/api/alternatives').getAlternatives;
} catch {
  getAlternativesApi = null;
}

// MOCK-002 fix (2026-05-16): the previous `MOCK_WORKOUT` constant was
// unconditionally injected as the active workout regardless of auth state.
// `MOCK_WORKOUT.id = 'mock-workout-today'` is not a valid UUID, so every
// POST /sets payload using it was rejected 403 by the server's T-03
// ownership check — the Log tab was non-functional against any real
// backend. Now we use the canonical `usePowerSyncLog()` hook (TICKET-027)
// which calls `createWorkout()` on mount to obtain a real workout UUID and
// reactively watches local SQLite for set changes synced from the server.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTodayHeader(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDuration(durationSec: number): string {
  const mm = Math.floor(durationSec / 60);
  const ss = durationSec % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function formatDistance(distanceM: number | null, unitPref: 'kg' | 'lbs'): string | null {
  if (distanceM === null) return null;
  if (unitPref === 'lbs') {
    return `${(distanceM / 1609.344).toFixed(2)} mi`;
  }
  return `${(distanceM / 1000).toFixed(2)} km`;
}

// P1-001a: Format MM:SS for elapsed session timer and rest timer
function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Group sets by exercise_id, preserving insertion order of first occurrence.
interface ExerciseGroup {
  exerciseId: string;
  sets: WorkoutSet[];
}

function groupSetsByExercise(sets: WorkoutSet[]): ExerciseGroup[] {
  const map = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const list = map.get(s.exercise_id) ?? [];
    list.push(s);
    map.set(s.exercise_id, list);
  }
  return Array.from(map.entries()).map(([exerciseId, groupSets]) => ({
    exerciseId,
    sets: groupSets,
  }));
}

function countSetsForExercise(sets: WorkoutSet[], exerciseId: string): number {
  return sets.filter((s) => s.exercise_id === exerciseId).length;
}

// ---------------------------------------------------------------------------
// SetRow
// ---------------------------------------------------------------------------

interface SetRowProps {
  set: WorkoutSet;
  setNumber: number;
  unitPref: 'kg' | 'lbs';
  onDelete: (id: string) => void;
}

function SetRow({ set, setNumber, unitPref, onDelete }: SetRowProps): React.ReactElement {
  const { theme } = useTheme();

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Set', 'Remove this set from your workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete(set.id),
      },
    ]);
  }, [set.id, onDelete]);

  let primaryLabel: string;
  let secondaryLabel: string | null = null;
  let rirLabel: string | null = null;

  if (set.kind === 'lift') {
    const liftSet = set as LiftSet;
    // P1-009: tabular-nums applied via style on the Text elements below
    primaryLabel = `${formatWeight(liftSet.weight_kg, unitPref)} × ${liftSet.reps} reps`;
    if (liftSet.rir !== null && liftSet.rir >= 0) {
      rirLabel = liftSet.rir === 0 ? 'to failure' : `RIR ${liftSet.rir}`;
    }
  } else {
    const cardioSet = set as CardioSet;
    primaryLabel = formatDuration(cardioSet.duration_sec);
    const dist = formatDistance(cardioSet.distance_m, unitPref);
    if (dist) secondaryLabel = dist;
  }

  return (
    <View style={[rowStyles.container, { borderBottomColor: theme.colors.bgSecondary }]}>
      <View style={[rowStyles.setNum, { backgroundColor: theme.colors.accentSecondary }]}>
        <Text style={[rowStyles.setNumText, { color: theme.colors.accentHover }]}>{setNumber}</Text>
      </View>
      <View style={rowStyles.labels}>
        {/* P1-009: tabular-nums on weight/rep values */}
        <Text style={[rowStyles.primary, { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>{primaryLabel}</Text>
        {secondaryLabel ? (
          <Text style={[rowStyles.secondary, { color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] }]}>{secondaryLabel}</Text>
        ) : null}
        {rirLabel ? (
          <Text style={[rowStyles.rir, { color: theme.colors.accentDefault }]}>{rirLabel}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={rowStyles.deleteButton}
        onPress={handleDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Delete set"
      >
        <Text style={rowStyles.deleteIcon}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    borderBottomWidth: 1,
    minHeight: 64, // P1-002: was 56
  },
  setNum: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  setNumText: {
    fontSize: fontSize.bodySm,       // E-003: was 13 (nearest token)
    fontWeight: fontWeight.bold,     // E-003: was '700'
  },
  labels: {
    flex: 1,
    gap: 2,
  },
  primary: {
    fontSize: fontSize.bodyMd,       // E-003: was 16
    fontWeight: fontWeight.medium,   // E-003: was '500'
  },
  secondary: {
    fontSize: fontSize.bodySm,       // E-003: was 13 (nearest token)
  },
  rir: {
    fontSize: fontSize.caption,      // E-003: was 12
  },
  deleteButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    fontSize: fontSize.bodyMd,       // E-003: was 16
  },
});

// ---------------------------------------------------------------------------
// ExerciseGroupCard
// ---------------------------------------------------------------------------

interface ExerciseGroupCardProps {
  group: ExerciseGroup;
  exerciseNames: Map<string, string>;
  unitPref: 'kg' | 'lbs';
  onDelete: (id: string) => void;
}

function ExerciseGroupCard({
  group,
  exerciseNames,
  unitPref,
  onDelete,
}: ExerciseGroupCardProps): React.ReactElement {
  const { theme } = useTheme();
  const name = exerciseNames.get(group.exerciseId) ?? group.exerciseId;
  return (
    <View style={[
      cardStyles.container,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      <View style={[cardStyles.header, { borderBottomColor: theme.colors.borderDefault }]}>
        <Text style={[cardStyles.exerciseName, { color: theme.colors.textPrimary }]}>{name}</Text>
        {/* P1-009: tabular-nums on set count */}
        <Text style={[cardStyles.setCount, { color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] }]}>
          {group.sets.length} set{group.sets.length !== 1 ? 's' : ''}
        </Text>
      </View>
      {group.sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          setNumber={i + 1}
          unitPref={unitPref}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  exerciseName: {
    fontSize: fontSize.bodyMd,       // E-003: was 15 (nearest token: bodyMd=16)
    fontWeight: fontWeight.bold,     // E-003: was '700'
    flex: 1,
  },
  setCount: {
    fontSize: fontSize.bodySm,       // E-003: was 13 (nearest token)
    marginLeft: 8,
  },
});

// ---------------------------------------------------------------------------
// Rest timer banner constants
// ---------------------------------------------------------------------------

const REST_DEFAULT = 90; // seconds

// ---------------------------------------------------------------------------
// PaywallUpgradeModal — Phase 1.5
// Non-blocking sheet shown exactly once when the user crosses the free-tier
// session limit (server signals paywall_trigger=true on POST /workouts).
// ---------------------------------------------------------------------------

interface PaywallUpgradeModalProps {
  visible: boolean;
  onDismiss: () => void;
  onUpgrade: () => void;
}

function PaywallUpgradeModal({
  visible,
  onDismiss,
  onUpgrade,
}: PaywallUpgradeModalProps): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable
        style={[paywallStyles.backdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={onDismiss}
        accessibilityLabel="Dismiss upgrade prompt"
      />

      {/* Sheet */}
      <View
        style={[
          paywallStyles.sheet,
          {
            backgroundColor: theme.colors.bgPrimary,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s5,
            paddingBottom: spacing.s6,
          },
        ]}
      >
        {/* Drag pill */}
        <View
          style={[
            paywallStyles.pill,
            {
              backgroundColor: theme.colors.borderDefault,
              borderRadius: radius.full ?? 999,
              marginBottom: spacing.s5,
            },
          ]}
        />

        {/* Icon */}
        <View style={[paywallStyles.iconRow, { marginBottom: spacing.s3 }]}>
          <View
            style={[
              paywallStyles.iconCircle,
              {
                backgroundColor: theme.colors.accentSecondary,
                borderRadius: radius.full ?? 999,
              },
            ]}
          >
            <Ionicons name="flash" size={28} color={theme.colors.accentDefault} />
          </View>
        </View>

        {/* Headline */}
        <Text
          style={{
            fontSize: fontSize.display,
            fontWeight: fontWeight.bold,
            color: theme.colors.textPrimary,
            textAlign: 'center',
            marginBottom: spacing.s2,
          }}
        >
          You're on a roll!
        </Text>

        {/* Sub-copy */}
        <Text
          style={{
            fontSize: fontSize.bodyMd,
            color: theme.colors.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: spacing.s5,
          }}
        >
          You've hit your 5 free sessions. Upgrade to Peak Fettle Pro for{' '}
          <Text style={{ fontWeight: fontWeight.bold, color: theme.colors.textPrimary }}>
            personalized AI training plans
          </Text>{' '}
          that adapt to your progress.
        </Text>

        {/* Upgrade CTA */}
        <TouchableOpacity
          style={[
            paywallStyles.upgradeBtn,
            {
              backgroundColor: theme.colors.accentDefault,
              borderRadius: radius.md,
              paddingVertical: spacing.s4,
              marginBottom: spacing.s3,
            },
          ]}
          onPress={onUpgrade}
          accessibilityRole="button"
          accessibilityLabel="Upgrade to Pro"
        >
          <Text
            style={{
              fontSize: fontSize.bodyLg,
              fontWeight: fontWeight.bold,
              color: theme.components.buttonPrimaryText,
              textAlign: 'center',
            }}
          >
            See Plans
          </Text>
        </TouchableOpacity>

        {/* Dismiss */}
        <TouchableOpacity
          style={[paywallStyles.dismissBtn, { paddingVertical: spacing.s3 }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
        >
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: theme.colors.textTertiary,
              textAlign: 'center',
            }}
          >
            Maybe later
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const paywallStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  pill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
  },
  iconRow: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBtn: {
    alignItems: 'center',
  },
  dismissBtn: {
    alignItems: 'center',
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LogScreen(): React.ReactElement {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
  const unitPref = user?.unit_pref ?? 'kg';

  // TICKET-027: PowerSync offline-first hook. Calls createWorkout() on mount
  // to obtain a server-assigned workout UUID; reactively watches the local
  // SQLite `sets` table (which is bidirectionally synced via PowerSync).
  // Writes go to local SQLite first and PowerSync drains them to the server
  // when the device is online.
  const {
    workout,
    sets,
    isLoading,
    error: errorMessage,
    logSet,
    deleteSet,
    paywallTriggered,
  } = usePowerSyncLog();

  // Phase 1.5: show upgrade modal once when server flags paywall_trigger.
  const [showPaywall, setShowPaywall] = useState(false);
  useEffect(() => {
    if (paywallTriggered) {
      // Slight delay so the screen finishes loading before the modal appears.
      const t = setTimeout(() => setShowPaywall(true), 800);
      return () => clearTimeout(t);
    }
  }, [paywallTriggered]);

  // Modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());

  // P1-001a: Elapsed session timer
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [timerActive, setTimerActive] = React.useState(false);

  useEffect(() => {
    if (!timerActive) return;
    const interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerActive]);

  // P1-001b: Rest timer state
  const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (restSecondsLeft === null || restSecondsLeft <= 0) {
      if (restSecondsLeft === 0) haptics.light(); // gentle nudge when done
      setRestSecondsLeft(null);
      return;
    }
    const t = setTimeout(() => setRestSecondsLeft(s => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [restSecondsLeft]);

  // PL-3 / TICKET-054: Rest day state — hydrated from workout.session_type so the
  // button reflects the real server state after a mount or a background refresh.
  // workout is returned by usePowerSyncLog() which calls POST /workouts on mount;
  // POST /workouts now returns session_type in the RETURNING clause, so if today's
  // row already has session_type='rest_day' this will be true immediately.
  const [restDayLoading, setRestDayLoading] = useState(false);
  const restDayLogged = workout?.session_type === 'rest_day';
  const [exercisePB, setExercisePB] = useState<PersonalBest | null>(null);

  // ── TICKET-055/056: Routine session state ─────────────────────────────────
  // Set when the user taps "Start" on a routine/template from the RoutineStrip.
  // exercises tracks per-exercise logged set counts + done state for the checklist.
  const [routineSession, setRoutineSession] = useState<RoutineSession | null>(null);

  /** Update a single exercise in the active routine session (e.g. after logging a set). */
  const updateRoutineExercise = useCallback((exerciseId: string) => {
    setRoutineSession((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((ex) =>
          ex.exerciseId === exerciseId
            ? { ...ex, loggedSetCount: ex.loggedSetCount + 1, done: true }
            : ex
        ),
      };
    });
  }, []);

  const handleStartRoutine = useCallback((session: RoutineSession) => {
    setRoutineSession(session);
  }, []);

  // ── TICKET-059/060: Focus Stepper visibility + per-exercise set cache ──────
  // stepperSets maps exerciseId → sets logged THIS session so the stepper can
  // display chips without re-querying PowerSync.
  const [stepperVisible, setStepperVisible] = useState(false);
  const [stepperSets, setStepperSets] = useState<Map<string, LoggedSet[]>>(new Map());

  const handleStartStepper = useCallback((session: RoutineSession) => {
    setRoutineSession(session);
    setStepperSets(new Map());
    setStepperVisible(true);
  }, []);

  // ── TICKET-080 §1: free-session picker mode ───────────────────────────────
  // When the user taps "Start workout" on the resting Log tab with no routine,
  // we open the ExercisePicker; on select we build a 'free' RoutineSession and
  // open the stepper. This flag distinguishes "start workout" picker from the
  // "add next exercise" picker so handleExerciseSelect knows what to do.
  const [freeSessionPickerMode, setFreeSessionPickerMode] = useState(false);

  const handleStartWorkout = useCallback(() => {
    setFreeSessionPickerMode(true);
    setPickerVisible(true);
  }, []);

  // ── TICKET-082 Part B: alternatives sheet state ───────────────────────────
  const [alternativesSheetExerciseId, setAlternativesSheetExerciseId] = useState<string | null>(null);
  const [alternativesList, setAlternativesList] = useState<Array<{ id: string; name: string; equipment: string | null; }>>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);

  // ── TICKET-061: deep-link from the Routines page ("Start" → /log?routineId=…)
  // Fetch the routine, build a session, and open the Focus Stepper. Without this
  // the Routines page "Start" button navigated here but did nothing.
  const { routineId } = useLocalSearchParams<{ routineId?: string }>();
  const startedRoutineRef = useRef<string | null>(null);
  useEffect(() => {
    if (!routineId || startedRoutineRef.current === routineId) return;
    startedRoutineRef.current = routineId;
    let cancelled = false;
    getRoutine(routineId)
      .then((routine) => {
        if (cancelled) return;
        // Compute weekNumber for the routine (ISO weeks since created_at, +1)
        let wkNum: number | undefined;
        if ((routine as { created_at?: string }).created_at) {
          const created = new Date((routine as { created_at: string }).created_at);
          const msPerWeek = 7 * 24 * 60 * 60 * 1000;
          const weeks = Math.floor((Date.now() - created.getTime()) / msPerWeek) + 1;
          wkNum = Math.max(1, weeks);
        }
        handleStartStepper({
          source: 'routine',
          routineId: routine.id,
          name: routine.name,
          weekNumber: wkNum,
          exercises: routine.exercises.map((ex) => ({
            exerciseId: ex.exercise_id,
            name: ex.name,
            targetSets: ex.target_sets,
            targetReps: ex.target_reps,
            loggedSetCount: 0,
            done: false,
            category: (ex as { category?: string }).category as RoutineSessionExercise['category'] | undefined,
          })),
          currentIndex: 0,
        });
        // Clear the param so re-focusing the tab doesn't reopen the stepper.
        router.setParams({ routineId: '' });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [routineId, handleStartStepper, router]);

  const handleStepperLogSet = useCallback(
    async (exerciseId: string, weight: string, reps: string, rir?: string) => {
      // setIndex = sets already logged for this exercise THIS session (0-based).
      const setIndex = stepperSets.get(exerciseId)?.length ?? 0;
      // Append to local chip cache first (optimistic)
      setStepperSets((prev) => {
        const next = new Map(prev);
        const existing = next.get(exerciseId) ?? [];
        next.set(exerciseId, [...existing, { weight, reps, rir }]);
        return next;
      });
      // Update routine session counters
      updateRoutineExercise(exerciseId);
      // Persist via the canonical logSet path. Routine rows carry a real
      // exercise UUID; fall back to the picker-selected exercise if blank.
      const targetId = exerciseId || selectedExercise?.id || '';
      if (!workout?.id || !targetId) return;
      // TICKET-074 #1/#2: build the SAME canonical LogLiftSetPayload the form
      // path uses (camelCase, discriminated by `kind`, with setIndex + rir) so
      // no field is silently dropped UI→API. The previous shape
      // ({workout_id, exercise_id, set_type, weight}) was cast `as LogSetPayload`
      // and rejected by the server's Zod schema, so stepper sets never persisted.
      const rirNum = rir != null && rir.trim() !== '' ? parseInt(rir, 10) : undefined;
      try {
        await logSet({
          kind: 'lift',
          workoutId: workout.id,
          exerciseId: targetId,
          setIndex,
          reps: parseInt(reps, 10) || 0,
          weightKg: parseFloat(weight) || 0,
          ...(rirNum !== undefined && !Number.isNaN(rirNum) ? { rir: rirNum } : {}),
        });
        haptics.success();
        setTimerActive(true);
        setRestSecondsLeft(REST_DEFAULT);
      } catch (err) {
        // Non-blocking — set stays in the local chip cache. Surface the cause
        // (don't swallow): a rejected payload here is how persistence silently broke.
        console.warn('[PF] log/handleStepperLogSet:', err instanceof Error ? err.message : String(err));
      }
    },
    [workout, selectedExercise, logSet, updateRoutineExercise, stepperSets],
  );

  // TICKET-080 §2: cardio set logging through the stepper
  const handleStepperLogCardioSet = useCallback(
    async (exerciseId: string, durationSec: number, distanceM?: number, avgPaceSecPerKm?: number) => {
      const setIndex = stepperSets.get(exerciseId)?.length ?? 0;
      // Append to local chip cache (optimistic) — store cardio metadata on the LoggedSet
      setStepperSets((prev) => {
        const next = new Map(prev);
        const existing = next.get(exerciseId) ?? [];
        next.set(exerciseId, [
          ...existing,
          { weight: '', reps: '', durationSec, distanceM, avgPaceSecPerKm },
        ]);
        return next;
      });
      updateRoutineExercise(exerciseId);
      const targetId = exerciseId || selectedExercise?.id || '';
      if (!workout?.id || !targetId) return;
      try {
        await logSet({
          kind: 'cardio',
          workoutId: workout.id,
          exerciseId: targetId,
          setIndex,
          durationSec,
          ...(distanceM !== undefined ? { distanceM } : {}),
          ...(avgPaceSecPerKm !== undefined ? { avgPaceSecPerKm } : {}),
        });
        haptics.success();
        setTimerActive(true);
        setRestSecondsLeft(REST_DEFAULT);
      } catch (err) {
        console.warn('[PF] log/handleStepperLogCardioSet:', err instanceof Error ? err.message : String(err));
      }
    },
    [workout, selectedExercise, logSet, updateRoutineExercise, stepperSets],
  );

  const handleStepperAdvance = useCallback((toIndex: number) => {
    setRoutineSession((prev) => prev ? { ...prev, currentIndex: toIndex } : prev);
  }, []);

  const handleStepperAddOffRoutine = useCallback(
    (
      exerciseId: string,
      exerciseName: string,
      position: 'end' | 'after_current' | 'pick',
      pickIndex?: number,
    ) => {
      setRoutineSession((prev) => {
        if (!prev) return prev;
        const exercises = [...prev.exercises];
        // If this exercise is already in the session (the off-routine row we're
        // re-homing), pull it out first so "pick"/"end" truly move it.
        const existingIdx = exercises.findIndex(
          (e) => (exerciseId && e.exerciseId === exerciseId) || e.name === exerciseName,
        );
        if (existingIdx !== -1) exercises.splice(existingIdx, 1);

        const newEx = { exerciseId, name: exerciseName, loggedSetCount: 0, done: false };
        let insertAt: number;
        if (position === 'end') {
          insertAt = exercises.length;
        } else if (position === 'pick') {
          // Clamp the requested 0-based slot into range.
          insertAt = Math.max(0, Math.min(pickIndex ?? exercises.length, exercises.length));
        } else {
          insertAt = Math.min(prev.currentIndex + 1, exercises.length);
        }
        exercises.splice(insertAt, 0, newEx);
        return { ...prev, exercises };
      });
    },
    [],
  );

  // ── TICKET-062 / TICKET-077: Non-routine + PRO smart-suggest state ─────────
  const [smartSuggestion, setSmartSuggestion] = useState<SuggestCandidate | null>(null);
  const [smartSuggestions, setSmartSuggestions] = useState<SuggestCandidate[]>([]);
  // TICKET-077: formatted PB per suggested exerciseId (e.g. "45.0 kg × 8") for the
  // PRO "JUST LOGGED" suggestion cards. Fetched in batch when suggestions change.
  const [sugPbMap, setSugPbMap] = useState<Record<string, string>>({});
  // Full exercise catalogue (paid only) — the candidate pool for suggestions.
  // Without it the pool is just exercises touched this session, so nothing
  // useful would be suggested. Fetched once when a paid user is active.
  const [catalogue, setCatalogue] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!user?.is_paid) return;
    let cancelled = false;
    getExercises()
      .then((lib) => {
        if (cancelled) return;
        const flat = Object.values(lib.exercises ?? {})
          .flat()
          .map((e) => ({ id: e.id, name: e.name }));
        setCatalogue(flat);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.is_paid]);

  const recomputeSuggestion = useCallback(() => {
    if (!routineSession || routineSession.source === 'routine') return;
    const sessionLog: SessionExercise[] = Array.from(stepperSets.entries()).map(
      ([exerciseId, sets]) => ({
        exerciseId,
        name: routineSession.exercises.find((e) => e.exerciseId === exerciseId)?.name ?? exerciseId,
        setCount: sets.length,
      }),
    );
    const historyNames = Array.from(exerciseNames.values());
    const pool =
      catalogue.length > 0
        ? catalogue
        : Array.from(exerciseNames.entries()).map(([id, name]) => ({ id, name }));
    const list = suggestNextExercises(sessionLog, historyNames, pool, 5);
    // Enrich with repTarget from routine exercises where known (TICKET-082 Part B)
    const enriched = list.map((s) => {
      const routineEx = routineSession?.exercises.find((e) => e.exerciseId === s.exerciseId);
      return {
        ...s,
        repTarget: (s as SuggestCandidate & { repTarget?: string | null }).repTarget ?? (routineEx?.targetReps ?? null),
      };
    });
    setSmartSuggestions(enriched);
    setSmartSuggestion(enriched[0] ?? suggestNextExercise(sessionLog, historyNames, pool));
  }, [routineSession, stepperSets, exerciseNames, catalogue]);

  // Keep suggestions fresh for the paid smart variant as sets are logged.
  useEffect(() => {
    if (user?.is_paid && routineSession && routineSession.source !== 'routine') {
      recomputeSuggestion();
    }
  }, [stepperSets, routineSession, user?.is_paid, recomputeSuggestion]);

  // TICKET-077: batch-fetch personal bests for the current suggestion pool and
  // build display strings keyed by exerciseId. Re-runs when the suggestion set
  // changes; cancels stale responses.
  useEffect(() => {
    const ids = smartSuggestions.map((s) => s.exerciseId).filter(Boolean);
    if (ids.length === 0) { setSugPbMap({}); return; }
    let cancelled = false;
    getPersonalBests(ids)
      .then((map) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [id, pb] of Object.entries(map)) {
          if (pb) next[id] = `${formatWeight(pb.weight_kg, unitPref)} × ${pb.reps}`;
        }
        setSugPbMap(next);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartSuggestions]);

  // PRO smart-suggest: user accepted a suggested exercise → add it as the next
  // step (after current) and advance to it.
  const handleAcceptSuggestion = useCallback(
    (candidate: SuggestCandidate) => {
      handleStepperAddOffRoutine(candidate.exerciseId, candidate.name, 'after_current');
      setRoutineSession((prev) => {
        if (!prev) return prev;
        return { ...prev, currentIndex: Math.min(prev.currentIndex + 1, prev.exercises.length) };
      });
    },
    [handleStepperAddOffRoutine],
  );

  const handleSaveAsRoutine = useCallback(async () => {
    if (!routineSession) return;
    const { createRoutine } = await import('../../src/api/routines');
    const exercises = routineSession.exercises
      .filter((ex) => ex.loggedSetCount > 0)
      .map((ex) => ({ exercise_id: ex.exerciseId, name: ex.name, target_sets: ex.loggedSetCount }));
    if (exercises.length === 0) return;
    try {
      await createRoutine({ name: `Session ${new Date().toLocaleDateString()}`, exercises });
      Alert.alert('Routine saved', 'Your session has been saved as a new routine.');
      setStepperVisible(false);
      setRoutineSession(null);
    } catch { Alert.alert('Error', 'Could not save routine'); }
  }, [routineSession]);

  // TICKET-082 Part B: "Choose alternative exercise" handler
  const handleChooseAlternative = useCallback(async () => {
    if (!user?.is_paid) {
      setShowPaywall(true);
      return;
    }
    const currentExId = routineSession?.exercises[routineSession.currentIndex]?.exerciseId;
    if (!currentExId || !getAlternativesApi) return;
    setAlternativesLoading(true);
    try {
      const result = await getAlternativesApi(currentExId, { avoid: 'machine' });
      setAlternativesList(result.alternatives.map((a) => ({ id: a.id, name: a.name, equipment: a.equipment })));
      setAlternativesSheetExerciseId(currentExId);
    } catch (err: unknown) {
      const isPaywall = err != null && typeof err === 'object' && (err as { isPaywall?: boolean }).isPaywall;
      if (isPaywall) {
        setShowPaywall(true);
      } else {
        Alert.alert('Error', 'Could not load alternative exercises');
      }
    } finally {
      setAlternativesLoading(false);
    }
  }, [user?.is_paid, routineSession]);

  // Substitute the current session exercise with an alternative
  const handleSelectAlternative = useCallback(
    (alt: { id: string; name: string; equipment: string | null }) => {
      setRoutineSession((prev) => {
        if (!prev) return prev;
        const exercises = prev.exercises.map((ex, idx) =>
          idx === prev.currentIndex
            ? { ...ex, exerciseId: alt.id, name: alt.name }
            : ex,
        );
        return { ...prev, exercises };
      });
      setAlternativesSheetExerciseId(null);
      setAlternativesList([]);
    },
    [],
  );

  const groups = useMemo(() => groupSetsByExercise(sets), [sets]);
  const totalSets = sets.length;

  // ── Finish / End workout ───────────────────────────────────────────────────
  // Workouts are day-keyed and persist server-side (there is no explicit
  // "completed" status), so finishing is a client-side wrap-up: confirm, clear
  // any active routine/stepper session, and return Home to surface updated
  // stats + streak. (User-reported: the End workout button was missing.)
  const handleFinishWorkout = useCallback(() => {
    Alert.alert(
      'Finish workout?',
      `${totalSets} set${totalSets !== 1 ? 's' : ''} logged — your progress is already saved.`,
      [
        { text: 'Keep logging', style: 'cancel' },
        {
          text: 'Finish',
          onPress: () => {
            haptics.success();
            setStepperVisible(false);
            setRoutineSession(null);
            setSelectedExercise(null);
            router.replace('/(tabs)');
          },
        },
      ],
    );
  }, [totalSets, router]);

  const handleExerciseSelect = useCallback((exercise: Exercise) => {
    setPickerVisible(false);
    setSelectedExercise(exercise);
    setExerciseNames((prev) => {
      if (prev.has(exercise.id)) return prev;
      const next = new Map(prev);
      next.set(exercise.id, exercise.name);
      return next;
    });
    // Fetch PB for lift exercises so SetEntryForm can show reference card.
    // Cardio exercises don't have weight-based PBs, so skip the fetch.
    if (exercise.category === 'lift') {
      setExercisePB(null); // clear stale PB immediately
      getPersonalBest(exercise.id).then(setExercisePB).catch(() => {});
    } else {
      setExercisePB(null);
    }

    // TICKET-080 §1: free-session picker mode — build a new free RoutineSession
    // and open the stepper directly instead of the legacy SetEntryForm flow.
    if (freeSessionPickerMode) {
      setFreeSessionPickerMode(false);
      const isExistingSession = routineSession && routineSession.source === 'free';
      if (isExistingSession) {
        // "Add next exercise" to an existing free session: append + advance
        handleStepperAddOffRoutine(exercise.id, exercise.name, 'end');
        setRoutineSession((prev) => {
          if (!prev) return prev;
          // after append, new exercise is at end; advance to it
          return { ...prev, currentIndex: prev.exercises.length };
        });
      } else {
        // First exercise — build a brand-new free session
        handleStartStepper({
          source: 'free' as RoutineSession['source'],
          name: 'Free session',
          exercises: [{
            exerciseId: exercise.id,
            name: exercise.name,
            loggedSetCount: 0,
            done: false,
            category: exercise.category as RoutineSessionExercise['category'],
          }],
          currentIndex: 0,
        });
      }
      return;
    }

    // TICKET-056: advance routine currentIndex to this exercise if it's in the routine
    setRoutineSession((prev) => {
      if (!prev) return prev;
      const idx = prev.exercises.findIndex((ex) => ex.exerciseId === exercise.id);
      if (idx === -1) return prev; // off-routine exercise — leave session as-is
      return { ...prev, currentIndex: idx };
    });
  }, [freeSessionPickerMode, routineSession, handleStartStepper, handleStepperAddOffRoutine]);

  // handleSetLogged / handleSubmitSet removed — SetEntryForm is no longer the primary path (TICKET-080 §3)

  const handleDeleteSet = useCallback(
    async (id: string): Promise<void> => {
      try {
        await deleteSet(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not delete set';
        Alert.alert('Could not delete set', msg);
      }
    },
    [deleteSet]
  );

  // PL-3 / TICKET-054: Log rest day handler — uses shared api/workouts.ts function.
  // On success, router.replace navigates home (workout object updates there).
  const handleLogRestDay = useCallback(async () => {
    if (restDayLogged || restDayLoading) return;
    setRestDayLoading(true);
    try {
      await logRestDay();
      haptics.success();
      setTimeout(() => router.replace('/(tabs)/'), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not log rest day';
      Alert.alert('Error', msg);
    } finally {
      setRestDayLoading(false);
    }
  }, [restDayLogged, restDayLoading, router]);

  // TICKET-054: Undo rest day
  const handleUndoRestDay = useCallback(async () => {
    if (!restDayLogged || restDayLoading) return;
    setRestDayLoading(true);
    try {
      await undoRestDay();
      haptics.light();
      // Returning to home clears the stale workout state; user can re-log sets.
      router.replace('/(tabs)/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not undo rest day';
      Alert.alert('Error', msg);
    } finally {
      setRestDayLoading(false);
    }
  }, [restDayLogged, restDayLoading, router]);

  // nextSetIndex removed — no longer needed (SetEntryForm not rendered)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScreenLayout horizontalPadding={false}>
    <View style={styles.container}>
      {/* ---- A. Workout header ---- */}
      <View style={[styles.workoutHeader, { borderBottomColor: theme.colors.bgSecondary }]}>
        <View style={styles.workoutHeaderText}>
          <Text style={[styles.dateLabel, { color: theme.colors.textPrimary }]}>{formatTodayHeader()}</Text>
          <View style={styles.headerMetaRow}>
            {/* P1-009: tabular-nums on set count */}
            <Text style={[styles.setCountLabel, { color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] }]}>
              {isLoading
                ? 'Loading…'
                : `${totalSets} set${totalSets !== 1 ? 's' : ''} logged`}
            </Text>
            {/* P1-001a: Elapsed timer — shown once timer starts */}
            {timerActive ? (
              <Text style={[styles.elapsedTimer, { color: theme.colors.accentDefault, fontVariant: ['tabular-nums'] }]}>
                {' · '}{formatElapsed(elapsedSeconds)}
              </Text>
            ) : null}
          </View>
        </View>
        {/* Sync status pill — shows synced / syncing / offline at a glance */}
        <SyncStatusIndicator />
      </View>

      {/* ---- TICKET-055: Routine + Splits strips (collapse after first set) ---- */}
      {!restDayLogged && (
        <RoutineStrip
          hasLoggedSets={totalSets > 0}
          onStartRoutine={handleStartStepper}
          onStartTemplate={handleStartStepper}
        />
      )}

      {/* ---- TICKET-056: Routine exercise checklist (shown when session active) ---- */}
      {routineSession && routineSession.exercises.length > 0 && (
        <View style={[styles.checklistContainer, { borderColor: theme.colors.borderDefault }]}>
          <View style={styles.checklistHeader}>
            <Text style={[styles.checklistTitle, { color: theme.colors.textPrimary }]}>
              {routineSession.name}
            </Text>
            <TouchableOpacity
              onPress={() => setRoutineSession(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Exit routine"
            >
              <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm }}>
                Exit
              </Text>
            </TouchableOpacity>
          </View>
          {routineSession.exercises.map((ex, idx) => {
            const isActive = idx === routineSession.currentIndex;
            return (
              <TouchableOpacity
                key={`${ex.exerciseId}-${idx}`}
                onPress={() => {
                  // Select this exercise for logging; picker bypassed (TICKET-056 AC#1)
                  const syntheticExercise = {
                    id: ex.exerciseId || `routine-ex-${idx}`,
                    name: ex.name,
                    category: 'lift' as const,
                    muscle_groups: [],
                    is_compound: false,
                  };
                  handleExerciseSelect(syntheticExercise);
                  setRoutineSession((prev) =>
                    prev ? { ...prev, currentIndex: idx } : prev
                  );
                }}
                style={[
                  styles.checklistRow,
                  {
                    backgroundColor: isActive
                      ? theme.colors.accentSecondary
                      : theme.colors.bgSecondary,
                    borderColor: isActive
                      ? theme.colors.accentDefault
                      : theme.colors.borderDefault,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${ex.name}${ex.done ? ', done' : ''}`}
              >
                <Text
                  style={[
                    styles.checklistCheck,
                    { color: ex.done ? theme.colors.accentDefault : theme.colors.textTertiary },
                  ]}
                >
                  {ex.done ? '✓' : '○'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.checklistName,
                      {
                        color: ex.done
                          ? theme.colors.textSecondary
                          : theme.colors.textPrimary,
                        textDecorationLine: ex.done ? 'line-through' : 'none',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {ex.name}
                  </Text>
                  {ex.targetSets || ex.targetReps ? (
                    <Text style={[styles.checklistTarget, { color: theme.colors.textTertiary }]}>
                      {[
                        ex.targetSets ? `${ex.targetSets} sets` : null,
                        ex.targetReps ? `${ex.targetReps} reps` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
                {ex.loggedSetCount > 0 && (
                  <Text
                    style={[styles.checklistSetCount, { color: theme.colors.accentDefault }]}
                  >
                    {ex.loggedSetCount} set{ex.loggedSetCount !== 1 ? 's' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ---- PL-3 / TICKET-054: Rest day link — shown when no sets logged yet ---- */}
      {totalSets === 0 && !isLoading && !restDayLogged && (
        <TouchableOpacity
          onPress={handleLogRestDay}
          disabled={restDayLoading}
          style={[styles.restDayLink, { marginTop: spacing.s2 }]}
          accessibilityRole="button"
          accessibilityLabel="Log rest day"
        >
          {restDayLoading ? (
            <ActivityIndicator size="small" color={theme.colors.accentDefault} />
          ) : (
            <Text style={[styles.restDayText, { color: theme.colors.textTertiary, fontSize: fontSize.bodySm }]}>
              Taking a rest day?{' '}
              <Text style={{ color: theme.colors.accentDefault }}>Log it →</Text>
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Rest day logged — with undo affordance (TICKET-054) */}
      {restDayLogged && (
        <View style={[styles.restDaySuccess, { backgroundColor: theme.colors.bgElevated, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={[{ color: theme.colors.accentDefault, fontSize: fontSize.bodySm, textAlign: 'center' }]}>
            ✓ Rest day logged — your streak is safe.
          </Text>
          <TouchableOpacity
            onPress={handleUndoRestDay}
            disabled={restDayLoading}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Undo rest day"
            style={{ marginLeft: 10 }}
          >
            <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.caption }}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Error banner (no manual retry — PowerSync reconnects automatically) ---- */}
      {errorMessage ? (
        <View style={[
          styles.errorBanner,
          {
            backgroundColor: theme.colors.statusError + '22',
            borderBottomColor: theme.colors.statusError,
          },
        ]}>
          <Text style={[styles.errorBannerText, { color: theme.colors.statusError }]}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* ---- C. Launcher resting state (TICKET-080 §3) ---- */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.accentDefault} />
          <Text style={[styles.loadingText, { color: theme.colors.textTertiary }]}>Loading workout…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.setList}
          contentContainerStyle={styles.setListContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 1. Primary CTA: Start workout */}
          {!restDayLogged && (
            <TouchableOpacity
              onPress={handleStartWorkout}
              disabled={!workout || isLoading}
              style={[
                styles.startWorkoutBtn,
                { backgroundColor: theme.colors.accentDefault },
                (!workout || isLoading) && { opacity: 0.4 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Start workout"
            >
              <Text style={[styles.startWorkoutLabel, { color: theme.components.buttonPrimaryText }]}>
                Start workout
              </Text>
            </TouchableOpacity>
          )}

          {/* 2. Compact set count + Resume / Review today */}
          {totalSets > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)')}
              style={[styles.resumeRow, { borderColor: theme.colors.borderDefault }]}
              accessibilityRole="button"
              accessibilityLabel="Resume or review today's workout"
            >
              <Text style={[styles.resumeLabel, { color: theme.colors.textPrimary }]}>
                Resume / review today →
              </Text>
              <Text style={[styles.resumeSub, { color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] }]}>
                {totalSets} set{totalSets !== 1 ? 's' : ''} logged
              </Text>
            </TouchableOpacity>
          )}

          {/* 3. Manage routines link */}
          <TouchableOpacity
            onPress={() => router.push('/routines')}
            style={styles.manageRoutinesLink}
            accessibilityRole="button"
            accessibilityLabel="Manage routines"
          >
            <Text style={[styles.manageRoutinesText, { color: theme.colors.accentDefault }]}>
              Manage routines →
            </Text>
          </TouchableOpacity>

          <View style={styles.bottomPad} />
        </ScrollView>
      )}

      {/* ---- D. Exercise picker modal (used for free-session + stepper add-next) ---- */}
      <ExercisePicker
        visible={pickerVisible}
        onSelect={handleExerciseSelect}
        onClose={() => {
          setPickerVisible(false);
          setFreeSessionPickerMode(false);
        }}
      />

      {/* ---- E. SetEntryForm is NOT rendered as the primary path (TICKET-080 §3) ---- */}
      {/* The stepper is now the sole set-entry UI. SetEntryForm.tsx stays on disk
          but is no longer routed to from the Log tab's primary flow. */}

      {/* ---- F. Rest timer banner (P1-001b) ---- */}
      {restSecondsLeft !== null && (
        <View style={[styles.restTimerBanner, { backgroundColor: theme.colors.bgElevated }]}>
          <Text style={[styles.restTimerText, { color: theme.colors.accentDefault, fontVariant: ['tabular-nums'] }]}>
            Rest: {formatElapsed(restSecondsLeft)}
          </Text>
          <TouchableOpacity
            onPress={() => setRestSecondsLeft(null)}
            style={styles.restTimerDismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss rest timer"
          >
            <Text style={[styles.restTimerDismissText, { color: theme.colors.textTertiary }]}>×</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* ── TICKET-082 Part B: Alternatives sheet ─────────────────────────── */}
      {alternativesSheetExerciseId && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setAlternativesSheetExerciseId(null)}
        >
          <Pressable
            style={[styles.altSheetBackdrop, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
            onPress={() => setAlternativesSheetExerciseId(null)}
          />
          <View style={[styles.altSheet, { backgroundColor: theme.colors.bgElevated }]}>
            <View style={[styles.altSheetHandle, { backgroundColor: theme.colors.borderDefault }]} />
            <Text style={[styles.altSheetTitle, { color: theme.colors.textPrimary }]}>
              Alternative exercises
            </Text>
            <Text style={[styles.altSheetSub, { color: theme.colors.textTertiary }]}>
              Same muscles, different equipment
            </Text>
            {alternativesLoading ? (
              <ActivityIndicator color={theme.colors.accentDefault} style={{ marginTop: spacing.s4 }} />
            ) : alternativesList.length === 0 ? (
              <Text style={[{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginTop: spacing.s3 }]}>
                No alternatives found for this exercise.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {alternativesList.map((alt) => (
                  <TouchableOpacity
                    key={alt.id}
                    style={[styles.altSheetRow, { borderBottomColor: theme.colors.borderDefault }]}
                    onPress={() => handleSelectAlternative(alt)}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose ${alt.name}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[{ color: theme.colors.textPrimary, fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium }]}>
                        {alt.name}
                      </Text>
                      {alt.equipment ? (
                        <Text style={[{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm }]}>
                          {alt.equipment}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.altSheetCancel, { borderColor: theme.colors.borderDefault }]}
              onPress={() => setAlternativesSheetExerciseId(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[{ color: theme.colors.textTertiary, fontSize: fontSize.bodyMd }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}

      {/* ── TICKET-059/060: Focus Stepper modal ───────────────────────────── */}
      <Modal
        visible={stepperVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setStepperVisible(false)}
      >
        {routineSession && (
          <StepperLogger
            routineSession={routineSession}
            onLogSet={handleStepperLogSet}
            onLogCardioSet={handleStepperLogCardioSet}
            onAdvance={handleStepperAdvance}
            onFinish={() => {
              setStepperVisible(false);
              setRoutineSession(null);
            }}
            onBrowseLibrary={() => {
              setStepperVisible(false);
              setPickerVisible(true);
            }}
            variant={
              routineSession?.source === 'routine'
                ? 'routine'
                : routineSession?.source === 'free' && user?.is_paid
                  ? 'smart'   /* TICKET-077: PRO smart-suggest "JUST LOGGED" interstitial */
                  : routineSession?.source === 'free'
                    ? 'free'  /* free tier: add-as-you-go */
                    : user?.is_paid
                      ? 'smart'
                      : 'free'
            }
            suggestion={smartSuggestion}
            suggestions={smartSuggestions.map((s) => ({
              ...s,
              pbLabel: sugPbMap[s.exerciseId] ?? (s as SuggestCandidate & { pbLabel?: string | null }).pbLabel ?? null,
            }))}
            onAcceptSuggestion={handleAcceptSuggestion}
            onAddNextExercise={() => {
              recomputeSuggestion();
              setFreeSessionPickerMode(true);
              setPickerVisible(true);
            }}
            onSaveAsRoutine={handleSaveAsRoutine}
            pbLabel={
              exercisePB?.all_time_best
                ? `${formatWeight(exercisePB.all_time_best.weight_kg, unitPref)} × ${exercisePB.all_time_best.reps}`
                : null
            }
            repTarget={
              routineSession.exercises[routineSession.currentIndex]?.targetReps ?? null
            }
            currentExerciseSets={
              stepperSets.get(
                routineSession.exercises[routineSession.currentIndex]?.exerciseId ?? '',
              ) ?? []
            }
            onAddOffRoutineExercise={handleStepperAddOffRoutine}
            onClose={() => setStepperVisible(false)}
            unitPref={unitPref}
            weekNumber={routineSession.weekNumber ?? null}
            onChooseAlternative={user?.is_paid ? handleChooseAlternative : (() => setShowPaywall(true))}
          />
        )}
      </Modal>
    </View>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    gap: 10,
  },
  workoutHeaderText: {
    flex: 1,
    gap: 2,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  setCountLabel: {
    fontSize: fontSize.bodySm,
  },
  // P1-001a: elapsed timer inline with set count
  elapsedTimer: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
  addButton: {
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: fontWeight.bold,
  },
  // PL-3: Rest day link
  restDayLink: {
    alignSelf: 'center',
  },
  restDayText: {
    textAlign: 'center',
  },
  restDaySuccess: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s2,
    padding: spacing.s3,
    borderRadius: radius.md,
  },
  errorBanner: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  errorBannerText: {
    fontSize: fontSize.bodySm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: fontSize.bodySm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s5,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  emptyStateSubtitle: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
  },
  setList: {
    flex: 1,
  },
  setListContent: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  bottomPad: {
    height: 100,
  },
  finishWorkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    marginHorizontal: spacing.s4,
    marginTop: spacing.s5,
  },
  finishWorkoutLabel: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  // P1-001b: Rest timer banner — fixed at bottom above tab bar
  restTimerBanner: {
    position: 'absolute',
    bottom: 90, // above tab bar (~49px) with clearance
    left: spacing.s4,
    right: spacing.s4,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  restTimerText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  restTimerDismiss: {
    padding: spacing.s2,
  },
  restTimerDismissText: {
    fontSize: 20,
    lineHeight: 24,
  },

  /* ── TICKET-056: Routine exercise checklist ─────────────────────────────── */
  checklistContainer: {
    borderWidth: 1,
    borderRadius: radius.md,
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s3,
    overflow: 'hidden',
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  checklistTitle: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    gap: spacing.s3,
  },
  checklistCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistName: {
    flex: 1,
    fontSize: fontSize.bodyMd,
  },
  checklistTarget: {
    fontSize: fontSize.bodySm,
    marginRight: spacing.s2,
  },
  checklistSetCount: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    minWidth: 24,
    textAlign: 'right',
  },

  /* ── TICKET-080 §3: launcher resting state ─────────────────────────────── */
  startWorkoutBtn: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s4,
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  startWorkoutLabel: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  resumeRow: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s3,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  resumeLabel: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  resumeSub: {
    fontSize: fontSize.bodySm,
    marginTop: 2,
  },
  manageRoutinesLink: {
    marginHorizontal: spacing.s4,
    marginTop: spacing.s3,
    paddingVertical: spacing.s2,
  },
  manageRoutinesText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },

  /* ── TICKET-082 Part B: alternatives sheet ──────────────────────────────── */
  altSheetBackdrop: {
    flex: 1,
  },
  altSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s6,
  },
  altSheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    marginBottom: spacing.s4,
  },
  altSheetTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.s1,
  },
  altSheetSub: {
    fontSize: fontSize.bodySm,
    marginBottom: spacing.s3,
  },
  altSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  altSheetCancel: {
    marginTop: spacing.s4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
});
