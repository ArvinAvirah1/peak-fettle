/**
 * SetEntryForm — modal form for logging a lift or cardio set.
 *
 * Lift:   Weight (respects unit_pref), Reps, optional RIR
 * Cardio: Duration (mm:ss), optional Distance
 *
 * "Log Set" submits, then clears fields for the next set.
 * "Log Another" is the same as "Log Set" — keeps exercise selected.
 * "Done" closes the form.
 *
 * TODO(TICKET-027): swap for PowerSync hook after sync layer lands
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
} from 'react-native';
import { displayToKg, formatWeight } from '../constants/units';
import { Exercise, WorkoutSet, LogSetPayload } from '../types/api';
import { PersonalBest } from '../api/sets';
import { UnitSystem } from '../constants/units';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SetEntryFormProps {
  exercise: Exercise;
  workoutId: string;
  /** The next set_index to use (0-based, length of current sets for this exercise). */
  nextSetIndex: number;
  unitPref: UnitSystem;
  onLogged: (set: WorkoutSet) => void;
  onClose: () => void;
  /** Called with the payload so the parent can perform the actual API call. */
  onSubmit: (payload: LogSetPayload) => Promise<WorkoutSet>;
  /** PB data for lift exercises — shows last-session and all-time best cards. */
  personalBest?: PersonalBest | null;
}

// ---------------------------------------------------------------------------
// Lift form state
// ---------------------------------------------------------------------------

interface LiftFields {
  weight: string;
  reps: string;
  rir: string; // '' = not recorded
}

const EMPTY_LIFT: LiftFields = { weight: '', reps: '', rir: '' };

// ---------------------------------------------------------------------------
// Cardio form state
// ---------------------------------------------------------------------------

interface CardioFields {
  durationMm: string;
  durationSs: string;
  distanceDisplay: string; // km or miles depending on pref
}

const EMPTY_CARDIO: CardioFields = {
  durationMm: '',
  durationSs: '',
  distanceDisplay: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDurationSec(mm: string, ss: string): number | null {
  const minutes = parseInt(mm, 10);
  const seconds = parseInt(ss, 10);
  if (isNaN(minutes) || isNaN(seconds)) return null;
  if (seconds < 0 || seconds > 59) return null;
  return minutes * 60 + seconds;
}

function distanceToMetres(display: string, unitPref: UnitSystem): number | null {
  const val = parseFloat(display);
  if (isNaN(val) || val <= 0) return null;
  // If lbs pref, assume distance in miles; otherwise km
  return unitPref === 'lbs' ? val * 1609.344 : val * 1000;
}

function paceFromDurationAndDistance(
  durationSec: number,
  distanceM: number
): number {
  // sec/km
  const distanceKm = distanceM / 1000;
  return distanceKm > 0 ? durationSec / distanceKm : 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SetEntryForm({
  exercise,
  workoutId,
  nextSetIndex,
  unitPref,
  onLogged,
  onClose,
  onSubmit,
  personalBest,
}: SetEntryFormProps): React.ReactElement {
  const { theme } = useTheme();
  const isLift = exercise.category === 'lift';
  const distanceLabel = unitPref === 'lbs' ? 'miles' : 'km';

  const [liftFields, setLiftFields] = useState<LiftFields>(EMPTY_LIFT);
  const [cardioFields, setCardioFields] = useState<CardioFields>(EMPTY_CARDIO);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setCount, setSetCount] = useState(0);
  // useState (not useRef) so the "Set N" indicator re-renders after each logged
  // set, and so the index is reset correctly when the parent remounts with a new
  // nextSetIndex prop (WL-004 / setentryform-currentsetindex-ref-stale).
  const [currentSetIndex, setCurrentSetIndex] = useState(nextSetIndex);
  useEffect(() => {
    setCurrentSetIndex(nextSetIndex);
  }, [nextSetIndex]);

  const repsRef = useRef<TextInput>(null);
  const ssRef = useRef<TextInput>(null);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validateLift(): string | null {
    const w = parseFloat(liftFields.weight);
    const r = parseInt(liftFields.reps, 10);
    if (isNaN(w) || w <= 0) return 'Enter a valid weight';
    if (isNaN(r) || r <= 0 || r > 9999) return 'Enter valid reps (1–9999)';
    if (liftFields.rir !== '') {
      const rir = parseInt(liftFields.rir, 10);
      if (isNaN(rir) || rir < 0 || rir > 10) return 'RIR must be 0–10 (leave blank to skip)';
    }
    return null;
  }

  function validateCardio(): string | null {
    const durationSec = parseDurationSec(
      cardioFields.durationMm,
      cardioFields.durationSs
    );
    if (durationSec === null || durationSec <= 0)
      return 'Enter a valid duration (mm:ss)';
    if (cardioFields.distanceDisplay !== '') {
      const val = parseFloat(cardioFields.distanceDisplay);
      if (isNaN(val) || val <= 0) return 'Enter a valid distance';
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Build payload
  // ---------------------------------------------------------------------------

  function buildLiftPayload(): LogSetPayload {
    const weightKg = displayToKg(parseFloat(liftFields.weight), unitPref);
    const reps = parseInt(liftFields.reps, 10);
    const rir =
      liftFields.rir.trim() === '' ? undefined : parseInt(liftFields.rir, 10);
    return {
      kind: 'lift',
      workoutId,
      exerciseId: exercise.id,
      setIndex: currentSetIndex,
      reps,
      weightKg,
      ...(rir !== undefined ? { rir } : {}),
    };
  }

  function buildCardioPayload(): LogSetPayload {
    const durationSec = parseDurationSec(
      cardioFields.durationMm,
      cardioFields.durationSs
    ) as number;
    const distanceM =
      cardioFields.distanceDisplay.trim() !== ''
        ? distanceToMetres(cardioFields.distanceDisplay, unitPref) ?? undefined
        : undefined;
    const avgPaceSecPerKm =
      distanceM !== undefined && distanceM > 0
        ? paceFromDurationAndDistance(durationSec, distanceM)
        : undefined;
    return {
      kind: 'cardio',
      workoutId,
      exerciseId: exercise.id,
      setIndex: currentSetIndex,
      durationSec,
      ...(distanceM !== undefined ? { distanceM } : {}),
      ...(avgPaceSecPerKm !== undefined ? { avgPaceSecPerKm } : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleLog = useCallback(async () => {
    setError(null);
    const validationError = isLift ? validateLift() : validateCardio();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
      const payload = isLift ? buildLiftPayload() : buildCardioPayload();
      const logged = await onSubmit(payload);
      onLogged(logged);
      setCurrentSetIndex((prev) => prev + 1);
      setSetCount((c) => c + 1);
      // Clear fields for the next set (Log Another behaviour)
      if (isLift) {
        setLiftFields((prev) => ({ ...prev, reps: '', rir: '' }));
      } else {
        setCardioFields(EMPTY_CARDIO);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to log set';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLift, liftFields, cardioFields, workoutId, exercise, unitPref, onSubmit, onLogged, currentSetIndex]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderLiftForm = () => (
    <View style={styles.fieldsContainer}>
      {/* Weight */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Weight ({unitPref})</Text>
        <TextInput
          style={[styles.input, {
            backgroundColor: theme.colors.bgSecondary,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.borderDefault,
          }]}
          placeholder={`e.g. ${unitPref === 'lbs' ? '135' : '60'}`}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="decimal-pad"
          value={liftFields.weight}
          onChangeText={(t) => setLiftFields((prev) => ({ ...prev, weight: t }))}
          returnKeyType="next"
          onSubmitEditing={() => repsRef.current?.focus()}
          accessibilityLabel="Weight"
          maxLength={7}
        />
      </View>

      {/* Reps */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Reps</Text>
        <TextInput
          ref={repsRef}
          style={[styles.input, {
            backgroundColor: theme.colors.bgSecondary,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.borderDefault,
          }]}
          placeholder="e.g. 8"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="number-pad"
          value={liftFields.reps}
          onChangeText={(t) => setLiftFields((prev) => ({ ...prev, reps: t }))}
          returnKeyType="done"
          accessibilityLabel="Reps"
        />
      </View>

      {/* RIR (optional) */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
          RIR{' '}
          <Text style={[styles.fieldLabelOptional, { color: theme.colors.textTertiary }]}>(optional — 0 = to failure)</Text>
        </Text>
        <TextInput
          style={[styles.input, {
            backgroundColor: theme.colors.bgSecondary,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.borderDefault,
          }]}
          placeholder="Leave blank to skip"
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="number-pad"
          value={liftFields.rir}
          onChangeText={(t) => setLiftFields((prev) => ({ ...prev, rir: t }))}
          returnKeyType="done"
          accessibilityLabel="Reps in reserve (optional)"
        />
      </View>
    </View>
  );

  const renderCardioForm = () => (
    <View style={styles.fieldsContainer}>
      {/* Duration */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>Duration (mm : ss)</Text>
        <View style={styles.durationRow}>
          <TextInput
            style={[styles.input, styles.durationInput, {
              backgroundColor: theme.colors.bgSecondary,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.borderDefault,
            }]}
            placeholder="00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="number-pad"
            maxLength={3}
            value={cardioFields.durationMm}
            onChangeText={(t) =>
              setCardioFields((prev) => ({ ...prev, durationMm: t }))
            }
            returnKeyType="next"
            onSubmitEditing={() => ssRef.current?.focus()}
            accessibilityLabel="Duration minutes"
          />
          <Text style={[styles.durationSeparator, { color: theme.colors.textTertiary }]}>:</Text>
          <TextInput
            ref={ssRef}
            style={[styles.input, styles.durationInput, {
              backgroundColor: theme.colors.bgSecondary,
              color: theme.colors.textPrimary,
              borderColor: theme.colors.borderDefault,
            }]}
            placeholder="00"
            placeholderTextColor={theme.colors.textTertiary}
            keyboardType="number-pad"
            maxLength={2}
            value={cardioFields.durationSs}
            onChangeText={(t) =>
              setCardioFields((prev) => ({ ...prev, durationSs: t }))
            }
            returnKeyType="done"
            accessibilityLabel="Duration seconds"
          />
        </View>
      </View>

      {/* Distance */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>
          Distance ({distanceLabel}){' '}
          <Text style={[styles.fieldLabelOptional, { color: theme.colors.textTertiary }]}>(optional)</Text>
        </Text>
        <TextInput
          style={[styles.input, {
            backgroundColor: theme.colors.bgSecondary,
            color: theme.colors.textPrimary,
            borderColor: theme.colors.borderDefault,
          }]}
          placeholder={`e.g. 5.0 ${distanceLabel}`}
          placeholderTextColor={theme.colors.textTertiary}
          keyboardType="decimal-pad"
          value={cardioFields.distanceDisplay}
          onChangeText={(t) =>
            setCardioFields((prev) => ({ ...prev, distanceDisplay: t }))
          }
          returnKeyType="done"
          accessibilityLabel={`Distance in ${distanceLabel} (optional)`}
        />
      </View>
    </View>
  );

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bgPrimary }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.exerciseName, { color: theme.colors.textPrimary }]}>{exercise.name}</Text>
                {setCount > 0 && (
                  <Text style={[styles.setCountLabel, { color: theme.colors.textTertiary }]}>
                    {setCount} set{setCount !== 1 ? 's' : ''} logged
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close set entry form"
              >
                <Text style={[styles.closeButtonText, { color: theme.colors.accentDefault }]}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Set number indicator */}
            <View style={[styles.setIndicator, {
              backgroundColor: theme.colors.bgSecondary,
              borderColor: theme.colors.borderDefault,
            }]}>
              <Text style={[styles.setIndicatorText, { color: theme.colors.textSecondary }]}>
                Set {currentSetIndex + 1}
              </Text>
            </View>


            {/* Personal Best card — lift exercises only */}
            {isLift && personalBest && (personalBest.last_session || personalBest.all_time_best) ? (
              <View style={[styles.pbCard, {
                backgroundColor: theme.colors.bgSecondary,
                borderColor: theme.colors.accentDefault,
              }]}>
                <Text style={[styles.pbCardTitle, { color: theme.colors.accentDefault }]}>
                  Personal Bests
                </Text>
                {personalBest.last_session ? (
                  <View style={styles.pbRow}>
                    <Text style={[styles.pbRowLabel, { color: theme.colors.textSecondary }]}>Last session</Text>
                    <Text style={[styles.pbRowValue, { color: theme.colors.textPrimary }]}>
                      {formatWeight(personalBest.last_session.weight_kg, unitPref)} × {personalBest.last_session.reps} reps
                    </Text>
                  </View>
                ) : null}
                {personalBest.all_time_best ? (
                  <View style={styles.pbRow}>
                    <Text style={[styles.pbRowLabel, { color: theme.colors.textSecondary }]}>All-time best</Text>
                    <Text style={[styles.pbRowValue, { color: theme.colors.textPrimary }]}>
                      {formatWeight(personalBest.all_time_best.weight_kg, unitPref)} × {personalBest.all_time_best.reps} reps
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {/* Form fields */}
            {isLift ? renderLiftForm() : renderCardioForm()}

            {/* Error */}
            {error ? (
              <View style={[styles.errorBox, {
                backgroundColor: theme.colors.bgPrimary,
                borderColor: theme.colors.statusError,
              }]}>
                <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.logButton, { backgroundColor: theme.colors.accentDefault }, isSubmitting && styles.logButtonDisabled]}
                onPress={handleLog}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Log this set"
              >
                {isSubmitting ? (
                  <ActivityIndicator color={theme.colors.textPrimary} />
                ) : (
                  <Text style={[styles.logButtonText, { color: theme.colors.textPrimary }]}>Log Set</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.logAnotherButton, {
                  backgroundColor: theme.colors.bgSecondary,
                  borderColor: theme.colors.borderDefault,
                }]}
                onPress={handleLog}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Log this set and log another"
              >
                <Text style={[styles.logAnotherText, { color: theme.colors.accentDefault }]}>Log Another</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  exerciseName: {
    fontSize: fontSize.heading3,  // E-003: was 22
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  setCountLabel: {
    fontSize: fontSize.bodySm,  // E-003: was 14
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  setIndicator: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s4,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  setIndicatorText: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  fieldsContainer: {
    gap: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  fieldLabelOptional: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.regular,  // E-003: was '400'
  },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    fontSize: fontSize.bodyLg,  // E-003: was 18
    fontWeight: fontWeight.medium,  // E-003: was '500'
    minHeight: 54,
    borderWidth: 1,
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  durationInput: {
    flex: 1,
    textAlign: 'center',
  },
  durationSeparator: {
    fontSize: fontSize.heading2,  // E-003: was 24
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  errorBox: {
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
  },
  errorText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  actions: {
    gap: 12,
    paddingTop: 4,
  },
  logButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  logButtonDisabled: {
    opacity: 0.6,
  },
  logButtonText: {
    fontSize: fontSize.bodyMd,  // E-003: was 17
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  logAnotherButton: {
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
  },
  logAnotherText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  pbCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s2,
  },
  pbCardTitle: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  pbRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pbRowLabel: {
    fontSize: fontSize.bodySm,
  },
  pbRowValue: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'] as const,
  },
});
