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
  SafeAreaView,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  ListRenderItemInfo,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VictoryBar, VictoryChart, VictoryAxis } from 'victory-native';

import { useTheme } from '../src/theme/ThemeContext';
import { PFButton } from '../src/components/ui/PFButton';
import { PressableCard } from '../src/components/ui/PressableCard';
import { apiClient } from '../src/api/client';

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
  weight_raw: number; // SMALLINT — divide by 8 to get kg
  reps: number;
  created_at: string;
  workout_id: string;
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
    const kg = decodeKg(s.weight_raw);
    const e1rm = epleyE1RM(kg, s.reps);
    if (e1rm > bestE1RM) {
      bestE1RM = e1rm;
      bestSet = s;
    }
  }

  if (!bestSet) return null;

  const kg = decodeKg(bestSet.weight_raw);
  const date = new Date(bestSet.created_at);
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
    const kg = decodeKg(s.weight_raw);
    const vol = kg * s.reps;
    const existing = map.get(s.workout_id);
    if (existing) {
      existing.volume += vol;
      // Keep the earliest set timestamp as the session anchor
      if (s.created_at < existing.timestamp) {
        existing.timestamp = s.created_at;
      }
    } else {
      map.set(s.workout_id, { volume: vol, timestamp: s.created_at });
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
  const { colors, spacing, radius } = useTheme();
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
  const { colors, fontSize, fontWeight, spacing, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Filter by ${label}`}
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
          color: selected ? colors.buttonPrimaryText : colors.textSecondary,
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
  const { colors, fontSize, fontWeight, spacing, radius } = useTheme();

  /** Kind badge color varies by exercise type */
  const kindColor =
    exercise.kind === 'cardio' ? colors.statusSuccess : colors.accentDefault;

  return (
    <PressableCard
      onPress={() => onPress(exercise)}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${exercise.primary_muscle}, ${exercise.kind}`}
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
            {exercise.kind === 'cardio' ? 'Cardio' : 'Lift'}
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
  const { colors, fontSize } = useTheme();

  if (sessions.length === 0) {
    return (
      <Text style={{ fontSize: fontSize.bodySm, color: colors.textTertiary, textAlign: 'center' }}>
        No session history yet
      </Text>
    );
  }

  // VictoryNative XL uses index-based x values; we supply labels via tickFormat
  const data = sessions.map((s, i) => ({ x: i + 1, y: s.volume }));

  return (
    <VictoryChart
      width={CHART_WIDTH}
      height={180}
      domainPadding={{ x: 18 }}
      padding={{ top: 16, bottom: 48, left: 56, right: 16 }}
    >
      <VictoryAxis
        tickFormat={(t: number) => sessions[t - 1]?.label ?? ''}
        style={{
          axis: { stroke: colors.borderDefault },
          tickLabels: {
            fontSize: 9,
            fill: colors.textTertiary,
            angle: -30,
            textAnchor: 'end',
          },
          grid: { stroke: 'transparent' },
        }}
      />
      <VictoryAxis
        dependentAxis
        tickFormat={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
        style={{
          axis: { stroke: colors.borderDefault },
          tickLabels: { fontSize: 9, fill: colors.textTertiary },
          grid: { stroke: colors.borderDefault, strokeDasharray: '4,4', strokeOpacity: 0.4 },
        }}
      />
      <VictoryBar
        data={data}
        style={{
          data: { fill: colors.accentDefault, borderRadius: 4 },
        }}
        cornerRadius={{ top: 3 }}
        animate={false}
      />
    </VictoryChart>
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
  const { colors, fontSize, fontWeight, spacing, radius } = useTheme();
  const router = useRouter();

  // Set history state
  const [sets, setSets] = useState<SetRecord[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const [setsError, setSetsError] = useState<string | null>(null);

  // Fetch set history whenever a new exercise is selected
  useEffect(() => {
    if (!exercise || !visible) return;
    let cancelled = false;

    setSetsLoading(true);
    setSetsError(null);
    setSets([]);

    apiClient
      .get<{ sets: SetRecord[] }>('/sets', {
        params: { exercise_id: exercise.id, limit: SET_HISTORY_LIMIT },
      })
      .then((res) => {
        if (!cancelled) setSets(res.data.sets ?? []);
      })
      .catch(() => {
        if (!cancelled) setSetsError('Could not load history.');
      })
      .finally(() => {
        if (!cancelled) setSetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exercise?.id, visible]);

  const personalBest = useMemo(() => computePersonalBest(sets), [sets]);
  const sessionVolumes = useMemo(() => computeSessionVolumes(sets), [sets]);

  function handleLogPress(): void {
    onClose();
    // Small delay so modal dismisses before navigation
    setTimeout(() => router.push('/(tabs)/log'), 250);
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
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.bgPrimary }]}>
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
            accessibilityLabel="Close exercise detail"
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
              Personal Best
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
                  {personalBest.e1rmKg.toFixed(1)} kg est. max
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
                  Best set: {personalBest.displaySet}
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
                No logged sets yet
              </Text>
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
              Volume History (kg · reps)
            </Text>

            {setsLoading ? (
              <View style={{ height: 180, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accentDefault} />
              </View>
            ) : (
              <VolumeChart sessions={sessionVolumes} />
            )}
          </View>

          {/* Log This Exercise CTA */}
          <PFButton
            label="Log This Exercise"
            onPress={handleLogPress}
            variant="primary"
            size="lg"
            accessibilityLabel={`Log ${exercise.name}`}
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
  const { colors, fontSize, fontWeight, spacing, radius } = useTheme();

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
        .catch(() => setListError('Could not load exercises. Check your connection.'))
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
        .catch(() => setListError('Could not load exercises. Check your connection.'))
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
            ? `No exercises match "${query || category}"`
            : 'No exercises found'}
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>

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
          placeholder="Search exercises…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={handleSearchChange}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search exercises"
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
        accessibilityLabel="Filter by muscle group"
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
          {filteredExercises.length} {filteredExercises.length === 1 ? 'exercise' : 'exercises'}
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
          accessibilityLabel="Search exercises"
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
        accessibilityLabel="Filter by muscle group"
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
          {filteredExercises.length} {filteredExercises.length === 1 ? 'exercise' : 'exercises'}
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
