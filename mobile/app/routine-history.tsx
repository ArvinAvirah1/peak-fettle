/**
 * Routine History screen — Peak Fettle
 *
 * Lists every past session of a single routine (e.g. all your "Push" days),
 * opened from the BY ROUTINE folders on Home. Each row taps through to the
 * existing workout-day detail. Local-first (free reads on-device SQLite; Pro
 * reads the server workout list) via src/data/routineHistory.
 *
 * Navigated to via router.push(`/routine-history?name=<routine name>`).
 * Registered in _layout.tsx as name="routine-history".
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { ScreenLayout, PFButton, PressableCard } from '../src/components/ui';
import { getRoutineSessions, RoutineSessionRow } from '../src/data/routineHistory';
import { formatWeight, UnitSystem } from '../src/constants/units';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "Mon, May 18" from YYYY-MM-DD, parsed in local time (no UTC shift). */
function formatRowDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
  return `${SHORT_DAYS[d.getDay()]}, ${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RoutineHistoryScreen(): React.ReactElement {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const { theme: { colors }, spacing, fontSize, fontWeight, radius } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const unitPref: UnitSystem = (user?.unit_pref as UnitSystem) ?? 'kg';

  const routineName = (name ?? '').trim();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<RoutineSessionRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await getRoutineSessions(user, routineName));
    } finally {
      setLoading(false);
    }
  }, [user, routineName]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScreenLayout horizontalPadding={false}>
      <View
        style={[
          styles.heading,
          {
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s4,
            paddingBottom: spacing.s3,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.borderDefault,
          },
        ]}
      >
        <Text
          style={{
            fontSize: fontSize.heading2,
            fontWeight: fontWeight.bold,
            color: colors.textPrimary,
            letterSpacing: -0.3,
          }}
          numberOfLines={1}
        >
          {routineName || t('screens2:routineHistory.fallbackTitle')}
        </Text>
        {!loading ? (
          <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, marginTop: spacing.s1 }}>
{t('screens2:routineHistory.sessionCount', { count: sessions.length })}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.textTertiary} style={{ marginTop: spacing.s6 }} />
      ) : sessions.length === 0 ? (
        <View style={styles.centered}>
          <Text style={{ fontSize: fontSize.bodyMd, color: colors.textSecondary, textAlign: 'center' }}>
            {t('screens2:routineHistory.emptyState')}
          </Text>
          <PFButton variant="ghost" label={t('common:back')} onPress={() => router.back()} style={{ marginTop: spacing.s4 }} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.dayKey}
          contentContainerStyle={{
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s3,
            paddingBottom: spacing.s8,
          }}
          renderItem={({ item }) => (
            <PressableCard
              onPress={() => router.push(`/workout-day?date=${item.dayKey}`)}
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
                <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {formatRowDate(item.dayKey)}
                </Text>
                <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>
                  {t('screens2:routineHistory.setsAndVolume', { count: item.setCount, volume: formatWeight(item.volumeKg, unitPref, 0) })}
                </Text>
              </View>
            </PressableCard>
          )}
        />
      )}
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  heading: {},
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  row: {},
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
