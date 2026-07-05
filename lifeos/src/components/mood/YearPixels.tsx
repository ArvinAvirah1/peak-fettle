/**
 * YearPixels.tsx — year-in-pixels mood grid (TICKET-159).
 *
 * View-based (no react-native-svg, no new deps): a vertical list of week
 * rows, most-recent week at the TOP, 7 flex-1 square cells per row. Week
 * starts Monday (mirrors weekStart()/addDays() from engine/streaks.ts).
 *
 * Color is never the only signal:
 *   - a legend row below the grid spells out what each opacity level means
 *     (Heavy/Low/Okay/Good/Great), matching the labels used in mood-checkin.
 *   - every cell WITH data is a real Pressable with an accessibilityLabel
 *     describing the date, the mood word, and the check-in count.
 *   - cells with NO data are non-interactive decorative Views (nothing to
 *     announce), and future days are fully invisible.
 *
 * Token-only styling — no raw hex. Plain Views, no per-cell animation, and
 * the weeks array is memoized so re-renders stay cheap even at 52 weeks.
 */

import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, hairline, radius, spacing } from '../../theme/tokens';
import { haptic } from '../../lib/haptics';
import { addDays, weekStart } from '../../engine/streaks';

const MOOD_WORDS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface DayCell {
  date: string;
  isFuture: boolean;
  monthLabel: string | null;
}

type WeekRow = DayCell[];

function moodBucket(avg: number): 1 | 2 | 3 | 4 | 5 {
  const rounded = Math.round(avg);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as 1 | 2 | 3 | 4 | 5;
}

const OPACITY_BY_MOOD: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0.25,
  2: 0.45,
  3: 0.65,
  4: 0.85,
  5: 1.0,
};

function formatDayLabel(date: string): string {
  // date is 'YYYY-MM-DD'; noon avoids UTC/local day-shift.
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export interface YearPixelsProps {
  data: Map<string, { avg: number; count: number }>;
  endDay: string;
  weeks?: number;
  onDayPress?: (date: string) => void;
  selectedDay?: string | null;
}

export function YearPixels({
  data,
  endDay,
  weeks = 52,
  onDayPress,
  selectedDay = null,
}: YearPixelsProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  // Build `weeks` rows, each Monday..Sunday, most recent week first.
  const rows: WeekRow[] = useMemo(() => {
    const endWeekMonday = weekStart(endDay);
    const seenMonth = new Set<string>();
    const result: WeekRow[] = [];

    for (let w = 0; w < weeks; w++) {
      const monday = addDays(endWeekMonday, -7 * w);
      const week: WeekRow = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(monday, i);
        const isFuture = date > endDay;
        const d = new Date(`${date}T12:00:00`);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        let monthLabel: string | null = null;
        // Label the first (leftmost, i.e. earliest-in-row) day of a month
        // we haven't labeled yet, scanning from oldest week to newest so
        // the label lands on the month's actual first appearance.
        if (!seenMonth.has(monthKey)) {
          monthLabel = MONTH_NAMES[d.getMonth()];
        }
        week.push({ date, isFuture, monthLabel });
      }
      result.push(week);
    }

    // We built newest-week-first but need to scan oldest-first to assign
    // "first row of month" labels correctly, then reverse the label pass.
    const chronological = [...result].reverse();
    const seen = new Set<string>();
    for (const week of chronological) {
      for (const day of week) {
        const d = new Date(`${day.date}T12:00:00`);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        if (!seen.has(monthKey)) {
          seen.add(monthKey);
          day.monthLabel = MONTH_NAMES[d.getMonth()];
        } else {
          day.monthLabel = null;
        }
      }
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDay, weeks]);

  const legendItems: { mood: 1 | 2 | 3 | 4 | 5; label: string }[] = [
    { mood: 1, label: 'Heavy' },
    { mood: 2, label: 'Low' },
    { mood: 3, label: 'Okay' },
    { mood: 4, label: 'Good' },
    { mood: 5, label: 'Great' },
  ];

  return (
    <View>
      {/* Weekday header row */}
      <View style={{ flexDirection: 'row', marginBottom: spacing.s1 }}>
        {WEEKDAY_LETTERS.map((letter, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.caption,
              }}
            >
              {letter}
            </Text>
          </View>
        ))}
      </View>

      {rows.map((week, rowIndex) => {
        const monthCaption = week.find((d) => d.monthLabel)?.monthLabel ?? null;
        return (
          <View key={rowIndex}>
            {monthCaption ? (
              <Text
                style={{
                  color: c.textTertiary,
                  fontFamily: fontFamily.medium,
                  fontSize: fontSize.caption,
                  marginTop: rowIndex === 0 ? 0 : spacing.s2,
                  marginBottom: spacing.s1,
                }}
              >
                {monthCaption}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row' }}>
              {week.map((day) => {
                if (day.isFuture) {
                  return (
                    <View
                      key={day.date}
                      style={{
                        flex: 1,
                        aspectRatio: 1,
                        margin: 1.5,
                        opacity: 0,
                      }}
                    />
                  );
                }

                const entry = data.get(day.date);
                const isSelected = selectedDay === day.date;

                if (!entry) {
                  return (
                    <View
                      key={day.date}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                      style={{
                        flex: 1,
                        aspectRatio: 1,
                        margin: 1.5,
                        borderRadius: radius.sm,
                        backgroundColor: 'transparent',
                        borderWidth: hairline,
                        borderColor: c.borderDefault,
                      }}
                    />
                  );
                }

                const bucket = moodBucket(entry.avg);
                const label = `${formatDayLabel(day.date)}, average ${MOOD_WORDS[bucket]}, ${entry.count} check-in${entry.count === 1 ? '' : 's'}`;

                return (
                  <Pressable
                    key={day.date}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      haptic.selection();
                      onDayPress?.(day.date);
                    }}
                    style={({ pressed }) => ({
                      flex: 1,
                      aspectRatio: 1,
                      margin: 1.5,
                      borderRadius: radius.sm,
                      backgroundColor: c.accentDefault,
                      opacity: pressed ? OPACITY_BY_MOOD[bucket] * 0.7 : OPACITY_BY_MOOD[bucket],
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: c.accentDefault,
                    })}
                  />
                );
              })}
            </View>
          </View>
        );
      })}

      {/* Legend — color is never the only signal */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          marginTop: spacing.s4,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {legendItems.map((item) => (
          <View
            key={item.mood}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginRight: spacing.s3,
              marginBottom: spacing.s1,
            }}
          >
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: radius.sm,
                backgroundColor: c.accentDefault,
                opacity: OPACITY_BY_MOOD[item.mood],
                marginRight: spacing.s1,
              }}
            />
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.caption,
              }}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
