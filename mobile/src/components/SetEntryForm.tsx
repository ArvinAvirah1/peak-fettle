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

import React, { useState, useCallback, useRef } from 'react';
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
import { displayToKg } from '../constants/units';
import { Exercise, WorkoutSet, LogSetPayload } from '../types/api';
import { UnitSystem } from '../constants/units';

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
}: SetEntryFormProps): React.ReactElement {
  const isLift = exercise.category === 'lift';
  const distanceLabel = unitPref === 'lbs' ? 'miles' : 'km';

  const [liftFields, setLiftFields] = useState<LiftFields>(EMPTY_LIFT);
  const [cardioFields, setCardioFields] = useState<CardioFields>(EMPTY_CARDIO);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setCount, setSetCount] = useState(0);
  const currentSetIndex = useRef(nextSetIndex);

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
      setIndex: currentSetIndex.current,
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
      setIndex: currentSetIndex.current,
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
      currentSetIndex.current += 1;
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
  }, [isLift, liftFields, cardioFields, workoutId, exercise, unitPref, onSubmit, onLogged]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderLiftForm = () => (
    <View style={styles.fieldsContainer}>
      {/* Weight */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Weight ({unitPref})</Text>
        <TextInput
          style={styles.input}
          placeholder={`e.g. ${unitPref === 'lbs' ? '135' : '60'}`}
          placeholderTextColor="#475569"
          keyboardType="decimal-pad"
          value={liftFields.weight}
          onChangeText={(t) => setLiftFields((prev) => ({ ...prev, weight: t }))}
          returnKeyType="next"
          onSubmitEditing={() => repsRef.current?.focus()}
          accessibilityLabel="Weight"
        />
      </View>

      {/* Reps */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Reps</Text>
        <TextInput
          ref={repsRef}
          style={styles.input}
          placeholder="e.g. 8"
          placeholderTextColor="#475569"
          keyboardType="number-pad"
          value={liftFields.reps}
          onChangeText={(t) => setLiftFields((prev) => ({ ...prev, reps: t }))}
          returnKeyType="done"
          accessibilityLabel="Reps"
        />
      </View>

      {/* RIR (optional) */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>
          RIR{' '}
          <Text style={styles.fieldLabelOptional}>(optional — 0 = to failure)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Leave blank to skip"
          placeholderTextColor="#475569"
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
        <Text style={styles.fieldLabel}>Duration (mm : ss)</Text>
        <View style={styles.durationRow}>
          <TextInput
            style={[styles.input, styles.durationInput]}
            placeholder="00"
            placeholderTextColor="#475569"
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
          <Text style={styles.durationSeparator}>:</Text>
          <TextInput
            ref={ssRef}
            style={[styles.input, styles.durationInput]}
            placeholder="00"
            placeholderTextColor="#475569"
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
        <Text style={styles.fieldLabel}>
          Distance ({distanceLabel}){' '}
          <Text style={styles.fieldLabelOptional}>(optional)</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder={`e.g. 5.0 ${distanceLabel}`}
          placeholderTextColor="#475569"
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
      <SafeAreaView style={styles.container}>
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
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                {setCount > 0 && (
                  <Text style={styles.setCountLabel}>
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
                <Text style={styles.closeButtonText}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Set number indicator */}
            <View style={styles.setIndicator}>
              <Text style={styles.setIndicatorText}>
                Set {currentSetIndex.current + 1}
              </Text>
            </View>

            {/* Form fields */}
            {isLift ? renderLiftForm() : renderCardioForm()}

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.logButton, isSubmitting && styles.logButtonDisabled]}
                onPress={handleLog}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Log this set"
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.logButtonText}>Log Set</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logAnotherButton}
                onPress={handleLog}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Log this set and log another"
              >
                <Text style={styles.logAnotherText}>Log Another</Text>
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
    backgroundColor: '#0f172a',
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
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
  },
  setCountLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#818cf8',
    fontWeight: '500',
  },
  setIndicator: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#334155',
  },
  setIndicatorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  fieldsContainer: {
    gap: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  fieldLabelOptional: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748b',
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '500',
    color: '#f8fafc',
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#334155',
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
    fontSize: 24,
    fontWeight: '700',
    color: '#64748b',
  },
  errorBox: {
    backgroundColor: '#450a0a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    gap: 12,
    paddingTop: 4,
  },
  logButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  logButtonDisabled: {
    opacity: 0.6,
  },
  logButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  logAnotherButton: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#334155',
  },
  logAnotherText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#818cf8',
  },
});
