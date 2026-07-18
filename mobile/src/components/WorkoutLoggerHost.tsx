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
  AppState,
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
// Stage 3 (addendum §4/§5) + SUBS-001: the "machine busy? swap" sheet. Now the
// unified SubstituteSwapSheet — the user's preloaded substitutes (free for all
// tiers, from the routine JSON + the on-device exercise_substitutes table)
// listed FIRST, then the Pro region-aware engine candidates (NO network).
// Session mode: a swap here applies to TODAY only — the saved routine is never
// touched (founder decision 2026-07-18); permanent swaps live in the editor.
import { SubstituteSwapSheet, type SwapSelection } from './SubstituteSwapSheet';
import {
  mergedSubstitutesFor,
  addGlobalSubstitute,
  type ScopedSubstitute,
  type SubstituteScope,
} from '../data/substitutes';
// S1 supersets/dropsets — the pairing sheet + drop-chain bar own their own UI so
// the StepperLogger insertion stays minimal (big-file hazard pattern).
import { SupersetPairSheet, type SupersetPairCandidate } from './logger/SupersetPairSheet';
import { alternativesForDetailed, type SwapCandidate } from '../planGen/quickSwap';
import { excludeExercisePermanently } from '../planGen/quickSwapPersist';
import { loadActivePlan } from '../planGen/planStore';
import { loadLocalProfile } from '../data/profile';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { haptics } from '../utils/haptics';
import { formatWeight, kgToLbs, roundToNearestQuarterLb, displayToKg, parseWeightInput } from '../constants/units';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRoutine } from '../data/routines';
import { getRestTimerDefaultSec, getGroupRestMode, GroupRestMode } from '../data/appSettings'; // P1b — device-local rest default; TICKET-144 — grouped-set rest mode
import { updateLiftSet } from '../data/setEditing'; // P1c — in-place edit of a past set
import { markRoutineCompleted } from '../data/schedule'; // TICKET-097
import { checkGoalAchieved } from '../data/exerciseGoals'; // WIDGET-002
import { setSetMetrics, CardioMetrics } from '../data/cardioMetrics'; // P5 — rich cardio metrics
import { createWorkout } from '../api/workouts';
import { toDateKey } from '../utils/dateHelpers';
import { getExercises } from '../api/exercises';
import { getPersonalBest, getPersonalBests, PersonalBest } from '../api/sets';
import { Exercise } from '../types/api';
import { RoutineSession, RoutineSessionExercise, seedSessionExercise } from './RoutineStrip';
import { suggestNextExercise, suggestNextExercises, SessionExercise, SuggestCandidate } from '../utils/smartSuggest';
import PRToast, { PRToastData } from './PRToast';
// TICKET-131: shareable workout summary card (zero network; user-initiated OS share).
import { ShareCardSheet } from './ShareCardSheet';
import type { ShareCardPrBadge } from '../lib/shareCard/shareCardData';
import type { FlexLiftSetInput } from '../lib/shareCard/shareCardPercentile';
import { useLocalStreak } from '../hooks/useStreak';
// TICKET-134: exercise detail sheet, reachable from quick-swap candidates.
import { ExerciseDetailSheet, ExerciseDetailTarget } from './ExerciseDetailSheet';
// TICKET-129: per-set note + flags from the live logger (long-press a set chip).
import { SetNoteSheet } from './logger/SetNoteSheet';
import { getLocalSetNoteFlags, saveSetNoteFlags } from '../data/setNotes';
// TICKET-136: best-effort write of the finished workout to Apple Health / Health Connect.
import { writeWorkoutToHealthKit, getHealthWriteEnabled } from '../services/healthKit';
// TICKET-143: badge evaluation after a workout is saved (cheap, fire-and-forget).
import { runBadgeEvaluation } from '../data/badges/evaluator';
import { useRestTimer, REST_TIMER_STEP } from '../hooks/useRestTimer';
// Founder logger fixes #1/#2: the mini-bar (minimize-to-bubble) + the pure
// timer helper that derives the countdown from an ABSOLUTE deadline (no drift).
import { WorkoutMiniBar } from './WorkoutMiniBar';
import {
  restRemainingSec,
  restAfterSet,
  nextInGroupIndex,
  dropPrefillKg,
  isDropsetPlannedSet,
} from './loggerLogic';
import { genId } from '../db/localDb';
import { epley1Rm } from '../lib/oneRm';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onDismiss} accessibilityLabel={t('logger:paywallModal.dismissA11y')} />
      <View style={[pwStyles.sheet, { backgroundColor: theme.colors.bgPrimary, borderTopLeftRadius: r.lg, borderTopRightRadius: r.lg, paddingHorizontal: sp.s5, paddingTop: sp.s5, paddingBottom: sp.s6 }]}>
        <View style={[pwStyles.pill, { backgroundColor: theme.colors.borderDefault, borderRadius: r.full ?? 999, marginBottom: sp.s5 }]} />
        <View style={{ alignItems: 'center', marginBottom: sp.s3 }}>
          <View style={[{ backgroundColor: theme.colors.accentSecondary, borderRadius: r.full ?? 999, width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="flash" size={28} color={theme.colors.accentDefault} />
          </View>
        </View>
        <Text style={{ fontSize: fs.display, fontWeight: fw.bold, color: theme.colors.textPrimary, textAlign: 'center', marginBottom: sp.s2 }}>{t('logger:paywallModal.title')}</Text>
        <Text style={{ fontSize: fs.bodyMd, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: sp.s5 }}>
          {t('logger:paywallModal.body')}{' '}
          <Text style={{ fontWeight: fw.bold, color: theme.colors.textPrimary }}>{t('logger:paywallModal.bodyBold')}</Text> {t('logger:paywallModal.bodySuffix')}
        </Text>
        <TouchableOpacity style={[{ backgroundColor: theme.colors.accentDefault, borderRadius: r.md, paddingVertical: sp.s4, marginBottom: sp.s3, alignItems: 'center' }]} onPress={onUpgrade} accessibilityRole="button" accessibilityLabel={t('logger:paywallModal.upgradeA11y')}>
          <Text style={{ fontSize: fs.bodyLg, fontWeight: fw.bold, color: theme.components.buttonPrimaryText, textAlign: 'center' }}>{t('logger:paywallModal.seePlans')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ paddingVertical: sp.s3, alignItems: 'center' }} onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('logger:paywallModal.maybeLaterA11y')}>
          <Text style={{ fontSize: fs.bodyMd, color: theme.colors.textTertiary, textAlign: 'center' }}>{t('logger:paywallModal.maybeLater')}</Text>
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
    const { t } = useTranslation();
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
    // Founder fix #2 (minimize, don't terminate): the header down-arrow now
    // MINIMIZES the logger — the session (routineSession + stepperSets + the rest
    // timer) stays fully alive; only the full-screen stepper Modal is hidden and a
    // persistent WorkoutMiniBar is shown at the bottom of the app. Tapping the bar
    // restores the stepper mid-session. Ending a workout still happens ONLY via the
    // explicit Finish/discard action (handleFinishWorkout / onFinish) with its
    // existing confirmation. Visibility is a 3-state machine:
    //   • stepperVisible && !minimized → full stepper open
    //   • minimized (session alive)    → mini-bar shown, stepper hidden
    //   • no session                   → closed (nothing shown)
    const [minimized, setMinimized] = useState(false);

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
    // S1: id of the most recently logged lift row per exerciseId, so starting a
    // drop chain can retro-tag the top set (index 0) to keep it out of PRs.
    const lastLiftRowRef = useRef<Map<string, string>>(new Map());
    const historyRowKey = (exerciseId: string, chipIndex: number) => `${exerciseId}#${chipIndex}`;

    // Timer
    const [timerActive, setTimerActive] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    // Founder fix #1 (rest-timer drift): the countdown's SINGLE SOURCE OF TRUTH is
    // an absolute end timestamp (epoch ms), captured at the same instant the
    // background notification is scheduled. The on-screen remaining is DERIVED from
    // `restEndAt - now` (restRemainingSec), never accumulated per tick — so it is
    // correct after backgrounding, navigation, minimize, or a remount, and can
    // never drift against the scheduled notification. `restNow` is a wall-clock
    // tick bumped every second AND on AppState foreground.
    const [restEndAt, setRestEndAt] = useState<number | null>(null);
    const [restNow, setRestNow] = useState(() => Date.now());
    const restSecondsLeft = restEndAt == null ? null : restRemainingSec(restEndAt, restNow);
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
    // TICKET-144 acceptance criterion 2: grouped-set rest mode ('after_round'
    // default vs 'after_exercise'). Local-only KV read (getGroupRestMode), same
    // shape/safety as getRestTimerDefaultSec above — loaded ONCE per session
    // mount (not on the boot path; this effect only runs once this host/stepper
    // is mounted for an active workout) and passed into the pure restAfterSet
    // predicate below.
    const [groupRestMode, setGroupRestMode] = useState<GroupRestMode>('after_round');
    useEffect(() => {
      let cancelled = false;
      getGroupRestMode()
        .then((mode) => { if (!cancelled) setGroupRestMode(mode); })
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

    // Derived countdown (fix #1): while a deadline is set, bump `restNow` every
    // second so the derived remaining re-renders. When the deadline passes, clear
    // `restEndAt` (idle) and fire the completion haptic exactly once. Re-derives
    // from the absolute deadline on every tick — no accumulator to drift.
    useEffect(() => {
      if (restEndAt == null) return;
      if (restEndAt - Date.now() <= 0) {
        haptics.light();
        setRestEndAt(null);
        return;
      }
      const t = setInterval(() => setRestNow(Date.now()), 1000);
      return () => clearInterval(t);
    }, [restEndAt, restNow]);

    // Fix #1: on AppState foreground, immediately re-derive the countdown from the
    // absolute deadline (a backgrounded JS timer stops firing, so the on-screen
    // time would otherwise be stale on return). The scheduled notification is
    // unaffected; this only re-syncs the visible banner + mini-bar chip.
    useEffect(() => {
      const sub = AppState.addEventListener('change', (st) => {
        if (st === 'active') setRestNow(Date.now());
      });
      return () => sub.remove();
    }, []);

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

    // TICKET-131: PR badges earned THIS session (exact kg — display conversion
    // happens inside the card), plus the share payload captured at Finish time.
    // Teardown/navigation is deferred until the share card closes.
    const sessionPrBadgesRef = useRef<ShareCardPrBadge[]>([]);
    const [shareCard, setShareCard] = useState<{
      workoutName: string | null;
      dayKey: string;
      durationSec: number | null;
      totalVolumeKg: number;
      setCount: number;
      prBadges: ShareCardPrBadge[];
      flexSets: FlexLiftSetInput[];
    } | null>(null);
    // Streak for the card: free tier computes locally; Pro passthrough is 0 and
    // the card simply omits the streak line (server streak isn't loaded here).
    const { streak: shareStreakWeeks } = useLocalStreak(0, false);

    // TICKET-134: detail sheet for a quick-swap candidate.
    const [swapDetailTarget, setSwapDetailTarget] = useState<ExerciseDetailTarget | null>(null);

    // TICKET-129: note/flags sheet for a live-session set chip (long-press).
    const [liveNoteTarget, setLiveNoteTarget] = useState<{
      setId: string;
      label: string;
      note: string | null;
      flags: number;
    } | null>(null);

    // ── S1 dropset chain state ────────────────────────────────────────────────
    // A drop CHAIN = a top set + N drops logged back-to-back with rest fully
    // suppressed. Non-null while a chain is active for the current exercise.
    //   chainId    — tags every row in the chain (metrics_json.drop.chainId)
    //   exerciseId — the owning exercise (chain ends if the user leaves it)
    //   topRowId   — the top set's row id (retro-tagged drop.index 0 on start)
    //   topWeightKg— exact kg of the top set (drives the prefill ladder)
    //   dropPct    — the per-drop reduction as a FRACTION (0.20 = −20%); the
    //                DropChainBar prefill uses this. Defaults to 0.20 for a
    //                manually-started (S1) chain; a routine-seeded (S2) chain
    //                passes the persisted drop_pct.
    //   plannedDrops — how many drops the plan prescribed (S2; guidance only —
    //                  the user can still add/stop drops freely). null for S1.
    //   links      — display-unit summary of each logged link (top + drops)
    const [dropChain, setDropChain] = useState<{
      chainId: string;
      exerciseId: string;
      topRowId: string | null;
      topWeightKg: number;
      dropPct: number;
      plannedDrops: number | null;
      links: { weight: string; reps: string; index: number }[];
    } | null>(null);

    // ── S1 superset "pair with…" sheet ────────────────────────────────────────
    const [pairSheetVisible, setPairSheetVisible] = useState(false);

    // Rest timer (background-safe, scheduled notification)
    const restTimer = useRestTimer(120);

    // Alternatives sheet
    const [alternativesSheetExerciseId, setAlternativesSheetExerciseId] = useState<string | null>(null);
    const [alternativesList, setAlternativesList] = useState<Array<{ id: string; name: string; equipment: string | null }>>([]);
    const [alternativesLoading, setAlternativesLoading] = useState(false);

    // Stage 3 quick-swap sheet (Pro, local-first, region-aware).
    const [quickSwapVisible, setQuickSwapVisible] = useState(false);
    const [quickSwapCandidates, setQuickSwapCandidates] = useState<SwapCandidate[]>([]);
    const [quickSwapReason, setQuickSwapReason] = useState<string | null>(null);
    const [quickSwapConfirmation, setQuickSwapConfirmation] = useState<string | null>(null);
    const [quickSwapCanPermanent, setQuickSwapCanPermanent] = useState(false);
    const [quickSwapOriginal, setQuickSwapOriginal] = useState<{ id: string; name: string } | null>(null);
    // SUBS-001: the user's preloaded substitutes for the current exercise
    // (routine-scoped, carried on the session exercise, merged with global).
    const [quickSwapSubs, setQuickSwapSubs] = useState<ScopedSubstitute[]>([]);

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
              // S2: seed persisted superset grouping + dropset plans into the
              // session model (groupId/groupRounds/dropsetPlan) via the shared
              // mapper, so a saved superset starts already-linked and a saved
              // dropset auto-offers its chain. Absent fields ⇒ today's flow.
              exercises: routine.exercises.map((ex) => ({
                ...seedSessionExercise(ex),
                category: (ex as { category?: string }).category as RoutineSessionExercise['category'] | undefined,
              })),
              currentIndex: 0,
            });
          })
          .catch(() => {
            if (!mountedRef.current) return;
            Alert.alert(t('logger:workoutLoggerHost.couldNotLoadRoutineTitle'), t('logger:workoutLoggerHost.pleaseTryAgain'));
          });
      },

      startWithExercise(exerciseId: string, exerciseName: string) {
        const session: RoutineSession = {
          source: 'free',
          name: t('logger:workoutLoggerHost.freeSessionName'),
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
                id: s.id, // TICKET-129: durable id → note/flag affordance
              };
            }
            return { weight: s.weightDisplay, reps: s.reps, rir: s.rir, id: s.id };
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
              name: t('logger:workoutLoggerHost.freeSessionName'),
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
          // S1: remember this row id so a subsequent "+ Drop set" can retro-tag
          // this (top) set as drop.index 0 → excluded from PRs.
          if (logged?.id) lastLiftRowRef.current.set(targetId, logged.id);
          // TICKET-129: attach the durable row id to the chip so the note/flag
          // affordance (long-press) works for sets logged THIS session too.
          if (logged?.id) {
            const rowId = logged.id;
            setStepperSets((prev) => {
              const next = new Map(prev);
              const arr = [...(next.get(exerciseId) ?? [])];
              if (arr[setIndex]) {
                arr[setIndex] = { ...arr[setIndex], id: rowId };
                next.set(exerciseId, arr);
              }
              return next;
            });
          }
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
          // ── S1: is this row part of a DROP chain? ────────────────────────
          // A chain is active when dropChain targets the current exercise. The
          // TOP set is not itself a drop (index 0, tagged only when the chain
          // starts); the extra rows the user logs via "+ Drop set" are drops
          // (index >= 1). We detect an active chain here so the PR toast is
          // skipped and the row is tagged.
          const activeChain =
            dropChain && dropChain.exerciseId === targetId ? dropChain : null;
          const isDrop = !!activeChain && activeChain.links.length >= 1;
          const dropIndex = activeChain ? activeChain.links.length : 0;

          // ── S1: group tagging inputs (superset) ──────────────────────────
          const curEx = routineSession?.exercises[routineSession.currentIndex];
          const grouped = !!curEx?.groupId;
          const groupRound = grouped ? (stepperSets.get(targetId)?.length ?? 0) + 1 : 0;

          // metrics_json tagging (mirror the cardio setSetMetrics pattern):
          // best-effort, on-device, NEVER blocks logging. Merge superset + drop
          // tags. Skipped entirely when neither applies.
          if (logged?.id && (grouped || activeChain)) {
            const merged: CardioMetrics & {
              superset?: { group: string; round: number };
              drop?: { chainId: string; index: number };
            } = {};
            if (grouped && curEx?.groupId) {
              merged.superset = { group: curEx.groupId, round: groupRound };
            }
            if (activeChain) {
              merged.drop = { chainId: activeChain.chainId, index: dropIndex };
            }
            void setSetMetrics(logged.id, merged as CardioMetrics);
          }

          // Advance the drop chain: append this link; if it's the top set
          // (chain just started, index 0), record its row id for retro-tagging.
          if (activeChain) {
            setDropChain((prev) => {
              if (!prev || prev.exerciseId !== targetId) return prev;
              return {
                ...prev,
                topRowId: prev.topRowId ?? logged?.id ?? null,
                links: [...prev.links, { weight, reps, index: dropIndex }],
              };
            });
          }

          // PR detection: compute e1RM (Epley, reps capped at 12) and compare
          // to prior all-time best. Show PRToast if new best. S1 PR guard: a DROP
          // row (fatigue set) can never claim a PR — skip the toast entirely.
          if (!isDrop) {
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
                // TICKET-131: remember the PR (exact kg) for the share card.
                sessionPrBadgesRef.current.push({
                  exerciseName: exName,
                  e1rmKg: newE1rm,
                  deltaKg: newE1rm - priorE1rm,
                });
              }
            }
          }
          setTimerActive(true);

          // ── S1: rest suppression + interior auto-advance ─────────────────
          // Rest is suppressed (a) while a drop chain is active, and (b) mid-
          // superset-round when another group member still has work. We build a
          // session snapshot with the CURRENT exercise's live logged count (the
          // optimistic setStepperSets above lags one render) so restAfterSet /
          // nextInGroupIndex see this set as already logged.
          const liveCount = (stepperSets.get(targetId)?.length ?? 0) + 1;
          const snapshot = routineSession
            ? {
                ...routineSession,
                exercises: routineSession.exercises.map((e, i) =>
                  i === routineSession.currentIndex
                    ? { ...e, loggedSetCount: liveCount }
                    : e,
                ),
              }
            : null;
          const suppressForChain = !!activeChain;
          const suppressForGroup =
            !!snapshot && !restAfterSet(snapshot, snapshot.currentIndex, groupRestMode);
          if (suppressForChain || suppressForGroup) {
            // No rest — either chain the next drop or hop to the next group
            // member. For a group, auto-advance the stepper immediately.
            if (!suppressForChain && snapshot) {
              const nextIdx = nextInGroupIndex(snapshot, snapshot.currentIndex);
              if (nextIdx != null) {
                setRoutineSession((prev) =>
                  prev ? { ...prev, currentIndex: nextIdx } : prev,
                );
              }
            }
          } else if (
            // ── S2: AUTO-OFFER a drop chain for a PLANNED dropset set ─────────
            // When a persisted routine marks THIS set as a dropset set (last N or
            // 'all'), instead of resting we open the DropChainBar pre-armed with
            // the plan's drops/pct (via the S1 chain path). The user can dismiss
            // ("Done — start rest") anytime. Only fires when no chain is already
            // active (the top set itself). Grouped members that were rest-
            // suppressed above never reach here (superset interior beats dropset).
            !activeChain &&
            (() => {
              const plan = curEx?.dropsetPlan;
              if (!plan) return false;
              const effectiveTotal =
                curEx?.groupId != null && typeof curEx?.groupRounds === 'number' && curEx.groupRounds > 0
                  ? curEx.groupRounds
                  : typeof curEx?.targetSets === 'number' && curEx.targetSets > 0
                    ? curEx.targetSets
                    : null;
              return isDropsetPlannedSet(liveCount, effectiveTotal, plan);
            })()
          ) {
            // Arm the chain with the plan's percentage (stored as an integer 5–40;
            // convert to a fraction) and prescribed drop count. Rest stays
            // suppressed while the chain is active (endDropChain fires it later).
            const plan = curEx!.dropsetPlan!;
            const pctFraction = (typeof plan.dropPct === 'number' ? plan.dropPct : 20) / 100;
            const plannedDrops = typeof plan.drops === 'number' ? plan.drops : 2;
            beginDropChain(pctFraction, plannedDrops);
          } else {
            // Fix #1: capture the ABSOLUTE deadline at the same instant the
            // notification is scheduled — the banner/mini-bar countdown derives
            // from this and never drifts against the scheduled alarm.
            setRestEndAt(Date.now() + restDefault * 1000);
            setRestNow(Date.now());
            // Also start background-safe timer (schedules local notification)
            restTimer.start(restDefault);
          }
        } catch (err) {
          console.warn('[PF] WorkoutLoggerHost/handleStepperLogSet:', err instanceof Error ? err.message : String(err));
        }
      },
      // stepperPB, exercisePB, routineSession, restDefault, restTimer are intentionally
      // included so PR detection and rest-timer always read the current values (WL-001 /
      // stale-closure-rest / wlh-stale-closure-prdetection).
      [workout, selectedExercise, logSet, updateRoutineExercise, stepperSets, unitPref,
       stepperPB, exercisePB, routineSession, restDefault, restTimer, dropChain, beginDropChain, groupRestMode],
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
          // S1: tag the superset group on the cardio row too, if grouped.
          const curExC = routineSession?.exercises[routineSession.currentIndex];
          if (logged?.id && curExC?.groupId) {
            const round = (stepperSets.get(targetId)?.length ?? 0) + 1;
            const base = (metrics ?? {}) as CardioMetrics & {
              superset?: { group: string; round: number };
            };
            void setSetMetrics(logged.id, {
              ...base,
              superset: { group: curExC.groupId, round },
            } as CardioMetrics);
          }
          haptics.success();
          setTimerActive(true);
          // S1: suppress rest + auto-advance mid-superset-round (mirror the lift
          // path). Cardio has no drop chains, so only the group predicate applies.
          const liveCountC = (stepperSets.get(targetId)?.length ?? 0) + 1;
          const snapshotC = routineSession
            ? {
                ...routineSession,
                exercises: routineSession.exercises.map((e, i) =>
                  i === routineSession.currentIndex
                    ? { ...e, loggedSetCount: liveCountC }
                    : e,
                ),
              }
            : null;
          if (snapshotC && !restAfterSet(snapshotC, snapshotC.currentIndex, groupRestMode)) {
            const nextIdx = nextInGroupIndex(snapshotC, snapshotC.currentIndex);
            if (nextIdx != null) {
              setRoutineSession((prev) =>
                prev ? { ...prev, currentIndex: nextIdx } : prev,
              );
            }
          } else {
            // Fix #1: absolute deadline captured with the notification schedule.
            setRestEndAt(Date.now() + restDefault * 1000);
            setRestNow(Date.now());
            // Also start background-safe timer (mirrors the lift path).
            restTimer.start(restDefault);
          }
        } catch (err) {
          console.warn('[PF] WorkoutLoggerHost/handleStepperLogCardioSet:', err instanceof Error ? err.message : String(err));
        }
      },
      // restDefault and restTimer added to ensure the cardio path uses the
      // current rest preset (WL-006 / wlh-stale-closure-cardio).
      [workout, selectedExercise, logSet, updateRoutineExercise, stepperSets, restDefault, restTimer, routineSession, groupRestMode],
    );

    const handleStepperAdvance = useCallback((toIndex: number) => {
      // Leaving an exercise ends any active drop chain (chain metadata is only
      // valid while the user is on the chain's exercise).
      setDropChain(null);
      setRoutineSession((prev) => (prev ? { ...prev, currentIndex: toIndex } : prev));
    }, []);

    // ── S1: session-only superset pairing ─────────────────────────────────────
    // pairExercises assigns a fresh groupId + shared rounds (= max targetSets of
    // members, S1 default) to the current exercise + the chosen member indices,
    // and REORDERS the session so all members are CONTIGUOUS (grouped sequencing
    // assumes contiguous runs). Session-only — nothing is persisted to the routine
    // (that's S2). No network — pure in-memory state (local-first invariant holds).
    const pairExercises = useCallback((memberIndices: number[]) => {
      setRoutineSession((prev) => {
        if (!prev) return prev;
        const anchorIdx = prev.currentIndex;
        // The full member set = current exercise + the picked ones (deduped).
        const idxSet = new Set<number>([anchorIdx, ...memberIndices]);
        const memberIdxList = Array.from(idxSet).filter(
          (i) => i >= 0 && i < prev.exercises.length,
        );
        if (memberIdxList.length < 2) return prev; // need >= 2 for a superset
        if (memberIdxList.length > 5) memberIdxList.length = 5; // cap at 5 (circuit)

        const groupId = genId();
        // Shared rounds = max targetSets among members (fallback to logged-so-far
        // or 3 when none has a planned target). Editable in S2.
        const rounds = Math.max(
          3,
          ...memberIdxList.map((i) => prev.exercises[i]?.targetSets ?? 0),
          ...memberIdxList.map((i) => prev.exercises[i]?.loggedSetCount ?? 0),
        );

        // Tag members with the group + shared rounds.
        const tagged = prev.exercises.map((ex, i) =>
          idxSet.has(i) ? { ...ex, groupId, groupRounds: rounds } : ex,
        );

        // Reorder so members are contiguous, anchored at the current exercise's
        // position. Members keep their picked order; non-members keep their
        // relative order around the block.
        const memberSetFinal = new Set(memberIdxList);
        const members = memberIdxList
          .slice()
          .sort((a, b) => a - b)
          .map((i) => tagged[i]!);
        const insertionPoint = memberIdxList.reduce((m, i) => Math.min(m, i), Infinity);
        const rest = tagged.filter((_, i) => !memberSetFinal.has(i));
        const reordered = [
          ...rest.slice(0, insertionPoint),
          ...members,
          ...rest.slice(insertionPoint),
        ];
        // New currentIndex = the anchor exercise's new position (first member).
        const newCurrentIndex = insertionPoint;
        return { ...prev, exercises: reordered, currentIndex: newCurrentIndex };
      });
      setPairSheetVisible(false);
      haptics.success();
    }, []);

    const unpairGroup = useCallback((groupId: string) => {
      setRoutineSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exercises: prev.exercises.map((ex) =>
            ex.groupId === groupId
              ? { ...ex, groupId: null, groupRounds: undefined }
              : ex,
          ),
        };
      });
      haptics.light();
    }, []);

    // ── S1: dropset chain control ─────────────────────────────────────────────
    // Start a chain off the just-logged top set for the current exercise. The top
    // row was already logged (as a normal set); we retro-mark it index 0 and seed
    // the −20% ladder from its exact kg. "+ Log drop N" then logs a normal row via
    // the same onLogSet path, tagged drop.index >= 1 (handleStepperLogSet reads
    // dropChain). Rest is fully suppressed while the chain is active.
    // Core chain-starter, shared by the manual "+ Drop set" button (S1, default
    // −20%) and the S2 routine-seeded AUTO-OFFER (persisted drop_pct/drops). It
    // reads the just-logged top set for the current exercise, retro-tags it index
    // 0 (kept out of PRs), and arms the ladder with `pctFraction`.
    const beginDropChain = useCallback(
      (pctFraction: number, plannedDrops: number | null) => {
        const cur = routineSession?.exercises[routineSession.currentIndex];
        if (!cur) return;
        const targetId = cur.exerciseId || selectedExercise?.id || '';
        if (!targetId) return;
        // Top set = the last logged set for this exercise (its display weight/reps).
        const logged = stepperSets.get(targetId) ?? [];
        const top = logged[logged.length - 1];
        const topWeightKg = displayToKg(parseWeightInput(top?.weight ?? '') ?? 0, unitPref);
        const chainId = genId();
        // Retro-tag the top set row (index 0) so it is EXCLUDED from PRs (a chain
        // top is a working set but, once a drop chain starts, we mark it drop.index
        // 0 per the spec so the whole chain is bracketed and none of it claims a
        // PR beyond what the straight set already did). Best-effort — never blocks.
        const topRowId = lastLiftRowRef.current.get(targetId) ?? null;
        if (topRowId) {
          void setSetMetrics(topRowId, {
            drop: { chainId, index: 0 },
          } as unknown as CardioMetrics);
        }
        setDropChain({
          chainId,
          exerciseId: targetId,
          topRowId,
          topWeightKg,
          dropPct: Number.isFinite(pctFraction) && pctFraction > 0 ? pctFraction : 0.2,
          plannedDrops,
          links: [{ weight: top?.weight ?? '', reps: top?.reps ?? '', index: 0 }],
        });
        haptics.light();
      },
      [routineSession, selectedExercise, stepperSets, unitPref],
    );

    // Manual S1 start (from the stepper's "+ Drop set" affordance): default −20%,
    // no planned drop count.
    const startDropChain = useCallback(() => {
      beginDropChain(0.2, null);
    }, [beginDropChain]);

    const endDropChain = useCallback(() => {
      // Finish the chain and fire the normal rest timer.
      setDropChain(null);
      setTimerActive(true);
      setRestEndAt(Date.now() + restDefault * 1000);
      setRestNow(Date.now());
      restTimer.start(restDefault);
    }, [restDefault, restTimer]);

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
        await createRoutine({ name: t('logger:workoutLoggerHost.sessionRoutineName', { date: new Date().toLocaleDateString() }), exercises });
        Alert.alert(t('logger:workoutLoggerHost.sessionSavedTitle'), t('logger:workoutLoggerHost.sessionSavedMessage'));
        setStepperVisible(false);
        setRoutineSession(null);
      } catch {
        Alert.alert(t('logger:workoutLoggerHost.errorTitle'), t('logger:workoutLoggerHost.couldNotSaveRoutine'));
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
          Alert.alert(t('logger:workoutLoggerHost.errorTitle'), t('logger:workoutLoggerHost.couldNotLoadAlternatives'));
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

    // Stage 3 (addendum §4) + SUBS-001: the mid-workout swap. Opens for ALL
    // tiers now — the user's preloaded substitutes (session exercise's
    // routine-scoped subs merged with the global on-device table) are a FREE
    // feature; the region-aware engine candidates stay Pro (free users see the
    // locked teaser). All on-device — NO network. Selection swaps TODAY only;
    // the saved routine is never touched from the logger (founder 2026-07-18).
    const handleQuickSwap = useCallback(async () => {
      const cur = routineSession?.exercises[routineSession.currentIndex];
      if (!cur) return;
      const original = { id: cur.exerciseId || '', name: cur.name };
      setQuickSwapOriginal(original);
      setQuickSwapConfirmation(null);
      // User-preloaded substitutes (free for everyone; best-effort).
      try {
        const subs = await mergedSubstitutesFor(
          { exercise_id: cur.exerciseId || null, name: cur.name },
          cur.substitutes,
        );
        setQuickSwapSubs(subs);
      } catch { setQuickSwapSubs([]); }
      if (user?.is_paid) {
        // Load equipment + injuries on-device (local-first; best-effort).
        let equipment: string[] | null = null;
        let injuries: string[] | null = null;
        try {
          const prof = await loadLocalProfile();
          equipment = prof?.equipment_profile ?? null;
          injuries = prof?.injuries ?? null;
        } catch { /* no profile → no filter */ }
        // Exclude everything already in today's session (ids + names).
        const excludeIds = (routineSession?.exercises ?? []).map((e) => e.exerciseId).filter(Boolean);
        const excludeNames = (routineSession?.exercises ?? []).map((e) => e.name).filter(Boolean);
        const result = alternativesForDetailed(
          { id: cur.exerciseId || null, name: cur.name || null },
          { equipment, injuries, excludeIds, excludeNames },
        );
        setQuickSwapCandidates(result.candidates);
        setQuickSwapReason(result.reason ?? null);
      } else {
        setQuickSwapCandidates([]);
        setQuickSwapReason(null);
      }
      // "Never suggest again" only when a single generated plan exists (Stage 2).
      let canPermanent = false;
      try {
        const stored = await loadActivePlan();
        canPermanent = !!stored && stored.kind === 'plan';
      } catch { canPermanent = false; }
      setQuickSwapCanPermanent(!!user?.is_paid && canPermanent);
      setQuickSwapVisible(true);
    }, [user?.is_paid, routineSession]);

    const handleQuickSwapSelect = useCallback(
      (sel: SwapSelection) => {
        if (sel.exercise_id) void rememberExerciseName(sel.exercise_id, sel.name);
        setRoutineSession((prev) => {
          if (!prev) return prev;
          const exercises = prev.exercises.map((ex, idx) =>
            idx === prev.currentIndex
              ? { ...ex, exerciseId: sel.exercise_id ?? '', name: sel.name }
              : ex,
          );
          return { ...prev, exercises };
        });
        haptics.success();
        setQuickSwapConfirmation(`Swapped to ${sel.name} for today`);
        setQuickSwapCandidates([]);
        setQuickSwapSubs([]);
      },
      [],
    );

    // SUBS-001: add a preloaded substitute from the logger. Session mode always
    // saves GLOBAL ("all routines") — routine writes are editor-only, so a
    // mid-workout add can never mutate the saved routine.
    const handleQuickSwapAddSub = useCallback(
      (sub: { exercise_id: string | null; name: string }, _scope: SubstituteScope) => {
        const orig = quickSwapOriginal;
        if (!orig || !sub.name) return;
        void addGlobalSubstitute(
          { exercise_id: orig.id || null, name: orig.name },
          sub,
        ).catch(() => undefined);
        setQuickSwapSubs((prev) =>
          prev.some((s) => s.name.trim().toLowerCase() === sub.name.trim().toLowerCase())
            ? prev
            : [...prev, { exercise_id: sub.exercise_id, name: sub.name, scope: 'global' }],
        );
      },
      [quickSwapOriginal],
    );

    const handleQuickSwapNeverSuggest = useCallback(async () => {
      const orig = quickSwapOriginal;
      if (!orig || !orig.id) { setQuickSwapCanPermanent(false); return; }
      const res = await excludeExercisePermanently(orig.id);
      if (res === 'excluded' || res === 'already-excluded') {
        setQuickSwapCanPermanent(false);
        setQuickSwapConfirmation((c) => c ?? t('logger:workoutLoggerHost.wontSuggestAgain', { name: orig.name }));
      } else if (res === 'no-plan') {
        setQuickSwapCanPermanent(false);
      } else {
        Alert.alert(t('logger:workoutLoggerHost.couldNotSaveTitle'), t('logger:workoutLoggerHost.swapStillApplies'));
      }
    }, [quickSwapOriginal]);

    const totalSets = sets.length;

    // TICKET-137: keep the Live Activity / ongoing notification's display
    // context (exercise, set progress, next up) in sync with the session.
    // setSessionContext is cheap + idempotent; the hook pushes to native only
    // when a rest actually starts/updates.
    const setSessionContext = restTimer.setSessionContext;
    useEffect(() => {
      if (!routineSession) return;
      const cur = routineSession.exercises[routineSession.currentIndex];
      if (!cur) return;
      const loggedCount = stepperSets.get(cur.exerciseId)?.length ?? 0;
      const total =
        (typeof cur.groupRounds === 'number' && cur.groupRounds > 0 ? cur.groupRounds : null) ??
        (typeof cur.targetSets === 'number' && cur.targetSets > 0 ? cur.targetSets : null);
      const nextEx = routineSession.exercises[routineSession.currentIndex + 1];
      setSessionContext({
        exerciseName: cur.name,
        setProgress:
          total != null
            ? t('logger:workoutLoggerHost.liveSetProgress', { current: Math.min(loggedCount + 1, total), total })
            : t('logger:workoutLoggerHost.liveLoggedCount', { count: loggedCount }),
        nextTarget: nextEx ? t('logger:workoutLoggerHost.nextExercise', { name: nextEx.name }) : null,
      });
    }, [routineSession, stepperSets, setSessionContext]);

    // TICKET-136: fire-and-forget write of the finished session to Apple
    // Health / Health Connect (toggle-gated inside the service; best-effort,
    // never blocks or fails the finish flow; zero effect when unavailable).
    const writeFinishedWorkoutToHealth = useCallback(() => {
      const wid = workout?.id;
      if (!wid || sets.length === 0) return;
      const ended = new Date();
      const started = new Date(ended.getTime() - Math.max(elapsedSeconds, 60) * 1000);
      void getHealthWriteEnabled()
        .then((on) =>
          on
            ? writeWorkoutToHealthKit({
                workoutId: wid,
                startedAt: started.toISOString(),
                endedAt: ended.toISOString(),
                label: routineSession?.name ?? undefined,
              })
            : false,
        )
        .catch(() => {});
    }, [workout?.id, sets.length, elapsedSeconds, routineSession?.name]);

    const handleFinishWorkout = useCallback(() => {
      Alert.alert(
        t('logger:workoutLoggerHost.finishWorkoutTitle'),
        t('logger:workoutLoggerHost.finishWorkoutMessage', { count: totalSets }),
        [
          { text: t('logger:workoutLoggerHost.keepLogging'), style: 'cancel' },
          {
            text: t('logger:workoutLoggerHost.finish'),
            onPress: () => {
              haptics.success();
              // TICKET-097: completion-based cycle advance (in-loop routines only).
              const finishedRoutineId =
                routineSession?.source === 'routine' ? routineSession.routineId : undefined;
              setStepperVisible(false);
              if (finishedRoutineId) markRoutineCompleted(finishedRoutineId).catch(() => {});
              writeFinishedWorkoutToHealth(); // TICKET-136 (toggle-gated, best-effort)
              runBadgeEvaluation(user?.id ?? 'local').catch(() => {}); // TICKET-143
              // TICKET-131: capture the share payload BEFORE teardown — the
              // session clear + navigation run when the share card closes
              // (ShareCardSheet onClose below). Zero network; all values local.
              setShareCard({
                workoutName: routineSession?.name ?? null,
                dayKey: workout?.day_key ?? toDateKey(new Date()),
                durationSec: elapsedSeconds > 0 ? elapsedSeconds : null,
                totalVolumeKg: sets.reduce(
                  (acc, s) =>
                    acc + (s.kind === 'lift' && s.weight_kg && s.reps ? s.weight_kg * s.reps : 0),
                  0,
                ),
                setCount: sets.length,
                prBadges: sessionPrBadgesRef.current.slice(),
                flexSets: sets
                  .filter((s) => s.kind === 'lift')
                  .map((s) => ({
                    exerciseName: exerciseNames.get(s.exercise_id) ?? null,
                    weightKg: s.weight_kg,
                    reps: s.reps,
                  })),
              });
            },
          },
        ],
      );
    }, [totalSets, routineSession, workout, elapsedSeconds, sets, exerciseNames, writeFinishedWorkoutToHealth]);

    // ── Fix #2: minimize / restore / terminate ────────────────────────────────
    // Shared teardown: fully end the session (used by the explicit Finish path).
    // Clears the session, the minimize flag, and the rest countdown/notification.
    const terminateSession = useCallback((finishedRoutineId?: string) => {
      setStepperVisible(false);
      setMinimized(false);
      setRoutineSession(null);
      setDropChain(null);
      setRestEndAt(null);
      restTimer.cancel();
      if (finishedRoutineId) markRoutineCompleted(finishedRoutineId).catch(() => {});
    }, [restTimer]);

    // Confirm → finish-and-save → terminate. The ONE explicit terminating flow,
    // shared by (a) finishing normally past the last exercise (onFinish) and
    // (b) ending EARLY mid-routine via the header "End" control (onEndWorkout).
    // Either way the confirm dialog fires and whatever has been logged is kept
    // (sets persist as they are logged), so leaving early never loses progress.
    const confirmAndFinish = useCallback(() => {
      const finishedRoutineId =
        routineSession?.source === 'routine' ? routineSession.routineId : undefined;
      Alert.alert(
        t('logger:workoutLoggerHost.finishWorkoutTitle'),
        t('logger:workoutLoggerHost.finishWorkoutMessage', { count: totalSets }),
        [
          { text: t('logger:workoutLoggerHost.keepLogging'), style: 'cancel' },
          {
            text: t('logger:workoutLoggerHost.finish'),
            onPress: () => {
              haptics.success();
              writeFinishedWorkoutToHealth(); // TICKET-136
              runBadgeEvaluation(user?.id ?? 'local').catch(() => {}); // TICKET-143
              terminateSession(finishedRoutineId);
            },
          },
        ],
      );
    }, [routineSession, totalSets, t, writeFinishedWorkoutToHealth, user, terminateSession]);

    // The header down-arrow: MINIMIZE (keep the session alive, hide the stepper
    // Modal, show the mini-bar). History-edit mode has no live workout, so there
    // it simply closes (handled at the call site).
    const handleMinimize = useCallback(() => {
      setStepperVisible(false);
      setMinimized(true);
    }, []);

    // Tapping the mini-bar restores the full stepper exactly where the user left off.
    const handleRestore = useCallback(() => {
      setMinimized(false);
      setStepperVisible(true);
    }, []);

    // Mini-bar copy: routine/session name + progress. Prefer exercise position
    // ("Exercise 3 / 6") for a routine; fall back to a set count for free sessions.
    const miniBarTitle = routineSession?.name ?? t('logger:workoutLoggerHost.workoutFallbackTitle');
    const miniBarProgress = useMemo(() => {
      if (!routineSession) return '';
      const n = routineSession.exercises.length;
      if (routineSession.source === 'routine' && n > 0) {
        return t('logger:workoutLoggerHost.exerciseProgress', {
          current: Math.min(routineSession.currentIndex + 1, n),
          total: n,
        });
      }
      const logged = routineSession.exercises.reduce((sum, e) => sum + e.loggedSetCount, 0);
      return t('logger:workoutLoggerHost.setsLoggedCount', { count: logged });
    }, [routineSession, t]);

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
              <Text style={[altStyles.title, { color: theme.colors.textPrimary }]}>{t('logger:workoutLoggerHost.alternativesTitle')}</Text>
              <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginBottom: spacing.s3 }}>
                {t('logger:workoutLoggerHost.alternativesSubtitle')}
              </Text>
              {alternativesLoading ? (
                <ActivityIndicator color={theme.colors.accentDefault} style={{ marginTop: spacing.s4 }} />
              ) : alternativesList.length === 0 ? (
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginTop: spacing.s3 }}>
                  {t('logger:workoutLoggerHost.noAlternatives')}
                </Text>
              ) : (
                <ScrollView style={{ maxHeight: 320 }}>
                  {alternativesList.map((alt) => (
                    <TouchableOpacity
                      key={alt.id}
                      style={[altStyles.row, { borderBottomColor: theme.colors.borderDefault }]}
                      onPress={() => handleSelectAlternative(alt)}
                      accessibilityRole="button"
                      accessibilityLabel={t('logger:workoutLoggerHost.chooseAlternativeA11y', { name: alt.name })}
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
                accessibilityLabel={t('logger:workoutLoggerHost.cancel')}
              >
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodyMd }}>{t('logger:workoutLoggerHost.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </Modal>
        )}

        {/* Stage 3 + SUBS-001: mid-workout swap sheet (local-first, no network).
            User substitutes first (free); engine suggestions Pro. TODAY only. */}
        <SubstituteSwapSheet
          visible={quickSwapVisible}
          mode="session"
          originalName={quickSwapOriginal?.name ?? t('logger:workoutLoggerHost.thisExerciseFallback')}
          userSubs={quickSwapSubs}
          suggested={quickSwapCandidates}
          suggestedLocked={!user?.is_paid}
          suggestedEmptyReason={quickSwapReason}
          confirmation={quickSwapConfirmation}
          canMakePermanent={quickSwapCanPermanent}
          onSelect={handleQuickSwapSelect}
          onAddSub={handleQuickSwapAddSub}
          onNeverSuggest={handleQuickSwapNeverSuggest}
          onViewDetails={(c) =>
            setSwapDetailTarget({ id: c.id, name: c.name, equipment: c.equipment })
          }
          onUpgrade={() => {
            setQuickSwapVisible(false);
            setShowPaywall(true);
          }}
          onClose={() => setQuickSwapVisible(false)}
        />

        {/* TICKET-134: detail sheet for a quick-swap candidate. */}
        <ExerciseDetailSheet
          visible={swapDetailTarget !== null}
          exercise={swapDetailTarget}
          onClose={() => setSwapDetailTarget(null)}
        />

        {/* TICKET-129: per-set note + flags for the LIVE session (chip long-press). */}
        <SetNoteSheet
          visible={liveNoteTarget !== null}
          onClose={() => setLiveNoteTarget(null)}
          initialNote={liveNoteTarget?.note}
          initialFlags={liveNoteTarget?.flags}
          setLabel={liveNoteTarget?.label}
          onSave={(patch) => {
            if (!liveNoteTarget) return;
            void saveSetNoteFlags(user, liveNoteTarget.setId, patch).catch(() => {});
          }}
        />

        {/* Rest timer banner (hidden while minimized — the mini-bar shows the
            rest chip instead; fix #2). */}
        {restSecondsLeft !== null && !minimized && (
          <View style={[restStyles.banner, { backgroundColor: theme.colors.bgElevated }]}>
            <TouchableOpacity
              onPress={cycleRestDefault}
              accessibilityRole="button"
              accessibilityLabel={t('logger:workoutLoggerHost.restTimerA11y', { seconds: restDefault })}
            >
              <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodyMd, fontWeight: fontWeight.bold, fontVariant: ['tabular-nums'] }}>
                {t('logger:workoutLoggerHost.restLabel', {
                  time: `${Math.floor(restSecondsLeft / 60).toString().padStart(2, '0')}:${(restSecondsLeft % 60).toString().padStart(2, '0')}`,
                })}
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.micro }}>{t('logger:workoutLoggerHost.restDefaultSuffix', { seconds: restDefault })}</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                // Extend the ABSOLUTE deadline by 30s (fix #1) and restart the
                // background notification for the new remaining, so the derived
                // banner/mini-bar countdown and the alarm stay in sync (WL-002).
                setRestEndAt((end) => {
                  const now = Date.now();
                  const base = end != null && end > now ? end : now;
                  const nextEnd = base + 30 * 1000;
                  restTimer.start(Math.max(1, Math.round((nextEnd - now) / 1000)));
                  return nextEnd;
                });
                setRestNow(Date.now());
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('logger:workoutLoggerHost.add30SecA11y')}
            >
              <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.bold }}>+30s</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setRestEndAt(null); restTimer.cancel(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('logger:workoutLoggerHost.dismissRestTimerA11y')}
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

        {/* TICKET-131: share card — offered after Finish; closing it completes
            the deferred session teardown + navigation. */}
        <ShareCardSheet
          visible={shareCard !== null}
          onClose={() => {
            setShareCard(null);
            sessionPrBadgesRef.current = [];
            setRoutineSession(null);
            setSelectedExercise(null);
            if (onFinish) {
              onFinish();
            } else {
              router.replace('/(tabs)');
            }
          }}
          workoutName={shareCard?.workoutName}
          dayKey={shareCard?.dayKey ?? toDateKey(new Date())}
          durationSec={shareCard?.durationSec}
          totalVolumeKg={shareCard?.totalVolumeKg ?? 0}
          setCount={shareCard?.setCount ?? 0}
          streakWeeks={shareStreakWeeks}
          prBadges={shareCard?.prBadges ?? []}
          flexLineCandidateSets={shareCard?.flexSets ?? []}
          unitPref={unitPref}
        />

        {/* Focus Stepper modal.
            Guard on routineSession: a full-screen Modal whose only child is
            `{routineSession && <StepperLogger/>}` would otherwise present an
            EMPTY opaque overlay if stepperVisible were ever true without a
            session — covering the whole UI with just the status-bar icons
            showing ("buttons disappeared, only weird buttons at the top").
            Tying visibility to the session makes that state impossible. */}
        <Modal
          visible={stepperVisible && !minimized && !!routineSession}
          animationType="slide"
          presentationStyle="fullScreen"
          // Hardware-back / swipe-dismiss: minimize an active workout (keep it
          // alive); in history-edit mode just close the correction view.
          onRequestClose={() => {
            if (historyMode) {
              setStepperVisible(false);
              setHistoryMode(false);
              historyChangeRef.current?.();
            } else {
              handleMinimize();
            }
          }}
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
                // History-edit mode: this is just "done correcting" — no confirm, no
                // termination semantics (there is no live workout to end).
                if (historyMode) {
                  setStepperVisible(false);
                  setHistoryMode(false);
                  historyChangeRef.current?.();
                  return;
                }
                // Fix #2: ending a workout is the ONE explicit terminating action, so
                // it goes through the confirmation (the down-arrow now only minimizes).
                confirmAndFinish();
              }}
              // End the workout EARLY (leave before the routine is complete). Same
              // confirm → finish-and-save flow; hidden while correcting history.
              onEndWorkout={historyMode ? undefined : confirmAndFinish}
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
                // Fix #2: the header down-arrow MINIMIZES an active workout (session
                // stays alive → mini-bar). History-edit mode has no live workout, so
                // it just closes the correction view.
                if (historyMode) {
                  setStepperVisible(false);
                  setHistoryMode(false);
                  historyChangeRef.current?.();
                } else {
                  handleMinimize();
                }
              }}
              unitPref={unitPref}
              weekNumber={historyMode ? null : (routineSession.weekNumber ?? null)}
              restSeconds={restDefault}
              // No "choose alternative" / suggestions when correcting a past
              // session — those mutate the live routine, not history.
              // Stage 3 + SUBS-001: the swap sheet opens for ALL tiers now
              // (user substitutes are free; engine suggestions stay Pro-gated
              // INSIDE the sheet via the locked teaser).
              onChooseAlternative={historyMode ? undefined : handleQuickSwap}
              // ── S1 supersets: open the pairing sheet / unlink the group. ──
              onSupersetWith={
                historyMode ? undefined : () => setPairSheetVisible(true)
              }
              onUnlinkSuperset={
                historyMode
                  ? undefined
                  : (gid: string) => unpairGroup(gid)
              }
              // ── S1 dropsets: chain state + controls. The stepper shows the
              // amber DropChainBar while a chain is active for THIS exercise. ──
              dropChain={(() => {
                const curId =
                  routineSession.exercises[routineSession.currentIndex]?.exerciseId ?? '';
                if (historyMode || !dropChain || dropChain.exerciseId !== curId) return null;
                const nextIndex = dropChain.links.length; // top is index 0
                // S2: honour the persisted/plan drop percentage (S1 chains carry 0.2).
                const nextKg = dropPrefillKg(dropChain.topWeightKg, nextIndex, dropChain.dropPct);
                const nextDisplay =
                  unitPref === 'lbs'
                    ? String(roundToNearestQuarterLb(kgToLbs(nextKg)))
                    : String(nextKg);
                return {
                  chainId: dropChain.chainId,
                  links: dropChain.links,
                  nextDropIndex: nextIndex,
                  nextDropWeightLabel: nextDisplay,
                  nextDropWeightPrefill: nextDisplay,
                };
              })()}
              onStartDropChain={historyMode ? undefined : startDropChain}
              onEndDropChain={historyMode ? undefined : endDropChain}
              // TICKET-129: long-press a set chip → note/flags sheet. Prefill
              // reads the local row (best-effort); save goes through the
              // tier-branched setNotes module.
              onOpenSetNote={(setId, chipIndex) => {
                const curName =
                  routineSession?.exercises[routineSession.currentIndex]?.name ?? '';
                getLocalSetNoteFlags(setId)
                  .catch(() => null)
                  .then((nf) => {
                    setLiveNoteTarget({
                      setId,
                      label: `Set ${chipIndex + 1}${curName ? ` — ${curName}` : ''}`,
                      note: nf?.note ?? null,
                      flags: nf?.flags ?? 0,
                    });
                  });
              }}
              // TICKET-141: no next-load suggestions while CORRECTING a past
              // set (history-edit mode) — the user isn't about to log a new
              // set, so a suggestion strip would be a non-sequitur here.
              suppressAutoregSuggestions={historyMode}
            />
          )}
        </Modal>

        {/* S1: session-only superset pairing sheet (free feature). Lists the
            session's OTHER pending exercises; the parent creates the group. */}
        <SupersetPairSheet
          visible={pairSheetVisible}
          currentName={
            routineSession?.exercises[routineSession?.currentIndex ?? 0]?.name ?? 'this exercise'
          }
          candidates={((): SupersetPairCandidate[] => {
            if (!routineSession) return [];
            const curIdx = routineSession.currentIndex;
            const cur = routineSession.exercises[curIdx];
            const out: SupersetPairCandidate[] = [];
            routineSession.exercises.forEach((ex, i) => {
              if (i === curIdx) return;
              if (ex.groupId) return; // already grouped elsewhere
              // Pending only: not yet completed this session.
              const done =
                typeof ex.targetSets === 'number' && ex.targetSets > 0
                  ? ex.loggedSetCount >= ex.targetSets
                  : ex.done;
              if (done) return;
              out.push({
                index: i,
                exerciseId: ex.exerciseId,
                name: ex.name,
                targetSets: ex.targetSets,
              });
            });
            return out;
          })()}
          onConfirm={pairExercises}
          onClose={() => setPairSheetVisible(false)}
        />
      {/* Fix #2: persistent minimized-workout bar. Shown ONLY while minimized with a
          live session; sits above the tab bar (Home is the host, a tabbed screen).
          Tapping restores the full stepper mid-session. The rest chip is fed the
          derived (drift-free) remaining from fix #1. */}
      <WorkoutMiniBar
        visible={minimized && !!routineSession}
        title={miniBarTitle}
        progress={miniBarProgress}
        restSecondsLeft={restSecondsLeft}
        onPress={handleRestore}
        aboveTabBar
      />
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
