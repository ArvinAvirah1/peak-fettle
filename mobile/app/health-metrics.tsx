/**
 * Health metrics screen — displays recent health data and manages HealthKit sync.
 *
 * TICKET-022: implementation.
 *
 * Accessible from the Profile tab via a row link (not a main tab).
 * Navigates to this screen via router.push('/health-metrics').
 *
 * Sections:
 *   A. 7-day summary chips  — avg HR, HRV, sleep, active kcal
 *   B. HealthKit sync CTA   — iOS only; shows stub warning if library not installed
 *   C. Daily history list   — last 14 days, one row per day
 *
 * HealthKit note:
 *   The sync button uses the healthKit.ts service. Full HealthKit reads require
 *   a dev build (EAS). Until react-native-health is installed and the EAS dev
 *   client is built, the sync button will show a "not yet available" notice.
 *
 * Data flow:
 *   HealthKit (iOS) → fetchHealthKitData() → POST /health-metrics (upsert)
 *   GET /health-metrics → renders in this screen
 *   GET /health-metrics/summary → renders in the summary chips
 */

import React, { useCallback } from 'react';
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
import { useRouter } from 'expo-router';
import { useHealthMetrics } from '../src/hooks/useHealthMetrics';
import { DailyHealthMetric } from '../src/api/healthMetrics';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout } from '../src/components/ui';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  if (dateStr === todayKey) return 'Today';
  if (dateStr === yesterdayKey) return 'Yesterday';

  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmt(value: number | null, unit: string, decimals = 0): string {
  if (value === null) return '—';
  return `${value.toFixed(decimals)}${unit}`;
}

// Colour coding for HRV and HR (higher HRV = better; lower resting HR = better)
function hrvColorToken(hrv: number | null, theme: any): string {
  if (hrv === null) return theme.colors.textTertiary;
  if (hrv >= 50) return theme.colors.statusSuccess;
  if (hrv >= 30) return theme.colors.statusWarning;
  return theme.colors.statusError;
}

function hrColorToken(hr: number | null, theme: any): string {
  if (hr === null) return theme.colors.textTertiary;
  if (hr <= 60) return theme.colors.statusSuccess;
  if (hr <= 75) return theme.colors.statusWarning;
  return theme.colors.statusError;
}

// ---------------------------------------------------------------------------
// Summary chip
// ---------------------------------------------------------------------------

interface SummaryChipProps {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}

function SummaryChip({ label, value, sub, valueColor }: SummaryChipProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={[
      styles.summaryChip,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      <Text style={[styles.summaryValue, { color: valueColor ?? theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>
        {value}
      </Text>
      <Text style={[styles.summaryLabel, { color: theme.colors.textTertiary }]}>{label}</Text>
      {sub ? <Text style={[styles.summarySub, { color: theme.colors.textTertiary }]}>{sub}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Day row
// ---------------------------------------------------------------------------

interface DayRowProps {
  metric: DailyHealthMetric;
}

function DayRow({ metric }: DayRowProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={[styles.dayRow, { borderBottomColor: theme.colors.borderDefault }]}>
      <View style={styles.dayRowLeft}>
        <Text style={[styles.dayLabel, { color: theme.colors.textPrimary }]}>{formatDate(metric.date)}</Text>
        <Text style={[styles.sourceLabel, { color: theme.colors.textTertiary }]}>{metric.source}</Text>
      </View>
      <View style={styles.dayRowStats}>
        {metric.resting_hr_bpm !== null ? (
          <View style={styles.statPill}>
            <Text style={[styles.statPillValue, { color: hrColorToken(metric.resting_hr_bpm, theme), fontVariant: ['tabular-nums'] }]}>
              {metric.resting_hr_bpm}
            </Text>
            <Text style={[styles.statPillUnit, { color: theme.colors.textTertiary }]}>bpm</Text>
          </View>
        ) : null}
        {metric.hrv_ms !== null ? (
          <View style={styles.statPill}>
            <Text style={[styles.statPillValue, { color: hrvColorToken(metric.hrv_ms, theme), fontVariant: ['tabular-nums'] }]}>
              {metric.hrv_ms}
            </Text>
            <Text style={[styles.statPillUnit, { color: theme.colors.textTertiary }]}>ms</Text>
          </View>
        ) : null}
        {metric.sleep_hours !== null ? (
          <View style={styles.statPill}>
            <Text style={[styles.statPillValue, { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>{metric.sleep_hours.toFixed(1)}</Text>
            <Text style={[styles.statPillUnit, { color: theme.colors.textTertiary }]}>hrs</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HealthMetricsScreen(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const {
    metrics,
    summary,
    isLoading,
    error,
    refetch,
    sync,
    isSyncing,
    syncError,
    isHealthKitAvailable,
  } = useHealthMetrics();

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  return (
    <ScreenLayout horizontalPadding={false}>
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={[styles.header, { borderBottomColor: theme.colors.bgSecondary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backButtonText, { color: theme.colors.accentDefault }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Health Metrics</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.textTertiary}
          />
        }
      >
        {/* ── A. 7-day summary chips ── */}
        {summary ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>7-DAY AVERAGE</Text>
            <View style={styles.summaryGrid}>
              <SummaryChip
                label="Resting HR"
                value={fmt(summary.avg_resting_hr_bpm, ' bpm')}
                sub="heart rate"
                valueColor={hrColorToken(summary.avg_resting_hr_bpm, theme)}
              />
              <SummaryChip
                label="HRV"
                value={fmt(summary.avg_hrv_ms, ' ms')}
                sub="variability"
                valueColor={hrvColorToken(summary.avg_hrv_ms, theme)}
              />
              <SummaryChip
                label="Sleep"
                value={fmt(summary.avg_sleep_hours, 'h', 1)}
                sub="per night"
              />
              <SummaryChip
                label="Active"
                value={fmt(summary.avg_active_kcal, ' kcal')}
                sub="per day"
              />
            </View>
            <Text style={[styles.summaryNote, { color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] }]}>
              {summary.days_logged} of {summary.window_days} days logged
            </Text>
          </View>
        ) : null}

        {/* ── B. HealthKit sync ── */}
        {Platform.OS === 'ios' ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>SYNC</Text>
            <View style={[
              styles.syncCard,
              { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
            ]}>
              <View style={styles.syncCardText}>
                <Text style={[styles.syncCardTitle, { color: theme.colors.textPrimary }]}>Apple HealthKit</Text>
                <Text style={[styles.syncCardSub, { color: theme.colors.textTertiary }]}>
                  Sync resting HR, HRV, sleep, and active calories from the Health app.
                  Used by the AI planner to adjust training intensity.
                </Text>
                {!isHealthKitAvailable ? (
                  <Text style={[styles.syncUnavailableNote, { color: theme.colors.statusWarning }]}>
                    ⚠ HealthKit requires a development build (EAS).
                    Tap to see the setup guide.
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[
                  styles.syncButton,
                  { backgroundColor: theme.colors.accentDefault },
                  isSyncing && styles.syncButtonDisabled,
                ]}
                onPress={sync}
                disabled={isSyncing}
                accessibilityRole="button"
                accessibilityLabel="Sync from HealthKit"
              >
                {isSyncing ? (
                  <ActivityIndicator color={theme.components.buttonPrimaryText} size="small" />
                ) : (
                  <Text style={[styles.syncButtonText, { color: theme.components.buttonPrimaryText }]}>Sync Now</Text>
                )}
              </TouchableOpacity>

              {syncError ? (
                <View style={[
                  styles.syncErrorBox,
                  { backgroundColor: theme.colors.statusError + '18', borderColor: theme.colors.statusError + '60' },
                ]}>
                  <Text style={[styles.syncErrorText, { color: theme.colors.statusError }]}>{syncError}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={[
              styles.androidNote,
              { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
            ]}>
              <Text style={[styles.androidNoteText, { color: theme.colors.textTertiary }]}>
                HealthKit sync is available on iOS only. Garmin Connect IQ
                integration (TICKET-029) will provide health data on Android.
              </Text>
            </View>
          </View>
        )}

        {/* ── C. Daily history ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>RECENT DAYS</Text>

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.colors.accentDefault} />
              <Text style={[styles.loadingText, { color: theme.colors.textTertiary }]}>Loading…</Text>
            </View>
          ) : error ? (
            <View style={[
              styles.errorBanner,
              { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.statusError },
            ]}>
              <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
              <TouchableOpacity onPress={refetch} accessibilityRole="button" accessibilityLabel="Retry">
                <Text style={[styles.retryText, { color: theme.colors.statusError }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : metrics.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateTitle, { color: theme.colors.textPrimary }]}>No health data yet</Text>
              <Text style={[styles.emptyStateSubtitle, { color: theme.colors.textTertiary }]}>
                {Platform.OS === 'ios'
                  ? 'Tap "Sync Now" above to import data from Apple Health.'
                  : 'Connect a wearable to start logging health metrics.'}
              </Text>
            </View>
          ) : (
            <View style={[
              styles.dayList,
              { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
            ]}>
              {/* Legend row */}
              <View style={[styles.legendRow, { borderBottomColor: theme.colors.borderDefault }]}>
                <Text style={styles.legendSpacer} />
                <View style={styles.dayRowStats}>
                  <Text style={[styles.legendLabel, { color: theme.colors.textTertiary }]}>HR</Text>
                  <Text style={[styles.legendLabel, { color: theme.colors.textTertiary }]}>HRV</Text>
                  <Text style={[styles.legendLabel, { color: theme.colors.textTertiary }]}>Sleep</Text>
                </View>
              </View>

              {metrics.map((m) => (
                <DayRow key={m.id ?? m.date} metric={m} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3, // safe area handled by ScreenLayout
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    minWidth: 64,
    minHeight: 48,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: fontSize.bodyMd,  // E-003: was 17
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.bodyMd,  // E-003: was 17
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  headerRight: {
    minWidth: 64,
  },

  scrollContent: {
    padding: 20,
    gap: 4,
    paddingBottom: 40,
  },

  section: {
    gap: 10,
    marginTop: 16,
  },
  sectionHeader: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.bold,  // E-003: was '700'
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  // Summary
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryChip: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: fontSize.bodyLg,  // E-003: was 18
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  summaryLabel: {
    fontSize: fontSize.caption,  // E-003: was 11
    fontWeight: fontWeight.semibold,  // E-003: was '600'
    textAlign: 'center',
  },
  summarySub: {
    fontSize: fontSize.micro,  // E-003: was 10
    textAlign: 'center',
  },
  summaryNote: {
    fontSize: fontSize.caption,  // E-003: was 12
    textAlign: 'right',
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
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  syncCardSub: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    lineHeight: 22,
  },
  syncUnavailableNote: {
    fontSize: fontSize.bodySm,  // E-003: was 13
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
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  syncErrorBox: {
    borderRadius: radius.sm,
    padding: 12,
    borderWidth: 1,
  },
  syncErrorText: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 20,
  },
  androidNote: {
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
  },
  androidNoteText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
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
    fontSize: fontSize.caption,  // E-003: was 11
    fontWeight: fontWeight.semibold,
    width: 40,
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
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.medium,
  },
  sourceLabel: {
    fontSize: fontSize.caption,  // E-003: was 11
  },
  dayRowStats: {
    flexDirection: 'row',
    gap: 4,
  },
  statPill: {
    width: 40,
    alignItems: 'center',
    gap: 1,
  },
  statPillValue: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.semibold,
  },
  statPillUnit: {
    fontSize: fontSize.micro,  // E-003: was 10
  },

  // Empty / error / loading
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
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.bodySm,
  },
  retryText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
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