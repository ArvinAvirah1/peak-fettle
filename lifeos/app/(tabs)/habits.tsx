/**
 * Habits tab (TICKET-103, T152-T157 "Wave-2A overhaul") — stacks as cards
 * (step rings + streak chips), solo habits below, template gallery when
 * empty. Habit rows are now the shared, type-aware <HabitRow> (gesture
 * check-off, quantity/timer controls, quota + grace chips). Screen hosts
 * the rest/skip sheet, long-press quick-actions sheet, PauseSheet,
 * NoteSheet, HabitDetailSheet, and a milestone Celebration overlay.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Celebration } from '../../src/components/motion';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../src/theme/tokens';
import { haptic } from '../../src/lib/haptics';
import { dayKey } from '../../src/db/localDb';
import {
  activePauses,
  addQuantity,
  createHabit,
  createStack,
  HabitLogRow,
  HabitPauseRow,
  HabitRow as HabitRowModel,
  listHabits,
  listStacks,
  logHabit,
  StackRow,
  streakSummaryForHabit,
  todayLogRows,
  weekProgressForHabit,
} from '../../src/data/habits';
import type { WeekProgress } from '../../src/engine/streaks';
import { STACK_TEMPLATES } from '../../src/content/stackTemplates';
import { HabitRow, HabitRowStreakSummary } from '../../src/components/habits/HabitRow';
import { HabitDetailSheet } from '../../src/components/habits/HabitDetailSheet';
import { PauseSheet } from '../../src/components/habits/PauseSheet';
import { NoteSheet } from '../../src/components/habits/NoteSheet';

type Summary = HabitRowStreakSummary;

export default function HabitsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stacks, setStacks] = useState<StackRow[]>([]);
  const [habits, setHabits] = useState<HabitRowModel[]>([]);
  const [logRows, setLogRows] = useState<Map<string, HabitLogRow>>(new Map());
  const [pauses, setPauses] = useState<Map<string, HabitPauseRow>>(new Map());
  const [summaries, setSummaries] = useState<Map<string, Summary>>(new Map());
  const [weeks, setWeeks] = useState<Map<string, WeekProgress | null>>(new Map());

  // Rest/skip sheet
  const [restSkipHabit, setRestSkipHabit] = useState<HabitRowModel | null>(null);
  // Quick-actions sheet
  const [quickActionsHabit, setQuickActionsHabit] = useState<HabitRowModel | null>(null);
  // Pause sheet
  const [pauseHabit, setPauseHabit] = useState<HabitRowModel | null>(null);
  // Note sheet
  const [noteTarget, setNoteTarget] = useState<{ habit: HabitRowModel; date: string; initialNote: string } | null>(
    null
  );
  // Detail sheet
  const [detailHabit, setDetailHabit] = useState<HabitRowModel | null>(null);

  // Celebration
  const [celebrationRun, setCelebrationRun] = useState(false);

  const load = useCallback(async () => {
    const [s, h, rows, activePausesMap] = await Promise.all([
      listStacks(),
      listHabits(),
      todayLogRows(),
      activePauses(),
    ]);
    setStacks(s);
    setHabits(h);
    setLogRows(rows);
    setPauses(activePausesMap);

    const summaryEntries = await Promise.all(
      h.map(async (habit) => [habit.id, await streakSummaryForHabit(habit)] as const)
    );
    setSummaries(new Map(summaryEntries));

    const weekEntries = await Promise.all(
      h.map(async (habit) => [habit.id, await weekProgressForHabit(habit)] as const)
    );
    setWeeks(new Map(weekEntries));

    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const refreshHabitSummary = useCallback(async (habitId: string, habit: HabitRowModel) => {
    const sum = await streakSummaryForHabit(habit);
    setSummaries((prev) => {
      const next = new Map(prev);
      const prior = next.get(habitId);
      next.set(habitId, sum);
      // Milestone-just-reached celebration: current exactly equals its
      // milestone value (i.e. this update is the one that crossed it).
      if (sum.milestone != null && sum.current === sum.milestone && prior?.current !== sum.current) {
        haptic.success();
        setCelebrationRun(true);
      }
      return next;
    });
    const wk = await weekProgressForHabit(habit);
    setWeeks((prev) => {
      const next = new Map(prev);
      next.set(habitId, wk);
      return next;
    });
  }, []);

  const markDone = useCallback(
    async (habit: HabitRowModel) => {
      await logHabit(habit.id, 'done');
      await load();
      await refreshHabitSummary(habit.id, habit);
    },
    [load, refreshHabitSummary]
  );

  const markRestOrSkip = useCallback(
    async (habit: HabitRowModel, status: 'rest' | 'skip') => {
      await logHabit(habit.id, status);
      setRestSkipHabit(null);
      await load();
      await refreshHabitSummary(habit.id, habit);
    },
    [load, refreshHabitSummary]
  );

  const handleAddQuantity = useCallback(
    async (habit: HabitRowModel, delta: number) => {
      const priorStatus = logRows.get(habit.id)?.status;
      const result = await addQuantity(habit.id, delta);
      await load();
      if (result.status === 'done' && priorStatus !== 'done') {
        await refreshHabitSummary(habit.id, habit);
      }
    },
    [load, refreshHabitSummary, logRows]
  );

  const handleTimerStop = useCallback(
    async (habit: HabitRowModel, minutes: number) => {
      const priorStatus = logRows.get(habit.id)?.status;
      const result = await addQuantity(habit.id, minutes);
      await load();
      if (result.status === 'done' && priorStatus !== 'done') {
        await refreshHabitSummary(habit.id, habit);
      }
    },
    [load, refreshHabitSummary, logRows]
  );

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

  const soloHabits = useMemo(() => habits.filter((h) => h.stack_id == null), [habits]);

  const renderHabitRow = (h: HabitRowModel): React.ReactElement => (
    <HabitRow
      key={h.id}
      habit={h}
      log={logRows.get(h.id)}
      summary={summaries.get(h.id)}
      week={weeks.get(h.id) ?? null}
      paused={pauses.has(h.id)}
      onDone={() => void markDone(h)}
      onRestSkip={() => setRestSkipHabit(h)}
      onQuickActions={() => setQuickActionsHabit(h)}
      onOpenDetail={() => setDetailHabit(h)}
      onAddQuantity={(delta) => void handleAddQuantity(h, delta)}
      onTimerStop={(minutes) => void handleTimerStop(h, minutes)}
    />
  );

  const isEmpty = !loading && stacks.length === 0 && habits.length === 0;

  return (
    <ScreenLayout>
      {loading ? null : isEmpty ? (
        <>
          <EmptyState
            icon="repeat-outline"
            illustration="habits"
            title="Build your first stack"
            body="A stack is a short chain of habits on one anchor — wake up, read ten pages, stretch, brush, wash face."
          />
          <SectionTitle top={0}>Templates</SectionTitle>
          {STACK_TEMPLATES.map((t) => (
            <Card key={t.key} onPress={() => void useTemplate(t.key)} accessibilityLabel={`Use template ${t.name}`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
                    {t.name}
                  </Text>
                  <Text
                    style={{
                      color: c.textSecondary,
                      fontFamily: fontFamily.regular,
                      fontSize: fontSize.bodySm,
                      marginTop: spacing.s1,
                    }}
                  >
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
            const done = steps.filter((h) => logRows.get(h.id)?.status != null).length;
            return (
              <Card key={s.id}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: spacing.s2,
                  }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyLg }}>
                      {s.name}
                    </Text>
                    <Text
                      style={{
                        color: c.textTertiary,
                        fontFamily: fontFamily.regular,
                        fontSize: fontSize.caption,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {done}/{steps.length} today ·{' '}
                      {s.anchor_type === 'time' ? s.anchor_value : 'after ' + s.anchor_value.replace(/_/g, ' ')}
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

      {/* Rest/skip sheet */}
      <Modal visible={!!restSkipHabit} animationType="fade" transparent onRequestClose={() => setRestSkipHabit(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}
          onPress={() => setRestSkipHabit(null)}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: c.bgSecondary,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.s5,
            }}
          >
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: fontFamily.semibold,
                fontSize: fontSize.heading3,
                marginBottom: spacing.s4,
              }}
            >
              {restSkipHabit?.name}
            </Text>
            <PFButton
              label="Log a rest day"
              variant="secondary"
              icon="moon-outline"
              onPress={() => restSkipHabit && void markRestOrSkip(restSkipHabit, 'rest')}
              style={{ marginBottom: spacing.s3 }}
            />
            <PFButton
              label="Skip today"
              variant="ghost"
              icon="play-skip-forward-outline"
              onPress={() => restSkipHabit && void markRestOrSkip(restSkipHabit, 'skip')}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick-actions sheet (long-press) */}
      <Modal
        visible={!!quickActionsHabit}
        animationType="fade"
        transparent
        onRequestClose={() => setQuickActionsHabit(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}
          onPress={() => setQuickActionsHabit(null)}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: c.bgSecondary,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: spacing.s5,
            }}
          >
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: fontFamily.semibold,
                fontSize: fontSize.heading3,
                marginBottom: spacing.s4,
              }}
            >
              {quickActionsHabit?.name}
            </Text>
            <PFButton
              label="View details"
              variant="secondary"
              icon="stats-chart-outline"
              onPress={() => {
                const h = quickActionsHabit;
                setQuickActionsHabit(null);
                if (h) setDetailHabit(h);
              }}
              style={{ marginBottom: spacing.s3 }}
            />
            <PFButton
              label="Pause habit"
              variant="ghost"
              icon="pause-circle-outline"
              onPress={() => {
                const h = quickActionsHabit;
                setQuickActionsHabit(null);
                if (h) setPauseHabit(h);
              }}
              style={{ marginBottom: spacing.s3 }}
            />
            <PFButton
              label="Add a note for today"
              variant="ghost"
              icon="document-text-outline"
              onPress={() => {
                const h = quickActionsHabit;
                setQuickActionsHabit(null);
                if (h) setNoteTarget({ habit: h, date: dayKey(), initialNote: logRows.get(h.id)?.note ?? '' });
              }}
              style={{ marginBottom: spacing.s3 }}
            />
            <PFButton
              label="Edit habit"
              variant="ghost"
              icon="create-outline"
              onPress={() => {
                const h = quickActionsHabit;
                setQuickActionsHabit(null);
                if (h) router.push({ pathname: '/habit-editor', params: { habitId: h.id } });
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Pause sheet — cross-agent contract component. */}
      <PauseSheet
        visible={!!pauseHabit}
        habitId={pauseHabit?.id ?? ''}
        habitName={pauseHabit?.name ?? ''}
        activePause={pauseHabit ? pauses.get(pauseHabit.id) ?? null : null}
        onClose={() => setPauseHabit(null)}
        onChanged={() => void load()}
      />

      {/* Note sheet — cross-agent contract component. */}
      <NoteSheet
        visible={!!noteTarget}
        habitId={noteTarget?.habit.id ?? ''}
        habitName={noteTarget?.habit.name ?? ''}
        date={noteTarget?.date ?? dayKey()}
        initialNote={noteTarget?.initialNote ?? ''}
        onClose={() => setNoteTarget(null)}
        onSaved={() => void load()}
      />

      {/* Detail sheet */}
      <HabitDetailSheet
        visible={!!detailHabit}
        habit={detailHabit}
        onClose={() => setDetailHabit(null)}
        onEdit={() => {
          const h = detailHabit;
          setDetailHabit(null);
          if (h) router.push({ pathname: '/habit-editor', params: { habitId: h.id } });
        }}
        onPause={() => {
          const h = detailHabit;
          setDetailHabit(null);
          if (h) setPauseHabit(h);
        }}
        onNote={(date, initialNote) => {
          const h = detailHabit;
          setDetailHabit(null);
          if (h) setNoteTarget({ habit: h, date, initialNote });
        }}
      />

      <Celebration run={celebrationRun} onDone={() => setCelebrationRun(false)} particleCount={140} />
    </ScreenLayout>
  );
}
