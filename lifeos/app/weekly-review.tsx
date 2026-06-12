/**
 * Weekly review ritual (TICKET-105) — full-screen, staggered entrance
 * (40ms/item, reduced-motion aware), ≤5 min, skippable, autosaves.
 * Steps: consistency recap → milestone decisions → one reflection per
 * domain (obstacle from the survey shown alongside — R16) → next-week
 * intention. Protocol tweaks surface via reviewAdjustments().
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../src/theme/tokens';
import { dayKey } from '../src/db/localDb';
import { consistency } from '../src/engine/streaks';
import { reviewAdjustments } from '../src/engine/directionModel.v1';
import { domainLabel, GoalRow, listGoals, MilestoneRow, milestonesForGoal, setMilestoneDone } from '../src/data/goals';
import { listHabits, logsForHabit } from '../src/data/habits';
import { Reflections, saveReview } from '../src/data/reviews';
import { latestSurvey } from '../src/data/protocols';

interface GoalBundle {
  goal: GoalRow;
  openMilestones: MilestoneRow[];
}

export default function WeeklyReviewScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState(0);
  const [weekRatio, setWeekRatio] = useState<number | null>(null);
  const [bundles, setBundles] = useState<GoalBundle[]>([]);
  const [decisions, setDecisions] = useState<Record<string, 'done' | 'push' | 'drop'>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [intention, setIntention] = useState('');
  const [obstacles, setObstacles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const goals = await listGoals();
    const withMilestones = await Promise.all(
      goals.map(async (goal) => ({
        goal,
        openMilestones: (await milestonesForGoal(goal.id)).filter((m) => m.completed_at == null).slice(0, 3),
      }))
    );
    setBundles(withMilestones);

    const habits = await listHabits();
    if (habits.length > 0) {
      let active = 0;
      let eligible = 0;
      for (const h of habits) {
        const logs = await logsForHabit(h.id);
        const cons = consistency(logs, dayKey(), 7);
        active += cons.active;
        eligible += cons.eligible;
      }
      setWeekRatio(eligible > 0 ? active / eligible : null);
    }

    const survey = await latestSurvey();
    if (survey) {
      const map: Record<string, string> = {};
      for (const [domain, a] of Object.entries(survey.selfAssessment)) {
        if (a?.blocker) map[domain] = a.blocker;
      }
      setObstacles(map);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const finish = async (completed: boolean): Promise<void> => {
    setSaving(true);
    for (const [milestoneId, decision] of Object.entries(decisions)) {
      if (decision === 'done') await setMilestoneDone(milestoneId, true);
    }
    const reflections: Reflections = { milestoneDecisions: decisions, domainNotes: notes, nextWeekIntention: intention };
    await saveReview(reflections, completed);
    router.back();
  };

  const TOTAL = 4;
  const enter = (i: number) => (reducedMotion ? undefined : FadeInDown.duration(240).delay(i * 40));
  const adjustment = weekRatio != null ? reviewAdjustments(weekRatio) : null;
  const domains = Array.from(new Set(bundles.map((b) => b.goal.domain)));

  return (
    <ScreenLayout edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.s2 }}>
        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }}>
          Weekly review · {step + 1}/{TOTAL}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip review"
          onPress={() => void finish(false)}
          style={{ minWidth: HIT_TARGET, minHeight: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: c.textTertiary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>Skip</Text>
        </Pressable>
      </View>

      {step === 0 && (
        <View>
          <Animated.View entering={enter(0)}>
            <SectionTitle top={spacing.s4}>Last week</SectionTitle>
            <Card>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.display, fontVariant: ['tabular-nums'] }}>
                {weekRatio != null ? `${Math.round(weekRatio * 100)}%` : '—'}
              </Text>
              <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd }}>
                habit consistency over the last 7 days
              </Text>
            </Card>
          </Animated.View>
          {adjustment ? (
            <Animated.View entering={enter(1)}>
              <Card>
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd, lineHeight: 24 }}>
                  {adjustment === 'reduce'
                    ? 'A lot slipped — that usually means the plan is too big, not that you failed. Consider shrinking a step or two; the cue stays.'
                    : adjustment === 'advance'
                      ? 'You cleared almost everything. If it felt easy, this is the week to nudge one habit up.'
                      : 'Solid week. Holding steady is a real strategy.'}
                </Text>
              </Card>
            </Animated.View>
          ) : null}
        </View>
      )}

      {step === 1 && (
        <View>
          <SectionTitle top={spacing.s4}>Milestones — done, push, or drop</SectionTitle>
          {bundles.flatMap((b, bi) =>
            b.openMilestones.map((m, mi) => (
              <Animated.View key={m.id} entering={enter(bi + mi)}>
                <Card>
                  <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>
                    {domainLabel(b.goal.domain)} · {b.goal.title}
                  </Text>
                  <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd, marginTop: spacing.s1, marginBottom: spacing.s3 }}>
                    {m.title}
                  </Text>
                  <View style={{ flexDirection: 'row' }}>
                    {(['done', 'push', 'drop'] as const).map((d) => (
                      <Pressable
                        key={d}
                        accessibilityRole="button"
                        accessibilityState={{ selected: decisions[m.id] === d }}
                        accessibilityLabel={`${d} — ${m.title}`}
                        onPress={() => setDecisions((prev) => ({ ...prev, [m.id]: d }))}
                        style={{
                          flex: 1,
                          minHeight: HIT_TARGET,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: decisions[m.id] === d ? c.accentDefault : c.borderDefault,
                          backgroundColor: decisions[m.id] === d ? c.accentMuted : 'transparent',
                          borderRadius: 8,
                          marginRight: d !== 'drop' ? spacing.s2 : 0,
                        }}
                      >
                        <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, textTransform: 'capitalize' }}>
                          {d}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </Card>
              </Animated.View>
            ))
          )}
          {bundles.every((b) => b.openMilestones.length === 0) ? (
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s3 }}>
              No open milestones — nothing to decide here.
            </Text>
          ) : null}
        </View>
      )}

      {step === 2 && (
        <View>
          <SectionTitle top={spacing.s4}>One line per area</SectionTitle>
          {domains.map((d, i) => (
            <Animated.View key={d} entering={enter(i)}>
              {obstacles[d] ? (
                <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginBottom: spacing.s1 }}>
                  You said the obstacle was: “{obstacles[d]}”
                </Text>
              ) : null}
              <PFInput
                label={domainLabel(d)}
                value={notes[d] ?? ''}
                onChangeText={(t) => setNotes((prev) => ({ ...prev, [d]: t }))}
                placeholder="What actually happened this week?"
              />
            </Animated.View>
          ))}
        </View>
      )}

      {step === 3 && (
        <View>
          <SectionTitle top={spacing.s4}>Next week, in one sentence</SectionTitle>
          <PFInput
            label="Intention"
            value={intention}
            onChangeText={setIntention}
            placeholder="e.g. Protect the morning block, whatever happens"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s2 }}>
            <Ionicons name="lock-closed-outline" size={14} color={c.textTertiary} />
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginLeft: spacing.s1 }}>
              Reflections stay on this device.
            </Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', marginTop: spacing.s8, paddingBottom: spacing.s4 }}>
        {step > 0 ? (
          <PFButton label="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1, marginRight: spacing.s3 }} />
        ) : null}
        <PFButton
          label={step === TOTAL - 1 ? 'Finish review' : 'Next'}
          onPress={() => (step === TOTAL - 1 ? void finish(true) : setStep(step + 1))}
          loading={saving}
          style={{ flex: 2 }}
        />
      </View>
    </ScreenLayout>
  );
}
