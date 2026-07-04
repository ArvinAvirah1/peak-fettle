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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { localDb } from '../src/db/localDb';
import { isLocalFirst } from '../src/data/backup/tierPolicy';
import {
  getExerciseNameMap,
  ensureExerciseCatalogCached,
  displayExerciseName,
} from '../src/data/exerciseNames';
import { deleteSetById } from '../src/data/setEditing';
import {
  WorkoutLoggerHost,
  WorkoutLoggerRef,
  HistoryEditArgs,
  HistoryEditExercise,
} from '../src/components/WorkoutLoggerHost';
import MuscleMap from '../src/components/MuscleMap';
import { muscleGroupsForRoutine } from '../src/data/muscleRegions';
import {
  formatWeight,
  kgToInputValue,
} from '../src/constants/units';
import { UnitSystem } from '../src/constants/units';
// TICKET-128: RIR ⇄ RPE display toggle. Local-only KV read (zero network,
// safe on mount for both tiers) + the single pure conversion helper — sets.rir
// itself is untouched, this only changes how the read-only history row labels it.
import { getEffortDisplay, EffortDisplay } from '../src/data/appSettings';
import { formatEffort } from '../src/components/loggerLogic';
// TICKET-131: share a past workout as a summary card (zero network; the
// percentile flex line + streak are computed on-device inside the sheet).
import { ShareCardSheet } from '../src/components/ShareCardSheet';
import { useLocalStreak } from '../src/hooks/useStreak';

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
  weight_kg?: number;  // exact kg (local v3) — preferred for edit prefill
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

/** Epley e1RM from exact kg and reps. */
function computeE1rm(kg: number, reps: number): number {
  return kg * (1 + reps / 30);
}

/**
 * Resolve a set's weight to exact kg. Prefers weight_kg (the server REST path
 * strips weight_raw and returns only weight_kg); falls back to legacy kg×8.
 */
function setKg(s: ApiSet): number {
  return s.weight_kg ?? (s.weight_raw != null ? s.weight_raw / 8 : 0);
}

/** Volume for a single set in kg. */
function setVolumeKg(s: ApiSet): number {
  if (s.kind !== 'lift' || !s.reps) return 0;
  const kg = setKg(s);
  if (!kg) return 0;
  return kg * s.reps;
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
// Local-first data fetching (free tier — no REST)
// ---------------------------------------------------------------------------

interface LocalSetRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  kind: string;
  set_index: number;
  reps: number | null;
  weight_raw: number | null;
  weight_kg: number | null;
  rir: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  logged_at: string;
}

/**
 * Read a single day's workout + sets entirely from on-device SQLite.
 * Free users have no server copy of personal data, so the previous REST path
 * (3 sequential calls, 15s timeout each) returned nothing → "No workout logged
 * for this day" after a long stall. This resolves names locally and merges any
 * duplicate workout rows for the day.
 */
async function fetchLocalDayData(date: string): Promise<DayData> {
  await localDb.init();

  const workouts = await localDb.getAll<{
    id: string;
    day_key: string;
    session_type: string | null;
    routine_name: string | null;
    created_at: string;
  }>(
    'SELECT id, day_key, session_type, routine_name, created_at FROM workouts WHERE day_key = ? ORDER BY created_at ASC',
    [date]
  );

  if (workouts.length === 0) {
    return { workout: null, isRestDay: false, exerciseGroups: [], totalSets: 0, totalVolumeKg: 0 };
  }

  const isRestDay = workouts.some((w) => w.session_type === 'rest_day');
  const rep =
    workouts.find((w) => w.routine_name) ??
    workouts.find((w) => w.session_type === 'rest_day') ??
    workouts[0]!; // length checked above (early return when 0)
  const apiWorkout: ApiWorkout = {
    id: rep.id,
    day_key: rep.day_key,
    session_type: rep.session_type ?? undefined,
  };

  // Union sets across every workout row for the day (collapses dup rows).
  const ids = workouts.map((w) => w.id);
  const placeholders = ids.map(() => '?').join(',');
  const setRows = await localDb.getAll<LocalSetRow>(
    `SELECT * FROM sets WHERE workout_id IN (${placeholders}) ORDER BY logged_at ASC, set_index ASC`,
    ids
  );

  const nameMap = await getExerciseNameMap();
  void ensureExerciseCatalogCached();

  const apiSets: ApiSet[] = setRows.map((r) => ({
    id: r.id,
    workout_id: r.workout_id,
    exercise_id: r.exercise_id,
    exercise_name: displayExerciseName(r.exercise_id, nameMap),
    kind: r.kind === 'cardio' ? 'cardio' : 'lift',
    // weight_raw is consumed as kg×8 by the display helpers; derive it from the
    // exact weight_kg so values round-trip precisely (no 0.125 kg drift).
    weight_raw: r.weight_kg != null ? r.weight_kg * 8 : (r.weight_raw ?? 0),
    // Exact kg, preferred by the edit prefill so the user re-edits the value
    // they actually typed (not a kg×8-rounded approximation).
    weight_kg: r.weight_kg != null ? r.weight_kg : (r.weight_raw != null ? r.weight_raw / 8 : undefined),
    reps: r.reps ?? 0,
    rir: r.rir,
    set_index: r.set_index,
    duration_sec: r.duration_sec ?? undefined,
    distance_m: r.distance_m ?? null,
    created_at: r.logged_at,
  }));

  const groupOrder: string[] = [];
  const groupMap = new Map<string, ApiSet[]>();
  for (const s of apiSets) {
    if (!groupMap.has(s.exercise_id)) {
      groupOrder.push(s.exercise_id);
      groupMap.set(s.exercise_id, []);
    }
    groupMap.get(s.exercise_id)!.push(s);
  }
  const exerciseGroups: ExerciseGroup[] = groupOrder.map((exId) => ({
    exerciseId: exId,
    exerciseName: displayExerciseName(exId, nameMap),
    sets: groupMap.get(exId)!,
  }));

  const totalSets = apiSets.length;
  const totalVolumeKg = apiSets.reduce((acc, s) => acc + setVolumeKg(s), 0);

  return { workout: apiWorkout, isRestDay, exerciseGroups, totalSets, totalVolumeKg };
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
  /** TICKET-128: RIR ⇄ RPE display toggle. Defaults to 'rir' (unchanged copy). */
  effortDisplay?: EffortDisplay;
}

function SetRow({ set, setNumber, isBest, unitPref, effortDisplay = 'rir' }: SetRowProps): React.ReactElement {
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
  const reps = set.reps ?? 0;
  const weightKg = setKg(set);
  const e1rmKg = computeE1rm(weightKg, reps);
  const weightDisplay = formatWeight(weightKg, unitPref, 1);
  const e1rmDisplay = formatWeight(e1rmKg, unitPref, 0);
  // TICKET-128: same stored set.rir, labeled per the effort-display setting
  // ("RIR 2" / "RPE 8" / "to failure" / "RPE ≤ 5") — null when RIR was never
  // recorded for this set, in which case nothing extra renders.
  const effortLabel = formatEffort(set.rir ?? null, effortDisplay);

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
        {effortLabel ? ` · ${effortLabel}` : ''}
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
  exerciseId: string;
  volumeKg: number;
  unitPref: UnitSystem;
  onPress: (exerciseId: string, name: string) => void;
}

function ExerciseHeader({ name, exerciseId, volumeKg, unitPref, onPress }: ExerciseHeaderProps): React.ReactElement {
  const { theme: { colors }, spacing, fontSize, fontWeight } = useTheme();
  const volDisplay = formatWeight(volumeKg, unitPref, 0);
  return (
    <TouchableOpacity
      onPress={() => onPress(exerciseId, name)}
      accessibilityRole="button"
      accessibilityLabel={`View progress for ${name}`}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontSize: fontSize.bodyLg,
            fontWeight: fontWeight.bold,
            color: colors.textPrimary,
            flex: 1,
          }}
        >
          {name}
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: colors.accentDefault, marginLeft: 8 }}>
          Trends ›
        </Text>
      </View>
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
    </TouchableOpacity>
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

  // TICKET-131: share-card sheet for this past workout. Streak comes from the
  // local-first hook (free tier computes on-device; Pro passthrough is 0 and
  // the card omits the streak line).
  const [shareVisible, setShareVisible] = useState(false);
  const { streak: shareStreakWeeks } = useLocalStreak(0, false);

  // TICKET-128: RIR ⇄ RPE display toggle — local-only KV read, zero network,
  // safe on mount. Defaults to 'rir' until loaded (unchanged existing copy).
  const [effortDisplay, setEffortDisplay] = useState<EffortDisplay>('rir');
  useEffect(() => {
    let cancelled = false;
    getEffortDisplay()
      .then((mode) => { if (!cancelled) setEffortDisplay(mode); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Editing a past set now opens the FULL stepper flow (P1c) ─────────────────
  // Tapping a logged set opens StepperLogger (via WorkoutLoggerHost) seeded with
  // THIS session's exercises + already-logged sets, in edit mode; saving routes
  // through setEditing.updateLiftSet to UPDATE the existing row. Long-press still
  // deletes. Both paths are tier-branched/local-first inside their data modules.
  const loggerRef = useRef<WorkoutLoggerRef>(null);

  const localFirst = isLocalFirst(user);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const data = localFirst ? await fetchLocalDayData(date) : await fetchDayData(date);
      setDayData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workout');
    } finally {
      setLoading(false);
    }
  }, [date, localFirst]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Build the stepper's history-edit payload from the loaded day ────────────
  // Each logged set is converted kg → DISPLAY string (the stepper edits display
  // units and the host converts back to exact kg on save). Order is preserved so
  // the chip position maps to the right DB row.
  const buildHistoryExercises = useCallback((): HistoryEditExercise[] => {
    if (!dayData) return [];
    return dayData.exerciseGroups.map((g) => {
      const isCardio = g.sets.some((s) => s.kind === 'cardio');
      return {
        exerciseId: g.exerciseId,
        name: g.exerciseName,
        category: isCardio ? 'cardio' : 'lift',
        sets: g.sets.map((s) => {
          if (s.kind === 'cardio') {
            return {
              id: s.id,
              workoutId: s.workout_id,
              setIndex: s.set_index ?? 0,
              weightDisplay: '',
              reps: '',
              durationSec: s.duration_sec ?? undefined,
              distanceM: s.distance_m ?? undefined,
            };
          }
          const kg = s.weight_kg ?? (s.weight_raw != null ? s.weight_raw / 8 : 0);
          return {
            id: s.id,
            workoutId: s.workout_id,
            setIndex: s.set_index ?? 0,
            weightDisplay: kgToInputValue(kg, unitPref),
            reps: String(s.reps ?? 0),
            rir: s.rir != null ? String(s.rir) : undefined,
          };
        }),
      };
    });
  }, [dayData, unitPref]);

  const openSetEditor = useCallback((set: ApiSet) => {
    const exercises = buildHistoryExercises();
    if (exercises.length === 0) return;
    const startIndex = Math.max(
      0,
      exercises.findIndex((ex) => ex.exerciseId === set.exercise_id),
    );
    const args: HistoryEditArgs = {
      name: friendlyDate(date ?? ''),
      exercises,
      startIndex,
      onChange: load, // re-read SQLite after an in-place edit / finish
    };
    loggerRef.current?.startHistoryEdit(args);
  }, [buildHistoryExercises, date, load]);

  const handleDeleteSet = useCallback((set: ApiSet) => {
    Alert.alert('Delete set', 'Remove this set? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSetById(user, set.id);
            await load();
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  }, [user, load]);

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

  // ── P2: muscles worked this session → drives the header MuscleMap ───────────
  // Derived from the session's exercise names via muscleGroupsForRoutine. No
  // network: name-keyword resolution is fully on-device (local-first safe).
  const sessionMuscleGroups = useMemo(() => {
    if (!dayData || dayData.isRestDay) return [];
    return muscleGroupsForRoutine(
      dayData.exerciseGroups.map((g) => ({ name: g.exerciseName })),
    );
  }, [dayData]);

  // ── Best-set map per exercise ─────────────────────────────────────────────

  const bestSetIds = useMemo(() => {
    const ids = new Set<string>();
    if (!dayData) return ids;
    for (const group of dayData.exerciseGroups) {
      let bestE1rm = -Infinity;
      let bestId: string | null = null;
      for (const s of group.sets) {
        const kg = setKg(s);
        if (s.kind === 'lift' && kg && s.reps) {
          const e = computeE1rm(kg, s.reps);
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

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleExerciseHeaderPress = useCallback(
    (exerciseId: string, exerciseName: string) => {
      router.push(
        ('/trends?exerciseId=' + exerciseId + '&exerciseName=' + encodeURIComponent(exerciseName)) as any
      );
    },
    [router]
  );

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
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s4,
            paddingBottom: spacing.s3,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderDefault,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
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
          {summaryLine ? (
            <Text
              style={{
                fontSize: fontSize.caption,
                color: colors.textTertiary,
                marginTop: spacing.s1,
              }}
            >
              Tap a set to edit · long-press to delete.
            </Text>
          ) : null}
        </View>
        {/* P2: muscles worked this session (front + back silhouette). */}
        {sessionMuscleGroups.length > 0 ? (
          <MuscleMap
            groups={sessionMuscleGroups}
            size={84}
            view="both"
            style={{ marginLeft: spacing.s3 }}
          />
        ) : null}
      </View>

      {/* TICKET-131: share this workout as a summary card (user-initiated). */}
      {!loading && !error && dayData && !dayData.isRestDay && dayData.totalSets > 0 ? (
        <View style={{ paddingHorizontal: spacing.s5, paddingTop: spacing.s2 }}>
          <PFButton
            variant="ghost"
            label="Share workout card"
            onPress={() => setShareVisible(true)}
          />
        </View>
      ) : null}

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
              exerciseId={section.exerciseId}
              volumeKg={volumeByExercise.get(section.exerciseId) ?? 0}
              unitPref={unitPref}
              onPress={handleExerciseHeaderPress}
            />
          )}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => openSetEditor(item)}
              onLongPress={() => handleDeleteSet(item)}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={`Set ${index + 1}. Tap to edit, long-press to delete.`}
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
                effortDisplay={effortDisplay}
              />
            </TouchableOpacity>
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

      {/* ── P1c: editing a past set runs through the FULL stepper flow ──────────
          The host renders StepperLogger as its own full-screen modal; we open it
          via loggerRef.startHistoryEdit(...) when a set is tapped. onChange/
          onFinish re-read SQLite so corrections show immediately. */}
      <WorkoutLoggerHost ref={loggerRef} onFinish={load} />

      {/* TICKET-131: share card for this day's workout. PR badges are omitted
          for past workouts in v1 (the per-session PR compare lives in the live
          logger); the flex line still works from the day's best lift sets. */}
      <ShareCardSheet
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        workoutName={(dayData?.workout as { routine_name?: string | null } | null)?.routine_name ?? null}
        dayKey={date ?? ''}
        durationSec={null}
        totalVolumeKg={dayData?.totalVolumeKg ?? 0}
        setCount={dayData?.totalSets ?? 0}
        streakWeeks={shareStreakWeeks}
        prBadges={[]}
        flexLineCandidateSets={(dayData?.exerciseGroups ?? []).flatMap((g) =>
          g.sets.map((s) => ({
            exerciseName: g.exerciseName,
            weightKg: setKg(s),
            reps: s.reps ?? null,
          })),
        )}
        unitPref={unitPref}
      />
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
