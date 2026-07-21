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
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
// TICKET-129: per-set notes + flags (tier-branched local/Pro read+write, plus
// the shared flag-label/bitmask helpers and the note/flags bottom sheet).
import { saveSetNoteFlags, flagLabels } from '../src/data/setNotes';
import { SetNoteSheet } from '../src/components/logger/SetNoteSheet';
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
  // TICKET-129
  note?: string | null;
  flags?: number | null;
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
  // Tolerate an ISO-timestamp input (server-Date-serialised day_key) — only
  // the calendar-date prefix is meaningful.
  const [year, month, day] = dateStr.slice(0, 10).split('-').map(Number);
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
  // Defensive: accept an ISO-timestamp date param (older builds/links passed
  // the server's Date-serialised day_key through) — the server contract and
  // all comparisons below are plain YYYY-MM-DD.
  const dayKey = date.slice(0, 10);

  // 1. Find the workout for this day
  const workoutsRes = await apiClient.get<{ workouts?: ApiWorkout[] } | ApiWorkout[]>(
    `/workouts?from=${dayKey}&to=${dayKey}`
  );

  // Server may return array directly or wrapped in { workouts: [...] }
  let workouts: ApiWorkout[];
  if (Array.isArray(workoutsRes.data)) {
    workouts = workoutsRes.data;
  } else {
    workouts = (workoutsRes.data as { workouts?: ApiWorkout[] }).workouts ?? [];
  }
  // Same defence on the response rows (DATE serialised as ISO timestamp).
  workouts = workouts.map((w) => ({ ...w, day_key: String(w.day_key).slice(0, 10) }));

  const workout = workouts.find((w) => w.day_key === dayKey) ?? workouts[0] ?? null;

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
  // TICKET-129
  note: string | null;
  flags: number | null;
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
    // TICKET-129
    note: r.note ?? null,
    flags: r.flags ?? 0,
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
  /** TICKET-129: open the note/flags sheet for this set. */
  onOpenNote?: (set: ApiSet) => void;
}

/** TICKET-129: truncated-with-expand note + flag chip row, shown under a SetRow when annotated. */
function SetAnnotation({ note, flags }: { note: string | null | undefined; flags: number | null | undefined }): React.ReactElement | null {
  const { theme: { colors }, spacing, fontSize, radius } = useTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const labels = flagLabels(flags);
  const hasNote = !!note && note.trim() !== '';
  if (!hasNote && labels.length === 0) return null;

  const TRUNCATE_AT = 60;
  const noteText = note ?? '';
  const isLong = noteText.length > TRUNCATE_AT;
  const displayText = expanded || !isLong ? noteText : `${noteText.slice(0, TRUNCATE_AT)}…`;

  return (
    <View style={{ paddingLeft: 44, paddingBottom: spacing.s2, gap: spacing.s1 }}>
      {labels.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s1 }}>
          {labels.map((label) => (
            <View
              key={label}
              style={{
                paddingHorizontal: spacing.s2,
                paddingVertical: 2,
                borderRadius: radius.full,
                backgroundColor: colors.accentDefault + '1A',
              }}
            >
              <Text style={{ fontSize: fontSize.micro, color: colors.accentDefault }}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {hasNote ? (
        <TouchableOpacity
          onPress={() => isLong && setExpanded((e) => !e)}
          disabled={!isLong}
          accessibilityRole={isLong ? 'button' : undefined}
accessibilityLabel={isLong ? (expanded ? t('screens2:workoutDay.collapseNote') : t('screens2:workoutDay.expandNote')) : undefined}
        >
          <Text style={{ fontSize: fontSize.caption, color: colors.textTertiary, fontStyle: 'italic' }}>
{t('screens2:workoutDay.quotedNote', { text: displayText })}{isLong ? (expanded ? t('screens2:workoutDay.lessSuffix') : t('screens2:workoutDay.moreSuffix')) : ''}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SetRow({ set, setNumber, isBest, unitPref, effortDisplay = 'rir', onOpenNote }: SetRowProps): React.ReactElement {
  const { theme: { colors }, spacing, fontSize, fontWeight } = useTheme();
  const { t } = useTranslation();

  const accentColor = isBest ? colors.accentDefault : colors.textPrimary;
  const subColor = isBest ? colors.accentDefault : colors.textSecondary;
  const hasAnnotation = (!!set.note && set.note.trim() !== '') || !!(set.flags && set.flags !== 0);

  // TICKET-129: small note-icon button — tap opens the note/flags sheet. Kept
  // separate from the row's own tap-to-edit / long-press-to-delete gestures
  // (workout-day already uses both) so there's no gesture conflict.
  const noteButton = onOpenNote ? (
    <TouchableOpacity
      onPress={() => onOpenNote(set)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
accessibilityLabel={hasAnnotation ? t('screens2:workoutDay.editSetNoteA11y') : t('screens2:workoutDay.addSetNoteA11y')}
      style={{ paddingHorizontal: spacing.s1 }}
    >
      <Text style={{ fontSize: fontSize.bodySm, color: hasAnnotation ? colors.accentDefault : colors.textTertiary }}>
        {hasAnnotation ? '📝' : '🗒️'}
      </Text>
    </TouchableOpacity>
  ) : null;

  if (set.kind === 'cardio') {
    const duration = set.duration_sec ? formatDuration(set.duration_sec) : '—';
    const distance = set.distance_m ? formatDistance(set.distance_m) : null;
    return (
      <View>
        <View style={[styles.setRow, { paddingVertical: spacing.s2 }]}>
          <Text style={[styles.setLabel, { color: colors.textTertiary, fontSize: fontSize.bodySm }]}>
            {t('screens2:workoutDay.setNumber', { number: setNumber })}
          </Text>
          <Text style={[styles.setDetail, { flex: 1, color: accentColor, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }]}>
            {distance ? t('screens2:workoutDay.durationAndDistance', { duration, distance }) : duration}
          </Text>
          {noteButton}
        </View>
        <SetAnnotation note={set.note} flags={set.flags} />
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
    <View>
      <View style={[styles.setRow, { paddingVertical: spacing.s2, minHeight: 48 }]}>
        <Text
          style={{
            color: colors.textTertiary,
            fontSize: fontSize.bodySm,
            fontVariant: ['tabular-nums'],
            minWidth: 44,
          }}
        >
          {t('screens2:workoutDay.setNumber', { number: setNumber })}
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
          {t('screens2:workoutDay.weightAndReps', { weight: weightDisplay, reps })}
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
          {t('screens2:workoutDay.e1rmApprox', { value: e1rmDisplay })}
        </Text>
        {noteButton}
      </View>
      <SetAnnotation note={set.note} flags={set.flags} />
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
  const { t } = useTranslation();
  const volDisplay = formatWeight(volumeKg, unitPref, 0);
  return (
    <TouchableOpacity
      onPress={() => onPress(exerciseId, name)}
      accessibilityRole="button"
      accessibilityLabel={t('screens2:workoutDay.viewProgressA11y', { name })}
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
          {t('screens2:workoutDay.trendsArrow')}
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
        {t('screens2:workoutDay.totalVolume', { value: volDisplay })}
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
  const { t } = useTranslation();
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

  // TICKET-129: per-set note/flags sheet — target set is whichever row's note
  // icon was tapped; null = sheet closed.
  const [noteTarget, setNoteTarget] = useState<ApiSet | null>(null);
  const handleOpenNote = useCallback((set: ApiSet) => setNoteTarget(set), []);
  const noteSheetLabel = useMemo(() => {
    if (!noteTarget) return undefined;
    for (const g of dayData?.exerciseGroups ?? []) {
      const idx = g.sets.findIndex((s) => s.id === noteTarget.id);
      if (idx >= 0) return t('screens2:workoutDay.exerciseSetLabel', { exerciseName: g.exerciseName, number: idx + 1 });
    }
    return t('screens2:workoutDay.setNoteFallback');
  }, [noteTarget, dayData]);
  const handleSaveNote = useCallback(
    async (patch: { note?: string | null; flags?: number }) => {
      if (!noteTarget) return;
      await saveSetNoteFlags(user, noteTarget.id, patch);
      // Reflect the change immediately without a full reload flicker: patch the
      // in-memory dayData so the chip/annotation update right away, and also
      // patch noteTarget so the open sheet keeps showing the latest state.
      setNoteTarget((prev) => (prev ? { ...prev, ...patch } : prev));
      setDayData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exerciseGroups: prev.exerciseGroups.map((g) => ({
            ...g,
            sets: g.sets.map((s) => (s.id === noteTarget.id ? { ...s, ...patch } : s)),
          })),
        };
      });
    },
    [noteTarget, user],
  );

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
      setError(err instanceof Error ? err.message : t('screens2:workoutDay.loadFailed'));
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
    Alert.alert(t('screens2:workoutDay.deleteSetTitle'), t('screens2:workoutDay.deleteSetBody'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSetById(user, set.id);
            await load();
          } catch {
            Alert.alert(t('screens2:workoutDay.couldNotDeleteTitle'), t('screens2:workoutDay.couldNotDeleteBody'));
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
    const exLabel = t('screens2:workoutDay.exerciseCount', { count: exCount });
    const setLabel = t('screens2:workoutDay.setCount', { count: totalSets });
    return t('screens2:workoutDay.summaryLine', { exLabel, setLabel, volume: volDisplay });
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
      <ScreenLayout edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={{ color: colors.textSecondary, fontSize: fontSize.bodyMd }}>
            {t('screens2:workoutDay.noDateSpecified')}
          </Text>
          <PFButton
            variant="ghost"
            label={t('common:back')}
            onPress={() => router.back()}
            style={{ marginTop: spacing.s4 }}
          />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout horizontalPadding={false} edges={['bottom']}>
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
              {t('screens2:workoutDay.tapEditHint')}
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
            label={t('screens2:workoutDay.shareWorkoutCard')}
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
            label={t('screens2:workoutDay.tryAgain')}
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
              {t('screens2:workoutDay.restDayTitle')}
            </Text>
            <Text
              style={{
                fontSize: fontSize.bodySm,
                color: colors.textSecondary,
                textAlign: 'center',
                marginTop: spacing.s2,
              }}
            >
              {t('screens2:workoutDay.restDayBody')}
            </Text>
          </View>
          <PFButton
            variant="ghost"
            label={t('common:back')}
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
            {t('screens2:workoutDay.emptyState')}
          </Text>
          {/* Backdate entry (2026-07-14): nothing logged on a PAST day →
              offer to add the session after the fact. */}
          {typeof date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(date) &&
          date <
            (() => {
              // LOCAL day key (not UTC) — the day_key convention app-wide.
              const d = new Date();
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })() ? (
            <PFButton
              variant="primary"
              label={t('screens2:workoutDay.logThisDay')}
              onPress={() => router.push(`/backdate-workout?date=${date}`)}
              style={{ marginTop: spacing.s4 }}
            />
          ) : null}
          <PFButton
            variant="ghost"
            label={t('common:back')}
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
accessibilityLabel={t('screens2:workoutDay.setEditA11y', { number: index + 1 })}
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
                onOpenNote={handleOpenNote}
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

      {/* TICKET-129: per-set note + quick-tap flags. */}
      <SetNoteSheet
        visible={!!noteTarget}
        onClose={() => setNoteTarget(null)}
        initialNote={noteTarget?.note}
        initialFlags={noteTarget?.flags}
        setLabel={noteSheetLabel}
        onSave={handleSaveNote}
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
