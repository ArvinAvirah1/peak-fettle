/**
 * Weekly review ritual (TICKET-105, rebuilt TICKET-160 "Weekly review ritual
 * 2.0" — flagship EXCEED feature). A 4-step guided, CELEBRATORY ritual,
 * ≤5 min, everything optional, skippable, autosaves. Steps: celebrate wins
 * (consistency recap + bright spot + free-text wins) → one line per domain
 * (obstacle from the survey shown alongside — R16) → milestone decisions
 * (done/push/drop) → set intentions for next week. Protocol tweaks surface
 * via reviewAdjustments(). A streak chip (reviewStreak()) celebrates
 * consecutive completed reviews — never loss-framed. Kind, non-clinical
 * copy throughout; no "AI" wording.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Celebration, FadeSlideIn } from '../src/components/motion';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { dayKey } from '../src/db/localDb';
import { consistency } from '../src/engine/streaks';
import { reviewAdjustments } from '../src/engine/directionModel.v1';
import { domainLabel, GoalRow, listGoals, MilestoneRow, milestonesForGoal, setMilestoneDone } from '../src/data/goals';
import { listHabits, logsForHabit } from '../src/data/habits';
import { Reflections, reviewStreak, saveReview } from '../src/data/reviews';
import { latestSurvey } from '../src/data/protocols';
import { buildWeeklyRecap } from '../src/data/insights';
import { haptic } from '../src/lib/haptics';
import { safeWrite } from '../src/lib/feedback';

interface GoalBundle {
  goal: GoalRow;
  openMilestones: MilestoneRow[];
}

const TOTAL = 4;
const MAX_WINS = 3;
const MAX_INTENTIONS = 3;

/** 1st / 2nd / 3rd / nth — celebratory ordinal for the streak chip. */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// ---------------------------------------------------------------------------

function ProgressDots({ step, total, color, colorActive, colorDone }: {
  step: number;
  total: number;
  color: string;
  colorActive: string;
  colorDone: string;
}): React.ReactElement {
  return (
    <View
      accessibilityLabel={`Step ${step + 1} of ${total}`}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.full,
            marginLeft: i === 0 ? 0 : spacing.s1,
            backgroundColor: i === step ? colorActive : i < step ? colorDone : color,
          }}
        />
      ))}
    </View>
  );
}

function StreakChip({ weeks }: { weeks: number }): React.ReactElement | null {
  const { theme } = useTheme();
  const c = theme.colors;
  if (weeks < 1) return null;
  const label = `${ordinal(weeks)} week in a row`;
  return (
    <View
      accessibilityLabel={`Review streak: ${weeks} weeks in a row`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: c.accentMuted,
        borderColor: c.accentDefault,
        borderWidth: 1,
        borderRadius: radius.full,
        paddingHorizontal: spacing.s3,
        paddingVertical: spacing.s1,
        marginTop: spacing.s2,
      }}
    >
      <Ionicons name="sparkles-outline" size={18} color={c.accentDefault} />
      <Text
        style={{
          color: c.textPrimary,
          fontFamily: fontFamily.medium,
          fontSize: fontSize.caption,
          marginLeft: spacing.s1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

export default function WeeklyReviewScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [weekRatio, setWeekRatio] = useState<number | null>(null);
  const [brightSpot, setBrightSpot] = useState<string | null>(null);
  const [bundles, setBundles] = useState<GoalBundle[]>([]);
  const [decisions, setDecisions] = useState<Record<string, 'done' | 'push' | 'drop'>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [obstacles, setObstacles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [streakWeeks, setStreakWeeks] = useState(0);

  const [wins, setWins] = useState<string[]>([]);
  const [winDraft, setWinDraft] = useState('');
  const [intentions, setIntentions] = useState<string[]>(['']);

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

    const recap = await buildWeeklyRecap();
    setBrightSpot(recap.brightSpot);

    const streak = await reviewStreak();
    setStreakWeeks(streak);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addWin = (): void => {
    const trimmed = winDraft.trim();
    if (!trimmed || wins.length >= MAX_WINS) return;
    setWins((prev) => [...prev, trimmed]);
    setWinDraft('');
    haptic.success();
  };

  const removeWin = (index: number): void => {
    setWins((prev) => prev.filter((_, i) => i !== index));
  };

  const addIntentionField = (): void => {
    if (intentions.length >= MAX_INTENTIONS) return;
    setIntentions((prev) => [...prev, '']);
  };

  const removeIntentionField = (index: number): void => {
    setIntentions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const setIntentionAt = (index: number, value: string): void => {
    setIntentions((prev) => prev.map((v, i) => (i === index ? value : v)));
  };

  const changeStep = (next: number): void => {
    haptic.selection();
    setStep(next);
  };

  const finish = async (completed: boolean): Promise<void> => {
    if (saving) return;
    setSaving(true);

    if (completed) {
      for (const [milestoneId, decision] of Object.entries(decisions)) {
        if (decision === 'done') {
          await safeWrite(() => setMilestoneDone(milestoneId, true), { context: 'review.milestone' });
        }
      }
    }

    const trimmedIntentions = intentions.map((i) => i.trim()).filter((i) => i.length > 0);
    const reflections: Reflections = {
      milestoneDecisions: decisions,
      domainNotes: notes,
      wins,
      intentions: trimmedIntentions,
      nextWeekIntention: trimmedIntentions[0],
    };
    await saveReview(reflections, completed);

    if (completed) {
      haptic.success();
      setSaving(false);
      setCelebrating(true);
    } else {
      setSaving(false);
      router.back();
    }
  };

  const adjustment = weekRatio != null ? reviewAdjustments(weekRatio) : null;
  const domains = Array.from(new Set(bundles.map((b) => b.goal.domain)));
  const allMilestonesEmpty = bundles.every((b) => b.openMilestones.length === 0);

  return (
    <ScreenLayout edges={['top', 'bottom']}>
      <Celebration run={celebrating} particleCount={140} onDone={() => router.back()} />

      <View style={{ marginTop: spacing.s2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              style={{
                color: c.textSecondary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.bodySm,
                fontVariant: ['tabular-nums'],
                marginRight: spacing.s3,
              }}
            >
              Weekly review · {step + 1}/{TOTAL}
            </Text>
            <ProgressDots
              step={step}
              total={TOTAL}
              color={c.borderDefault}
              colorActive={c.accentDefault}
              colorDone={c.accentMuted}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip review"
            onPress={() => void finish(false)}
            style={{ minWidth: HIT_TARGET, minHeight: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>Skip</Text>
          </Pressable>
        </View>
        <StreakChip weeks={streakWeeks} />
      </View>

      {step === 0 && (
        <View>
          <SectionTitle top={spacing.s4}>Start with what worked</SectionTitle>
          <FadeSlideIn index={0}>
            <Card>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.display, fontVariant: ['tabular-nums'] }}>
                {weekRatio != null ? `${Math.round(weekRatio * 100)}%` : '—'}
              </Text>
              <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd }}>
                habit consistency over the last 7 days
              </Text>
              {brightSpot ? (
                <Text
                  style={{
                    color: c.textSecondary,
                    fontFamily: fontFamily.medium,
                    fontSize: fontSize.bodySm,
                    marginTop: spacing.s2,
                  }}
                >
                  {brightSpot}
                </Text>
              ) : null}
            </Card>
          </FadeSlideIn>
          {adjustment ? (
            <FadeSlideIn index={1}>
              <Card>
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd, lineHeight: 24 }}>
                  {adjustment === 'reduce'
                    ? 'A lot slipped — that usually means the plan is too big, not that you failed. Consider shrinking a step or two; the cue stays.'
                    : adjustment === 'advance'
                      ? 'You cleared almost everything. If it felt easy, this is the week to nudge one habit up.'
                      : 'Solid week. Holding steady is a real strategy.'}
                </Text>
              </Card>
            </FadeSlideIn>
          ) : null}

          <SectionTitle top={spacing.s6}>A few wins from this week</SectionTitle>
          {wins.map((w, i) => (
            <FadeSlideIn key={`${w}-${i}`} index={i}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: spacing.s2,
                  paddingHorizontal: spacing.s3,
                  backgroundColor: c.bgSecondary,
                  borderColor: c.borderDefault,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  marginBottom: spacing.s2,
                }}
              >
                <Ionicons name="checkmark-circle" size={20} color={c.statusSuccess} />
                <Text
                  style={{
                    flex: 1,
                    color: c.textPrimary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.bodyMd,
                    marginLeft: spacing.s2,
                  }}
                >
                  {w}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove win: ${w}`}
                  onPress={() => removeWin(i)}
                  style={{ minWidth: HIT_TARGET, minHeight: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="close-outline" size={20} color={c.textTertiary} />
                </Pressable>
              </View>
            </FadeSlideIn>
          ))}
          {wins.length < MAX_WINS ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <View style={{ flex: 1, marginRight: spacing.s2 }}>
                <PFInput
                  label="A win from this week"
                  value={winDraft}
                  onChangeText={setWinDraft}
                  placeholder="Something that went well, big or small"
                  onSubmitEditing={addWin}
                />
              </View>
              <PFButton
                label="Add"
                variant="secondary"
                disabled={!winDraft.trim() || wins.length >= MAX_WINS}
                onPress={addWin}
                style={{ marginBottom: spacing.s4 }}
              />
            </View>
          ) : null}
          <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>
            Totally optional — skip ahead any time.
          </Text>
        </View>
      )}

      {step === 1 && (
        <View>
          <SectionTitle top={spacing.s4}>One line per area</SectionTitle>
          {domains.map((d, i) => (
            <FadeSlideIn key={d} index={i}>
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
            </FadeSlideIn>
          ))}
          {domains.length === 0 ? (
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd }}>
              No active goal areas yet — nothing to reflect on here.
            </Text>
          ) : null}
        </View>
      )}

      {step === 2 && (
        <View>
          <SectionTitle top={spacing.s4}>Carry over or close out</SectionTitle>
          {bundles.flatMap((b, bi) =>
            b.openMilestones.map((m, mi) => (
              <FadeSlideIn key={m.id} index={bi + mi}>
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
                        onPress={() => {
                          haptic.selection();
                          setDecisions((prev) => ({ ...prev, [m.id]: d }));
                        }}
                        style={{
                          flex: 1,
                          minHeight: HIT_TARGET,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: decisions[m.id] === d ? c.accentDefault : c.borderDefault,
                          backgroundColor: decisions[m.id] === d ? c.accentMuted : 'transparent',
                          borderRadius: radius.sm,
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
              </FadeSlideIn>
            ))
          )}
          {allMilestonesEmpty ? (
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s3 }}>
              No open milestones — nothing to decide here.
            </Text>
          ) : null}
        </View>
      )}

      {step === 3 && (
        <View>
          <SectionTitle top={spacing.s4}>Set your intentions</SectionTitle>
          {intentions.map((value, i) => (
            <FadeSlideIn key={i} index={i}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                <View style={{ flex: 1, marginRight: intentions.length > 1 ? spacing.s2 : 0 }}>
                  <PFInput
                    label={`Intention ${i + 1}`}
                    value={value}
                    onChangeText={(t) => setIntentionAt(i, t)}
                    placeholder="e.g. Protect the morning block, whatever happens"
                  />
                </View>
                {intentions.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove intention ${i + 1}`}
                    onPress={() => removeIntentionField(i)}
                    style={{ minWidth: HIT_TARGET, minHeight: HIT_TARGET, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.s4 }}
                  >
                    <Ionicons name="close-outline" size={20} color={c.textTertiary} />
                  </Pressable>
                ) : null}
              </View>
            </FadeSlideIn>
          ))}
          {intentions.length < MAX_INTENTIONS ? (
            <PFButton label="Add another" variant="ghost" onPress={addIntentionField} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.s4 }}>
            <Ionicons name="lock-closed-outline" size={14} color={c.textTertiary} />
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginLeft: spacing.s1 }}>
              Reflections stay on this device.
            </Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', marginTop: spacing.s8, paddingBottom: spacing.s4 }}>
        {step > 0 ? (
          <PFButton label="Back" variant="secondary" onPress={() => changeStep(step - 1)} style={{ flex: 1, marginRight: spacing.s3 }} />
        ) : null}
        <PFButton
          label={step === TOTAL - 1 ? 'Finish review' : 'Next'}
          onPress={() => (step === TOTAL - 1 ? void finish(true) : changeStep(step + 1))}
          loading={saving}
          style={{ flex: 2 }}
        />
      </View>
    </ScreenLayout>
  );
}
