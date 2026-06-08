/**
 * RoutineEditorSheet — full routine exercise-editor.
 *
 * Replaces the old name-only "Edit" modal on the Routines page. Lets the user:
 *   • rename the routine
 *   • add exercises (via the shared ExercisePicker)
 *   • remove exercises (trash button)
 *   • reorder exercises (up/down chevrons — no drag library; array swap)
 *   • edit each exercise's target sets (numeric) and target reps (string, e.g. "8-12")
 *   • Save → PUT full replace via updateRoutine()
 *
 * Visual style matches StepperLogger / routines.tsx (dark cards, teal accent)
 * using the shared stepperPalette + spacing/radius/typography tokens.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from './Icon';
import { stepperPalette, fontFamily, fontSize, spacing, radius } from '../theme/tokens';
import { Routine, RoutineExercise, updateRoutine } from '../api/routines';
import { ExercisePicker } from './ExercisePicker';
import { Exercise } from '../types/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  routine: Routine | null; // null = not open
  onClose: () => void;
  onSaved: (updated: Routine) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RoutineEditorSheet({
  visible,
  routine,
  onClose,
  onSaved,
}: Props): React.ReactElement {
  const [name, setName] = useState<string>(routine?.name ?? '');
  const [items, setItems] = useState<RoutineExercise[]>(routine?.exercises ?? []);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed local state whenever the target routine changes (e.g. tapping Edit
  // on a different routine, or reopening after a save).
  useEffect(() => {
    setName(routine?.name ?? '');
    setItems(routine?.exercises ?? []);
  }, [routine]);

  // ── Per-exercise field edits ─────────────────────────────────────────────
  const updateSets = useCallback((index: number, text: string) => {
    // empty → undefined; otherwise parse to a non-negative int
    const trimmed = text.trim();
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10);
    const next = trimmed === '' || Number.isNaN(parsed) ? undefined : parsed;
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, target_sets: next } : it)),
    );
  }, []);

  const updateReps = useCallback((index: number, text: string) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, target_reps: text } : it)),
    );
  }, []);

  // ── Reorder (swap with neighbour) ────────────────────────────────────────
  const moveUp = useCallback((index: number) => {
    setItems((prev) => {
      if (index <= 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  // ── Remove ───────────────────────────────────────────────────────────────
  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Add (from ExercisePicker) ────────────────────────────────────────────
  const handlePicked = useCallback((ex: Exercise) => {
    setItems((prev) => {
      // Guard against duplicate exercise_id.
      if (prev.some((it) => it.exercise_id === ex.id)) return prev;
      return [
        ...prev,
        { exercise_id: ex.id, name: ex.name, target_sets: 3, target_reps: '8-12' },
      ];
    });
    setPickerVisible(false);
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!routine) return;
    const trimmed = name.trim();
    if (!trimmed) return; // Save blocked while name empty (button also disabled)
    setSaving(true);
    try {
      const updated = await updateRoutine(routine.id, { name: trimmed, exercises: items });
      onSaved(updated);
      onClose();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save routine');
    } finally {
      setSaving(false);
    }
  }, [routine, name, items, onSaved, onClose]);

  const saveDisabled = saving || name.trim().length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Close editor"
            >
              <Ionicons name="chevron-down" size={22} color={stepperPalette.muted} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>Edit routine</Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saveDisabled}
              style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Save routine"
            >
              {saving ? (
                <ActivityIndicator size="small" color={stepperPalette.accentInk} />
              ) : (
                <Text style={styles.saveLabel}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Name ──────────────────────────────────────────────────── */}
            <Text style={styles.fieldLabel}>NAME</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Push A"
              placeholderTextColor={stepperPalette.muted}
              maxLength={100}
              returnKeyType="done"
            />

            {/* ── Exercises ─────────────────────────────────────────────── */}
            <Text style={[styles.fieldLabel, styles.exercisesLabel]}>EXERCISES</Text>

            {items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  No exercises yet — tap ＋ Add exercise.
                </Text>
              </View>
            ) : (
              items.map((item, index) => (
                <View key={`${item.exercise_id || item.name}-${index}`} style={styles.exRow}>
                  <View style={styles.exRowTop}>
                    <Text style={styles.exName} numberOfLines={1}>{item.name}</Text>
                    <TouchableOpacity
                      onPress={() => removeItem(index)}
                      style={styles.iconBtn}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.name}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={stepperPalette.muted} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.exRowBottom}>
                    {/* Sets / Reps */}
                    <View style={styles.targetGroup}>
                      <Text style={styles.targetLabel}>SETS</Text>
                      <TextInput
                        style={styles.targetInput}
                        value={item.target_sets != null ? String(item.target_sets) : ''}
                        onChangeText={(t) => updateSets(index, t)}
                        keyboardType="number-pad"
                        placeholder="—"
                        placeholderTextColor={stepperPalette.muted}
                        selectTextOnFocus
                        maxLength={2}
                        accessibilityLabel={`Target sets for ${item.name}`}
                      />
                    </View>
                    <View style={styles.targetGroup}>
                      <Text style={styles.targetLabel}>REPS</Text>
                      <TextInput
                        style={styles.targetInput}
                        value={item.target_reps ?? ''}
                        onChangeText={(t) => updateReps(index, t)}
                        placeholder="8-12"
                        placeholderTextColor={stepperPalette.muted}
                        selectTextOnFocus
                        maxLength={12}
                        accessibilityLabel={`Target reps for ${item.name}`}
                      />
                    </View>

                    {/* Reorder controls */}
                    <View style={styles.reorderGroup}>
                      <TouchableOpacity
                        onPress={() => moveUp(index)}
                        disabled={index === 0}
                        style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${item.name} up`}
                      >
                        <Ionicons name="chevron-up" size={18} color={stepperPalette.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveDown(index)}
                        disabled={index === items.length - 1}
                        style={[
                          styles.reorderBtn,
                          index === items.length - 1 && styles.reorderBtnDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${item.name} down`}
                      >
                        <Ionicons name="chevron-down" size={18} color={stepperPalette.text} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* ── Add exercise ──────────────────────────────────────────── */}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Add exercise"
            >
              <Text style={styles.addLabel}>＋ Add exercise</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Exercise picker ───────────────────────────────────────────────── */}
      <ExercisePicker
        visible={pickerVisible}
        onSelect={handlePicked}
        onClose={() => setPickerVisible(false)}
      />
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: stepperPalette.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    gap: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: stepperPalette.line,
  },
  headerBtn: { padding: spacing.s1 },
  headerTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
    color: stepperPalette.text,
  },
  saveBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.s4,
    paddingBottom: spacing.s12,
  },
  fieldLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.s2,
  },
  exercisesLabel: { marginTop: spacing.s5 },
  nameInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
  },
  emptyCard: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    lineHeight: 20,
  },
  exRow: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  exRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  exName: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    marginRight: spacing.s2,
  },
  exRowBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s3,
  },
  targetGroup: {
    flex: 1,
  },
  targetLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.s1,
  },
  targetInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    textAlign: 'center',
  },
  reorderGroup: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  reorderBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    backgroundColor: stepperPalette.frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.3 },
  iconBtn: { padding: spacing.s1 },
  addBtn: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    marginTop: spacing.s1,
  },
  addLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
  },
});
