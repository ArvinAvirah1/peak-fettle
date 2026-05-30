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
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import Animated, { ZoomIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/hooks/useAuth';
import { useWorkout } from '../../src/hooks/useWorkout';
import { useWorkoutHistory } from '../../src/hooks/useWorkoutHistory';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { formatWeight } from '../../src/constants/units';
import { formatDayLabel, toDateKey } from '../../src/utils/dateHelpers';
import { LiftSet, PlanWithStructure } from '../../src/types/api';
import { useTheme } from '../../src/theme/ThemeContext';
import { PFCard, PFButton, ScreenLayout } from '../../src/components/ui';
import { getPlans, getPlan } from '../../src/api/plans';
import { getPercentile } from '../../src/api/percentile';
import { logRestDay, undoRestDay } from '../../src/api/workouts';
import { BrandLogo } from '../../src/components/BrandLogo'; // TICKET-063

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const firstName = name ?? 'there';
  return `Good ${period}, ${firstName}`;
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

interface TodayCardProps {
  setCount: number;
  volumeDisplay: string;
  isLoading: boolean;
}

function TodayCard({
  setCount,
  volumeDisplay,
  isLoading,
}: TodayCardProps): React.ReactElement {
  const router = useRouter();
  const { theme, fontSize, fontWeight, radius } = useTheme();

  const handleLogPress = (): void => {
    router.push('/(tabs)/log');
  };

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
            onPress={handleLogPress}
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
                {/* E-003: was 28/'700'; heading1=32 is closest large heading token */}
                {setCount}
              </Text>
              <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary }}>
                sets logged
              </Text>
            </View>
            <View style={[styles.todayDivider, { backgroundColor: theme.colors.borderDefault }]} />
            <View style={styles.todayStat}>
              <Text style={{ fontSize: fontSize.heading1, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                {/* E-003: was 28/'700' */}
                {volumeDisplay}
              </Text>
              <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary }}>
                total volume
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.ctaButton, {
              backgroundColor: theme.colors.accentDefault,
              borderRadius: radius.md,
            }]}
            onPress={handleLogPress}
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
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  return (
    <View style={{
      backgroundColor: theme.colors.bgPrimary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.s2,
      paddingVertical: spacing.s1,
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
  const { sets: todaySets, isLoading: todayLoading } = useWorkout();
  const { history, streak, isLoading: historyLoading, refetch } = useWorkoutHistory();
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();

  const unitPref = user?.unit_pref ?? 'kg';

  // Today's stats
  const todayKey = toDateKey(new Date());

  const todayVolume = useMemo(() => {
    let vol = 0;
    for (const s of todaySets) {
      if (s.kind === 'lift') {
        const ls = s as LiftSet;
        vol += ls.weight_kg * ls.reps;
      }
    }
    return vol;
  }, [todaySets]);

  const todayVolumeDisplay = useMemo(
    () => formatWeight(todayVolume, unitPref, 0),
    [todayVolume, unitPref]
  );

  // Last 7 calendar days (only entries with workouts)
  const recentDays = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffKey = toDateKey(cutoff);
    return history.filter((e) => e.workout.day_key >= cutoffKey);
  }, [history]);

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
        // Most recent plan first (server returns in created_at desc order)
        const detail = await getPlan(plans[0].id);
        setPlan(detail);
      }
    } catch (err) {
      // Silently ignore — plan card is non-critical
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
    getPercentile()
      .then((resp) => {
        const values = resp.rankings
          .map((r) => r.percentile)
          .filter((v): v is number => v !== null);
        if (values.length > 0) setBestPercentile(Math.max(...values));
      })
      .catch((err: unknown) => {
        // Non-critical — leave as null
        console.warn('[PF] index/getPercentile:', err instanceof Error ? err.message : String(err));
      });
  }, []);

  // ── P0-005: Computed dashboard stats ─────────────────────────────────────

  /** Weekly volume: sum of weight_kg * reps for sets this calendar week (Mon–Sun). */
  const weeklyVolume = useMemo(() => {
    const now = new Date();
    // Start of current ISO week (Monday)
    const dayOfWeek = now.getDay(); // 0=Sun
    const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - diffToMon);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartKey = toDateKey(weekStart);

    let vol = 0;
    for (const entry of history) {
      if (entry.workout.day_key < weekStartKey) continue;
      for (const s of entry.sets) {
        if (s.kind === 'lift') {
          const ls = s as LiftSet;
          vol += ls.weight_kg * ls.reps;
        }
      }
    }
    return Math.round(vol);
  }, [history]);

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
      for (const s of entry.sets) {
        if (s.kind === 'lift' && (s as LiftSet & { is_pr?: boolean }).is_pr) {
          const ls = s as LiftSet & { is_pr: boolean };
          // Deduplicate by exercise to avoid showing same exercise multiple times
          if (!seen.has(ls.exercise_id)) {
            seen.add(ls.exercise_id);
            // liftNames from the same entry maps exercise_id position to name
            const nameIdx = entry.sets
              .filter((x) => x.kind === 'lift')
              .findIndex((x) => x.id === ls.id);
            const name = entry.liftNames[nameIdx] ?? ls.exercise_id;
            chips.push({ id: ls.id, exercise_name: name, weight_kg: ls.weight_kg });
          }
        }
      }
    }
    return chips.slice(0, 10); // cap at 10 chips
  }, [history]);

  // ── Computed plan metrics ─────────────────────────────────────────────────
  const planExercises = plan?.structure?.session?.exercises ?? [];
  const planTotalSets = planExercises.reduce((acc, ex) => acc + (ex.sets ?? 0), 0);
  const planReasoning = plan?.structure?.reasoning ?? null;

  // ── PL-3: Rest day state ─────────────────────────────────────────────────
  // TICKET-054: hydrate from history — no extra fetch needed.
  // history is already loaded by useWorkoutHistory(); once session_type is
  // returned by GET /workouts the memo below reflects the real server state.
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
      await logRestDay();
      // Refetch history so the memo picks up the new rest_day row.
      await refetch();
    } catch {
      Alert.alert('Could not log rest day', 'Please try again.');
    } finally {
      setRestDayLoading(false);
    }
  }, [restDayLoggedToday, restDayLoading, refetch]);

  const handleUndoRestDay = useCallback(async () => {
    if (!restDayLoggedToday || restDayLoading) return;
    setRestDayLoading(true);
    try {
      await undoRestDay();
      await refetch();
    } catch {
      Alert.alert('Could not undo rest day', 'Please try again.');
    } finally {
      setRestDayLoading(false);
    }
  }, [restDayLoggedToday, restDayLoading, refetch]);

  // ── P1-006: Streak detail sheet ──────────────────────────────────────────
  const [streakDetailVisible, setStreakDetailVisible] = useState(false);

  // Build last 7 day dots for streak detail sheet
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

  // Longest streak derived from history
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

  return (
    <ScreenLayout horizontalPadding={false}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { padding: spacing.s5, paddingBottom: spacing.s8 }]}
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
            <Text style={{ fontSize: fontSize.heading2, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, marginBottom: spacing.s4 }}>
              Streak Details
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.s4, marginBottom: spacing.s4 }}>
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
            <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: theme.colors.textTertiary, letterSpacing: 1, marginBottom: spacing.s2 }}>
              LAST 7 DAYS
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s5 }}>
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

      {/* ── TICKET-063: Brand logo bar (horizontal, above greeting) ── */}
      <View style={styles.logoBannerRow}>
        <BrandLogo height={36} dark horizontal />
      </View>

      {/* ── A. Greeting header ── */}
      <View style={[styles.headerSection, { marginBottom: spacing.s5 }]}>
        <View style={styles.headerRow}>
          <Text style={{ fontSize: fontSize.heading2, fontWeight: fontWeight.bold, color: theme.colors.textPrimary, letterSpacing: -0.3 }}>
          {/* E-003: was fontWeight '700' */}
            {getGreeting(user?.display_name ?? null)}
          </Text>
          <SyncStatusIndicator />
        </View>
        <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary }}>
          {getFullDateLabel()}
        </Text>
      </View>

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
              <View style={{ flexDirection: 'row', gap: spacing.s3, marginTop: spacing.s2 }}>
                <MetricChip label="Exercises" value={planExercises.length} />
                <MetricChip label="Sets" value={planTotalSets} />
              </View>
              {planReasoning ? (
                <>
                  <TouchableOpacity
                    onPress={() => setReasonExpanded(!reasonExpanded)}
                    style={{ marginTop: spacing.s3 }}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle workout reasoning"
                  >
                    <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.accentDefault }}>
                      Why this workout? {reasonExpanded ? '▾' : '›'}
                    </Text>
                  </TouchableOpacity>
                  {reasonExpanded && (
                    <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary, marginTop: spacing.s2 }}>
                      {planReasoning}
                    </Text>
                  )}
                </>
              ) : null}
              <PFButton
                variant="primary"
                label="Start Workout"
                onPress={() => router.push('/(tabs)/log')}
                style={{ marginTop: spacing.s3 }}
              />
            </PFCard>
          ) : null}
        </>
      ) : null}

      {/* ── D. Recent PRs horizontal scroll ── */}
      {!historyLoading && prChips.length > 0 ? (
        <>
          <SectionHeader label="RECENT PRs" onViewAll={() => router.push('/(tabs)/log')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.s2 }}>
            {prChips.map((pr) => (
              <View
                key={pr.id}
                style={{
                  backgroundColor: theme.colors.statusSuccess + '26',
                  borderRadius: radius.sm,
                  paddingHorizontal: spacing.s2,
                  paddingVertical: spacing.s1,
                  marginRight: spacing.s2,
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

      {/* ── E. Quick Stats row ── */}
      {!historyLoading ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.s2 }}>
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
          <View style={{ flexDirection: 'row', gap: spacing.s3, marginBottom: spacing.s2 }}>
            <StatCard label="Weekly Volume" value={`${weeklyVolume} kg`} />
            <StatCard label="Sessions" value={`${sessionsThisMonth}`} />
            <StatCard label="Best Rank" value={bestPercentile !== null ? `${bestPercentile}th` : '—'} />
          </View>
        </>
      ) : null}

      {/* ── F. Today's workout card ── */}
      <SectionHeader label="TODAY" />
      <TodayCard
        setCount={todaySets.length}
        volumeDisplay={todayVolumeDisplay}
        isLoading={todayLoading}
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
        <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 12 }}>
          No workouts in the last 7 days
        </Text>
      ) : (
        <View style={styles.historyList}>
          {recentDays.map((entry) => {
            const { workout, sets, liftNames } = entry;
            const hasPR = sets.some(
              (s) => s.kind === 'lift' && (s as LiftSet & { is_pr: boolean }).is_pr
            );
            const isToday = workout.day_key === todayKey;

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
                  paddingHorizontal: spacing.s4,
                  paddingVertical: spacing.s4,
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
                      {formatDayLabel(workout.day_key)}
                    </Text>
                    {hasPR && (
                      reduceMotion ? (
                        <View style={[styles.prBadge, {
                          backgroundColor: theme.colors.statusSuccess + '26',
                          borderRadius: radius.sm,
                        }]}>
                          <Text style={{ fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: theme.colors.statusSuccess }}>
                            🏆 PR
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
                            🏆 PR
                          </Text>
                        </Animated.View>
                      )
                    )}
                  </View>
                  <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary }} numberOfLines={1}>
                    {displayNames || 'No lifts recorded'}
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
    </ScrollView>
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

  // History
  historyLoader: {
    marginTop: 20,
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
