/**
 * WorkoutLoggerHost — TICKET-084
 *
 * Self-contained overlay host for the entire workout logging state machine,
 * extracted from (tabs)/log.tsx so it can be mounted on Home (index.tsx).
 *
 * Renders nothing visible until opened. Surfaces:
 *   • StepperLogger full-screen Modal
 *   • ExercisePicker Modal
 *   • ExerciseSwitcherSheet (alternatives)
 *   • PaywallUpgradeModal
 *
 * Opening is driven by a ref-based imperative API exposed via WorkoutLoggerRef:
 *   hostRef.current?.startWorkout()         — free-session picker
 *   hostRef.current?.startRoutine(id, name) — load & open routine stepper
 *   hostRef.current?.startWithExercise(id, name) — seed free session with one exercise
 *   hostRef.current?.startSession(session)  — start from a pre-built RoutineSession
 *   hostRef.current?.reopenToday()          — re-open today's stepper
 *
 * All set persistence goes through usePowerSyncLog().logSet(...) — no new write path.
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from './Icon';
import { useAuth } from '../hooks/useAuth';
import { usePowerSyncLog } from '../hooks/usePowerSyncLog';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { rememberExerciseName, rememberExerciseNames } from '../data/exerciseNames';
import { stampLocalRoutineName } from '../data/localWorkouts';
import { ExercisePicker } from './ExercisePicker';
import StepperLogger, { LoggedSet } from './StepperLogger';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { haptics } from '../utils/haptics';
import { formatWeight, kgToLbs, roundToNearestQuarterLb, displayToKg, parseWeightInput } from '../constants/units';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRoutine } from '../data/routines';
import { getRestTimerDefaultSec } from '../data/appSettings'; // P1b — device-local rest default
import { updateLiftSet } from '../data/setEditing'; // P1c — in-place edit of a past set
import { markRoutineCompleted } from '../data/schedule'; // TICKET-097
import { checkGoalAchieved } from '../data/exerciseGoals'; // WIDGET-002
import { setSetMetrics, CardioMetrics } from '../data/cardioMetrics'; // P5 — rich cardio metrics
import { createWorkout } from '../api/workouts';
import { toDateKey } from '../utils/dateHelpers';
import { getExercises } from '../api/exercises';
import { getPersonalBest, getPersonalBests, PersonalBest } from '../api/sets';
import { Exercise } from '../types/api';
import { RoutineSession, RoutineSessionExercise } from './RoutineStrip';
import { suggestNextExercise, suggestNextExercises, SessionExercise, SuggestCandidate } from '../utils/smartSuggest';
import PRToast, { PRToastData } from './PRToast';
import { useRestTimer, REST_TIMER_STEP } from '../hooks/useRestTimer';
import { epley1Rm } from '../lib/oneRm';

// Dynamic require for alternatives API (Agent 3's file — optional at parse time)
let getAlternativesApi: ((exerciseId: string, opts?: { avoid?: string; limit?: number }) => Promise<import('../api/alternatives').AlternativesResult>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getAlternativesApi = require('../api/alternatives').getAlternatives;
} catch {
  getAlternativesApi = null;
}

const REST_DEFAULT = 90;
// Configurable rest default — tap the time in the banner to cycle presets;
// persisted so the choice survives restarts.
const REST_PRESETS = [60, 90, 120, 180];
const REST_PREF_KEY = '@peak_fettle/rest_default_sec';

// ---------------------------------------------------------------------------
// PaywallUpgradeModal
// ---------------------------------------------------------------------------

interface PaywallUpgradeModalProps {
  visible: boolean;
  onDismiss: () => void;
  onUpgrade: () => void;
}

function PaywallUpgradeModal({ visible, onDismiss, onUpgrade }: PaywallUpgradeModalProps): React.ReactElement {
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onDismiss} accessibilityLabel="Dismiss upgrade prompt" />
      <View style={[pwStyles.sheet, { backgroundColor: theme.colors.bgPrimary, borderTopLeftRadius: r.lg, borderTopRightRadius: r.lg, paddingHorizontal: sp.s5, paddingTop: sp.s5, paddingBottom: sp.s6 }]}>
        <View style={[pwStyles.pill, { backgroundColor: theme.colors.borderDefault, borderRadius: r.full ?? 999, marginBottom: sp.s5 }]} />
        <View style={{ alignItems: 'center', marginBottom: sp.s3 }}>
          <View style={[{ backgroundColor: theme.colors.accentSecondary, borderRadius: r.full ?? 999, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="flash" size={28} color={theme.colors.accentDefault} />
          </View>
        </View>
        <Text style={{ fontSize: fs.display, fontWeight: fw.bold, color: theme.colors.textPrimary, textAlign: 'center', marginBottom: sp.s2 }}>You're on a roll!</Text>
        <Text style={{ fontSize: fs.bodyMd, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: sp.s5 }}>
          You've hit your 5 free sessions. Upgrade to Peak Fettle Pro for{' '}
          <Text style={{ fontWeight: fw.bold, color: theme.colors.textPrimary }}>personalised AI training plans</Text> that adapt to your progress.
        </Text>
        <TouchableOpacity style={[{ backgroundColor: theme.colors.accentDefault, borderRadius: r.md, paddingVertical: sp.s4, marginBottom: sp.s3, alignItems: 'center' }]} onPress={onUpgrade} accessibilityRole="button" accessibilityLabel="Upgrade to Pro">
          <Text style={{ fontSize: fs.bodyLg, fontWeight: fw.bold, color: theme.components.buttonPrimaryText, textAlign: 'center' }}>See Plans</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ paddingVertical: sp.s3, alignItems: 'center' }} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Maybe later">
          <Text style={{ fontSize: fs.bodyMd, color: theme.colors.textTertiary, textAlign: 'center' }}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const pwStyles = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  pill: { alignSelf: 'center', width: 36, height: 4 },
});

// ---------------------------------------------------------------------------
// Public ref API
// ---------------------------------------------------------------------------

/**
 * P1c — one already-logged set from a PAST session, as handed to the stepper for
 * editing. `weightDisplay`/`reps` are strings in the user's DISPLAY unit (the
 * stepper shows + edits these verbatim; the host converts back to exact kg on
 * save). `id`/`workoutId`/`setIndex` identify the real row so the correction
 * UPDATEs it in place (via setEditing.updateLiftSet) rather than inserting a new
 * set. Cardio sets are passed through read-only (the stepper can't edit them).
 */
export interface HistoryEditSet {
  id: string;
  workoutId: string;
  setIndex: number;
  weightDisplay: string;
  reps: string;
  rir?: string;
  /** Cardio passthrough so the chip renders; these sets are not stepper-editable. */
  durationSec?: number;
  distanceM?: number;
  avgPaceSecPerKm?: number;
}

export interface HistoryEditExercise {
  exerciseId: string;
  name: string;
  category?: RoutineSessionExercise['category'];
  sets: HistoryEditSet[];
}

export interface HistoryEditArgs {
  /** Session label shown in the stepper header (e.g. a friendly date). */
  name: string;
  exercises: HistoryEditExercise[];
  /** Index of the exercise to open on first (defaults to the one the user tapped). */
  startIndex?: number;
  /** Fired after any in-place edit or delete so the day screen can re-read SQLite. */
  onChange?: () => void;
}

export interface WorkoutLoggerRef {
  startWorkout: () => void;
  startRoutine: (routineId: string, routineName: string) => void;
  startWithExercise: (exerciseId: string, exerciseName: string) => void;
  startSession: (session: RoutineSession) => void;
  reopenToday: () => void;
  /**
   * P1c — open the stepper seeded from a PAST session's exercises and their
   * already-logged sets, in edit mode. Tapping a set chip pulls it into the
   * inputs; saving routes through setEditing.updateLiftSet (tier-branched,
   * local-first) to UPDATE the existing row. No new set is created.
   */
  startHistoryEdit: (args: HistoryEditArgs) => void;
}

// ---------------------------------------------------------------------------
// WorkoutLoggerHost
// ---------------------------------------------------------------------------

interface WorkoutLoggerHostProps {
  /** Called after the user presses "Finish workout" — optional, defaults to router.replace('/(tabs)') */
  onFinish?: () => void;
}

export const WorkoutLoggerHost = forwardRef<WorkoutLoggerRef, WorkoutLoggerHostProps>(
  function WorkoutLoggerHost({ onFinish }, ref) {
    const { user } = useAuth();
    const router = useRouter();
    const { theme } = useTheme();
    const unitPref = user?.unit_pref ?? 'kg';

    const {
      workout,
      sets,
      isLoading,
      logSet,
      deleteSet,
      paywallTriggered,
    } = usePowerSyncLog();

    // Component-scoped mounted flag. `startRoutine` (an imperative-handle method)
    // awaits getRoutine() and then setStates via handleStartStepper; a function
    // RETURNED from a useImperativeHandle method is never invoked by React, so
    // the old per-call `cancelled` flag was dead and the fetch was effectively
    // uncancellable. On a slow network the host can unmount before getRoutine
    // resolves → setState-after-unmount. This ref, cleared by a real unmount
    // effect, is the cancel signal. (S3-02 / unmount-guard.)
    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    // Paywall
    const [showPaywall, setShowPaywall] = useState(false);
    useEffect(() => {
      if (paywallTriggered) {
        const t = setTimeout(() => setShowPaywall(true), 800);
        return () => clearTimeout(t);
      }
    }, [paywallTriggered]);

    // Picker / stepper visibility
    const [pickerVisible, setPickerVisible] = useState(false);
    const [freeSessionPickerMode, setFreeSessionPickerMode] = useState(false);
    const [stepperVisible, setStepperVisible] = useState(false);

    // Exercise state
    const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
    const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());
    const [exercisePB, setExercisePB] = useState<PersonalBest | null>(null);

    // Routine session
    const [routineSession, setRoutineSession] = useState<RoutineSession | null>(null);
    const [stepperSets, setStepperSets] = useState<Map<string, LoggedSet[]>>(new Map());

    // ── P1c history-edit mode ─────────────────────────────────────────────────
    // When editing a PAST session, the stepper is seeded from that workout's
    // logged sets and every correction UPDATEs the real row in place (NOT today's
    // workout, which is all usePowerSyncLog/handleStepperUpdateSet know about).
    // `historyMode` flips onLogSet/onUpdateSet to the history handlers; the row
    // map resolves (exerciseId, setIndex) → the actual set id + owning workout.
    const [historyMode, setHistoryMode] = useState(false);
    // Keyed by `${exerciseId}#${chipArrayIndex}` because the stepper's edit
    // identity (editingIndex) is the chip's POSITION in currentExerciseSets, not
    // the DB set_index. Value carries the real row id + owning workout + the
    // actual DB set_index (needed by the Pro re-log path inside updateLiftSet).
    const historyRowMapRef = useRef<Map<string, { id: string; workoutId: string; setIndex: number }>>(new Map());
    const historyChangeRef = useRef<(() => void) | undefined>(undefined);
    const historyRowKey = (exerciseId: string, chipIndex: number) => `${exerciseId}#${chipIndex}`;

    // Timer
    const [timerActive, setTimerActive] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [restSecondsLeft, setRestSecondsLeft] = useState<number | null>(null);
    const [restDefault, setRestDefault] = useState(REST_DEFAULT);
    // P1b: seed the rest default from the device-local app_settings store
    // (getRestTimerDefaultSec, built in Foundation — no REST, safe on mount,
    // fallback 120). The in-session +/- adjust (cycleRestDefault) still works and
    // keeps the legacy AsyncStorage preset memory in sync as a secondary mirror.
    useEffect(() => {
      let cancelled = false;
      getRestTimerDefaultSec()
        .then((sec) => { if (!cancelled) setRestDefault(sec); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, []);
    const cycleRestDefault = useCallback(() => {
      setRestDefault((cur) => {
        const next = REST_PRESETS[(REST_PRESETS.indexOf(cur) + 1) % REST_PRESETS.length] ?? REST_DEFAULT;
        AsyncStorage.setItem(REST_PREF_KEY, String(next)).catch(() => {});
        return next;
      });
    }, []);

    useEffect(() => {
      if (!timerActive) return;
      const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
      return () => clearInterval(interval);
    }, [timerActive]);

    useEffect(() => {
      if (restSecondsLeft === null || restSecondsLeft <= 0) {
        if (restSecondsLeft === 0) haptics.light();
        setRestSecondsLeft(null);
        return;
      }
      const t = setTimeout(() => setRestSecondsLeft((s) => (s ?? 1) - 1), 1000);
      return () => clearTimeout(t);
    }, [restSecondsLeft]);

    // PB + last-session for the STEPPER'S current exercise (routine advance
    // doesn't go through the picker, so fetch per current index). Powers the
    // PB line, the "Last session" line, and the warm-up ramp (founder 2026-06-10).
    // FREE users are local-first and must not make personal REST calls (free-user-rest-api-calls).
    const [stepperPB, setStepperPB] = useState<PersonalBest | null>(null);
    const stepperExerciseId =
      routineSession?.exercises[routineSession.currentIndex]?.exerciseId ?? null;
    useEffect(() => {
      if (!stepperExerciseId || !user?.is_paid) {
        setStepperPB(null);
        return;
      }
      let cancelled = false;
      getPersonalBest(stepperExerciseId)
        .then((pb) => { if (!cancelled) setStepperPB(pb); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [stepperExerciseId, user?.is_paid]);

    // PR toast
    const [prToast, setPrToast] = useState<PRToastData | null>(null);

    // Rest timer (background-safe, scheduled notification)
    const restTimer = useRestTimer(120);

    // Alternatives sheet
    const [alternativesSheetExerciseId, setAlternativesSheetExerciseId] = useState<string | null>(null);
    const [alternativesList, setAlternativesList] = useState<Array<{ id: string; name: string; equipment: string | null }>>([]);
    const [alternativesLoading, setAlternativesLoading] = useState(false);

    // Smart suggest
    const [smartSuggestion, setSmartSuggestion] = useState<SuggestCandidate | null>(null);
    const [smartSuggestions, setSmartSuggestions] = useState<SuggestCandidate[]>([]);
    const [sugPbMap, setSugPbMap] = useState<Record<string, string>>({});
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

    const updateRoutineExercise = useCallback((exerciseId: string) => {
      setRoutineSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exercises: prev.exercises.map((ex) =>
            ex.exerciseId === exerciseId
              ? { ...ex, loggedSetCount: ex.loggedSetCount + 1, done: true }
              : ex,
          ),
        };
      });
    }, []);

    const handleStartStepper = useCallback((session: RoutineSession) => {
      setRoutineSession(session);
      setStepperSets(new Map());
      setStepperVisible(true);

      // Remember every exercise's name on-device so Recent Activity / Recent PRs
      // resolve real names (not UUIDs) — works fully offline for the free tier.
      void rememberExerciseNames(
        session.exercises.map((ex) => ({ exerciseId: ex.exerciseId, name: ex.name })),
      );

      // Persist the routine link onto today's workout so Recent Activity can
      // label the session (e.g. "Leg Day 6/4/26"). Only named sessions
      // (routine/template) get a label; ad-hoc "free" sessions stay date-only.
      // Fire-and-forget: never blocks the stepper from opening.
      if (session.source !== 'free' && session.name) {
        const dayKey = workout?.day_key ?? toDateKey(new Date());
        if (isLocalFirst(user)) {
          // Free / local-first: stamp the label locally — NO REST call. The old
          // server createWorkout() here just stalled on the free path (no token
          // round-trip succeeds), contributing to the "routine logging is laggy"
          // report, and never actually labelled the local session.
          void stampLocalRoutineName(dayKey, session.name);
        } else {
          createWorkout(dayKey, undefined, {
            routineId: session.routineId,
            routineName: session.name,
          }).catch((err) => {
            console.warn('[PF] WorkoutLoggerHost/routine-link:', err instanceof Error ? err.message : String(err));
          });
        }
      }
    }, [workout?.day_key, user]);

    const recomputeSuggestion = useCallback(() => {
      if (!routineSession || routineSession.source === 'routine') return;
      const sessionLog: SessionExercise[] = Array.from(stepperSets.entries()).map(([exerciseId, s]) => ({
        exerciseId,
        name: routineSession.exercises.find((e) => e.exerciseId === exerciseId)?.name ?? exerciseId,
        setCount: s.length,
      }));
      const historyNames = Array.from(exerciseNames.values());
      const pool = catalogue.length > 0
        ? catalogue
        : Array.from(exerciseNames.entries()).map(([id, name]) => ({ id, name }));
      const list = suggestNextExercises(sessionLog, historyNames, pool, 5);
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

    useEffect(() => {
      if (user?.is_paid && routineSession && routineSession.source !== 'routine') {
        recomputeSuggestion();
      }
    }, [stepperSets, routineSession, user?.is_paid, recomputeSuggestion]);

    useEffect(() => {
      // Local-first (CLAUDE.md #1): PB enrichment is a Pro-only personal REST call.
      // Free users must never reach getPersonalBests — the free-session "Add next
      // exercise" path recomputes suggestions without an is_paid gate, so guard here.
      if (!user?.is_paid) { setSugPbMap({}); return; }
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
    }, [smartSuggestions, user?.is_paid]);

    // ── Imperative API ────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      startWorkout() {
        setFreeSessionPickerMode(true);
        setPickerVisible(true);
      },

      startRoutine(routineId: string, routineName: string) {
        // NOTE: a cleanup returned from here would be discarded by React, so the
        // cancel signal is the component-scoped mountedRef instead (S3-02).
        getRoutine(user, routineId)
          .then((routine) => {
            if (!mountedRef.current) return;
            let wkNum: number | undefined;
            if ((routine as { created_at?: string }).created_at) {
              const created = new Date((routine as { created_at: string }).created_at);
              const msPerWeek = 7 * 24 * 60 * 60 * 1000;
              wkNum = Math.max(1, Math.floor((Date.now() - created.getTime()) / msPerWeek) + 1);
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
          })
          .catch(() => {
            if (!mountedRef.current) return;
            Alert.alert('Could not load routine', 'Please try again.');
          });
      },

      startWithExercise(exerciseId: string, exerciseName: string) {
        const session: RoutineSession = {
          source: 'free',
          name: 'Free session',
          exercises: [{ exerciseId, name: exerciseName, loggedSetCount: 0, done: false }],
          currentIndex: 0,
        };
        handleStartStepper(session);
        setExerciseNames((prev) => {
          if (prev.has(exerciseId)) return prev;
          const next = new Map(prev);
          next.set(exerciseId, exerciseName);
          return next;
        });
        void rememberExerciseName(exerciseId, exerciseName);
      },

      startSession(session: RoutineSession) {
        handleStartStepper(session);
      },

      reopenToday() {
        // Re-open the stepper on today's session; if a session is in memory use it,
        // otherwise build a minimal free session from already-logged sets.
        if (routineSession) {
          setStepperVisible(true);
          return;
        }
        // Build from today's sets
        const seenIds: string[] = [];
        for (const s of sets) {
          if (!seenIds.includes(s.exercise_id)) seenIds.push(s.exercise_id);
        }
        const exercises: RoutineSessionExercise[] = seenIds.map((id) => ({
          exerciseId: id,
          name: exerciseNames.get(id) ?? id,
          loggedSetCount: sets.filter((s) => s.exercise_id === id).length,
          done: true,
        }));
        if (exercises.length === 0) {
          // No sets yet — open free-session picker
          setFreeSessionPickerMode(true);
          setPickerVisible(true);
          return;
        }
        handleStartStepper({
          source: 'free',
          name: "Today's session",
          exercises,
          currentIndex: exercises.length - 1,
        });
      },

      startHistoryEdit(args: HistoryEditArgs) {
        // Build the stepper session + pre-seed its set chips from the PAST
        // workout's logged sets, and remember which real row each chip maps to.
        const rowMap = new Map<string, { id: string; workoutId: string; setIndex: number }>();
        const seededSets = new Map<string, LoggedSet[]>();
        const exercises: RoutineSessionExercise[] = args.exercises.map((ex) => {
          const logged: LoggedSet[] = ex.sets.map((s, chipIndex) => {
            // Map the chip POSITION (what the stepper reports as editingIndex) to
            // the real row; keep the DB set_index for the in-place UPDATE.
            rowMap.set(historyRowKey(ex.exerciseId, chipIndex), {
              id: s.id,
              workoutId: s.workoutId,
              setIndex: s.setIndex,
            });
            if (s.durationSec != null) {
              return {
                weight: '',
                reps: '',
                durationSec: s.durationSec,
                distanceM: s.distanceM,
                avgPaceSecPerKm: s.avgPaceSecPerKm,
              };
            }
            return { weight: s.weightDisplay, reps: s.reps, rir: s.rir };
          });
          seededSets.set(ex.exerciseId, logged);
          return {
            exerciseId: ex.exerciseId,
            name: ex.name,
            loggedSetCount: logged.length,
            done: logged.length > 0,
            category: ex.category,
          };
        });
        if (exercises.length === 0) return;

        // Resolve names on-device so chips/headers never show a UUID.
        void rememberExerciseNames(
          args.exercises.map((ex) => ({ exerciseId: ex.exerciseId, name: ex.name })),
        );

        historyRowMapRef.current = rowMap;
        historyChangeRef.current = args.onChange;
        setHistoryMode(true);
        setRoutineSession({
          // 'routine' source → routine-style footer (Continue / Select different
          // exercise); the free/smart "add next exercise / suggestions" paths are
          // suppressed in history mode (we only correct existing sets).
          source: 'routine',
          name: args.name,
          exercises,
          currentIndex: Math.max(0, Math.min(args.startIndex ?? 0, exercises.length - 1)),
        });
        setStepperSets(seededSets);
        setStepperVisible(true);
      },
    }));

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleStepperAddOffRoutine = useCallback(
      (exerciseId: string, exerciseName: string, position: 'end' | 'after_current' | 'pick', pickIndex?: number) => {
        void rememberExerciseName(exerciseId, exerciseName);
        setRoutineSession((prev) => {
          if (!prev) return prev;
          const exercises = [...prev.exercises];
          const existingIdx = exercises.findIndex(
            (e) => (exerciseId && e.exerciseId === exerciseId) || e.name === exerciseName,
          );
          if (existingIdx !== -1) exercises.splice(existingIdx, 1);
          const newEx: RoutineSessionExercise = { exerciseId, name: exerciseName, loggedSetCount: 0, done: false };
          let insertAt: number;
          if (position === 'end') {
            insertAt = exercises.length;
          } else if (position === 'pick') {
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

    const handleExerciseSelect = useCallback(
      (exercise: Exercise) => {
        setPickerVisible(false);
        setSelectedExercise(exercise);
        setExerciseNames((prev) => {
          if (prev.has(exercise.id)) return prev;
          const next = new Map(prev);
          next.set(exercise.id, exercise.name);
          return next;
        });
        // Persist id→name on-device so history resolves the real name later.
        void rememberExerciseName(exercise.id, exercise.name);
        if (exercise.category === 'lift' && user?.is_paid) {
          // FREE users are local-first — no personal REST calls (free-user-rest-api-calls).
          setExercisePB(null);
          getPersonalBest(exercise.id).then(setExercisePB).catch(() => {});
        } else {
          setExercisePB(null);
        }

        if (freeSessionPickerMode) {
          setFreeSessionPickerMode(false);
          const isExistingSession = routineSession && routineSession.source === 'free';
          if (isExistingSession) {
            // Atomically append the exercise and set currentIndex in one updater
            // to avoid a stale-read off-by-one (WL-008 / handleexerciseselect-offbyone).
            setRoutineSession((prev) => {
              if (!prev) return prev;
              const exercises = [...prev.exercises];
              const existingIdx = exercises.findIndex(
                (e) => e.exerciseId === exercise.id || e.name === exercise.name,
              );
              if (existingIdx !== -1) exercises.splice(existingIdx, 1);
              exercises.push({
                exerciseId: exercise.id,
                name: exercise.name,
                loggedSetCount: 0,
                done: false,
                category: exercise.category as RoutineSessionExercise['category'],
              });
              return { ...prev, exercises, currentIndex: exercises.length - 1 };
            });
          } else {
            handleStartStepper({
              source: 'free',
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

        setRoutineSession((prev) => {
          if (!prev) return prev;
          const idx = prev.exercises.findIndex((ex) => ex.exerciseId === exercise.id);
          if (idx === -1) return prev;
          return { ...prev, currentIndex: idx };
        });
      },
      [freeSessionPickerMode, routineSession, handleStartStepper, handleStepperAddOffRoutine],
    );

    const handleStepperLogSet = useCallback(
      async (exerciseId: string, weight: string, reps: string, rir?: string) => {
        const setIndex = stepperSets.get(exerciseId)?.length ?? 0;
        setStepperSets((prev) => {
          const next = new Map(prev);
          const existing = next.get(exerciseId) ?? [];
          next.set(exerciseId, [...existing, { weight, reps, rir }]);
          return next;
        });
        updateRoutineExercise(exerciseId);
        const targetId = exerciseId || selectedExercise?.id || '';
        if (!workout?.id || !targetId) return;
        const rirNum = rir != null && rir.trim() !== '' ? parseInt(rir, 10) : undefined;
        // The stepper sends weight in the user's DISPLAY unit; convert to the
        // exact kg the data layer stores (option 10). kg pref is identity.
        const weightKg = displayToKg(parseWeightInput(weight) ?? 0, unitPref);
        try {
          const logged = await logSet({
            kind: 'lift',
            workoutId: workout.id,
            exerciseId: targetId,
            setIndex,
            reps: parseInt(reps, 10) || 0,
            weightKg,
            ...(rirNum !== undefined && !Number.isNaN(rirNum) ? { rir: rirNum } : {}),
          });
          haptics.success();
          // WIDGET-002: a logged set that meets BOTH targets of this exercise's
          // goal marks it achieved (fire-and-forget; StepperLogger re-reads the
          // goal row after each set and shows the achieved state).
          void checkGoalAchieved(
            targetId,
            weightKg,
            parseInt(reps, 10) || 0,
            logged?.id ?? null,
          ).then((achieved) => {
            if (achieved) haptics.success();
          });
          // PR detection: compute e1RM (Epley, reps capped at 12) and compare
          // to prior all-time best. Show PRToast if new best.
          {
            const w = weightKg;
            const r = Math.min(parseInt(reps, 10) || 0, 12);
            if (w > 0 && r > 0) {
              const newE1rm = epley1Rm(w, r);
              const priorPB = (stepperPB ?? exercisePB);
              const priorBest = priorPB?.all_time_best;
              const priorE1rm = priorBest
                ? epley1Rm(priorBest.weight_kg, Math.min(priorBest.reps, 12))
                : 0;
              if (newE1rm > priorE1rm && priorE1rm > 0) {
                const exName =
                  routineSession?.exercises[routineSession.currentIndex]?.name ??
                  selectedExercise?.name ?? '';
                const unitLabel = unitPref === 'lbs' ? 'lb' : 'kg';
                const dispE1rm = unitPref === 'lbs'
                  ? Math.round(newE1rm * 2.20462 * 10) / 10
                  : Math.round(newE1rm * 10) / 10;
                const dispPrior = unitPref === 'lbs'
                  ? Math.round(priorE1rm * 2.20462 * 10) / 10
                  : Math.round(priorE1rm * 10) / 10;
                setPrToast({
                  exerciseName: exName,
                  e1rm: dispE1rm,
                  delta: Math.round((dispE1rm - dispPrior) * 10) / 10,
                  unitLabel,
                });
              }
            }
          }
          setTimerActive(true);
          setRestSecondsLeft(restDefault);
          // Also start background-safe timer (schedules local notification)
          restTimer.start(restDefault);
        } catch (err) {
          console.warn('[PF] WorkoutLoggerHost/handleStepperLogSet:', err instanceof Error ? err.message : String(err));
        }
      },
      // stepperPB, exercisePB, routineSession, restDefault, restTimer are intentionally
      // included so PR detection and rest-timer always read the current values (WL-001 /
      // stale-closure-rest / wlh-stale-closure-prdetection).
      [workout, selectedExercise, logSet, updateRoutineExercise, stepperSets, unitPref,
       stepperPB, exercisePB, routineSession, restDefault, restTimer],
    );

    // Edit a previously-logged LIFT set (e.g. fix a mistyped weight). The sync
    // layer has no update op, so we replace the row: delete the old set, then
    // re-insert the correction at the SAME set_index. Reuses the proven
    // deleteSet + logSet paths — no new server contract.
    const handleStepperUpdateSet = useCallback(
      async (exerciseId: string, setIndex: number, weight: string, reps: string, rir?: string) => {
        // 1) Update the in-memory chip mirror immediately for instant feedback.
        setStepperSets((prev) => {
          const next = new Map(prev);
          const existing = [...(next.get(exerciseId) ?? [])];
          if (existing[setIndex]) {
            existing[setIndex] = { ...existing[setIndex], weight, reps, rir };
            next.set(exerciseId, existing);
          }
          return next;
        });
        // 2) Persist the correction.
        const targetId = exerciseId || selectedExercise?.id || '';
        if (!workout?.id || !targetId) return;
        const existingRow = sets.find(
          (s) => s.exercise_id === targetId && s.set_index === setIndex && s.kind === 'lift',
        );
        const rirNum = rir != null && rir.trim() !== '' ? parseInt(rir, 10) : undefined;
        try {
          if (existingRow) {
            await deleteSet(existingRow.id);
          }
          await logSet({
            kind: 'lift',
            workoutId: workout.id,
            exerciseId: targetId,
            setIndex,
            reps: parseInt(reps, 10) || 0,
            // CRITICAL: convert the display value to kg with the user's unit —
            // the log path does this (line ~545); the edit path must too, or a
            // user on lbs re-saving 185 stores it as 185 KG (a 2.2x balloon +
            // fake PR). weight_kg is the canonical exact-kg column.
            weightKg: displayToKg(parseWeightInput(weight) ?? 0, unitPref),
            ...(rirNum !== undefined && !Number.isNaN(rirNum) ? { rir: rirNum } : {}),
          });
          haptics.success();
        } catch (err) {
          console.warn('[PF] WorkoutLoggerHost/handleStepperUpdateSet:', err instanceof Error ? err.message : String(err));
        }
      },
      [workout, selectedExercise, sets, deleteSet, logSet, unitPref],
    );

    // P1c — edit a set from a PAST session. Unlike handleStepperUpdateSet (which
    // only knows today's workout/sets), this UPDATEs the exact historical row in
    // place via setEditing.updateLiftSet (tier-branched, local-first), then asks
    // the day screen to re-read. No row is deleted/re-inserted, so set_index and
    // identity are preserved.
    const handleHistoryUpdateSet = useCallback(
      // `chipIndex` is the stepper's editingIndex (position in currentExerciseSets).
      async (exerciseId: string, chipIndex: number, weight: string, reps: string, rir?: string) => {
        // 1) Optimistic chip mirror.
        setStepperSets((prev) => {
          const next = new Map(prev);
          const existing = [...(next.get(exerciseId) ?? [])];
          if (existing[chipIndex]) {
            existing[chipIndex] = { ...existing[chipIndex], weight, reps, rir };
            next.set(exerciseId, existing);
          }
          return next;
        });
        // 2) Resolve the real row and UPDATE it in place (real DB set_index).
        const row = historyRowMapRef.current.get(historyRowKey(exerciseId, chipIndex));
        if (!row) return;
        const rirNum = rir != null && rir.trim() !== '' ? parseInt(rir, 10) : undefined;
        try {
          await updateLiftSet(user, {
            id: row.id,
            workoutId: row.workoutId,
            exerciseId,
            setIndex: row.setIndex,
            // Convert DISPLAY → exact kg (same invariant as the log/edit paths —
            // a user on lbs re-saving 185 must store 83.9 kg, never 185 kg).
            weightKg: displayToKg(parseWeightInput(weight) ?? 0, unitPref),
            reps: parseInt(reps, 10) || 0,
            ...(rirNum !== undefined && !Number.isNaN(rirNum) ? { rir: rirNum } : {}),
          });
          haptics.success();
          historyChangeRef.current?.();
        } catch (err) {
          console.warn('[PF] WorkoutLoggerHost/handleHistoryUpdateSet:', err instanceof Error ? err.message : String(err));
        }
      },
      [user, unitPref],
    );

    const handleStepperLogCardioSet = useCallback(
      async (
        exerciseId: string,
        durationSec: number,
        distanceM?: number,
        avgPaceSecPerKm?: number,
        metrics?: CardioMetrics,
      ) => {
        const setIndex = stepperSets.get(exerciseId)?.length ?? 0;
        setStepperSets((prev) => {
          const next = new Map(prev);
          const existing = next.get(exerciseId) ?? [];
          next.set(exerciseId, [...existing, { weight: '', reps: '', durationSec, distanceM, avgPaceSecPerKm }]);
          return next;
        });
        updateRoutineExercise(exerciseId);
        const targetId = exerciseId || selectedExercise?.id || '';
        if (!workout?.id || !targetId) return;
        try {
          const logged = await logSet({
            kind: 'cardio',
            workoutId: workout.id,
            exerciseId: targetId,
            setIndex,
            durationSec,
            ...(distanceM !== undefined ? { distanceM } : {}),
            ...(avgPaceSecPerKm !== undefined ? { avgPaceSecPerKm } : {}),
          });
          // P5: persist the OPTIONAL rich metrics (avg/max HR, calories, cadence,
          // elevation, RPE, splits) onto the just-logged set row, keyed by its
          // id. On-device for ALL tiers (no REST), best-effort — a metrics write
          // failure never fails the set log. Skipped entirely when undefined.
          if (metrics && logged?.id) {
            void setSetMetrics(logged.id, metrics);
          }
          haptics.success();
          setTimerActive(true);
          setRestSecondsLeft(restDefault);
          // Also start background-safe timer (mirrors the lift path).
          restTimer.start(restDefault);
        } catch (err) {
          console.warn('[PF] WorkoutLoggerHost/handleStepperLogCardioSet:', err instanceof Error ? err.message : String(err));
        }
      },
      // restDefault and restTimer added to ensure the cardio path uses the
      // current rest preset (WL-006 / wlh-stale-closure-cardio).
      [workout, selectedExercise, logSet, updateRoutineExercise, stepperSets, restDefault, restTimer],
    );

    const handleStepperAdvance = useCallback((toIndex: number) => {
      setRoutineSession((prev) => (prev ? { ...prev, currentIndex: toIndex } : prev));
    }, []);

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
      const { createRoutine } = await import('../api/routines');
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const exercises = routineSession.exercises
        .filter((ex) => ex.loggedSetCount > 0)
        // TICKET-088: template/bundled sessions carry a non-uuid (or empty)
        // exerciseId; the server's zod uuid() check 400s on ''. Send undefined
        // and let `name` be the source of truth (server resolves by name).
        .map((ex) => ({
          exercise_id: ex.exerciseId && UUID_RE.test(ex.exerciseId) ? ex.exerciseId : undefined,
          name: ex.name,
          target_sets: ex.loggedSetCount,
        }));
      if (exercises.length === 0) return;
      try {
        await createRoutine({ name: `Session ${new Date().toLocaleDateString()}`, exercises });
        Alert.alert('Routine saved', 'Your session has been saved as a new routine.');
        setStepperVisible(false);
        setRoutineSession(null);
      } catch {
        Alert.alert('Error', 'Could not save routine');
      }
    }, [routineSession]);

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

    const handleSelectAlternative = useCallback(
      (alt: { id: string; name: string; equipment: string | null }) => {
        void rememberExerciseName(alt.id, alt.name);
        setRoutineSession((prev) => {
          if (!prev) return prev;
          const exercises = prev.exercises.map((ex, idx) =>
            idx === prev.currentIndex ? { ...ex, exerciseId: alt.id, name: alt.name } : ex,
          );
          return { ...prev, exercises };
        });
        setAlternativesSheetExerciseId(null);
        setAlternativesList([]);
      },
      [],
    );

    const totalSets = sets.length;

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
              // TICKET-097: completion-based cycle advance (in-loop routines only).
              const finishedRoutineId =
                routineSession?.source === 'routine' ? routineSession.routineId : undefined;
              setStepperVisible(false);
              setRoutineSession(null);
              setSelectedExercise(null);
              if (finishedRoutineId) markRoutineCompleted(finishedRoutineId).catch(() => {});
              if (onFinish) {
                onFinish();
              } else {
                router.replace('/(tabs)');
              }
            },
          },
        ],
      );
    }, [totalSets, router, onFinish, routineSession]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <>
        {/* Exercise picker modal */}
        <ExercisePicker
          visible={pickerVisible}
          onSelect={handleExerciseSelect}
          onClose={() => {
            setPickerVisible(false);
            setFreeSessionPickerMode(false);
          }}
        />

        {/* Alternatives sheet */}
        {alternativesSheetExerciseId && (
          <Modal
            visible
            transparent
            animationType="slide"
            onRequestClose={() => setAlternativesSheetExerciseId(null)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
              onPress={() => setAlternativesSheetExerciseId(null)}
            />
            <View style={[altStyles.sheet, { backgroundColor: theme.colors.bgElevated }]}>
              <View style={[altStyles.handle, { backgroundColor: theme.colors.borderDefault }]} />
              <Text style={[altStyles.title, { color: theme.colors.textPrimary }]}>Alternative exercises</Text>
              <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginBottom: spacing.s3 }}>
                Same muscles, different equipment
              </Text>
              {alternativesLoading ? (
                <ActivityIndicator color={theme.colors.accentDefault} style={{ marginTop: spacing.s4 }} />
              ) : alternativesList.length === 0 ? (
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginTop: spacing.s3 }}>
                  No alternatives found for this exercise.
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 320 }}>
                  {alternativesList.map((alt) => (
                    <TouchableOpacity
                      key={alt.id}
                      style={[altStyles.row, { borderBottomColor: theme.colors.borderDefault }]}
                      onPress={() => handleSelectAlternative(alt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${alt.name}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.textPrimary, fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium }}>
                          {alt.name}
                        </Text>
                        {alt.equipment ? (
                          <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm }}>{alt.equipment}</Text>
                        ) : null}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity
                style={[altStyles.cancelBtn, { borderColor: theme.colors.borderDefault }]}
                onPress={() => setAlternativesSheetExerciseId(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodyMd }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        )}

        {/* Rest timer banner */}
        {restSecondsLeft !== null && (
          <View style={[restStyles.banner, { backgroundColor: theme.colors.bgElevated }]}>
            <TouchableOpacity
              onPress={cycleRestDefault}
              accessibilityRole="button"
              accessibilityLabel={`Rest timer. Default ${restDefault} seconds. Tap to change default`}
            >
              <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodyMd, fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] }}>
                Rest: {Math.floor(restSecondsLeft / 60).toString().padStart(2, '0')}:{(restSecondsLeft % 60).toString().padStart(2, '0')}
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.micro }}>  · {restDefault}s ▸</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                // Extend both the visual banner countdown AND restart the
                // background timer at the new duration so they stay in sync (WL-002).
                setRestSecondsLeft((v) => {
                  const next = (v ?? 0) + 30;
                  restTimer.start(next);
                  return next;
                });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add 30 seconds of rest"
            >
              <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.bold }}>+30s</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setRestSecondsLeft(null); restTimer.cancel(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss rest timer"
            >
              <Text style={{ color: theme.colors.textTertiary, fontSize: 20, lineHeight: 24 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Paywall */}
        <PaywallUpgradeModal
          visible={showPaywall}
          onDismiss={() => setShowPaywall(false)}
          onUpgrade={() => {
            setShowPaywall(false);
            router.push('/(tabs)/plans');
          }}
        />

        {/* Focus Stepper modal.
            Guard on routineSession: a full-screen Modal whose only child is
            `{routineSession && <StepperLogger/>}` would otherwise present an
            EMPTY opaque overlay if stepperVisible were ever true without a
            session — covering the whole UI with just the status-bar icons
            showing ("buttons disappeared, only weird buttons at the top").
            Tying visibility to the session makes that state impossible. */}
        <Modal
          visible={stepperVisible && !!routineSession}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setStepperVisible(false)}
        >
          {routineSession && (
            <StepperLogger
              routineSession={routineSession}
              // P1c: in history-edit mode the only write path is the chip-tap →
              // "Save set" correction, routed to the in-place UPDATE. We never
              // append to a past workout through the today-keyed logSet, so
              // onLogSet is a safe no-op here (the stepper already ignores an
              // empty-input press); onUpdateSet hits the historical row.
              onLogSet={historyMode ? (() => {}) : handleStepperLogSet}
              onUpdateSet={historyMode ? handleHistoryUpdateSet : handleStepperUpdateSet}
              onLogCardioSet={historyMode ? undefined : handleStepperLogCardioSet}
              onAdvance={handleStepperAdvance}
              onFinish={() => {
                // TICKET-097: completion-based cycle advance (in-loop routines only).
                const finishedRoutineId =
                  !historyMode && routineSession?.source === 'routine' ? routineSession.routineId : undefined;
                setStepperVisible(false);
                setRoutineSession(null);
                if (historyMode) { setHistoryMode(false); historyChangeRef.current?.(); }
                if (finishedRoutineId) markRoutineCompleted(finishedRoutineId).catch(() => {});
              }}
              onBrowseLibrary={() => {
                setStepperVisible(false);
                setPickerVisible(true);
              }}
              variant={
                historyMode
                  ? 'routine'
                  : routineSession?.source === 'routine'
                  ? 'routine'
                  : routineSession?.source === 'free' && user?.is_paid
                    ? 'smart'
                    : routineSession?.source === 'free'
                      ? 'free'
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
                (stepperPB ?? exercisePB)?.all_time_best
                  ? `${formatWeight((stepperPB ?? exercisePB)!.all_time_best!.weight_kg, unitPref)} × ${(stepperPB ?? exercisePB)!.all_time_best!.reps}`
                  : null
              }
              lastSessionLabel={
                (stepperPB ?? exercisePB)?.last_session
                  ? `${formatWeight((stepperPB ?? exercisePB)!.last_session!.weight_kg, unitPref)} × ${(stepperPB ?? exercisePB)!.last_session!.reps}`
                  : null
              }
              lastTopSetDisplay={(() => {
                const ls = (stepperPB ?? exercisePB)?.last_session;
                if (!ls) return null;
                const w = unitPref === 'lbs' ? roundToNearestQuarterLb(kgToLbs(ls.weight_kg)) : ls.weight_kg;
                return { weight: w, reps: ls.reps };
              })()}
              repTarget={routineSession.exercises[routineSession.currentIndex]?.targetReps ?? null}
              currentExerciseSets={
                stepperSets.get(routineSession.exercises[routineSession.currentIndex]?.exerciseId ?? '') ?? []
              }
              onAddOffRoutineExercise={historyMode ? undefined : handleStepperAddOffRoutine}
              onClose={() => {
                setStepperVisible(false);
                if (historyMode) { setHistoryMode(false); historyChangeRef.current?.(); }
              }}
              unitPref={unitPref}
              weekNumber={historyMode ? null : (routineSession.weekNumber ?? null)}
              restSeconds={restDefault}
              // No "choose alternative" / suggestions when correcting a past
              // session — those mutate the live routine, not history.
              onChooseAlternative={
                historyMode
                  ? undefined
                  : user?.is_paid ? handleChooseAlternative : (() => setShowPaywall(true))
              }
            />
          )}
        </Modal>
      {/* PR celebration toast */}
      <PRToast data={prToast} onDismiss={() => setPrToast(null)} />
      </>
    );
  },
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const altStyles = StyleSheet.create({
  sheet: {
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
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    marginBottom: spacing.s4,
  },
  title: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.s1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  cancelBtn: {
    marginTop: spacing.s4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
});

const restStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    bottom: 90,
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
});
