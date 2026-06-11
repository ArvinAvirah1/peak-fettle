/**
 * Training Survey screen — re-editable Training Engine profile.
 *
 * 2026-06-11 (spec §5, Agent C)
 *
 * Same steps as onboarding steps 3–8 (training_goal, sessions_per_week,
 * session_minutes, equipment, goal_weight_kg, season_phase), but presented
 * as a standalone settings screen so users can update their answers any time.
 *
 * Entry points:
 *   - profile.tsx → "Training profile" row
 *
 * Pre-fills from the authenticated user profile if those fields are present.
 * On save: PATCH /users/profile with all answered fields.
 * On success: router.back()
 *
 * Steps (internal):
 *   1. training_goal
 *   2. sessions_per_week
 *   3. session_minutes
 *   4. equipment (multi-select)
 *   5. goal_weight_kg (optional)
 *   6. season_phase (conditional — only for running/cycling/swimming/other)
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout } from '../src/components/ui';
import { patchProfile } from '../src/api/user';
import type {
  TrainingGoal,
  SessionMinutes,
  EquipmentItem,
  SeasonPhase,
} from '../src/api/user';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TRAINING_GOAL_OPTIONS: { label: string; value: TrainingGoal; subtitle?: string }[] = [
  { label: 'Strength',          value: 'strength',          subtitle: 'Maximise lifts — 1–5 rep focus' },
  { label: 'Muscle Building',   value: 'hypertrophy',       subtitle: 'Size & definition — 6–15 rep range' },
  { label: 'Endurance',         value: 'endurance',         subtitle: 'Aerobic capacity & stamina' },
  { label: 'Sport Performance', value: 'sport_performance', subtitle: 'Power, speed & sport-specific fitness' },
  { label: 'General Fitness',   value: 'general_fitness',   subtitle: 'Health, movement quality & consistency' },
];

const SESSIONS_PER_WEEK_OPTIONS: number[] = [1, 2, 3, 4, 5, 6, 7];

const SESSION_MINUTES_OPTIONS: { label: string; value: SessionMinutes; subtitle: string }[] = [
  { label: '15 min', value: 15, subtitle: 'Express' },
  { label: '30 min', value: 30, subtitle: 'Short' },
  { label: '45 min', value: 45, subtitle: 'Standard' },
  { label: '60 min', value: 60, subtitle: 'Full session' },
  { label: '90 min', value: 90, subtitle: 'Extended' },
];

const EQUIPMENT_OPTIONS: { label: string; value: EquipmentItem }[] = [
  { label: 'Barbell',     value: 'barbell'    },
  { label: 'Dumbbell',    value: 'dumbbell'   },
  { label: 'Kettlebell',  value: 'kettlebell' },
  { label: 'Machine',     value: 'machine'    },
  { label: 'Cable',       value: 'cable'      },
  { label: 'Bodyweight',  value: 'bodyweight' },
  { label: 'Bands',       value: 'bands'      },
  { label: 'Bench',       value: 'bench'      },
  { label: 'Rack',        value: 'rack'       },
  { label: 'Pull-up bar', value: 'pullup_bar' },
  { label: 'Bike',        value: 'bike'       },
  { label: 'Treadmill',   value: 'treadmill'  },
  { label: 'Pool',        value: 'pool'       },
  { label: 'Track',       value: 'track'      },
];

const TEAM_SPORT_DISCIPLINES = new Set([
  'running', 'cycling', 'swimming', 'other',
]);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OptionButton<T>({
  label,
  subtitle,
  value,
  selected,
  onPress,
}: {
  label: string;
  subtitle?: string;
  value: T;
  selected: boolean;
  onPress: (v: T) => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.option,
        {
          backgroundColor: selected
            ? (theme.colors.accentDefault + '1A')
            : theme.colors.bgElevated,
          borderColor: selected
            ? theme.colors.accentDefault
            : theme.colors.borderDefault,
          borderWidth: selected ? 1.5 : 1,
        },
      ]}
      onPress={() => onPress(value)}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.optionLabelGroup}>
        <Text style={[styles.optionLabel, { color: theme.colors.textPrimary }]}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={[styles.optionSubtitle, { color: theme.colors.textTertiary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected && (
        <Text style={[styles.optionCheckmark, { color: theme.colors.accentDefault }]}>
          {'✓'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function ChipButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected
            ? theme.colors.accentDefault
            : theme.colors.bgElevated,
          borderColor: selected
            ? theme.colors.accentDefault
            : theme.colors.borderDefault,
        },
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected
              ? theme.components.buttonPrimaryText
              : theme.colors.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MultiChipButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: selected
            ? (theme.colors.accentDefault + '22')
            : theme.colors.bgElevated,
          borderColor: selected
            ? theme.colors.accentDefault
            : theme.colors.borderDefault,
          borderWidth: selected ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <Text
        style={[
          styles.chipText,
          {
            color: selected
              ? theme.colors.accentDefault
              : theme.colors.textSecondary,
            fontWeight: selected ? fontWeight.semibold : fontWeight.regular,
          },
        ]}
      >
        {selected ? `✓ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Section header inside the screen
// ---------------------------------------------------------------------------

function SurveySection({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.surveySection}>
      <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.sectionSubtitle, { color: theme.colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TrainingSurveyScreen(): React.ReactElement {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();

  // Initialise from user profile if available
  const [trainingGoal, setTrainingGoal] = useState<TrainingGoal | null>(
    (user as any)?.training_goal ?? null
  );
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number | null>(
    (user as any)?.sessions_per_week ?? null
  );
  const [sessionMinutes, setSessionMinutes] = useState<SessionMinutes | null>(
    (user as any)?.session_minutes ?? null
  );
  const [equipmentProfile, setEquipmentProfile] = useState<Set<EquipmentItem>>(
    () => new Set<EquipmentItem>((user as any)?.equipment_profile ?? [])
  );
  const [goalWeightKg, setGoalWeightKg] = useState<string>(
    (user as any)?.goal_weight_kg != null
      ? String((user as any).goal_weight_kg)
      : ''
  );
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(
    (user as any)?.season_phase ?? null
  );

  const [isSaving, setIsSaving] = useState(false);

  const discipline: string | null = user?.primary_discipline ?? null;
  const showSeasonStep = TEAM_SPORT_DISCIPLINES.has(discipline as string);

  const toggleEquipment = useCallback((item: EquipmentItem) => {
    setEquipmentProfile((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const payload: Parameters<typeof patchProfile>[0] = {};
      if (trainingGoal !== null)    payload.training_goal = trainingGoal;
      if (sessionsPerWeek !== null) payload.sessions_per_week = sessionsPerWeek;
      if (sessionMinutes !== null)  payload.session_minutes = sessionMinutes;
      if (equipmentProfile.size > 0) payload.equipment_profile = Array.from(equipmentProfile);
      const gw = parseFloat(goalWeightKg);
      if (!isNaN(gw) && gw > 0)     payload.goal_weight_kg = gw;
      else if (goalWeightKg.trim() === '') payload.goal_weight_kg = null;
      if (showSeasonStep)            payload.season_phase = seasonPhase ?? null;

      await patchProfile(payload);
      router.back();
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    trainingGoal, sessionsPerWeek, sessionMinutes, equipmentProfile,
    goalWeightKg, seasonPhase, showSeasonStep, router,
  ]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ScreenLayout horizontalPadding={false}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backButton}
          >
            <Text style={[styles.backButtonText, { color: theme.colors.accentDefault }]}>
              ‹ Back
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]}>
          Training Profile
        </Text>
        <Text style={[styles.screenSubtitle, { color: theme.colors.textSecondary }]}>
          These answers shape every plan the Training Engine builds for you.
          Update them any time — your next plan will reflect the change.
        </Text>

        {/* ── Section 1: Training goal ── */}
        <SurveySection
          title="Training goal"
          subtitle="What are you optimising for right now?"
        >
          <View style={styles.optionGroup}>
            {TRAINING_GOAL_OPTIONS.map((opt) => (
              <OptionButton<TrainingGoal>
                key={opt.value}
                label={opt.label}
                subtitle={opt.subtitle}
                value={opt.value}
                selected={trainingGoal === opt.value}
                onPress={setTrainingGoal}
              />
            ))}
          </View>
        </SurveySection>

        {/* ── Section 2: Sessions per week ── */}
        <SurveySection
          title="Sessions per week"
          subtitle="How many training sessions can you commit to?"
        >
          <View style={styles.chipRow}>
            {SESSIONS_PER_WEEK_OPTIONS.map((n) => (
              <ChipButton
                key={n}
                label={String(n)}
                selected={sessionsPerWeek === n}
                onPress={() => setSessionsPerWeek(n)}
              />
            ))}
          </View>
          <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
            Engine defaults to 3 sessions if not set.
          </Text>
        </SurveySection>

        {/* ── Section 3: Session length ── */}
        <SurveySection
          title="Session length"
          subtitle="How long is each training session?"
        >
          <View style={styles.optionGroup}>
            {SESSION_MINUTES_OPTIONS.map((opt) => (
              <OptionButton<SessionMinutes>
                key={opt.value}
                label={opt.label}
                subtitle={opt.subtitle}
                value={opt.value}
                selected={sessionMinutes === opt.value}
                onPress={setSessionMinutes}
              />
            ))}
          </View>
        </SurveySection>

        {/* ── Section 4: Equipment ── */}
        <SurveySection
          title="Available equipment"
          subtitle="The engine only prescribes exercises you can actually perform."
        >
          <View style={styles.chipGrid}>
            {EQUIPMENT_OPTIONS.map((opt) => (
              <MultiChipButton
                key={opt.value}
                label={opt.label}
                selected={equipmentProfile.has(opt.value)}
                onPress={() => toggleEquipment(opt.value)}
              />
            ))}
          </View>
          {equipmentProfile.size === 0 && (
            <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
              None selected — engine uses full gym default.
            </Text>
          )}
        </SurveySection>

        {/* ── Section 5: Goal weight (optional) ── */}
        <SurveySection
          title="Goal weight (optional)"
          subtitle="Target body weight in kg, if applicable. Leave blank to skip."
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={[
              styles.inputRow,
              { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgElevated },
            ]}>
              <TextInput
                style={[styles.weightInput, { color: theme.colors.textPrimary }]}
                placeholder="e.g. 80"
                placeholderTextColor={theme.colors.textTertiary}
                keyboardType="decimal-pad"
                value={goalWeightKg}
                onChangeText={setGoalWeightKg}
                accessibilityLabel="Goal weight in kg"
                maxLength={6}
              />
              <Text style={[styles.weightUnit, { color: theme.colors.textTertiary }]}>kg</Text>
            </View>
          </KeyboardAvoidingView>
        </SurveySection>

        {/* ── Section 6: Season phase (conditional) ── */}
        {showSeasonStep && (
          <SurveySection
            title="Season phase"
            subtitle="Your competitive phase affects how the engine balances load and recovery."
          >
            <View style={styles.optionGroup}>
              <OptionButton<SeasonPhase>
                label="Off season"
                subtitle="Build base fitness and strength"
                value="off_season"
                selected={seasonPhase === 'off_season'}
                onPress={setSeasonPhase}
              />
              <OptionButton<SeasonPhase>
                label="In season"
                subtitle="Maintain fitness without overloading"
                value="in_season"
                selected={seasonPhase === 'in_season'}
                onPress={setSeasonPhase}
              />
            </View>
          </SurveySection>
        )}

        {/* ── Save button ── */}
        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: theme.colors.accentDefault },
            isSaving && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save training profile"
        >
          {isSaving ? (
            <ActivityIndicator color={theme.components.buttonPrimaryText} />
          ) : (
            <Text style={[styles.saveButtonText, { color: theme.components.buttonPrimaryText }]}>
              Save Training Profile
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomPad} />
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 28,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: -8,
  },
  backButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: 12,
  },
  backButtonText: {
    fontSize: fontSize.bodyMd,    // E-003
  },

  // Screen title
  screenTitle: {
    fontSize: fontSize.heading2,  // E-003
    fontWeight: fontWeight.bold,  // E-003
    lineHeight: 32,
    marginTop: -8,
  },
  screenSubtitle: {
    fontSize: fontSize.bodySm,   // E-003
    lineHeight: 20,
    marginTop: -16,
  },

  // Survey section
  surveySection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: fontSize.bodyLg,       // E-003
    fontWeight: fontWeight.semibold, // E-003
  },
  sectionSubtitle: {
    fontSize: fontSize.bodySm,  // E-003
    lineHeight: 20,
    marginTop: -4,
  },

  // Option cards
  optionGroup: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionLabelGroup: { flex: 1, gap: 2 },
  optionLabel: {
    fontSize: fontSize.bodyMd,   // E-003
  },
  optionSubtitle: {
    fontSize: fontSize.caption,  // E-003
    lineHeight: 16,
  },
  optionCheckmark: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold, // E-003
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.bodySm,  // E-003
  },

  // Goal weight input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  weightInput: {
    flex: 1,
    fontSize: fontSize.bodyLg,     // E-003
    fontWeight: fontWeight.medium, // E-003
    minHeight: 36,
  },
  weightUnit: {
    fontSize: fontSize.bodyMd,     // E-003
  },

  hintText: {
    fontSize: fontSize.caption,    // E-003
    lineHeight: 18,
  },

  // Save button
  saveButton: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: {
    fontSize: fontSize.bodyMd,        // E-003
    fontWeight: fontWeight.semibold,  // E-003
  },

  bottomPad: { height: 32 },
});
