/**
 * Goal detail (TICKET-105) — milestones (check/add/remove), linked habits,
 * two honest progress signals (milestones done + 28-day habit consistency).
 */

import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
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
  linkedHabitIds,
  linkHabit,
  MilestoneRow,
  milestonesForGoal,
  setGoalStatus,
  setMilestoneDone,
  unlinkHabit,
} from '../src/data/goals';
import { HabitRow, listHabits } from '../src/data/habits';

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

  const load = useCallback(async () => {
    if (!goalId) return;
    const [g, m, p, h, l] = await Promise.all([
      getGoal(goalId),
      milestonesForGoal(goalId),
      goalProgress(goalId),
      listHabits(),
      linkedHabitIds(goalId),
    ]);
    setGoal(g);
    setMilestones(m);
    setProgress(p);
    setHabits(h);
    setLinked(l);
  }, [goalId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!goal) return <ScreenLayout scroll={false}>{null}</ScreenLayout>;

  const toggleMilestone = async (m: MilestoneRow): Promise<void> => {
    const nowDone = m.completed_at == null;
    await setMilestoneDone(m.id, nowDone);
    if (nowDone) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    await load();
  };

  const consistencyPct = progress?.habitConsistency ? Math.round(progress.habitConsistency.ratio * 100) : null;

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

      {/* two honest signals — never blended */}
      <View style={{ flexDirection: 'row', marginTop: spacing.s4 }}>
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
      </View>

      <SectionTitle>Milestones</SectionTitle>
      <Card>
        {milestones.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET }}>
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
              onPress={() => void deleteMilestone(m.id).then(load)}
              style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close-outline" size={18} color={c.textTertiary} />
            </Pressable>
          </View>
        ))}
        <PFInput
          label="Add milestone"
          value={newMilestone}
          onChangeText={setNewMilestone}
          placeholder="Concrete and countable"
          returnKeyType="done"
          onSubmitEditing={() => {
            const v = newMilestone.trim();
            if (v) {
              void addMilestone(goalId as string, v).then(() => {
                setNewMilestone('');
                void load();
              });
            }
          }}
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
                  onPress={() => void unlinkHabit(goalId as string, h.id).then(load)}
                  style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="unlink-outline" size={18} color={c.textTertiary} />
                </Pressable>
              </View>
            ))
        )}
        <PFButton label={showLinkPicker ? 'Hide habit picker' : 'Link a habit'} variant="secondary" onPress={() => setShowLinkPicker(!showLinkPicker)} />
        {showLinkPicker
          ? habits
              .filter((h) => !linked.includes(h.id))
              .map((h) => (
                <Pressable
                  key={h.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Link ${h.name}`}
                  onPress={() => void linkHabit(goalId as string, h.id).then(load)}
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
            void setGoalStatus(goal.id, 'achieved').then(() => router.back());
          }}
          style={{ flex: 1, marginRight: spacing.s3 }}
        />
        <PFButton
          label="Archive"
          variant="ghost"
          onPress={() =>
            Alert.alert('Archive goal?', 'History is kept; the goal leaves your active list.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Archive', style: 'destructive', onPress: () => void setGoalStatus(goal.id, 'archived').then(() => router.back()) },
            ])
          }
          style={{ flex: 1 }}
        />
      </View>
    </ScreenLayout>
  );
}
