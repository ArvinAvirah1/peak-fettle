/**
 * Post-registration onboarding screen — biological sex + primary discipline +
 * Training Engine survey + theme + HealthKit.
 *
 * TICKET-038 | ROADMAP item 1.6 | 2026-05-10
 * E-007 update (2026-05-17): added Step 3 — theme selection (spec §6.1).
 * P0-003 update (2026-05-17): added Step 4 — HealthKit permission (spec §6.1);
 *   updated OptionButton to tap-card style.
 * 2026-06-11: added Training Engine survey steps 3–8 after discipline (spec §5).
 *   Steps: training_goal, sessions_per_week, session_minutes, equipment
 *          (multi-select), goal_weight_kg (optional), season_phase (conditional).
 *   Total flow: sex → discipline → training_goal → sessions_per_week →
 *               session_minutes → equipment → goal_weight_kg → season_phase
 *               (skipped for non-team disciplines) → theme → HealthKit
 *
 * All steps are skippable. PATCH /users/profile on completion with new fields.
 * Theme is persisted via ThemeContext (AsyncStorage + Supabase) during selection.
 * On success or skip: router.replace('/(tabs)/')
 */

import { useState, useCallback } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../src/api/client';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight } from '../src/theme/tokens';
import { ThemeSelectorInline } from '../src/components/ThemeSelector';
import { ScreenLayout } from '../src/components/ui';
import type {
  TrainingGoal,
  SessionMinutes,
  EquipmentItem,
  SeasonPhase,
} from '../src/api/user';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SexOption = 'MALE' | 'FEMALE' | 'UNDISCLOSED' | null;
type Discipline =
  | 'powerlifting'
  | 'weightlifting'
  | 'general_strength'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'other'
  | null;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SEX_OPTIONS: { label: string; value: SexOption }[] = [
  { label: 'Male',               value: 'MALE'        },
  { label: 'Female',             value: 'FEMALE'      },
  { label: "I'd rather not say", value: 'UNDISCLOSED' },
];

const DISCIPLINE_OPTIONS: { label: string; value: Discipline; subtitle?: string }[] = [
  { label: 'Powerlifting',          value: 'powerlifting'    },
  { label: 'Weightlifting',         value: 'weightlifting',  subtitle: 'Olympic lifting — snatch, clean & jerk' },
  { label: 'Gym / General Fitness', value: 'general_strength' },
  { label: 'Running',               value: 'running'         },
  { label: 'Cycling',               value: 'cycling'         },
  { label: 'Swimming',              value: 'swimming'        },
  { label: 'Other / Mixed',         value: 'other'           },
];

const TRAINING_GOAL_OPTIONS: { label: string; value: TrainingGoal; subtitle?: string }[] = [
  { label: 'Strength',          value: 'strength',          subtitle: 'Maximise lifts — 1–5 rep focus' },
  { label: 'Muscle Building',   value: 'hypertrophy',       subtitle: 'Size & definition — 6–15 rep range' },
  { label: 'Endurance',         value: 'endurance',         subtitle: 'Aerobic capacity & stamina' },
  { label: 'Sport Performance', value: 'sport_performance', subtitle: 'Power, speed & sport-specific fitness' },
  { label: 'General Fitness',   value: 'general_fitness',   subtitle: 'Health, movement quality & consistency' },
];

const SESSIONS_PER_WEEK_OPTIONS: { label: string; value: number }[] = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
];

const SESSION_MINUTES_OPTIONS: { label: string; value: SessionMinutes; subtitle?: string }[] = [
  { label: '15 min',  value: 15,  subtitle: 'Express — one quality set' },
  { label: '30 min',  value: 30,  subtitle: 'Short — quality + warm-up' },
  { label: '45 min',  value: 45,  subtitle: 'Standard — quality + secondary' },
  { label: '60 min',  value: 60,  subtitle: 'Full session' },
  { label: '90 min',  value: 90,  subtitle: 'Extended — full + accessories' },
];

const EQUIPMENT_OPTIONS: { label: string; value: EquipmentItem }[] = [
  { label: 'Barbell',      value: 'barbell'     },
  { label: 'Dumbbell',     value: 'dumbbell'    },
  { label: 'Kettlebell',   value: 'kettlebell'  },
  { label: 'Machine',      value: 'machine'     },
  { label: 'Cable',        value: 'cable'       },
  { label: 'Bodyweight',   value: 'bodyweight'  },
  { label: 'Bands',        value: 'bands'       },
  { label: 'Bench',        value: 'bench'       },
  { label: 'Rack',         value: 'rack'        },
  { label: 'Pull-up bar',  value: 'pullup_bar'  },
  { label: 'Bike',         value: 'bike'        },
  { label: 'Treadmill',    value: 'treadmill'   },
  { label: 'Pool',         value: 'pool'        },
  { label: 'Track',        value: 'track'       },
];

// Disciplines that have a meaningful season concept
const TEAM_SPORT_DISCIPLINES: Set<Discipline> = new Set([
  'running', 'cycling', 'swimming', 'other',
]);

// Total step count — used for progress dots
// 1:sex 2:discipline 3:training_goal 4:sessions_per_week 5:session_minutes
// 6:equipment 7:goal_weight_kg 8:season_phase(conditional) 9:theme 10:healthkit
// We compute dynamically based on whether season_phase applies.
const STEP_THEME = (showSeason: boolean): number => showSeason ? 9 : 8;
const STEP_HEALTHKIT = (showSeason: boolean): number => showSeason ? 10 : 9;
const TOTAL_STEPS = (showSeason: boolean): number => showSeason ? 10 : 9;

// ---------------------------------------------------------------------------
// HealthKit stub (P0-003)
// ---------------------------------------------------------------------------

async function requestHealthKitPermissions(): Promise<void> {
  try {
    await AsyncStorage.setItem('@peak_fettle/healthkit_consent', 'true');
    await apiClient.patch('/health-metrics/consent', { consent: true }).catch(() => {});
  } catch {
    // silent — HealthKit may not be available on Android or simulator
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single-select tap-card button used across multiple steps. */
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
      {selected ? (
        <Text style={[styles.optionCheckmark, { color: theme.colors.accentDefault }]}>
          {'✓'}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/** Chip button used for sessions_per_week, session_minutes (single-select). */
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

/** Multi-select chip button for equipment. */
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
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();

  // Step state — 1..10 (season_phase step is skipped for non-team disciplines)
  const [step, setStep] = useState<number>(1);

  // Step 1: sex
  const [sex, setSex] = useState<SexOption>(null);
  // Step 2: discipline
  const [discipline, setDiscipline] = useState<Discipline>(null);
  // Step 3: training goal
  const [trainingGoal, setTrainingGoal] = useState<TrainingGoal | null>(null);
  // Step 4: sessions per week
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number | null>(null);
  // Step 5: session minutes
  const [sessionMinutes, setSessionMinutes] = useState<SessionMinutes | null>(null);
  // Step 6: equipment multi-select
  const [equipmentProfile, setEquipmentProfile] = useState<Set<EquipmentItem>>(new Set());
  // Step 7: goal weight (optional)
  const [goalWeightKg, setGoalWeightKg] = useState<string>('');
  // Step 8 (conditional): season phase
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Whether the season_phase step should be shown
  const showSeasonStep = TEAM_SPORT_DISCIPLINES.has(discipline);
  const stepTheme = STEP_THEME(showSeasonStep);
  const stepHealthKit = STEP_HEALTHKIT(showSeasonStep);
  const totalSteps = TOTAL_STEPS(showSeasonStep);

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

  // Submit whatever has been collected and navigate to the main app.
  const submit = useCallback(
    async (skipAll = false) => {
      setIsSubmitting(true);
      try {
        if (!skipAll) {
          const payload: Record<string, unknown> = {};
          if (sex !== null)           payload.sex = sex;
          if (discipline !== null)    payload.primary_discipline = discipline;
          if (trainingGoal !== null)  payload.training_goal = trainingGoal;
          if (sessionsPerWeek !== null) payload.sessions_per_week = sessionsPerWeek;
          if (sessionMinutes !== null)  payload.session_minutes = sessionMinutes;
          if (equipmentProfile.size > 0) payload.equipment_profile = Array.from(equipmentProfile);
          const gw = parseFloat(goalWeightKg);
          if (!isNaN(gw) && gw > 0)   payload.goal_weight_kg = gw;
          if (showSeasonStep && seasonPhase !== null) payload.season_phase = seasonPhase;

          if (Object.keys(payload).length > 0) {
            await apiClient.patch('/users/profile', payload);
          }
        }
      } catch (err) {
        // Non-fatal: profile can be filled in from Training Profile in Settings later.
        console.warn('[onboarding] profile patch failed:', err);
      } finally {
        setIsSubmitting(false);
        router.replace('/(tabs)/');
      }
    },
    [sex, discipline, trainingGoal, sessionsPerWeek, sessionMinutes,
     equipmentProfile, goalWeightKg, seasonPhase, showSeasonStep, router]
  );

  // Step 4 (HealthKit) primary CTA
  const handleConnectHealthKit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await requestHealthKitPermissions();
    } finally {
      setIsSubmitting(false);
      router.replace('/(tabs)/');
    }
  }, [router]);

  // Advance one step, skipping season_phase if discipline doesn't need it
  const advanceStep = useCallback((fromStep: number) => {
    const nextRaw = fromStep + 1;
    // Season phase step is step 8 only when showSeasonStep is true
    // If discipline has changed since selecting, re-evaluate
    const seasonStepNum = 8;
    if (nextRaw === seasonStepNum && !TEAM_SPORT_DISCIPLINES.has(discipline)) {
      // Skip season_phase step
      setStep(nextRaw + 1);
    } else {
      setStep(nextRaw);
    }
  }, [discipline]);

  const handleNextOrSubmit = useCallback(() => {
    if (step < stepTheme) {
      advanceStep(step);
    } else if (step === stepTheme) {
      advanceStep(step); // advance to HealthKit step
    } else {
      // HealthKit step — primary CTA
      handleConnectHealthKit();
    }
  }, [step, stepTheme, advanceStep, handleConnectHealthKit]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderStep = () => {
    if (step === 1) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            What is your biological sex?
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            We use this to compare you fairly against athletes with similar
            physiology. It affects your percentile ranking only.
          </Text>
          <View style={styles.optionGroup}>
            {SEX_OPTIONS.map((opt) => (
              <OptionButton<SexOption>
                key={opt.value}
                label={opt.label}
                value={opt.value}
                selected={sex === opt.value}
                onPress={setSex}
              />
            ))}
          </View>
          <View style={[styles.streakNote, { backgroundColor: theme.colors.bgElevated }]}>
            <Text style={[styles.streakNoteText, { color: theme.colors.textSecondary }]}>
              Even a 5-minute session counts. Rest days don't break your streak — only missing sessions in a row does.
            </Text>
          </View>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {"What's your primary sport?"}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            We use this to rank you against athletes in the same discipline.
          </Text>
          <View style={styles.optionGroup}>
            {DISCIPLINE_OPTIONS.map((opt) => (
              <OptionButton<Discipline>
                key={opt.value}
                label={opt.label}
                subtitle={opt.subtitle}
                value={opt.value}
                selected={discipline === opt.value}
                onPress={setDiscipline}
              />
            ))}
          </View>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            What is your main training goal?
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            The Training Engine uses this to prioritise your programme structure.
          </Text>
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
        </>
      );
    }

    if (step === 4) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            How many sessions per week?
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            How many training sessions can you commit to each week?
          </Text>
          <View style={styles.chipRow}>
            {SESSIONS_PER_WEEK_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                label={opt.label}
                selected={sessionsPerWeek === opt.value}
                onPress={() => setSessionsPerWeek(opt.value)}
              />
            ))}
          </View>
          <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
            The engine defaults to 3 sessions if you skip this.
          </Text>
        </>
      );
    }

    if (step === 5) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            How long is each session?
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            Your plan will be scaled to fit your available time.
          </Text>
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
        </>
      );
    }

    if (step === 6) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            What equipment do you have?
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            Select everything available to you. The engine only prescribes exercises
            you can actually do.
          </Text>
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
              Select at least one, or skip to use the full gym default.
            </Text>
          )}
        </>
      );
    }

    if (step === 7) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            Do you have a goal weight? (optional)
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            If you have a target body weight in mind, we factor this into your
            programme. Skip if you prefer not to set one.
          </Text>
          <View style={[styles.inputRow, { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgElevated }]}>
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
      );
    }

    // Step 8: season phase (only shown when showSeasonStep is true)
    if (step === 8 && showSeasonStep) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            Are you in or out of season?
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            Your phase affects how the engine balances training load and recovery.
          </Text>
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
        </>
      );
    }

    if (step === stepTheme) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            Choose your theme
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            Pick the look that feels right. You can change it any time in
            Settings → Appearance.
          </Text>
          <View style={styles.themeStep}>
            <ThemeSelectorInline />
          </View>
        </>
      );
    }

    // HealthKit step (last step)
    return (
      <>
        <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
          Connect Apple Health
        </Text>
        <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
          Allow Peak Fettle to read your activity and health data for smarter
          plan recommendations and automatic workout import.
        </Text>
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLastStep = step === stepHealthKit;
  const isThemeStep = step === stepTheme;
  const dotCount = totalSteps;

  return (
    <ScreenLayout horizontalPadding={false}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress dots */}
        <View style={styles.progressRow}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: theme.colors.borderDefault },
                (i + 1) === step && { backgroundColor: theme.colors.accentDefault, width: 24 },
                (i + 1) < step  && { backgroundColor: theme.colors.accentDefault, opacity: 0.4 },
              ]}
            />
          ))}
        </View>

        {/* Step content */}
        {renderStep()}

        {/* CTAs */}
        {!isLastStep ? (
          <>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.colors.accentDefault },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleNextOrSubmit}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.components.buttonPrimaryText} />
              ) : (
                <Text style={[styles.buttonText, { color: theme.components.buttonPrimaryText }]}>
                  Next
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip this step"
              onPress={() => {
                if (step === 1) {
                  submit(true);  // skip entire onboarding
                } else {
                  advanceStep(step);
                }
              }}
              disabled={isSubmitting}
            >
              <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>
                {step === 1 ? 'Skip for now' : 'Skip this step'}
              </Text>
            </TouchableOpacity>

            {step < 3 ? (
              <Text style={[styles.privacyNote, { color: theme.colors.borderDefault }]}>
                Your selections are used only to calculate your percentile rank.
                You can update these any time in Settings.
              </Text>
            ) : null}
          </>
        ) : (
          /* HealthKit — final step */
          <>
            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: theme.colors.accentDefault },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleConnectHealthKit}
              disabled={isSubmitting}
              accessibilityRole="button"
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.components.buttonPrimaryText} />
              ) : (
                <Text style={[styles.buttonText, { color: theme.components.buttonPrimaryText }]}>
                  Connect Apple Health
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.skipButton, styles.ghostButton, { borderColor: theme.colors.borderDefault }]}
              onPress={() => submit()}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel="Skip for now"
            >
              <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 20,
  },

  // Progress dots
  progressRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  dot: {
    height: 6,
    width: 6,
    borderRadius: 3,
  },

  // Heading / explanation
  heading: {
    fontSize: fontSize.heading2,    // E-003
    fontWeight: fontWeight.bold,    // E-003
    lineHeight: 32,
  },
  explanation: {
    fontSize: fontSize.bodySm,      // E-003
    lineHeight: 20,
    marginTop: -8,
  },
  hintText: {
    fontSize: fontSize.caption,     // E-003
    lineHeight: 18,
  },

  // Option list — tap-card style
  optionGroup: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  optionLabelGroup: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    fontSize: fontSize.bodyMd,      // E-003
  },
  optionSubtitle: {
    fontSize: fontSize.caption,     // E-003
    lineHeight: 16,
  },
  optionCheckmark: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,    // E-003
  },

  // Chip rows (sessions per week)
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Chip grid (equipment — wider, wraps naturally)
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
    fontSize: fontSize.bodySm,     // E-003
  },

  // Goal weight input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
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

  // Streak philosophy note
  streakNote: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
  },
  streakNoteText: {
    fontSize: fontSize.bodySm,     // E-003
    lineHeight: 20,
  },

  // Theme step
  themeStep: {
    marginTop: 8,
  },

  // CTA button
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: fontSize.bodyMd,        // E-003
    fontWeight: fontWeight.semibold,  // E-003
  },

  // Skip link / ghost button
  skipButton: {
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
  },
  skipText: {
    fontSize: fontSize.bodySm,    // E-003
  },

  // Privacy note
  privacyNote: {
    fontSize: fontSize.caption,   // E-003
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
