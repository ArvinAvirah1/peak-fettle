/**
 * Habits tab (TICKET-103) — stacks as cards (step rings + streak chips),
 * solo habits below, one-tap done with rest/skip on the row, template gallery
 * when empty.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../src/theme/tokens';
import {
  createHabit,
  createStack,
  HabitRow,
  listHabits,
  listStacks,
  logHabit,
  StackRow,
  streakForHabit,
  todayLogs,
} from '../../src/data/habits';
import { STACK_TEMPLATES } from '../../src/content/stackTemplates';

export default function HabitsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [stacks, setStacks] = useState<StackRow[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [logs, setLogs] = useState<Map<string, string>>(new Map());
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    const [s, h, l] = await Promise.all([listStacks(), listHabits(), todayLogs()]);
    setStacks(s);
    setHabits(h);
    setLogs(new Map(Array.from(l.entries()).map(([k, v]) => [k, v as string])));
    const entries = await Promise.all(h.map(async (habit) => [habit.id, (await streakForHabit(habit.id)).current] as const));
    setStreaks(new Map(entries));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const mark = async (habitId: string, status: 'done' | 'rest' | 'skip'): Promise<void> => {
    await logHabit(habitId, status);
    if (status === 'done') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    await load();
  };

  const useTemplate = async (key: string): Promise<void> => {
    const t = STACK_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const stackId = await createStack({ name: t.name, anchorType: t.anchorType, anchorValue: t.anchorValue });
    let pos = 0;
    for (const step of t.steps) {
      await createHabit({
        name: step.name,
        icon: step.icon,
        stackId,
        stackPosition: pos++,
        estDurationSec: step.estDurationSec ?? null,
      });
    }
    await load();
  };

  const renderHabitRow = (h: HabitRow): React.ReactElement => {
    const status = logs.get(h.id);
    const streak = streaks.get(h.id) ?? 0;
    return (
      <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: HIT_TARGET + 4, paddingVertical: spacing.s1 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status === 'done' ? `${h.name}, done — tap to log again` : `Mark ${h.name} done`}
          onPress={() => void mark(h.id, 'done')}
          style={({ pressed }) => ({
            width: HIT_TARGET,
            height: HIT_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons
            name={status === 'done' ? 'checkmark-circle' : status === 'rest' ? 'pause-circle-outline' : status === 'skip' ? 'play-skip-forward-circle-outline' : 'ellipse-outline'}
            size={28}
            color={status === 'done' ? c.statusSuccess : c.textTertiary}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${h.name}`}
          onPress={() => router.push({ pathname: '/habit-editor', params: { habitId: h.id } })}
          style={{ flex: 1, marginLeft: spacing.s1 }}
        >
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>{h.name}</Text>
          {streak > 0 ? (
            <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, fontVariant: ['tabular-nums'] }}>
              {streak}-day streak
            </Text>
          ) : null}
        </Pressable>
        {!status ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Log rest day for ${h.name}`}
            onPress={() => void mark(h.id, 'rest')}
            style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="moon-outline" size={20} color={c.textTertiary} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const soloHabits = habits.filter((h) => h.stack_id == null);

  return (
    <ScreenLayout>
      {stacks.length === 0 && habits.length === 0 ? (
        <>
          <EmptyState
            icon="repeat-outline"
            title="Build your first stack"
            body="A stack is a short chain of habits on one anchor — wake up, read ten pages, stretch, brush, wash face."
          />
          <SectionTitle top={0}>Templates</SectionTitle>
          {STACK_TEMPLATES.map((t) => (
            <Card key={t.key} onPress={() => void useTemplate(t.key)} accessibilityLabel={`Use template ${t.name}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>{t.name}</Text>
                  <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginTop: spacing.s1 }}>
                    {t.steps.map((s) => s.name).join(' → ')}
                  </Text>
                </View>
                <Ionicons name="add-circle-outline" size={26} color={c.accentDefault} />
              </View>
            </Card>
          ))}
        </>
      ) : (
        <>
          <SectionTitle top={spacing.s3}>Stacks</SectionTitle>
          {stacks.map((s) => {
            const steps = habits.filter((h) => h.stack_id === s.id);
            if (steps.length === 0) return null;
            const done = steps.filter((h) => logs.get(h.id) != null).length;
            return (
              <Card key={s.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.s2 }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyLg }}>{s.name}</Text>
                    <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, fontVariant: ['tabular-nums'] }}>
                      {done}/{steps.length} today · {s.anchor_type === 'time' ? s.anchor_value : 'after ' + s.anchor_value.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Run ${s.name}`}
                    onPress={() => router.push({ pathname: '/stack-player', params: { stackId: s.id } })}
                    style={({ pressed }) => ({
                      minHeight: HIT_TARGET,
                      minWidth: HIT_TARGET,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radius.full,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Ionicons name="play-circle" size={34} color={c.accentDefault} />
                  </Pressable>
                </View>
                {steps.map(renderHabitRow)}
              </Card>
            );
          })}

          {soloHabits.length > 0 ? (
            <>
              <SectionTitle>Habits</SectionTitle>
              <Card>{soloHabits.map(renderHabitRow)}</Card>
            </>
          ) : null}
        </>
      )}

      <PFButton label="New habit or stack" icon="add-outline" onPress={() => router.push('/habit-editor')} style={{ marginTop: spacing.s4 }} />
    </ScreenLayout>
  );
}
