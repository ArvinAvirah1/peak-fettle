/**
 * Today — the daily driver (spec §4): next stack to run, mood check-in card,
 * streak chip, weekly review nudge (Sun/Mon until completed), proposals
 * surface, 14-day sparkline.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useFeatureFlags } from '../../src/hooks/useFeatureFlags';
import { MilestoneBanner } from '../../src/features/share/MilestoneBanner';
import { milestoneCrossed, type ShareMilestone } from '../../src/features/share/milestones';
import { useAffirmations } from '../../src/features/affirmations/useAffirmations';
import { AffirmationTodayCard } from '../../src/features/affirmations/AffirmationTodayCard';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { MoodSparkline } from '../../src/components/MoodSparkline';
import { fontFamily, fontSize, spacing } from '../../src/theme/tokens';
import { dayKey, localDb } from '../../src/db/localDb';
import { computeStreak } from '../../src/engine/streaks';
import {
  HabitRow,
  listHabits,
  listStacks,
  mergedDailyLogs,
  StackRow,
  todayLogs,
} from '../../src/data/habits';
import { moodForDay, MoodRow, recentMoods } from '../../src/data/mood';
import { currentWeekReview } from '../../src/data/reviews';
import { listProtocols } from '../../src/data/protocols';

/**
 * TICKET-123: today's affirmation. Kept as its own component so useAffirmations()
 * (which seeds + watches lo_affirmations) only runs when the flag is ON — the
 * caller conditionally mounts this, so an OFF feature does no work.
 */
function TodayAffirmation(): React.ReactElement | null {
  const { todayLine } = useAffirmations();
  return todayLine ? <AffirmationTodayCard line={todayLine} /> : null;
}

export default function TodayScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [stacks, setStacks] = useState<StackRow[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [doneToday, setDoneToday] = useState<Map<string, string>>(new Map());
  const [mood, setMood] = useState<MoodRow | null>(null);
  const [sparkline, setSparkline] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [reviewDue, setReviewDue] = useState(false);
  const [proposalCount, setProposalCount] = useState(0);

  // TICKET-120: surface a dismissable milestone share affordance when the flag
  // is on AND the streak crosses a milestone DURING this session. prevStreakRef
  // starts at -1 so a cold launch (which would otherwise look like 0 → N) never
  // fires the banner; only an in-session increase does.
  const { isEnabled } = useFeatureFlags();
  const [pendingMilestone, setPendingMilestone] = useState<ShareMilestone | null>(null);
  const prevStreakRef = useRef(-1);

  const load = useCallback(async () => {
    const [s, h, logs, m, recents, merged, review, proposals] = await Promise.all([
      listStacks(),
      listHabits(),
      todayLogs(),
      moodForDay(),
      recentMoods(14),
      mergedDailyLogs(),
      currentWeekReview(),
      listProtocols('proposed'),
    ]);
    setStacks(s);
    setHabits(h);
    setDoneToday(new Map(Array.from(logs.entries()).map(([k, v]) => [k, v as string])));
    setMood(m);
    setSparkline(recents.reverse().map((r) => r.mood));
    const curStreak = computeStreak(merged, dayKey()).current;
    setStreak(curStreak);
    if (isEnabled('shareCards') && prevStreakRef.current >= 0) {
      const crossed = milestoneCrossed(prevStreakRef.current, curStreak);
      if (crossed) setPendingMilestone(crossed);
    }
    prevStreakRef.current = curStreak;

    const dow = new Date().getDay(); // 0 Sun, 1 Mon
    setReviewDue((dow === 0 || dow === 1) && review?.completed_at == null);
    setProposalCount(proposals.length);
  }, [isEnabled]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    let cancelled = false;
    const watcher = localDb.watch('', [], {
      tables: new Set(['lo_habit_logs', 'lo_mood_checkins', 'lo_protocols', 'lo_weekly_reviews']),
    });
    (async () => {
      for await (const _ of watcher) {
        if (cancelled) break;
        await load();
      }
    })();
    return () => {
      cancelled = true;
      // Close the generator NOW so its finally{} unsubscribes the localDb
      // listener immediately (not at GC) — review finding 2026-06-12.
      void watcher.return(undefined);
    };
  }, [load]);

  const nextStack = stacks.find((s) => {
    const steps = habits.filter((h) => h.stack_id === s.id);
    return steps.length > 0 && steps.some((h) => !doneToday.has(h.id));
  });
  const nextStackSteps = nextStack ? habits.filter((h) => h.stack_id === nextStack.id) : [];
  const nextStackDone = nextStackSteps.filter((h) => doneToday.has(h.id)).length;

  return (
    <ScreenLayout>
      {/* streak chip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s3 }}>
        <Ionicons name="flame-outline" size={18} color={c.accentDefault} />
        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, marginLeft: spacing.s1, fontVariant: ['tabular-nums'] }}>
          {streak > 0 ? `${streak}-day streak` : 'Start your streak today'}
        </Text>
      </View>

      {isEnabled('shareCards') && pendingMilestone !== null ? (
        <MilestoneBanner
          milestone={pendingMilestone}
          streakCount={streak}
          onDismiss={() => setPendingMilestone(null)}
        />
      ) : null}

      {isEnabled('affirmations') ? <TodayAffirmation /> : null}

      {proposalCount > 0 ? (
        <Card onPress={() => router.push('/onboarding/plan-reveal')} accessibilityLabel="Review proposed plans">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="trail-sign-outline" size={22} color={c.accentDefault} />
            <View style={{ marginLeft: spacing.s3, flexShrink: 1 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
                {proposalCount} plan {proposalCount === 1 ? 'proposal' : 'proposals'} waiting
              </Text>
              <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>
                Review, edit, or pass — nothing starts without you.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {reviewDue ? (
        <Card onPress={() => router.push('/weekly-review')} accessibilityLabel="Start weekly review">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={22} color={c.accentDefault} />
            <View style={{ marginLeft: spacing.s3, flexShrink: 1 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
                Weekly review
              </Text>
              <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>
                Five minutes to close last week and aim this one.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <SectionTitle>Up next</SectionTitle>
      {nextStack ? (
        <Card
          onPress={() => router.push({ pathname: '/stack-player', params: { stackId: nextStack.id } })}
          accessibilityLabel={`Run ${nextStack.name}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.heading3 }}>
                {nextStack.name}
              </Text>
              <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginTop: spacing.s1, fontVariant: ['tabular-nums'] }}>
                {nextStackDone}/{nextStackSteps.length} steps ·{' '}
                {nextStack.anchor_type === 'time' ? nextStack.anchor_value : 'after ' + nextStack.anchor_value.replace(/_/g, ' ')}
              </Text>
            </View>
            <Ionicons name="play-circle-outline" size={36} color={c.accentDefault} />
          </View>
        </Card>
      ) : habits.length === 0 ? (
        <EmptyState
          icon="repeat-outline"
          title="No habits yet"
          body="Build your first stack, or accept a plan proposal to get going."
          cta="Open Habits"
          onPress={() => router.push('/(tabs)/habits')}
        />
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="checkmark-done-outline" size={22} color={c.statusSuccess} />
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd, marginLeft: spacing.s3 }}>
              Everything's logged for today. Nicely done.
            </Text>
          </View>
        </Card>
      )}

      <SectionTitle>Mind</SectionTitle>
      <Card onPress={() => router.push('/mood-checkin')} accessibilityLabel="Daily mood check-in">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
              {mood ? 'Checked in — tap to update' : 'How are you today?'}
            </Text>
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginTop: spacing.s1 }}>
              {mood ? `Mood ${mood.mood}/5 logged` : 'One tap, optional note.'}
            </Text>
          </View>
          <Ionicons name={mood ? 'checkmark-circle-outline' : 'add-circle-outline'} size={30} color={c.accentDefault} />
        </View>
        {sparkline.length >= 2 ? (
          <View style={{ marginTop: spacing.s3 }}>
            <MoodSparkline moods={sparkline} />
          </View>
        ) : null}
      </Card>
      <PFButton label="Open exercise library" variant="secondary" onPress={() => router.push('/exercises')} />
    </ScreenLayout>
  );
}
