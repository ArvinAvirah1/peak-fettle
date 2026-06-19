/**
 * Training Survey screen — re-editable Training Engine profile.
 *
 * 2026-06-11 (spec §5, Agent C)
 * 2026-06-17 (P4 survey, cluster "survey-plans"):
 *   - Expanded into an elaborate multi-step survey: goal, experience level,
 *     primary focus (discipline), sessions/week, session length, equipment,
 *     season/phase, goal weight.
 *   - ALL survey copy + options now live in the SURVEY_CONFIG block below so they
 *     are easy to refine without touching render/logic.
 *   - Persists via saveProfile() — tier-branched (free → on-device user_profile,
 *     Pro → PATCH /user/profile). Local-first: free users make NO REST call here.
 *
 * Pre-fills from the authenticated user profile if those fields are present.
 * On save: saveProfile(user, payload, updateUser) then router.back().
 *
 * NOTE on persistence scope: training_goal / sessions_per_week / session_minutes
 * / equipment_profile / season_phase / experience_level / goal_weight_kg all have
 * on-device columns (see mobile/src/data/profile.ts LocalColumn). `primary_discipline`
 * has no local column, so for free users it is kept in the in-session `user` via
 * updateUser() (which feeds the Plans engine this session) but is not persisted to
 * SQLite across a cold start — the engine falls back to general_strength if unset.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout } from '../src/components/ui';
import { saveProfile, loadLocalProfile } from '../src/data/profile';
import {
  displayToKg,
  kgToInputValue,
  parseWeightInput,
  type UnitSystem,
} from '../src/constants/units';
import { useReduceMotion } from '../src/hooks/useReduceMotion';
import type {
  TrainingGoal,
  SessionMinutes,
  EquipmentItem,
  SeasonPhase,
} from '../src/api/user';

// ===========================================================================
// SURVEY_CONFIG — all copy + options live here so they're easy to refine.
// Editing this block changes the survey without touching render/logic below.
// ===========================================================================

type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
/** Discipline keys MUST match the engine template registry (templates.ts). */
type Discipline =
  | 'general_strength'
  | 'powerlifting'
  | 'weightlifting'
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'other_mixed';

interface OptionDef<T> {
  label: string;
  value: T;
  subtitle?: string;
}

const SURVEY_CONFIG = {
  screen: {
    title: 'Training Profile',
    subtitle:
      'These answers shape every plan the Training Engine builds for you. ' +
      'Update them any time — your next plan reflects the change.',
    saveLabel: 'Save Training Profile',
  },

  goal: {
    title: 'Training goal',
    subtitle: 'What are you optimising for right now?',
    options: [
      { label: 'Strength',          value: 'strength',          subtitle: 'Maximise lifts — 1–5 rep focus' },
      { label: 'Muscle Building',   value: 'hypertrophy',       subtitle: 'Size & definition — 6–15 rep range' },
      { label: 'Endurance',         value: 'endurance',         subtitle: 'Aerobic capacity & stamina' },
      { label: 'Sport Performance', value: 'sport_performance', subtitle: 'Power, speed & sport-specific fitness' },
      { label: 'General Fitness',   value: 'general_fitness',   subtitle: 'Health, movement quality & consistency' },
    ] as OptionDef<TrainingGoal>[],
  },

  experience: {
    title: 'Experience level',
    subtitle: 'How long have you been training consistently?',
    options: [
      { label: 'Beginner',     value: 'beginner',     subtitle: 'New, or returning after a long break (< 1 yr)' },
      { label: 'Intermediate', value: 'intermediate', subtitle: 'Consistent for 1–3 years; linear gains slowing' },
      { label: 'Advanced',     value: 'advanced',     subtitle: '3+ years; needs periodised programming' },
    ] as OptionDef<ExperienceLevel>[],
  },

  focus: {
    title: 'Primary focus',
    subtitle: 'Which discipline should the plan be built around?',
    options: [
      { label: 'General Strength', value: 'general_strength', subtitle: 'Balanced full-body barbell training' },
      { label: 'Powerlifting',     value: 'powerlifting',     subtitle: 'Squat, bench & deadlift specialisation' },
      { label: 'Weightlifting',    value: 'weightlifting',    subtitle: 'Snatch & clean-and-jerk focus' },
      { label: 'Running',          value: 'running',          subtitle: 'Run-led conditioning + supporting strength' },
      { label: 'Cycling',          value: 'cycling',          subtitle: 'Bike-led conditioning + supporting strength' },
      { label: 'Swimming',         value: 'swimming',         subtitle: 'Swim-led conditioning + supporting strength' },
      { label: 'Mixed / Other',    value: 'other_mixed',      subtitle: 'Team sport or hybrid training' },
    ] as OptionDef<Discipline>[],
  },

  sessions: {
    title: 'Sessions per week',
    subtitle: 'How many training sessions can you commit to?',
    options: [1, 2, 3, 4, 5, 6, 7],
    hint: 'Engine defaults to 3 sessions if not set.',
  },

  length: {
    title: 'Session length',
    subtitle: 'How long is each training session?',
    options: [
      { label: '15 min', value: 15, subtitle: 'Express' },
      { label: '30 min', value: 30, subtitle: 'Short' },
      { label: '45 min', value: 45, subtitle: 'Standard' },
      { label: '60 min', value: 60, subtitle: 'Full session' },
      { label: '90 min', value: 90, subtitle: 'Extended' },
    ] as OptionDef<SessionMinutes>[],
  },

  equipment: {
    title: 'Available equipment',
    subtitle: 'The engine only prescribes exercises you can actually perform.',
    emptyHint: 'None selected — engine uses full gym default.',
    options: [
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
    ] as OptionDef<EquipmentItem>[],
  },

  goalWeight: {
    title: 'Goal weight (optional)',
    subtitle: 'Target body weight, if applicable. Leave blank to skip.',
  },

  season: {
    title: 'Season phase',
    subtitle:
      'Your competitive phase affects how the engine balances load and recovery.',
    options: [
      { label: 'Off season', value: 'off_season', subtitle: 'Build base fitness and strength' },
      { label: 'In season',  value: 'in_season',  subtitle: 'Maintain fitness without overloading' },
    ] as OptionDef<SeasonPhase>[],
  },

  trainingDays: {
    title: 'Which days do you train?',
    subtitle:
      'Pick the weekdays that suit you and your plan maps onto real days ' +
      '("Mon – Push") instead of generic "Day 1". Optional — skip to keep it generic.',
    // value = JS getDay() index (0=Sun … 6=Sat).
    options: [
      { label: 'Mon', value: 1 },
      { label: 'Tue', value: 2 },
      { label: 'Wed', value: 3 },
      { label: 'Thu', value: 4 },
      { label: 'Fri', value: 5 },
      { label: 'Sat', value: 6 },
      { label: 'Sun', value: 0 },
    ] as OptionDef<number>[],
    emptyHint: 'None selected — sessions are labelled Day 1, Day 2, …',
  },

  injuries: {
    title: 'Injuries or limitations',
    subtitle:
      'We leave out movements that could aggravate these and pick safer ' +
      'alternatives. Select any that apply — skip if none.',
    emptyHint: 'None selected — no movements excluded.',
    // value tokens MUST match the engine contraindication vocabulary
    // (exerciseCatalog contraindications + constraints.ts built-ins).
    options: [
      { label: 'Lower back', value: 'lower_back' },
      { label: 'Knees',      value: 'knees'      },
      { label: 'Shoulders',  value: 'shoulders'  },
      { label: 'Wrists',     value: 'wrists'     },
      { label: 'Elbows',     value: 'elbows'     },
      { label: 'Ankles',     value: 'ankles'     },
      { label: 'Neck',       value: 'neck'       },
      { label: 'Hip',        value: 'hip'        },
      { label: 'Upper back', value: 'upper_back' },
    ] as OptionDef<string>[],
  },

  priorities: {
    title: 'Muscle-group priorities',
    subtitle:
      'Want to bring up specific areas? The plan leans extra volume and ' +
      'exercise choice toward what you pick. Optional.',
    emptyHint: 'None selected — balanced across the whole body.',
    // value tokens are canonical MuscleMap labels (see muscleRegions.ts) so the
    // engine's muscle-priority bias matches the catalogue's muscle_groups.
    options: [
      { label: 'Chest',      value: 'chest'      },
      { label: 'Back',       value: 'back'       },
      { label: 'Shoulders',  value: 'shoulders'  },
      { label: 'Arms',       value: 'biceps'     },
      { label: 'Legs',       value: 'legs'       },
      { label: 'Glutes',     value: 'glutes'     },
      { label: 'Core',       value: 'core'       },
      { label: 'Calves',     value: 'calves'     },
    ] as OptionDef<string>[],
  },

  bodyweight: {
    title: 'Current body weight (optional)',
    subtitle: 'Helps set sensible starting loads and recovery. Leave blank to skip.',
  },

  age: {
    title: 'Date of birth (optional)',
    subtitle: 'Used only to tune recovery defaults. Leave blank to skip.',
  },
};

/** Disciplines for which the optional season-phase step is shown. */
const SEASON_RELEVANT_DISCIPLINES = new Set<Discipline | string>([
  'running',
  'cycling',
  'swimming',
  'other_mixed',
]);

// ---------------------------------------------------------------------------
// Stagger helper
// ---------------------------------------------------------------------------

function useStaggerFade(count: number, enabled: boolean): Animated.Value[] {
  const anims = useRef(
    Array.from({ length: count }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (!enabled) {
      anims.forEach((a) => a.setValue(1));
      return;
    }
    const animations = anims.map((a, i) =>
      Animated.timing(a, {
        toValue: 1,
        duration: 240,
        delay: i * 60,
        useNativeDriver: true,
      })
    );
    Animated.stagger(60, animations).start();
  }, [enabled, anims]);

  return anims;
}

function staggerStyle(anim: Animated.Value | undefined): object {
  // anim is indexed out of a fixed-length array; guard for the (impossible at
  // runtime) undefined slot so this is null-safe under noUncheckedIndexedAccess.
  if (!anim) return {};
  return {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };
}

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
      accessibilityLabel={label + (subtitle ? ': ' + subtitle : '')}
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
      accessibilityLabel={label}
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
      accessibilityLabel={label}
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
// Section header — matches house micro/uppercase style
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
  const { user, updateUser } = useAuth();
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();

  // Stagger slots: header(0), goal(1), experience(2), focus(3), sessions(4),
  // length(5), equipment(6), goal-weight + conditional season(7),
  // training-days(8), injuries + priorities(9), body-weight + DOB(10), save(11).
  const staggerAnims = useStaggerFade(12, !reduceMotion);

  // Save button press scale
  const saveScale = useRef(new Animated.Value(1)).current;

  // Initialise from user profile if available
  const [trainingGoal, setTrainingGoal] = useState<TrainingGoal | null>(
    (user as any)?.training_goal ?? null
  );
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(
    ((user as any)?.experience_level as ExperienceLevel | undefined) ?? null
  );
  const [discipline, setDiscipline] = useState<Discipline | null>(
    ((user?.primary_discipline as Discipline | undefined) ?? null)
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
  // Goal weight: stored canonically in kg, but entered/displayed in the user's
  // preferred unit. The text field holds the display value for `goalWeightUnit`;
  // we convert to kg only at save time (D-2).
  const [goalWeightUnit, setGoalWeightUnit] = useState<UnitSystem>(
    user?.unit_pref ?? 'kg'
  );
  const [goalWeightInput, setGoalWeightInput] = useState<string>(
    (user as any)?.goal_weight_kg != null
      ? kgToInputValue((user as any).goal_weight_kg, user?.unit_pref ?? 'kg')
      : ''
  );
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(
    (user as any)?.season_phase ?? null
  );

  // ── Expanded survey state (2026-06-19) ──────────────────────────────────
  // Training days: JS getDay() indices (0=Sun … 6=Sat).
  const [trainingDays, setTrainingDays] = useState<Set<number>>(
    () => new Set<number>(((user as any)?.training_days as number[] | undefined) ?? [])
  );
  // Injuries: region tokens (lower_back, knees, …).
  const [injuries, setInjuries] = useState<Set<string>>(
    () => new Set<string>(((user as any)?.injuries as string[] | undefined) ?? [])
  );
  // Muscle priorities: canonical MuscleMap labels.
  const [musclePriorities, setMusclePriorities] = useState<Set<string>>(
    () => new Set<string>(((user as any)?.muscle_priorities as string[] | undefined) ?? [])
  );
  // Body weight: canonical kg, entered/displayed in the user's preferred unit.
  const [bodyweightUnit, setBodyweightUnit] = useState<UnitSystem>(
    user?.unit_pref ?? 'kg'
  );
  const [bodyweightInput, setBodyweightInput] = useState<string>(
    (user as any)?.bodyweight_kg != null
      ? kgToInputValue((user as any).bodyweight_kg, user?.unit_pref ?? 'kg')
      : ''
  );
  // Date of birth (ISO yyyy-mm-dd), entered as free text.
  const [birthDateInput, setBirthDateInput] = useState<string>(
    (user as any)?.birth_date != null ? String((user as any).birth_date).slice(0, 10) : ''
  );

  const [isSaving, setIsSaving] = useState(false);

  // ── Hydrate from the on-device profile on mount ─────────────────────────
  // Free/local-first users' survey answers live ONLY in SQLite — the in-session
  // `user` (restored from SecureStore) carries the cached server profile, not
  // the local survey fields, so on a cold start the form would otherwise show
  // blank even though a plan is generated from the saved values. We read the
  // saved row once and seed any field the in-memory user didn't already provide.
  // Runs before the user interacts, and only fills EMPTY fields, so it never
  // clobbers a fresh edit. Critically this also means re-saving won't wipe
  // previously-saved injuries/priorities/days (the save sends null when empty).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      const saved = await loadLocalProfile().catch(() => null);
      if (!saved || cancelled) return;
      setTrainingGoal((cur) => cur ?? (saved.training_goal as TrainingGoal | null) ?? null);
      setExperienceLevel((cur) => cur ?? (saved.experience_level as ExperienceLevel | null) ?? null);
      setDiscipline((cur) => cur ?? (saved.primary_focus as Discipline | null) ?? null);
      setSessionsPerWeek((cur) => cur ?? saved.sessions_per_week ?? null);
      setSessionMinutes((cur) => cur ?? (saved.session_minutes as SessionMinutes | null) ?? null);
      setEquipmentProfile((cur) =>
        cur.size > 0 ? cur : new Set<EquipmentItem>((saved.equipment_profile as EquipmentItem[] | null) ?? []));
      setSeasonPhase((cur) => cur ?? (saved.season_phase as SeasonPhase | null) ?? null);
      setTrainingDays((cur) => (cur.size > 0 ? cur : new Set<number>(saved.training_days ?? [])));
      setInjuries((cur) => (cur.size > 0 ? cur : new Set<string>(saved.injuries ?? [])));
      setMusclePriorities((cur) => (cur.size > 0 ? cur : new Set<string>(saved.muscle_priorities ?? [])));
      setGoalWeightInput((cur) =>
        cur !== '' ? cur : saved.goal_weight_kg != null
          ? kgToInputValue(saved.goal_weight_kg, (saved.unit_pref as UnitSystem) ?? user?.unit_pref ?? 'kg')
          : '');
      setBodyweightInput((cur) =>
        cur !== '' ? cur : saved.bodyweight_kg != null
          ? kgToInputValue(saved.bodyweight_kg, (saved.unit_pref as UnitSystem) ?? user?.unit_pref ?? 'kg')
          : '');
      setBirthDateInput((cur) => (cur !== '' ? cur : saved.birth_date ? saved.birth_date.slice(0, 10) : ''));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Season step is relevant when the chosen focus is an endurance/mixed
  // discipline (falls back to the stored primary_discipline before a choice).
  const effectiveDiscipline = discipline ?? (user?.primary_discipline ?? null);
  const showSeasonStep = SEASON_RELEVANT_DISCIPLINES.has(
    (effectiveDiscipline ?? '') as string
  );

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

  // Generic Set<T> toggle for the multi-select sections (days/injuries/priorities).
  const toggleInSet = useCallback(
    <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, item: T) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(item)) next.delete(item);
        else next.add(item);
        return next;
      });
    },
    []
  );

  // Switch bodyweight unit, re-expressing the entered value in the new unit.
  const handleBodyweightUnitChange = useCallback(
    (nextUnit: UnitSystem) => {
      setBodyweightUnit((prevUnit) => {
        if (nextUnit === prevUnit) return prevUnit;
        const parsed = parseWeightInput(bodyweightInput);
        if (parsed !== null) {
          const kg = displayToKg(parsed, prevUnit);
          setBodyweightInput(kgToInputValue(kg, nextUnit));
        }
        return nextUnit;
      });
    },
    [bodyweightInput]
  );

  // Switch goal-weight unit, re-expressing the currently entered value in the
  // new unit (canonical kg round-trips back to a clean display string).
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

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const payload: Parameters<typeof saveProfile>[1] = {};
      if (trainingGoal !== null)    payload.training_goal = trainingGoal;
      if (experienceLevel !== null) payload.experience_level = experienceLevel;
      if (discipline !== null) {
        payload.primary_discipline = discipline; // in-session (engine this session)
        payload.primary_focus = discipline;      // persisted locally (v8 column)
      }
      if (sessionsPerWeek !== null) payload.sessions_per_week = sessionsPerWeek;
      if (sessionMinutes !== null)  payload.session_minutes = sessionMinutes;
      if (equipmentProfile.size > 0) payload.equipment_profile = Array.from(equipmentProfile);
      // Goal weight: parse the display value and store canonical kg (D-2).
      const gw = parseWeightInput(goalWeightInput);
      if (gw !== null && gw > 0)        payload.goal_weight_kg = displayToKg(gw, goalWeightUnit);
      else if (goalWeightInput.trim() === '') payload.goal_weight_kg = null;
      // Season phase only when the focus discipline makes it meaningful.
      if (showSeasonStep)            payload.season_phase = seasonPhase ?? null;

      // ── Expanded survey fields (always send so deselect-all clears them) ──
      payload.training_days = trainingDays.size > 0 ? Array.from(trainingDays).sort((a, b) => a - b) : null;
      payload.injuries = injuries.size > 0 ? Array.from(injuries) : null;
      payload.muscle_priorities = musclePriorities.size > 0 ? Array.from(musclePriorities) : null;
      // Body weight → canonical kg (or clear when blank).
      const bw = parseWeightInput(bodyweightInput);
      if (bw !== null && bw > 0)               payload.bodyweight_kg = displayToKg(bw, bodyweightUnit);
      else if (bodyweightInput.trim() === '')  payload.bodyweight_kg = null;
      // Date of birth: only persist a plausible ISO yyyy-mm-dd; blank clears it.
      const dob = birthDateInput.trim();
      if (dob === '') {
        payload.birth_date = null;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dob) && !Number.isNaN(new Date(dob).getTime())) {
        payload.birth_date = dob;
      }

      // Tier-branched: free → local user_profile, Pro → PATCH /user/profile (D-1).
      await saveProfile(user, payload, updateUser);
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
    trainingGoal, experienceLevel, discipline, sessionsPerWeek, sessionMinutes,
    equipmentProfile, goalWeightInput, goalWeightUnit, seasonPhase, showSeasonStep,
    trainingDays, injuries, musclePriorities, bodyweightInput, bodyweightUnit, birthDateInput,
    user, updateUser, router,
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

        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[0])}>
          <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]}>
            {SURVEY_CONFIG.screen.title}
          </Text>
          <Text style={[styles.screenSubtitle, { color: theme.colors.textSecondary }]}>
            {SURVEY_CONFIG.screen.subtitle}
          </Text>
        </Animated.View>

        {/* ── Section 1: Training goal ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[1])}>
          <SurveySection
            title={SURVEY_CONFIG.goal.title}
            subtitle={SURVEY_CONFIG.goal.subtitle}
          >
            <View style={styles.optionGroup}>
              {SURVEY_CONFIG.goal.options.map((opt) => (
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
        </Animated.View>

        {/* ── Section 2: Experience level ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[2])}>
          <SurveySection
            title={SURVEY_CONFIG.experience.title}
            subtitle={SURVEY_CONFIG.experience.subtitle}
          >
            <View style={styles.optionGroup}>
              {SURVEY_CONFIG.experience.options.map((opt) => (
                <OptionButton<ExperienceLevel>
                  key={opt.value}
                  label={opt.label}
                  subtitle={opt.subtitle}
                  value={opt.value}
                  selected={experienceLevel === opt.value}
                  onPress={setExperienceLevel}
                />
              ))}
            </View>
          </SurveySection>
        </Animated.View>

        {/* ── Section 3: Primary focus (discipline) ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[3])}>
          <SurveySection
            title={SURVEY_CONFIG.focus.title}
            subtitle={SURVEY_CONFIG.focus.subtitle}
          >
            <View style={styles.optionGroup}>
              {SURVEY_CONFIG.focus.options.map((opt) => (
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
          </SurveySection>
        </Animated.View>

        {/* ── Section 4: Sessions per week ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[4])}>
          <SurveySection
            title={SURVEY_CONFIG.sessions.title}
            subtitle={SURVEY_CONFIG.sessions.subtitle}
          >
            <View style={styles.chipRow}>
              {SURVEY_CONFIG.sessions.options.map((n) => (
                <ChipButton
                  key={n}
                  label={String(n)}
                  selected={sessionsPerWeek === n}
                  onPress={() => setSessionsPerWeek(n)}
                />
              ))}
            </View>
            <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
              {SURVEY_CONFIG.sessions.hint}
            </Text>
          </SurveySection>
        </Animated.View>

        {/* ── Section 5: Session length ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[5])}>
          <SurveySection
            title={SURVEY_CONFIG.length.title}
            subtitle={SURVEY_CONFIG.length.subtitle}
          >
            <View style={styles.optionGroup}>
              {SURVEY_CONFIG.length.options.map((opt) => (
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
        </Animated.View>

        {/* ── Section 6: Equipment ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[6])}>
          <SurveySection
            title={SURVEY_CONFIG.equipment.title}
            subtitle={SURVEY_CONFIG.equipment.subtitle}
          >
            <View style={styles.chipGrid}>
              {SURVEY_CONFIG.equipment.options.map((opt) => (
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
                {SURVEY_CONFIG.equipment.emptyHint}
              </Text>
            )}
          </SurveySection>
        </Animated.View>

        {/* ── Section 7: Goal weight (optional) + conditional Season ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[7])}>
          <SurveySection
            title={SURVEY_CONFIG.goalWeight.title}
            subtitle={SURVEY_CONFIG.goalWeight.subtitle}
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
                  placeholder={goalWeightUnit === 'lbs' ? 'e.g. 176' : 'e.g. 80'}
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={goalWeightInput}
                  onChangeText={setGoalWeightInput}
                  accessibilityLabel={`Goal weight in ${goalWeightUnit === 'lbs' ? 'pounds' : 'kilograms'}`}
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
                        accessibilityLabel={`Use ${u === 'lbs' ? 'pounds' : 'kilograms'}`}
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
          </SurveySection>

          {/* ── Section 8: Season phase (conditional on focus) ── */}
          {showSeasonStep && (
            <SurveySection
              title={SURVEY_CONFIG.season.title}
              subtitle={SURVEY_CONFIG.season.subtitle}
            >
              <View style={styles.optionGroup}>
                {SURVEY_CONFIG.season.options.map((opt) => (
                  <OptionButton<SeasonPhase>
                    key={opt.value}
                    label={opt.label}
                    subtitle={opt.subtitle}
                    value={opt.value}
                    selected={seasonPhase === opt.value}
                    onPress={setSeasonPhase}
                  />
                ))}
              </View>
            </SurveySection>
          )}
        </Animated.View>

        {/* ── Section 9: Training days ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[8])}>
          <SurveySection
            title={SURVEY_CONFIG.trainingDays.title}
            subtitle={SURVEY_CONFIG.trainingDays.subtitle}
          >
            <View style={styles.chipRow}>
              {SURVEY_CONFIG.trainingDays.options.map((opt) => (
                <MultiChipButton
                  key={opt.value}
                  label={opt.label}
                  selected={trainingDays.has(opt.value)}
                  onPress={() => toggleInSet(setTrainingDays, opt.value)}
                />
              ))}
            </View>
            {trainingDays.size === 0 && (
              <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
                {SURVEY_CONFIG.trainingDays.emptyHint}
              </Text>
            )}
          </SurveySection>
        </Animated.View>

        {/* ── Section 10: Injuries + Muscle priorities ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[9])}>
          <SurveySection
            title={SURVEY_CONFIG.injuries.title}
            subtitle={SURVEY_CONFIG.injuries.subtitle}
          >
            <View style={styles.chipGrid}>
              {SURVEY_CONFIG.injuries.options.map((opt) => (
                <MultiChipButton
                  key={opt.value}
                  label={opt.label}
                  selected={injuries.has(opt.value)}
                  onPress={() => toggleInSet(setInjuries, opt.value)}
                />
              ))}
            </View>
            {injuries.size === 0 && (
              <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
                {SURVEY_CONFIG.injuries.emptyHint}
              </Text>
            )}
          </SurveySection>

          <SurveySection
            title={SURVEY_CONFIG.priorities.title}
            subtitle={SURVEY_CONFIG.priorities.subtitle}
          >
            <View style={styles.chipGrid}>
              {SURVEY_CONFIG.priorities.options.map((opt) => (
                <MultiChipButton
                  key={opt.value}
                  label={opt.label}
                  selected={musclePriorities.has(opt.value)}
                  onPress={() => toggleInSet(setMusclePriorities, opt.value)}
                />
              ))}
            </View>
            {musclePriorities.size === 0 && (
              <Text style={[styles.hintText, { color: theme.colors.textTertiary }]}>
                {SURVEY_CONFIG.priorities.emptyHint}
              </Text>
            )}
          </SurveySection>
        </Animated.View>

        {/* ── Section 11: Body weight + Date of birth (both optional) ── */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[10])}>
          <SurveySection
            title={SURVEY_CONFIG.bodyweight.title}
            subtitle={SURVEY_CONFIG.bodyweight.subtitle}
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
                  placeholder={bodyweightUnit === 'lbs' ? 'e.g. 165' : 'e.g. 75'}
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="decimal-pad"
                  value={bodyweightInput}
                  onChangeText={setBodyweightInput}
                  accessibilityLabel={`Current body weight in ${bodyweightUnit === 'lbs' ? 'pounds' : 'kilograms'}`}
                  maxLength={6}
                />
                <View style={[
                  styles.unitToggle,
                  { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgPrimary },
                ]}>
                  {(['kg', 'lbs'] as const).map((u) => {
                    const active = bodyweightUnit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        style={[
                          styles.unitToggleButton,
                          active && { backgroundColor: theme.colors.accentDefault },
                        ]}
                        onPress={() => handleBodyweightUnitChange(u)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`Use ${u === 'lbs' ? 'pounds' : 'kilograms'}`}
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
          </SurveySection>

          <SurveySection
            title={SURVEY_CONFIG.age.title}
            subtitle={SURVEY_CONFIG.age.subtitle}
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
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.textTertiary}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={birthDateInput}
                  onChangeText={setBirthDateInput}
                  accessibilityLabel="Date of birth, year month day"
                  maxLength={10}
                />
              </View>
            </KeyboardAvoidingView>
          </SurveySection>
        </Animated.View>

        {/* ── Save button ── */}
        <Animated.View
          style={[
            reduceMotion ? undefined : staggerStyle(staggerAnims[11]),
            { transform: [{ scale: saveScale }] },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: theme.colors.accentDefault },
              isSaving && styles.buttonDisabled,
            ]}
            onPress={handleSave}
            onPressIn={() => {
              if (!reduceMotion) {
                Animated.timing(saveScale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
              }
            }}
            onPressOut={() => {
              Animated.spring(saveScale, { toValue: 1, damping: 15, stiffness: 300, useNativeDriver: true }).start();
            }}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save training profile"
          >
            {isSaving ? (
              <ActivityIndicator color={theme.components.buttonPrimaryText} />
            ) : (
              <Text style={[styles.saveButtonText, { color: theme.components.buttonPrimaryText }]}>
                {SURVEY_CONFIG.screen.saveLabel}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

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
    paddingTop: 24,
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
    fontSize: fontSize.bodyMd,
  },

  // Screen title
  screenTitle: {
    fontSize: fontSize.heading2,
    fontWeight: fontWeight.bold,
    lineHeight: 32,
    marginTop: -8,
  },
  screenSubtitle: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
    marginTop: -16,
  },

  // Survey section
  surveySection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    fontSize: fontSize.bodySm,
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
    minHeight: 52,
  },
  optionLabelGroup: { flex: 1, gap: 2 },
  optionLabel: {
    fontSize: fontSize.bodyMd,
  },
  optionSubtitle: {
    fontSize: fontSize.caption,
    lineHeight: 16,
  },
  optionCheckmark: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },

  // Chips — minHeight 44 for WCAG 2.5.5
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
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.bodySm,
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
    minHeight: 52,
  },
  weightInput: {
    flex: 1,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.medium,
    minHeight: 36,
  },
  weightUnit: {
    fontSize: fontSize.bodyMd,
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

  hintText: {
    fontSize: fontSize.caption,
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
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
  },

  bottomPad: { height: 32 },
});
