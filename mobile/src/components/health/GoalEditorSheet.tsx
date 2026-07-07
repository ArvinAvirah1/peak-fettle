/**
 * GoalEditorSheet — full-screen Modal to edit the three daily health goals
 * (steps / active kcal / exercise minutes) shown as rings on the Health tab.
 *
 * Dynamic-Island safe-area rule (CLAUDE.md §3 / house rule 3): SafeAreaView /
 * useSafeAreaInsets do NOT reliably propagate inside a React Native <Modal>.
 * The header row below applies `paddingTop: Math.max(insets.top, 12)`
 * directly — same pattern as ScheduleEditorSheet.tsx / RoutineEditorSheet.tsx.
 *
 * Local-first: reads the current goals via the hook's `goals` prop and writes
 * back through `onSave` (wired to useHealthDashboard().updateGoals by the
 * caller) — no REST, no tier branch.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, spacing, radius, a11y } from '../../theme/tokens';
import type { HealthGoals } from '../../data/healthGoals';

export interface GoalEditorSheetProps {
  visible: boolean;
  goals: HealthGoals;
  onClose: () => void;
  onSave: (patch: Partial<HealthGoals>) => Promise<void>;
}

export function GoalEditorSheet({
  visible,
  goals,
  onClose,
  onSave,
}: GoalEditorSheetProps): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [stepsText, setStepsText] = useState(String(goals.stepsDaily));
  const [kcalText, setKcalText] = useState(String(goals.activeKcalDaily));
  const [exerciseText, setExerciseText] = useState(String(goals.exerciseMinutesDaily));
  const [saving, setSaving] = useState(false);

  // Reset drafts to the latest persisted goals every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStepsText(String(goals.stepsDaily));
    setKcalText(String(goals.activeKcalDaily));
    setExerciseText(String(goals.exerciseMinutesDaily));
  }, [visible, goals]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch: Partial<HealthGoals> = {};
      const steps = Number.parseInt(stepsText, 10);
      const kcal = Number.parseInt(kcalText, 10);
      const exercise = Number.parseInt(exerciseText, 10);
      if (Number.isFinite(steps) && steps > 0) patch.stepsDaily = steps;
      if (Number.isFinite(kcal) && kcal > 0) patch.activeKcalDaily = kcal;
      if (Number.isFinite(exercise) && exercise > 0) patch.exerciseMinutesDaily = exercise;
      await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={[styles.root, { backgroundColor: c.bgPrimary }]} edges={['top', 'bottom']}>
        {/* Dynamic-Island-safe header: explicit paddingTop, not relying on SafeAreaView propagation inside a Modal. */}
        <View
          style={[
            styles.header,
            { borderBottomColor: c.borderDefault, paddingTop: Math.max(insets.top, 12) },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('screens:healthDashboard.goalEditorClose')}
            style={styles.headerIconBtn}
            hitSlop={8}
          >
            <Ionicons name="close" size={24} color={c.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: c.textPrimary, fontWeight: fontWeight.bold }]} numberOfLines={1}>
            {t('screens:healthDashboard.goalEditorTitle')}
          </Text>
          <View style={styles.headerIconBtn} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={{ padding: spacing.s4, paddingBottom: spacing.s8, gap: spacing.s5 }}
            keyboardShouldPersistTaps="handled"
          >
            <GoalField
              label={t('screens:healthDashboard.goalStepsLabel')}
              unit={t('screens:healthDashboard.unitSteps')}
              value={stepsText}
              onChangeText={setStepsText}
            />
            <GoalField
              label={t('screens:healthDashboard.goalActiveKcalLabel')}
              unit={t('screens:healthDashboard.unitKcal')}
              value={kcalText}
              onChangeText={setKcalText}
            />
            <GoalField
              label={t('screens:healthDashboard.goalExerciseMinutesLabel')}
              unit={t('screens:healthDashboard.unitMin')}
              value={exerciseText}
              onChangeText={setExerciseText}
            />
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={[styles.stickyBar, { backgroundColor: c.bgPrimary, borderTopColor: c.borderDefault }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: c.accentDefault }, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t('screens:healthDashboard.goalEditorSave')}
          >
            <Text style={[styles.saveButtonText, { color: theme.components.buttonPrimaryText }]}>
              {t('screens:healthDashboard.goalEditorSave')}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

interface GoalFieldProps {
  label: string;
  unit: string;
  value: string;
  onChangeText: (v: string) => void;
}

function GoalField({ label, unit, value, onChangeText }: GoalFieldProps): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const c = theme.colors;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold }]}>{label}</Text>
      <View style={[styles.fieldInputRow, { backgroundColor: c.bgTertiary, borderColor: c.borderDefault }]}>
        <TextInput
          style={[styles.fieldInput, { color: c.textPrimary, fontVariant: ['tabular-nums'] }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="number-pad"
          maxLength={6}
          accessibilityLabel={label}
        />
        <Text style={[styles.fieldUnit, { color: c.textTertiary }]}>{unit}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerIconBtn: {
    minWidth: 44,
    minHeight: a11y.minTouchTarget,
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.bodyMd,
  },
  field: {
    gap: spacing.s2,
  },
  fieldLabel: {
    fontSize: fontSize.bodySm,
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    minHeight: a11y.minTouchTarget,
    gap: spacing.s2,
  },
  fieldInput: {
    flex: 1,
    fontSize: fontSize.bodyLg,
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.s2,
  },
  fieldUnit: {
    fontSize: fontSize.bodySm,
  },
  stickyBar: {
    padding: spacing.s4,
    borderTopWidth: 1,
  },
  saveButton: {
    borderRadius: radius.md,
    minHeight: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: fontSize.bodyMd,
    fontWeight: '700',
  },
});
