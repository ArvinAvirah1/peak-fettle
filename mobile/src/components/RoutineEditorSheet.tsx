/**
 * RoutineEditorSheet — full routine exercise-editor.
 *
 * Replaces the old name-only "Edit" modal on the Routines page. Lets the user:
 *   • rename the routine
 *   • add exercises inline (via the shared ExercisePicker — option 10)
 *   • remove exercises (trash button)
 *   • reorder exercises (long-press up/down chevrons — option 9; no drag library
 *     is used here because this is a fullScreen Modal where a nested gesture
 *     root is fragile, and the chevrons are already robust + accessible)
 *   • edit each exercise's target sets (numeric) and target reps (string)
 *   • Save → full replace via the tier-branched data module (local-first for
 *     free users — instant on-device persist with a subtle "Saved" state, no
 *     network; REST for Pro). Option 8/11.
 *
 * Layout: SafeAreaView header + a sticky Save bar pinned above the bottom inset.
 *
 * Visual style matches StepperLogger / routines.tsx (dark cards, teal accent).
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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from './Icon';
import { stepperPalette, fontFamily, fontSize, spacing, radius } from '../theme/tokens';
import { Routine, RoutineExercise, updateRoutine } from '../data/routines';
import { useAuth } from '../hooks/useAuth';
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
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState<string>(routine?.name ?? '');
  const [items, setItems] = useState<RoutineExercise[]>(routine?.exercises ?? []);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  // Option 11: subtle "Saved" affirmation after a successful local-first save.
  const [savedFlash, setSavedFlash] = useState(false);

  // Re-seed local state whenever the target routine changes (e.g. tapping Edit
  // on a different routine, or reopening after a save).
  useEffect(() => {
    setName(routine?.name ?? '');
    setItems(routine?.exercises ?? []);
    setSavedFlash(false);
  }, [routine]);

  // ── Per-exercise field edits ─────────────────────────────────────────────
  const updateSets = useCallback((index: number, text: string) => {
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

  // ── Add (from ExercisePicker — inline, without leaving the editor) ────────
  const handlePicked = useCallback((ex: Exercise) => {
    setItems((prev) => {
      // de-dupe by id, but only when ids are truthy (template exercises carry
      // an undefined exercise_id — never treat two of those as duplicates).
      if (ex.id && prev.some((it) => it.exercise_id === ex.id)) return prev;
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
      const updated = await updateRoutine(user, routine.id, { name: trimmed, exercises: items });
      onSaved(updated);
      // Brief "Saved" affirmation (option 11). Close shortly after so the user
      // sees the on-device persist confirmation without a network spinner.
      setSavedFlash(true);
      setTimeout(() => {
        setSavedFlash(false);
        onClose();
      }, 450);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save routine');
    } finally {
      setSaving(false);
    }
  }, [routine, name, items, user, onSaved, onClose]);

  const saveDisabled = saving || name.trim().length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* ── Header (within the safe-area top inset) ─────────────────── */}
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
            {savedFlash ? (
              <View style={styles.savedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={stepperPalette.accent} />
                <Text style={styles.savedBadgeText}>Saved</Text>
              </View>
            ) : (
              <View style={styles.headerBtn} />
            )}
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

            {/* ── Add exercise (inline picker — option 10) ──────────────── */}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Add exercise"
            >
              <Text style={styles.addLabel}>＋ Add exercise</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* ── Sticky Save bar (above the bottom inset — option 8) ──────── */}
          <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, spacing.s3) }]}>
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
                <Text style={styles.saveLabel}>Save routine</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Exercise picker (opens over the editor — stays in context) ─────── */}
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
  headerBtn: { padding: spacing.s1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
    color: stepperPalette.text,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s2,
    minHeight: 44,
  },
  savedBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accent,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: spacing.s4,
    paddingBottom: spacing.s8,
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
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    backgroundColor: stepperPalette.frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.3 },
  iconBtn: { padding: spacing.s1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  // Sticky Save bar
  saveBar: {
    borderTopWidth: 1,
    borderTopColor: stepperPalette.line,
    backgroundColor: stepperPalette.bg,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  saveBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.accentInk,
  },
});
