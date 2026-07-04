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
import { useTranslation, type TFunction } from 'react-i18next';
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
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, radius } from '../src/theme/tokens';
import { ThemeSelectorInline } from '../src/components/ThemeSelector';
import { ScreenLayout } from '../src/components/ui';
import { saveProfile } from '../src/data/profile';
import {
  displayToKg,
  kgToInputValue,
  parseWeightInput,
  type UnitSystem,
} from '../src/constants/units';
import { defaultUnitForLocale } from '../src/constants/locale';
import type {
  TrainingGoal,
  SessionMinutes,
  EquipmentItem,
  SeasonPhase,
  PatchProfilePayload,
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

function sexOptions(t: TFunction): { label: string; value: SexOption }[] {
  return [
    { label: t('screens2:onboarding.sexMale'),               value: 'MALE'        },
    { label: t('screens2:onboarding.sexFemale'),             value: 'FEMALE'      },
    { label: t('screens2:onboarding.sexUndisclosed'), value: 'UNDISCLOSED' },
  ];
}

function disciplineOptions(t: TFunction): { label: string; value: Discipline; subtitle?: string }[] {
  return [
    { label: t('screens2:onboarding.disciplinePowerlifting'),          value: 'powerlifting'    },
    { label: t('screens2:onboarding.disciplineWeightlifting'),         value: 'weightlifting',  subtitle: t('screens2:onboarding.disciplineWeightliftingSubtitle') },
    { label: t('screens2:onboarding.disciplineGeneral'), value: 'general_strength' },
    { label: t('screens2:onboarding.disciplineRunning'),               value: 'running'         },
    { label: t('screens2:onboarding.disciplineCycling'),               value: 'cycling'         },
    { label: t('screens2:onboarding.disciplineSwimming'),              value: 'swimming'        },
    { label: t('screens2:onboarding.disciplineOther'),         value: 'other'           },
  ];
}

function trainingGoalOptions(t: TFunction): { label: string; value: TrainingGoal; subtitle?: string }[] {
  return [
    { label: t('screens2:onboarding.goalStrength'),          value: 'strength',          subtitle: t('screens2:onboarding.goalStrengthSubtitle') },
    { label: t('screens2:onboarding.goalHypertrophy'),   value: 'hypertrophy',       subtitle: t('screens2:onboarding.goalHypertrophySubtitle') },
    { label: t('screens2:onboarding.goalEndurance'),         value: 'endurance',         subtitle: t('screens2:onboarding.goalEnduranceSubtitle') },
    { label: t('screens2:onboarding.goalSportPerformance'), value: 'sport_performance', subtitle: t('screens2:onboarding.goalSportPerformanceSubtitle') },
    { label: t('screens2:onboarding.goalGeneralFitness'),   value: 'general_fitness',   subtitle: t('screens2:onboarding.goalGeneralFitnessSubtitle') },
  ];
}

const SESSIONS_PER_WEEK_OPTIONS: { label: string; value: number }[] = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
];

function sessionMinutesOptions(t: TFunction): { label: string; value: SessionMinutes; subtitle?: string }[] {
  return [
    { label: t('screens2:onboarding.minutes15'),  value: 15,  subtitle: t('screens2:onboarding.minutes15Subtitle') },
    { label: t('screens2:onboarding.minutes30'),  value: 30,  subtitle: t('screens2:onboarding.minutes30Subtitle') },
    { label: t('screens2:onboarding.minutes45'),  value: 45,  subtitle: t('screens2:onboarding.minutes45Subtitle') },
    { label: t('screens2:onboarding.minutes60'),  value: 60,  subtitle: t('screens2:onboarding.minutes60Subtitle') },
    { label: t('screens2:onboarding.minutes90'),  value: 90,  subtitle: t('screens2:onboarding.minutes90Subtitle') },
  ];
}

function equipmentOptions(t: TFunction): { label: string; value: EquipmentItem }[] {
  return [
    { label: t('screens2:onboarding.equipBarbell'),      value: 'barbell'     },
    { label: t('screens2:onboarding.equipDumbbell'),     value: 'dumbbell'    },
    { label: t('screens2:onboarding.equipKettlebell'),   value: 'kettlebell'  },
    { label: t('screens2:onboarding.equipMachine'),      value: 'machine'     },
    { label: t('screens2:onboarding.equipCable'),        value: 'cable'       },
    { label: t('screens2:onboarding.equipBodyweight'),   value: 'bodyweight'  },
    { label: t('screens2:onboarding.equipBands'),        value: 'bands'       },
    { label: t('screens2:onboarding.equipBench'),        value: 'bench'       },
    { label: t('screens2:onboarding.equipRack'),         value: 'rack'        },
    { label: t('screens2:onboarding.equipPullupBar'),  value: 'pullup_bar'  },
    { label: t('screens2:onboarding.equipBike'),         value: 'bike'        },
    { label: t('screens2:onboarding.equipTreadmill'),    value: 'treadmill'   },
    { label: t('screens2:onboarding.equipPool'),         value: 'pool'       },
    { label: t('screens2:onboarding.equipTrack'),        value: 'track'      },
  ];
}

// Disciplines that have a meaningful season concept
const TEAM_SPORT_DISCIPLINES: Set<Discipline> = new Set([
  'running', 'cycling', 'swimming', 'other',
]);

// Total step count — used for progress dots
// 1:name 2:sex 3:discipline 4:training_goal 5:sessions_per_week 6:session_minutes
// 7:equipment 8:goal_weight_kg 9:season_phase(conditional) 10:theme 11:healthkit
// We compute dynamically based on whether season_phase applies.
// The conditional season_phase step is step 9 (only shown for team-sport disciplines).
const STEP_SEASON = 9;
const STEP_THEME = (showSeason: boolean): number => showSeason ? 10 : 9;
const STEP_HEALTHKIT = (showSeason: boolean): number => showSeason ? 11 : 10;
const TOTAL_STEPS = (showSeason: boolean): number => showSeason ? 11 : 10;

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
  const { t } = useTranslation();
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
        {selected ? t('screens2:onboarding.checkedLabel', { label }) : label}
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
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  // Step state — 1..11 (season_phase step is skipped for non-team disciplines)
  const [step, setStep] = useState<number>(1);

  // The email local-part (before "@") is our display-name fallback / prefill.
  // New accounts otherwise show a random server-generated handle (e.g.
  // "64t9tvkymn"); asking at signup with a sensible default avoids that.
  const emailLocalPart = (user?.email ?? '').split('@')[0] ?? '';

  // The locale-derived default weight unit (US → lbs, else kg). Applied only as
  // a default when the user has not explicitly chosen a unit (founder decision).
  const localeDefaultUnit = defaultUnitForLocale();

  // Step 1: display name (prefilled with the email local-part).
  const [displayName, setDisplayName] = useState<string>(emailLocalPart);
  // Step 2: sex
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
  // Step 8: goal weight (optional). Stored canonically in kg at submit time; the
  // text field holds the display value for `goalWeightUnit` (D-2). Defaults to
  // the user's saved unit, else the locale default (US → lbs, else kg).
  const [goalWeightUnit, setGoalWeightUnit] = useState<UnitSystem>(
    user?.unit_pref ?? localeDefaultUnit
  );
  const [goalWeightInput, setGoalWeightInput] = useState<string>('');
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

  // Switch goal-weight unit, re-expressing the entered value in the new unit (D-2).
  const handleGoalWeightUnitChange = useCallback(
    (nextUnit: UnitSystem) => {
      setGoalWeightUnit((prevUnit) => {
        if (nextUnit === prevUnit) return prevUnit;
        const parsed = parseWeightInput(goalWeightInput);
        if (parsed !== null) {
          const kg = displayToKg(parsed, prevUnit);
          setGoalWeightInput(kgToInputValue(kg, nextUnit));
        }
        return nextUnit;
      });
    },
    [goalWeightInput]
  );

  // Submit whatever has been collected and navigate to the main app.
  const submit = useCallback(
    async (skipAll = false) => {
      setIsSubmitting(true);
      try {
        // `display_name` is not part of PatchProfilePayload (it has no server
        // PATCH field yet) — saveProfile accepts it as an extra field and routes
        // it by tier (free → on-device user_profile, Pro → best-effort PATCH).
        const payload: PatchProfilePayload & { display_name?: string; unit_pref?: UnitSystem } = {};

        // Display name + unit default are saved even on a full skip, so a new
        // account never lands on a random server handle or the wrong unit.
        // Display name: entered value, falling back to the email local-part.
        // Trimmed + capped to 50 to match the server validation.
        const nameTrimmed = (displayName ?? '').trim();
        const resolvedName = (nameTrimmed.length > 0 ? nameTrimmed : emailLocalPart).slice(0, 50);
        if (resolvedName.length > 0) payload.display_name = resolvedName;

        // Weight unit: only set a default when the user has NOT already chosen
        // one (so onboarding never overrides an explicit Settings choice). New
        // accounts get the locale default (US → lbs, else kg); existing prefs
        // are left untouched.
        if (user?.unit_pref == null) payload.unit_pref = localeDefaultUnit;

        if (!skipAll) {
          if (sex !== null)           payload.sex = sex;
          if (discipline !== null)    payload.primary_discipline = discipline;
          if (trainingGoal !== null)  payload.training_goal = trainingGoal;
          if (sessionsPerWeek !== null) payload.sessions_per_week = sessionsPerWeek;
          if (sessionMinutes !== null)  payload.session_minutes = sessionMinutes;
          if (equipmentProfile.size > 0) payload.equipment_profile = Array.from(equipmentProfile);
          // Goal weight: parse the display value and store canonical kg (D-2).
          const gw = parseWeightInput(goalWeightInput);
          if (gw !== null && gw > 0)  payload.goal_weight_kg = displayToKg(gw, goalWeightUnit);
          if (showSeasonStep && seasonPhase !== null) payload.season_phase = seasonPhase;
        }

        if (Object.keys(payload).length > 0) {
          // Tier-branched: free → local user_profile, Pro → PATCH /user/profile.
          // (The personal REST path is mounted only at app.use('/user', …) —
          // the plural '/users/profile' 404s, which silently lost answers for
          // every new account before the writer existed.)
          await saveProfile(user, payload, updateUser);
        }
      } catch (err) {
        // Non-fatal: profile can be filled in from Training Profile in Settings later.
        console.warn('[onboarding] profile save failed:', err);
      } finally {
        setIsSubmitting(false);
        router.replace('/(tabs)/');
      }
    },
    [displayName, emailLocalPart, localeDefaultUnit,
     sex, discipline, trainingGoal, sessionsPerWeek, sessionMinutes,
     equipmentProfile, goalWeightInput, goalWeightUnit, seasonPhase,
     showSeasonStep, user, updateUser, router]
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
    // Season phase step (STEP_SEASON) is only shown for team-sport disciplines.
    // If discipline doesn't need it, skip over it. Re-evaluated here in case the
    // discipline changed since it was selected.
    if (nextRaw === STEP_SEASON && !TEAM_SPORT_DISCIPLINES.has(discipline)) {
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step1Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step1Explanation')}
          </Text>
          <View style={[styles.inputRow, { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgElevated }]}>
            <TextInput
              style={[styles.weightInput, { color: theme.colors.textPrimary }]}
              placeholder={t('screens2:onboarding.namePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              maxLength={50}
              onSubmitEditing={() => advanceStep(1)}
              accessibilityLabel={t('screens2:onboarding.displayNameA11y')}
            />
          </View>
          <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
            {emailLocalPart
              ? t('screens2:onboarding.leaveAsHint', { name: emailLocalPart })
              : t('screens2:onboarding.pickAnyNameHint')}
          </Text>
        </KeyboardAvoidingView>
      );
    }

    if (step === 2) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step2Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step2Explanation')}
          </Text>
          <View style={styles.optionGroup}>
            {sexOptions(t).map((opt) => (
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
{t('screens2:onboarding.streakNote')}
            </Text>
          </View>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step3Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step3Explanation')}
          </Text>
          <View style={styles.optionGroup}>
            {disciplineOptions(t).map((opt) => (
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

    if (step === 4) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step4Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step4Explanation')}
          </Text>
          <View style={styles.optionGroup}>
            {trainingGoalOptions(t).map((opt) => (
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

    if (step === 5) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step5Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step5Explanation')}
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
            {t('screens2:onboarding.step5Hint')}
          </Text>
        </>
      );
    }

    if (step === 6) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step6Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step6Explanation')}
          </Text>
          <View style={styles.optionGroup}>
            {sessionMinutesOptions(t).map((opt) => (
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

    if (step === 7) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step7Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step7Explanation')}
          </Text>
          <View style={styles.chipGrid}>
            {equipmentOptions(t).map((opt) => (
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
              {t('screens2:onboarding.step7Hint')}
            </Text>
          )}
        </>
      );
    }

    if (step === 8) {
      return (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step8Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step8Explanation')}
          </Text>
          <View style={[styles.inputRow, { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgElevated }]}>
            <TextInput
              style={[styles.weightInput, { color: theme.colors.textPrimary }]}
              placeholder={goalWeightUnit === 'lbs' ? 'e.g. 176' : 'e.g. 80'}
              placeholderTextColor={theme.colors.textTertiary}
              keyboardType="decimal-pad"
              value={goalWeightInput}
              onChangeText={setGoalWeightInput}
              accessibilityLabel={t('screens2:onboarding.goalWeightA11y', { unit: goalWeightUnit === 'lbs' ? t('screens2:onboarding.pounds') : t('screens2:onboarding.kilograms') })}
              maxLength={6}
            />
            <View style={[
              styles.unitToggle,
              { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgPrimary },
            ]}>
              {(['kg', 'lbs'] as const).map((u) => {
                const active = goalWeightUnit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[
                      styles.unitToggleButton,
                      active && { backgroundColor: theme.colors.accentDefault },
                    ]}
                    onPress={() => handleGoalWeightUnitChange(u)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t('screens2:onboarding.useUnitA11y', { unit: u === 'lbs' ? t('screens2:onboarding.pounds') : t('screens2:onboarding.kilograms') })}
                  >
                    <Text style={[
                      styles.unitToggleText,
                      { color: active ? theme.components.buttonPrimaryText : theme.colors.textTertiary },
                    ]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </KeyboardAvoidingView>
      );
    }

    // Step 9: season phase (only shown when showSeasonStep is true)
    if (step === STEP_SEASON && showSeasonStep) {
      return (
        <>
          <Text style={[styles.heading, { color: theme.colors.textPrimary }]}>
            {t('screens2:onboarding.step9Heading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.step9Explanation')}
          </Text>
          <View style={styles.optionGroup}>
            <OptionButton<SeasonPhase>
              label={t('screens2:onboarding.offSeason')}
              subtitle={t('screens2:onboarding.offSeasonSubtitle')}
              value="off_season"
              selected={seasonPhase === 'off_season'}
              onPress={setSeasonPhase}
            />
            <OptionButton<SeasonPhase>
              label={t('screens2:onboarding.inSeason')}
              subtitle={t('screens2:onboarding.inSeasonSubtitle')}
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
            {t('screens2:onboarding.themeHeading')}
          </Text>
          <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
            {t('screens2:onboarding.themeExplanation')}
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
          {t('screens2:onboarding.healthKitHeading')}
        </Text>
        <Text style={[styles.explanation, { color: theme.colors.textSecondary }]}>
          {t('screens2:onboarding.healthKitExplanation')}
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
                  {t('screens2:planSurvey.next')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel={t('screens2:onboarding.skipThisStepA11y')}
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
                {step === 1 ? t('screens2:onboarding.skipForNow') : t('screens2:onboarding.skipThisStep')}
              </Text>
            </TouchableOpacity>

            {step > 1 && step < 4 ? (
              <Text style={[styles.privacyNote, { color: theme.colors.borderDefault }]}>
                {t('screens2:onboarding.privacyNote')}
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
                  {t('screens2:onboarding.connectAppleHealth')}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.skipButton, styles.ghostButton, { borderColor: theme.colors.borderDefault }]}
              onPress={() => submit()}
              disabled={isSubmitting}
              accessibilityRole="button"
              accessibilityLabel={t('screens2:onboarding.skipForNow')}
            >
              <Text style={[styles.skipText, { color: theme.colors.textTertiary }]}>
                {t('screens2:onboarding.skipForNow')}
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

  // Goal-weight kg/lb segmented toggle (D-2)
  unitToggle: {
    flexDirection: 'row',
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  unitToggleButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitToggleText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
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
