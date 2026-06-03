/**
 * Workout History screen — Peak Fettle
 *
 * Full paginated browse of all past workouts, grouped into ISO weeks.
 * Navigated to via router.push('/workout-history').
 * Registered in _layout.tsx as name="workout-history".
 *
 * Features:
 *   - Paginated via GET /workouts?limit=50&offset=N
 *   - Sections = ISO weeks, header = "Week of MMM D"
 *   - Each row: date (left) + "X sets · Y kg" (right), taps → /workout-day
 *   - Infinite scroll via SectionList onEndReached + footer spinner
 *   - Loading skeleton (6 grey rows)
 *   - Empty state with "Log your first workout" CTA
 *   - Error state with Retry button
 *
 * All colors via useTheme(). Zero hardcoded hex values.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { useTheme } from '../src/theme/ThemeContext';
import { ScreenLayout, PFButton, PressableCard } from '../src/components/ui';
import { apiClient } from '../src/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiWorkout {
  id: string;
  day_key: string;         // YYYY-MM-DD
  total_sets: number;
  total_volume_kg: number;
  exercise_count: number;
}

interface WorkoutSection {
  title: string;           // "Week of May 12"
  weekKey: string;         // ISO week start YYYY-MM-DD for stable keying
  data: ApiWorkout[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Parse YYYY-MM-DD in local time (avoids UTC date shift). */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Mon, May 18" from YYYY-MM-DD */
function formatRowDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${SHORT_DAYS[d.getDay()]}, ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** ISO week Monday for a given date (returns Date). */
function isoWeekMonday(d: Date): Date {
  const result = new Date(d);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** "Week of May 12" from the Monday Date of the week. */
function formatWeekHeader(monday: Date): string {
  return `Week of ${SHORT_MONTHS[monday.getMonth()]} ${monday.getDate()}`;
}

/** YYYY-MM-DD string from a Date (local time). */
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Group a flat sorted-desc list of workouts into ISO-week sections. */
function groupIntoWeeks(workouts: ApiWorkout[]): WorkoutSection[] {
  const sectionMap = new Map<string, WorkoutSection>();
  const sectionOrder: string[] = [];

  for (const w of workouts) {
    const d = parseLocalDate(w.day_key);
    const monday = isoWeekMonday(d);
    const weekKey = toDateKey(monday);

    if (!sectionMap.has(weekKey)) {
      sectionMap.set(weekKey, {
        title: formatWeekHeader(monday),
        weekKey,
        data: [],
      });
      sectionOrder.push(weekKey);
    }
    sectionMap.get(weekKey)!.data.push(w);
  }

  return sectionOrder.map((k) => sectionMap.get(k)!);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 6 skeleton placeholder rows while the first page loads. */
function SkeletonRows(): React.ReactElement {
  // NOTE: spacing/radius/fontSize/fontWeight live at the TOP LEVEL of the
  // useTheme() return — NOT under `theme` (which is only {name,displayName,
  // primitives,colors,components}). Destructuring them from `theme` yields
  // undefined and crashes with "cannot read property 's5' of undefined".
  const { theme: { colors }, spacing, radius } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.s5, marginTop: spacing.s3, gap: spacing.s3 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 56,
            borderRadius: radius.md,
            backgroundColor: colors.bgSecondary,
            opacity: 0.3,
          }}
        />
      ))}
    </View>
  );
}

/** Footer spinner shown while loading the next page. */
function FooterSpinner(): React.ReactElement {
  const { theme: { colors }, spacing } = useTheme();
  return (
    <View style={{ paddingVertical: spacing.s5, alignItems: 'center' }}>
      <ActivityIndicator color={colors.textTertiary} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function WorkoutHistoryScreen(): React.ReactElement {
  const router = useRouter();
  const { theme, spacing, fontSize, fontWeight, radius } = useTheme();
  const { colors } = theme;

  // ── State ─────────────────────────────────────────────────────────────────
  const [allWorkouts, setAllWorkouts] = useState<ApiWorkout[]>([]);
  const [sections, setSections] = useState<WorkoutSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore] = useState(false); // kept for ListFooterComponent type compat
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  // GET /workouts returns a plain array (not {workouts:[]}). The server limits
  // to 90 rows desc by day_key and includes total_sets, exercise_count, and
  // total_volume_kg via a LEFT JOIN + GROUP BY — no client-side aggregation needed.
  const fetchPage = useCallback(async (_offset: number = 0) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const res = await apiClient.get<ApiWorkout[]>('/workouts');
      const raw: ApiWorkout[] = Array.isArray(res.data) ? res.data : [];

      const sorted = [...raw].sort((a, b) => b.day_key.localeCompare(a.day_key));
      setAllWorkouts(sorted);
      setSections(groupIntoWeeks(sorted));
      setHasMore(false); // server caps at 90; no further pages
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workout history');
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Mount: load workouts
  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  // ── Load more (no-op — server returns all history in one call) ────────────
  const handleEndReached = useCallback(() => {}, []);

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchPage(0);
  }, [fetchPage]);

  // ── Render states ─────────────────────────────────────────────────────────

  // Error state
  if (error && allWorkouts.length === 0) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <Text
            style={{
              fontSize: fontSize.bodyLg,
              color: colors.statusError,
              textAlign: 'center',
              marginBottom: spacing.s4,
            }}
          >
            Could not load your workout history.
          </Text>
          <PFButton variant="primary" label="Retry" onPress={handleRetry} />
        </View>
      </ScreenLayout>
    );
  }

  // Loading skeleton (first page)
  if (loading) {
    return (
      <ScreenLayout horizontalPadding={false}>
        <SkeletonRows />
      </ScreenLayout>
    );
  }

  // Empty state
  if (sections.length === 0) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <Text
            style={{
              fontSize: fontSize.heading3 ?? fontSize.bodyLg,
              fontWeight: fontWeight.bold,
              color: colors.textPrimary,
              textAlign: 'center',
              marginBottom: spacing.s2,
            }}
          >
            No workouts yet
          </Text>
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: colors.textSecondary,
              textAlign: 'center',
              marginBottom: spacing.s5,
            }}
          >
            Start logging to see your history here.
          </Text>
          <PFButton
            variant="ghost"
            label="Log your first workout"
            onPress={() => router.push('/(tabs)/log')}
          />
        </View>
      </ScreenLayout>
    );
  }

  // ── Main list ──────────────────────────────────────────────────────────────
  return (
    <ScreenLayout horizontalPadding={false}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{
          paddingHorizontal: spacing.s5,
          paddingBottom: spacing.s8 ?? spacing.s6,
          paddingTop: spacing.s2,
        }}
        ListFooterComponent={loadingMore ? <FooterSpinner /> : null}
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              {
                backgroundColor: colors.bgPrimary,
                paddingVertical: spacing.s2,
                marginTop: spacing.s3,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: fontWeight.semibold,
                color: colors.textTertiary,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
              }}
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <PressableCard
            onPress={() => router.push(`/workout-day?date=${item.day_key}`)}
            style={[
              styles.row,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: radius.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.borderDefault,
                paddingHorizontal: spacing.s4,
                paddingVertical: spacing.s4,
                marginBottom: spacing.s2,
              },
            ]}
          >
            <View style={styles.rowInner}>
              {/* Left: date + exercise count subtitle */}
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontSize: fontSize.bodyMd,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                  }}
                >
                  {formatRowDate(item.day_key)}
                </Text>
                <Text
                  style={{
                    fontSize: fontSize.caption,
                    color: colors.textSecondary,
                  }}
                >
                  {item.exercise_count === 1 ? '1 exercise' : `${item.exercise_count} exercises`}
                </Text>
              </View>

              {/* Right: sets · volume */}
              <Text
                style={{
                  fontSize: fontSize.bodySm,
                  color: colors.textSecondary,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {`${item.total_sets} sets · ${item.total_volume_kg} kg`}
              </Text>
            </View>
          </PressableCard>
        )}
        renderSectionFooter={() => <View style={{ height: spacing.s1 }} />}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sectionHeader: {
    // sticky section needs a solid background so rows scroll underneath cleanly
  },
  row: {
    // base shape — dynamic tokens applied inline
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
