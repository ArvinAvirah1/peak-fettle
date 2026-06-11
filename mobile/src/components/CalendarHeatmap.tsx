/**
 * CalendarHeatmap — GitHub-style training-frequency grid (founder 2026-06-10).
 * Renders the last `weeks` ISO weeks as columns (Mon→Sun rows); a cell is
 * filled when ≥1 workout exists on that local date. Pure UI — input is the
 * set of day_keys already fetched by the host screen.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';

interface Props {
  /** YYYY-MM-DD keys of days that have at least one workout. */
  dayKeys: Iterable<string>;
  weeks?: number;
}

function toKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function CalendarHeatmap({ dayKeys, weeks = 8 }: Props): React.ReactElement {
  const { theme } = useTheme();
  const have = useMemo(() => new Set(dayKeys), [dayKeys]);

  // Build columns: oldest week → current week; rows Mon..Sun.
  const grid = useMemo(() => {
    const today = new Date();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dow = (monday.getDay() + 6) % 7; // Mon=0
    monday.setDate(monday.getDate() - dow);
    const cols: Array<Array<{ key: string; future: boolean; active: boolean }>> = [];
    for (let w = weeks - 1; w >= 0; w--) {
      const col: Array<{ key: string; future: boolean; active: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() - w * 7 + d);
        const key = toKey(day);
        col.push({ key, future: day.getTime() > today.getTime(), active: have.has(key) });
      }
      cols.push(col);
    }
    return cols;
  }, [have, weeks]);

  const activeDays = useMemo(
    () => grid.reduce((n, col) => n + col.filter((c) => c.active).length, 0),
    [grid],
  );

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>
          LAST {grid.length} WEEKS
        </Text>
        <Text style={[styles.count, { color: theme.colors.textSecondary }]}>
          {activeDays} training day{activeDays !== 1 ? 's' : ''}
        </Text>
      </View>
      <View style={styles.grid} accessibilityLabel={`Training heatmap: ${activeDays} active days in the last ${grid.length} weeks`}>
        {grid.map((col, i) => (
          <View key={i} style={styles.col}>
            {col.map((cell) => (
              <View
                key={cell.key}
                style={[
                  styles.cell,
                  {
                    backgroundColor: cell.active
                      ? theme.colors.accentDefault
                      : cell.future
                        ? 'transparent'
                        : theme.colors.bgPrimary,
                    borderColor: theme.colors.borderDefault,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s3,
  },
  kicker: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
  },
  count: {
    fontSize: fontSize.caption,
  },
  grid: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
  },
  col: {
    gap: 4,
    flex: 1,
  },
  cell: {
    aspectRatio: 1,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
