/**
 * Workout Day Detail screen — Peak Fettle
 *
 * Drill-down from the RECENT ACTIVITY row on the home tab.
 * Navigated to via router.push(`/workout-day?date=YYYY-MM-DD`).
 * Registered in _layout.tsx as name="workout-day".
 *
 * Layout (top → bottom):
 *   1. Date heading + session summary subtitle
 *   2. Rest-day badge (if session_type === 'rest_day')
 *   3. SectionList of exercise groups, each showing:
 *        - Exercise name header (bold)
 *        - Set rows: "Set N  100.0 kg × 5  →  e1RM ~117 kg"
 *        - Best-set row highlighted in accentDefault
 *        - Per-exercise volume subtotal
 *   4. Empty state when no sets exist for the date
 *
 * Data strategy:
 *   - GET /workouts?from=date&to=date  to find the workout for this date
 *   - GET /sets?workoutId=<id>         to get all sets for that workout
 *   - Exercise names resolved from GET /exercises (cached library)
 *
 * All colors/sizes via useTheme(). Zero hardcoded hex or numeric font sizes.
 * fontVariant: ['tabular-nums'] on all numeric cells (weights, reps, e1RM).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { ScreenLayout, PFButton } from '../src/components/ui';
import { apiClient } from '../src/api/client';
import { formatWeight } from '../src/constants/units';
import { UnitSystem } from '../src/constants/units';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiWorkout {
  id: string;
  day_key: string; // YYYY-MM-DD
  session_type?: string; // 'rest_day' | 'training' | undefined
}

interface ApiSet {
  id: string;
  workout_id: string;
  exercise_id: string;
  exercise_name?: string; // may be populated server-side
  kind: 'lift' | 'cardio';
  // Lift fields
  weight_raw?: number; // SMALLINT — divide by 8 to get kg
  reps?: number;
  rir?: number | null;
  set_index?: number;
  // Cardio fields
  duration_sec?: number;
  distance_m?: number | null;
  created_at: string;
}

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  sets: ApiSet[];
}

// SectionList requires { title, data } shape
interface SectionData {
  title: string;
  exerciseId: string;
  data: ApiSet[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Epley e1RM from weight_raw (SMALLINT / 8 = kg) and reps. */
function computeE1rm(weightRaw: number, reps: number): number {
  const kg = weightRaw / 8;
  return kg * (1 + reps / 30);
}

/** Weight in kg from weight_raw SMALLINT. */
function rawToKg(weightRaw: number): number {
  return weightRaw / 8;
}

/** Volume for a single set in kg. */
function setVolumeKg(s: ApiSet): number {
  if (s.kind !== 'lift' || !s.weight_raw || !s.reps) return 0;
  return rawToKg(s.weight_raw) * s.reps;
}

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * "Monday, May 18" from a YYYY-MM-DD string.
 * Parses in local time to avoid UTC-offset date-shift.
 */
function friendlyDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return `${LONG_DAYS[d.getDay()]}, ${LONG_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Format duration seconds as "mm:ss". */
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Format distance in metres as "X.X km" or "Xm". */
function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface DayData {
  workout: ApiWorkout | null;
  isRestDay: boolean;
  exerciseGroups: ExerciseGroup[];
  totalSets: number;
  totalVolumeKg: number;
}

async function fetchDayData(date: string): Promise<DayData> {
  // 1. Find the workout for this day
  const workoutsRes = await apiClient.get<{ workouts?: ApiWorkout[] } | ApiWorkout[]>(
    `/workouts?from=${date}&to=${date}`
  );

  // Server may return array directly or wrapped in { workouts: [...] }
  let workouts: ApiWorkout[];
  if (Array.isArray(workoutsRes.data)) {
    workouts = workoutsRes.data;
  } else {
    workouts = (workoutsRes.data as { workouts?: ApiWorkout[] }).workouts ?? [];
  }

  const workout = workouts.find((w) => w.day_key === date) ?? workouts[0] ?? null;

  if (!workout) {
    return { workout: null, isRestDay: false, exerciseGroups: [], totalSets: 0, totalVolumeKg: 0 };
  }

  const isRestDay = workout.session_type === 'rest_day';

  // 2. Fetch sets for this workout
  const setsRes = await apiClient.get<{ sets?: ApiSet[] } | ApiSet[]>(
    `/sets?workoutId=${workout.id}`
  );
  let allSets: ApiSet[];
  if (Array.isArray(setsRes.data)) {
    allSets = setsRes.data;
  } else {
    allSets = (setsRes.data as { sets?: ApiSet[] }).sets ?? [];
  }

  // 3. Fetch exercise library for name resolution
  let exerciseNameMap = new Map<string, string>();
  try {
    const exRes = await apiClient.get<{ exercises?: Record<string, { id: string; name: string }[]> }>(
      '/exercises'
    );
    const lib = exRes.data?.exercises ?? {};
    for (const category of Object.values(lib)) {
      for (const ex of (category as { id: string; name: string }[])) {
        exerciseNameMap.set(ex.id, ex.name);
      }
    }
  } catch {
    // Best-effort — fall back to exercise_id display
  }

  // 4. Group sets by exercise (preserving logged order)
  const groupOrder: string[] = [];
  const groupMap = new Map<string, ApiSet[]>();

  for (const s of allSets) {
    if (!groupMap.has(s.exercise_id)) {
      groupOrder.push(s.exercise_id);
      groupMap.set(s.exercise_id, []);
    }
    groupMap.get(s.exercise_id)!.push(s);
  }

  const exerciseGroups: ExerciseGroup[] = groupOrder.map((exId) => ({
    exerciseId: exId,
    exerciseName: exerciseNameMap.get(exId) ?? s_exerciseName(allSets, exId),
    sets: groupMap.get(exId)!,
  }));

  const totalSets = allSets.length;
  const totalVolumeKg = allSets.reduce((acc, s) => acc + setVolumeKg(s), 0);

  return { workout, isRestDay, exerciseGroups, totalSets, totalVolumeKg };
}

/** Fall back to exercise_name field on the set, or the raw ID. */
function s_exerciseName(sets: ApiSet[], exerciseId: string): string {
  for (const s of sets) {
    if (s.exercise_id === exerciseId && s.exercise_name) return s.exercise_name;
  }
  return exerciseId;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SkeletonProps {
  lines?: number;
}

function SkeletonBlock({ lines = 4 }: SkeletonProps): React.ReactElement {
  // spacing/radius/fontSize/fontWeight are top-level on useTheme(), not on
  // `theme` — pulling them from `theme` yields undefined → "cannot read
  // property 's5' of undefined" crash on the RECENT ACTIVITY drill-down.
  const { theme: { colors }, spacing, radius } = useTheme();
  return (
    <View style={{ gap: spacing.s3, paddingHorizontal: spacing.s5, marginTop: spacing.s4 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 18,
            width: i % 3 === 0 ? '60%' : '100%',
            backgroundColor: colors.bgSecondary,
            borderRadius: radius.sm,
          }}
        />
      ))}
    </View>
  );
}

interface SetRowProps {
  set: ApiSet;
  setNumber: number;
  isBest: boolean;
  unitPref: UnitSystem;
}

function SetRow({ set, setNumber, isBest, unitPref }: SetRowProps): React.ReactElement {
  const { theme: { colors }, spacing, fontSize, fontWeight } = useTheme();

  const accentColor = isBest ? colors.accentDefault : colors.textPrimary;
  const subColor = isBest ? colors.accentDefault : colors.textSecondary;

  if (set.kind === 'cardio') {
    const duration = set.duration_sec ? formatDuration(set.duration_sec) : '—';
    const distance = set.distance_m ? formatDistance(set.distance_m) : null;
    return (
      <View style={[styles.setRow, { paddingVertical: spacing.s2 }]}>
        <Text style={[styles.setLabel, { color: colors.textTertiary, fontSize: fontSize.bodySm }]}>
          {`Set ${setNumber}`}
        </Text>
        <Text style={[styles.setDetail, { color: accentColor, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }]}>
          {duration}{distance ? `  ·  ${distance}` : ''}
        </Text>
      </View>
    );
  }

  // Lift set
  const weightRaw = set.weight_raw ?? 0;
  const reps = set.reps ?? 0;
  const weightKg = rawToKg(weightRaw);
  const e1rmKg = computeE1rm(weightRaw, reps);
  const weightDisplay = formatWeight(weightKg, unitPref, 1);
  const e1rmDisplay = formatWeight(e1rmKg, unitPref, 0);

  return (
    <View style={[styles.setRow, { paddingVertical: spacing.s2, minHeight: 48 }]}>
      <Text
        style={{
          color: colors.textTertiary,
          fontSize: fontSize.bodySm,
          fontVariant: ['tabular-nums'],
          minWidth: 44,
        }}
      >
        {`Set ${setNumber}`}
      </Text>
      <Text
        style={{
          flex: 1,
          color: accentColor,
          fontSize: fontSize.bodySm,
          fontWeight: isBest ? fontWeight.semibold : fontWeight.regular,
          fontVariant: ['tabular-nums'],
        }}
      >
        {`${weightDisplay} × ${reps} reps`}
        {isBest ? '  ★' : ''}
      </Text>
      <Text
        style={{
          color: subColor,
          fontSize: fontSize.bodySm,
          fontVariant: ['tabular-nums'],
        }}
      >
        {`e1RM ~${e1rmDisplay}`}
      </Text>
    </View>
  );
}

interface ExerciseHeaderProps {
  name: string;
  volumeKg: number;
  unitPref: UnitSystem;
}

function ExerciseHeader({ name, volumeKg, unitPref }: ExerciseHeaderProps): React.ReactElement {
  const { theme: { colors }, spacing, fontSize, fontWeight } = useTheme();
  const volDisplay = formatWeight(volumeKg, unitPref, 0);
  return (
    <View
      style={[
        styles.exerciseHeader,
        {
          backgroundColor: colors.bgPrimary,
          paddingHorizontal: spacing.s5,
          paddingTop: spacing.s5,
          paddingBottom: spacing.s2,
        },
      ]}
    >
      <Text
        style={{
          fontSize: fontSize.bodyLg,
          fontWeight: fontWeight.bold,
          color: colors.textPrimary,
        }}
      >
        {name}
      </Text>
      <Text
        style={{
          fontSize: fontSize.caption,
          color: colors.textTertiary,
          marginTop: 2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {`Total: ${volDisplay} volume`}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function WorkoutDayScreen(): React.ReactElement {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const { theme: { colors }, spacing, fontSize, fontWeight, radius } = useTheme();
  const { user } = useAuth();
  const unitPref: UnitSystem = (user?.unit_pref as UnitSystem) ?? 'kg';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dayData, setDayData] = useState<DayData | null>(null);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDayData(date);
      setDayData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workout');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived display values ─────────────────────────────────────────────────

  const friendlyDateStr = useMemo(() => (date ? friendlyDate(date) : ''), [date]);

  const summaryLine = useMemo(() => {
    if (!dayData) return '';
    const { exerciseGroups, totalSets, totalVolumeKg } = dayData;
    if (totalSets === 0) return '';
    const exCount = exerciseGroups.length;
    const volDisplay = formatWeight(totalVolumeKg, unitPref, 0);
    const exLabel = exCount === 1 ? '1 exercise' : `${exCount} exercises`;
    const setLabel = totalSets === 1 ? '1 set' : `${totalSets} sets`;
    return `${exLabel} · ${setLabel} · ${volDisplay} total`;
  }, [dayData, unitPref]);

  // ── Best-set map per exercise ─────────────────────────────────────────────

  const bestSetIds = useMemo(() => {
    const ids = new Set<string>();
    if (!dayData) return ids;
    for (const group of dayData.exerciseGroups) {
      let bestE1rm = -Infinity;
      let bestId: string | null = null;
      for (const s of group.sets) {
        if (s.kind === 'lift' && s.weight_raw && s.reps) {
          const e = computeE1rm(s.weight_raw, s.reps);
          if (e > bestE1rm) {
            bestE1rm = e;
            bestId = s.id;
          }
        }
      }
      if (bestId) ids.add(bestId);
    }
    return ids;
  }, [dayData]);

  // ── Volume per exercise ───────────────────────────────────────────────────

  const volumeByExercise = useMemo(() => {
    const map = new Map<string, number>();
    if (!dayData) return map;
    for (const group of dayData.exerciseGroups) {
      const vol = group.sets.reduce((acc, s) => acc + setVolumeKg(s), 0);
      map.set(group.exerciseId, vol);
    }
    return map;
  }, [dayData]);

  // ── SectionList data ─────────────────────────────────────────────────────

  const sections: SectionData[] = useMemo(() => {
    if (!dayData) return [];
    return dayData.exerciseGroups.map((g) => ({
      title: g.exerciseName,
      exerciseId: g.exerciseId,
      data: g.sets,
    }));
  }, [dayData]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!date) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.bodyMd }}>
            No date specified.
          </Text>
          <PFButton
            variant="ghost"
            label="Go back"
            onPress={() => router.back()}
            style={{ marginTop: spacing.s4 }}
          />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout horizontalPadding={false}>
      {/* ── Date heading + summary ─────────────────────────────────────── */}
      <View
        style={[
          styles.headingBlock,
          {
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s4,
            paddingBottom: spacing.s3,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderDefault,
          },
        ]}
      >
        <Text
          style={{
            fontSize: fontSize.heading2,
            fontWeight: fontWeight.bold,
            color: colors.textPrimary,
            letterSpacing: -0.3,
          }}
        >
          {friendlyDateStr}
        </Text>
        {summaryLine ? (
          <Text
            style={{
              fontSize: fontSize.bodySm,
              color: colors.textSecondary,
              marginTop: spacing.s1,
              fontVariant: ['tabular-nums'],
            }}
          >
            {summaryLine}
          </Text>
        ) : null}
      </View>

      {/* ── Loading skeleton ───────────────────────────────────────────── */}
      {loading ? (
        <>
          <SkeletonBlock lines={3} />
          <SkeletonBlock lines={4} />
          <SkeletonBlock lines={3} />
        </>
      ) : error ? (
        /* ── Error state ──────────────────────────────────────────────── */
        <View style={[styles.centered, { paddingHorizontal: spacing.s5 }]}>
          <Text style={{ color: colors.statusError, fontSize: fontSize.bodyMd, textAlign: 'center' }}>
            {error}
          </Text>
          <PFButton
            variant="ghost"
            label="Try again"
            onPress={load}
            style={{ marginTop: spacing.s4 }}
          />
        </View>
      ) : dayData?.isRestDay ? (
        /* ── Rest day badge ───────────────────────────────────────────── */
        <View style={[styles.centered, { paddingHorizontal: spacing.s5 }]}>
          <View
            style={[
              styles.restCard,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.lg,
                borderColor: colors.borderDefault,
                borderWidth: 1,
                padding: spacing.s6,
              },
            ]}
          >
            <Text style={{ fontSize: 40, textAlign: 'center' }}>😴</Text>
            <Text
              style={{
                fontSize: fontSize.heading3,
                fontWeight: fontWeight.bold,
                color: colors.textPrimary,
                textAlign: 'center',
                marginTop: spacing.s3,
              }}
            >
              Rest day
            </Text>
            <Text
              style={{
                fontSize: fontSize.bodySm,
                color: colors.textSecondary,
                textAlign: 'center',
                marginTop: spacing.s2,
              }}
            >
              Recovery is part of the programme. Your streak is protected.
            </Text>
          </View>
          <PFButton
            variant="ghost"
            label="Back"
            onPress={() => router.back()}
            style={{ marginTop: spacing.s5 }}
          />
        </View>
      ) : sections.length === 0 ? (
        /* ── Empty state ─────────────────────────────────────────────── */
        <View style={[styles.centered, { paddingHorizontal: spacing.s5 }]}>
          <Text
            style={{
              fontSize: fontSize.bodyLg,
              color: colors.textSecondary,
              textAlign: 'center',
            }}
          >
            No workout logged for this day.
          </Text>
          <PFButton
            variant="ghost"
            label="Go back"
            onPress={() => router.back()}
            style={{ marginTop: spacing.s4 }}
          />
        </View>
      ) : (
        /* ── Exercise groups ─────────────────────────────────────────── */
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spacing.s8 }}
          renderSectionHeader={({ section }) => (
            <ExerciseHeader
              name={section.title}
              volumeKg={volumeByExercise.get(section.exerciseId) ?? 0}
              unitPref={unitPref}
            />
          )}
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.setRowContainer,
                {
                  paddingHorizontal: spacing.s5,
                  backgroundColor: bestSetIds.has(item.id)
                    ? colors.accentDefault + '14'
                    : 'transparent',
                },
              ]}
            >
              <SetRow
                set={item}
                setNumber={index + 1}
                isBest={bestSetIds.has(item.id)}
                unitPref={unitPref}
              />
            </View>
          )}
          renderSectionFooter={({ section }) => {
            // Thin divider between exercise groups
            const isLast = sections[sections.length - 1].exerciseId === section.exerciseId;
            if (isLast) return null;
            return (
              <View
                style={{
                  height: StyleSheet.hairlineWidth,
                  backgroundColor: colors.borderDefault,
                  marginTop: spacing.s3,
                  marginHorizontal: spacing.s5,
                }}
              />
            );
          }}
        />
      )}
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  headingBlock: {},
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  restCard: {
    width: '100%',
    alignItems: 'center',
  },
  exerciseHeader: {},
  setRowContainer: {},
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setLabel: {},
  setDetail: {},
});
