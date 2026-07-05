/**
 * Heatmap (T155) — pure View-based 365-day GitHub-style activity grid.
 * No SVG, no new deps: 53 columns × 7 rows (Monday-first), each cell a small
 * rounded View colored from tokens. Purely derived from day-key string math
 * (addDays/weekStart) — never touches clock APIs beyond the caller-supplied
 * `endDay`.
 */

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, radius, spacing } from '../../theme/tokens';
import { addDays, isPausedOn, LogStatus, PauseRange, weekStart } from '../../engine/streaks';

export interface HeatmapProps {
  logs: Map<string, LogStatus>;
  endDay: string;
  pauses?: PauseRange[];
}

const CELL_SIZE = 5;
const CELL_GAP = 1.5;
const COLUMNS = 53;
const ROWS = 7;

// Static month-name table — never derived from a locale/clock API.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type CellKind = 'done' | 'rest' | 'skip' | 'paused-unlogged' | 'unlogged';

interface GridCell {
  day: string;
  kind: CellKind;
  monthIndex: number; // 0-11, from the day-key string
  dayOfMonth: number;
}

interface ColumnMonthLabel {
  col: number;
  label: string;
}

function classify(day: string, logs: Map<string, LogStatus>, pauses: PauseRange[]): CellKind {
  const status = logs.get(day);
  if (status === 'done') return 'done';
  if (status === 'rest') return 'rest';
  if (status === 'skip') return 'skip';
  if (isPausedOn(day, pauses)) return 'paused-unlogged';
  return 'unlogged';
}

export function Heatmap({ logs, endDay, pauses = [] }: HeatmapProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  const { columns, monthLabels, activeCount } = useMemo(() => {
    // Grid spans COLUMNS*ROWS-1 days back from the Monday-of-week containing
    // endDay, so the grid always ends on a full week and endDay's week is
    // the last (rightmost) column.
    const gridEndWeekStart = weekStart(endDay);
    const totalDays = COLUMNS * ROWS;
    const gridStartWeekStart = addDays(gridEndWeekStart, -(COLUMNS - 1) * 7);

    const cols: GridCell[][] = [];
    let active = 0;
    const monthAtCol: (number | null)[] = [];

    for (let col = 0; col < COLUMNS; col++) {
      const colStart = addDays(gridStartWeekStart, col * 7);
      const cells: GridCell[] = [];
      let firstDayOfMonthInCol: number | null = null;

      for (let row = 0; row < ROWS; row++) {
        const day = addDays(colStart, row);
        const kind = classify(day, logs, pauses);
        if (kind === 'done' || kind === 'rest') active += 1;
        const [, mStr, dStr] = day.split('-');
        const monthIndex = Number(mStr) - 1;
        const dayOfMonth = Number(dStr);
        if (dayOfMonth <= 7 && firstDayOfMonthInCol === null) {
          firstDayOfMonthInCol = monthIndex;
        }
        cells.push({ day, kind, monthIndex, dayOfMonth });
      }
      cols.push(cells);
      monthAtCol.push(firstDayOfMonthInCol);
    }

    // Build month labels: place a label at the first column where a new
    // month's first-week appears, avoiding duplicates/overcrowding.
    const labels: ColumnMonthLabel[] = [];
    let lastMonth: number | null = null;
    for (let col = 0; col < COLUMNS; col++) {
      const m = monthAtCol[col];
      if (m !== null && m !== lastMonth) {
        labels.push({ col, label: MONTH_NAMES[m] });
        lastMonth = m;
      }
    }

    void totalDays;
    return { columns: cols, monthLabels: labels, activeCount: active };
  }, [logs, endDay, pauses]);

  const colWidth = CELL_SIZE + CELL_GAP;
  const gridWidth = COLUMNS * colWidth;

  const cellColor = (kind: CellKind): string => {
    switch (kind) {
      case 'done':
        return c.accentDefault;
      case 'rest':
        return c.accentMuted;
      case 'skip':
        return c.borderDefault;
      case 'paused-unlogged':
        return c.textTertiary;
      case 'unlogged':
      default:
        return c.bgElevated;
    }
  };

  const cellOpacity = (kind: CellKind): number => (kind === 'paused-unlogged' ? 0.25 : 1);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Activity heatmap: ${activeCount} active days in the last year`}
    >
      {/* Month strip */}
      <View style={{ width: gridWidth, height: 14, marginBottom: spacing.s1 }}>
        {monthLabels.map(({ col, label }) => (
          <Text
            key={`${col}-${label}`}
            style={{
              position: 'absolute',
              left: col * colWidth,
              color: c.textTertiary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.caption,
            }}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={{ flexDirection: 'row', width: gridWidth }}>
        {columns.map((cells, col) => (
          <View key={col} style={{ marginRight: CELL_GAP }}>
            {cells.map((cell) => (
              <View
                key={cell.day}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  borderRadius: 1.5,
                  backgroundColor: cellColor(cell.kind),
                  opacity: cellOpacity(cell.kind),
                  marginBottom: CELL_GAP,
                }}
              />
            ))}
          </View>
        ))}
      </View>

      {/* Legend — color is never the only signal, so every swatch has a text label. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.s3 }}>
        <LegendSwatch color={c.accentDefault} label="Done" />
        <LegendSwatch color={c.accentMuted} label="Rest" />
        <LegendSwatch color={c.borderDefault} label="Skipped" />
        <LegendSwatch color={c.bgElevated} label="No entry" bordered />
      </View>
    </View>
  );
}

function LegendSwatch({
  color,
  label,
  bordered,
}: {
  color: string;
  label: string;
  bordered?: boolean;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: spacing.s4, marginBottom: spacing.s1 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: radius.sm / 2,
          backgroundColor: color,
          borderWidth: bordered ? 1 : 0,
          borderColor: c.borderDefault,
          marginRight: spacing.s1,
        }}
      />
      <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>
        {label}
      </Text>
    </View>
  );
}
