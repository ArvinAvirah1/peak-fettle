/**
 * Goal detail (TICKET-105, extended TICKET-161) — milestones (check/add/
 * remove), linked habits, two honest progress signals (milestones done +
 * 28-day habit consistency) plus, for numeric-metric goals, an explicit
 * third signal (current/target with quick-update chips) and a 12-week
 * progress-over-time mini chart. Never blended into one score.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { SpringReorder } from '../src/components/motion';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import {
  addMilestone,
  deleteMilestone,
  domainLabel,
  GoalProgress,
  goalProgress,
  GoalRow,
  getGoal,
  incrementGoalMetric,
  linkedHabitIds,
  linkHabit,
  MilestoneRow,
  milestonesForGoal,
  milestoneWeeklySeries,
  setGoalMetric,
  setGoalStatus,
  setMilestoneDone,
  unlinkHabit,
} from '../src/data/goals';
import { HabitRow, listHabits } from '../src/data/habits';
import { safeWrite } from '../src/lib/feedback';
import { haptic } from '../src/lib/haptics';

function formatMetricNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.trunc(rounded)) : rounded.toFixed(1);
}

const QUICK_DELTAS = [1, 5, 10];

export default function GoalDetailScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { goalId } = useLocalSearchParams<{ goalId: string }>();

  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [newMilestone, setNewMilestone] = useState('');
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [weeklySeries, setWeeklySeries] = useState<Array<{ weekStart: string; cumulativeDone: number }>>([]);

  const [pendingDelta, setPendingDelta] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustCurrent, setAdjustCurrent] = useState('');
  const [adjustTarget, setAdjustTarget] = useState('');

  const load = useCallback(async () => {
    if (!goalId) return;
    const [g, m, p, h, l, series] = await Promise.all([
      getGoal(goalId),
      milestonesForGoal(goalId),
      goalProgress(goalId),
      listHabits(),
      linkedHabitIds(goalId),
      milestoneWeeklySeries(goalId, 12),
    ]);
    setGoal(g);
    setMilestones(m);
    setProgress(p);
    setHabits(h);
    setLinked(l);
    setWeeklySeries(series);
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!goal) {
    return (
      <ScreenLayout scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={c.accentDefault} />
        </View>
      </ScreenLayout>
    );
  }

  const toggleMilestone = async (m: MilestoneRow): Promise<void> => {
    const nowDone = m.completed_at == null;
    await safeWrite(() => setMilestoneDone(m.id, nowDone), { context: 'goals.toggleMilestone' });
    if (nowDone) haptic.success();
    await load();
  };

  const submitNewMilestone = async (): Promise<void> => {
    const v = newMilestone.trim();
    if (!v || !goalId) return;
    await safeWrite(() => addMilestone(goalId as string, v), { context: 'goals.addMilestone' });
    setNewMilestone('');
    await load();
  };

  const removeMilestone = async (id: string): Promise<void> => {
    await safeWrite(() => deleteMilestone(id), { context: 'goals.deleteMilestone' });
    await load();
  };

  const applyDelta = async (delta: number): Promise<void> => {
    if (!goalId || pendingDelta) return;
    setPendingDelta(true);
    haptic.success();
    await incrementGoalMetric(goalId as string, delta);
    await load();
    setPendingDelta(false);
  };

  const openAdjust = (): void => {
    haptic.selection();
    setAdjustCurrent(goal.metric_current != null ? formatMetricNumber(goal.metric_current) : '0');
    setAdjustTarget(goal.metric_target != null ? formatMetricNumber(goal.metric_target) : '');
    setAdjustOpen(!adjustOpen);
  };

  const saveAdjust = async (): Promise<void> => {
    const current = parseFloat(adjustCurrent);
    const target = parseFloat(adjustTarget);
    const patch: { current?: number | null; target?: number | null } = {};
    if (Number.isFinite(current)) patch.current = Math.max(0, current);
    if (Number.isFinite(target) && target > 0) patch.target = target;
    await safeWrite(() => setGoalMetric(goal.id, patch), { context: 'goals.setGoalMetric' });
    setAdjustOpen(false);
    await load();
  };

  const linkOne = async (habitId: string): Promise<void> => {
    haptic.selection();
    await safeWrite(() => linkHabit(goalId as string, habitId), { context: 'goals.linkHabit' });
    await load();
  };

  const unlinkOne = async (habitId: string): Promise<void> => {
    await safeWrite(() => unlinkHabit(goalId as string, habitId), { context: 'goals.unlinkHabit' });
    await load();
  };

  const consistencyPct = progress?.habitConsistency ? Math.round(progress.habitConsistency.ratio * 100) : null;
  const isNumeric = goal.metric_type === 'numeric' && goal.metric_target != null && goal.metric_target > 0;
  const metricCurrent = goal.metric_current ?? 0;
  const metricTarget = goal.metric_target ?? 0;
  const metricPct = isNumeric ? Math.min(100, Math.round((metricCurrent / metricTarget) * 100)) : 0;
  const targetReached = isNumeric && metricCurrent >= metricTarget;

  const milestonesTotal = weeklySeries.length > 0 ? weeklySeries[weeklySeries.length - 1].cumulativeDone : 0;
  const maxCumulative = Math.max(1, ...weeklySeries.map((w) => w.cumulativeDone));
  const showChart = milestonesTotal > 0;

  return (
    <ScreenLayout>
      <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semibold, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.s3 }}>
        {domainLabel(goal.domain)}
      </Text>
      <Text accessibilityRole="header" style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading2, marginTop: spacing.s1 }}>
        {goal.title}
      </Text>
      {goal.why ? (
        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, lineHeight: 24, marginTop: spacing.s2 }}>
          “{goal.why}”
        </Text>
      ) : null}

      {isNumeric ? (
        <Card style={{ marginTop: spacing.s4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.display, fontVariant: ['tabular-nums'] }}>
                {formatMetricNumber(metricCurrent)}
              </Text>
              <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, fontVariant: ['tabular-nums'] }}>
                of {formatMetricNumber(metricTarget)}
              </Text>
            </View>
            {targetReached ? (
              <View
                accessibilityLabel="Target reached"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: c.statusSuccess,
                  borderRadius: radius.full,
                  paddingHorizontal: spacing.s3,
                  paddingVertical: spacing.s1,
                }}
              >
                <Ionicons name="checkmark-circle" size={16} color={c.statusSuccess} />
                <Text style={{ color: c.statusSuccess, fontFamily: fontFamily.semibold, fontSize: fontSize.caption, marginLeft: spacing.s1 }}>
                  Target reached
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.bgElevated, overflow: 'hidden', marginTop: spacing.s4 }}>
            <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.accentDefault, width: `${metricPct}%` }} />
          </View>

          <View style={{ flexDirection: 'row', marginTop: spacing.s4 }}>
            {QUICK_DELTAS.map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`Add ${n} to progress`}
                accessibilityState={{ disabled: pendingDelta }}
                disabled={pendingDelta}
                onPress={() => void applyDelta(n)}
                style={{
                  minHeight: HIT_TARGET,
                  minWidth: HIT_TARGET,
                  paddingHorizontal: spacing.s4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.accentMuted,
                  borderWidth: 1,
                  borderColor: c.accentDefault,
                  borderRadius: radius.full,
                  marginRight: spacing.s2,
                  opacity: pendingDelta ? 0.5 : 1,
                }}
              >
                <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
                  +{n}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={adjustOpen ? 'Hide adjust progress' : 'Adjust progress'}
            onPress={openAdjust}
            style={{ minHeight: HIT_TARGET, justifyContent: 'center', marginTop: spacing.s2 }}
          >
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>
              {adjustOpen ? 'Hide adjust' : 'Adjust'}
            </Text>
          </Pressable>

          {adjustOpen ? (
            <View style={{ marginTop: spacing.s2 }}>
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, marginRight: spacing.s2 }}>
                  <PFInput label="Current" value={adjustCurrent} onChangeText={setAdjustCurrent} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <PFInput label="Target" value={adjustTarget} onChangeText={setAdjustTarget} keyboardType="numeric" />
                </View>
              </View>
              <PFButton label="Save" onPress={() => void saveAdjust()} />
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* honest progress signals — never blended */}
      <View style={{ flexDirection: 'row', marginTop: spacing.s4 }}>
        {isNumeric ? (
          <View style={{ flex: 1, backgroundColor: c.bgSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderDefault, padding: spacing.s3 }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3, fontVariant: ['tabular-nums'] }}>
              {consistencyPct != null ? `${consistencyPct}%` : '—'}
            </Text>
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>habit consistency · 28d</Text>
          </View>
        ) : (
          <>
            <View style={{ flex: 1, backgroundColor: c.bgSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderDefault, padding: spacing.s3, marginRight: spacing.s2 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3, fontVariant: ['tabular-nums'] }}>
                {progress?.milestonesDone ?? 0}/{progress?.milestonesTotal ?? 0}
              </Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>milestones</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: c.bgSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderDefault, padding: spacing.s3 }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3, fontVariant: ['tabular-nums'] }}>
                {consistencyPct != null ? `${consistencyPct}%` : '—'}
              </Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>habit consistency · 28d</Text>
            </View>
          </>
        )}
      </View>

      {showChart ? (
        <>
          <SectionTitle>Progress over time</SectionTitle>
          <Card>
            <View
              accessibilityLabel={`Milestones completed over the last 12 weeks: ${milestonesTotal} of ${progress?.milestonesTotal ?? milestonesTotal}`}
              style={{ flexDirection: 'row', gap: spacing.s1, height: 64, alignItems: 'flex-end' }}
            >
              {weeklySeries.map((w, i) => {
                const barHeight = Math.max(4, Math.round((w.cumulativeDone / maxCumulative) * 64));
                return (
                  <View
                    key={w.weekStart + i}
                    style={{
                      flex: 1,
                      height: barHeight,
                      borderRadius: radius.sm,
                      backgroundColor: c.accentDefault,
                    }}
                  />
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s2 }}>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>12 wks ago</Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption }}>now</Text>
            </View>
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s2 }}>
              Milestones completed · last 12 weeks
            </Text>
          </Card>
        </>
      ) : null}

      <SectionTitle>Milestones</SectionTitle>
      <Card>
        {milestones.map((m) => (
          <SpringReorder key={m.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: m.completed_at != null }}
                accessibilityLabel={m.title}
                onPress={() => void toggleMilestone(m)}
                style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons
                  name={m.completed_at != null ? 'checkbox-outline' : 'square-outline'}
                  size={24}
                  color={m.completed_at != null ? c.statusSuccess : c.textTertiary}
                />
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  color: m.completed_at != null ? c.textTertiary : c.textPrimary,
                  fontFamily: fontFamily.regular,
                  fontSize: fontSize.bodyMd,
                  textDecorationLine: m.completed_at != null ? 'line-through' : 'none',
                }}
              >
                {m.title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove milestone ${m.title}`}
                onPress={() => void removeMilestone(m.id)}
                style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close-outline" size={18} color={c.textTertiary} />
              </Pressable>
            </View>
          </SpringReorder>
        ))}
        <PFInput
          label="Add milestone"
          value={newMilestone}
          onChangeText={setNewMilestone}
          placeholder="Concrete and countable"
          returnKeyType="done"
          onSubmitEditing={() => void submitNewMilestone()}
        />
      </Card>

      <SectionTitle>Linked habits</SectionTitle>
      <Card>
        {linked.length === 0 ? (
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginBottom: spacing.s3 }}>
            Link the daily habits that move this goal — consistency shows above.
          </Text>
        ) : (
          habits
            .filter((h) => linked.includes(h.id))
            .map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET }}>
                <Ionicons name={h.icon} size={20} color={c.accentDefault} />
                <Text style={{ flex: 1, color: c.textPrimary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginLeft: spacing.s3 }}>
                  {h.name}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Unlink ${h.name}`}
                  onPress={() => void unlinkOne(h.id)}
                  style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="unlink-outline" size={18} color={c.textTertiary} />
                </Pressable>
              </View>
            ))
        )}
        <PFButton
          label={showLinkPicker ? 'Hide habit picker' : 'Link a habit'}
          variant="secondary"
          onPress={() => {
            haptic.selection();
            setShowLinkPicker(!showLinkPicker);
          }}
        />
        {showLinkPicker
          ? habits
              .filter((h) => !linked.includes(h.id))
              .map((h) => (
                <Pressable
                  key={h.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${h.name}`}
                  onPress={() => void linkOne(h.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET, marginTop: spacing.s1 }}
                >
                  <Ionicons name="add-outline" size={20} color={c.accentDefault} />
                  <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginLeft: spacing.s3 }}>
                    {h.name}
                  </Text>
                </Pressable>
              ))
          : null}
      </Card>

      <View style={{ flexDirection: 'row', marginTop: spacing.s4, marginBottom: spacing.s8 }}>
        <PFButton
          label="Mark achieved"
          variant="secondary"
          onPress={() => {
            void safeWrite(() => setGoalStatus(goal.id, 'achieved'), { context: 'goals.markAchieved' }).then(() => router.back());
          }}
          style={{ flex: 1, marginRight: spacing.s3 }}
        />
        <PFButton
          label="Archive"
          variant="ghost"
          onPress={() =>
            Alert.alert('Archive goal?', 'History is kept; the goal leaves your active list.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Archive',
                style: 'destructive',
                onPress: () =>
                  void safeWrite(() => setGoalStatus(goal.id, 'archived'), { context: 'goals.archive' }).then(() => router.back()),
              },
            ])
          }
          style={{ flex: 1 }}
        />
      </View>
    </ScreenLayout>
  );
}
