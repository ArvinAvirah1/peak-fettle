/**
 * Health dashboard tab — local-first for ALL tiers.
 *
 * Mirrors the visual language of mobile/app/health-metrics.tsx: uppercase
 * letter-spaced section headers, bordered bgSecondary cards, tabular-nums
 * metrics, and the same sync-CTA card pattern. The hero is a PFCard with
 * three side-by-side goal rings (Steps / Active kcal / Exercise min) fed by
 * useHealthDashboard() — which reads/writes on-device SQLite + HealthKit/
 * Health Connect ONLY, no REST call, no tier branch.
 *
 * No <Modal> in the main screen body (GoalEditorSheet is its own file with
 * the Dynamic-Island-safe header per house rule 3). Nothing here runs on
 * mount except local SQLite reads — the HealthKit sync call is entirely
 * behind the user-tapped "Sync Now" button.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius, a11y } from '../../src/theme/tokens';
import { PFCard, ScreenLayout } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { GoalRing } from '../../src/components/health/GoalRing';
import { GoalEditorSheet } from '../../src/components/health/GoalEditorSheet';
import {
  useHealthDashboard,
  HealthDayPoint,
  GoalProgress,
} from '../../src/hooks/useHealthDashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Period = 'daily' | 'weekly';

function todayLocalKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayLocalKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Locale-grouped integer, e.g. 8432 -> "8,432". Falls back to plain string on error. */
function formatInt(n: number): string {
  try {
    return Math.round(n).toLocaleString('en-US');
  } catch {
    return String(Math.round(n));
  }
}

/** Compact "k" form for large step counts in the recent-days pills, e.g. 12345 -> "12.3k". */
function formatCompact(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return formatInt(n);
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ text }: { text: string }): React.ReactElement {
  const { theme } = useTheme();
  return <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>{text}</Text>;
}

// ---------------------------------------------------------------------------
// Daily/Weekly segmented toggle
// ---------------------------------------------------------------------------

interface PeriodToggleProps {
  period: Period;
  onChange: (p: Period) => void;
}

function PeriodToggle({ period, onChange }: PeriodToggleProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;

  return (
    <View style={[styles.toggleContainer, { backgroundColor: c.bgTertiary }]}>
      {(['daily', 'weekly'] as Period[]).map((p) => {
        const active = p === period;
        return (
          <TouchableOpacity
            key={p}
            style={[styles.toggleSegment, active && { backgroundColor: c.accentDefault }]}
            onPress={() => onChange(p)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[
                styles.toggleLabel,
                { color: active ? theme.components.buttonPrimaryText : c.textTertiary },
              ]}
            >
              {p === 'daily' ? t('screens:healthDashboard.daily') : t('screens:healthDashboard.weekly')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Recent-days row (daily mode)
// ---------------------------------------------------------------------------

function statPillColor(
  metGoal: boolean,
  color: string,
  textPrimary: string,
): string {
  return metGoal ? color : textPrimary;
}

interface DayRowProps {
  day: HealthDayPoint;
  goals: { stepsDaily: number; activeKcalDaily: number; exerciseMinutesDaily: number };
}

function DayRow({ day, goals }: DayRowProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;

  const label =
    day.date === todayLocalKey()
      ? t('screens:healthDashboard.today')
      : day.date === yesterdayLocalKey()
        ? t('screens:healthDashboard.yesterday')
        : new Date(
            Number(day.date.slice(0, 4)),
            Number(day.date.slice(5, 7)) - 1,
            Number(day.date.slice(8, 10)),
          ).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const stepsMet = day.steps != null && day.steps >= goals.stepsDaily;
  const kcalMet = day.activeKcal != null && day.activeKcal >= goals.activeKcalDaily;
  const minMet = day.exerciseMinutes != null && day.exerciseMinutes >= goals.exerciseMinutesDaily;

  return (
    <View style={[styles.dayRow, { borderBottomColor: c.borderDefault }]}>
      <View style={styles.dayRowLeft}>
        <Text style={[styles.dayLabel, { color: c.textPrimary }]}>{label}</Text>
        <Text style={[styles.sourceLabel, { color: c.textTertiary }]}>Apple Health</Text>
      </View>
      <View style={styles.dayRowStats}>
        <View style={styles.statPill}>
          <Text
            style={[
              styles.statPillValue,
              { color: day.steps != null ? statPillColor(stepsMet, c.accentDefault, c.textPrimary) : c.textTertiary },
            ]}
          >
            {day.steps != null ? formatCompact(day.steps) : '—'}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Text
            style={[
              styles.statPillValue,
              {
                color:
                  day.activeKcal != null
                    ? statPillColor(kcalMet, c.statusWarning, c.textPrimary)
                    : c.textTertiary,
              },
            ]}
          >
            {day.activeKcal != null ? formatInt(day.activeKcal) : '—'}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Text
            style={[
              styles.statPillValue,
              {
                color:
                  day.exerciseMinutes != null
                    ? statPillColor(minMet, c.statusSuccess, c.textPrimary)
                    : c.textTertiary,
              },
            ]}
          >
            {day.exerciseMinutes != null ? formatInt(day.exerciseMinutes) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Weekly rows — last 8 Mon-Sun weeks, totals per week
// ---------------------------------------------------------------------------

interface WeekBucket {
  label: string;
  steps: number;
  activeKcal: number;
  exerciseMinutes: number;
  hasData: boolean;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function buildWeeklyBuckets(days: HealthDayPoint[], t: (k: string) => string): WeekBucket[] {
  const byDate = new Map<string, HealthDayPoint>();
  for (const d of days) byDate.set(d.date, d);

  const today = new Date();
  const thisWeekStart = startOfWeek(today);
  const buckets: WeekBucket[] = [];

  for (let w = 0; w < 8; w++) {
    const weekStart = new Date(thisWeekStart);
    weekStart.setDate(weekStart.getDate() - w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    let steps = 0;
    let activeKcal = 0;
    let exerciseMinutes = 0;
    let hasData = false;

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      const row = byDate.get(key);
      if (row) {
        hasData = true;
        steps += row.steps ?? 0;
        activeKcal += row.activeKcal ?? 0;
        exerciseMinutes += row.exerciseMinutes ?? 0;
      }
    }

    const label = w === 0 ? t('screens:healthDashboard.thisWeek') : `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}`;
    buckets.push({ label, steps, activeKcal, exerciseMinutes, hasData });
  }

  return buckets;
}

function WeekRow({ week }: { week: WeekBucket }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={[styles.dayRow, { borderBottomColor: c.borderDefault }]}>
      <View style={styles.dayRowLeft}>
        <Text style={[styles.dayLabel, { color: c.textPrimary }]}>{week.label}</Text>
      </View>
      <View style={styles.dayRowStats}>
        <View style={styles.statPill}>
          <Text style={[styles.statPillValue, { color: week.hasData ? c.textPrimary : c.textTertiary }]}>
            {week.hasData ? formatCompact(week.steps) : '—'}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statPillValue, { color: week.hasData ? c.textPrimary : c.textTertiary }]}>
            {week.hasData ? formatInt(week.activeKcal) : '—'}
          </Text>
        </View>
        <View style={styles.statPill}>
          <Text style={[styles.statPillValue, { color: week.hasData ? c.textPrimary : c.textTertiary }]}>
            {week.hasData ? formatInt(week.exerciseMinutes) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HealthScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;

  const {
    days,
    goals,
    dailyProgress,
    weeklyProgress,
    isLoading,
    sync,
    isSyncing,
    syncError,
    isHealthKitAvailable,
    refetch,
    updateGoals,
  } = useHealthDashboard();

  const [period, setPeriod] = useState<Period>('daily');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [goalsSheetVisible, setGoalsSheetVisible] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const progress = period === 'daily' ? dailyProgress : weeklyProgress;

  const periodCaption = useMemo(() => {
    if (period === 'weekly') return t('screens:healthDashboard.lastSevenDays');
    const d = new Date();
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }, [period, t]);

  const goalCaption = (p: GoalProgress): string =>
    period === 'daily'
      ? t('screens:healthDashboard.ofGoal', { goal: formatInt(p.goal) })
      : t('screens:healthDashboard.avgOfGoal', { goal: formatInt(p.goal) });

  const recentDays = useMemo(
    () => days.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14),
    [days],
  );

  const weeklyBuckets = useMemo(() => buildWeeklyBuckets(days, t), [days, t]);

  const hasAnyData = days.length > 0;

  const ringSize = 96;
  const strokeWidth = 10;

  return (
    <ScreenLayout horizontalPadding={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={c.textTertiary} />
        }
      >
        {/* ── Section 1: Goals ── */}
        <View style={styles.section}>
          <View style={styles.goalsHeaderRow}>
            <SectionHeader text={t('screens:healthDashboard.goals')} />
            <TouchableOpacity
              onPress={() => setGoalsSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t('screens:healthDashboard.goalsButtonLabel')}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={18} color={c.textTertiary} />
            </TouchableOpacity>
          </View>

          <PeriodToggle period={period} onChange={setPeriod} />

          <Text style={[styles.periodCaption, { color: c.textTertiary, fontVariant: ['tabular-nums'] }]}>
            {periodCaption}
          </Text>

          <PFCard variant="default" padding="md">
            <View style={styles.ringsRow}>
              <RingColumn
                progress={progress.steps}
                value={progress.steps.value}
                formattedValue={hasAnyData || progress.steps.value > 0 ? formatInt(progress.steps.value) : '—'}
                color={c.accentDefault}
                trackColor={theme.components.progressRingTrack}
                unitLabel={t('screens:healthDashboard.steps')}
                metricLabel={t('screens:healthDashboard.goalSteps')}
                goalCaption={goalCaption(progress.steps)}
                metricNameForA11y={t('screens:healthDashboard.goalSteps')}
                size={ringSize}
                strokeWidth={strokeWidth}
              />
              <RingColumn
                progress={progress.activeKcal}
                value={progress.activeKcal.value}
                formattedValue={hasAnyData || progress.activeKcal.value > 0 ? formatInt(progress.activeKcal.value) : '—'}
                color={c.statusWarning}
                trackColor={theme.components.progressRingTrack}
                unitLabel={t('screens:healthDashboard.kcal')}
                metricLabel={t('screens:healthDashboard.goalActiveKcal')}
                goalCaption={goalCaption(progress.activeKcal)}
                metricNameForA11y={t('screens:healthDashboard.goalActiveKcal')}
                size={ringSize}
                strokeWidth={strokeWidth}
              />
              <RingColumn
                progress={progress.exerciseMinutes}
                value={progress.exerciseMinutes.value}
                formattedValue={
                  hasAnyData || progress.exerciseMinutes.value > 0 ? formatInt(progress.exerciseMinutes.value) : '—'
                }
                color={c.statusSuccess}
                trackColor={theme.components.progressRingTrack}
                unitLabel={t('screens:healthDashboard.min')}
                metricLabel={t('screens:healthDashboard.goalExerciseMinutes')}
                goalCaption={goalCaption(progress.exerciseMinutes)}
                metricNameForA11y={t('screens:healthDashboard.goalExerciseMinutes')}
                size={ringSize}
                strokeWidth={strokeWidth}
              />
            </View>
          </PFCard>
        </View>

        {/* ── Section 2: Sync ── */}
        {Platform.OS === 'ios' ? (
          <View style={styles.section}>
            <SectionHeader text={t('screens:healthDashboard.sync')} />
            <View style={[styles.syncCard, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              <View style={styles.syncCardText}>
                <Text style={[styles.syncCardTitle, { color: c.textPrimary }]}>
                  {t('screens:healthDashboard.appleHealth')}
                </Text>
                <Text style={[styles.syncCardSub, { color: c.textTertiary }]}>
                  {t('screens:healthDashboard.syncCardSub')}
                </Text>
                {!isHealthKitAvailable ? (
                  <Text style={[styles.syncUnavailableNote, { color: c.statusWarning }]}>
                    {t('screens:healthDashboard.healthKitUnavailable')}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.syncButton, { backgroundColor: c.accentDefault }, isSyncing && styles.syncButtonDisabled]}
                onPress={sync}
                disabled={isSyncing}
                accessibilityRole="button"
                accessibilityLabel={t('screens:healthDashboard.syncNow')}
                accessibilityState={{ disabled: isSyncing }}
              >
                {isSyncing ? (
                  <ActivityIndicator color={theme.components.buttonPrimaryText} size="small" />
                ) : (
                  <Text style={[styles.syncButtonText, { color: theme.components.buttonPrimaryText }]}>
                    {t('screens:healthDashboard.syncNow')}
                  </Text>
                )}
              </TouchableOpacity>

              {syncError ? (
                <View
                  style={[
                    styles.syncErrorBox,
                    { backgroundColor: c.statusError + '18', borderColor: c.statusError + '60' },
                  ]}
                >
                  <Text style={[styles.syncErrorText, { color: c.statusError }]}>{syncError}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={[styles.androidNote, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              <Text style={[styles.androidNoteText, { color: c.textTertiary }]}>
                {t('screens:healthDashboard.androidNote')}
              </Text>
            </View>
          </View>
        )}

        {/* ── Section 3: Recent days ── */}
        <View style={styles.section}>
          <SectionHeader text={t('screens:healthDashboard.recentDays')} />

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={c.accentDefault} />
              <Text style={[styles.loadingText, { color: c.textTertiary }]}>{t('common:loading')}</Text>
            </View>
          ) : !hasAnyData ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateTitle, { color: c.textPrimary }]}>
                {t('screens:healthDashboard.noData')}
              </Text>
              <Text style={[styles.emptyStateSubtitle, { color: c.textTertiary }]}>
                {Platform.OS === 'ios'
                  ? t('screens:healthDashboard.emptyStateIos')
                  : t('screens:healthDashboard.emptyStateAndroid')}
              </Text>
            </View>
          ) : (
            <View style={[styles.dayList, { backgroundColor: c.bgSecondary, borderColor: c.borderDefault }]}>
              <View style={[styles.legendRow, { borderBottomColor: c.borderDefault }]}>
                <Text style={styles.legendSpacer} />
                <View style={styles.dayRowStats}>
                  <Text style={[styles.legendLabel, { color: c.textTertiary }]}>
                    {t('screens:healthDashboard.legendSteps')}
                  </Text>
                  <Text style={[styles.legendLabel, { color: c.textTertiary }]}>
                    {t('screens:healthDashboard.legendKcal')}
                  </Text>
                  <Text style={[styles.legendLabel, { color: c.textTertiary }]}>
                    {t('screens:healthDashboard.legendMin')}
                  </Text>
                </View>
              </View>

              {period === 'daily'
                ? recentDays.map((d) => <DayRow key={d.date} day={d} goals={goals} />)
                : weeklyBuckets.map((w) => <WeekRow key={w.label} week={w} />)}
            </View>
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      <GoalEditorSheet
        visible={goalsSheetVisible}
        goals={goals}
        onClose={() => setGoalsSheetVisible(false)}
        onSave={updateGoals}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// RingColumn — ring + below-ring label/goal text
// ---------------------------------------------------------------------------

interface RingColumnProps {
  progress: GoalProgress;
  value: number;
  formattedValue: string;
  color: string;
  trackColor: string;
  unitLabel: string;
  metricLabel: string;
  goalCaption: string;
  metricNameForA11y: string;
  size: number;
  strokeWidth: number;
}

function RingColumn({
  progress,
  formattedValue,
  color,
  trackColor,
  unitLabel,
  metricLabel,
  goalCaption,
  metricNameForA11y,
  size,
  strokeWidth,
}: RingColumnProps): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const c = theme.colors;

  const a11yLabel = `${metricNameForA11y}: ${formattedValue} ${goalCaption}`;

  return (
    <View style={styles.ringColumn}>
      <GoalRing
        size={size}
        strokeWidth={strokeWidth}
        pct={progress.pct}
        color={color}
        trackColor={trackColor}
        label={formattedValue}
        sublabel={unitLabel}
        met={progress.met}
        accessibilityLabel={a11yLabel}
        accessibilityNow={Math.round(progress.value)}
        accessibilityMax={Math.round(progress.goal)}
      />
      <Text style={[styles.ringLabel, { color: c.textSecondary, fontWeight: fontWeight.semibold }]} numberOfLines={1}>
        {metricLabel}
      </Text>
      <Text style={[styles.ringGoalCaption, { color: c.textTertiary }]} numberOfLines={1}>
        {goalCaption}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    gap: 10,
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  goalsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Toggle
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: spacing.s1,
  },
  toggleSegment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  periodCaption: {
    fontSize: fontSize.caption,
    textAlign: 'right',
  },

  // Rings
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ringColumn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.s2,
  },
  ringLabel: {
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
  ringGoalCaption: {
    fontSize: fontSize.micro,
    textAlign: 'center',
  },

  // Sync card
  syncCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  syncCardText: {
    gap: 6,
  },
  syncCardTitle: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
  },
  syncCardSub: {
    fontSize: fontSize.bodySm,
    lineHeight: 22,
  },
  syncUnavailableNote: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
    marginTop: 4,
  },
  syncButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  syncErrorBox: {
    borderRadius: radius.sm,
    padding: 12,
    borderWidth: 1,
  },
  syncErrorText: {
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
  androidNote: {
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
  },
  androidNoteText: {
    fontSize: fontSize.bodySm,
    lineHeight: 22,
  },

  // Day list
  dayList: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderBottomWidth: 1,
  },
  legendSpacer: {
    flex: 1,
  },
  legendLabel: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    width: 48,
    textAlign: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  dayRowLeft: {
    flex: 1,
    gap: 2,
  },
  dayLabel: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  sourceLabel: {
    fontSize: fontSize.caption,
  },
  dayRowStats: {
    flexDirection: 'row',
    gap: 1,
  },
  statPill: {
    width: 48,
    alignItems: 'center',
    gap: 1,
  },
  statPillValue: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },

  // Empty / loading
  emptyState: {
    paddingVertical: spacing.s8,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
  },
  emptyStateSubtitle: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.s4,
  },
  centered: {
    paddingVertical: spacing.s8,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: fontSize.bodySm,
  },

  bottomPad: { height: 40 },
});
