/**
 * Routines page — TICKET-061, Option A
 * Dedicated push screen for managing user-saved workout routines.
 *
 * Sections:
 *   • Header: "Routines" + "＋ New" button
 *   • YOURS: list of user routines with Start / Edit / Delete actions
 *   • STARTER SPLITS: template chips — tap to duplicate into user routines
 *
 * "▶ Start" → navigates back to log tab with ?routineId=xxx so the Log tab
 * auto-opens the Focus Stepper for that routine.
 *
 * UI follows set-logging-stepper-flow.html §2, Option A.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/ThemeContext';
import { fontFamily, fontSize, spacing, radius, stepperPalette } from '../src/theme/tokens';
import {
  getRoutines,
  createRoutine,
  patchRoutine,
  deleteRoutine,
  Routine,
} from '../src/api/routines';
import { getTemplates, WorkoutTemplate } from '../src/api/templates';

// ── Types ────────────────────────────────────────────────────────────────────

type SheetMode = 'new' | 'edit' | null;

// ── Component ────────────────────────────────────────────────────────────────

export default function RoutinesPage(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;

  // ── State ─────────────────────────────────────────────────────────────────
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [editTarget, setEditTarget] = useState<Routine | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        getRoutines(),
        getTemplates({ discipline: 'strength' }),
      ]);
      setRoutines(r);
      setTemplates(t.slice(0, 8)); // show up to 8 starter splits
    } catch {
      // silently fail; user sees empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNewSheet = useCallback(() => {
    setEditTarget(null);
    setNameInput('');
    setSheetMode('new');
  }, []);

  const openEditSheet = useCallback((routine: Routine) => {
    setEditTarget(routine);
    setNameInput(routine.name);
    setSheetMode('edit');
  }, []);

  const closeSheet = useCallback(() => {
    setSheetMode(null);
    setEditTarget(null);
    setNameInput('');
  }, []);

  const handleSave = useCallback(async () => {
    const name = nameInput.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (sheetMode === 'new') {
        const r = await createRoutine({ name, exercises: [] });
        setRoutines((prev) => [r, ...prev]);
      } else if (sheetMode === 'edit' && editTarget) {
        const r = await patchRoutine(editTarget.id, { name });
        setRoutines((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      }
      closeSheet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save routine');
    } finally {
      setSaving(false);
    }
  }, [nameInput, sheetMode, editTarget, closeSheet]);

  const handleDelete = useCallback((routine: Routine) => {
    Alert.alert(
      'Delete routine',
      `Delete "${routine.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRoutine(routine.id);
              setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
            } catch {
              Alert.alert('Error', 'Could not delete routine');
            }
          },
        },
      ],
    );
  }, []);

  /** Duplicate a starter split template into a user routine */
  const handleDuplicateTemplate = useCallback(async (tpl: WorkoutTemplate) => {
    setSaving(true);
    try {
      // Build exercises from first template session if available
      const exercises = (tpl.sessions?.[0]?.exercises ?? []).map((ex) => ({
        exercise_id: '',           // no UUID for template exercises yet
        name: ex.exercise_name,
        target_sets: ex.sets,
        target_reps: ex.reps,
      }));
      const r = await createRoutine({ name: tpl.name, exercises });
      setRoutines((prev) => [r, ...prev]);
      Alert.alert('Routine added', `"${tpl.name}" has been added to your routines.`);
    } catch {
      Alert.alert('Error', 'Could not duplicate template');
    } finally {
      setSaving(false);
    }
  }, []);

  /** Start a routine → navigate to log tab with routineId param */
  const handleStart = useCallback((routine: Routine) => {
    // expo-router: navigate to log tab with search param
    router.push(`/(tabs)/log?routineId=${routine.id}&routineName=${encodeURIComponent(routine.name)}`);
  }, [router]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { backgroundColor: c.bgPrimary }]}>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <View style={[styles.pageHeader, { borderBottomColor: c.borderDefault }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: c.textPrimary }]}>Routines</Text>
        <TouchableOpacity
          style={[styles.newPill, { backgroundColor: c.accentDefault }]}
          onPress={openNewSheet}
          accessibilityRole="button"
          accessibilityLabel="New routine"
        >
          <Text style={[styles.newPillLabel, { color: theme.components.buttonPrimaryText }]}>＋ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={c.accentDefault} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── YOURS section ──────────────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>YOURS</Text>

          {routines.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              <Text style={[styles.emptyText, { color: c.textTertiary }]}>
                No routines yet — tap ＋ New to create one, or duplicate a starter split below.
              </Text>
            </View>
          ) : (
            routines.map((routine) => (
              <View
                key={routine.id}
                style={[styles.routineCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}
              >
                <View style={styles.routineCardTop}>
                  <Text style={[styles.routineName, { color: c.textPrimary }]} numberOfLines={1}>
                    {routine.name}
                  </Text>
                  <Text style={[styles.routineMeta, { color: c.textTertiary }]}>
                    {routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={styles.routineCardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtnPrimary, { borderColor: c.accentDefault }]}
                    onPress={() => handleStart(routine)}
                    accessibilityRole="button"
                    accessibilityLabel={`Start ${routine.name}`}
                  >
                    <Ionicons name="play" size={13} color={c.accentDefault} />
                    <Text style={[styles.actionBtnPrimaryLabel, { color: c.accentDefault }]}>Start</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtnGhost, { borderColor: c.borderDefault }]}
                    onPress={() => openEditSheet(routine)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${routine.name}`}
                  >
                    <Ionicons name="pencil" size={13} color={c.textSecondary} />
                    <Text style={[styles.actionBtnGhostLabel, { color: c.textSecondary }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(routine)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${routine.name}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={c.statusError} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* ── STARTER SPLITS section ────────────────────────────────── */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: spacing.s4 }]}>
            STARTER SPLITS · tap to duplicate
          </Text>
          <View style={styles.chipsRow}>
            {templates.map((tpl) => (
              <TouchableOpacity
                key={tpl.id}
                style={[styles.templateChip, { borderColor: c.borderDefault, backgroundColor: c.bgSecondary }]}
                onPress={() => handleDuplicateTemplate(tpl)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Add ${tpl.name} to your routines`}
              >
                <Text style={[styles.templateChipLabel, { color: c.textSecondary }]} numberOfLines={1}>
                  {tpl.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── New / Edit name sheet ──────────────────────────────────────────── */}
      <Modal
        visible={sheetMode !== null}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.sheetBackdrop} onPress={closeSheet} />
        <View style={[styles.sheet, { backgroundColor: stepperPalette.card, borderColor: stepperPalette.accentLine }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>
            {sheetMode === 'new' ? 'New routine' : 'Rename routine'}
          </Text>
          <TextInput
            style={styles.sheetInput}
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="e.g. Push A"
            placeholderTextColor={stepperPalette.muted}
            autoFocus
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.sheetCancelBtn} onPress={closeSheet}>
              <Text style={styles.sheetCancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sheetSaveBtn, !nameInput.trim() && styles.sheetSaveBtnDisabled]}
              onPress={handleSave}
              disabled={saving || !nameInput.trim()}
            >
              {saving
                ? <ActivityIndicator size="small" color={stepperPalette.accentInk} />
                : <Text style={styles.sheetSaveLabel}>{sheetMode === 'new' ? 'Create' : 'Save'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    gap: spacing.s3,
  },
  backBtn: { padding: spacing.s1 },
  pageTitle: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fontSize.heading3,
  },
  newPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  newPillLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.s4, paddingBottom: spacing.s12 },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    letterSpacing: 0.5,
    marginBottom: spacing.s3,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
  routineCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  routineCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  routineName: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    flex: 1,
  },
  routineMeta: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
  },
  routineCardActions: {
    flexDirection: 'row',
    gap: spacing.s2,
    alignItems: 'center',
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
  },
  actionBtnPrimaryLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
  },
  actionBtnGhost: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
  },
  actionBtnGhostLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.bodySm,
  },
  deleteBtn: { padding: spacing.s2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2 },
  templateChip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1 + 2,
  },
  templateChipLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
  },
  // Sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    padding: spacing.s4,
    paddingBottom: spacing.s12,
  },
  sheetHandle: {
    width: 34,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    alignSelf: 'center',
    marginBottom: spacing.s4,
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyLg,
    color: stepperPalette.text,
    marginBottom: spacing.s3,
  },
  sheetInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    marginBottom: spacing.s4,
  },
  sheetActions: { flexDirection: 'row', gap: spacing.s3 },
  sheetCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  sheetCancelLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
  },
  sheetSaveBtn: {
    flex: 1,
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  sheetSaveBtnDisabled: { opacity: 0.4 },
  sheetSaveLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.accentInk,
  },
});
