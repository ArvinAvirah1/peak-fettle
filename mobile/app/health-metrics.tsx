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
import { DailyHealthMetric, CardioSessionMetric } from '../src/api/healthMetrics';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout } from '../src/components/ui';
import { useAuth } from '../src/hooks/useAuth';

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

// ── Cardio formatting (P5) ──────────────────────────────────────────────────

/** Seconds → "m:ss" (e.g. 1350 → "22:30"). Long efforts roll into minutes. */
function formatDuration(sec: number | null): string {
  if (sec == null || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Metres → distance string in the user's unit (km or mi), 2 dp. */
function formatDistance(distanceM: number | null, unitPref: 'kg' | 'lbs'): string | null {
  if (distanceM == null || distanceM <= 0) return null;
  if (unitPref === 'lbs') return `${(distanceM / 1609.344).toFixed(2)} mi`;
  return `${(distanceM / 1000).toFixed(2)} km`;
}

/** Seconds-per-km → "m:ss /km" (or "/mi" for lbs users, converting the rate). */
function formatPace(paceSecPerKm: number | null, unitPref: 'kg' | 'lbs'): string | null {
  if (paceSecPerKm == null || paceSecPerKm <= 0) return null;
  const perUnit = unitPref === 'lbs' ? paceSecPerKm * 1.609344 : paceSecPerKm;
  const m = Math.floor(perUnit / 60);
  const s = Math.round(perUnit % 60);
  return `${m}:${String(s).padStart(2, '0')} /${unitPref === 'lbs' ? 'mi' : 'km'}`;
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
// Cardio row (P5)
// ---------------------------------------------------------------------------

interface CardioRowProps {
  session: CardioSessionMetric;
  unitPref: 'kg' | 'lbs';
}

function CardioRow({ session, unitPref }: CardioRowProps): React.ReactElement {
  const { theme } = useTheme();
  const m = session.metrics;

  // Primary line: duration · distance · pace (only the parts that exist).
  const dist = formatDistance(session.distance_m, unitPref);
  const pace = formatPace(session.avg_pace_sec_per_km, unitPref);
  const primaryParts = [formatDuration(session.duration_sec), dist, pace].filter(Boolean) as string[];

  // Metric pills: each rendered only when the underlying value is present, so a
  // session logged without "More metrics" shows just the primary line.
  const pills: { label: string; value: string }[] = [];
  if (m?.hrAvgBpm != null) pills.push({ label: 'avg HR', value: `${m.hrAvgBpm}` });
  if (m?.hrMaxBpm != null) pills.push({ label: 'max HR', value: `${m.hrMaxBpm}` });
  if (m?.calories != null) pills.push({ label: 'kcal', value: `${m.calories}` });
  if (m?.cadenceSpm != null) pills.push({ label: 'spm', value: `${m.cadenceSpm}` });
  if (m?.elevationGainM != null) pills.push({ label: 'elev', value: `${Math.round(m.elevationGainM)} m` });
  if (m?.rpe != null) pills.push({ label: 'RPE', value: `${m.rpe}` });
  if (m?.splits && m.splits.length > 0) {
    pills.push({ label: 'splits', value: `${m.splits.length}` });
  }

  return (
    <View style={[styles.cardioRow, { borderBottomColor: theme.colors.borderDefault }]}>
      <View style={styles.cardioRowHeader}>
        <Text style={[styles.cardioName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {session.exercise_name}
        </Text>
        <Text style={[styles.cardioDate, { color: theme.colors.textTertiary }]}>
          {session.day_key ? formatDate(session.day_key) : ''}
        </Text>
      </View>
      <Text style={[styles.cardioPrimary, { color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] }]}>
        {primaryParts.length > 0 ? primaryParts.join('  ·  ') : '—'}
      </Text>
      {pills.length > 0 ? (
        <View style={styles.cardioPills}>
          {pills.map((p) => (
            <View
              key={p.label}
              style={[styles.cardioPill, { backgroundColor: theme.colors.bgPrimary, borderColor: theme.colors.borderDefault }]}
            >
              <Text style={[styles.cardioPillValue, { color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] }]}>
                {p.value}
              </Text>
              <Text style={[styles.cardioPillLabel, { color: theme.colors.textTertiary }]}>{p.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HealthMetricsScreen(): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const { user } = useAuth();
  const unitPref: 'kg' | 'lbs' = user?.unit_pref === 'lbs' ? 'lbs' : 'kg';
  const {
    metrics,
    summary,
    cardioSessions,
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

        {/* ── D. Recent cardio sessions (P5) ──
            On-device read (sets + cardioMetrics) for ALL tiers — local-first,
            no REST. Rendered only when at least one cardio set has been logged,
            so it stays out of the way for lift-only users. */}
        {cardioSessions.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>RECENT CARDIO</Text>
            <View style={[
              styles.dayList,
              { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
            ]}>
              {cardioSessions.map((s) => (
                <CardioRow key={s.id} session={s} unitPref={unitPref} />
              ))}
            </View>
          </View>
        ) : null}

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

  // Cardio session rows (P5)
  cardioRow: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    gap: 4,
  },
  cardioRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  cardioName: {
    flex: 1,
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
  },
  cardioDate: {
    fontSize: fontSize.caption,
  },
  cardioPrimary: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
  cardioPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  cardioPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  cardioPillValue: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  cardioPillLabel: {
    fontSize: fontSize.micro,
  },

  bottomPad: { height: 40 },
});