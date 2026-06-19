/**
 * Home tab — greeting, streak badge, AI plan card, recent PRs,
 * quick stats, today's workout card, recent history.
 *
 * Implements TICKET-018, P0-002, P0-005.
 * E-001 update: all hardcoded hex values replaced with semantic tokens via useTheme().
 *
 * PR detection is client-side only (30-day window, sets already in local state).
 * A dedicated GET /prs endpoint would be more accurate but is not yet built.
 * This is an intentional approximation — track as TICKET-073 if/when accuracy matters.
 *
 * TICKET-027: PowerSync sync indicator shown in the greeting header.
 * Initial sync is triggered automatically by PowerSyncProvider in _layout.tsx
 * once the JWT is available — no extra call needed here.
 *
 * PL-3: Rest day button — POST /workouts/rest-day, disables same day.
 * P1-006: Streak banner — gradient bg, "day streak", tappable → detail sheet.
 * P2-003: PR badge spring animation via Reanimated ZoomIn.
 *
 * TICKET-084: Home is now the logging hub. WorkoutLoggerHost is always-mounted.
 *   Route params: ?startWorkout=1, ?routineId=<id>&routineName=<name>,
 *   ?logExercise=<id>&logExerciseName=<name>
 * TICKET-085: "PRs this week" replaces weekly volume everywhere on Home.
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { ZoomIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/hooks/useAuth';
import { useWorkout } from '../../src/hooks/useWorkout';
import { useWorkoutHistory } from '../../src/hooks/useWorkoutHistory';
import { useLocalStreak } from '../../src/hooks/useStreak';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { formatWeight } from '../../src/constants/units';
import { defaultUnitForLocale } from '../../src/constants/locale';
import { formatWorkoutLabel, toDateKey } from '../../src/utils/dateHelpers';
import { LiftSet, PlanWithStructure } from '../../src/types/api';
import { useTheme } from '../../src/theme/ThemeContext';
// Module-level StyleSheet.create below references `spacing` directly (component
// scope gets it via useTheme()), so the token must be imported here too —
// otherwise the styles object throws ReferenceError at import and the Home
// route renders blank.
import { spacing } from '../../src/theme/tokens';
import { PFCard, PFButton, ScreenLayout } from '../../src/components/ui';
import { getPlans, getPlan } from '../../src/api/plans';
import { getPercentile } from '../../src/api/percentile';
import { logRestDay, undoRestDay } from '../../src/api/workouts';
import { isLocalFirst } from '../../src/data/backup/tierPolicy';
import { ensureExerciseCatalogCached } from '../../src/data/exerciseNames';
import { getRoutineFolders, RoutineFolder } from '../../src/data/routineHistory';
import { localDb, genId } from '../../src/db/localDb';
import { BrandLogo } from '../../src/components/BrandLogo'; // TICKET-063
import { WorkoutLoggerHost, WorkoutLoggerRef } from '../../src/components/WorkoutLoggerHost';
import { RoutineStrip } from '../../src/components/RoutineStrip';
// TICKET-098: bundled beginner programs open in the stepper without a server call.
import { getExercises } from '../../src/api/exercises';
import {
  buildBundledSession,
  buildLibraryNameIndex,
  LibraryNameIndex,
} from '../../src/data/beginnerTemplates';
// TICKET-095: welcome tour auto-start + anchor.
import { useTour, useTourAnchor } from '../../src/components/tour/WelcomeTour';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * True when `name` looks like a machine-generated handle/id rather than a real
 * display name, e.g. the legacy random handles ("64t9tvkymn") or a raw UUID. We
 * only reject the clearly-synthetic cases so ordinary names (including short or
 * lowercase ones) are always kept:
 *   - it equals the user id (a UUID leaked into the name slot), OR
 *   - it's a single all-lowercase alphanumeric token, ≥8 chars, with no spaces,
 *     that contains a digit OR has no vowels (random strings rarely read as a
 *     pronounceable word). A normal lowercase first name like "sam" or "arvin"
 *     has vowels and no digits, so it passes.
 */
function looksLikeRandomToken(name: string, userId?: string | null): boolean {
  const n = name.trim();
  if (n.length === 0) return true;
  if (userId && n === userId) return true;
  // Raw UUID anywhere in the name slot.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n)) return true;
  // Single lowercase alphanumeric token (no spaces), reasonably long.
  if (/^[a-z0-9]{8,}$/.test(n)) {
    const hasDigit = /[0-9]/.test(n);
    const hasVowel = /[aeiou]/.test(n);
    if (hasDigit || !hasVowel) return true;
  }
  return false;
}

/**
 * Pick the name to greet with. Prefers a real `display_name`, but never shows a
 * raw id/UUID/random token — falling back to the email local-part, then a
 * friendly "there". (The server no longer generates random handles, but older
 * accounts may still carry one, so this stays defensive.)
 */
function resolveGreetingName(
  displayName: string | null | undefined,
  email: string | null | undefined,
  userId?: string | null
): string {
  const name = (displayName ?? '').trim();
  if (name.length > 0 && !looksLikeRandomToken(name, userId)) return name;
  const localPart = (email ?? '').split('@')[0]?.trim() ?? '';
  if (localPart.length > 0) return localPart;
  return 'there';
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return `Good ${period}, ${name}`;
}

function getFullDateLabel(): string {
  const now = new Date();
  const days = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday',
  ];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, onViewAll }: { label: string; onViewAll?: () => void }): React.ReactElement {
  const { theme, fontSize, fontWeight } = useTheme();
  if (onViewAll) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }}>
        <Text style={{
          fontSize: fontSize.micro,
          fontWeight: fontWeight.semibold,
          color: theme.colors.textTertiary,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}>
          {label}
        </Text>
        <TouchableOpacity onPress={onViewAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="link" accessibilityLabel={`View all ${label}`}>
          <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.accentDefault }}>View all →</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <Text style={{
      fontSize: fontSize.micro,
      fontWeight: fontWeight.semibold,
      color: theme.colors.textTertiary,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 12,
      marginBottom: 6,
    }}>
      {label}
    </Text>
  );
}

interface StreakBadgeProps {
  streak: number;
  onPress: () => void;
}

function StreakBadge({ streak, onPress }: StreakBadgeProps): React.ReactElement {
  const { theme, fontSize, fontWeight, radius } = useTheme();
  const gradientColors = [
    theme.colors.accentSecondary + '33',
    theme.colors.accentDefault + '33',
  ] as [string, string];

  if (streak === 0) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="View streak details"
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.streakBadge, { borderRadius: radius.md }]}
        >
          <Text style={styles.streakEmoji}>🔥</Text>
          <View>
            <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium, color: theme.colors.textSecondary }}>
              No worries — start a new streak today. 🌱
            </Text>
            <Text style={{ fontSize: fontSize.caption, color: theme.colors.textTertiary, marginTop: 2 }}>
              Every workout is day one of something.
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View streak details"
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.streakBadge, { borderRadius: radius.md }]}
      >
        <Text style={styles.streakEmoji}>🔥</Text>
        <Text style={{ fontSize: fontSize.heading2, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}>
          {/* E-003: was 24/'800'; heading2=24, bold='700' (no extraBold token) */}
          {streak}
        </Text>
        <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium, color: theme.colors.textSecondary }}>
          {' '}day streak
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// TICKET-085: TodayCard now shows prsThisWeek instead of volume
interface TodayCardProps {
  setCount: number;
  prsThisWeek: number;
  isLoading: boolean;
  onLogPress: () => void;
}

function TodayCard({
  setCount,
  prsThisWeek,
  isLoading,
  onLogPress,
}: TodayCardProps): React.ReactElement {
  const { theme, fontSize, fontWeight, radius } = useTheme();

  return (
    <View style={[styles.todayCard, {
      backgroundColor: theme.colors.bgSecondary,
      borderColor: theme.colors.borderDefault,
      borderRadius: radius.lg,
    }]}>
      {isLoading ? (
        <ActivityIndicator color={theme.colors.textSecondary} />
      ) : setCount === 0 ? (
        <>
          <Text style={{ fontSize: fontSize.bodyMd, color: theme.colors.textTertiary, textAlign: 'center' }}>
            No sets logged yet — tap to start
          </Text>
          <TouchableOpacity
            style={[styles.ctaButton, {
              backgroundColor: theme.colors.accentDefault,
              borderRadius: radius.md,
            }]}
            onPress={onLogPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Log workout"
          >
            <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>
              Log a set →
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.todayStats}>
            <View style={styles.todayStat}>
              <Text style={{ fontSize: fontSize.heading1, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                {setCount}
              </Text>
              <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary }}>
                sets logged
              </Text>
            </View>
            <View style={[styles.todayDivider, { backgroundColor: theme.colors.borderDefault }]} />
            <View style={styles.todayStat}>
              <Text style={{ fontSize: fontSize.heading1, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                {prsThisWeek}
              </Text>
              <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary }}>
                PRs this week
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.ctaButton, {
              backgroundColor: theme.colors.accentDefault,
              borderRadius: radius.md,
            }]}
            onPress={onLogPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Log a set"
          >
            <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>
              Log a set →
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// P0-005 sub-components
// ---------------------------------------------------------------------------

/** Small inline metric chip used inside the AI Plan card. */
function MetricChip({ label, value }: { label: string; value: string | number }): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing: sp, radius } = useTheme();
  return (
    <View style={{
      backgroundColor: theme.colors.bgPrimary,
      borderRadius: radius.sm,
      paddingHorizontal: sp.s2,
      paddingVertical: sp.s1,
      alignItems: 'center',
    }}>
      <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: theme.colors.textPrimary }}>
        {value}
      </Text>
      <Text style={{ fontSize: fontSize.caption, color: theme.colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}

/** Card for a single Quick Stats metric. */
function StatCard({ label, value }: { label: string; value: string }): React.ReactElement {
  const { theme, fontSize, fontWeight } = useTheme();
  return (
    <PFCard variant="elevated" padding="sm" style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: fontSize.heading2, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontSize: fontSize.caption, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 2 }}>
        {label}
      </Text>
    </PFCard>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const { user } = useAuth();
  const { sets: todaySets, isLoading: todayLoadingRaw } = useWorkout();
  const { history, streak: historyStreak, isLoading: historyLoadingRaw, refetch } = useWorkoutHistory();
  const { theme, fontSize, fontWeight, radius, spacing: sp } = useTheme();
  const loggerRef = useRef<WorkoutLoggerRef>(null);

  // Fall back to the locale default (US → lbs, else kg) only when the user has
  // no explicit saved preference; an explicit choice always wins.
  const unitPref = user?.unit_pref ?? defaultUnitForLocale();

  // ── Workstream B (SPEC-094A): hang-proof loading ──────────────────────────
  // Free/local-first users have no PowerSync/server to wait on. If a local read
  // ever stalls, the section loaders below must still resolve to data OR an
  // empty/error state — never an infinite ActivityIndicator. We arm a one-shot
  // deadline (~1s) after which any still-pending loader is treated as resolved,
  // so the empty state renders instead of a forever-spinner.
  const LOAD_DEADLINE_MS = 1000;
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoadTimedOut(true), LOAD_DEADLINE_MS);
    return () => clearTimeout(t);
  }, []);

  // Best-effort, throttled backfill of the on-device exercise-name cache from
  // the global catalogue so sets logged before the cache existed resolve to real
  // names (not UUIDs) in Recent Activity / Recent PRs. Non-blocking; offline = no-op.
  useEffect(() => {
    void ensureExerciseCatalogCached();
  }, []);
  const todayLoading = todayLoadingRaw && !loadTimedOut;
  const historyLoading = historyLoadingRaw && !loadTimedOut;

  // STREAK reads from on-device data for local-first users (never blocks on the
  // server); Pro keeps the server-derived value from useWorkoutHistory.
  const { streak } = useLocalStreak(historyStreak, historyLoadingRaw);

  // Today's stats
  const todayKey = toDateKey(new Date());

  // TICKET-085: prsThisWeek — count of is_pr lift sets in the last 7 days
  const prsThisWeek = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    const cutoffKey = toDateKey(cutoff);
    let count = 0;
    for (const entry of history) {
      if (entry.workout.day_key < cutoffKey) continue;
      for (const s of entry.sets) {
        if (s.kind === 'lift' && (s as LiftSet & { is_pr?: boolean }).is_pr) {
          count++;
        }
      }
    }
    return count;
  }, [history]);

  // Last 7 calendar days (only entries with workouts)
  const recentDays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffKey = toDateKey(cutoff);
    return history.filter((e) => e.workout.day_key >= cutoffKey);
  }, [history]);

  // ── History folders (by routine), shown at the bottom of Home ──────────────
  // One folder per routine the user has actually trained (Push / Pull / Legs…),
  // grouped by the routine_name stamped on each workout. Local-first read; never
  // blocks the page. Reloads when history changes (a finished session updates it).
  const [routineFolders, setRoutineFolders] = useState<RoutineFolder[]>([]);
  useEffect(() => {
    let cancelled = false;
    getRoutineFolders(user)
      .then((f) => { if (!cancelled) setRoutineFolders(f); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, history]);

  // ── P0-005: AI Plan state ─────────────────────────────────────────────────
  const [plan, setPlan] = useState<PlanWithStructure | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [reasonExpanded, setReasonExpanded] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!user?.is_paid) return;
    setPlanLoading(true);
    try {
      const plans = await getPlans();
      if (plans.length > 0) {
        const detail = await getPlan(plans[0].id);
        setPlan(detail);
      }
    } catch (err) {
      console.warn('[PF] index/loadPlan:', err instanceof Error ? err.message : String(err));
    } finally {
      setPlanLoading(false);
    }
  }, [user?.is_paid]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // ── P0-005: Percentile state ──────────────────────────────────────────────
  const [bestPercentile, setBestPercentile] = useState<number | null>(null);

  useEffect(() => {
    // Percentiles are a Pro/server feature; free (local-first) users compute
    // them on-device (strengthModelV3) and must NOT block Home startup on a
    // REST round-trip (which also 500s against a drifted server). Skip it.
    if (!user?.is_paid) return;
    getPercentile()
      .then((resp) => {
        const values = resp.rankings
          .map((r) => r.percentile)
          .filter((v): v is number => v !== null);
        if (values.length > 0) setBestPercentile(Math.max(...values));
      })
      .catch((err: unknown) => {
        console.warn('[PF] index/getPercentile:', err instanceof Error ? err.message : String(err));
      });
  }, [user?.is_paid]);

  // ── P0-005: Computed dashboard stats ─────────────────────────────────────

  /** Sessions this calendar month: count of distinct workout days. */
  const sessionsThisMonth = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return history.filter((e) => e.workout.day_key.startsWith(monthPrefix)).length;
  }, [history]);

  /** PR chips: lift sets flagged is_pr=true with exercise name + weight, across all history */
  const prChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: Array<{ id: string; exercise_name: string; weight_kg: number }> = [];
    for (const entry of history) {
      // Build a map from exercise_id → display name using unique first-occurrence
      // order (matching how entry.liftNames is constructed).
      const exerciseIdToName = new Map<string, string>();
      let nameIdx = 0;
      for (const s of entry.sets) {
        if (s.kind === 'lift' && !exerciseIdToName.has((s as LiftSet).exercise_id)) {
          exerciseIdToName.set(
            (s as LiftSet).exercise_id,
            entry.liftNames[nameIdx] ?? (s as LiftSet).exercise_id
          );
          nameIdx++;
        }
      }
      for (const s of entry.sets) {
        if (s.kind === 'lift' && (s as LiftSet & { is_pr?: boolean }).is_pr) {
          const ls = s as LiftSet & { is_pr: boolean };
          if (!seen.has(ls.exercise_id)) {
            seen.add(ls.exercise_id);
            const name = exerciseIdToName.get(ls.exercise_id) ?? ls.exercise_id;
            chips.push({ id: ls.id, exercise_name: name, weight_kg: ls.weight_kg });
          }
        }
      }
    }
    return chips.slice(0, 10);
  }, [history]);

  // ── Computed plan metrics ─────────────────────────────────────────────────
  const planExercises = plan?.structure?.session?.exercises ?? [];
  const planTotalSets = planExercises.reduce((acc, ex) => acc + (ex.sets ?? 0), 0);
  const planReasoning = plan?.structure?.reasoning ?? null;

  // ── PL-3: Rest day state ─────────────────────────────────────────────────
  const restDayLoggedToday = useMemo(
    () => history.some(
      (e) => e.workout.day_key === todayKey && e.workout.session_type === 'rest_day'
    ),
    [history, todayKey]
  );
  const [restDayLoading, setRestDayLoading] = useState(false);

  const handleLogRestDay = useCallback(async () => {
    if (restDayLoggedToday || restDayLoading) return;
    setRestDayLoading(true);
    try {
      if (isLocalFirst(user)) {
        // Free / local-first: write directly to localDb — no REST call.
        const now = new Date().toISOString();
        await localDb.execute(
          `INSERT OR IGNORE INTO workouts (id, user_id, day_key, session_type, created_at, updated_at)
           VALUES (?, ?, ?, 'rest_day', ?, ?)`,
          [genId(), user?.id ?? 'local', todayKey, now, now],
          { tables: ['workouts'] }
        );
      } else {
        await logRestDay();
      }
      await refetch();
    } catch {
      Alert.alert('Could not log rest day', 'Please try again.');
    } finally {
      setRestDayLoading(false);
    }
  }, [restDayLoggedToday, restDayLoading, refetch, user, todayKey]);

  const handleUndoRestDay = useCallback(async () => {
    if (!restDayLoggedToday || restDayLoading) return;
    setRestDayLoading(true);
    try {
      if (isLocalFirst(user)) {
        // Free / local-first: delete from localDb — no REST call.
        await localDb.execute(
          `DELETE FROM workouts WHERE day_key = ? AND session_type = 'rest_day' AND (user_id = ? OR user_id = 'local')`,
          [todayKey, user?.id ?? 'local'],
          { tables: ['workouts'] }
        );
      } else {
        await undoRestDay();
      }
      await refetch();
    } catch {
      Alert.alert('Could not undo rest day', 'Please try again.');
    } finally {
      setRestDayLoading(false);
    }
  }, [restDayLoggedToday, restDayLoading, refetch, user, todayKey]);

  // ── P1-006: Streak detail sheet ──────────────────────────────────────────
  const [streakDetailVisible, setStreakDetailVisible] = useState(false);

  const last7DayDots = useMemo(() => {
    const dots: Array<{ key: string; filled: boolean }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      const filled = history.some((e) => e.workout.day_key === key);
      dots.push({ key, filled });
    }
    return dots;
  }, [history]);

  const longestStreak = useMemo(() => {
    if (history.length === 0) return 0;
    const sortedKeys = history
      .map((e) => e.workout.day_key)
      .sort();
    let best = 1;
    let current = 1;
    for (let i = 1; i < sortedKeys.length; i++) {
      const prev = new Date(sortedKeys[i - 1]);
      const curr = new Date(sortedKeys[i]);
      const diffDays = Math.round(
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === 1) {
        current += 1;
        if (current > best) best = current;
      } else {
        current = 1;
      }
    }
    return best;
  }, [history]);

  // ── Reduce motion ─────────────────────────────────────────────────────────
  const reduceMotion = useReducedMotion();

  // ── Refresh ───────────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([refetch(), loadPlan()]);
    setRefreshing(false);
  };

  // ── TICKET-084: Route params → open logger ────────────────────────────────
  const params = useLocalSearchParams<{
    startWorkout?: string;
    routineId?: string;
    routineName?: string;
    logExercise?: string;
    logExerciseName?: string;
    bundledProgram?: string;
    bundledDay?: string;
  }>();

  // Track which param combos we've already handled to avoid re-triggering on re-renders
  const handledParamRef = useRef<string | null>(null);

  // TICKET-095: welcome tour — auto-start once after onboarding; anchor the
  // "Start workout" CTA so the tour can spotlight it.
  const { maybeAutoStart } = useTour();
  const startWorkoutAnchor = useTourAnchor('home-start-workout');
  useEffect(() => {
    maybeAutoStart();
  }, [maybeAutoStart]);

  useEffect(() => {
    const {
      startWorkout,
      routineId,
      routineName,
      logExercise,
      logExerciseName,
      bundledProgram,
      bundledDay,
    } = params;

    if (routineId && routineId !== '' && handledParamRef.current !== `routine:${routineId}`) {
      handledParamRef.current = `routine:${routineId}`;
      loggerRef.current?.startRoutine(routineId, routineName ?? '');
      router.setParams({ routineId: '', routineName: '' });
      return;
    }

    // TICKET-098: start a bundled beginner-program day in the stepper. The
    // library fetch is best-effort — offline we fall back to a name-only session
    // (the stepper accepts exerciseId ''), so this always opens without a server.
    if (
      bundledProgram &&
      bundledProgram !== '' &&
      handledParamRef.current !== `bundled:${bundledProgram}:${bundledDay ?? '0'}`
    ) {
      handledParamRef.current = `bundled:${bundledProgram}:${bundledDay ?? '0'}`;
      const dayIdx = Number.parseInt(bundledDay ?? '0', 10) || 0;
      const programId = bundledProgram;
      (async () => {
        let libIndex: LibraryNameIndex | undefined;
        try {
          libIndex = buildLibraryNameIndex(await getExercises());
        } catch {
          libIndex = undefined; // offline / API down -> name-only session
        }
        const session = buildBundledSession(programId, dayIdx, libIndex);
        if (session) loggerRef.current?.startSession(session);
      })();
      router.setParams({ bundledProgram: '', bundledDay: '' });
      return;
    }

    if (logExercise && logExercise !== '' && handledParamRef.current !== `exercise:${logExercise}`) {
      handledParamRef.current = `exercise:${logExercise}`;
      loggerRef.current?.startWithExercise(logExercise, logExerciseName ?? '');
      router.setParams({ logExercise: '', logExerciseName: '' });
      return;
    }

    if (startWorkout === '1' && handledParamRef.current !== 'startWorkout') {
      handledParamRef.current = 'startWorkout';
      loggerRef.current?.startWorkout();
      router.setParams({ startWorkout: '' });
      return;
    }
  }, [params, router]);

  // ── TICKET-084: Forgot something prompt ──────────────────────────────────
  const [forgotPromptVisible, setForgotPromptVisible] = useState(false);
  const [todayLiftsVisible, setTodayLiftsVisible] = useState(false);

  const handleForgotSomething = useCallback(() => {
    setForgotPromptVisible(false);
    loggerRef.current?.reopenToday();
  }, []);

  const handleSeeTodayLifts = useCallback(() => {
    setForgotPromptVisible(false);
    setTodayLiftsVisible(true);
  }, []);

  // Today's sets grouped for display
  const todaySetsByExercise = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const s of todaySets) {
      const existing = map.get(s.exercise_id);
      if (existing) {
        existing.count++;
      } else {
        map.set(s.exercise_id, { name: s.exercise_id, count: 1 });
      }
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [todaySets]);

  const hasTodaySets = todaySets.length > 0;

  return (
    <ScreenLayout horizontalPadding={false}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingHorizontal: sp.s5, paddingTop: sp.s6, paddingBottom: sp.s8 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.textTertiary}
        />
      }
    >
      {/* ── Streak Detail Sheet ── */}
      <Modal
        visible={streakDetailVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setStreakDetailVisible(false)}
      >
        <View style={[styles.modalOverlay]}>
          <View style={[styles.modalSheet, {
            backgroundColor: theme.colors.bgSecondary,
            borderRadius: radius.lg,
          }]}>
            <Text style={{ fontSize: fontSize.heading2, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, marginBottom: sp.s4 }}>
              Streak Details
            </Text>
            <View style={{ flexDirection: 'row', gap: sp.s4, marginBottom: sp.s4 }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: fontSize.heading1, fontWeight: fontWeight.bold, color: theme.colors.accentDefault, fontVariant: ['tabular-nums'] }}>
                  {streak}
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: theme.colors.textSecondary }}>Current streak</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: fontSize.heading1, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                  {longestStreak}
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: theme.colors.textSecondary }}>Longest streak</Text>
              </View>
            </View>
            <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: sp.s2 }}>
              LAST 7 DAYS
            </Text>
            <View style={{ flexDirection: 'row', gap: sp.s2, marginBottom: sp.s5 }}>
              {last7DayDots.map((dot) => (
                <View
                  key={dot.key}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: dot.filled
                      ? theme.colors.accentDefault
                      : theme.colors.bgPrimary,
                    borderWidth: 1,
                    borderColor: dot.filled
                      ? theme.colors.accentDefault
                      : theme.colors.borderDefault,
                  }}
                />
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setStreakDetailVisible(false)}
              style={[styles.ctaButton, {
                backgroundColor: theme.colors.accentDefault,
                borderRadius: radius.md,
              }]}
              accessibilityRole="button"
              accessibilityLabel="Close streak details"
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── TICKET-084: "Forgot something?" prompt modal ── */}
      <Modal
        visible={forgotPromptVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setForgotPromptVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.bgSecondary, borderRadius: radius.lg }]}>
            <Text style={{ fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, marginBottom: sp.s2 }}>
              What do you need?
            </Text>
            <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary, marginBottom: sp.s4 }}>
              Your sets are already saved.
            </Text>
            <TouchableOpacity
              style={[{ backgroundColor: theme.colors.accentDefault, borderRadius: radius.md, paddingVertical: sp.s4, alignItems: 'center', marginBottom: sp.s2 }]}
              onPress={handleForgotSomething}
              accessibilityRole="button"
              accessibilityLabel="Reopen stepper to add more sets"
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>
                I forgot something
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[{ backgroundColor: theme.colors.bgElevated, borderRadius: radius.md, paddingVertical: sp.s4, alignItems: 'center', marginBottom: sp.s2, borderWidth: 1, borderColor: theme.colors.borderDefault }]}
              onPress={handleSeeTodayLifts}
              accessibilityRole="button"
              accessibilityLabel="See all my lifts today"
            >
              <Text style={{ color: theme.colors.textPrimary, fontSize: fontSize.bodyMd, fontWeight: fontWeight.medium }}>
                See all my lifts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ paddingVertical: sp.s3, alignItems: 'center' }}
              onPress={() => setForgotPromptVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── TICKET-084: Today's lifts list modal ── */}
      <Modal
        visible={todayLiftsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setTodayLiftsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.colors.bgSecondary, borderRadius: radius.lg, maxHeight: '80%' }]}>
            <Text style={{ fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, marginBottom: sp.s4 }}>
              Today's lifts
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {todaySetsByExercise.length === 0 ? (
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, textAlign: 'center' }}>
                  No sets logged yet today.
                </Text>
              ) : (
                todaySetsByExercise.map((item) => (
                  <View
                    key={item.id}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: sp.s2, borderBottomWidth: 1, borderBottomColor: theme.colors.borderDefault }}
                  >
                    <Text style={{ color: theme.colors.textPrimary, fontSize: fontSize.bodyMd, flex: 1 }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }}>
                      {item.count} set{item.count !== 1 ? 's' : ''}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[{ backgroundColor: theme.colors.accentDefault, borderRadius: radius.md, paddingVertical: sp.s4, alignItems: 'center', marginTop: sp.s4 }]}
              onPress={() => setTodayLiftsVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── TICKET-063: Brand logo bar (horizontal, above greeting) ── */}
      <View style={styles.logoBannerRow}>
        <BrandLogo height={36} dark horizontal />
      </View>

      {/* ── A. Greeting header ── */}
      <View style={[styles.headerSection, { marginBottom: sp.s5 }]}>
        <View style={styles.headerRow}>
          <Text style={{ fontSize: fontSize.heading2, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, letterSpacing: -0.3 }}>
          {/* E-003: was fontWeight '700' */}
            {getGreeting(resolveGreetingName(user?.display_name, user?.email, user?.id))}
          </Text>
          <SyncStatusIndicator />
        </View>
        <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary }}>
          {getFullDateLabel()}
        </Text>
      </View>

      {/* ── TICKET-084: Start workout CTA ── */}
      {!restDayLoggedToday && (
        <TouchableOpacity
          ref={startWorkoutAnchor.ref}
          style={[styles.startWorkoutBtn, { backgroundColor: theme.colors.accentDefault, borderRadius: radius.md }]}
          onPress={() => loggerRef.current?.startWorkout()}
          accessibilityRole="button"
          accessibilityLabel="Start workout"
          activeOpacity={0.85}
        >
          <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold }}>
            Start workout
          </Text>
        </TouchableOpacity>
      )}

      {/* ── TICKET-084: Quick-start routines strip ── */}
      {!restDayLoggedToday && (
        <RoutineStrip
          hasLoggedSets={todaySets.length > 0}
          onStartRoutine={(session) => loggerRef.current?.startSession(session)}
          onStartTemplate={(session) => loggerRef.current?.startSession(session)}
        />
      )}

      {/* ── TICKET-084: "Forgot to log something?" ── */}
      {hasTodaySets && !restDayLoggedToday && (
        <TouchableOpacity
          style={[styles.forgotBtn, { borderColor: theme.colors.borderDefault, borderRadius: radius.md }]}
          onPress={() => setForgotPromptVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Forgot to log something?"
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: fontSize.bodySm }}>
            Forgot to log something?
          </Text>
        </TouchableOpacity>
      )}

      {/* ── B. Streak badge ── */}
      <SectionHeader label="STREAK" />
      {historyLoading ? (
        <View style={[styles.streakBadge, { backgroundColor: theme.colors.accentSecondary + '33' }]}>
          <ActivityIndicator color={theme.colors.textSecondary} />
        </View>
      ) : (
        <StreakBadge streak={streak} onPress={() => setStreakDetailVisible(true)} />
      )}

      {/* ── C. Today's AI Plan card (paid tier only) ── */}
      {user?.is_paid && (planLoading || plan) ? (
        <>
          <SectionHeader label="TODAY'S PLAN" />
          {planLoading ? (
            <PFCard variant="elevated">
              <ActivityIndicator color={theme.colors.textSecondary} />
            </PFCard>
          ) : plan ? (
            <PFCard variant="elevated">
              <Text style={{ fontSize: fontSize.bodyLg, fontWeight: fontWeight.semibold, color: theme.colors.textPrimary }}>
                {plan.name ?? "Today's Plan"}
              </Text>
              <View style={{ flexDirection: 'row', gap: sp.s3, marginTop: sp.s2 }}>
                <MetricChip label="Exercises" value={planExercises.length} />
                <MetricChip label="Sets" value={planTotalSets} />
              </View>
              {planReasoning ? (
                <>
                  <TouchableOpacity
                    onPress={() => setReasonExpanded(!reasonExpanded)}
                    style={{ marginTop: sp.s3 }}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle workout reasoning"
                  >
                    <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.accentDefault }}>
                      Why this workout? {reasonExpanded ? '▾' : '›'}
                    </Text>
                  </TouchableOpacity>
                  {reasonExpanded && (
                    <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary, marginTop: sp.s2 }}>
                      {planReasoning}
                    </Text>
                  )}
                </>
              ) : null}
              <PFButton
                variant="primary"
                label="Start Workout"
                onPress={() => { loggerRef.current?.startWorkout(); }}
                style={{ marginTop: sp.s3 }}
              />
            </PFCard>
          ) : null}
        </>
      ) : null}

      {/* ── D. Recent PRs horizontal scroll ── */}
      {!historyLoading && prChips.length > 0 ? (
        <>
          <SectionHeader label="RECENT PRs" onViewAll={() => router.push('/workout-history')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: sp.s2 }}>
            {prChips.map((pr) => (
              <View
                key={pr.id}
                style={{
                  backgroundColor: theme.colors.statusSuccess + '26',
                  borderRadius: radius.sm,
                  paddingHorizontal: sp.s2,
                  paddingVertical: sp.s1,
                  marginRight: sp.s2,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.medium, color: theme.colors.statusSuccess }}>
                  {pr.exercise_name}
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: theme.colors.statusSuccess }}>
                  {formatWeight(pr.weight_kg, unitPref, 1)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* ── E. Quick Stats row — TICKET-085: "PRs this week" replaces "Weekly Volume" ── */}
      {!historyLoading ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp.s2 }}>
            <SectionHeader label="QUICK STATS" />
            <Pressable
              onPress={() => router.push('/progress')}
              accessibilityRole="link"
              accessibilityLabel="View full progress and analytics"
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: pressed ? 0.6 : 1,
                minHeight: 48,
                justifyContent: 'center',
                paddingHorizontal: 4,
              })}
            >
              <Text style={{ fontSize: fontSize.caption, color: theme.colors.accentDefault, fontWeight: fontWeight.medium }}>
                View Progress
              </Text>
              <Text style={{ fontSize: fontSize.caption, color: theme.colors.accentDefault }}>›</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: sp.s3, marginBottom: sp.s2 }}>
            <StatCard label="PRs this week" value={String(prsThisWeek)} />
            <StatCard label="Sessions" value={`${sessionsThisMonth}`} />
            <StatCard label="Best Rank" value={bestPercentile !== null ? `${bestPercentile}th` : '—'} />
          </View>
        </>
      ) : null}

      {/* ── F. Today's workout card ── */}
      <SectionHeader label="TODAY" />
      <TodayCard
        setCount={todaySets.length}
        prsThisWeek={prsThisWeek}
        isLoading={todayLoading}
        onLogPress={() => loggerRef.current?.startWorkout()}
      />
      {/* PL-3: Rest day button — TICKET-054: hydrated from history; undo affordance added */}
      <TouchableOpacity
        onPress={restDayLoggedToday ? undefined : handleLogRestDay}
        disabled={restDayLoading}
        accessibilityRole="button"
        accessibilityLabel={restDayLoggedToday ? 'Rest day logged' : 'Log rest day'}
        style={[
          styles.restDayButton,
          {
            backgroundColor: restDayLoggedToday ? theme.colors.bgElevated : theme.colors.bgSecondary,
            borderColor: restDayLoggedToday ? theme.colors.borderDefault : theme.colors.accentDefault,
            borderWidth: 1,
            borderRadius: radius.md,
          },
        ]}
      >
        {restDayLoading ? (
          <ActivityIndicator size="small" color={theme.colors.accentDefault} />
        ) : restDayLoggedToday ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{
              color: theme.colors.accentDefault,
              fontSize: fontSize.bodySm,
              fontWeight: fontWeight.medium,
              flex: 1,
            }}>
              ✓ Rest day logged — your streak is safe.
            </Text>
            <TouchableOpacity
              onPress={handleUndoRestDay}
              hitSlop={{ top: 8, bottom: 8, left: 12, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel="Undo rest day"
            >
              <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.caption, marginLeft: 8 }}>
                Undo
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{
            color: theme.colors.accentDefault,
            fontSize: fontSize.bodySm,
            fontWeight: fontWeight.medium,
          }}>
            😴 Log rest day
          </Text>
        )}
      </TouchableOpacity>

      {/* ── G. Recent history ── */}
      <SectionHeader label="RECENT ACTIVITY" onViewAll={() => router.push('/workout-history')} />
      {historyLoading ? (
        <ActivityIndicator color={theme.colors.textTertiary} style={styles.historyLoader} />
      ) : recentDays.length === 0 ? (
        // SPEC-094A: a true first-run (no history at all) gets a CTA empty state;
        // an established user with a recent gap keeps the lighter "last 7 days"
        // copy. Either way this is a resolved state — never a spinner.
        history.length === 0 ? (
          <View style={[styles.emptyActivity, {
            backgroundColor: theme.colors.bgSecondary,
            borderColor: theme.colors.borderDefault,
            borderRadius: radius.lg,
          }]}>
            <Text style={{ fontSize: fontSize.bodyMd, color: theme.colors.textSecondary, textAlign: 'center' }}>
              No sessions yet — start your first workout.
            </Text>
            <TouchableOpacity
              style={[styles.ctaButton, {
                backgroundColor: theme.colors.accentDefault,
                borderRadius: radius.md,
              }]}
              onPress={() => loggerRef.current?.startWorkout()}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Start your first workout"
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>
                Start workout →
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 12 }}>
            No workouts in the last 7 days
          </Text>
        )
      ) : (
        <View style={styles.historyList}>
          {recentDays.map((entry) => {
            const { workout, sets, liftNames } = entry;
            // Descriptive PR badge: count DISTINCT exercises that hit a PR this
            // session ("🏆 2 PRs") rather than a bare "PR".
            const prExerciseIds = new Set<string>();
            for (const s of sets) {
              if (s.kind === 'lift' && (s as LiftSet & { is_pr: boolean }).is_pr) {
                prExerciseIds.add((s as LiftSet).exercise_id);
              }
            }
            const prCount = prExerciseIds.size;
            const hasPR = prCount > 0;
            const prLabel = `🏆 ${prCount} PR${prCount !== 1 ? 's' : ''}`;
            const isToday = workout.day_key === todayKey;
            const isRestDay = workout.session_type === 'rest_day';

            const displayNames =
              liftNames.length <= 3
                ? liftNames.join(', ')
                : `${liftNames.slice(0, 3).join(', ')} +${liftNames.length - 3} more`;

            const setCount = sets.length;
            const rowVolume = sets.reduce((acc, s) => {
              if (s.kind === 'lift') {
                const ls = s as LiftSet;
                return acc + ls.weight_kg * ls.reps;
              }
              return acc;
            }, 0);
            const rowVolumeDisplay = formatWeight(rowVolume, unitPref, 0);

            return (
              <TouchableOpacity
                key={workout.id}
                style={[styles.historyRow, {
                  backgroundColor: theme.colors.bgSecondary,
                  borderColor: theme.colors.borderDefault,
                  borderRadius: radius.md,
                  paddingHorizontal: sp.s4,
                  paddingVertical: sp.s4,
                }]}
                activeOpacity={0.7}
                accessibilityRole="button"
                onPress={() => router.push(`/workout-day?date=${workout.day_key}`)}
              >
                <View style={styles.historyLeft}>
                  <View style={styles.historyDayRow}>
                    <Text style={{
                      fontSize: fontSize.bodyMd,
                      fontWeight: fontWeight.semibold,
                      color: isToday ? theme.colors.accentDefault : theme.colors.textPrimary,
                    }}>
                      {formatWorkoutLabel(workout.day_key, workout.routine_name)}
                    </Text>
                    {hasPR && (
                      reduceMotion ? (
                        <View style={[styles.prBadge, {
                          backgroundColor: theme.colors.statusSuccess + '26',
                          borderRadius: radius.sm,
                        }]}>
                          <Text style={{ fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: theme.colors.statusSuccess }}>
                            {prLabel}
                          </Text>
                        </View>
                      ) : (
                        <Animated.View
                          entering={ZoomIn.duration(400).springify().damping(0.6)}
                          style={[styles.prBadge, {
                            backgroundColor: theme.colors.statusSuccess + '26',
                            borderRadius: radius.sm,
                          }]}
                        >
                          <Text style={{ fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: theme.colors.statusSuccess }}>
                            {prLabel}
                          </Text>
                        </Animated.View>
                      )
                    )}
                  </View>
                  <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary }} numberOfLines={1}>
                    {displayNames || (isRestDay ? '😴 Rest day' : 'No lifts recorded')}
                  </Text>
                </View>
                <View style={styles.historyRight}>
                  <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: theme.colors.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {setCount} sets
                  </Text>
                  <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {rowVolumeDisplay}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ── H. History folders by routine (tap to view past sessions) ── */}
      {routineFolders.length > 0 ? (
        <>
          <SectionHeader label="BY ROUTINE" />
          <View style={styles.folderList}>
            {routineFolders.map((folder) => (
              <TouchableOpacity
                key={folder.routineName}
                style={[styles.folderCard, {
                  backgroundColor: theme.colors.bgSecondary,
                  borderColor: theme.colors.borderDefault,
                  borderRadius: radius.md,
                }]}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${folder.routineName}, ${folder.sessionCount} sessions`}
                onPress={() => router.push(`/routine-history?name=${encodeURIComponent(folder.routineName)}` as any)}
              >
                <Text style={styles.folderEmoji}>📁</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: theme.colors.textPrimary }}
                    numberOfLines={1}
                  >
                    {folder.routineName}
                  </Text>
                  <Text style={{ fontSize: fontSize.caption, color: theme.colors.textTertiary }}>
                    {folder.sessionCount} session{folder.sessionCount !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: fontSize.bodyLg, color: theme.colors.textTertiary }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>

    {/* ── TICKET-084: WorkoutLoggerHost — always-mounted overlay ── */}
    <WorkoutLoggerHost ref={loggerRef} />

    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },

  // Header
  // TICKET-063: horizontal logo bar above greeting
  logoBannerRow: {
    marginBottom: spacing.s4,
  },
  headerSection: {},
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // TICKET-084: start workout CTA
  startWorkoutBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginBottom: 12,
    minHeight: 52,
  },

  // TICKET-084: "Forgot something?" affordance
  forgotBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 4,
  },

  // Streak badge
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 4,
  },
  streakEmoji: {
    fontSize: 24,
    marginRight: 8,
  },

  // Today card
  todayCard: {
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  todayStat: {
    alignItems: 'center',
    flex: 1,
  },
  todayDivider: {
    width: 1,
    height: 40,
  },
  ctaButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 12,
  },

  // Groups nav row — kept for possible re-use elsewhere, removed from render
  groupsNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 12,
  },
  groupsNavEmoji: {
    fontSize: 22,
  },
  groupsNavText: {
    flex: 1,
  },

  // History folders (by routine)
  folderList: {
    gap: 8,
    marginBottom: 8,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  folderEmoji: {
    fontSize: 22,
  },

  // History
  historyLoader: {
    marginTop: 20,
  },
  // SPEC-094A: first-run "no sessions yet" empty state for Recent Activity
  emptyActivity: {
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  historyList: {
    gap: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  historyLeft: {
    flex: 1,
    gap: 2,
  },
  historyDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },

  // Rest day button (PL-3)
  restDayButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Streak detail modal (P1-006)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    padding: 24,
    paddingBottom: 40,
  },
});

// (IOS-RELEASE-ROUTE fix 2026-05-30) HomeScreen is now the DIRECT default export.
// The previous `export default HomeScreenWithBoundary` wrapper (wrapping the screen
// in <TabErrorBoundary>) was the only structural difference vs the working tabs
// (log/profile/plans) and made this route module resolve as `undefined` in the
// Release/Hermes sync bundle ("Cannot read property 'ErrorBoundary' of undefined").
// Crash protection is covered by the root BootErrorBoundary + the expo-router guard.
