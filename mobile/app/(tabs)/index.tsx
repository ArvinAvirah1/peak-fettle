/**
 * Home tab — greeting, streak badge, today's workout card, recent history.
 *
 * Implements TICKET-018.
 *
 * PR detection is client-side / approximate (30-day window only).
 * TODO: replace with GET /prs once backend endpoint ships
 *
 * TICKET-027: PowerSync sync indicator shown in the greeting header.
 * Initial sync is triggered automatically by PowerSyncProvider in _layout.tsx
 * once the JWT is available — no extra call needed here.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useWorkout } from '../../src/hooks/useWorkout';
import { useWorkoutHistory } from '../../src/hooks/useWorkoutHistory';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { formatWeight } from '../../src/constants/units';
import { formatDayLabel, toDateKey } from '../../src/utils/dateHelpers';
import { LiftSet } from '../../src/types/api';

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

function SectionHeader({ label }: { label: string }): React.ReactElement {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

function StreakBadge({ streak }: { streak: number }): React.ReactElement {
  if (streak === 0) {
    return (
      <View style={styles.streakBadge}>
        <Text style={styles.streakEmoji}>🔥</Text>
        <Text style={styles.streakZeroText}>Start your streak today</Text>
      </View>
    );
  }
  return (
    <View style={styles.streakBadge}>
      <Text style={styles.streakEmoji}>🔥</Text>
      <Text style={styles.streakCount}>{streak}</Text>
      <Text style={styles.streakLabel}> week streak</Text>
    </View>
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

  const handleLogPress = (): void => {
    router.push('/(tabs)/log');
  };

  return (
    <View style={styles.todayCard}>
      {isLoading ? (
        <ActivityIndicator color="#94a3b8" />
      ) : setCount === 0 ? (
        <>
          <Text style={styles.todayEmpty}>No sets logged yet — tap to start</Text>
          <TouchableOpacity style={styles.ctaButton} onPress={handleLogPress} activeOpacity={0.75}>
            <Text style={styles.ctaButtonText}>Log a set →</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.todayStats}>
            <View style={styles.todayStat}>
              <Text style={styles.todayStatValue}>{setCount}</Text>
              <Text style={styles.todayStatLabel}>sets logged</Text>
            </View>
            <View style={styles.todayDivider} />
            <View style={styles.todayStat}>
              <Text style={styles.todayStatValue}>{volumeDisplay}</Text>
              <Text style={styles.todayStatLabel}>total volume</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.ctaButton} onPress={handleLogPress} activeOpacity={0.75}>
            <Text style={styles.ctaButtonText}>Log a set →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
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

  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#64748b"
        />
      }
    >
      {/* ── A. Greeting header ── */}
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <Text style={styles.greeting}>{getGreeting(user?.display_name ?? null)}</Text>
          <SyncStatusIndicator />
        </View>
        <Text style={styles.dateLabel}>{getFullDateLabel()}</Text>
      </View>

      {/* ── B. Streak badge ── */}
      <SectionHeader label="STREAK" />
      {historyLoading ? (
        <View style={styles.streakBadge}>
          <ActivityIndicator color="#94a3b8" />
        </View>
      ) : (
        <StreakBadge streak={streak} />
      )}

      {/* ── C. Today's workout card ── */}
      <SectionHeader label="TODAY" />
      <TodayCard
        setCount={todaySets.length}
        volumeDisplay={todayVolumeDisplay}
        isLoading={todayLoading}
      />

      {/* ── D. Groups nav row ── */}
      <SectionHeader label="GROUPS" />
      <TouchableOpacity
        style={styles.groupsNavRow}
        onPress={() => router.push('/groups')}
        activeOpacity={0.75}
      >
        <Text style={styles.groupsNavEmoji}>👥</Text>
        <View style={styles.groupsNavText}>
          <Text style={styles.groupsNavTitle}>Streak Credits</Text>
          <Text style={styles.groupsNavSub}>Train together, earn together</Text>
        </View>
        <Text style={styles.groupsNavChevron}>›</Text>
      </TouchableOpacity>

      {/* ── E. Recent history ── */}
      <SectionHeader label="RECENT ACTIVITY" />
      {historyLoading ? (
        <ActivityIndicator color="#64748b" style={styles.historyLoader} />
      ) : recentDays.length === 0 ? (
        <Text style={styles.emptyHistory}>No workouts in the last 7 days</Text>
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

            return (
              <TouchableOpacity
                key={workout.id}
                style={styles.historyRow}
                activeOpacity={0.7}
                onPress={() => {
                  // TODO: navigate to day detail
                }}
              >
                <View style={styles.historyLeft}>
                  <View style={styles.historyDayRow}>
                    <Text style={[styles.historyDayLabel, isToday && styles.historyDayToday]}>
                      {formatDayLabel(workout.day_key)}
                    </Text>
                    {hasPR && (
                      <View style={styles.prBadge}>
                        <Text style={styles.prBadgeText}>🏆 PR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.historyLifts} numberOfLines={1}>
                    {displayNames || 'No lifts recorded'}
                  </Text>
                </View>
                <View style={styles.historyRight}>
                  <Text style={styles.historySetCount}>{sets.length}</Text>
                  <Text style={styles.historySetLabel}>sets</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
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
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 8,
  },

  // Header
  headerSection: {
    marginBottom: 20,
    gap: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.3,
  },
  dateLabel: {
    fontSize: 14,
    color: '#64748b',
  },

  // Section headers
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 6,
  },

  // Streak badge
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 52,
    gap: 6,
  },
  streakEmoji: {
    fontSize: 22,
  },
  streakCount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#c7d2fe',
  },
  streakZeroText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#c7d2fe',
  },

  // Today card
  todayCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 20,
    gap: 16,
    minHeight: 52,
  },
  todayStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  todayStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  todayStatValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
  },
  todayStatLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  todayDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#334155',
  },
  todayEmpty: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },

  // CTA button
  ctaButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 44,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },

  // History
  historyLoader: {
    marginTop: 20,
  },
  emptyHistory: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
  },
  historyList: {
    gap: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 64,
  },
  historyLeft: {
    flex: 1,
    gap: 4,
  },
  historyDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyDayLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
  },
  historyDayToday: {
    color: '#818cf8',
  },
  historyLifts: {
    fontSize: 13,
    color: '#64748b',
  },
  historyRight: {
    alignItems: 'center',
    gap: 2,
    minWidth: 48,
  },
  historySetCount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  historySetLabel: {
    fontSize: 11,
    color: '#64748b',
  },

  // Groups nav row
  groupsNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  groupsNavEmoji: { fontSize: 24 },
  groupsNavText: { flex: 1 },
  groupsNavTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  groupsNavSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  groupsNavChevron: {
    fontSize: 22,
    color: '#475569',
  },

  // PR badge
  prBadge: {
    backgroundColor: '#f59e0b',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  prBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1c1917',
  },
});
