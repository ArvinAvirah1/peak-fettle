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

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from './Icon';
import {
  stepperPalette,
  fontFamily,
  spacing,
  radius,
  fontSize,
} from '../theme/tokens';
import { RoutineSession, RoutineSessionExercise } from './RoutineStrip';
import MuscleMapBase, { MuscleMapProps } from '../components/MuscleMap';
import { muscleGroupsForExercise } from '../data/muscleRegions';
import { useAuth } from '../hooks/useAuth';

// MuscleMap is gaining an optional `sex` prop (owned by another agent). Until
// MuscleMapProps declares it, alias the component to a forward-compatible type
// so we can pass `sex` without editing MuscleMap.tsx or widening to `any`.
// `sex` is harmless to the current component (an unknown extra prop is ignored
// at runtime); once MuscleMapProps adds `sex?`, this alias becomes redundant.
const MuscleMap = MuscleMapBase as React.ComponentType<
  MuscleMapProps & { sex?: 'male' | 'female' | null }
>;
import ExerciseSwitcherSheet from './ExerciseSwitcherSheet';
import { SuggestCandidate } from '../utils/smartSuggest';
// Founder logger fixes #3/#4: pure, unit-tested helpers (see loggerLogic.ts +
// __tests__/loggerLogic.test.js). nextPendingExerciseIndex skips already-completed
// exercises (jump-ahead bug); isPlannedComplete drives the post-final-set button swap.
import {
  nextPendingExerciseIndex,
  isPlannedComplete,
  groupMembers,
  roundOf,
  restAfterSet,
  formatEffort,
  rpeToRir,
  rirToRpe,
} from './loggerLogic';
// TICKET-128: RIR ⇄ RPE display toggle. Zero-network, local-only KV read —
// safe to call on mount for both free and Pro (mirrors getExercisePrefs below).
import { getEffortDisplay, EffortDisplay } from '../data/appSettings';
// S1 dropset chain UI (amber chips + drop actions) — owns its own presentation.
import DropChainBar, { type DropChainLink } from './logger/DropChainBar';
import PlateCalculatorSheet from './PlateCalculatorSheet';
// TICKET-134: exercise media v1 — muscle diagram + form cues sheet, reachable
// from the logger header (zero network; static catalog + existing components).
import { ExerciseDetailSheet, ExerciseDetailTarget } from './ExerciseDetailSheet';
import Animated, {
  FadeIn,
  FadeInDown,
  useReducedMotion,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { computeWarmupPlan, WARMUP_SET_CHOICES } from '../lib/warmup';
import { CardioMetrics } from '../data/cardioMetrics';
import { getExercisePrefs, setExercisePrefs } from '../data/exercisePrefs';
import { getExerciseGoal, setExerciseGoal, clearExerciseGoal, ExerciseGoal } from '../data/exerciseGoals'; // WIDGET-002
import { REST_TIMER_DEFAULT } from '../hooks/useRestTimer';
import { displayToKg, kgToInputValue } from '../constants/units';

// expo-haptics is wrapped in utils/haptics with a platform guard; import the
// wrapper so a missing native module never throws (option 11 / log confirmation).
let haptics: { success: () => void; light: () => void } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  haptics = require('../utils/haptics').haptics;
} catch {
  haptics = null;
}

// Step sizes for the -/+ steppers (display units; lbs steps bigger).
const WEIGHT_STEP_KG = 2.5;
const WEIGHT_STEP_LB = 5;
const REPS_STEP = 1;

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

// ── Optional cardio-metrics parsing (P5) ─────────────────────────────────────

/** Parse a finite positive number from a free-text field; null when blank/invalid. */
function parsePositiveNumber(text: string): number | null {
  const n = parseFloat(String(text).trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parse a free-text splits list into seconds-per-unit numbers. Accepts entries
 * separated by comma / space / newline, each either "mm:ss" (→ total seconds)
 * or a plain seconds value. Invalid entries are skipped; returns undefined when
 * nothing valid was entered.
 */
function parseSplits(text: string): number[] | undefined {
  const raw = String(text ?? '').trim();
  if (!raw) return undefined;
  const out: number[] = [];
  for (const tok of raw.split(/[\s,]+/)) {
    if (!tok) continue;
    if (tok.includes(':')) {
      const parts = tok.split(':');
      const m = parseInt(parts[0] ?? '', 10);
      const s = parseInt(parts[1] ?? '', 10);
      if (Number.isFinite(m) && Number.isFinite(s) && s >= 0 && s < 60) {
        out.push(m * 60 + s);
      }
    } else {
      const v = parseFloat(tok);
      if (Number.isFinite(v) && v > 0) out.push(v);
    }
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Assemble a CardioMetrics blob from the optional-field raw strings. Only
 * defined/valid fields are included, so an all-blank section yields null (the
 * caller then skips the metrics write entirely — nothing optional is forced).
 */
function buildCardioMetrics(args: {
  hrAvg: string; hrMax: string; calories: string; cadence: string;
  elevation: string; rpe: string; splits: string;
}): CardioMetrics | null {
  const m: CardioMetrics = {};
  const hrAvg = parsePositiveNumber(args.hrAvg);
  const hrMax = parsePositiveNumber(args.hrMax);
  const calories = parsePositiveNumber(args.calories);
  const cadence = parsePositiveNumber(args.cadence);
  const elevation = parsePositiveNumber(args.elevation);
  const rpe = parsePositiveNumber(args.rpe);
  const splits = parseSplits(args.splits);
  if (hrAvg != null) m.hrAvgBpm = Math.round(hrAvg);
  if (hrMax != null) m.hrMaxBpm = Math.round(hrMax);
  if (calories != null) m.calories = Math.round(calories);
  if (cadence != null) m.cadenceSpm = Math.round(cadence);
  if (elevation != null) m.elevationGainM = elevation;
  // RPE is a 1–10 scale; clamp defensively.
  if (rpe != null) m.rpe = Math.max(1, Math.min(10, Math.round(rpe)));
  if (splits) m.splits = splits;
  return Object.keys(m).length > 0 ? m : null;
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
  onLogSet: (exerciseId: string, weight: string, reps: string, rir?: string) => void | Promise<void>;
  /**
   * Called when the user taps a logged LIFT-set chip and saves a correction
   * (e.g. a mistyped weight). `setIndex` is 0-based within the current exercise.
   * Undefined = chips are not editable.
   */
  onUpdateSet?: (exerciseId: string, setIndex: number, weight: string, reps: string, rir?: string) => void | Promise<void>;
  /**
   * Called when user logs a CARDIO set. The parent should build the LogCardioSetPayload.
   * Separated from onLogSet to keep the lift path unchanged (TICKET-080 §2).
   *
   * `metrics` (P5) carries the OPTIONAL rich metrics from the collapsible "More
   * metrics" section (avg/max HR, calories, cadence, elevation, RPE, splits).
   * It is undefined when the user logged only duration/distance — the parent
   * then skips the metrics write entirely. When present the parent persists it
   * via cardioMetrics.setSetMetrics, keyed to the logged set's id.
   */
  onLogCardioSet?: (
    exerciseId: string,
    durationSec: number,
    distanceM?: number,
    avgPaceSecPerKm?: number,
    metrics?: CardioMetrics,
  ) => void | Promise<void>;
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
  /**
   * Default rest duration (seconds) for the inline rest-timer ring shown after
   * a set is logged. Falls back to REST_TIMER_DEFAULT when not provided.
   */
  restSeconds?: number | null;
  /**
   * Empty-state CTA (option 13): called when the session has zero exercises and
   * the user taps "Add exercise". Falls back to onBrowseLibrary when undefined.
   */
  onAddExercise?: () => void;
  // ── S1 supersets ──────────────────────────────────────────────────────────
  /**
   * Open the "Superset with…" pairing sheet (session-only). Shown only when the
   * current exercise is UNGROUPED and >= 1 other pending exercise exists.
   * Undefined = hide the affordance (e.g. history-edit mode).
   */
  onSupersetWith?: () => void;
  /** Unlink the current exercise's superset group (session-only). */
  onUnlinkSuperset?: (groupId: string) => void;
  // ── S1 dropsets ───────────────────────────────────────────────────────────
  /**
   * Active drop-chain state for the CURRENT exercise, or null. When present the
   * amber DropChainBar replaces the rest ring and rest stays suppressed.
   */
  dropChain?: {
    chainId: string;
    links: DropChainLink[];
    nextDropIndex: number;
    nextDropWeightLabel?: string | null;
    /** Pre-fill value (display units) for the next drop's weight input. */
    nextDropWeightPrefill?: string | null;
  } | null;
  /** Start a drop chain off the just-logged top set (parent seeds chain state). */
  onStartDropChain?: () => void;
  /** End the drop chain and start the normal rest timer. */
  onEndDropChain?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SetChip({
  set,
  index,
  unitPref,
  onPress,
  editing,
  effortDisplay = 'rir',
}: {
  set: LoggedSet;
  index: number;
  unitPref?: 'kg' | 'lbs';
  onPress?: () => void;
  editing?: boolean;
  /** TICKET-128: RIR ⇄ RPE display toggle. Storage is unaffected either way. */
  effortDisplay?: EffortDisplay;
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
    // formatEffort is the single pure helper (loggerLogic.ts) — "to failure" /
    // "RIR N" / "RPE N" / "RPE ≤ 5" all derive from the SAME stored rirNum, so
    // the chip text changes with the setting but the underlying value never does.
    const effort = formatEffort(rirNum, effortDisplay);
    const rirLabel = effort ? ` · ${effort}` : '';
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

/**
 * Posterior (back-of-body) canonical muscle labels — used to decide which side
 * of the body model to show. `muscleGroupsForExercise` returns canonical labels
 * (see data/muscleRegions.ts): back (incl. lower_back), lats, traps, glutes,
 * hamstrings, triceps, calves. Shoulders are intentionally excluded — the label
 * collapses front/side/rear delts together, so it can't be called posterior.
 */
const POSTERIOR_GROUPS = new Set([
  'back',
  'lats',
  'traps',
  'glutes',
  'hamstrings',
  'triceps',
  'calves',
]);

/**
 * Choose the body-model view for an exercise from its canonical muscle groups.
 * Returns 'back' only when the movement is clearly posterior-dominant (more of
 * its groups are posterior than anterior); otherwise 'front'. Mixed/compound or
 * no-group exercises default to 'front'.
 */
function viewForMuscleGroups(groups: string[]): 'front' | 'back' {
  if (groups.length === 0) return 'front';
  let posterior = 0;
  let anterior = 0;
  for (const g of groups) {
    if (POSTERIOR_GROUPS.has(g)) posterior += 1;
    else anterior += 1;
  }
  return posterior > anterior ? 'back' : 'front';
}

/**
 * Normalise the auth user's `sex` (which may be 'MALE'/'FEMALE'/'male'/'female'/
 * 'UNDISCLOSED'/null) to the 'male' | 'female' the body model expects.
 * UNDISCLOSED / null / anything unrecognised → 'male' (sensible default for now).
 */
function normaliseSex(raw: string | null | undefined): 'male' | 'female' {
  return String(raw ?? '').toLowerCase() === 'female' ? 'female' : 'male';
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

// ── Inline rest-timer ring (option 4) ────────────────────────────────────────
// Small SVG progress ring with a centred mm:ss countdown; whole pill is
// tap-to-skip. Purely visual/local — the background-safe notification timer is
// still owned by the parent (WorkoutLoggerHost), so this never double-schedules.

function RestRing({
  secondsLeft,
  total,
  onSkip,
  onAdd,
  reducedMotion,
}: {
  secondsLeft: number;
  total: number;
  onSkip: () => void;
  onAdd: () => void;
  reducedMotion: boolean;
}): React.ReactElement {
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, secondsLeft / total)) : 0;
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const label = `${mm}:${String(ss).padStart(2, '0')}`;
  // Ring drains as the countdown elapses; offset grows as `frac` shrinks.
  const dashOffset = circ * (1 - frac);
  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeInDown.duration(180)}
      style={restRingStyles.wrap}
    >
      <TouchableOpacity
        style={restRingStyles.pill}
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel={`Resting, ${label} left. Tap to skip.`}
      >
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={stepperPalette.line}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={stepperPalette.accent}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
              // Rotate so the ring drains from 12 o'clock.
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </Svg>
          <View style={restRingStyles.center} pointerEvents="none">
            <Ionicons name="pause" size={14} color={stepperPalette.accent} />
          </View>
        </View>
        <View style={restRingStyles.textCol}>
          <Text style={restRingStyles.label}>Rest {label}</Text>
          <Text style={restRingStyles.sub}>tap to skip</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={restRingStyles.addBtn}
        onPress={onAdd}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Add 30 seconds of rest"
      >
        <Text style={restRingStyles.addLabel}>+30s</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Big -/+ stepper control (option 2) ───────────────────────────────────────

function StepperControl({
  label,
  value,
  onChangeText,
  onStep,
  keyboardType,
  placeholder,
  accessibilityLabel,
  rightAccessory,
  unitSuffix,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onStep: (dir: 1 | -1) => void;
  keyboardType: 'decimal-pad' | 'number-pad';
  placeholder: string;
  accessibilityLabel: string;
  rightAccessory?: React.ReactNode;
  unitSuffix?: string | null;
  maxLength?: number;
}): React.ReactElement {
  return (
    <View style={styles.inputGroup}>
      <View style={wuStyles.weightLabelRow}>
        <Text style={styles.inputLabel}>{label}</Text>
        {rightAccessory ?? null}
      </View>
      <View style={stepperCtl.row}>
        <TouchableOpacity
          style={stepperCtl.btn}
          onPress={() => onStep(-1)}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${accessibilityLabel}`}
        >
          <Ionicons name="remove" size={22} color={stepperPalette.text} />
        </TouchableOpacity>
        <View style={stepperCtl.fieldWrap}>
          <TextInput
            style={stepperCtl.field}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            placeholder={placeholder}
            placeholderTextColor={stepperPalette.muted}
            selectTextOnFocus
            accessibilityLabel={accessibilityLabel}
            maxLength={maxLength}
          />
          {unitSuffix ? <Text style={stepperCtl.unit}>{unitSuffix}</Text> : null}
        </View>
        <TouchableOpacity
          style={stepperCtl.btn}
          onPress={() => onStep(1)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${accessibilityLabel}`}
        >
          <Ionicons name="add" size={22} color={stepperPalette.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
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
  restSeconds,
  onAddExercise,
  onSupersetWith,
  onUnlinkSuperset,
  dropChain,
  onStartDropChain,
  onEndDropChain,
}: Props): React.ReactElement {
  const { exercises, currentIndex, name: routineName } = routineSession;
  const reducedMotion = useReducedMotion(); // 2026-06-10 aesthetic pass
  const insets = useSafeAreaInsets();
  const currentEx: RoutineSessionExercise | undefined = exercises[currentIndex];
  const isLast = currentIndex === exercises.length - 1;
  const isFreeLike = variant === 'free' || variant === 'smart';

  // TICKET-134: exercise detail sheet target (muscle diagram + cues), opened
  // from the header info button for the CURRENT exercise. Local UI state only.
  const [detailTarget, setDetailTarget] = useState<ExerciseDetailTarget | null>(null);

  // ── Current exercise category ──────────────────────────────────────────────
  const isCardio = (currentEx?.category ?? 'lift') === 'cardio';
  const distanceLabel = unitPref === 'lbs' ? 'miles' : 'km';

  // ── Muscle map for the current exercise (P2) ───────────────────────────────
  // Canonical groups for the compact <MuscleMap> shown beside the exercise name.
  // Empty for movements with no resolvable group (e.g. most cardio) — the map is
  // then omitted entirely.
  const exMuscleGroups = useMemo(
    () => muscleGroupsForExercise(currentEx?.name ?? ''),
    [currentEx?.name],
  );
  // P2: pick the body-model side from the exercise's muscles (posterior-dominant
  // → back, else front) and match the figure to the user's sex.
  const muscleView = useMemo(() => viewForMuscleGroups(exMuscleGroups), [exMuscleGroups]);
  const { user: authUser } = useAuth();
  const muscleSex = useMemo(() => normaliseSex(authUser?.sex), [authUser?.sex]);

  // ── TICKET-128: effort display (RIR ⇄ RPE) ────────────────────────────────
  // Local-only KV read, zero network, safe on mount (same shape as
  // getExercisePrefs below). Defaults to 'rir' — unchanged behavior until the
  // user opts in via Settings. sets.rir is ALWAYS what gets stored; this only
  // controls the label/typed-value conversion in this component.
  const [effortDisplay, setEffortDisplayState] = useState<EffortDisplay>('rir');
  useEffect(() => {
    let cancelled = false;
    getEffortDisplay()
      .then((mode) => { if (!cancelled) setEffortDisplayState(mode); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Local form state — LIFT ──────────────────────────────────────────────
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  // `rir` always holds the STORED-shape string (RIR), even when the user is
  // typing in RPE display mode — see rirInputValue/handleRirInputChange below,
  // which are the ONLY places that convert. onLogSet/onUpdateSet always read
  // this state directly, so storage never sees an RPE number.
  const [rir, setRir] = useState('');
  const [showRir, setShowRir] = useState(false);
  // Edit mode: index of the logged set currently being corrected (null = adding a new set).
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // ── Local form state — CARDIO ────────────────────────────────────────────
  const [cardioDurationMm, setCardioDurationMm] = useState('');
  const [cardioDurationSs, setCardioDurationSs] = useState('');
  const [cardioDistance, setCardioDistance] = useState('');

  // ── Optional "More metrics" (P5) — collapsed by default; all fields optional.
  // Held as raw strings; parsed into a CardioMetrics blob only on log. `splits`
  // is a free-text list of per-unit times ("5:10, 5:02, …" or plain seconds).
  const [showMoreMetrics, setShowMoreMetrics] = useState(false);
  const [mHrAvg, setMHrAvg] = useState('');
  const [mHrMax, setMHrMax] = useState('');
  const [mCalories, setMCalories] = useState('');
  const [mCadence, setMCadence] = useState('');
  const [mElevation, setMElevation] = useState('');
  const [mRpe, setMRpe] = useState('');
  const [mSplits, setMSplits] = useState('');
  const resetMoreMetrics = useCallback(() => {
    setMHrAvg(''); setMHrMax(''); setMCalories(''); setMCadence('');
    setMElevation(''); setMRpe(''); setMSplits('');
  }, []);

  // ── Inline rest-timer ring (option 4) ─────────────────────────────────────
  // Local, visual-only countdown started on each logged set. The background
  // notification timer remains owned by the parent (no double-scheduling).
  const restTotal = useMemo(
    () => (restSeconds != null && restSeconds > 0 ? restSeconds : REST_TIMER_DEFAULT),
    [restSeconds],
  );
  const [restLeft, setRestLeft] = useState<number | null>(null);
  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) { setRestLeft(null); return; }
    const t = setTimeout(() => setRestLeft((s) => (s == null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [restLeft]);

  // ── Log-confirmation micro-animation (option 11) ──────────────────────────
  // 150ms scale+check on the Log button; reduced-motion users get no scale.
  const logScale = useSharedValue(1);
  const logBtnStyle = useAnimatedStyle(() => ({ transform: [{ scale: logScale.value }] }));
  const [justLoggedTick, setJustLoggedTick] = useState(false);
  const playLogConfirm = useCallback(() => {
    if (!reducedMotion) {
      logScale.value = withSequence(
        withTiming(0.94, { duration: 75 }),
        withTiming(1, { duration: 75 }),
      );
    }
    setJustLoggedTick(true);
    setTimeout(() => setJustLoggedTick(false), 600);
    haptics?.success?.();
  }, [reducedMotion, logScale]);

  // ── Save-failure retry toast (option 14) ──────────────────────────────────
  // onLogSet/onUpdateSet are fire-and-forget in the parent; we can't observe a
  // throw across that boundary, so the parent reports failures by returning a
  // rejected promise OR we surface our own optimistic-failure toast when the
  // local handler itself throws. The retry re-submits the last payload.
  const lastPayloadRef = useRef<null | { weight: string; reps: string; rir?: string }>(null);
  const [retryToast, setRetryToast] = useState(false);

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

  // ── Per-exercise goal (WIDGET-002, founder 2026-06-11): one weight x reps
  // target. Reloaded after every logged set (currentExerciseSets.length dep)
  // so the achieved state appears as soon as WorkoutLoggerHost marks it.
  const [goal, setGoal] = useState<ExerciseGoal | null>(null);
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalWeight, setGoalWeight] = useState('');
  const [goalReps, setGoalReps] = useState('');
  useEffect(() => {
    const id = currentEx?.exerciseId;
    setGoalEditing(false);
    if (!id) { setGoal(null); return; }
    let cancelled = false;
    getExerciseGoal(id)
      .then((g) => { if (!cancelled) setGoal(g); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentEx?.exerciseId, currentExerciseSets.length]);

  const handleSaveGoal = useCallback(() => {
    const id = currentEx?.exerciseId;
    const wDisp = parseFloat(goalWeight);
    const r = parseInt(goalReps, 10);
    if (!id || !Number.isFinite(wDisp) || wDisp <= 0 || !Number.isInteger(r) || r <= 0) return;
    // Goals store kg (sets.weight_kg convention) — convert the display-unit input.
    const wKg = displayToKg(wDisp, unitPref);
    setGoalEditing(false);
    setExerciseGoal(id, wKg, r, currentEx?.name ?? null)
      .then(() => getExerciseGoal(id))
      .then((g) => setGoal(g))
      .catch(() => {});
  }, [currentEx?.exerciseId, currentEx?.name, goalWeight, goalReps, unitPref]);

  const handleRemoveGoal = useCallback(() => {
    const id = currentEx?.exerciseId;
    if (!id) return;
    setGoalEditing(false);
    setGoal(null);
    clearExerciseGoal(id).catch(() => {});
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

  // ── Founder fix #3: next-exercise affordance skips COMPLETED exercises ─────
  // The user may jump ahead (busy gym) and finish a later exercise, then return
  // to normal order — the old `currentIndex + 1` would offer an already-done lift.
  // nextPendingExerciseIndex forward-searches with wrap-around, skipping any
  // exercise whose logged sets >= target sets; null → nothing pending → finish.
  // The count comes from the session's per-exercise loggedSetCount (kept live by
  // the host on every set), except the CURRENT exercise, whose authoritative live
  // count is currentExerciseSets.length (loggedSetCount may lag the optimistic
  // mirror by one render). We overlay it so completing the last planned set of the
  // current exercise immediately excludes it from the next-pending search.
  const nextPendingIdx = useMemo(() => {
    const overlaid = {
      ...routineSession,
      exercises: exercises.map((e, i) =>
        i === currentIndex ? { ...e, loggedSetCount: currentExerciseSets.length } : e,
      ),
    };
    return nextPendingExerciseIndex(overlaid, currentIndex);
  }, [routineSession, exercises, currentIndex, currentExerciseSets.length]);
  const nextPendingEx: RoutineSessionExercise | undefined =
    nextPendingIdx != null ? exercises[nextPendingIdx] : undefined;

  // ── Founder fix #4: after the LAST planned set, swap button emphasis ───────
  // Once currentExerciseSets.length >= targetSets, the PRIMARY (big) button
  // becomes "Next exercise: <name>" (or "Finish workout" when none pending) and
  // the extra-set "Log set N" action demotes to the secondary slot. Only the
  // routine variant carries targetSets, so free/smart sessions are unaffected
  // (isPlannedComplete returns false without a positive target).
  const plannedComplete = isPlannedComplete(currentExerciseSets.length, currentEx?.targetSets);
  const advanceLabel = nextPendingEx ? `Next exercise: ${nextPendingEx.name}` : 'Finish workout';
  const isOffRoutine =
    routineSession.source === 'routine' && (currentEx?.exerciseId ?? '') === '';

  // ── S1: superset group derivation for the CURRENT exercise ────────────────
  const groupId = currentEx?.groupId ?? null;
  const isGrouped = groupId != null;
  const groupInfo = useMemo(() => {
    if (!isGrouped || groupId == null) return null;
    const members = groupMembers(exercises, groupId);
    if (members.length < 2) return null;
    // Group letter: A for the first group encountered in session order, B next…
    const groupIdsInOrder: string[] = [];
    for (const e of exercises) {
      if (e.groupId && !groupIdsInOrder.includes(e.groupId)) groupIdsInOrder.push(e.groupId);
    }
    const letterIdx = groupIdsInOrder.indexOf(groupId);
    const letter = letterIdx >= 0 ? String.fromCharCode(65 + letterIdx) : 'A';
    const rounds =
      typeof currentEx?.groupRounds === 'number' && currentEx.groupRounds > 0
        ? currentEx.groupRounds
        : Math.max(1, ...members.map((m) => m.exercise.targetSets ?? 1));
    // Position of the current exercise within the group (A1, A2, …).
    const posInGroup = members.findIndex((m) => m.index === currentIndex) + 1;
    const round = roundOf(currentEx, currentExerciseSets.length);
    const otherNames = members
      .filter((m) => m.index !== currentIndex)
      .map((m) => m.exercise.name);
    return { letter, rounds, round, posInGroup, otherNames, memberCount: members.length };
  }, [isGrouped, groupId, exercises, currentEx, currentIndex, currentExerciseSets.length]);

  // ── S1: is a drop chain active for the current exercise? ──────────────────
  const chainActive = !!dropChain;

  // ── S1: does at least one OTHER exercise remain pending + ungrouped? (gates
  // the "Superset with…" affordance — nothing to pair with otherwise.) ────────
  const hasOtherPending = useMemo(() => {
    for (let i = 0; i < exercises.length; i++) {
      if (i === currentIndex) continue;
      const e = exercises[i];
      if (!e || e.groupId) continue;
      const liveCount = e.loggedSetCount;
      const done =
        typeof e.targetSets === 'number' && e.targetSets > 0
          ? liveCount >= e.targetSets
          : e.done;
      if (!done) return true;
    }
    return false;
  }, [exercises, currentIndex]);

  // ── S1: rest suppression — mirror the host predicate so the LOCAL visual rest
  // ring is suppressed in lockstep (spec §3: one predicate gates BOTH). Rest is
  // suppressed while a drop chain is active, and mid-superset-round when another
  // group member still has work. We build a session snapshot with the current
  // exercise's live logged count so restAfterSet sees the just-logged set.
  const restSuppressedAfterThisSet = useMemo(() => {
    if (chainActive) return true;
    if (!isGrouped) return false;
    const liveCount = currentExerciseSets.length + 1;
    const snapshot = {
      ...routineSession,
      exercises: exercises.map((e, i) =>
        i === currentIndex ? { ...e, loggedSetCount: liveCount } : e,
      ),
    };
    return !restAfterSet(snapshot, currentIndex);
  }, [chainActive, isGrouped, routineSession, exercises, currentIndex, currentExerciseSets.length]);

  // ── S1: when a drop chain advances, pre-fill the weight input with the next
  // drop's −20% weight and clear reps so the user just types the reps achieved.
  // Keyed on the chain's next drop index so it fires once per drop, not per
  // render. Only touches the input while a chain is active for this exercise.
  const lastDropPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!dropChain) { lastDropPrefillRef.current = null; return; }
    const key = `${dropChain.chainId}:${dropChain.nextDropIndex}`;
    if (lastDropPrefillRef.current === key) return;
    lastDropPrefillRef.current = key;
    const pre = dropChain.nextDropWeightPrefill;
    if (pre != null && pre !== '') {
      setWeight(pre);
      setReps('');
    }
  }, [dropChain]);

  // Progress dots (max 6 shown) — for >6 exercises we use the slim progress bar.
  const dotsToShow = Math.min(exercises.length, 6);
  const useProgressBar = exercises.length > 6;
  const progressDots = useMemo(
    () => Array.from({ length: dotsToShow }, (_, i) => i <= currentIndex),
    [dotsToShow, currentIndex],
  );
  const progressFrac = exercises.length > 0 ? (currentIndex + 1) / exercises.length : 0;

  // Slim animated progress bar (option 7) — determinate current/total.
  const barWidth = useSharedValue(progressFrac);
  useEffect(() => {
    barWidth.value = reducedMotion ? progressFrac : withTiming(progressFrac, { duration: 260 });
  }, [progressFrac, reducedMotion, barWidth]);
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, barWidth.value)) * 100}%` }));

  // ── Last-session ghost (option 5) — "last: 80 × 5" with one-tap copy. ──────
  const unitLabel = unitPref === 'lbs' ? 'lb' : 'kg';
  const ghostLast = useMemo(() => {
    if (isCardio || !lastTopSetDisplay) return null;
    // lastTopSetDisplay.weight is already in DISPLAY units (WLH converts kg→lbs for
    // lbs users before passing the prop). Do NOT call displayToKg+kgToInputValue —
    // that would double-convert and produce a floating-point-corrupted value (WL-003).
    // For kg users: w is already kg, stringify it with kgToInputValue(w, 'kg') to
    // strip trailing zeros. For lbs users: w was already rounded to nearest ¼ lb
    // by WLH — just stringify it.
    const w = lastTopSetDisplay.weight;
    const weightStr = unitPref === 'lbs' ? String(w) : kgToInputValue(w, 'kg');
    return { weightStr, reps: lastTopSetDisplay.reps, w };
  }, [isCardio, lastTopSetDisplay, unitPref]);
  const copyLastSet = useCallback(() => {
    if (!ghostLast) return;
    setWeight(ghostLast.weightStr);
    setReps(String(ghostLast.reps));
    haptics?.light?.();
  }, [ghostLast]);

  // ── Big-stepper increment/decrement (option 2) ────────────────────────────
  const stepWeight = useCallback((dir: 1 | -1) => {
    const step = unitPref === 'lbs' ? WEIGHT_STEP_LB : WEIGHT_STEP_KG;
    const cur = parseFloat(weight);
    const base = Number.isFinite(cur) ? cur : 0;
    const next = Math.max(0, Math.round((base + dir * step) * 100) / 100);
    setWeight(next === 0 && dir < 0 ? '' : String(next));
    haptics?.light?.();
  }, [weight, unitPref]);
  const stepReps = useCallback((dir: 1 | -1) => {
    const cur = parseInt(reps, 10);
    const base = Number.isFinite(cur) ? cur : 0;
    const next = Math.max(0, base + dir * REPS_STEP);
    setReps(next === 0 ? '' : String(next));
    haptics?.light?.();
  }, [reps]);

  // ── TICKET-128: RIR input field, displayed as RPE when the setting is on ──
  // `rir` state ALWAYS holds the RIR string (what gets stored). These two
  // helpers are the only place a typed/displayed value crosses to/from RPE:
  //   - rirInputValue:      RIR (stored) -> what the field SHOWS.
  //   - handleRirInputChange: what the user TYPED -> RIR (stored) via rpeToRir.
  // onLogSet/onUpdateSet below always read the `rir` state directly, so the
  // conversion never leaks into the write path — sets.rir is unaffected either way.
  const rirInputValue = useMemo(() => {
    if (effortDisplay !== 'rpe') return rir;
    if (rir.trim() === '') return '';
    const n = parseInt(rir, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return rir; // mid-typing / invalid — show as-is
    const rpe = rirToRpe(n);
    return rpe == null ? '' : String(rpe);
  }, [rir, effortDisplay]);
  const handleRirInputChange = useCallback((text: string) => {
    if (effortDisplay !== 'rpe') { setRir(text); return; }
    if (text.trim() === '') { setRir(''); return; }
    const typed = parseInt(text, 10);
    if (!Number.isFinite(typed) || Number.isNaN(typed)) { setRir(text); return; } // let the user keep typing
    const storedRir = rpeToRir(typed);
    setRir(storedRir == null ? '' : String(storedRir));
  }, [effortDisplay]);
  const rirFieldLabel = effortDisplay === 'rpe' ? 'RPE' : 'RIR';
  const rirFieldAccessibilityLabel =
    effortDisplay === 'rpe' ? 'Rate of perceived exertion (optional)' : 'Reps in reserve (optional)';
  const rirFieldHint =
    effortDisplay === 'rpe' ? 'RPE optional · 10 = to failure' : 'RIR optional · 0 = to failure';
  const addRirLinkLabel = effortDisplay === 'rpe' ? '＋ Add RPE (optional)' : '＋ Add RIR (optional)';

  // ── Swipe between exercises (option 8) — keeps the existing buttons. ───────
  // Track whether the inner ScrollView has been scrolled down; we only claim
  // the PanResponder when the content is at the top, preventing the gesture
  // from competing with vertical scroll (swipe-gesture-on-scroll).
  const scrollYRef = useRef(0);
  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, g) =>
          // Only claim a clearly horizontal gesture AND only when the scroll is
          // at rest at the top of the content (y === 0).
          scrollYRef.current === 0 &&
          Math.abs(g.dx) > 32 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_evt, g) => {
          if (g.dx <= -48 && currentIndex < exercises.length - 1) {
            setEditingIndex(null);
            setWeight('');
            setReps('');
            onAdvance(currentIndex + 1);
          } else if (g.dx >= 48 && currentIndex > 0) {
            setEditingIndex(null);
            setWeight('');
            setReps('');
            onAdvance(currentIndex - 1);
          }
        },
      }),
    [currentIndex, exercises.length, onAdvance],
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
      // Optional rich metrics — undefined when the "More metrics" section was
      // left blank, so the parent skips the metrics write entirely.
      const metrics = buildCardioMetrics({
        hrAvg: mHrAvg, hrMax: mHrMax, calories: mCalories, cadence: mCadence,
        elevation: mElevation, rpe: mRpe, splits: mSplits,
      }) ?? undefined;
      if (onLogCardioSet) {
        Promise.resolve(
          onLogCardioSet(currentEx?.exerciseId ?? '', durationSec, distanceM, avgPace, metrics) as unknown,
        ).catch(() => setRetryToast(true));
      }
      setCardioDurationMm('');
      setCardioDurationSs('');
      setCardioDistance('');
      resetMoreMetrics();
      playLogConfirm();
      // S1: suppress the local visual rest ring mid-superset-round (the parent
      // suppresses the notification rest in lockstep).
      if (!restSuppressedAfterThisSet) setRestLeft(restTotal);
    } else {
      // Lift path
      if (!weight.trim() && !reps.trim()) return;
      const w = weight.trim();
      const r = reps.trim();
      const rr = rir.trim() || undefined;
      if (editingIndex != null) {
        // Saving a correction to an already-logged set (e.g. a mistyped weight).
        // Null out lastPayloadRef so the Retry button (if visible from a prior failed
        // new-set) doesn't re-submit the old new-set payload instead of this edit
        // (edit-set-weight-unit-bug). Also clear any visible retry toast.
        lastPayloadRef.current = null;
        setRetryToast(false);
        Promise.resolve(
          onUpdateSet?.(currentEx?.exerciseId ?? '', editingIndex, w, r, rr) as unknown,
        ).catch(() => setRetryToast(true));
        setEditingIndex(null);
        setWeight('');
        setReps('');
        setRir('');
        playLogConfirm();
        return; // an edit must not trigger the off-routine prompt
      }
      lastPayloadRef.current = { weight: w, reps: r, rir: rr };
      setRetryToast(false);
      Promise.resolve(
        onLogSet(currentEx?.exerciseId ?? '', w, r, rr) as unknown,
      ).catch(() => setRetryToast(true));
      setReps('');
      setRir('');
      // Keep weight pre-filled for the next set.
      playLogConfirm();
      // S1: suppress the local visual rest ring while a drop chain is active or
      // mid-superset-round (kept in lockstep with the parent's rest suppression).
      if (!restSuppressedAfterThisSet) setRestLeft(restTotal);
    }
    afterLogSet();
  }, [
    isCardio, cardioDurationMm, cardioDurationSs, cardioDistance, unitPref,
    onLogCardioSet, currentEx, weight, reps, rir, onLogSet, afterLogSet,
    editingIndex, onUpdateSet, playLogConfirm, restTotal, restSuppressedAfterThisSet,
    mHrAvg, mHrMax, mCalories, mCadence, mElevation, mRpe, mSplits, resetMoreMetrics,
  ]);

  // Retry the last failed lift save (option 14).
  const handleRetrySave = useCallback(() => {
    const p = lastPayloadRef.current;
    if (!p) { setRetryToast(false); return; }
    setRetryToast(false);
    Promise.resolve(
      onLogSet(currentEx?.exerciseId ?? '', p.weight, p.reps, p.rir) as unknown,
    ).catch(() => setRetryToast(true));
  }, [onLogSet, currentEx]);

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
    // Fix #3: advance to the next PENDING exercise (skip completed, wrap around);
    // null → every other exercise is done → finish. Replaces the literal
    // currentIndex + 1, which could land on an already-completed later exercise.
    if (nextPendingIdx == null) {
      onFinish();
    } else {
      onAdvance(nextPendingIdx);
      setWeight('');
      setReps('');
    }
  }, [nextPendingIdx, onAdvance, onFinish]);

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

  // ── Empty state (option 13): session has no exercises yet. ─────────────────
  if (!currentEx || exercises.length === 0) {
    return (
      // See the main render below — no top/bottom inset on the container; the
      // header row carries paddingTop: Math.max(insets.top, 12) so the close
      // control clears the Dynamic Island inside the hosting <Modal>.
      <SafeAreaView style={styles.root} edges={[]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close stepper"
          >
            <Ionicons name="chevron-down" size={20} color={stepperPalette.muted} />
          </TouchableOpacity>
          <Text style={styles.routineName} numberOfLines={1}>
            {isFreeLike ? 'Free session' : routineName}
          </Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="barbell-outline" size={32} color={stepperPalette.accent} />
          </View>
          <Text style={styles.emptyTitle}>No exercises yet</Text>
          <Text style={styles.emptySub}>
            Add your first exercise to start logging sets for this session.
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={onAddExercise ?? onBrowseLibrary}
            accessibilityRole="button"
            accessibilityLabel="Add exercise"
          >
            <Text style={styles.emptyCtaLabel}>＋ Add exercise</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const kicker = isFreeLike
    ? `EXERCISE ${currentIndex + 1} · NO ROUTINE`
    : isOffRoutine
      ? 'NOT IN ROUTINE'
      : `EXERCISE ${currentIndex + 1} OF ${exercises.length}`;

  const showInterstitial = variant === 'smart' && showSuggest;

  // ── Primary log/save action (P1a) ──────────────────────────────────────────
  // The reported bug: while typing weight/reps the keyboard pushed the in-scroll
  // "Log set" button off-screen, leaving only the sticky Continue / Select-
  // different actions visible. Fix: render this primary "Log set N" (or
  // "Save set N" in edit mode) as the TOP button of the sticky bottom actionBar
  // so it is ALWAYS visible directly above the keyboard. Keeps the existing
  // onPress (handleLogSet), the scale/check log animation, and the editingIndex
  // "Save set" copy. Cardio uses the same button (handleLogSet branches on
  // isCardio internally). Hidden during the smart-suggest interstitial.
  // S1: log-button label. Grouped → "Log set — <name> (A1)"; drop chain active →
  // "Log drop N"; else the plain "Log set N". Edit mode keeps "Save set N".
  const logSetLabelText =
    editingIndex != null
      ? `Save set ${editingIndex + 1}`
      : chainActive && dropChain
        ? `Log drop ${dropChain.nextDropIndex}`
        : groupInfo
          ? `Log set — ${currentEx?.name ?? ''} (${groupInfo.letter}${groupInfo.posInGroup})`
          : `Log set ${setNumber}`;
  const primaryLogButton = (
    <Animated.View style={logBtnStyle}>
      <TouchableOpacity
        style={styles.logSetBtn}
        onPress={handleLogSet}
        accessibilityRole="button"
        accessibilityLabel={logSetLabelText}
      >
        {justLoggedTick ? (
          <View style={styles.logSetConfirm}>
            <Ionicons name="checkmark" size={18} color={stepperPalette.accentInk} />
            <Text style={styles.logSetLabel}>Logged</Text>
          </View>
        ) : (
          <Text style={styles.logSetLabel} numberOfLines={1}>
            {logSetLabelText}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );

  // "Cancel edit" link — shown beneath the primary button only while correcting
  // an already-logged set (drives editingIndex back to null without saving).
  const cancelEditLink =
    editingIndex != null ? (
      <TouchableOpacity
        onPress={() => { setEditingIndex(null); setWeight(''); setReps(''); setRir(''); }}
        style={styles.cancelEditLink}
        accessibilityRole="button"
        accessibilityLabel="Cancel editing set"
      >
        <Text style={styles.cancelEditLabel}>Cancel edit</Text>
      </TouchableOpacity>
    ) : null;

  return (
    // CLAUDE.md #3: SafeAreaView's `top` edge does NOT reliably propagate inside
    // a <Modal> (this logger is hosted in one) — a prior "fix" added edges=['top']
    // here, which pushed the WHOLE page down yet still left the header jammed
    // under the Dynamic Island. Correct fix: no top inset on the container, and
    // apply paddingTop: Math.max(insets.top, 12) to the HEADER ROW only (below).
    // `bottom` is dropped too because the sticky actionBar already adds
    // Math.max(insets.bottom, …) — keeping it here would double-pad the bottom.
    <SafeAreaView style={styles.root} edges={[]}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      {...swipeResponder.panHandlers}
    >
      {/* ── Header (clears the status bar / Dynamic Island on its own row) ──── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
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
            {useProgressBar ? (
              <View style={styles.progressBarTrack} accessible accessibilityLabel={`Exercise ${currentIndex + 1} of ${exercises.length}`}>
                <Animated.View style={[styles.progressBarFill, barStyle]} />
              </View>
            ) : (
              <View style={styles.dotsRow}>
                {progressDots.map((done, i) => (
                  <View key={i} style={[styles.dot, done && styles.dotDone]} />
                ))}
              </View>
            )}
            <Text style={styles.progressLabel}>
              {currentIndex + 1} / {exercises.length}
            </Text>
          </>
        )}
        {/* TICKET-134: exercise details (muscle diagram + form cues) */}
        <TouchableOpacity
          onPress={() =>
            currentEx && setDetailTarget({ id: currentEx.exerciseId, name: currentEx.name })
          }
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${currentEx?.name ?? 'exercise'}`}
        >
          <Ionicons name="information-circle-outline" size={20} color={stepperPalette.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
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
            {/* S1: superset group pill ("SUPERSET A · ROUND r OF n") + the
                "paired with X, Y" line. Only shown when the current exercise is
                grouped (>= 2 members). Ungrouped → unchanged. */}
            {groupInfo ? (
              <View style={ssStyles.wrap}>
                <View style={ssStyles.pill}>
                  <Ionicons name="git-merge" size={13} color={stepperPalette.accentInk} />
                  <Text style={ssStyles.pillLabel}>
                    SUPERSET {groupInfo.letter} · ROUND {groupInfo.round} OF {groupInfo.rounds}
                  </Text>
                </View>
                {groupInfo.otherNames.length > 0 ? (
                  <Text style={ssStyles.pairedWith} numberOfLines={1}>
                    paired with {groupInfo.otherNames.join(', ')}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {/* P2: exercise name + compact muscle map (omitted when no groups,
                e.g. most cardio). MuscleMap pulls its highlight colour from the
                theme (accentDefault) so it stays theme-adaptive. */}
            <View style={styles.exHeaderRow}>
              <Text style={[styles.exName, styles.exNameFlex]}>{currentEx.name}</Text>
              {exMuscleGroups.length > 0 ? (
                <MuscleMap groups={exMuscleGroups} size={64} view={muscleView} sex={muscleSex} />
              ) : null}
            </View>

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

            {/* ── Per-exercise goal (WIDGET-002): single weight x reps target.
                Tap to edit; shows the trophy state once a logged set meets both
                targets. Hidden for cardio and off-routine placeholder slots. */}
            {!isCardio && (currentEx.exerciseId ?? '') !== '' && (
              goalEditing ? (
                <View style={goalStyles.card}>
                  <Text style={goalStyles.title}>GOAL — WEIGHT × REPS</Text>
                  <View style={goalStyles.editRow}>
                    <TextInput
                      style={goalStyles.input}
                      value={goalWeight}
                      onChangeText={setGoalWeight}
                      keyboardType="decimal-pad"
                      placeholder="weight"
                      placeholderTextColor={stepperPalette.muted}
                      accessibilityLabel="Goal weight"
                    />
                    <Text style={goalStyles.times}>×</Text>
                    <TextInput
                      style={goalStyles.input}
                      value={goalReps}
                      onChangeText={setGoalReps}
                      keyboardType="number-pad"
                      placeholder="reps"
                      placeholderTextColor={stepperPalette.muted}
                      accessibilityLabel="Goal reps"
                    />
                    <TouchableOpacity
                      onPress={handleSaveGoal}
                      accessibilityRole="button"
                      accessibilityLabel="Save goal"
                    >
                      <Text style={goalStyles.saveLabel}>Save</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={goalStyles.editActions}>
                    {goal ? (
                      <TouchableOpacity
                        onPress={handleRemoveGoal}
                        accessibilityRole="button"
                        accessibilityLabel="Remove goal"
                      >
                        <Text style={goalStyles.removeLabel}>Remove goal</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => setGoalEditing(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel goal editing"
                    >
                      <Text style={goalStyles.cancelLabel}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : goal ? (
                <TouchableOpacity
                  style={goalStyles.row}
                  onPress={() => {
                    // Prefill the edit field in DISPLAY units (stable round-trip).
                    setGoalWeight(kgToInputValue(goal.target_weight_kg, unitPref));
                    setGoalReps(String(goal.target_reps));
                    setGoalEditing(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    goal.achieved_at
                      ? `Goal achieved: ${kgToInputValue(goal.target_weight_kg, unitPref)} ${unitLabel} for ${goal.target_reps} reps. Tap to set a new goal.`
                      : `Goal: ${kgToInputValue(goal.target_weight_kg, unitPref)} ${unitLabel} for ${goal.target_reps} reps. Tap to edit.`
                  }
                >
                  <Text style={goal.achieved_at ? goalStyles.achievedText : goalStyles.rowText}>
                    {goal.achieved_at
                      ? `🏆 Goal achieved — ${kgToInputValue(goal.target_weight_kg, unitPref)} ${unitLabel} × ${goal.target_reps}`
                      : `🎯 Goal ${kgToInputValue(goal.target_weight_kg, unitPref)} ${unitLabel} × ${goal.target_reps}`}
                  </Text>
                  <Text style={goalStyles.editLabel}>{goal.achieved_at ? 'set new' : 'edit'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => { setGoalWeight(''); setGoalReps(''); setGoalEditing(true); }}
                  style={wuStyles.enableLink}
                  accessibilityRole="button"
                  accessibilityLabel="Set a weight and rep goal for this exercise"
                >
                  <Text style={wuStyles.enableLabel}>＋ Goal (optional)</Text>
                </TouchableOpacity>
              )
            )}

            {/* ── Warm-up ramp (founder 2026-06-10): per-exercise opt-in; weights/
                reps recommended from the previous top set; rows prefill the
                inputs and stay fully editable. Hidden once working sets begin. */}
            {!isCardio && currentExerciseSets.length === 0 && (
              wuEnabled ? (
                <Animated.View
                  style={wuStyles.card}
                  entering={reducedMotion ? undefined : FadeInDown.duration(220)}
                >
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
                </Animated.View>
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
                  <Animated.View
                    key={i}
                    entering={reducedMotion ? undefined : FadeIn.duration(180)}
                  >
                    <SetChip
                      set={s}
                      index={i}
                      unitPref={unitPref}
                      onPress={onUpdateSet ? () => handleEditChip(i) : undefined}
                      editing={editingIndex === i}
                      effortDisplay={effortDisplay}
                    />
                  </Animated.View>
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

                {/* ── Optional "More metrics" (P5): avg/max HR, calories,
                    cadence, elevation, RPE, splits. Collapsed by default behind
                    a "＋ More metrics" link (mirrors the lift RIR / warm-up
                    affordances) so the default cardio screen stays the simple
                    duration/distance flow. Every field is optional — leaving the
                    whole section blank logs no metrics. */}
                {showMoreMetrics ? (
                  <View style={moreStyles.card}>
                    <View style={moreStyles.headerRow}>
                      <Text style={moreStyles.title}>MORE METRICS — OPTIONAL</Text>
                      <TouchableOpacity
                        onPress={() => setShowMoreMetrics(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Hide more metrics"
                      >
                        <Text style={moreStyles.hideLink}>hide</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>AVG HR (BPM)</Text>
                        <TextInput
                          style={styles.input}
                          value={mHrAvg}
                          onChangeText={setMHrAvg}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={3}
                          selectTextOnFocus
                          accessibilityLabel="Average heart rate in beats per minute (optional)"
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>MAX HR (BPM)</Text>
                        <TextInput
                          style={styles.input}
                          value={mHrMax}
                          onChangeText={setMHrMax}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={3}
                          selectTextOnFocus
                          accessibilityLabel="Maximum heart rate in beats per minute (optional)"
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>CALORIES (KCAL)</Text>
                        <TextInput
                          style={styles.input}
                          value={mCalories}
                          onChangeText={setMCalories}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={5}
                          selectTextOnFocus
                          accessibilityLabel="Calories burned in kilocalories (optional)"
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>CADENCE (SPM)</Text>
                        <TextInput
                          style={styles.input}
                          value={mCadence}
                          onChangeText={setMCadence}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={3}
                          selectTextOnFocus
                          accessibilityLabel="Cadence in steps per minute (optional)"
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>ELEV GAIN (M)</Text>
                        <TextInput
                          style={styles.input}
                          value={mElevation}
                          onChangeText={setMElevation}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={6}
                          selectTextOnFocus
                          accessibilityLabel="Elevation gain in metres (optional)"
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>RPE (1–10)</Text>
                        <TextInput
                          style={styles.input}
                          value={mRpe}
                          onChangeText={setMRpe}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={2}
                          selectTextOnFocus
                          accessibilityLabel="Rate of perceived exertion, 1 to 10 (optional)"
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>SPLITS (PER {distanceLabel.toUpperCase()})</Text>
                        <TextInput
                          style={styles.input}
                          value={mSplits}
                          onChangeText={setMSplits}
                          keyboardType="numbers-and-punctuation"
                          placeholder="e.g. 5:10, 5:02, 4:58"
                          placeholderTextColor={stepperPalette.muted}
                          selectTextOnFocus
                          accessibilityLabel={`Lap or split times per ${distanceLabel}, comma separated (optional)`}
                        />
                      </View>
                    </View>
                    <Text style={moreStyles.hint}>
                      Splits: one per {distanceLabel}, mm:ss or seconds — all fields optional.
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowMoreMetrics(true)}
                    style={moreStyles.enableLink}
                    accessibilityRole="button"
                    accessibilityLabel="Add more cardio metrics: heart rate, calories, cadence, elevation, RPE, splits"
                  >
                    <Text style={moreStyles.enableLabel}>＋ More metrics (optional)</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              /* ── Lift inputs: large set readout + steppers (+ optional RIR) ── */
              <>
                {/* Large tabular working weight × reps (option 3) */}
                <View style={styles.bigReadoutRow}>
                  <Text style={styles.bigReadout} numberOfLines={1} adjustsFontSizeToFit>
                    {weight.trim() || '—'}
                    <Text style={styles.bigReadoutUnit}> {unitLabel} </Text>
                    <Text style={styles.bigReadoutTimes}>×</Text>
                    {' '}{reps.trim() || '—'}
                  </Text>
                </View>

                {/* Last-session ghost + one-tap copy (option 5) */}
                <View style={styles.ghostRow}>
                  {ghostLast ? (
                    <TouchableOpacity
                      onPress={copyLastSet}
                      style={styles.ghostBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Copy last session ${ghostLast.weightStr} ${unitLabel} for ${ghostLast.reps} reps`}
                    >
                      <Text style={styles.ghostText}>
                        last: {ghostLast.weightStr} {unitLabel} × {ghostLast.reps}
                      </Text>
                      <Ionicons name="copy-outline" size={13} color={stepperPalette.muted} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.ghostTextEmpty}>last: —</Text>
                  )}
                </View>

                <View style={styles.inputRow}>
                  <StepperControl
                    label="WEIGHT"
                    value={weight}
                    onChangeText={setWeight}
                    onStep={stepWeight}
                    keyboardType="decimal-pad"
                    placeholder={isBodyweightExercise(currentEx?.name) ? 'BW' : '—'}
                    accessibilityLabel="Weight"
                    unitSuffix={unitLabel}
                    maxLength={7}
                    rightAccessory={
                      <TouchableOpacity
                        onPress={() => setPlateCalcVisible(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Open plate and load calculator"
                      >
                        <Ionicons name="calculator-outline" size={16} color={stepperPalette.accent} />
                      </TouchableOpacity>
                    }
                  />
                  <StepperControl
                    label="REPS"
                    value={reps}
                    onChangeText={setReps}
                    onStep={stepReps}
                    keyboardType="number-pad"
                    placeholder="—"
                    accessibilityLabel="Reps"
                    maxLength={4}
                  />
                </View>

                {showRir ? (
                  <>
                    <View style={styles.inputRow}>
                      <View style={styles.rirGroup}>
                        <Text style={styles.inputLabel}>{rirFieldLabel}</Text>
                        <TextInput
                          style={styles.input}
                          value={rirInputValue}
                          onChangeText={handleRirInputChange}
                          keyboardType="number-pad"
                          placeholder="–"
                          placeholderTextColor={stepperPalette.muted}
                          selectTextOnFocus
                          accessibilityLabel={rirFieldAccessibilityLabel}
                        />
                      </View>
                    </View>
                    <Text style={styles.rirHint}>{rirFieldHint}</Text>
                  </>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowRir(true)}
                    style={styles.addRirLink}
                    accessibilityRole="button"
                    accessibilityLabel={effortDisplay === 'rpe' ? 'Add rate of perceived exertion' : 'Add reps in reserve'}
                  >
                    <Text style={styles.addRirLabel}>{addRirLinkLabel}</Text>
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

            {/* S1: "Superset with…" (ungrouped, >=1 other pending) / "Unlink
                superset" (grouped). Free feature — no Pro gating. Hidden entirely
                in history-edit mode (parent passes no callbacks then). */}
            {!isCardio && isGrouped && groupId && onUnlinkSuperset ? (
              <TouchableOpacity
                onPress={() => onUnlinkSuperset(groupId)}
                style={styles.altExerciseLink}
                accessibilityRole="button"
                accessibilityLabel="Unlink superset"
              >
                <Text style={styles.altExerciseLinkLabel}>Unlink superset</Text>
              </TouchableOpacity>
            ) : !isCardio && !isGrouped && onSupersetWith && hasOtherPending ? (
              <TouchableOpacity
                onPress={onSupersetWith}
                style={styles.altExerciseLink}
                accessibilityRole="button"
                accessibilityLabel="Superset with another exercise"
              >
                <Text style={styles.altExerciseLinkLabel}>Superset with…</Text>
              </TouchableOpacity>
            ) : null}

            {/* P1a: the primary "Log set N" / "Save set N" action now lives in the
                sticky bottom actionBar (always above the keyboard) — see
                `primaryLogButton` below. It is no longer rendered in-scroll so
                the keyboard can never push it out of view. */}
          </>
        )}
      </ScrollView>

      {/* ── S1: dropset chain bar (replaces the rest ring while chaining) ───── */}
      {chainActive && dropChain && onEndDropChain ? (
        <View style={styles.transientRow}>
          <DropChainBar
            links={dropChain.links}
            nextDropIndex={dropChain.nextDropIndex}
            nextDropWeightLabel={dropChain.nextDropWeightLabel}
            unitLabel={unitLabel}
            onLogDrop={handleLogSet}
            onDone={onEndDropChain}
          />
        </View>
      ) : null}

      {/* S1: "+ Drop set" starter — appears after a LIFT set is logged (no chain
          yet, not cardio, and the parent enabled dropsets). Works on ANY set even
          if nothing was prescribed. Tapping it starts a chain off the last set. */}
      {!chainActive && !isCardio && onStartDropChain && currentExerciseSets.length > 0 && editingIndex == null ? (
        <View style={styles.transientRow}>
          <TouchableOpacity
            onPress={onStartDropChain}
            style={ssStyles.dropStartBtn}
            accessibilityRole="button"
            accessibilityLabel="Add a drop set off the last set"
          >
            <Ionicons name="trending-down" size={16} color={SS_AMBER} />
            <Text style={ssStyles.dropStartLabel}>+ Drop set</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* ── Inline rest-timer ring (option 4) + retry toast (option 14) ─────── */}
      {(restLeft !== null && restLeft > 0) || retryToast ? (
        <View style={styles.transientRow}>
          {restLeft !== null && restLeft > 0 ? (
            <RestRing
              secondsLeft={restLeft}
              total={restTotal}
              onSkip={() => setRestLeft(null)}
              onAdd={() => setRestLeft((s) => (s == null ? s : s + 30))}
              reducedMotion={reducedMotion}
            />
          ) : null}
          {retryToast ? (
            <Animated.View
              entering={reducedMotion ? undefined : FadeInDown.duration(180)}
              style={styles.retryToast}
            >
              <Text style={styles.retryToastText} numberOfLines={1}>Couldn&apos;t save</Text>
              <TouchableOpacity
                onPress={handleRetrySave}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Retry saving the set"
              >
                <Text style={styles.retryToastBtn}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRetryToast(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.retryToastDismiss}>×</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {/* ── Bottom action bar — varies by variant / sub-state (sticky, option 12) ──
          P1a: the PRIMARY action ("Log set N" / "Save set N") is now the top
          button of this sticky bar across every logging variant, so it stays
          visible directly above the keyboard while the user types. Continue /
          Add-next / Done / Select-different are demoted to secondary (outline)
          beneath it. The smart-suggest interstitial is the one exception — it
          is past logging, so it keeps Continue / Select-different only. */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s2 }]}>
        {variant === 'free' ? (
          <>
            {primaryLogButton}
            {cancelEditLink}
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={onAddNextExercise}
              accessibilityRole="button"
              accessibilityLabel="Add next exercise"
            >
              <Text style={styles.switchBtnLabel}>＋ Add next exercise</Text>
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
              {primaryLogButton}
              {cancelEditLink}
              <TouchableOpacity
                style={[styles.switchBtn, currentExerciseSets.length === 0 && styles.btnDisabled]}
                onPress={handleDoneSeeNext}
                disabled={currentExerciseSets.length === 0}
                accessibilityRole="button"
                accessibilityLabel="Done, see what's next"
              >
                <Text style={styles.switchBtnLabel}>
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
          plannedComplete && editingIndex == null ? (
            /* Fix #4: planned sets complete → PRIMARY becomes the advance action
               ("Next exercise: <name>" / "Finish workout"), and the extra-set
               "Log set N" demotes to the secondary slot. Both stay accessible. */
            <>
              <TouchableOpacity
                style={styles.logSetBtn}
                onPress={handleContinue}
                accessibilityRole="button"
                accessibilityLabel={advanceLabel}
              >
                <Text style={styles.logSetLabel} numberOfLines={1}>
                  {nextPendingEx ? `${advanceLabel} →` : advanceLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={handleLogSet}
                accessibilityRole="button"
                accessibilityLabel={`Log an extra set, set ${setNumber}`}
              >
                <Text style={styles.switchBtnLabel}>{`Log set ${setNumber}`}</Text>
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
            {primaryLogButton}
            {cancelEditLink}
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel={nextPendingEx ? `Continue to ${nextPendingEx.name}` : 'Finish workout'}
            >
              <Text style={styles.switchBtnLabel}>
                {nextPendingEx ? `Continue to ${nextPendingEx.name} →` : 'Finish workout'}
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

      {/* ── TICKET-134: exercise detail sheet (muscle diagram + cues) ───────── */}
      <ExerciseDetailSheet
        visible={detailTarget !== null}
        exercise={detailTarget}
        onClose={() => setDetailTarget(null)}
      />
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Goal styles (WIDGET-002) ─────────────────────────────────────────────────

const goalStyles = StyleSheet.create({
  card: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  title: {
    color: stepperPalette.muted,
    fontSize: fontSize.micro,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.s2,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  input: {
    flex: 1,
    color: stepperPalette.text,
    fontSize: fontSize.bodyMd,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s2,
    minHeight: 44,
  },
  times: {
    color: stepperPalette.muted,
    fontSize: fontSize.bodyMd,
  },
  saveLabel: {
    color: stepperPalette.accent,
    fontSize: fontSize.bodySm,
    fontWeight: '600',
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s2,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.s4,
    marginTop: spacing.s2,
  },
  removeLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
  },
  cancelLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s3,
    minHeight: 44,
  },
  rowText: {
    color: stepperPalette.text,
    fontSize: fontSize.bodySm,
    fontWeight: '600',
  },
  achievedText: {
    color: stepperPalette.accent,
    fontSize: fontSize.bodySm,
    fontWeight: '600',
  },
  editLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
  },
});

// ── Optional cardio "More metrics" styles (P5) ──────────────────────────────

const moreStyles = StyleSheet.create({
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
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  title: {
    color: stepperPalette.muted,
    fontSize: fontSize.micro,
    fontWeight: '600',
    letterSpacing: 1,
  },
  hideLink: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
  },
  hint: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
    marginTop: spacing.s1,
  },
  enableLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.s1,
    marginBottom: spacing.s2,
  },
  enableLabel: {
    color: stepperPalette.accent,
    fontSize: fontSize.bodySm,
    fontWeight: '600',
  },
});

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
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    gap: spacing.s3,
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.accent,
  },
  // Empty state (option 13)
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
    gap: spacing.s3,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s2,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.heading3,
    color: stepperPalette.text,
  },
  emptySub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    textAlign: 'center',
    marginBottom: spacing.s3,
  },
  emptyCta: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s6,
    minHeight: 48,
    justifyContent: 'center',
  },
  emptyCtaLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },
  // Large tabular set readout (option 3)
  bigReadoutRow: {
    alignItems: 'center',
    marginBottom: spacing.s1,
  },
  bigReadout: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.display,
    color: stepperPalette.text,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  bigReadoutUnit: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.heading3,
    color: stepperPalette.muted,
  },
  bigReadoutTimes: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.heading2,
    color: stepperPalette.muted,
  },
  // Last-session ghost (option 5)
  ghostRow: {
    alignItems: 'center',
    marginBottom: spacing.s3,
    minHeight: 28,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s2,
  },
  ghostText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    opacity: 0.85,
    fontVariant: ['tabular-nums'],
  },
  ghostTextEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    opacity: 0.5,
  },
  // Transient row above the action bar (rest ring + retry toast)
  transientRow: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s2,
    gap: spacing.s2,
  },
  retryToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 44,
  },
  retryToastText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.text,
  },
  retryToastBtn: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
  },
  retryToastDismiss: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
    lineHeight: 22,
    color: stepperPalette.muted,
  },
  logSetConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
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
  // P2: exercise name + compact muscle map share one row; the row carries the
  // bottom margin so the name and map stay vertically centred together.
  exHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  exNameFlex: {
    flex: 1,
    marginBottom: 0,
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

// ── S1 superset / dropset styles ────────────────────────────────────────────
const SS_AMBER = '#F59E0B';
const ssStyles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: stepperPalette.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillLabel: {
    color: stepperPalette.accentInk,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginLeft: 5,
  },
  pairedWith: {
    color: stepperPalette.muted,
    fontSize: 12,
    marginTop: 4,
  },
  dropStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: SS_AMBER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
  },
  dropStartLabel: {
    color: SS_AMBER,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
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

// ── Inline rest-timer ring styles (option 4) ─────────────────────────────────

const restRingStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 56,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    justifyContent: 'center',
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.text,
    fontVariant: ['tabular-nums'],
  },
  sub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.micro,
    color: stepperPalette.muted,
  },
  addBtn: {
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    minHeight: 44,
    justifyContent: 'center',
  },
  addLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
  },
});

// ── Big -/+ stepper control styles (option 2) ────────────────────────────────

const stepperCtl = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  btn: {
    width: 44,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    minHeight: 56,
    minWidth: 72,
    paddingHorizontal: spacing.s2,
  },
  field: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: stepperPalette.text,
    textAlign: 'center',
    padding: 0,
  },
  unit: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    paddingRight: spacing.s1,
  },
});
