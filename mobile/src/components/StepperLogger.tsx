/**
 * StepperLogger — TICKET-059…062
 * Full-screen Focus Stepper: one exercise at a time.
 *
 * Layout is the founder's authoritative mock `set-logging-stepper-flow.html`:
 *   §1a routine logging · §1b switcher · §1c off-routine placement
 *   §3a free (add-as-you-go) · §3c PRO smart-suggest ("JUST LOGGED" interstitial)
 *
 * Variants:
 *   • 'routine' — header = name · progress dots · "N / M"; bottom = "Continue to
 *                 <next> →" + "Select different exercise".
 *   • 'free'    — header = "Free session" · "N logged"; kicker "EXERCISE N · NO
 *                 ROUTINE"; bottom = "＋ Add next exercise" + "Finish & save as
 *                 routine".
 *   • 'smart'   — (paid) like 'free' for logging, but "Done — see what's next →"
 *                 reveals the JUST LOGGED interstitial: a summary chip + a ranked
 *                 list of suggested next exercises (enumerated, not just one).
 *
 * RIR (TICKET-074) is preserved but tucked behind a "＋ RIR" link so the default
 * screen matches the two-field (WEIGHT / REPS) mock.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from './Icon';
import {
  stepperPalette,
  fontFamily,
  spacing,
  radius,
  fontSize,
} from '../theme/tokens';
import { RoutineSession, RoutineSessionExercise } from './RoutineStrip';
import ExerciseSwitcherSheet from './ExerciseSwitcherSheet';
import { SuggestCandidate } from '../utils/smartSuggest';
import PlateCalculatorSheet from './PlateCalculatorSheet';
import { computeWarmupPlan, WARMUP_SET_CHOICES } from '../lib/warmup';
import { getExercisePrefs, setExercisePrefs } from '../data/exercisePrefs';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoggedSet {
  weight: string;
  reps: string;
  /** Reps-in-Reserve as typed (optional). '' / undefined = not recorded. */
  rir?: string;
  /** Cardio fields — populated instead of weight/reps when category=cardio */
  durationSec?: number;
  distanceM?: number;
  avgPaceSecPerKm?: number;
}

// Cardio log payload shape (mirrors api.ts LogCardioSetPayload)
export interface LoggedCardioSet {
  kind: 'cardio';
  durationMm: string;
  durationSs: string;
  distanceDisplay: string;
}

// ── Cardio helpers (mirrors SetEntryForm.tsx exactly) ────────────────────────

function parseDurationSec(mm: string, ss: string): number | null {
  const minutes = parseInt(mm, 10);
  const seconds = parseInt(ss, 10);
  if (isNaN(minutes) || isNaN(seconds)) return null;
  if (seconds < 0 || seconds > 59) return null;
  return minutes * 60 + seconds;
}

function distanceToMetres(display: string, unitPref: 'kg' | 'lbs'): number | null {
  const val = parseFloat(display);
  if (isNaN(val) || val <= 0) return null;
  return unitPref === 'lbs' ? val * 1609.344 : val * 1000;
}

function paceFromDurationAndDistance(durationSec: number, distanceM: number): number {
  const distanceKm = distanceM / 1000;
  return distanceKm > 0 ? durationSec / distanceKm : 0;
}

/** Where to slot an off-routine exercise into the current routine. */
export type OffRoutinePlacement = 'after_current' | 'end' | 'pick';

interface OffRoutinePrompt {
  exerciseName: string;
  exerciseId: string;
}

interface Props {
  routineSession: RoutineSession;
  /**
   * Called when user logs a LIFT set for the current exercise.
   * `rir` is the optional Reps-in-Reserve string (TICKET-074); undefined/''
   * means "not recorded" and the parent should send rir = -1 to the server.
   */
  onLogSet: (exerciseId: string, weight: string, reps: string, rir?: string) => void;
  /**
   * Called when the user taps a logged LIFT-set chip and saves a correction
   * (e.g. a mistyped weight). `setIndex` is 0-based within the current exercise.
   * Undefined = chips are not editable.
   */
  onUpdateSet?: (exerciseId: string, setIndex: number, weight: string, reps: string, rir?: string) => void;
  /**
   * Called when user logs a CARDIO set. The parent should build the LogCardioSetPayload.
   * Separated from onLogSet to keep the lift path unchanged (TICKET-080 §2).
   */
  onLogCardioSet?: (
    exerciseId: string,
    durationSec: number,
    distanceM?: number,
    avgPaceSecPerKm?: number,
  ) => void;
  /** Called when user advances to a specific index (Continue or switcher tap) */
  onAdvance: (toIndex: number) => void;
  /** Called when user finishes the last exercise */
  onFinish: () => void;
  /** Opens the exercise picker (ExercisePickerModal); resolved exerciseId → name */
  onBrowseLibrary: () => void;
  /** Personal best for the current exercise: e.g. "25 kg × 12" or null. */
  pbLabel?: string | null;
  /** Rep range target for this exercise from the routine, e.g. "8-12" or null. */
  repTarget?: string | null;
  /** Last-session summary for the current exercise, e.g. "80 kg × 8" or null. */
  lastSessionLabel?: string | null;
  /** Last-session top set in DISPLAY units — drives the warm-up ramp (founder 2026-06-10). */
  lastTopSetDisplay?: { weight: number; reps: number } | null;
  /** Logged sets for the current exercise in THIS workout session. */
  currentExerciseSets: LoggedSet[];
  /** Called when user adds an off-routine exercise into the routine. */
  onAddOffRoutineExercise?: (
    exerciseId: string,
    exerciseName: string,
    position: OffRoutinePlacement,
    pickIndex?: number,
  ) => void;
  /** Close / dismiss the stepper (returns to normal log view) */
  onClose: () => void;
  /**
   * Stepper variant:
   * - 'routine' : routine session — "Continue to <next>" (default)
   * - 'free'    : add-as-you-go — "＋ Add next exercise" / "Finish & save as routine"
   * - 'smart'   : paid smart-suggest — "JUST LOGGED" interstitial with ranked suggestions
   */
  variant?: 'routine' | 'free' | 'smart';
  /**
   * For variant='smart': the single best suggestion (back-compat). Prefer
   * `suggestions` (the ranked list) when available.
   */
  suggestion?: SuggestCandidate | null;
  /**
   * For variant='smart': the ranked list of suggested next exercises. The first
   * is shown as the primary card; the rest as "or try" rows. Recomputed by the
   * parent after each set is logged.
   */
  suggestions?: SuggestCandidate[];
  /** For variant='smart': user accepted a specific suggestion as the next exercise. */
  onAcceptSuggestion?: (candidate: SuggestCandidate) => void;
  /** For variant='free': called when user taps "＋ Add next exercise" */
  onAddNextExercise?: () => void;
  /** For variant='free'|'smart': save current ad-hoc session as a routine */
  onSaveAsRoutine?: () => void;
  /**
   * User's unit preference — needed for cardio distance label + chip display.
   * Defaults to 'kg'.
   */
  unitPref?: 'kg' | 'lbs';
  /**
   * TICKET-082 Part B: "Choose alternative exercise" (pro-only, machine-busy swap).
   * Called when the user taps the "Choose alternative exercise" affordance.
   * The parent is responsible for: calling getAlternatives, showing a sheet, and
   * substituting the exercise in the session. Undefined = hide the button.
   */
  onChooseAlternative?: () => void;
  /**
   * TICKET-081 §1a / §3a: ISO week number for the session header `· wk N`.
   * Passed from the parent as RoutineSession.weekNumber (optional). Rendered
   * as "· wk N" when present and > 0; omitted cleanly when undefined/NaN.
   */
  weekNumber?: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SetChip({
  set,
  index,
  unitPref,
  onPress,
  editing,
}: {
  set: LoggedSet;
  index: number;
  unitPref?: 'kg' | 'lbs';
  onPress?: () => void;
  editing?: boolean;
}) {
  let label: string;
  if (set.durationSec != null) {
    // Cardio chip: "Set 1 · 22:30 · 5.0 km"
    const mm = Math.floor(set.durationSec / 60);
    const ss = set.durationSec % 60;
    const durStr = `${mm}:${String(ss).padStart(2, '0')}`;
    let distStr = '';
    if (set.distanceM != null) {
      if (unitPref === 'lbs') {
        distStr = ` · ${(set.distanceM / 1609.344).toFixed(2)} mi`;
      } else {
        distStr = ` · ${(set.distanceM / 1000).toFixed(2)} km`;
      }
    }
    label = `Set ${index + 1} · ${durStr}${distStr}`;
  } else {
    const rirNum = set.rir != null && set.rir !== '' ? parseInt(set.rir, 10) : null;
    const rirLabel =
      rirNum == null || Number.isNaN(rirNum) || rirNum < 0
        ? ''
        : rirNum === 0
          ? ' · to failure'
          : ` · RIR ${rirNum}`;
    label = `Set ${index + 1} · ${set.weight}×${set.reps}${rirLabel}`;
  }
  // Lift sets are tappable (to correct a mistyped value); cardio sets are not.
  const editable = !!onPress && set.durationSec == null;
  if (editable) {
    return (
      <TouchableOpacity
        style={[chipStyles.chip, editing && chipStyles.chipEditing]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Edit set ${index + 1}`}
      >
        <Text style={[chipStyles.label, editing && chipStyles.labelEditing]}>{label}  ✎</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[chipStyles.chip, editing && chipStyles.chipEditing]}>
      <Text style={[chipStyles.label, editing && chipStyles.labelEditing]}>{label}</Text>
    </View>
  );
}

/** Heuristic: does this exercise's name denote a bodyweight movement? */
const BODYWEIGHT_NAME_RE =
  /\b(pull[\s-]?ups?|chin[\s-]?ups?|push[\s-]?ups?|press[\s-]?ups?|dips?|planks?|sit[\s-]?ups?|crunch(es)?|leg raises?|muscle[\s-]?ups?|pistol squats?|burpees?|mountain climbers?|hanging|inverted rows?|nordic|bodyweight)\b/i;
function isBodyweightExercise(name?: string): boolean {
  return !!name && BODYWEIGHT_NAME_RE.test(name);
}

/** "3 sets · top 100×6" summary for the JUST LOGGED interstitial. */
function topSetLabel(sets: LoggedSet[]): string {
  const first = sets[0];
  if (!first) return '';
  let best = first;
  for (const s of sets) {
    if ((parseFloat(s.weight) || 0) > (parseFloat(best.weight) || 0)) best = s;
  }
  return `${sets.length} set${sets.length !== 1 ? 's' : ''} · top ${best.weight}×${best.reps}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepperLogger({
  routineSession,
  onLogSet,
  onUpdateSet,
  onLogCardioSet,
  onAdvance,
  onFinish,
  onBrowseLibrary,
  pbLabel,
  repTarget,
  lastSessionLabel,
  lastTopSetDisplay,
  currentExerciseSets,
  onAddOffRoutineExercise,
  onClose,
  variant = 'routine',
  suggestion,
  suggestions,
  onAcceptSuggestion,
  onAddNextExercise,
  onSaveAsRoutine,
  unitPref = 'kg',
  onChooseAlternative,
  weekNumber,
}: Props): React.ReactElement {
  const { exercises, currentIndex, name: routineName } = routineSession;
  const currentEx: RoutineSessionExercise | undefined = exercises[currentIndex];
  const nextEx: RoutineSessionExercise | undefined = exercises[currentIndex + 1];
  const isLast = currentIndex === exercises.length - 1;
  const isFreeLike = variant === 'free' || variant === 'smart';

  // ── Current exercise category ──────────────────────────────────────────────
  const isCardio = (currentEx?.category ?? 'lift') === 'cardio';
  const distanceLabel = unitPref === 'lbs' ? 'miles' : 'km';

  // ── Local form state — LIFT ──────────────────────────────────────────────
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [showRir, setShowRir] = useState(false);
  // Edit mode: index of the logged set currently being corrected (null = adding a new set).
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // ── Local form state — CARDIO ────────────────────────────────────────────
  const [cardioDurationMm, setCardioDurationMm] = useState('');
  const [cardioDurationSs, setCardioDurationSs] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');

  // ── Plate calculator + per-exercise warm-up prefs (founder 2026-06-10) ───
  const [plateCalcVisible, setPlateCalcVisible] = useState(false);
  const [wuEnabled, setWuEnabled] = useState(false);
  const [wuSets, setWuSets] = useState(3);
  useEffect(() => {
    const id = currentEx?.exerciseId;
    if (!id) { setWuEnabled(false); return; }
    let cancelled = false;
    getExercisePrefs(id)
      .then((prefs) => {
        if (cancelled) return;
        setWuEnabled(prefs.warmup_enabled);
        setWuSets(prefs.warmup_sets);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentEx?.exerciseId]);

  const warmupIncrement = unitPref === 'lbs' ? 5 : 2.5;
  const warmupPlan = useMemo(
    () => computeWarmupPlan(lastTopSetDisplay?.weight ?? null, wuSets, warmupIncrement),
    [lastTopSetDisplay?.weight, wuSets, warmupIncrement],
  );
  const persistWuPrefs = useCallback((enabled: boolean, sets: number) => {
    const id = currentEx?.exerciseId;
    if (id) setExercisePrefs(id, { warmup_enabled: enabled, warmup_sets: sets }).catch(() => {});
  }, [currentEx?.exerciseId]);

  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [offRoutinePrompt, setOffRoutinePrompt] = useState<OffRoutinePrompt | null>(null);
  const [promptPlacement, setPromptPlacement] = useState<OffRoutinePlacement>('after_current');
  const [pickIndex, setPickIndex] = useState(0);
  const promptedRef = React.useRef<Set<string>>(new Set());

  // ── Smart-suggest interstitial state ──────────────────────────────────────
  const [showSuggest, setShowSuggest] = useState(false);
  const [selectedSug, setSelectedSug] = useState<SuggestCandidate | null>(null);
  const sugList = useMemo<SuggestCandidate[]>(
    () => (suggestions && suggestions.length > 0 ? suggestions : suggestion ? [suggestion] : []),
    [suggestions, suggestion],
  );
  const activeSug = selectedSug ?? sugList[0] ?? null;

  const setNumber = currentExerciseSets.length + 1;
  const totalLogged = exercises.reduce((sum, e) => sum + e.loggedSetCount, 0);
  const isOffRoutine =
    routineSession.source === 'routine' && (currentEx?.exerciseId ?? '') === '';

  // Progress dots (max 7 shown)
  const dotsToShow = Math.min(exercises.length, 7);
  const progressDots = useMemo(
    () => Array.from({ length: dotsToShow }, (_, i) => i <= currentIndex),
    [dotsToShow, currentIndex],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Post-log common logic (off-routine prompt trigger)
  const afterLogSet = useCallback(() => {
    const key = currentEx?.name ?? '';
    if (isOffRoutine && currentEx && onAddOffRoutineExercise && !promptedRef.current.has(key)) {
      promptedRef.current.add(key);
      setPromptPlacement('after_current');
      setPickIndex(Math.min(currentIndex + 1, exercises.length));
      setOffRoutinePrompt({ exerciseName: currentEx.name, exerciseId: currentEx.exerciseId });
    }
  }, [currentEx, isOffRoutine, onAddOffRoutineExercise, currentIndex, exercises.length]);

  const handleLogSet = useCallback(() => {
    if (isCardio) {
      // Cardio path
      const durationSec = parseDurationSec(cardioDurationMm, cardioDurationSs);
      if (durationSec === null) return; // require a valid duration
      const distanceM = cardioDistance.trim() ? distanceToMetres(cardioDistance, unitPref) ?? undefined : undefined;
      const avgPace = durationSec > 0 && distanceM ? paceFromDurationAndDistance(durationSec, distanceM) : undefined;
      if (onLogCardioSet) {
        onLogCardioSet(currentEx?.exerciseId ?? '', durationSec, distanceM, avgPace);
      }
      setCardioDurationMm('');
      setCardioDurationSs('');
      setCardioDistance('');
    } else {
      // Lift path
      if (!weight.trim() && !reps.trim()) return;
      if (editingIndex != null) {
        // Saving a correction to an already-logged set (e.g. a mistyped weight).
        onUpdateSet?.(currentEx?.exerciseId ?? '', editingIndex, weight.trim(), reps.trim(), rir.trim() || undefined);
        setEditingIndex(null);
        setWeight('');
        setReps('');
        setRir('');
        return; // an edit must not trigger the off-routine prompt
      }
      onLogSet(currentEx?.exerciseId ?? '', weight.trim(), reps.trim(), rir.trim() || undefined);
      setReps('');
      setRir('');
      // Keep weight pre-filled for the next set.
    }
    afterLogSet();
  }, [
    isCardio, cardioDurationMm, cardioDurationSs, cardioDistance, unitPref,
    onLogCardioSet, currentEx, weight, reps, rir, onLogSet, afterLogSet,
    editingIndex, onUpdateSet,
  ]);

  // Tap a logged lift-set chip to pull it back up into the inputs for correction.
  const handleEditChip = useCallback((index: number) => {
    const s = currentExerciseSets[index];
    if (!s || s.durationSec != null) return; // lift sets only
    setWeight(s.weight ?? '');
    setReps(s.reps ?? '');
    if (s.rir != null && s.rir !== '') {
      setRir(s.rir);
      setShowRir(true);
    } else {
      setRir('');
    }
    setEditingIndex(index);
  }, [currentExerciseSets]);

  const handleContinue = useCallback(() => {
    setEditingIndex(null);
    if (isLast) {
      onFinish();
    } else {
      onAdvance(currentIndex + 1);
      setWeight('');
      setReps('');
    }
  }, [isLast, currentIndex, onAdvance, onFinish]);

  const handleSelectIndex = useCallback((idx: number) => {
    setEditingIndex(null);
    onAdvance(idx);
    setWeight('');
    setReps('');
  }, [onAdvance]);

  const handleAddOffRoutine = useCallback(() => {
    if (!offRoutinePrompt || !onAddOffRoutineExercise) return;
    onAddOffRoutineExercise(
      offRoutinePrompt.exerciseId,
      offRoutinePrompt.exerciseName,
      promptPlacement,
      promptPlacement === 'pick' ? pickIndex : undefined,
    );
    setOffRoutinePrompt(null);
  }, [offRoutinePrompt, promptPlacement, pickIndex, onAddOffRoutineExercise]);

  // Smart: reveal the "JUST LOGGED" interstitial after ≥1 set logged.
  const handleDoneSeeNext = useCallback(() => {
    if (currentExerciseSets.length === 0) return;
    setShowSuggest(true);
  }, [currentExerciseSets.length]);

  const handleAcceptSug = useCallback(() => {
    if (activeSug && onAcceptSuggestion) {
      onAcceptSuggestion(activeSug);
    } else {
      onFinish();
    }
    setShowSuggest(false);
    setSelectedSug(null);
    setWeight('');
    setReps('');
  }, [activeSug, onAcceptSuggestion, onFinish]);

  if (!currentEx) return <View style={styles.root} />;

  const kicker = isFreeLike
    ? `EXERCISE ${currentIndex + 1} · NO ROUTINE`
    : isOffRoutine
      ? 'NOT IN ROUTINE'
      : `EXERCISE ${currentIndex + 1} OF ${exercises.length}`;

  const showInterstitial = variant === 'smart' && showSuggest;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close stepper"
        >
          <Ionicons name="chevron-down" size={20} color={stepperPalette.muted} />
        </TouchableOpacity>

        {isFreeLike ? (
          <>
            <Text style={styles.routineName} numberOfLines={1}>
              Free session{weekNumber != null && !isNaN(weekNumber) && weekNumber > 0 ? ` · wk ${weekNumber}` : ''}
            </Text>
            <Text style={styles.progressLabel}>
              {totalLogged} logged
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.routineName} numberOfLines={1}>
              {routineName}{weekNumber != null && !isNaN(weekNumber) && weekNumber > 0 ? ` · wk ${weekNumber}` : ''}
            </Text>
            <View style={styles.dotsRow}>
              {progressDots.map((done, i) => (
                <View key={i} style={[styles.dot, done && styles.dotDone]} />
              ))}
            </View>
            <Text style={styles.progressLabel}>
              {currentIndex + 1} / {exercises.length}
            </Text>
          </>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showInterstitial ? (
          /* ── §3c · JUST LOGGED interstitial (PRO smart-suggest) ──────────── */
          <>
            <Text style={styles.exLabel}>JUST LOGGED</Text>
            <Text style={styles.exName}>{currentEx.name}</Text>

            {currentExerciseSets.length > 0 && (
              <View style={[chipStyles.chip, styles.summaryChip]}>
                <Text style={chipStyles.label}>{topSetLabel(currentExerciseSets)}</Text>
              </View>
            )}

            {activeSug ? (
              <>
                {/* Primary suggestion card */}
                <View style={styles.suggestionCard}>
                  <View style={styles.suggestionCardTop}>
                    <View style={styles.suggestionPill}>
                      <Text style={styles.suggestionPillLabel}>Suggested next</Text>
                    </View>
                    <Text style={styles.suggestionReason} numberOfLines={1}>
                      {activeSug.reason}
                    </Text>
                  </View>
                  <Text style={styles.suggestionName}>{activeSug.name}</Text>
                  {(activeSug.pbLabel || (activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget) ? (
                    <Text style={styles.suggestionPb}>
                      {activeSug.pbLabel ? `PB ${activeSug.pbLabel}` : ''}
                      {activeSug.pbLabel && (activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget ? ' · ' : ''}
                      {(activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget
                        ? `aim ${(activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget}`
                        : ''}
                    </Text>
                  ) : null}
                </View>

                {/* Ranked alternatives — "enumerate more" */}
                {sugList.length > 1 && (
                  <>
                    <Text style={styles.altLabel}>OR TRY</Text>
                    {sugList
                      .filter((s) => s.exerciseId !== activeSug.exerciseId)
                      .map((s) => (
                        <TouchableOpacity
                          key={s.exerciseId || s.name}
                          style={styles.altRow}
                          onPress={() => setSelectedSug(s)}
                          accessibilityRole="button"
                          accessibilityLabel={`Choose ${s.name} instead`}
                        >
                          <View style={styles.altRowText}>
                            <Text style={styles.altName} numberOfLines={1}>{s.name}</Text>
                            <Text style={styles.altReason} numberOfLines={1}>{s.reason}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={stepperPalette.muted} />
                        </TouchableOpacity>
                      ))}
                  </>
                )}
              </>
            ) : (
              <Text style={styles.emptySuggest}>
                You&apos;re all caught up — no further suggestions for this session.
              </Text>
            )}
          </>
        ) : (
          /* ── Logging screen (routine / free / smart pre-interstitial) ────── */
          <>
            <Text style={styles.exLabel}>{kicker}</Text>
            <Text style={styles.exName}>{currentEx.name}</Text>

            {(pbLabel || repTarget || lastSessionLabel) && (
              <View style={styles.pbCard}>
                {(pbLabel || repTarget) ? (
                  <Text style={styles.pbText}>
                    {pbLabel ? `PB ${pbLabel}` : ''}
                    {pbLabel && repTarget ? ' · ' : ''}
                    {repTarget ? `aim ${repTarget} reps` : ''}
                  </Text>
                ) : null}
                {lastSessionLabel ? (
                  <Text style={wuStyles.lastSessionText}>Last session: {lastSessionLabel}</Text>
                ) : null}
              </View>
            )}

            {/* ── Warm-up ramp (founder 2026-06-10): per-exercise opt-in; weights/
                reps recommended from the previous top set; rows prefill the
                inputs and stay fully editable. Hidden once working sets begin. */}
            {!isCardio && currentExerciseSets.length === 0 && (
              wuEnabled ? (
                <View style={wuStyles.card}>
                  <View style={wuStyles.headerRow}>
                    <Text style={wuStyles.title}>WARM-UP</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const idx = WARMUP_SET_CHOICES.indexOf(wuSets);
                        const next = WARMUP_SET_CHOICES[(idx + 1) % WARMUP_SET_CHOICES.length] ?? 3;
                        setWuSets(next);
                        persistWuPrefs(true, next);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Change number of warm-up sets"
                    >
                      <Text style={wuStyles.setsToggle}>{wuSets} set{wuSets !== 1 ? 's' : ''} ▸</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setWuEnabled(false); persistWuPrefs(false, wuSets); }}
                      accessibilityRole="button"
                      accessibilityLabel="Turn warm-up off for this exercise"
                    >
                      <Text style={wuStyles.offLink}>off</Text>
                    </TouchableOpacity>
                  </View>
                  {warmupPlan.length > 0 ? (
                    warmupPlan.map((w, i) => (
                      <TouchableOpacity
                        key={i}
                        style={wuStyles.row}
                        onPress={() => { setWeight(w.weight > 0 ? String(w.weight) : ''); setReps(String(w.reps)); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Use warm-up set ${i + 1}: ${w.weight} for ${w.reps} reps`}
                      >
                        <Text style={wuStyles.rowPct}>{Math.round(w.pct * 100)}%</Text>
                        <Text style={wuStyles.rowMain}>
                          {w.weight > 0 ? `${w.weight} × ${w.reps}` : `bodyweight × ${w.reps}`}
                        </Text>
                        <Text style={wuStyles.rowUse}>tap to fill</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={wuStyles.hint}>
                      Log this exercise once — recommendations come from your previous top set.
                    </Text>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setWuEnabled(true); persistWuPrefs(true, wuSets); }}
                  style={wuStyles.enableLink}
                  accessibilityRole="button"
                  accessibilityLabel="Add a warm-up ramp for this exercise"
                >
                  <Text style={wuStyles.enableLabel}>＋ Warm-up ramp (optional)</Text>
                </TouchableOpacity>
              )
            )}

            {currentExerciseSets.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.chipsScroll}
                contentContainerStyle={styles.chipsContent}
              >
                {currentExerciseSets.map((s, i) => (
                  <SetChip
                    key={i}
                    set={s}
                    index={i}
                    unitPref={unitPref}
                    onPress={onUpdateSet ? () => handleEditChip(i) : undefined}
                    editing={editingIndex === i}
                  />
                ))}
              </ScrollView>
            )}

            {isCardio ? (
              /* ── Cardio inputs: Duration (mm:ss) + optional Distance ──────── */
              <>
                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1.5 }]}>
                    <Text style={styles.inputLabel}>DURATION (MM : SS)</Text>
                    <View style={styles.durationRow}>
                      <TextInput
                        style={[styles.input, styles.durationInput]}
                        value={cardioDurationMm}
                        onChangeText={setCardioDurationMm}
                        keyboardType="number-pad"
                        placeholder="00"
                        placeholderTextColor={stepperPalette.muted}
                        maxLength={3}
                        selectTextOnFocus
                        accessibilityLabel="Duration minutes"
                      />
                      <Text style={styles.durationSep}>:</Text>
                      <TextInput
                        style={[styles.input, styles.durationInput]}
                        value={cardioDurationSs}
                        onChangeText={setCardioDurationSs}
                        keyboardType="number-pad"
                        placeholder="00"
                        placeholderTextColor={stepperPalette.muted}
                        maxLength={2}
                        selectTextOnFocus
                        accessibilityLabel="Duration seconds"
                      />
                    </View>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>DISTANCE ({distanceLabel.toUpperCase()}) — OPTIONAL</Text>
                    <TextInput
                      style={styles.input}
                      value={cardioDistance}
                      onChangeText={setCardioDistance}
                      keyboardType="decimal-pad"
                      placeholder={`e.g. 5.0`}
                      placeholderTextColor={stepperPalette.muted}
                      selectTextOnFocus
                      accessibilityLabel={`Distance in ${distanceLabel} (optional)`}
                    />
                  </View>
                </View>
              </>
            ) : (
              /* ── Lift inputs: Weight / Reps (+ optional RIR, tucked) ─────── */
              <>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <View style={wuStyles.weightLabelRow}>
                      <Text style={styles.inputLabel}>WEIGHT</Text>
                      <TouchableOpacity
                        onPress={() => setPlateCalcVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel="Open plate and load calculator"
                      >
                        <Text style={wuStyles.plateLink}>plates / machine</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.input}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="decimal-pad"
                      placeholder={isBodyweightExercise(currentEx?.name) ? 'Your bodyweight' : '—'}
                      placeholderTextColor={stepperPalette.muted}
                      selectTextOnFocus
                      accessibilityLabel="Weight"
                    />
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>REPS</Text>
                    <TextInput
                      style={styles.input}
                      value={reps}
                      onChangeText={setReps}
                      keyboardType="number-pad"
                      placeholder="—"
                      placeholderTextColor={stepperPalette.muted}
                      selectTextOnFocus
                      accessibilityLabel="Reps"
                    />
                  </View>
                  {showRir && (
                    <View style={styles.rirGroup}>
                      <Text style={styles.inputLabel}>RIR</Text>
                      <TextInput
                        style={styles.input}
                        value={rir}
                        onChangeText={setRir}
                        keyboardType="number-pad"
                        placeholder="–"
                        placeholderTextColor={stepperPalette.muted}
                        selectTextOnFocus
                        accessibilityLabel="Reps in reserve (optional)"
                      />
                    </View>
                  )}
                </View>

                {showRir ? (
                  <Text style={styles.rirHint}>RIR optional · 0 = to failure</Text>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowRir(true)}
                    style={styles.addRirLink}
                    accessibilityRole="button"
                    accessibilityLabel="Add reps in reserve"
                  >
                    <Text style={styles.addRirLabel}>＋ Add RIR (optional)</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* TICKET-082 Part B: "Choose alternative exercise" — pro only */}
            {onChooseAlternative ? (
              <TouchableOpacity
                onPress={onChooseAlternative}
                style={styles.altExerciseLink}
                accessibilityRole="button"
                accessibilityLabel="Choose alternative exercise"
              >
                <Text style={styles.altExerciseLinkLabel}>Choose alternative exercise</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.logSetBtn}
              onPress={handleLogSet}
              accessibilityRole="button"
              accessibilityLabel={editingIndex != null ? `Save set ${editingIndex + 1}` : `Log set ${setNumber}`}
            >
              <Text style={styles.logSetLabel}>
                {editingIndex != null ? `Save set ${editingIndex + 1}` : `Log set ${setNumber}`}
              </Text>
            </TouchableOpacity>
            {editingIndex != null && (
              <TouchableOpacity
                onPress={() => { setEditingIndex(null); setWeight(''); setReps(''); setRir(''); }}
                style={styles.cancelEditLink}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing set"
              >
                <Text style={styles.cancelEditLabel}>Cancel edit</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Bottom action bar — varies by variant / sub-state ──────────────── */}
      <View style={styles.actionBar}>
        {variant === 'free' ? (
          <>
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={onAddNextExercise}
              accessibilityRole="button"
              accessibilityLabel="Add next exercise"
            >
              <Text style={styles.continueBtnLabel}>＋ Add next exercise</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={onSaveAsRoutine}
              accessibilityRole="button"
              accessibilityLabel="Finish and save as routine"
            >
              <Text style={styles.switchBtnLabel}>Finish &amp; save as routine</Text>
            </TouchableOpacity>
          </>
        ) : variant === 'smart' ? (
          showInterstitial ? (
            <>
              <TouchableOpacity
                style={styles.continueBtn}
                onPress={handleAcceptSug}
                accessibilityRole="button"
                accessibilityLabel={activeSug ? `Continue to ${activeSug.name}` : 'Finish workout'}
              >
                <Text style={styles.continueBtnLabel}>
                  {activeSug ? `Continue to ${activeSug.name} →` : 'Finish workout'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => setSwitcherVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Select different exercise"
              >
                <Text style={styles.switchBtnLabel}>Select different exercise</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.continueBtn, currentExerciseSets.length === 0 && styles.btnDisabled]}
                onPress={handleDoneSeeNext}
                disabled={currentExerciseSets.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Done, see what's next"
              >
                <Text style={styles.continueBtnLabel}>
                  {currentExerciseSets.length === 0 ? 'Log a set to continue' : "Done — see what's next →"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => setSwitcherVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Select different exercise"
              >
                <Text style={styles.switchBtnLabel}>Select different exercise</Text>
              </TouchableOpacity>
            </>
          )
        ) : (
          /* routine */
          <>
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel={isLast ? 'Finish workout' : `Continue to ${nextEx?.name ?? 'next'}`}
            >
              <Text style={styles.continueBtnLabel}>
                {isLast ? 'Finish workout' : `Continue to ${nextEx?.name ?? 'next'} →`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => setSwitcherVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Select different exercise"
            >
              <Text style={styles.switchBtnLabel}>Select different exercise</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Off-routine placement prompt (§1c) ─────────────────────────────── */}
      {offRoutinePrompt && (
        <Pressable style={styles.promptBackdrop} onPress={() => setOffRoutinePrompt(null)}>
          <Pressable style={styles.prompt} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.promptTitle}>Add {offRoutinePrompt.exerciseName} to "{routineName}"?</Text>
            <Text style={styles.promptSub}>Keep it for next time — where should it go?</Text>

            {/* TICKET-081 §1c: row 1 = End of routine | After current; row 2 (full-width) = Pick position… */}
            <View style={styles.placementGrid}>
              {([
                ['end', 'End of routine'],
                ['after_current', 'After current'],
              ] as const).map(([pos, label]) => (
                <TouchableOpacity
                  key={pos}
                  style={[styles.placementOpt, promptPlacement === pos && styles.placementOptOn]}
                  onPress={() => setPromptPlacement(pos)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: promptPlacement === pos }}
                >
                  <Text style={[styles.placementOptLabel, promptPlacement === pos && styles.placementOptLabelOn]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.placementOptFullWidth, promptPlacement === 'pick' && styles.placementOptOn]}
              onPress={() => setPromptPlacement('pick')}
              accessibilityRole="radio"
              accessibilityState={{ checked: promptPlacement === 'pick' }}
            >
              <Text style={[styles.placementOptLabel, promptPlacement === 'pick' && styles.placementOptLabelOn]}>
                Pick position…
              </Text>
            </TouchableOpacity>

            {promptPlacement === 'pick' && (
              <View style={styles.pickList}>
                {Array.from({ length: exercises.length + 1 }, (_, slot) => {
                  const label =
                    slot === 0
                      ? 'At start'
                      : `After ${exercises[slot - 1]?.name ?? `exercise ${slot}`}`;
                  const on = pickIndex === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.pickRow, on && styles.pickRowOn]}
                      onPress={() => setPickIndex(slot)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.pickRowLabel, on && styles.pickRowLabelOn]} numberOfLines={1}>
                        {label}
                      </Text>
                      {on ? <Ionicons name="checkmark" size={16} color={stepperPalette.accent} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={styles.promptActions}>
              <TouchableOpacity
                style={[styles.promptBtn, styles.promptBtnGhost]}
                onPress={() => setOffRoutinePrompt(null)}
              >
                <Text style={styles.promptBtnGhostLabel}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptBtn, styles.promptBtnPrimary]}
                onPress={handleAddOffRoutine}
              >
                <Text style={styles.promptBtnPrimaryLabel}>Add to routine</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      )}

      {/* ── Exercise Switcher Sheet (§1b) ──────────────────────────────────── */}
      <ExerciseSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        routineSession={routineSession}
        onSelectIndex={(idx) => {
          setShowSuggest(false);
          handleSelectIndex(idx);
        }}
        onBrowseLibrary={() => {
          setSwitcherVisible(false);
          setShowSuggest(false);
          onBrowseLibrary();
        }}
      />

      {/* ── Plate / machine load calculator (founder 2026-06-10) ───────────── */}
      <PlateCalculatorSheet
        visible={plateCalcVisible}
        onClose={() => setPlateCalcVisible(false)}
        exerciseId={currentEx?.exerciseId ?? ''}
        unitPref={unitPref}
        initialTarget={weight}
        onUseWeight={(w) => setWeight(String(w))}
      />
    </KeyboardAvoidingView>
  );
}

// ── Warm-up / plate-calc styles ──────────────────────────────────────────────

const wuStyles = StyleSheet.create({
  lastSessionText: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  card: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s2,
  },
  title: {
    color: stepperPalette.muted,
    fontSize: fontSize.micro,
    fontWeight: '600',
    letterSpacing: 1,
    flex: 1,
  },
  setsToggle: {
    color: stepperPalette.accent,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  offLink: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s2,
    borderTopWidth: 1,
    borderTopColor: stepperPalette.line,
    gap: spacing.s3,
  },
  rowPct: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
    width: 38,
  },
  rowMain: {
    color: stepperPalette.text,
    fontSize: fontSize.bodyMd,
    fontWeight: '600',
    flex: 1,
  },
  rowUse: {
    color: stepperPalette.accent,
    fontSize: fontSize.micro,
  },
  hint: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
  },
  enableLink: {
    marginBottom: spacing.s3,
  },
  enableLabel: {
    color: stepperPalette.accent,
    fontSize: fontSize.bodySm,
    fontWeight: '600',
  },
  weightLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  plateLink: {
    color: stepperPalette.accent,
    fontSize: fontSize.micro,
    fontWeight: '600',
  },
});

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: stepperPalette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s3,
    gap: spacing.s3,
  },
  closeBtn: {
    padding: spacing.s1,
  },
  routineName: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: stepperPalette.line,
  },
  dotDone: {
    backgroundColor: stepperPalette.accent,
  },
  progressLabel: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s4,
  },
  exLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 1,
    marginBottom: spacing.s1,
    marginTop: spacing.s2,
  },
  exName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.heading3,
    color: stepperPalette.text,
    marginBottom: spacing.s3,
  },
  pbCard: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  pbText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  chipsScroll: {
    marginBottom: spacing.s3,
  },
  chipsContent: {
    gap: spacing.s2,
    paddingVertical: spacing.s1,
  },
  summaryChip: {
    alignSelf: 'flex-start',
    marginBottom: spacing.s4,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginBottom: spacing.s2,
  },
  inputGroup: {
    flex: 1,
  },
  rirGroup: {
    flex: 0.7,
  },
  rirHint: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    marginBottom: spacing.s3,
  },
  addRirLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.s1,
    marginBottom: spacing.s2,
  },
  addRirLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: stepperPalette.accent,
  },
  inputLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.s2,
  },
  input: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: stepperPalette.text,
    textAlign: 'center',
  },
  logSetBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    marginBottom: spacing.s2,
  },
  logSetLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },
  cancelEditLink: {
    alignSelf: 'center',
    paddingVertical: spacing.s2,
    marginBottom: spacing.s1,
  },
  cancelEditLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
  },
  actionBar: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s8,
    paddingTop: spacing.s3,
    gap: spacing.s2,
    borderTopWidth: 1,
    borderTopColor: stepperPalette.line,
  },
  continueBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3 + 2,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  continueBtnLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },
  switchBtn: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  switchBtnLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
  },
  // Smart-suggest card + alternatives
  suggestionCard: {
    backgroundColor: stepperPalette.accentSurface,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  suggestionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  suggestionPill: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  suggestionPillLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.accentInk,
  },
  suggestionReason: {
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.s2,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
  },
  suggestionName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
    color: stepperPalette.text,
  },
  suggestionPb: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
    marginTop: 3,
  },
  altLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 1,
    marginBottom: spacing.s2,
    marginTop: spacing.s1,
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    marginBottom: spacing.s2,
    gap: spacing.s2,
  },
  altRowText: {
    flex: 1,
  },
  altName: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.text,
  },
  altReason: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    marginTop: 1,
  },
  emptySuggest: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    marginTop: spacing.s3,
  },
  // Off-routine prompt
  promptBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  prompt: {
    backgroundColor: stepperPalette.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: stepperPalette.accentLine,
    padding: spacing.s4,
    paddingBottom: spacing.s8,
  },
  handle: {
    width: 34,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    alignSelf: 'center',
    marginBottom: spacing.s3,
  },
  promptTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    marginBottom: spacing.s1,
  },
  promptSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    marginBottom: spacing.s3,
  },
  placementGrid: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginBottom: spacing.s2,
  },
  placementOpt: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    backgroundColor: stepperPalette.bg,
    minHeight: 44,
    justifyContent: 'center',
  },
  placementOptFullWidth: {
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    backgroundColor: stepperPalette.bg,
    marginBottom: spacing.s3,
    minHeight: 44,
    justifyContent: 'center',
  },
  placementOptOn: {
    borderColor: stepperPalette.accentLine,
    backgroundColor: stepperPalette.accentSurface,
  },
  placementOptLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  placementOptLabelOn: {
    color: stepperPalette.accent,
  },
  pickList: {
    marginBottom: spacing.s3,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: stepperPalette.line,
  },
  pickRowOn: {
    backgroundColor: stepperPalette.accentSurface,
  },
  pickRowLabel: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  pickRowLabelOn: {
    color: stepperPalette.accent,
  },
  promptActions: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  promptBtn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  promptBtnGhost: {
    borderWidth: 1,
    borderColor: stepperPalette.line,
  },
  promptBtnGhostLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  promptBtnPrimary: {
    backgroundColor: stepperPalette.accent,
  },
  promptBtnPrimaryLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },

  /* ── Cardio duration row ──────────────────────────────────────────────── */
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  durationInput: {
    flex: 1,
  },
  durationSep: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: stepperPalette.muted,
    textAlign: 'center',
    width: 14,
  },

  /* ── TICKET-082 Part B: "Choose alternative exercise" link ──────────── */
  altExerciseLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.s1,
    marginBottom: spacing.s2,
    minHeight: 44,
    justifyContent: 'center',
  },
  altExerciseLinkLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    textDecorationLine: 'underline',
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    backgroundColor: stepperPalette.accentSurface,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.caption,
    color: stepperPalette.accent,
  },
  chipEditing: {
    backgroundColor: stepperPalette.accent,
    borderColor: stepperPalette.accent,
  },
  labelEditing: {
    color: stepperPalette.accentInk,
  },
});
