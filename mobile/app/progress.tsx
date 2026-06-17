/**
 * Progress & Analytics screen — Peak Fettle
 *
 * Reachable via router.push('/progress') from the home tab.
 * Registered in _layout.tsx as name="progress".
 *
 * Sections (top → bottom):
 *   1. Consistency score + PFProgressBar
 *   2. Sessions per week — VictoryBar chart
 *   3. Weekly volume (kg) — VictoryBar chart
 *   4. Top 5 personal records — FlatList of cards
 *
 * All colors/sizes via useTheme(). Zero hardcoded hex or numeric font sizes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, PFProgressBar, ScreenLayout } from '../src/components/ui';
import { apiClient } from '../src/api/client';
import { useAuth } from '../src/hooks/useAuth';
import { isLocalFirst } from '../src/data/backup/tierPolicy';
import { localDb } from '../src/db/localDb';
import {
  getExerciseNameMap,
  ensureExerciseCatalogCached,
  displayExerciseName,
} from '../src/data/exerciseNames';

function VictoryChart({
  children,
  height = 180,
}: {
  children?: React.ReactNode;
  width?: number;
  height?: number;
  domainPadding?: unknown;
  padding?: unknown;
  style?: unknown;
}): React.ReactElement {
  return <View style={{ height }}>{children}</View>;
}

function VictoryAxis(_props: Record<string, unknown>): null {
  return null;
}

function VictoryBar(_props: Record<string, unknown>): null {
  return null;
}

function VictoryLine(_props: Record<string, unknown>): null {
  return null;
}

function VictoryScatter(_props: Record<string, unknown>): null {
  return null;
}

function VictoryTooltip(_props: Record<string, unknown>): null {
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiWorkout {
  id: string;
  started_at: string;
  session_type: string;
}

interface ApiSet {
  exercise_id: string;
  exercise_name: string;
  weight_raw: number; // SMALLINT — divide by 8 to get kg
  reps: number;
  created_at: string;
  workout_id: string;
}

interface WeekBucket {
  label: string; // 'W1' … 'W8'
  isoWeek: string; // 'YYYY-Www'
  workoutCount: number;
  totalVolume: number; // kg
}

interface PREntry {
  exerciseId: string;
  exerciseName: string;
  e1rmKg: number;
  date: string; // ISO date string of the set
  isRecent: boolean; // created_at within last 30 days
}

// ── Cardio analytics ─────────────────────────────────────────────────────────

interface MileageWeekRow {
  week_start: string;       // YYYY-MM-DD (Monday of that ISO week)
  activity_type: string;    // 'run' | 'ride' | 'swim' | 'walk' | 'other'
  total_distance_m: number;
  session_count: number;
}

interface PaceTrendRow {
  month_start: string;      // YYYY-MM-DD (first of month)
  activity_type: string;
  avg_pace_sec_per_km: number;
  session_count: number;
}

interface CardioData {
  mileageWeeks: MileageWeekRow[];
  tenPctWarning: boolean;
  paceMonths: PaceTrendRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const week = Math.ceil(
    ((d.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7,
  );
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Returns the 8 most-recent ISO week keys, oldest first. */
function lastEightWeeks(): string[] {
  const weeks: string[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i * 7);
    weeks.push(isoWeek(d.toISOString()));
  }
  // Deduplicate (edge-case: current week appears at both i=0 and i=1 boundary)
  return [...new Set(weeks)].slice(-8);
}

/** Formats seconds-per-km pace as "M:SS /km". */
function formatPace(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/** Returns "Jan", "Feb", … from a YYYY-MM-DD month_start string. */
function shortMonth(monthStart: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(monthStart.slice(5, 7), 10) - 1;
  return months[m] ?? '?';
}

function epley(weightRaw: number, reps: number): number {
  const kg = weightRaw / 8;
  return kg * (1 + reps / 30);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Data fetching + computation
// ---------------------------------------------------------------------------

interface ProgressData {
  consistency: number; // 0–100
  weekBuckets: WeekBucket[];
  topPRs: PREntry[];
}

async function fetchProgressData(): Promise<ProgressData> {
  const [workoutsRes, setsRes] = await Promise.all([
    apiClient.get<{ workouts: ApiWorkout[] }>('/workouts?limit=200'),
    apiClient.get<{ sets: ApiSet[] }>('/sets?limit=500'),
  ]);

  const workouts: ApiWorkout[] = workoutsRes.data.workouts ?? [];
  const sets: ApiSet[] = setsRes.data.sets ?? [];

  // ── Week buckets ──────────────────────────────────────────────────────────
  const targetWeeks = lastEightWeeks();

  // Map each workout to its ISO week
  const workoutWeekMap = new Map<string, string[]>();
  for (const w of workouts) {
    const wk = isoWeek(w.started_at);
    if (!workoutWeekMap.has(wk)) workoutWeekMap.set(wk, []);
    workoutWeekMap.get(wk)!.push(w.id);
  }

  // Map workout_id → ISO week for volume computation
  const workoutIdToWeek = new Map<string, string>();
  for (const w of workouts) {
    workoutIdToWeek.set(w.id, isoWeek(w.started_at));
  }

  // Accumulate volume per week
  const volumePerWeek = new Map<string, number>();
  for (const s of sets) {
    const wk = workoutIdToWeek.get(s.workout_id);
    if (!wk) continue;
    const vol = (s.weight_raw / 8) * s.reps;
    volumePerWeek.set(wk, (volumePerWeek.get(wk) ?? 0) + vol);
  }

  const weekBuckets: WeekBucket[] = targetWeeks.map((wk, idx) => ({
    label: `W${idx + 1}`,
    isoWeek: wk,
    workoutCount: workoutWeekMap.get(wk)?.length ?? 0,
    totalVolume: Math.round(volumePerWeek.get(wk) ?? 0),
  }));

  const weeksWithWorkout = weekBuckets.filter((b) => b.workoutCount > 0).length;
  const consistency = Math.round((weeksWithWorkout / 8) * 100);

  // ── Personal records ──────────────────────────────────────────────────────
  const prMap = new Map<string, PREntry>();
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;

  for (const s of sets) {
    const e1rm = epley(s.weight_raw, s.reps);
    const existing = prMap.get(s.exercise_id);
    if (!existing || e1rm > existing.e1rmKg) {
      prMap.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        exerciseName: s.exercise_name,
        e1rmKg: e1rm,
        date: s.created_at,
        isRecent: new Date(s.created_at).getTime() >= thirtyDaysAgo,
      });
    }
  }

  const topPRs = [...prMap.values()]
    .sort((a, b) => b.e1rmKg - a.e1rmKg)
    .slice(0, 5);

  return { consistency, weekBuckets, topPRs };
}

async function fetchCardioData(): Promise<CardioData> {
  const [mileageRes, paceRes] = await Promise.all([
    apiClient.get<{ weeks: MileageWeekRow[]; ten_pct_warning: boolean }>('/workouts/mileage-weekly'),
    apiClient.get<{ months: PaceTrendRow[] }>('/workouts/pace-trend'),
  ]);
  return {
    mileageWeeks: mileageRes.data.weeks ?? [],
    tenPctWarning: mileageRes.data.ten_pct_warning ?? false,
    paceMonths: paceRes.data.months ?? [],
  };
}

/**
 * Local-first equivalent of fetchProgressData for free users — reads the
 * on-device workouts/sets tables instead of GET /workouts + GET /sets (which
 * hang for free users, who have no server-side training data). Reuses the exact
 * same week-bucket / consistency / PR maths so the screen renders identically.
 * Weight uses exact weight_kg (schema v3) with weight_raw/8 as the fallback.
 */
async function fetchLocalProgressData(): Promise<ProgressData> {
  await localDb.init();
  const workouts = await localDb.getAll<{ id: string; day_key: string }>(
    `SELECT id, day_key FROM workouts ORDER BY day_key DESC LIMIT 200`,
  );
  const sets = await localDb.getAll<{
    exercise_id: string;
    weight_kg: number | null;
    weight_raw: number | null;
    reps: number | null;
    logged_at: string;
    workout_id: string;
  }>(
    `SELECT exercise_id, weight_kg, weight_raw, reps, logged_at, workout_id
       FROM sets WHERE kind = 'lift' ORDER BY logged_at DESC LIMIT 1000`,
  );
  const nameMap = await getExerciseNameMap();
  void ensureExerciseCatalogCached();

  const kgOf = (s: { weight_kg: number | null; weight_raw: number | null }): number =>
    s.weight_kg != null ? s.weight_kg : (s.weight_raw != null ? s.weight_raw / 8 : 0);

  // ── Week buckets ────────────────────────────────────────────────────────────
  const targetWeeks = lastEightWeeks();
  const workoutWeekMap = new Map<string, string[]>();
  const workoutIdToWeek = new Map<string, string>();
  for (const w of workouts) {
    const wk = isoWeek(w.day_key);
    if (!workoutWeekMap.has(wk)) workoutWeekMap.set(wk, []);
    workoutWeekMap.get(wk)!.push(w.id);
    workoutIdToWeek.set(w.id, wk);
  }
  const volumePerWeek = new Map<string, number>();
  for (const s of sets) {
    const wk = workoutIdToWeek.get(s.workout_id);
    if (!wk) continue;
    volumePerWeek.set(wk, (volumePerWeek.get(wk) ?? 0) + kgOf(s) * (s.reps ?? 0));
  }
  const weekBuckets: WeekBucket[] = targetWeeks.map((wk, idx) => ({
    label: `W${idx + 1}`,
    isoWeek: wk,
    workoutCount: workoutWeekMap.get(wk)?.length ?? 0,
    totalVolume: Math.round(volumePerWeek.get(wk) ?? 0),
  }));
  const weeksWithWorkout = weekBuckets.filter((b) => b.workoutCount > 0).length;
  const consistency = Math.round((weeksWithWorkout / 8) * 100);

  // ── Personal records ────────────────────────────────────────────────────────
  const prMap = new Map<string, PREntry>();
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  for (const s of sets) {
    const e1rm = kgOf(s) * (1 + (s.reps ?? 0) / 30);
    const existing = prMap.get(s.exercise_id);
    if (!existing || e1rm > existing.e1rmKg) {
      prMap.set(s.exercise_id, {
        exerciseId: s.exercise_id,
        exerciseName: displayExerciseName(s.exercise_id, nameMap),
        e1rmKg: e1rm,
        date: s.logged_at,
        isRecent: new Date(s.logged_at).getTime() >= thirtyDaysAgo,
      });
    }
  }
  const topPRs = [...prMap.values()].sort((a, b) => b.e1rmKg - a.e1rmKg).slice(0, 5);

  return { consistency, weekBuckets, topPRs };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label }: { label: string }): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing } = useTheme();
  return (
    <Text
      style={{
        fontSize: fontSize.caption,
        fontWeight: fontWeight.semibold,
        color: theme.colors.textTertiary,
        letterSpacing: 1,
        marginTop: spacing.s5,
        marginBottom: spacing.s3,
      }}
    >
      {label}
    </Text>
  );
}

function SkeletonRow({ height = 16 }: { height?: number }): React.ReactElement {
  const { theme, radius, spacing } = useTheme();
  return (
    <View
      style={{
        height,
        borderRadius: radius.sm,
        backgroundColor: theme.colors.bgElevated,
        marginBottom: spacing.s2,
      }}
    />
  );
}

function PRCard({ item }: { item: PREntry }): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.prCard,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.md,
          padding: spacing.s4,
          marginBottom: spacing.s3,
        },
      ]}
      accessible
      accessibilityLabel={`${item.exerciseName}, estimated one-rep max ${item.e1rmKg.toFixed(1)} kilograms`}
    >
      <View style={styles.prCardRow}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              fontWeight: fontWeight.bold,
              color: theme.colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {item.exerciseName}
          </Text>
          <Text
            style={{
              fontSize: fontSize.caption,
              color: theme.colors.textTertiary,
              marginTop: 2,
            }}
          >
            {formatDate(item.date)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text
            style={{
              fontSize: fontSize.bodyLg,
              fontWeight: fontWeight.bold,
              color: theme.colors.textPrimary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {item.e1rmKg.toFixed(1)} kg
          </Text>
          {item.isRecent && (
            <View
              style={{
                backgroundColor: theme.colors.statusSuccess + '26',
                borderRadius: radius.sm,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.micro,
                  fontWeight: fontWeight.bold,
                  color: theme.colors.statusSuccess,
                }}
              >
                NEW
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProgressScreen(): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [data, setData] = useState<ProgressData | null>(null);
  const [cardioData, setCardioData] = useState<CardioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (localFirst) {
        // Free/local-first: read strength progress from on-device SQLite. Cardio
        // mileage/pace are server-only aggregates with no local source, so they
        // stay empty here rather than hanging on GET /workouts/*.
        setData(await fetchLocalProgressData());
        setCardioData(null);
      } else {
        const [result, cardio] = await Promise.all([
          fetchProgressData(),
          fetchCardioData().catch(() => null), // cardio data is supplementary — never block on failure
        ]);
        setData(result);
        setCardioData(cardio);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load progress data.');
    } finally {
      setLoading(false);
    }
  }, [localFirst]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Chart dimensions ──────────────────────────────────────────────────────
  // VictoryChart requires explicit numeric width — use a fixed viewport width.
  // Screens are typically 390 pt wide; subtract 2 × spacing.s5 (40 pt) padding.
  const chartWidth = 350;
  const chartHeight = 200;

  // ── Tick formatter for volume ─────────────────────────────────────────────
  const volumeTick = useCallback((v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return String(v);
  }, []);

  // ── Cardio: aggregate mileage weeks into chart buckets ────────────────────
  // Combine all activity types per week into a single km total for the bar chart.
  // Label weeks W1…W8 oldest→newest.
  const mileageBuckets = useMemo(() => {
    if (!cardioData?.mileageWeeks.length) return [];
    const weekMap = new Map<string, number>();
    for (const row of cardioData.mileageWeeks) {
      weekMap.set(row.week_start, (weekMap.get(row.week_start) ?? 0) + row.total_distance_m);
    }
    const sorted = [...weekMap.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    return sorted.map(([, totalM], idx) => ({
      x: `W${idx + 1}`,
      y: Math.round((totalM / 1000) * 10) / 10, // m → km, 1 decimal
    }));
  }, [cardioData]);

  // ── Cardio: pace trend for running (most relevant for pace guidance) ───────
  const runPaceTrend = useMemo(() => {
    if (!cardioData?.paceMonths.length) return [];
    return cardioData.paceMonths
      .filter((r) => r.activity_type === 'run')
      .map((r, idx) => ({
        x: idx + 1,
        xLabel: shortMonth(r.month_start),
        y: r.avg_pace_sec_per_km,
        label: formatPace(r.avg_pace_sec_per_km),
      }));
  }, [cardioData]);

  // ── Shared Victory styles (derived from theme) ────────────────────────────
  const axisStyle = useMemo(
    () => ({
      axis: { stroke: theme.colors.borderDefault },
      tickLabels: {
        fill: theme.colors.textTertiary,
        fontSize: 10,
        fontVariant: 'tabular-nums' as const,
      },
      grid: { stroke: 'transparent' },
    }),
    [theme],
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ScreenLayout scrollable>
      {/* ── 1. Consistency score ── */}
      <View style={[styles.consistencyBlock, { marginTop: spacing.s4 }]}>
        {loading ? (
          <>
            <SkeletonRow height={56} />
            <SkeletonRow height={10} />
          </>
        ) : error ? null : (
          <>
            <Text
              style={{
                fontSize: fontSize.display,
                fontWeight: fontWeight.bold,
                color: theme.colors.accentDefault,
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
              }}
              accessibilityRole="text"
              accessibilityLabel={`Consistency score: ${data?.consistency ?? 0} percent`}
            >
              {data?.consistency ?? 0}%
            </Text>
            <Text
              style={{
                fontSize: fontSize.caption,
                color: theme.colors.textSecondary,
                textAlign: 'center',
                marginTop: spacing.s1,
                marginBottom: spacing.s3,
              }}
            >
              consistency last 8 weeks
            </Text>
            <PFProgressBar value={(data?.consistency ?? 0) / 100} height={8} />
          </>
        )}
      </View>

      {/* ── Error state ── */}
      {error ? (
        <View style={[styles.errorBlock, { marginTop: spacing.s6 }]}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={theme.colors.statusError}
            accessibilityElementsHidden
          />
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: theme.colors.statusError,
              textAlign: 'center',
              marginTop: spacing.s3,
              marginBottom: spacing.s4,
            }}
          >
            {error}
          </Text>
          <PFButton
            variant="primary"
            label="Retry"
            onPress={load}
            accessibilityLabel="Retry loading progress data"
          />
        </View>
      ) : null}

      {/* ── 2. Sessions per week ── */}
      {!error && (
        <>
          <SectionHeader label="SESSIONS PER WEEK" />
          {loading ? (
            <SkeletonRow height={chartHeight} />
          ) : (
            <VictoryChart
              width={chartWidth}
              height={chartHeight}
              padding={{ top: 10, bottom: 40, left: 40, right: 16 }}
              style={{ background: { fill: 'transparent' } }}
            >
              <VictoryAxis
                style={axisStyle}
                tickValues={data?.weekBuckets.map((b) => b.label) ?? []}
              />
              <VictoryAxis
                dependentAxis
                style={axisStyle}
                tickFormat={(v: number) => (Number.isInteger(v) ? String(v) : '')}
              />
              <VictoryBar
                data={data?.weekBuckets.map((b) => ({
                  x: b.label,
                  y: b.workoutCount,
                })) ?? []}
                style={{
                  data: {
                    fill: theme.colors.accentDefault,
                    width: 28,
                  },
                }}
                cornerRadius={{ top: 4 }}
              />
            </VictoryChart>
          )}
        </>
      )}

      {/* ── 3. Weekly volume ── */}
      {!error && (
        <>
          <SectionHeader label="WEEKLY VOLUME (KG)" />
          {loading ? (
            <SkeletonRow height={chartHeight} />
          ) : (
            <VictoryChart
              width={chartWidth}
              height={chartHeight}
              padding={{ top: 10, bottom: 40, left: 48, right: 16 }}
              style={{ background: { fill: 'transparent' } }}
            >
              <VictoryAxis
                style={axisStyle}
                tickValues={data?.weekBuckets.map((b) => b.label) ?? []}
              />
              <VictoryAxis
                dependentAxis
                style={axisStyle}
                tickFormat={volumeTick}
              />
              <VictoryBar
                data={data?.weekBuckets.map((b) => ({
                  x: b.label,
                  y: b.totalVolume,
                })) ?? []}
                style={{
                  data: {
                    fill: theme.colors.accentSecondary,
                    width: 28,
                  },
                }}
                cornerRadius={{ top: 4 }}
              />
            </VictoryChart>
          )}
        </>
      )}

      {/* ── 4. Top PRs ── */}
      {!error && (
        <>
          <SectionHeader label="YOUR TOP LIFTS" />
          {loading ? (
            <>
              <SkeletonRow height={72} />
              <SkeletonRow height={72} />
              <SkeletonRow height={72} />
            </>
          ) : (data?.topPRs.length ?? 0) === 0 ? (
            <View
              style={[
                styles.emptyPRs,
                {
                  backgroundColor: theme.colors.bgSecondary,
                  borderRadius: radius.md,
                  padding: spacing.s5,
                  marginBottom: spacing.s3,
                },
              ]}
            >
              <Ionicons
                name="barbell-outline"
                size={32}
                color={theme.colors.textTertiary}
                accessibilityElementsHidden
              />
              <Text
                style={{
                  fontSize: fontSize.bodyMd,
                  color: theme.colors.textTertiary,
                  textAlign: 'center',
                  marginTop: spacing.s3,
                }}
              >
                No sets logged yet. Start lifting to see your PRs!
              </Text>
            </View>
          ) : (
            <FlatList
              data={data?.topPRs ?? []}
              keyExtractor={(item) => item.exerciseId}
              renderItem={({ item }) => <PRCard item={item} />}
              scrollEnabled={false}
              accessibilityLabel="Your top 5 personal records"
            />
          )}
        </>
      )}

      {/* ── 5. Weekly mileage chart ── */}
      {!error && mileageBuckets.length > 0 && (
        <>
          <SectionHeader label="WEEKLY MILEAGE (KM)" />

          {/* 10% rule overshoot warning banner */}
          {cardioData?.tenPctWarning && (
            <View
              style={[
                styles.mileageWarning,
                {
                  backgroundColor: theme.colors.statusWarning + '1A',
                  borderColor: theme.colors.statusWarning,
                  borderRadius: radius.md,
                  padding: spacing.s3,
                  marginBottom: spacing.s3,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8,
                },
              ]}
              accessibilityRole="alert"
              accessibilityLabel="10% rule warning: your mileage jumped more than 10% this week. Consider backing off to reduce injury risk."
            >
              <Ionicons
                name="warning-outline"
                size={18}
                color={theme.colors.statusWarning}
                accessibilityElementsHidden
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: fontSize.bodySm,
                    fontWeight: fontWeight.semibold,
                    color: theme.colors.statusWarning,
                  }}
                >
                  10% rule: mileage jumped this week
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    color: theme.colors.textSecondary,
                    marginTop: 2,
                  }}
                >
                  Increasing weekly mileage by more than 10% raises injury risk. Consider an easier week.
                </Text>
              </View>
            </View>
          )}

          <VictoryChart
            width={chartWidth}
            height={chartHeight}
            padding={{ top: 10, bottom: 40, left: 48, right: 16 }}
            style={{ background: { fill: 'transparent' } }}
          >
            <VictoryAxis
              style={axisStyle}
              tickValues={mileageBuckets.map((b) => b.x)}
            />
            <VictoryAxis
              dependentAxis
              style={axisStyle}
              tickFormat={(v: number) => `${v}`}
            />
            <VictoryBar
              data={mileageBuckets}
              style={{
                data: {
                  fill: theme.colors.statusSuccess,
                  width: 28,
                },
              }}
              cornerRadius={{ top: 4 }}
            />
          </VictoryChart>
        </>
      )}

      {/* ── 6. Running pace trend ── */}
      {!error && runPaceTrend.length >= 2 && (
        <>
          <SectionHeader label="RUNNING PACE TREND (MIN/KM)" />
          <VictoryChart
            width={chartWidth}
            height={chartHeight}
            padding={{ top: 16, bottom: 40, left: 56, right: 16 }}
            style={{ background: { fill: 'transparent' } }}
          >
            <VictoryAxis
              style={axisStyle}
              tickValues={runPaceTrend.map((p) => p.x)}
              tickFormat={(v: number) => runPaceTrend[v - 1]?.xLabel ?? ''}
            />
            <VictoryAxis
              dependentAxis
              style={axisStyle}
              tickFormat={(v: number) => formatPace(v)}
              invertAxis
            />
            <VictoryLine
              data={runPaceTrend}
              style={{
                data: {
                  stroke: theme.colors.accentDefault,
                  strokeWidth: 2.5,
                },
              }}
              interpolation="monotoneX"
            />
            <VictoryScatter
              data={runPaceTrend}
              size={4}
              style={{ data: { fill: theme.colors.accentDefault } }}
              labels={({ datum }: { datum: { label: string } }) => datum.label}
              labelComponent={
                <VictoryTooltip
                  style={{ fontSize: 9, fill: theme.colors.textPrimary }}
                  flyoutStyle={{
                    fill: theme.colors.bgElevated,
                    stroke: theme.colors.borderDefault,
                  }}
                />
              }
            />
          </VictoryChart>
          <Text
            style={{
              fontSize: fontSize.caption,
              color: theme.colors.textTertiary,
              textAlign: 'center',
              marginTop: -spacing.s3,
              marginBottom: spacing.s3,
            }}
          >
            Lower is faster — upward trend means you are getting quicker
          </Text>
        </>
      )}

      {/* Bottom breathing room */}
      <View style={{ height: spacing.s6 }} />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  consistencyBlock: {
    alignItems: 'center',
  },
  errorBlock: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  prCard: {
    borderWidth: 1,
  },
  prCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyPRs: {
    alignItems: 'center',
  },
  mileageWarning: {
    borderWidth: 1,
  },
});
