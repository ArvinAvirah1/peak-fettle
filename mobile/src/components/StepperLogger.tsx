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
import { getEffortDisplay, EffortDisplay, getGroupRestMode, GroupRestMode } from '../data/appSettings';
// S1 dropset chain UI (amber chips + drop actions) — owns its own presentation.
import DropChainBar, { type DropChainLink } from './logger/DropChainBar';
// TICKET-144: EMOM / AMRAP / interval conditioning timer, attachable to a
// cardio-type exercise. Owns its own sheet UI + safe-area handling; results
// flow back through the existing onLogCardioSet prop (no new plumbing).
import { ConditioningTimerSheet, resultToCardioMetrics } from './logger/ConditioningTimerSheet';
import type { ConditioningConfig, ConditioningResult } from './logger/conditioningTimerLogic';
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
// TICKET-141: in-session autoregulation suggestions — deterministic rule
// module (FROZEN, not edited by this ticket) + the local history/target
// assembly layer. Zero network on any tier (see autoregHistory.ts header).
import { getAutoregSuggestionsEnabled } from '../data/appSettings';
import { isAutoregMuted, setAutoregMuted } from '../data/exercisePrefs';
import { getAutoregContext } from '../data/autoregHistory';
import { suggestNextLoad, AutoregSuggestion } from '../lib/trainingEngine/v2/autoregulation';
import AutoregStrip from './logger/AutoregStrip';
import { useTranslation } from 'react-i18next';

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
  /**
   * TICKET-129: durable set id, present ONLY when this chip maps to an
   * already-persisted row (e.g. history-edit sessions seeded from a past
   * workout). Undefined for a set logged earlier in the CURRENT live session
   * that hasn't round-tripped an id back yet — the note/flag affordance is
   * hidden for those (onOpenSetNote is only invoked with a defined id).
   */
  id?: string;
  /** TICKET-129: existing note text, if any (drives the chip's note dot). */
  note?: string | null;
  /** TICKET-129: existing flag bitmask, if any (drives the chip's note dot). */
  flags?: number;
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
   * End the workout EARLY — before every routine exercise is complete (e.g. the
   * user has to leave). Routes to the same confirm → finish-and-save flow as
   * finishing normally, so whatever has been logged is kept. Rendered as an
   * always-available "End" control in the header. Undefined in history-edit mode
   * (there is no live workout to end).
   */
  onEndWorkout?: () => void;
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
  /**
   * TICKET-129: open the note/flags sheet for an already-persisted set (long-
   * press on its chip). Only invoked for chips whose `LoggedSet.id` is defined
   * — a set logged earlier in the CURRENT live session may not have round-
   * tripped an id yet, so the affordance is hidden for those (see SetChip).
   * The caller owns persistence (mobile/src/data/setNotes.ts) and re-supplies
   * updated `note`/`flags` via the next currentExerciseSets render.
   */
  onOpenSetNote?: (setId: string, index: number) => void;
  /**
   * TICKET-141: suppress the autoregulation suggestion strip entirely (e.g.
   * WorkoutLoggerHost's history-edit mode, where the user is CORRECTING a
   * past logged set rather than about to log a new one — suggesting a
   * 'next load' makes no sense there). Defaults to false (strip may render,
   * subject to its own enabled/mute/dismiss gates).
   */
  suppressAutoregSuggestions?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SetChip({
  set,
  index,
  unitPref,
  onPress,
  onLongPress,
  editing,
  effortDisplay = 'rir',
}: {
  set: LoggedSet;
  index: number;
  unitPref?: 'kg' | 'lbs';
  onPress?: () => void;
  /** TICKET-129: long-press opens the note/flags sheet for this set (needs set.id). */
  onLongPress?: () => void;
  editing?: boolean;
  /** TICKET-128: RIR ⇄ RPE display toggle. Storage is unaffected either way. */
  effortDisplay?: EffortDisplay;
}) {
  const { t } = useTranslation();
  let label: string;
  if (set.durationSec != null) {
    // Cardio chip: "Set 1 · 22:30 · 5.0 km"
    const mm = Math.floor(set.durationSec / 60);
    const ss = set.durationSec % 60;
    const durStr = `${mm}:${String(ss).padStart(2, '0')}`;
    let distStr = '';
    if (set.distanceM != null) {
      if (unitPref === 'lbs') {
        distStr = t('logger:setChip.distanceMi', { value: (set.distanceM / 1609.344).toFixed(2) });
      } else {
        distStr = t('logger:setChip.distanceKm', { value: (set.distanceM / 1000).toFixed(2) });
      }
    }
    label = t('logger:setChip.cardioLabel', { index: index + 1, duration: `${durStr}${distStr}` });
  } else {
    const rirNum = set.rir != null && set.rir !== '' ? parseInt(set.rir, 10) : null;
    // formatEffort is the single pure helper (loggerLogic.ts) — "to failure" /
    // "RIR N" / "RPE N" / "RPE ≤ 5" all derive from the SAME stored rirNum, so
    // the chip text changes with the setting but the underlying value never does.
    const effort = formatEffort(rirNum, effortDisplay);
    const rirLabel = effort ? ` · ${effort}` : '';
    label = t('logger:setChip.liftLabel', { index: index + 1, weight: set.weight, reps: set.reps, effort: rirLabel });
  }
  // TICKET-129: a small dot suffix when this set already has a note/flags, so
  // the chip communicates "there's an annotation here" without opening the sheet.
  const hasAnnotation = (set.note != null && set.note !== '') || (set.flags != null && set.flags !== 0);
  const annotationSuffix = hasAnnotation ? ' 📝' : '';
  // Lift sets are tappable (to correct a mistyped value); cardio sets are not.
  const editable = !!onPress && set.durationSec == null;
  const noteable = !!onLongPress && set.id != null;
  if (editable) {
    return (
      <TouchableOpacity
        style={[chipStyles.chip, editing && chipStyles.chipEditing]}
        onPress={onPress}
        onLongPress={noteable ? onLongPress : undefined}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={
          noteable
            ? t('logger:setChip.editNoteableA11y', { index: index + 1 })
            : t('logger:setChip.editA11y', { index: index + 1 })
        }
      >
        <Text style={[chipStyles.label, editing && chipStyles.labelEditing]}>{label}{annotationSuffix}  ✎</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={[chipStyles.chip, editing && chipStyles.chipEditing]}>
      <Text style={[chipStyles.label, editing && chipStyles.labelEditing]}>{label}{annotationSuffix}</Text>
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
 * TICKET-141: a lightweight LOCAL fallback equipment guess (used only until
 * getAutoregContext's own resolveAutoregEquipment lookup resolves — see
 * data/autoregHistory.ts, which is the source of truth and runs the same
 * bodyweight-name heuristic plus a static-catalog lookup). Kept here too so
 * the effect has an equipment value on the very first render before the
 * async context resolves, avoiding a one-frame 'barbell default' flash for
 * obviously-bodyweight movements.
 */
function resolveEquipmentForAutoreg(name?: string): 'bodyweight' | 'other' {
  return isBodyweightExercise(name) ? 'bodyweight' : 'other';
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
function topSetLabel(sets: LoggedSet[], t: (key: string, opts?: Record<string, unknown>) => string): string {
  const first = sets[0];
  if (!first) return '';
  let best = first;
  for (const s of sets) {
    if ((parseFloat(s.weight) || 0) > (parseFloat(best.weight) || 0)) best = s;
  }
  return t('logger:topSetLabel.summary', { count: sets.length, weight: best.weight, reps: best.reps });
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
  const { t } = useTranslation();
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
        accessibilityLabel={t('logger:restRing.restingA11y', { label })}
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
          <Text style={restRingStyles.label}>{t('logger:restRing.restLabel', { label })}</Text>
          <Text style={restRingStyles.sub}>{t('logger:restRing.tapToSkip')}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={restRingStyles.addBtn}
        onPress={onAdd}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('logger:restRing.add30SecA11y')}
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
  const { t } = useTranslation();
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
          accessibilityLabel={t('logger:stepperControl.decreaseA11y', { label: accessibilityLabel })}
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
          accessibilityLabel={t('logger:stepperControl.increaseA11y', { label: accessibilityLabel })}
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
  onEndWorkout,
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
  onOpenSetNote,
  suppressAutoregSuggestions = false,
}: Props): React.ReactElement {
  const { t } = useTranslation();
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

  // TICKET-144 acceptance criterion 2: grouped-set rest mode ('after_round'
  // default vs 'after_exercise'). Same local-only KV read shape as
  // effortDisplay above — loaded ONCE per mount (not the boot path; this
  // component only mounts for an active workout session) and passed into the
  // pure restAfterSet predicate below so the LOCAL visual rest ring stays in
  // lockstep with the host's actual rest-timer firing decision (spec §3: one
  // predicate, same mode, both places).
  const [groupRestMode, setGroupRestModeState] = useState<GroupRestMode>('after_round');
  useEffect(() => {
    let cancelled = false;
    getGroupRestMode()
      .then((mode) => { if (!cancelled) setGroupRestModeState(mode); })
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

  // TICKET-144: conditioning timer sheet (EMOM/AMRAP/interval), attachable to
  // the current cardio-type exercise. Local UI state only — the sheet's
  // "Log set" result is handed to onLogCardioSet exactly like a manually-typed
  // duration, so it goes through the same local-first / tier-symmetric path.
  const [showConditioningTimer, setShowConditioningTimer] = useState(false);

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

  // ── TICKET-141: in-session autoregulation suggestions ────────────────────
  // Computed for the CURRENT exercise only, on exercise-change/mount — never
  // per keystroke (the effect's dep list is currentEx?.exerciseId plus the
  // enabled/mute gates, NOT weight/reps/rir). `now` is captured ONCE at the
  // moment of computation (a UI-event-adjacent read, same pattern as the rest
  // timer) and passed into the pure rule as a parameter — the rule itself
  // never reads the clock (CLAUDE.md Workflow lint).
  const [autoregEnabled, setAutoregEnabledState] = useState(false);
  const [autoregSuggestion, setAutoregSuggestion] = useState<AutoregSuggestion | null>(null);
  // Session-local dismiss set (NOT persisted — reappears next time this
  // exercise is logged in a future session). Keyed by exerciseId.
  const autoregDismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getAutoregSuggestionsEnabled()
      .then((enabled) => { if (!cancelled) setAutoregEnabledState(enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const id = currentEx?.exerciseId;
    const name = currentEx?.name;
    if (!autoregEnabled || !id || !name || isCardio || suppressAutoregSuggestions) {
      setAutoregSuggestion(null);
      return;
    }
    if (autoregDismissedRef.current.has(id)) {
      setAutoregSuggestion(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const muted = await isAutoregMuted(id);
        if (cancelled || muted) {
          if (!cancelled) setAutoregSuggestion(null);
          return;
        }
        const equipmentGuess = resolveEquipmentForAutoreg(name);
        const ctx = await getAutoregContext(id, name, currentEx?.targetReps ?? null);
        if (cancelled) return;
        const nowIso = new Date().toISOString(); // UI-event-adjacent clock read (see comment above)
        const suggestion = suggestNextLoad(ctx.history, ctx.targets, {
          unitPref,
          equipment: ctx.equipment ?? equipmentGuess,
          effortDisplay,
          now: nowIso,
        });
        if (!cancelled) setAutoregSuggestion(suggestion);
      } catch {
        if (!cancelled) setAutoregSuggestion(null);
      }
    })();
    return () => { cancelled = true; };
  }, [autoregEnabled, currentEx?.exerciseId, currentEx?.name, currentEx?.targetReps, isCardio, unitPref, effortDisplay, suppressAutoregSuggestions]);

  const handleAutoregApply = useCallback((suggestedKg: number) => {
    setWeight(kgToInputValue(suggestedKg, unitPref));
  }, [unitPref]);

  const handleAutoregDismiss = useCallback(() => {
    const id = currentEx?.exerciseId;
    if (id) autoregDismissedRef.current.add(id);
    setAutoregSuggestion(null);
  }, [currentEx?.exerciseId]);

  const handleAutoregMute = useCallback(() => {
    const id = currentEx?.exerciseId;
    if (id) setAutoregMuted(id, true).catch(() => {});
    setAutoregSuggestion(null);
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
  const advanceLabel = nextPendingEx ? t('logger:stepperLogger.advanceNextExercise', { name: nextPendingEx.name }) : t('logger:stepperLogger.finishWorkoutLabel');
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
    return !restAfterSet(snapshot, currentIndex, groupRestMode);
  }, [chainActive, isGrouped, routineSession, exercises, currentIndex, currentExerciseSets.length, groupRestMode]);

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
  const rirFieldLabel = effortDisplay === 'rpe' ? t('logger:stepperLogger.rirLabelRpe') : t('logger:stepperLogger.rirLabelRir');
  const rirFieldAccessibilityLabel =
    effortDisplay === 'rpe' ? t('logger:stepperLogger.rirA11yRpe') : t('logger:stepperLogger.rirA11yRir');
  const rirFieldHint =
    effortDisplay === 'rpe' ? t('logger:stepperLogger.rirHintRpe') : t('logger:stepperLogger.rirHintRir');
  const addRirLinkLabel = effortDisplay === 'rpe' ? t('logger:stepperLogger.addRpeLabel') : t('logger:stepperLogger.addRirLabel');

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

  // TICKET-144: conditioning timer finished (or was stopped early) — log it as
  // a normal cardio set. durationSec comes straight from the pure result
  // (already clamped to the plan's total by buildConditioningResult); rounds
  // (when meaningful) ride metrics_json.extras.conditioningRounds, matching
  // the existing drop/superset metrics_json convention (no server sets.reps
  // column exists on cardio rows, so this is the only place "reps=rounds" can
  // land — see conditioningTimerLogic.ts / ConditioningTimerSheet.tsx headers).
  const handleConditioningFinish = useCallback(
    (result: ConditioningResult, config: ConditioningConfig) => {
      setShowConditioningTimer(false);
      if (result.durationSec <= 0) return; // nothing to log (immediate abandon)
      if (onLogCardioSet) {
        Promise.resolve(
          onLogCardioSet(
            currentEx?.exerciseId ?? '',
            result.durationSec,
            undefined,
            undefined,
            resultToCardioMetrics(result, config),
          ) as unknown,
        ).catch(() => setRetryToast(true));
      }
      playLogConfirm();
      if (!restSuppressedAfterThisSet) setRestLeft(restTotal);
      afterLogSet();
    },
    [onLogCardioSet, currentEx, playLogConfirm, restSuppressedAfterThisSet, restTotal, afterLogSet],
  );

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
            accessibilityLabel={t('logger:stepperLogger.closeStepperA11y')}
          >
            <Ionicons name="chevron-down" size={20} color={stepperPalette.muted} />
          </TouchableOpacity>
          <Text style={styles.routineName} numberOfLines={1}>
            {isFreeLike ? t('logger:stepperLogger.freeSessionName') : routineName}
          </Text>
        </View>
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="barbell-outline" size={32} color={stepperPalette.accent} />
          </View>
          <Text style={styles.emptyTitle}>{t('logger:stepperLogger.noExercisesTitle')}</Text>
          <Text style={styles.emptySub}>
            {t('logger:stepperLogger.noExercisesBody')}
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={onAddExercise ?? onBrowseLibrary}
            accessibilityRole="button"
            accessibilityLabel={t('logger:stepperLogger.addExerciseA11y')}
          >
            <Text style={styles.emptyCtaLabel}>{t('logger:stepperLogger.addExerciseLabel')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const kicker = isFreeLike
    ? t('logger:stepperLogger.kickerFreeLike', { index: currentIndex + 1 })
    : isOffRoutine
      ? t('logger:stepperLogger.kickerOffRoutine')
      : t('logger:stepperLogger.kickerRoutine', { index: currentIndex + 1, total: exercises.length });

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
      ? t('logger:stepperLogger.saveSetLabel', { number: editingIndex + 1 })
      : chainActive && dropChain
        ? t('logger:stepperLogger.logDropLabel', { index: dropChain.nextDropIndex })
        : groupInfo
          ? t('logger:stepperLogger.logSetGroupLabel', {
              name: currentEx?.name ?? '',
              group: `${groupInfo.letter}${groupInfo.posInGroup}`,
            })
          : t('logger:stepperLogger.logSetLabel', { number: setNumber });
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
            <Text style={styles.logSetLabel}>{t('logger:setChip.logged')}</Text>
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
        accessibilityLabel={t('logger:stepperLogger.cancelEditingSetA11y')}
      >
        <Text style={styles.cancelEditLabel}>{t('logger:stepperLogger.cancelEdit')}</Text>
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
          accessibilityLabel={t('logger:stepperLogger.closeStepperA11y')}
        >
          <Ionicons name="chevron-down" size={20} color={stepperPalette.muted} />
        </TouchableOpacity>

        {isFreeLike ? (
          <>
            <Text style={styles.routineName} numberOfLines={1}>
              {weekNumber != null && !isNaN(weekNumber) && weekNumber > 0
                ? t('logger:stepperLogger.freeSessionWithWeek', { week: weekNumber })
                : t('logger:stepperLogger.freeSessionName')}
            </Text>
            <Text style={styles.progressLabel}>
              {t('logger:stepperLogger.setsLoggedCount', { count: totalLogged })}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.routineName} numberOfLines={1}>
              {weekNumber != null && !isNaN(weekNumber) && weekNumber > 0
                ? t('logger:stepperLogger.routineNameWithWeek', { name: routineName, week: weekNumber })
                : routineName}
            </Text>
            {useProgressBar ? (
              <View style={styles.progressBarTrack} accessible accessibilityLabel={t('logger:stepperLogger.exerciseOfA11y', { current: currentIndex + 1, total: exercises.length })}>
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
              {t('logger:stepperLogger.progressFraction', { current: currentIndex + 1, total: exercises.length })}
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
          accessibilityLabel={t('logger:stepperLogger.viewDetailsA11y', { name: currentEx?.name ?? t('logger:stepperLogger.exerciseFallback') })}
        >
          <Ionicons name="information-circle-outline" size={20} color={stepperPalette.muted} />
        </TouchableOpacity>
        {/* End the workout early (leave before the routine is finished). Goes
            through the same confirm → finish-and-save flow, so logged sets are
            kept. Hidden in history-edit mode (no live workout). */}
        {onEndWorkout ? (
          <TouchableOpacity
            onPress={onEndWorkout}
            style={styles.endBtn}
            accessibilityRole="button"
            accessibilityLabel={t('logger:stepperLogger.endWorkoutA11y')}
          >
            <Text style={styles.endBtnLabel}>{t('logger:stepperLogger.endWorkoutLabel')}</Text>
          </TouchableOpacity>
        ) : null}
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
            <Text style={styles.exLabel}>{t('logger:stepperLogger.justLogged')}</Text>
            <Text style={styles.exName}>{currentEx.name}</Text>

            {currentExerciseSets.length > 0 && (
              <View style={[chipStyles.chip, styles.summaryChip]}>
                <Text style={chipStyles.label}>{topSetLabel(currentExerciseSets, t)}</Text>
              </View>
            )}

            {activeSug ? (
              <>
                {/* Primary suggestion card */}
                <View style={styles.suggestionCard}>
                  <View style={styles.suggestionCardTop}>
                    <View style={styles.suggestionPill}>
                      <Text style={styles.suggestionPillLabel}>{t('logger:stepperLogger.suggestedNext')}</Text>
                    </View>
                    <Text style={styles.suggestionReason} numberOfLines={1}>
                      {activeSug.reason}
                    </Text>
                  </View>
                  <Text style={styles.suggestionName}>{activeSug.name}</Text>
                  {(activeSug.pbLabel || (activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget) ? (
                    <Text style={styles.suggestionPb}>
                      {activeSug.pbLabel ? t('logger:stepperLogger.pbPrefix', { value: activeSug.pbLabel }) : ''}
                      {activeSug.pbLabel && (activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget ? ' · ' : ''}
                      {(activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget
                        ? t('logger:stepperLogger.aimReps', { target: (activeSug as SuggestCandidate & { repTarget?: string | null }).repTarget })
                        : ''}
                    </Text>
                  ) : null}
                </View>

                {/* Ranked alternatives — "enumerate more" */}
                {sugList.length > 1 && (
                  <>
                    <Text style={styles.altLabel}>{t('logger:stepperLogger.orTry')}</Text>
                    {sugList
                      .filter((s) => s.exerciseId !== activeSug.exerciseId)
                      .map((s) => (
                        <TouchableOpacity
                          key={s.exerciseId || s.name}
                          style={styles.altRow}
                          onPress={() => setSelectedSug(s)}
                          accessibilityRole="button"
                          accessibilityLabel={t('logger:stepperLogger.chooseInsteadA11y', { name: s.name })}
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
                {t('logger:stepperLogger.allCaughtUp')}
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
                    {t('logger:stepperLogger.supersetPill', { letter: groupInfo.letter, round: groupInfo.round, rounds: groupInfo.rounds })}
                  </Text>
                </View>
                {groupInfo.otherNames.length > 0 ? (
                  <Text style={ssStyles.pairedWith} numberOfLines={1}>
                    {t('logger:stepperLogger.pairedWith', { names: groupInfo.otherNames.join(', ') })}
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
                    {pbLabel ? t('logger:stepperLogger.pbPrefix', { value: pbLabel }) : ''}
                    {pbLabel && repTarget ? ' · ' : ''}
                    {repTarget ? t('logger:stepperLogger.aimRepsTarget', { target: repTarget }) : ''}
                  </Text>
                ) : null}
                {lastSessionLabel ? (
                  <Text style={wuStyles.lastSessionText}>{t('logger:stepperLogger.lastSession', { value: lastSessionLabel })}</Text>
                ) : null}
              </View>
            )}

            {/* TICKET-141: suggestion strip renders for the CURRENT exercise
                only, computed on-device (see the effect above). Null suggestion
                (disabled/muted/dismissed/no history) renders nothing. */}
            {!isCardio && (
              <AutoregStrip
                suggestion={autoregSuggestion}
                unitPref={unitPref}
                onApply={handleAutoregApply}
                onDismiss={handleAutoregDismiss}
                onMute={handleAutoregMute}
              />
            )}

            {/* ── Per-exercise goal (WIDGET-002): single weight x reps target.
                Tap to edit; shows the trophy state once a logged set meets both
                targets. Hidden for cardio and off-routine placeholder slots. */}
            {!isCardio && (currentEx.exerciseId ?? '') !== '' && (
              goalEditing ? (
                <View style={goalStyles.card}>
                  <Text style={goalStyles.title}>{t('logger:stepperLogger.goalTitle')}</Text>
                  <View style={goalStyles.editRow}>
                    <TextInput
                      style={goalStyles.input}
                      value={goalWeight}
                      onChangeText={setGoalWeight}
                      keyboardType="decimal-pad"
                      placeholder={t('logger:stepperLogger.goalWeightPlaceholder')}
                      placeholderTextColor={stepperPalette.muted}
                      accessibilityLabel={t('logger:stepperLogger.goalWeightA11y')}
                    />
                    <Text style={goalStyles.times}>×</Text>
                    <TextInput
                      style={goalStyles.input}
                      value={goalReps}
                      onChangeText={setGoalReps}
                      keyboardType="number-pad"
                      placeholder={t('logger:stepperLogger.goalRepsPlaceholder')}
                      placeholderTextColor={stepperPalette.muted}
                      accessibilityLabel={t('logger:stepperLogger.goalRepsA11y')}
                    />
                    <TouchableOpacity
                      onPress={handleSaveGoal}
                      accessibilityRole="button"
                      accessibilityLabel={t('logger:stepperLogger.saveGoalA11y')}
                    >
                      <Text style={goalStyles.saveLabel}>{t('logger:stepperLogger.save')}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={goalStyles.editActions}>
                    {goal ? (
                      <TouchableOpacity
                        onPress={handleRemoveGoal}
                        accessibilityRole="button"
                        accessibilityLabel={t('logger:stepperLogger.removeGoalA11y')}
                      >
                        <Text style={goalStyles.removeLabel}>{t('logger:stepperLogger.removeGoal')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => setGoalEditing(false)}
                      accessibilityRole="button"
                      accessibilityLabel={t('logger:stepperLogger.cancelGoalEditingA11y')}
                    >
                      <Text style={goalStyles.cancelLabel}>{t('logger:stepperLogger.cancel')}</Text>
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
                      ? t('logger:stepperLogger.goalAchievedA11y', {
                          weight: kgToInputValue(goal.target_weight_kg, unitPref),
                          unit: unitLabel,
                          reps: goal.target_reps,
                        })
                      : t('logger:stepperLogger.goalEditA11y', {
                          weight: kgToInputValue(goal.target_weight_kg, unitPref),
                          unit: unitLabel,
                          reps: goal.target_reps,
                        })
                  }
                >
                  <Text style={goal.achieved_at ? goalStyles.achievedText : goalStyles.rowText}>
                    {goal.achieved_at
                      ? t('logger:stepperLogger.goalAchievedLabel', {
                          weight: kgToInputValue(goal.target_weight_kg, unitPref),
                          unit: unitLabel,
                          reps: goal.target_reps,
                        })
                      : t('logger:stepperLogger.goalLabel', {
                          weight: kgToInputValue(goal.target_weight_kg, unitPref),
                          unit: unitLabel,
                          reps: goal.target_reps,
                        })}
                  </Text>
                  <Text style={goalStyles.editLabel}>{goal.achieved_at ? t('logger:stepperLogger.setNew') : t('logger:stepperLogger.edit')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => { setGoalWeight(''); setGoalReps(''); setGoalEditing(true); }}
                  style={wuStyles.enableLink}
                  accessibilityRole="button"
                  accessibilityLabel={t('logger:stepperLogger.setGoalA11y')}
                >
                  <Text style={wuStyles.enableLabel}>{t('logger:stepperLogger.addGoalLabel')}</Text>
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
                    <Text style={wuStyles.title}>{t('logger:stepperLogger.warmup')}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        const idx = WARMUP_SET_CHOICES.indexOf(wuSets);
                        const next = WARMUP_SET_CHOICES[(idx + 1) % WARMUP_SET_CHOICES.length] ?? 3;
                        setWuSets(next);
                        persistWuPrefs(true, next);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('logger:stepperLogger.changeWarmupSetsA11y')}
                    >
                      <Text style={wuStyles.setsToggle}>{t('logger:stepperLogger.warmupSetsToggle', { count: wuSets })}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { setWuEnabled(false); persistWuPrefs(false, wuSets); }}
                      accessibilityRole="button"
                      accessibilityLabel={t('logger:stepperLogger.warmupOffA11y')}
                    >
                      <Text style={wuStyles.offLink}>{t('logger:stepperLogger.off')}</Text>
                    </TouchableOpacity>
                  </View>
                  {warmupPlan.length > 0 ? (
                    warmupPlan.map((w, i) => (
                      <TouchableOpacity
                        key={i}
                        style={wuStyles.row}
                        onPress={() => { setWeight(w.weight > 0 ? String(w.weight) : ''); setReps(String(w.reps)); }}
                        accessibilityRole="button"
                        accessibilityLabel={t('logger:stepperLogger.useWarmupSetA11y', { index: i + 1, weight: w.weight, reps: w.reps })}
                      >
                        <Text style={wuStyles.rowPct}>{Math.round(w.pct * 100)}%</Text>
                        <Text style={wuStyles.rowMain}>
                          {w.weight > 0
                            ? t('logger:stepperLogger.warmupRow', { weight: w.weight, reps: w.reps })
                            : t('logger:stepperLogger.warmupBodyweightRow', { reps: w.reps })}
                        </Text>
                        <Text style={wuStyles.rowUse}>{t('logger:stepperLogger.tapToFill')}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={wuStyles.hint}>
                      {t('logger:stepperLogger.warmupHint')}
                    </Text>
                  )}
                </Animated.View>
              ) : (
                <TouchableOpacity
                  onPress={() => { setWuEnabled(true); persistWuPrefs(true, wuSets); }}
                  style={wuStyles.enableLink}
                  accessibilityRole="button"
                  accessibilityLabel={t('logger:stepperLogger.addWarmupA11y')}
                >
                  <Text style={wuStyles.enableLabel}>{t('logger:stepperLogger.addWarmupLabel')}</Text>
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
                      onLongPress={
                        onOpenSetNote && s.id ? () => onOpenSetNote(s.id as string, i) : undefined
                      }
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
                    <Text style={styles.inputLabel}>{t('logger:stepperLogger.durationLabel')}</Text>
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
                        accessibilityLabel={t('logger:stepperLogger.durationMmA11y')}
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
                        accessibilityLabel={t('logger:stepperLogger.durationSsA11y')}
                      />
                    </View>
                  </View>
                </View>
                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('logger:stepperLogger.distanceLabel', { unit: distanceLabel.toUpperCase() })}</Text>
                    <TextInput
                      style={styles.input}
                      value={cardioDistance}
                      onChangeText={setCardioDistance}
                      keyboardType="decimal-pad"
                      placeholder={t('logger:stepperLogger.distancePlaceholder')}
                      placeholderTextColor={stepperPalette.muted}
                      selectTextOnFocus
                      accessibilityLabel={t('logger:stepperLogger.distanceA11y', { unit: distanceLabel })}
                    />
                  </View>
                </View>

                {/* TICKET-144: EMOM / AMRAP / interval conditioning timer —
                    runs the clock, then logs the result as this cardio set's
                    duration (and rounds, where meaningful) instead of typing
                    a duration by hand. Zero network. Gated on onLogCardioSet
                    (undefined in history-edit mode) for parity with the
                    "+ Drop set" affordance, which is gated on onStartDropChain
                    the same way. */}
                {onLogCardioSet ? (
                  <TouchableOpacity
                    onPress={() => setShowConditioningTimer(true)}
                    style={ssStyles.dropStartBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('logger:stepperLogger.openConditioningTimerA11y')}
                  >
                    <Ionicons name="stopwatch-outline" size={16} color={SS_AMBER} />
                    <Text style={ssStyles.dropStartLabel}>{t('logger:stepperLogger.conditioningTimerLabel')}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* ── Optional "More metrics" (P5): avg/max HR, calories,
                    cadence, elevation, RPE, splits. Collapsed by default behind
                    a "＋ More metrics" link (mirrors the lift RIR / warm-up
                    affordances) so the default cardio screen stays the simple
                    duration/distance flow. Every field is optional — leaving the
                    whole section blank logs no metrics. */}
                {showMoreMetrics ? (
                  <View style={moreStyles.card}>
                    <View style={moreStyles.headerRow}>
                      <Text style={moreStyles.title}>{t('logger:stepperLogger.moreMetricsTitle')}</Text>
                      <TouchableOpacity
                        onPress={() => setShowMoreMetrics(false)}
                        accessibilityRole="button"
                        accessibilityLabel={t('logger:stepperLogger.hideMetricsA11y')}
                      >
                        <Text style={moreStyles.hideLink}>{t('logger:stepperLogger.hide')}</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.avgHrLabel')}</Text>
                        <TextInput
                          style={styles.input}
                          value={mHrAvg}
                          onChangeText={setMHrAvg}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={3}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.avgHrA11y')}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.maxHrLabel')}</Text>
                        <TextInput
                          style={styles.input}
                          value={mHrMax}
                          onChangeText={setMHrMax}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={3}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.maxHrA11y')}
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.caloriesLabel')}</Text>
                        <TextInput
                          style={styles.input}
                          value={mCalories}
                          onChangeText={setMCalories}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={5}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.caloriesA11y')}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.cadenceLabel')}</Text>
                        <TextInput
                          style={styles.input}
                          value={mCadence}
                          onChangeText={setMCadence}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={3}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.cadenceA11y')}
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.elevGainLabel')}</Text>
                        <TextInput
                          style={styles.input}
                          value={mElevation}
                          onChangeText={setMElevation}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={6}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.elevGainA11y')}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.rpeLabel')}</Text>
                        <TextInput
                          style={styles.input}
                          value={mRpe}
                          onChangeText={setMRpe}
                          keyboardType="number-pad"
                          placeholder="—"
                          placeholderTextColor={stepperPalette.muted}
                          maxLength={2}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.rpeA11y')}
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>{t('logger:stepperLogger.splitsLabel', { unit: distanceLabel.toUpperCase() })}</Text>
                        <TextInput
                          style={styles.input}
                          value={mSplits}
                          onChangeText={setMSplits}
                          keyboardType="numbers-and-punctuation"
                          placeholder={t('logger:stepperLogger.splitsPlaceholder')}
                          placeholderTextColor={stepperPalette.muted}
                          selectTextOnFocus
                          accessibilityLabel={t('logger:stepperLogger.splitsA11y', { unit: distanceLabel })}
                        />
                      </View>
                    </View>
                    <Text style={moreStyles.hint}>
                      {t('logger:stepperLogger.splitsHint', { unit: distanceLabel })}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowMoreMetrics(true)}
                    style={moreStyles.enableLink}
                    accessibilityRole="button"
                    accessibilityLabel={t('logger:stepperLogger.addMetricsA11y')}
                  >
                    <Text style={moreStyles.enableLabel}>{t('logger:stepperLogger.addMetricsLabel')}</Text>
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
                      accessibilityLabel={t('logger:stepperLogger.copyLastA11y', { weight: ghostLast.weightStr, unit: unitLabel, reps: ghostLast.reps })}
                    >
                      <Text style={styles.ghostText}>
                        {t('logger:stepperLogger.ghostLast', { weight: ghostLast.weightStr, unit: unitLabel, reps: ghostLast.reps })}
                      </Text>
                      <Ionicons name="copy-outline" size={13} color={stepperPalette.muted} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.ghostTextEmpty}>{t('logger:stepperLogger.ghostLastEmpty')}</Text>
                  )}
                </View>

                <View style={styles.inputRow}>
                  <StepperControl
                    label={t('logger:stepperLogger.weightLabel')}
                    value={weight}
                    onChangeText={setWeight}
                    onStep={stepWeight}
                    keyboardType="decimal-pad"
                    placeholder={isBodyweightExercise(currentEx?.name) ? t('logger:stepperLogger.weightPlaceholderBw') : '—'}
                    accessibilityLabel={t('logger:stepperLogger.weightA11y')}
                    unitSuffix={unitLabel}
                    maxLength={7}
                    rightAccessory={
                      <TouchableOpacity
                        onPress={() => setPlateCalcVisible(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('logger:stepperLogger.openPlateCalcA11y')}
                      >
                        <Ionicons name="calculator-outline" size={16} color={stepperPalette.accent} />
                      </TouchableOpacity>
                    }
                  />
                  <StepperControl
                    label={t('logger:stepperLogger.repsLabel')}
                    value={reps}
                    onChangeText={setReps}
                    onStep={stepReps}
                    keyboardType="number-pad"
                    placeholder="—"
                    accessibilityLabel={t('logger:stepperLogger.repsA11y')}
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
                    accessibilityLabel={effortDisplay === 'rpe' ? t('logger:stepperLogger.addRpeA11y') : t('logger:stepperLogger.addRirA11y')}
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
                accessibilityLabel={t('logger:stepperLogger.chooseAlternativeA11y')}
              >
                <Text style={styles.altExerciseLinkLabel}>{t('logger:stepperLogger.chooseAlternativeLabel')}</Text>
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
                accessibilityLabel={t('logger:stepperLogger.unlinkSupersetA11y')}
              >
                <Text style={styles.altExerciseLinkLabel}>{t('logger:stepperLogger.unlinkSupersetLabel')}</Text>
              </TouchableOpacity>
            ) : !isCardio && !isGrouped && onSupersetWith && hasOtherPending ? (
              <TouchableOpacity
                onPress={onSupersetWith}
                style={styles.altExerciseLink}
                accessibilityRole="button"
                accessibilityLabel={t('logger:stepperLogger.supersetWithA11y')}
              >
                <Text style={styles.altExerciseLinkLabel}>{t('logger:stepperLogger.supersetWithLabel')}</Text>
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
            accessibilityLabel={t('logger:stepperLogger.addDropSetA11y')}
          >
            <Ionicons name="trending-down" size={16} color={SS_AMBER} />
            <Text style={ssStyles.dropStartLabel}>{t('logger:stepperLogger.addDropSetLabel')}</Text>
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
              <Text style={styles.retryToastText} numberOfLines={1}>{t('logger:stepperLogger.couldntSave')}</Text>
              <TouchableOpacity
                onPress={handleRetrySave}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('logger:stepperLogger.retrySaveA11y')}
              >
                <Text style={styles.retryToastBtn}>{t('logger:stepperLogger.retry')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRetryToast(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('logger:stepperLogger.dismissA11y')}
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
              accessibilityLabel={t('logger:stepperLogger.addNextExerciseA11y')}
            >
              <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.addNextExerciseLabel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={onSaveAsRoutine}
              accessibilityRole="button"
              accessibilityLabel={t('logger:stepperLogger.finishSaveRoutineA11y')}
            >
              <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.finishSaveRoutineLabel')}</Text>
            </TouchableOpacity>
          </>
        ) : variant === 'smart' ? (
          showInterstitial ? (
            <>
              <TouchableOpacity
                style={styles.continueBtn}
                onPress={handleAcceptSug}
                accessibilityRole="button"
                accessibilityLabel={activeSug ? t('logger:stepperLogger.continueToA11y', { name: activeSug.name }) : t('logger:stepperLogger.finishWorkoutA11y')}
              >
                <Text style={styles.continueBtnLabel}>
                  {activeSug ? t('logger:stepperLogger.continueToLabel', { name: activeSug.name }) : t('logger:stepperLogger.finishWorkoutLabel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => setSwitcherVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('logger:stepperLogger.selectDifferentA11y')}
              >
                <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.selectDifferentLabel')}</Text>
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
                accessibilityLabel={t('logger:stepperLogger.doneSeeWhatsNextA11y')}
              >
                <Text style={styles.switchBtnLabel}>
                  {currentExerciseSets.length === 0 ? t('logger:stepperLogger.logToContinue') : t('logger:stepperLogger.doneSeeWhatsNextLabel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => setSwitcherVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('logger:stepperLogger.selectDifferentA11y')}
              >
                <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.selectDifferentLabel')}</Text>
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
                accessibilityLabel={t('logger:stepperLogger.logExtraSetA11y', { number: setNumber })}
              >
                <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.logSetLabel', { number: setNumber })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.switchBtn}
                onPress={() => setSwitcherVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('logger:stepperLogger.selectDifferentA11y')}
              >
                <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.selectDifferentLabel')}</Text>
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
              accessibilityLabel={nextPendingEx ? t('logger:stepperLogger.continueToA11y', { name: nextPendingEx.name }) : t('logger:stepperLogger.finishWorkoutA11y')}
            >
              <Text style={styles.switchBtnLabel}>
                {nextPendingEx ? t('logger:stepperLogger.continueToLabel', { name: nextPendingEx.name }) : t('logger:stepperLogger.finishWorkoutLabel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.switchBtn}
              onPress={() => setSwitcherVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('logger:stepperLogger.selectDifferentA11y')}
            >
              <Text style={styles.switchBtnLabel}>{t('logger:stepperLogger.selectDifferentLabel')}</Text>
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
            <Text style={styles.promptTitle}>{t('logger:stepperLogger.addToRoutinePrompt', { exercise: offRoutinePrompt.exerciseName, routine: routineName })}</Text>
            <Text style={styles.promptSub}>{t('logger:stepperLogger.addToRoutineSub')}</Text>

            {/* TICKET-081 §1c: row 1 = End of routine | After current; row 2 (full-width) = Pick position… */}
            <View style={styles.placementGrid}>
              {([
                ['end', t('logger:stepperLogger.endOfRoutine')],
                ['after_current', t('logger:stepperLogger.afterCurrent')],
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
                {t('logger:stepperLogger.pickPosition')}
              </Text>
            </TouchableOpacity>

            {promptPlacement === 'pick' && (
              <View style={styles.pickList}>
                {Array.from({ length: exercises.length + 1 }, (_, slot) => {
                  const label =
                    slot === 0
                      ? t('logger:stepperLogger.atStart')
                      : exercises[slot - 1]?.name
                        ? t('logger:stepperLogger.afterExercise', { name: exercises[slot - 1]?.name })
                        : t('logger:stepperLogger.afterExerciseFallback', { index: slot });
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
                <Text style={styles.promptBtnGhostLabel}>{t('logger:stepperLogger.notNow')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.promptBtn, styles.promptBtnPrimary]}
                onPress={handleAddOffRoutine}
              >
                <Text style={styles.promptBtnPrimaryLabel}>{t('logger:stepperLogger.addToRoutine')}</Text>
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

      {/* ── TICKET-144: EMOM / AMRAP / interval conditioning timer ──────────── */}
      <ConditioningTimerSheet
        visible={showConditioningTimer}
        exerciseName={currentEx?.name ?? ''}
        onFinish={handleConditioningFinish}
        onClose={() => setShowConditioningTimer(false)}
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
  endBtn: {
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: stepperPalette.line,
  },
  endBtnLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
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
