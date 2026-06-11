/**
 * Trends hub screen — Peak Fettle
 *
 * Pushed screen (not a tab) listing all exercises the user has logged.
 * Tapping an exercise row shows its LiftProgressChart inline.
 * Supports deep-link params ?exerciseId=&exerciseName= to open a specific
 * exercise's chart directly on mount.
 *
 * Data source: useWorkoutHistory() — derives distinct {exercise_id, name}
 * pairs from lift sets across the 30-day window.
 *
 * Route:  /trends
 *         /trends?exerciseId=<id>&exerciseName=<name>
 *
 * All colors via useTheme() — TOP-LEVEL spacing/fontSize/radius (never
 * theme.spacing which is undefined). Follows workout-history.tsx patterns.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { ScreenLayout } from '../src/components/ui';
import { useWorkoutHistory } from '../src/hooks/useWorkoutHistory';
import LiftProgressChart from '../src/components/LiftProgressChart';
import { useRouter } from 'expo-router';
import { useBodyweight } from '../src/hooks/useBodyweight';
import { BodyweightChart } from '../src/components/BodyweightChart';
import { BodyweightPromptCard } from '../src/components/BodyweightPromptCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LiftEntry {
  exerciseId: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface LiftRowProps {
  entry: LiftEntry;
  isSelected: boolean;
  onPress: (entry: LiftEntry) => void;
}

function LiftRow({ entry, isSelected, onPress }: LiftRowProps): React.ReactElement {
  const { theme, spacing, fontSize, fontWeight, radius } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityLabel={`View progress for ${entry.name}`}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: isSelected ? colors.accentDefault + '1A' : colors.bgSecondary,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isSelected ? colors.accentDefault : colors.borderDefault,
          paddingHorizontal: spacing.s4,
          paddingVertical: spacing.s4,
          marginBottom: spacing.s2,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <View style={styles.rowInner}>
        <Text
          style={{
            flex: 1,
            fontSize: fontSize.bodyMd,
            fontWeight: isSelected ? fontWeight.semibold : fontWeight.regular,
            color: isSelected ? colors.accentDefault : colors.textPrimary,
          }}
          numberOfLines={1}
        >
          {entry.name}
        </Text>
        <Text style={{ fontSize: fontSize.caption, color: colors.textTertiary }}>
          {isSelected ? 'Viewing ▾' : '›'}
        </Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TrendsScreen(): React.ReactElement {
  const { theme, spacing, fontSize, fontWeight, radius } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();
  const unitPref = (user?.unit_pref as 'kg' | 'lbs') ?? 'kg';

  // Deep-link params
  const params = useLocalSearchParams<{ exerciseId?: string; exerciseName?: string }>();

  const { history, exerciseNames, isLoading, error } = useWorkoutHistory();

  // Derive distinct exercises from lift sets in history
  const liftEntries = useMemo<LiftEntry[]>(() => {
    const seen = new Set<string>();
    const entries: LiftEntry[] = [];
    for (const entry of history) {
      for (const s of entry.sets) {
        if (s.kind === 'lift') {
          const ls = s as { exercise_id?: string; kind: string };
          const id = ls.exercise_id;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          // TICKET-091: resolve the name from the exercise_id → name map. The
          // previous `liftNames.find` predicate ignored its arguments and always
          // returned liftNames[0], so every distinct lift was labelled as the
          // first lift of the day (everything showed as "Hack Squat").
          const name = exerciseNames.get(id) ?? id;
          entries.push({ exerciseId: id, name });
        }
      }
    }
    return entries;
  }, [history, exerciseNames]);

  // Build a stable name map from liftEntries for lookup
  const nameById = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const e of liftEntries) m.set(e.exerciseId, e.name);
    return m;
  }, [liftEntries]);

  // Selected exercise (from deep-link or tap)
  const [selectedId, setSelectedId] = useState<string | null>(
    params.exerciseId ?? null
  );

  const selectedName = selectedId
    ? (nameById.get(selectedId) ?? params.exerciseName ?? selectedId)
    : null;

  function handleRowPress(entry: LiftEntry): void {
    setSelectedId((prev) => (prev === entry.exerciseId ? null : entry.exerciseId));
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accentDefault} />
        </View>
      </ScreenLayout>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: colors.statusError,
              textAlign: 'center',
            }}
          >
            {error}
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────

  if (liftEntries.length === 0) {
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
            No lifts logged yet
          </Text>
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: colors.textSecondary,
              textAlign: 'center',
            }}
          >
            Start logging workouts to see your progress trends here.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  return (
    <ScreenLayout horizontalPadding={false}>
      <FlatList
        data={liftEntries}
        keyExtractor={(item) => item.exerciseId}
        contentContainerStyle={{
          paddingHorizontal: spacing.s5,
          paddingTop: spacing.s3,
          paddingBottom: spacing.s8 ?? spacing.s6,
        }}
        ListHeaderComponent={<TrendsHeader unitPref={unitPref} />}
        renderItem={({ item }) => (
          <View>
            <LiftRow
              entry={item}
              isSelected={selectedId === item.exerciseId}
              onPress={handleRowPress}
            />
            {selectedId === item.exerciseId && selectedName ? (
              <View
                style={{
                  marginBottom: spacing.s3,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.borderDefault,
                }}
              >
                <LiftProgressChart
                  exerciseId={item.exerciseId}
                  exerciseName={selectedName}
                  unitPref={unitPref}
                />
              </View>
            ) : null}
          </View>
        )}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// TrendsHeader — weekly bodyweight prompt + bodyweight trend + 1RM calc link
// (founder 2026-06-10). Rendered as the FlatList header so it scrolls.
// ---------------------------------------------------------------------------

function TrendsHeader({ unitPref }: { unitPref: 'kg' | 'lbs' }): React.ReactElement {
  const { theme, spacing, fontSize, fontWeight, radius } = useTheme();
  const router = useRouter();
  const { history } = useBodyweight();
  return (
    <View>
      <BodyweightPromptCard unitPref={unitPref} />
      {history.length > 0 ? <BodyweightChart history={history} unitPref={unitPref} /> : null}
      <Pressable
        onPress={() => router.push('/one-rm' as Parameters<typeof router.push>[0])}
        accessibilityRole="button"
        accessibilityLabel="Open the 1RM calculator"
        style={{
          borderWidth: 1,
          borderColor: theme.colors.borderDefault,
          backgroundColor: theme.colors.bgSecondary,
          borderRadius: radius.md,
          paddingVertical: spacing.s3,
          paddingHorizontal: spacing.s4,
          marginBottom: spacing.s4,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: theme.colors.textPrimary, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold }}>
          1RM calculator
        </Text>
        <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm }}>›</Text>
      </Pressable>
      <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.micro, fontWeight: fontWeight.semibold, letterSpacing: 1.2, marginBottom: spacing.s2 }}>
        LIFT PROGRESS
      </Text>
    </View>
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
  row: {
    // dynamic tokens applied inline
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
