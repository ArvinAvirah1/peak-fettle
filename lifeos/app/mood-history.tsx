/**
 * mood-history.tsx — "Your year" (TICKET-159): year-in-pixels mood grid,
 * per-day detail (schema v3 allows multiple check-ins per day), and the
 * soft correlation insights (mood × habit-consistency, mood × tags).
 *
 * Not registered in app/_layout.tsx's <Stack> — expo-router auto-registers
 * this file as a route from its filename, and the header title is set
 * inline below via <Stack.Screen options={...}> as the first child.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, EmptyState, ScreenLayout, SectionTitle } from '../src/components/ui';
import { FadeSlideIn } from '../src/components/motion';
import { YearPixels } from '../src/components/mood/YearPixels';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { dayKey } from '../src/db/localDb';
import {
  checkinsOnDay,
  CheckinRow,
  CorrelationInsight,
  DayMood,
  moodHabitCorrelation,
  moodYear,
  tagCorrelations,
} from '../src/data/insights';
import { TAG_LABELS, MoodTag } from '../src/data/mood';

const MOOD_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Heavy',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

function moodLabelFor(mood: number): string {
  const rounded = Math.max(1, Math.min(5, Math.round(mood))) as 1 | 2 | 3 | 4 | 5;
  return MOOD_LABELS[rounded];
}

function formatTime(ts: string): string {
  // ts is an ISO string; render local HH:MM.
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '--:--';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDayHeading(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function parseTags(tagsJson: string): MoodTag[] {
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is MoodTag => typeof t === 'string' && t in TAG_LABELS);
    }
  } catch {
    // fall through
  }
  return [];
}

export default function MoodHistoryScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [yearData, setYearData] = useState<Map<string, { avg: number; count: number }>>(new Map());
  const [habitCorrelation, setHabitCorrelation] = useState<CorrelationInsight | null>(null);
  const [tagInsights, setTagInsights] = useState<CorrelationInsight[]>([]);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<CheckinRow[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const load = useCallback(async () => {
    const [year, habitCorr, tagCorr] = await Promise.all([
      moodYear(366, dayKey()),
      moodHabitCorrelation(),
      tagCorrelations(),
    ]);
    const map = new Map<string, { avg: number; count: number }>();
    for (const row of year as DayMood[]) {
      map.set(row.date, { avg: row.avg, count: row.count });
    }
    setYearData(map);
    setHabitCorrelation(habitCorr);
    setTagInsights(tagCorr);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const selectDay = useCallback((date: string) => {
    setSelectedDay(date);
    setDayLoading(true);
    void checkinsOnDay(date).then((rows) => {
      setDayEntries(rows);
      setDayLoading(false);
    });
  }, []);

  const hasAnyCheckins = yearData.size > 0;
  const patterns: CorrelationInsight[] = [...(habitCorrelation ? [habitCorrelation] : []), ...tagInsights];

  return (
    <ScreenLayout>
      <Stack.Screen options={{ title: 'Mood history' }} />

      {loading ? (
        <View style={{ paddingVertical: spacing.s12, alignItems: 'center' }}>
          <ActivityIndicator color={c.accentDefault} />
        </View>
      ) : !hasAnyCheckins ? (
        <EmptyState
          icon="pulse-outline"
          illustration="mood"
          title="No check-ins yet"
          body="Your year fills in one check-in at a time. Two taps, whenever you like."
          cta="Check in now"
          onPress={() => router.push('/mood-checkin')}
        />
      ) : (
        <>
          <SectionTitle top={spacing.s3}>Your year</SectionTitle>
          <YearPixels
            data={yearData}
            endDay={dayKey()}
            onDayPress={selectDay}
            selectedDay={selectedDay}
          />

          {selectedDay ? (
            <Card style={{ marginTop: spacing.s4 }}>
              <Text
                style={{
                  color: c.textPrimary,
                  fontFamily: fontFamily.semibold,
                  fontSize: fontSize.bodyLg,
                  marginBottom: spacing.s2,
                }}
              >
                {formatDayHeading(selectedDay)}
              </Text>

              {dayLoading ? (
                <ActivityIndicator color={c.accentDefault} />
              ) : dayEntries.length === 0 ? (
                <Text
                  style={{
                    color: c.textSecondary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.bodySm,
                  }}
                >
                  No check-ins logged this day.
                </Text>
              ) : (
                dayEntries.map((entry, index) => {
                  const tags = parseTags(entry.tags_json);
                  return (
                    <FadeSlideIn key={entry.id} index={index}>
                      <View
                        style={{
                          minHeight: 44,
                          paddingVertical: spacing.s2,
                          borderTopWidth: index === 0 ? 0 : 1,
                          borderTopColor: c.borderDefault,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text
                            style={{
                              color: c.textSecondary,
                              fontFamily: fontFamily.medium,
                              fontSize: fontSize.bodySm,
                              fontVariant: ['tabular-nums'],
                            }}
                          >
                            {formatTime(entry.ts)}
                          </Text>
                          <Text
                            style={{
                              color: c.textPrimary,
                              fontFamily: fontFamily.semibold,
                              fontSize: fontSize.bodyMd,
                            }}
                          >
                            {moodLabelFor(entry.mood)}
                          </Text>
                        </View>

                        {tags.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.s1 }}>
                            {tags.map((t) => (
                              <View
                                key={t}
                                style={{
                                  paddingHorizontal: spacing.s2,
                                  paddingVertical: 2,
                                  borderRadius: 999,
                                  borderWidth: 1,
                                  borderColor: c.borderDefault,
                                  marginRight: spacing.s1,
                                  marginTop: spacing.s1,
                                }}
                              >
                                <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>
                                  {TAG_LABELS[t]}
                                </Text>
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {entry.note ? (
                          <Text
                            style={{
                              color: c.textSecondary,
                              fontFamily: fontFamily.regular,
                              fontSize: fontSize.bodySm,
                              marginTop: spacing.s1,
                            }}
                          >
                            {entry.note}
                          </Text>
                        ) : null}
                      </View>
                    </FadeSlideIn>
                  );
                })
              )}
            </Card>
          ) : null}

          <SectionTitle>Patterns</SectionTitle>
          {patterns.length === 0 ? (
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.bodySm,
                marginBottom: spacing.s2,
              }}
            >
              Patterns appear once there's about two weeks of check-ins.
            </Text>
          ) : (
            patterns.map((insight, index) => (
              <FadeSlideIn key={insight.key} index={index}>
                <Card>
                  <Text
                    style={{
                      color: c.textPrimary,
                      fontFamily: fontFamily.regular,
                      fontSize: fontSize.bodyMd,
                      lineHeight: 24,
                    }}
                  >
                    {insight.text}
                  </Text>
                </Card>
              </FadeSlideIn>
            ))
          )}
          <Text
            style={{
              color: c.textTertiary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.caption,
              marginTop: spacing.s1,
            }}
          >
            Observations from your own data — patterns, not prescriptions.
          </Text>
        </>
      )}
    </ScreenLayout>
  );
}
