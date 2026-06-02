/**
 * StepperLogger — TICKET-059
 * Full-screen Focus Stepper: one exercise at a time.
 *
 * Layout (matches set-logging-stepper-flow.html §1a):
 *   • Routine header: name · progress dots · "N of M"
 *   • "EXERCISE N OF M" label + exercise name
 *   • PB card (optional)
 *   • Logged set chips (scrollable row)
 *   • Weight / Reps input fields
 *   • "Log set N" primary CTA
 *   • "Continue to <next> →" (or "Finish workout" on last)
 *   • "Select different exercise" secondary button
 *
 * Off-routine placement prompt: when the user picks an exercise not in the
 * current routine via the switcher → Browse path, a bottom prompt appears
 * asking where to slot it into the routine.
 *
 * TICKET-060 (ExerciseSwitcherSheet) is imported here and opened by the
 * "Select different exercise" button.
 */

import React, { useState, useCallback, useMemo } from 'react';
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

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoggedSet {
  weight: string;
  reps: string;
  /** Reps-in-Reserve as typed (optional). '' / undefined = not recorded. */
  rir?: string;
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
   * Called when user logs a set for the current exercise.
   * `rir` is the optional Reps-in-Reserve string (TICKET-074); undefined/''
   * means "not recorded" and the parent should send rir = -1 to the server.
   */
  onLogSet: (exerciseId: string, weight: string, reps: string, rir?: string) => void;
  /** Called when user advances to a specific index (Continue or switcher tap) */
  onAdvance: (toIndex: number) => void;
  /** Called when user finishes the last exercise */
  onFinish: () => void;
  /** Opens the exercise picker (ExercisePickerModal); resolved exerciseId → name */
  onBrowseLibrary: () => void;
  /**
   * Personal best for the current exercise:
   * e.g. "25 kg × 12" or null if none on record.
   */
  pbLabel?: string | null;
  /**
   * Rep range target for this exercise from the routine,
   * e.g. "8-12" or null.
   */
  repTarget?: string | null;
  /**
   * Logged sets for the current exercise in THIS workout session.
   * Passed in so the stepper can display chips without managing its own state.
   */
  currentExerciseSets: LoggedSet[];
  /**
   * Called when user chooses to add an off-routine exercise into the routine
   * at the specified position.
   */
  onAddOffRoutineExercise?: (
    exerciseId: string,
    exerciseName: string,
    position: OffRoutinePlacement,
    /** 0-based insertion index, only meaningful when position === 'pick'. */
    pickIndex?: number,
  ) => void;
  /** Close / dismiss the stepper (returns to normal log view) */
  onClose: () => void;
  /**
   * Stepper variant (TICKET-062):
   * - 'routine'  : routine session — "Continue to <next>" (default)
   * - 'free'     : add-as-you-go — "＋ Add next exercise" / "Finish & save as routine"
   * - 'smart'    : paid smart-suggest — shows suggestion card after each exercise
   */
  variant?: 'routine' | 'free' | 'smart';
  /**
   * For variant='smart': the algorithmically-suggested next exercise.
   * Recalculated by the parent after each set is logged.
   */
  suggestion?: SuggestCandidate | null;
  /** For variant='free': called when user taps "＋ Add next exercise" */
  onAddNextExercise?: () => void;
  /** For variant='free'|'smart': save current ad-hoc session as a routine */
  onSaveAsRoutine?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SetChip({ set, index }: { set: LoggedSet; index: number }) {
  const rirNum = set.rir != null && set.rir !== '' ? parseInt(set.rir, 10) : null;
  const rirLabel =
    rirNum == null || Number.isNaN(rirNum) || rirNum < 0
      ? ''
      : rirNum === 0
        ? ' · to failure'
        : ` · RIR ${rirNum}`;
  return (
    <View style={chipStyles.chip}>
      <Text style={chipStyles.label}>
        Set {index + 1} · {set.weight}×{set.reps}{rirLabel}
      </Text>
    </View>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function StepperLogger({
  routineSession,
  onLogSet,
  onAdvance,
  onFinish,
  onBrowseLibrary,
  pbLabel,
  repTarget,
  currentExerciseSets,
  onAddOffRoutineExercise,
  onClose,
  variant = 'routine',
  suggestion,
  onAddNextExercise,
  onSaveAsRoutine,
}: Props): React.ReactElement {
  const { exercises, currentIndex, name: routineName } = routineSession;
  const currentEx: RoutineSessionExercise | undefined = exercises[currentIndex];
  const nextEx: RoutineSessionExercise | undefined = exercises[currentIndex + 1];
  const isLast = currentIndex === exercises.length - 1;

  // ── Local form state ──────────────────────────────────────────────────────
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [offRoutinePrompt, setOffRoutinePrompt] = useState<OffRoutinePrompt | null>(null);
  const [promptPlacement, setPromptPlacement] = useState<OffRoutinePlacement>('after_current');
  // 0-based insert index for the "Pick position…" flow (TICKET-074 gap #3).
  const [pickIndex, setPickIndex] = useState(0);
  // Track which off-routine exercises we've already prompted for so the sheet
  // pops at most once per exercise per session.
  const promptedRef = React.useRef<Set<string>>(new Set());

  const setNumber = currentExerciseSets.length + 1;
  // An exercise is "off routine" when it carries no routine exercise id. We only
  // surface the placement prompt for genuine routine sessions (template-derived
  // sessions legitimately have empty ids on every row, so they must not fire it).
  const isOffRoutine =
    routineSession.source === 'routine' && (currentEx?.exerciseId ?? '') === '';

  // Progress dots (max 7 shown; ellipsis implied for longer routines)
  const dotsToShow = Math.min(exercises.length, 7);
  const progressDots = useMemo(() =>
    Array.from({ length: dotsToShow }, (_, i) => i <= currentIndex),
    [dotsToShow, currentIndex],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleLogSet = useCallback(() => {
    if (!weight.trim() && !reps.trim()) return;
    onLogSet(currentEx?.exerciseId ?? '', weight.trim(), reps.trim(), rir.trim() || undefined);
    setReps('');
    setRir('');
    // Keep weight pre-filled for the next set.

    // TICKET-074 #3: if this exercise isn't part of the routine, offer to add it
    // (once per exercise). The placement sheet writes it into the routine.
    const key = currentEx?.name ?? '';
    if (isOffRoutine && currentEx && onAddOffRoutineExercise && !promptedRef.current.has(key)) {
      promptedRef.current.add(key);
      setPromptPlacement('after_current');
      setPickIndex(Math.min(currentIndex + 1, exercises.length));
      setOffRoutinePrompt({ exerciseName: currentEx.name, exerciseId: currentEx.exerciseId });
    }
  }, [weight, reps, rir, currentEx, onLogSet, isOffRoutine, onAddOffRoutineExercise, currentIndex, exercises.length]);

  const handleContinue = useCallback(() => {
    if (isLast) {
      onFinish();
    } else {
      onAdvance(currentIndex + 1);
      setWeight('');
      setReps('');
    }
  }, [isLast, currentIndex, onAdvance, onFinish]);

  const handleSelectIndex = useCallback((idx: number) => {
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

  if (!currentEx) return <View />;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      {/* ── Header: routine name + progress ──────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Close stepper"
        >
          <Ionicons name="chevron-down" size={20} color={stepperPalette.muted} />
        </TouchableOpacity>

        <Text style={styles.routineName} numberOfLines={1}>
          {routineName}
        </Text>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {progressDots.map((done, i) => (
            <View key={i} style={[styles.dot, done && styles.dotDone]} />
          ))}
        </View>

        <Text style={styles.progressLabel}>
          {currentIndex + 1} / {exercises.length}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Exercise label + name ───────────────────────────────────────── */}
        <Text style={styles.exLabel}>
          {isOffRoutine ? 'NOT IN ROUTINE' : `EXERCISE ${currentIndex + 1} OF ${exercises.length}`}
        </Text>
        <Text style={styles.exName}>{currentEx.name}</Text>

        {/* ── PB card ─────────────────────────────────────────────────────── */}
        {(pbLabel || repTarget) && (
          <View style={styles.pbCard}>
            <Text style={styles.pbText}>
              {pbLabel ? `PB ${pbLabel}` : ''}
              {pbLabel && repTarget ? ' · ' : ''}
              {repTarget ? `aim ${repTarget} reps` : ''}
            </Text>
          </View>
        )}

        {/* ── Logged set chips ────────────────────────────────────────────── */}
        {currentExerciseSets.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {currentExerciseSets.map((s, i) => (
              <SetChip key={i} set={s} index={i} />
            ))}
          </ScrollView>
        )}

        {/* ── Weight / Reps inputs ────────────────────────────────────────── */}
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>WEIGHT</Text>
            <TextInput
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="—"
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
          {/* TICKET-074 #4: RIR — optional, shown by default (not behind a disclosure). */}
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
        </View>
        <Text style={styles.rirHint}>RIR optional · 0 = to failure</Text>

        {/* ── Log set CTA ─────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.logSetBtn}
          onPress={handleLogSet}
          accessibilityRole="button"
          accessibilityLabel={`Log set ${setNumber}`}
        >
          <Text style={styles.logSetLabel}>Log set {setNumber}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Bottom action bar — varies by variant ──────────────────────────── */}
      <View style={styles.actionBar}>
        {variant === 'free' ? (
          /* Variant 1: add-as-you-go */
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
          /* Variant 3: smart-suggest — show suggestion card if available */
          <>
            {suggestion ? (
              <View style={styles.suggestionCard}>
                <View style={styles.suggestionCardTop}>
                  <View style={styles.suggestionPill}>
                    <Text style={styles.suggestionPillLabel}>Suggested next</Text>
                  </View>
                  <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
                </View>
                <Text style={styles.suggestionName}>{suggestion.name}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.continueBtn}
              onPress={suggestion ? () => onAddNextExercise?.() : onFinish}
              accessibilityRole="button"
              accessibilityLabel={suggestion ? `Continue to ${suggestion.name}` : 'Finish workout'}
            >
              <Text style={styles.continueBtnLabel}>
                {suggestion ? `Continue to ${suggestion.name} →` : 'Finish workout'}
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
          /* Variant default: routine mode */
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

      {/* ── Off-routine placement prompt ──────────────────────────────────── */}
      {offRoutinePrompt && (
        <Pressable style={styles.promptBackdrop} onPress={() => setOffRoutinePrompt(null)}>
          <Pressable style={styles.prompt} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.promptTitle}>Add {offRoutinePrompt.exerciseName} to "{routineName}"?</Text>
            <Text style={styles.promptSub}>Keep it for next time — where should it go?</Text>

            <View style={styles.placementGrid}>
              {([
                ['after_current', 'After current'],
                ['end', 'End of routine'],
                ['pick', 'Pick position…'],
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

            {/* TICKET-074 #3: Pick position… — a position picker over the routine list */}
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
                      {on ? (
                        <Ionicons name="checkmark" size={16} color={stepperPalette.accent} />
                      ) : null}
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

      {/* ── Exercise Switcher Sheet (TICKET-060) ───────────────────────────── */}
      <ExerciseSwitcherSheet
        visible={switcherVisible}
        onClose={() => setSwitcherVisible(false)}
        routineSession={routineSession}
        onSelectIndex={handleSelectIndex}
        onBrowseLibrary={() => {
          setSwitcherVisible(false);
          onBrowseLibrary();
        }}
      />
    </KeyboardAvoidingView>
  );
}

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
  inputRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginBottom: spacing.s3,
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
    marginTop: -spacing.s1,
    marginBottom: spacing.s3,
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
    marginBottom: spacing.s3,
  },
  placementOpt: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    backgroundColor: stepperPalette.bg,
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
  // Pick position… list (TICKET-074 #3)
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
});

const styles_extra = StyleSheet.create({
  suggestionCard: {
    backgroundColor: stepperPalette.accentSurface,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s2,
  },
  suggestionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s1,
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
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
  },
  suggestionName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
    color: stepperPalette.text,
  },
});

// Merge extra styles into main styles object at runtime
Object.assign(styles, styles_extra);

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
});
