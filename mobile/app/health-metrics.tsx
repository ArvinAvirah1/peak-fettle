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
function hrvColor(hrv: number | null): string {
  if (hrv === null) return '#64748b';
  if (hrv >= 50) return '#22c55e';
  if (hrv >= 30) return '#f59e0b';
  return '#ef4444';
}

function hrColor(hr: number | null): string {
  if (hr === null) return '#64748b';
  if (hr <= 60) return '#22c55e';
  if (hr <= 75) return '#f59e0b';
  return '#ef4444';
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
  return (
    <View style={styles.summaryChip}>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : undefined]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {sub ? <Text style={styles.summarySub}>{sub}</Text> : null}
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
  return (
    <View style={styles.dayRow}>
      <View style={styles.dayRowLeft}>
        <Text style={styles.dayLabel}>{formatDate(metric.date)}</Text>
        <Text style={styles.sourceLabel}>{metric.source}</Text>
      </View>
      <View style={styles.dayRowStats}>
        {metric.resting_hr_bpm !== null ? (
          <View style={styles.statPill}>
            <Text style={[styles.statPillValue, { color: hrColor(metric.resting_hr_bpm) }]}>
              {metric.resting_hr_bpm}
            </Text>
            <Text style={styles.statPillUnit}>bpm</Text>
          </View>
        ) : null}
        {metric.hrv_ms !== null ? (
          <View style={styles.statPill}>
            <Text style={[styles.statPillValue, { color: hrvColor(metric.hrv_ms) }]}>
              {metric.hrv_ms}
            </Text>
            <Text style={styles.statPillUnit}>ms</Text>
          </View>
        ) : null}
        {metric.sleep_hours !== null ? (
          <View style={styles.statPill}>
            <Text style={styles.statPillValue}>{metric.sleep_hours.toFixed(1)}</Text>
            <Text style={styles.statPillUnit}>hrs</Text>
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
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Health Metrics</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#64748b"
          />
        }
      >
        {/* ── A. 7-day summary chips ── */}
        {summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>7-DAY AVERAGE</Text>
            <View style={styles.summaryGrid}>
              <SummaryChip
                label="Resting HR"
                value={fmt(summary.avg_resting_hr_bpm, ' bpm')}
                sub="heart rate"
                valueColor={hrColor(summary.avg_resting_hr_bpm)}
              />
              <SummaryChip
                label="HRV"
                value={fmt(summary.avg_hrv_ms, ' ms')}
                sub="variability"
                valueColor={hrvColor(summary.avg_hrv_ms)}
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
            <Text style={styles.summaryNote}>
              {summary.days_logged} of {summary.window_days} days logged
            </Text>
          </View>
        ) : null}

        {/* ── B. HealthKit sync ── */}
        {Platform.OS === 'ios' ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>SYNC</Text>
            <View style={styles.syncCard}>
              <View style={styles.syncCardText}>
                <Text style={styles.syncCardTitle}>Apple HealthKit</Text>
                <Text style={styles.syncCardSub}>
                  Sync resting HR, HRV, sleep, and active calories from the Health app.
                  Used by the AI planner to adjust training intensity.
                </Text>
                {!isHealthKitAvailable ? (
                  <Text style={styles.syncUnavailableNote}>
                    ⚠ HealthKit requires a development build (EAS).
                    Tap to see the setup guide.
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
                onPress={sync}
                disabled={isSyncing}
                accessibilityRole="button"
                accessibilityLabel="Sync from HealthKit"
              >
                {isSyncing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                )}
              </TouchableOpacity>

              {syncError ? (
                <View style={styles.syncErrorBox}>
                  <Text style={styles.syncErrorText}>{syncError}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.androidNote}>
              <Text style={styles.androidNoteText}>
                HealthKit sync is available on iOS only. Garmin Connect IQ
                integration (TICKET-029) will provide health data on Android.
              </Text>
            </View>
          </View>
        )}

        {/* ── C. Daily history ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>RECENT DAYS</Text>

          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#818cf8" />
              <Text style={styles.loadingText}>Loading…</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={refetch}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : metrics.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No health data yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                {Platform.OS === 'ios'
                  ? 'Tap "Sync Now" above to import data from Apple Health.'
                  : 'Connect a wearable to start logging health metrics.'}
              </Text>
            </View>
          ) : (
            <View style={styles.dayList}>
              {/* Legend row */}
              <View style={styles.legendRow}>
                <Text style={styles.legendSpacer} />
                <View style={styles.dayRowStats}>
                  <Text style={styles.legendLabel}>HR</Text>
                  <Text style={styles.legendLabel}>HRV</Text>
                  <Text style={styles.legendLabel}>Sleep</Text>
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
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56, // account for status bar
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    minWidth: 64,
    minHeight: 44,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 17,
    color: '#818cf8',
    fontWeight: '500',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#f8fafc',
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
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
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
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  summarySub: {
    fontSize: 10,
    color: '#475569',
    textAlign: 'center',
  },
  summaryNote: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'right',
  },

  // Sync card
  syncCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    gap: 14,
  },
  syncCardText: {
    gap: 6,
  },
  syncCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  syncCardSub: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
  },
  syncUnavailableNote: {
    fontSize: 13,
    color: '#f59e0b',
    lineHeight: 20,
    marginTop: 4,
  },
  syncButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  syncButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  syncErrorBox: {
    backgroundColor: '#450a0a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  syncErrorText: {
    fontSize: 13,
    color: '#fca5a5',
    lineHeight: 20,
  },
  androidNote: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  androidNoteText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
  },

  // Day list
  dayList: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  legendSpacer: {
    flex: 1,
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 52,
    textAlign: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    minHeight: 60,
  },
  dayRowLeft: {
    flex: 1,
    gap: 3,
  },
  dayLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f8fafc',
  },
  sourceLabel: {
    fontSize: 12,
    color: '#475569',
    textTransform: 'capitalize',
  },
  dayRowStats: {
    flexDirection: 'row',
    gap: 6,
  },
  statPill: {
    width: 52,
    alignItems: 'center',
    gap: 2,
  },
  statPillValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
  },
  statPillUnit: {
    fontSize: 10,
    color: '#64748b',
  },

  // Empty / error
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  errorBanner: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f8fafc',
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },

  bottomPad: { height: 32 },
});
