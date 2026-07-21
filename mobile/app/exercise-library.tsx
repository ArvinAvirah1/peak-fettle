/**
 * Exercise Library screen — P2-002
 *
 * Searchable, filterable browse screen for all exercises in the database.
 * Tapping an exercise card opens a bottom-sheet modal with personal bests,
 * a volume history chart (last 8 sessions), and a "Log This Exercise" CTA.
 *
 * Data flow:
 *   - GET /exercises?search=<query>&category=<category>  →  exercise list
 *   - GET /sets?exercise_id=<id>&limit=100               →  set history for modal
 *
 * Weight encoding: weight_raw is a SMALLINT stored as kg × 8 (fixed-point).
 *   kg = weight_raw / 8
 *
 * Epley E1RM = weight_kg × (1 + reps / 30)
 * Volume per set = weight_kg × reps
 *
 * Chart: bar chart of total volume per workout session, most recent 8 sessions.
 *
 * Design rules (E-001 / E-009):
 *   - All colors from useTheme() tokens — zero hardcoded hex values
 *   - All font sizes from fontSize tokens — zero hardcoded numbers
 *   - All numeric displays use fontVariant: ['tabular-nums']
 *   - Touch targets ≥ 48 × 48 pt
 *   - accessibilityRole="button" + accessibilityLabel on every interactive element
 *   - Static StyleSheet for layout; colors injected inline
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  Modal,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  ListRenderItemInfo,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '../src/components/Icon';
import LiftProgressChart from '../src/components/LiftProgressChart';
import { useAuth } from '../src/hooks/useAuth';

import { useTheme } from '../src/theme/ThemeContext';
import { PFButton } from '../src/components/ui/PFButton';
import { PressableCard } from '../src/components/ui/PressableCard';
import { apiClient } from '../src/api/client';
import { getExerciseGoal, setExerciseGoal, clearExerciseGoal, ExerciseGoal } from '../src/data/exerciseGoals'; // WIDGET-002
import { isLocalFirst } from '../src/data/backup/tierPolicy'; // A4-01
import { localDb } from '../src/db/localDb'; // A4-01
import {
  displayToKg,
  parseWeightInput,
  kgToInputValue,
  formatWeight,
} from '../src/constants/units'; // A4-03
import { MuscleMap } from '../src/components/MuscleMap';
import { muscleGroupsForExercise } from '../src/data/muscleRegions';
import { useTranslation } from 'react-i18next';
import i18n from '../src/i18n';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Muscle-group categories shown as horizontal filter chips. */
const CATEGORIES = [
  'All',
  'Chest',
  'Back',
  'Legs',
  'Shoulders',
  'Arms',
  'Core',
  'Cardio',
] as const;

type Category = (typeof CATEGORIES)[number];

/**
 * Maps frontend Category chip labels to the muscle_groups keywords used in
 * the database (TEXT[] with lowercase values from the seed migration).
 * 'Cardio' is handled separately by checking exercise.kind === 'cardio'.
 */
const CATEGORY_MUSCLE_KEYWORDS: Partial<Record<Category, string[]>> = {
  Chest:     ['chest', 'pectoral'],
  Back:      ['back', 'lats', 'latissimus', 'rhomboid', 'trapezius'],
  Legs:      ['legs', 'quads', 'quadriceps', 'hamstrings', 'glutes', 'calves'],
  Shoulders: ['shoulders', 'deltoid', 'anterior_deltoid', 'lateral_deltoid'],
  Arms:      ['biceps', 'triceps', 'forearms', 'brachialis'],
  Core:      ['core', 'abs', 'abdominals', 'obliques'],
};

/** How many sets to fetch per exercise for history computation. */
const SET_HISTORY_LIMIT = 100;

/** Number of most-recent workout sessions shown in the volume chart. */
const CHART_SESSION_COUNT = 8;

/** Chart width — 90 % of screen so it fits with horizontal padding. */
const CHART_WIDTH = Dimensions.get('window').width * 0.9;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw exercise shape returned by the backend (GET /exercises and /exercises/search). */
interface RawExercise {
  id: string;
  name: string;
  category: string;            // 'lift' | 'cardio' | 'sport' | 'mobility'
  muscle_groups: string[];     // e.g. ['chest', 'triceps', 'anterior_deltoid']
  is_compound?: boolean;
  description?: string;
  score?: number;              // only present on /exercises/search results
}

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string;
  kind: 'lift' | 'cardio';
  /** Raw muscle_groups array retained for client-side category filtering. */
  muscle_groups: string[];
  description?: string;
}

/** Normalise a raw backend exercise into the frontend Exercise shape. */
function normalizeExercise(raw: RawExercise): Exercise {
  const groups: string[] = Array.isArray(raw.muscle_groups) ? raw.muscle_groups : [];
  return {
    id:            raw.id,
    name:          raw.name,
    kind:          raw.category === 'cardio' ? 'cardio' : 'lift',
    primary_muscle: groups[0] ?? raw.category,
    muscle_groups:  groups,
    description:    raw.description,
  };
}

interface SetRecord {
  id: string;
  // NOTE: the server returns weight_kg (decoded), not weight_raw. See below.
  weight_raw: number; // SMALLINT — divide by 8 to get kg
  weight_kg?: number; // server-decoded kg (normalizeSet)
  reps: number;
  // TICKET-090: the `sets` column is `logged_at`, not `created_at`.
  logged_at?: string;
  created_at?: string; // legacy/fallback
  workout_id: string;
}

/** Resolve a set's timestamp regardless of which field the API used. */
function setTimestamp(s: SetRecord): string {
  return s.logged_at ?? s.created_at ?? '';
}

/** Resolve a set's weight in kg from either decoded weight_kg or weight_raw. */
function setKg(s: SetRecord): number {
  if (typeof s.weight_kg === 'number') return s.weight_kg;
  return decodeKg(s.weight_raw);
}

/** Aggregated volume for a single workout session, used in the chart. */
interface SessionVolume {
  /** Short date label, e.g. "Apr 3" */
  label: string;
  /** Total kg-reps for the session */
  volume: number;
  /** Raw ISO timestamp for sorting */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode fixed-point weight: SMALLINT → kg */
function decodeKg(raw: number): number {
  return raw / 8;
}

/** Epley E1RM formula: estimated one-rep max in kg */
function epleyE1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

/**
 * Derive personal best E1RM and best-set display string from a set array.
 * Returns null when there are no records.
 */
function computePersonalBest(sets: SetRecord[]): {
  e1rmKg: number;
  displaySet: string; // "X kg × Y reps"
  date: string; // "DD MMM YYYY"
} | null {
  if (sets.length === 0) return null;

  let bestE1RM = -Infinity;
  let bestSet: SetRecord | null = null;

  for (const s of sets) {
    const kg = setKg(s);
    const e1rm = epleyE1RM(kg, s.reps);
    if (e1rm > bestE1RM) {
      bestE1RM = e1rm;
      bestSet = s;
    }
  }

  if (!bestSet) return null;

  const kg = setKg(bestSet);
  const date = new Date(setTimestamp(bestSet));
  const dateStr = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return {
    e1rmKg: bestE1RM,
    displaySet: `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)} kg × ${bestSet.reps} reps`,
    date: dateStr,
  };
}

/**
 * Group sets by workout_id, compute total volume per session,
 * and return the most recent CHART_SESSION_COUNT sessions sorted oldest→newest
 * (so bars render left-to-right chronologically).
 */
function computeSessionVolumes(sets: SetRecord[]): SessionVolume[] {
  // Accumulate volume and track earliest date per workout_id
  const map = new Map<string, { volume: number; timestamp: string }>();

  for (const s of sets) {
    const kg = setKg(s);
    const vol = kg * s.reps;
    const ts = setTimestamp(s);
    const existing = map.get(s.workout_id);
    if (existing) {
      existing.volume += vol;
      // Keep the earliest set timestamp as the session anchor
      if (ts < existing.timestamp) {
        existing.timestamp = ts;
      }
    } else {
      map.set(s.workout_id, { volume: vol, timestamp: ts });
    }
  }

  // Sort sessions newest-first, take most recent 8, then reverse for chart order
  const sessions = Array.from(map.entries())
    .map(([, v]) => v)
    .sort((a, b) => (a.timestamp > b.timestamp ? -1 : 1))
    .slice(0, CHART_SESSION_COUNT)
    .reverse();

  return sessions.map((s) => {
    const d = new Date(s.timestamp);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return { label, volume: Math.round(s.volume), timestamp: s.timestamp };
  });
}

// ---------------------------------------------------------------------------
// Skeleton row — shown while the exercise list is loading
// ---------------------------------------------------------------------------

function SkeletonRow(): React.ReactElement {
  const { theme, spacing, radius } = useTheme();
  const colors = theme.colors;
  return (
    <View
      style={[
        styles.skeletonRow,
        {
          backgroundColor: colors.bgSecondary,
          borderRadius: radius.md,
          marginHorizontal: spacing.s4,
          marginBottom: spacing.s3,
          padding: spacing.s4,
          borderWidth: 1,
          borderColor: colors.borderDefault,
        },
      ]}
    >
      {/* Name placeholder */}
      <View
        style={[
          styles.skeletonLine,
          {
            backgroundColor: colors.bgTertiary,
            borderRadius: radius.sm,
            width: '60%',
            height: 16,
            marginBottom: spacing.s2,
          },
        ]}
      />
      {/* Badge placeholder */}
      <View
        style={[
          styles.skeletonLine,
          {
            backgroundColor: colors.bgTertiary,
            borderRadius: radius.sm,
            width: '30%',
            height: 12,
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Category chip
// ---------------------------------------------------------------------------

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function CategoryChip({ label, selected, onPress }: ChipProps): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const colors = theme.colors;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={i18n.t('screens:exerciseLibrary.filterBy', { label })}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected
            ? colors.accentDefault
            : colors.bgSecondary,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: selected ? colors.accentDefault : colors.borderDefault,
          paddingHorizontal: spacing.s3,
          paddingVertical: spacing.s2,
          marginRight: spacing.s2,
          opacity: pressed ? 0.75 : 1,
          // Ensure minimum touch target height
          minHeight: 36,
          justifyContent: 'center',
        },
      ]}
    >
      <Text
        style={{
          fontSize: fontSize.bodySm,
          fontWeight: selected ? fontWeight.semibold : fontWeight.regular,
          color: selected ? theme.components.buttonPrimaryText : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Exercise card
// ---------------------------------------------------------------------------

interface ExerciseCardProps {
  exercise: Exercise;
  onPress: (exercise: Exercise) => void;
}

function ExerciseCard({ exercise, onPress }: ExerciseCardProps): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const colors = theme.colors;

  /** Kind badge color varies by exercise type */
  const kindColor =
    exercise.kind === 'cardio' ? colors.statusSuccess : colors.accentDefault;

  return (
    <PressableCard
      onPress={() => onPress(exercise)}
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.bgSecondary,
          borderRadius: radius.md,
          marginHorizontal: spacing.s4,
          marginBottom: spacing.s3,
          padding: spacing.s4,
          borderWidth: 1,
          borderColor: colors.borderDefault,
        },
      ]}
    >
      {/* Exercise name */}
      <Text
        style={{
          fontSize: fontSize.bodyLg,
          fontWeight: fontWeight.semibold,
          color: colors.textPrimary,
          marginBottom: spacing.s2,
        }}
        numberOfLines={2}
      >
        {exercise.name}
      </Text>

      {/* Tags row: muscle group + kind */}
      <View style={styles.tagsRow}>
        {/* Primary muscle tag */}
        <View
          style={[
            styles.tag,
            {
              backgroundColor: colors.bgTertiary,
              borderRadius: radius.sm,
              paddingHorizontal: spacing.s2,
              paddingVertical: 2,
              marginRight: spacing.s2,
            },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.caption,
              color: colors.textSecondary,
              fontWeight: fontWeight.medium,
            }}
          >
            {exercise.primary_muscle}
          </Text>
        </View>

        {/* Kind badge */}
        <View
          style={[
            styles.tag,
            {
              backgroundColor: kindColor + '1A',
              borderRadius: radius.sm,
              paddingHorizontal: spacing.s2,
              paddingVertical: 2,
            },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.caption,
              color: kindColor,
              fontWeight: fontWeight.medium,
            }}
          >
            {exercise.kind === 'cardio' ? i18n.t('screens:exerciseLibrary.cardio') : i18n.t('screens:exerciseLibrary.lift')}
          </Text>
        </View>

        {/* Chevron hint */}
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
        </View>
      </View>
    </PressableCard>
  );
}

// ---------------------------------------------------------------------------
// Volume chart — rendered inside the detail modal
// ---------------------------------------------------------------------------

interface VolumeChartProps {
  sessions: SessionVolume[];
}

function VolumeChart({ sessions }: VolumeChartProps): React.ReactElement {
  const { theme, fontSize } = useTheme();
  const { t } = useTranslation();
  const colors = theme.colors;

  if (sessions.length === 0) {
    return (
      <Text style={{ fontSize: fontSize.bodySm, color: colors.textTertiary, textAlign: 'center' }}>
        {t('screens:exerciseLibrary.noSessionHistory')}
      </Text>
    );
  }

  return (
    <View style={{ height: 180, gap: 8, justifyContent: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 130 }}>
        {sessions.map((session) => {
          const maxVolume = Math.max(...sessions.map((item) => item.volume), 1);
          const barHeight = Math.max(8, (session.volume / maxVolume) * 120);
          return (
            <View key={session.label} style={{ flex: 1, alignItems: 'center' }}>
              <View
                style={{
                  width: '80%',
                  height: barHeight,
                  borderRadius: 4,
                  backgroundColor: colors.accentDefault,
                }}
              />
            </View>
          );
        })}
      </View>
      <Text style={{ fontSize: fontSize.caption, color: colors.textTertiary, textAlign: 'center' }}>
        {t('screens:exerciseLibrary.recentSessionVolume')}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Exercise detail modal
// ---------------------------------------------------------------------------

interface DetailModalProps {
  exercise: Exercise | null;
  visible: boolean;
  onClose: () => void;
}

function ExerciseDetailModal({ exercise, visible, onClose }: DetailModalProps): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { t } = useTranslation();
  const colors = theme.colors;
  const router = useRouter();
  const { user } = useAuth();
  const unitPref = (user?.unit_pref as 'kg' | 'lbs') ?? 'kg';
  const [showProgressChart, setShowProgressChart] = React.useState(false);

  // Set history state
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);

  // WIDGET-002: per-exercise weight x reps goal (local-first)
  const [goal, setGoal] = useState<ExerciseGoal | null>(null);
  const [goalEditing, setGoalEditing] = useState(false);
  const [goalWeight, setGoalWeight] = useState('');
  const [goalReps, setGoalReps] = useState('');

  useEffect(() => {
    setGoalEditing(false);
    if (!exercise || !visible) { setGoal(null); return; }
    let cancelled = false;
    getExerciseGoal(exercise.id)
      .then((g) => { if (!cancelled) setGoal(g); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [exercise?.id, visible]);

  const handleSaveGoal = useCallback(() => {
    if (!exercise) return;
    // A4-03 (Invariant 2): the input is in the user's display unit; store EXACT kg.
    const displayW = parseWeightInput(goalWeight);
    const r = parseInt(goalReps, 10);
    if (displayW == null || displayW <= 0 || !Number.isInteger(r) || r <= 0) return;
    const kg = displayToKg(displayW, unitPref);
    setGoalEditing(false);
    setExerciseGoal(exercise.id, kg, r, exercise.name)
      .then(() => getExerciseGoal(exercise.id))
      .then((g) => setGoal(g))
      .catch(() => {});
  }, [exercise, goalWeight, goalReps, unitPref]);

  const handleRemoveGoal = useCallback(() => {
    if (!exercise) return;
    setGoalEditing(false);
    setGoal(null);
    clearExerciseGoal(exercise.id).catch(() => {});
  }, [exercise]);

  // Reset progress chart visibility when exercise changes
  useEffect(() => {
    setShowProgressChart(false);
  }, [exercise?.id]);

  // Fetch set history whenever a new exercise is selected
  useEffect(() => {
    if (!exercise || !visible) return;
    let cancelled = false;

    setSetsLoading(true);
    setSetsError(null);
    setSets([]);

    // A4-01 (Invariant 1): free / local-first users must NOT hit GET /sets — that
    // personal round-trip hangs/500s for them. Read this exercise's sets straight
    // from on-device SQLite (mirroring localProgress.ts / the LiftProgressChart
    // local branch in this same modal) and map to the SetRecord shape. Pro users
    // keep the server fetch for live multi-device sync.
    const loadSets = (): Promise<SetRecord[]> => {
      if (isLocalFirst(user)) {
        return localDb
          .init()
          .then(() =>
            localDb.getAll<{
              id: string;
              workout_id: string | null;
              weight_kg: number | null;
              weight_raw: number | null;
              reps: number | null;
              logged_at: string | null;
            }>(
              `SELECT id, workout_id, weight_kg, weight_raw, reps, logged_at
                 FROM sets
                WHERE exercise_id = ? AND kind = 'lift'
                ORDER BY logged_at DESC
                LIMIT ?`,
              [exercise.id, SET_HISTORY_LIMIT],
            ),
          )
          .then((rows) =>
            rows.map(
              (r): SetRecord => ({
                id: r.id,
                workout_id: r.workout_id ?? '',
                weight_kg: r.weight_kg ?? undefined,
                // legacy fallback so setKg() can still resolve via weight_raw/8
                weight_raw: r.weight_raw ?? 0,
                reps: r.reps ?? 0,
                logged_at: r.logged_at ?? undefined,
              }),
            ),
          );
      }
      return apiClient
        .get<{ sets: SetRecord[] }>('/sets', {
          params: { exercise_id: exercise.id, limit: SET_HISTORY_LIMIT },
        })
        .then((res) => res.data.sets ?? []);
    };

    loadSets()
      .then((rows) => {
        if (!cancelled) setSets(rows);
      })
      .catch(() => {
        if (!cancelled) setSetsError(t('screens:exerciseLibrary.couldNotLoadHistory'));
      })
      .finally(() => {
        if (!cancelled) setSetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exercise?.id, visible, user]);

  const personalBest = useMemo(() => computePersonalBest(sets), [sets]);
  const sessionVolumes = useMemo(() => computeSessionVolumes(sets), [sets]);

  function handleLogPress(): void {
    onClose();
    // TICKET-084 Home logging contract: navigate to Home tab with logExercise params
    // so the stepper opens for this exercise directly.
    setTimeout(() => {
      if (exercise) {
        router.push(
          ('/(tabs)?logExercise=' + exercise.id + '&logExerciseName=' + encodeURIComponent(exercise.name)) as any
        );
      } else {
        router.push('/(tabs)');
      }
    }, 250);
  }

  if (!exercise) return <></>;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.bgPrimary }]} edges={['top', 'bottom']}>
        {/* Modal header */}
        <View
          style={[
            styles.modalHeader,
            {
              borderBottomWidth: 1,
              borderBottomColor: colors.borderDefault,
              paddingHorizontal: spacing.s4,
              paddingVertical: spacing.s3,
            },
          ]}
        >
          <View style={styles.modalTitleBlock}>
            <Text
              style={{
                fontSize: fontSize.heading3,
                fontWeight: fontWeight.bold,
                color: colors.textPrimary,
                flexShrink: 1,
              }}
              numberOfLines={2}
            >
              {exercise.name}
            </Text>
            <Text
              style={{
                fontSize: fontSize.bodySm,
                color: colors.textSecondary,
                marginTop: spacing.s1,
              }}
            >
              {exercise.primary_muscle}
            </Text>
          </View>

          {/* Close button */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('screens:exerciseLibrary.closeDetail')}
            style={({ pressed }) => [
              styles.closeButton,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.md,
                opacity: pressed ? 0.6 : 1,
                // 48 × 48 touch target
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: spacing.s4, paddingBottom: spacing.s8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Muscle map — shows front+back with highlighted regions */}
          {(() => {
            const muscleGroups = muscleGroupsForExercise(exercise.name, exercise.muscle_groups);
            return muscleGroups.length > 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  marginBottom: spacing.s4,
                  paddingVertical: spacing.s3,
                  backgroundColor: colors.bgSecondary,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.borderDefault,
                }}
              >
                <MuscleMap
                  groups={muscleGroups}
                  size={100}
                  view="both"
                />
              </View>
            ) : null;
          })()}

          {/* Description */}
          {exercise.description ? (
            <View style={{ marginBottom: spacing.s5 }}>
              <Text
                style={{
                  fontSize: fontSize.bodyMd,
                  color: colors.textSecondary,
                  lineHeight: 22,
                }}
              >
                {exercise.description}
              </Text>
            </View>
          ) : null}

          {/* Personal best section */}
          <View
            style={[
              styles.section,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.md,
                padding: spacing.s4,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                marginBottom: spacing.s4,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fontSize.bodySm,
                fontWeight: fontWeight.semibold,
                color: colors.textTertiary,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: spacing.s3,
              }}
            >
              {t('screens:exerciseLibrary.personalBest')}
            </Text>

            {setsLoading ? (
              <ActivityIndicator size="small" color={colors.accentDefault} />
            ) : setsError ? (
              <Text style={{ fontSize: fontSize.bodySm, color: colors.statusError }}>
                {setsError}
              </Text>
            ) : personalBest ? (
              <View>
                {/* E1RM headline */}
                <Text
                  style={{
                    fontSize: fontSize.heading2,
                    fontWeight: fontWeight.bold,
                    color: colors.accentDefault,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {t('screens:exerciseLibrary.estMax', { value: personalBest.e1rmKg.toFixed(1) })}
                </Text>
                {/* Best set detail */}
                <Text
                  style={{
                    fontSize: fontSize.bodySm,
                    color: colors.textSecondary,
                    marginTop: spacing.s1,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {t('screens:exerciseLibrary.bestSet', { set: personalBest.displaySet })}
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    color: colors.textTertiary,
                    marginTop: spacing.s1,
                  }}
                >
                  {personalBest.date}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: fontSize.bodySm, color: colors.textTertiary }}>
                {t('screens:exerciseLibrary.noLoggedSets')}
              </Text>
            )}
          </View>

          {/* WIDGET-002: weight x reps goal for this exercise */}
          <View
            style={[
              styles.section,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.md,
                padding: spacing.s4,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                marginBottom: spacing.s4,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fontSize.bodySm,
                fontWeight: fontWeight.semibold,
                color: colors.textTertiary,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: spacing.s3,
              }}
            >
              {t('screens:exerciseLibrary.goal')}
            </Text>

            {goalEditing ? (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s2 }}>
                  <TextInput
                    value={goalWeight}
                    onChangeText={setGoalWeight}
                    keyboardType="decimal-pad"
                    placeholder={t('screens:exerciseLibrary.weightPlaceholder', { unit: unitPref })}
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel={t('screens:exerciseLibrary.goalWeightA11y', { unit: unitPref === 'lbs' ? t('screens:exerciseLibrary.pounds') : t('screens:exerciseLibrary.kilograms') })}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderWidth: 1,
                      borderColor: colors.borderDefault,
                      borderRadius: radius.sm,
                      color: colors.textPrimary,
                      paddingHorizontal: spacing.s3,
                      fontSize: fontSize.bodyMd,
                    }}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.bodyMd }}>×</Text>
                  <TextInput
                    value={goalReps}
                    onChangeText={setGoalReps}
                    keyboardType="number-pad"
                    placeholder={t('screens:exerciseLibrary.repsPlaceholder')}
                    placeholderTextColor={colors.textTertiary}
                    accessibilityLabel={t('screens:exerciseLibrary.goalRepsA11y')}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderWidth: 1,
                      borderColor: colors.borderDefault,
                      borderRadius: radius.sm,
                      color: colors.textPrimary,
                      paddingHorizontal: spacing.s3,
                      fontSize: fontSize.bodyMd,
                    }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: spacing.s5,
                    marginTop: spacing.s3,
                  }}
                >
                  {goal ? (
                    <Pressable
                      onPress={handleRemoveGoal}
                      accessibilityRole="button"
                      accessibilityLabel={t('screens:exerciseLibrary.removeGoal')}
                      style={{ minHeight: 48, justifyContent: 'center' }}
                    >
                      <Text style={{ color: colors.statusError, fontSize: fontSize.bodySm }}>{t('screens:exerciseLibrary.remove')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => setGoalEditing(false)}
                    accessibilityRole="button"
                    accessibilityLabel={t('screens:exerciseLibrary.cancelGoalEditing')}
                    style={{ minHeight: 48, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: fontSize.bodySm }}>{t('common:cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSaveGoal}
                    accessibilityRole="button"
                    accessibilityLabel={t('screens:exerciseLibrary.saveGoal')}
                    style={{ minHeight: 48, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
                      {t('common:save')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : goal ? (
              <View>
                <Text
                  style={{
                    fontSize: fontSize.heading3,
                    fontWeight: fontWeight.bold,
                    color: goal.achieved_at ? colors.accentDefault : colors.textPrimary,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {goal.achieved_at ? '🏆 ' : '🎯 '}
                  {formatWeight(goal.target_weight_kg, unitPref, 0)} × {goal.target_reps}
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    color: colors.textTertiary,
                    marginTop: spacing.s1,
                  }}
                >
                  {goal.achieved_at
                    ? t('screens:exerciseLibrary.achievedOn', { date: new Date(goal.achieved_at).toLocaleDateString() })
                    : t('screens:exerciseLibrary.goalInProgress')}
                </Text>
                <Pressable
                  onPress={() => {
                    setGoalWeight(kgToInputValue(goal.target_weight_kg, unitPref));
                    setGoalReps(String(goal.target_reps));
                    setGoalEditing(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={goal.achieved_at ? t('screens:exerciseLibrary.setNewGoal') : t('screens:exerciseLibrary.editGoal')}
                  style={{ minHeight: 48, justifyContent: 'center' }}
                >
                  <Text style={{ color: colors.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
                    {goal.achieved_at ? t('screens:exerciseLibrary.setNewGoal') : t('screens:exerciseLibrary.editGoal')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setGoalWeight(''); setGoalReps(''); setGoalEditing(true); }}
                accessibilityRole="button"
                accessibilityLabel={t('screens:exerciseLibrary.setGoalA11y')}
                style={{ minHeight: 48, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.accentDefault, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
                  {t('screens:exerciseLibrary.setGoalCta')}
                </Text>
              </Pressable>
            )}
          </View>

          {/* Volume history chart */}
          <View
            style={[
              styles.section,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.md,
                padding: spacing.s4,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                marginBottom: spacing.s6,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fontSize.bodySm,
                fontWeight: fontWeight.semibold,
                color: colors.textTertiary,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                marginBottom: spacing.s2,
              }}
            >
              {t('screens:exerciseLibrary.volumeHistory')}
            </Text>

            {setsLoading ? (
              <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accentDefault} />
              </View>
            ) : (
              <VolumeChart sessions={sessionVolumes} />
            )}
          </View>

          {/* View progress section */}
          <PFButton
            label={showProgressChart ? t('screens:exerciseLibrary.hideProgressChart') : t('screens:exerciseLibrary.viewProgress')}
            onPress={() => setShowProgressChart((v) => !v)}
            variant="ghost"
            size="lg"
            accessibilityLabel={
              showProgressChart
                ? t('screens:exerciseLibrary.hideProgressChartFor', { name: exercise.name })
                : t('screens:exerciseLibrary.viewProgressChartFor', { name: exercise.name })
            }
            style={{ marginBottom: spacing.s3 }}
          />
          {showProgressChart ? (
            <View
              style={{
                borderRadius: radius.md,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: colors.borderDefault,
                marginBottom: spacing.s4,
              }}
            >
              <LiftProgressChart
                exerciseId={exercise.id}
                exerciseName={exercise.name}
                unitPref={unitPref}
              />
            </View>
          ) : null}

          {/* Log This Exercise CTA */}
          <PFButton
            label={t('screens:exerciseLibrary.logThisExercise')}
            onPress={handleLogPress}
            variant="primary"
            size="lg"
            accessibilityLabel={t('screens:exerciseLibrary.logExerciseA11y', { name: exercise.name })}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function ExerciseLibraryScreen(): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { t } = useTranslation();
  const colors = theme.colors;

  // Search + filter state
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('All');

  // Exercise list state
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Modal state
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Debounce search so we don't fire on every keystroke
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch exercise list
  // ---------------------------------------------------------------------------

  const fetchExercises = useCallback((searchQuery: string, cat: Category) => {
    setListLoading(true);
    setListError(null);

    if (searchQuery.trim()) {
      // ── Text search: use the scored alias-aware search endpoint ──────────
      // GET /exercises/search?q=<query>  →  { query, results: RawExercise[] }
      // We do NOT pass kind here so search spans all categories; category
      // chip filtering is applied client-side via the filteredExercises memo.
      apiClient
        .get<{ query: string; results: RawExercise[] }>('/exercises/search', {
          params: { q: searchQuery.trim() },
        })
        .then((res) => setExercises((res.data.results ?? []).map(normalizeExercise)))
        .catch(() => setListError(t('screens:exerciseLibrary.couldNotLoadExercises')))
        .finally(() => setListLoading(false));
    } else {
      // ── Browse all: use the grouped browse endpoint ──────────────────────
      // GET /exercises?kind=cardio  (or no kind for all)
      // Response: { exercises: { lift: [...], cardio: [...], ... } }
      // Flatten to a single array with Object.values().flat().
      const params: Record<string, string> = {};
      if (cat === 'Cardio') params.kind = 'cardio';
      // For all other categories we fetch all exercises and filter client-side
      // so that muscle-group sub-filtering (Chest, Back, Legs…) works correctly.

      apiClient
        .get<{ exercises: Record<string, RawExercise[]> }>('/exercises', { params })
        .then((res) => {
          const grouped = res.data.exercises ?? {};
          const flat = (Object.values(grouped) as RawExercise[][]).flat();
          setExercises(flat.map(normalizeExercise));
        })
        .catch(() => setListError(t('screens:exerciseLibrary.couldNotLoadExercises')))
        .finally(() => setListLoading(false));
    }
  }, []);

  /**
   * Client-side category filter applied on top of the server-fetched list.
   * The server already handles the Cardio/lift split for the browse path;
   * muscle-group chips (Chest, Back, …) are filtered here so we avoid a
   * round-trip for every chip tap and support search + muscle-group combos.
   */
  const filteredExercises = useMemo<Exercise[]>(() => {
    if (category === 'All') return exercises;
    if (category === 'Cardio') return exercises.filter((e) => e.kind === 'cardio');
    const keywords = CATEGORY_MUSCLE_KEYWORDS[category];
    if (!keywords) return exercises;
    return exercises.filter((e) =>
      e.muscle_groups.some((mg) =>
        keywords.some((kw) => mg.toLowerCase().includes(kw.toLowerCase()))
      )
    );
  }, [exercises, category]);

  // Initial load
  useEffect(() => {
    fetchExercises('', 'All');
  }, []);

  // Re-fetch when category changes (immediate)
  useEffect(() => {
    fetchExercises(query, category);
    // We intentionally exclude `query` from deps here — query changes are
    // handled by the debounced handler below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Debounced search handler
  function handleSearchChange(text: string): void {
    setQuery(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchExercises(text, category);
    }, 350);
  }

  // ---------------------------------------------------------------------------
  // Modal handlers
  // ---------------------------------------------------------------------------

  function openModal(exercise: Exercise): void {
    setSelectedExercise(exercise);
    setModalVisible(true);
  }

  function closeModal(): void {
    setModalVisible(false);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderSkeleton(): React.ReactElement {
    return (
      <>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </>
    );
  }

  function renderEmptyState(): React.ReactElement {
    return (
      <View style={[styles.emptyState, { marginTop: spacing.s8 }]}>
        <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} />
        <Text
          style={{
            fontSize: fontSize.bodyMd,
            color: colors.textTertiary,
            textAlign: 'center',
            marginTop: spacing.s3,
          }}
        >
          {query || category !== 'All'
            ? t('screens:exerciseLibrary.noExercisesMatch', { term: query || category })
            : t('screens:exerciseLibrary.noExercisesFound')}
        </Text>
        {listError ? (
          <Text
            style={{
              fontSize: fontSize.bodySm,
              color: colors.statusError,
              textAlign: 'center',
              marginTop: spacing.s2,
            }}
          >
            {listError}
          </Text>
        ) : null}
      </View>
    );
  }

  function renderItem({ item }: ListRenderItemInfo<Exercise>): React.ReactElement {
    return <ExerciseCard exercise={item} onPress={openModal} />;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    // 2026-07-21: no 'top' edge — this screen sits under a native-stack header
    // that already clears the notch; on the New Architecture SafeAreaView pads
    // the raw window inset regardless of position (double-inset dead band).
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.bgSecondary,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            marginHorizontal: spacing.s4,
            marginTop: spacing.s4,
            marginBottom: spacing.s3,
            paddingHorizontal: spacing.s3,
          },
        ]}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textTertiary}
          style={{ marginRight: spacing.s2 }}
        />
        <TextInput
          style={[
            styles.searchInput,
            {
              flex: 1,
              fontSize: fontSize.bodyMd,
              color: colors.textPrimary,
              paddingVertical: spacing.s3,
            },
          ]}
          placeholder={t('screens:exerciseLibrary.searchPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={handleSearchChange}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel={t('screens:exerciseLibrary.searchPlaceholder')}
        />
      </View>

      {/* ── Category chips ────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.s4,
          paddingBottom: spacing.s3,
        }}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="tablist"
        accessibilityLabel={t('screens:exerciseLibrary.filterByMuscleGroup')}
      >
        {CATEGORIES.map((cat) => (
          <CategoryChip
            key={cat}
            label={cat}
            selected={category === cat}
            onPress={() => setCategory(cat)}
          />
        ))}
      </ScrollView>

      {/* ── Result count ─────────────────────────────────────────────────── */}
      {!listLoading && !listError && (
        <Text
          style={{
            fontSize: fontSize.caption,
            color: colors.textTertiary,
            marginHorizontal: spacing.s4,
            marginBottom: spacing.s2,
          }}
        >
          {t('screens:exerciseLibrary.exerciseCount', { count: filteredExercises.length })}
        </Text>
      )}

      {/* ── Exercise list ─────────────────────────────────────────────────── */}
      {listLoading ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.s6 }}
          showsVerticalScrollIndicator={false}
        >
          {renderSkeleton()}
        </ScrollView>
      ) : (
        <FlatList<Exercise>
          data={filteredExercises}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: spacing.s6 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={renderEmptyState()}
          showsVerticalScrollIndicator={false}
          // Performance: fixed item height not easily known so skip getItemLayout;
          // exercises are few enough that default windowing is fine.
          removeClippedSubviews={Platform.OS === 'android'}
        />
      )}

      {/* ── Exercise detail modal ─────────────────────────────────────────── */}
      <ExerciseDetailModal
        exercise={selectedExercise}
        visible={modalVisible}
        onClose={closeModal}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Static styles — layout only; colors injected inline above
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    // fontSize & color injected inline
  },
  chip: {
    alignItems: 'center',
  },
  cardContainer: {
    // backgroundColor, borderRadius etc injected inline
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tag: {
    // Inline
  },
  chevron: {
    marginLeft: 'auto',
  },
  skeletonRow: {
    // Inline
  },
  skeletonLine: {
    // Inline
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalTitleBlock: {
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    // Inline
  },
  section: {
    // Inline
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
});
