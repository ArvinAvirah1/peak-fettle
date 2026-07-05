/**
 * HabitDetailSheet (T155/T156/T157) — bottom sheet with stat tiles, the
 * activity heatmap, recent history (with note display), and footer actions
 * (edit / pause-resume / add note). Loads its own data on open.
 *
 * Known device bug (CLAUDE.md): safe-area does NOT propagate inside RN
 * Modal — insets are applied directly to the header row and sheet bottom
 * padding rather than relying on SafeAreaView inside the Modal.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../theme/tokens';
import { Ionicons } from '../Icon';
import { PFButton } from '../ui';
import { haptic } from '../../lib/haptics';
import { dayKey } from '../../db/localDb';
import {
  historyForHabit,
  HabitLogRow,
  HabitPauseRow,
  HabitRow as HabitRowModel,
  logsForHabit,
  pausesForHabit,
  streakSummaryForHabit,
  weekProgressForHabit,
} from '../../data/habits';
import { consistency, LogStatus, PauseRange, WeekProgress } from '../../engine/streaks';
import { Heatmap } from './Heatmap';

export interface HabitDetailSheetProps {
  visible: boolean;
  habit: HabitRowModel | null;
  onClose: () => void;
  onEdit: () => void;
  onPause: () => void;
  onNote: (date: string, initialNote: string) => void;
}

interface StreakSummaryShape {
  current: number;
  longest: number;
  milestone: 7 | 30 | 100 | 365 | null;
  unit: 'day' | 'week';
  atRisk: boolean;
  graceDaysUsed: string[];
}

const STATUS_LABEL: Record<LogStatus, string> = {
  done: 'Done',
  rest: 'Rest',
  skip: 'Skipped',
};

const STATUS_ICON: Record<LogStatus, string> = {
  done: 'checkmark-circle',
  rest: 'moon-outline',
  skip: 'play-skip-forward-outline',
};

export function HabitDetailSheet({
  visible,
  habit,
  onClose,
  onEdit,
  onPause,
  onNote,
}: HabitDetailSheetProps): React.ReactElement | null {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [logs, setLogs] = useState<Map<string, LogStatus>>(new Map());
  const [history, setHistory] = useState<HabitLogRow[]>([]);
  const [pauses, setPauses] = useState<PauseRange[]>([]);
  const [activePauseRow, setActivePauseRow] = useState<HabitPauseRow | null>(null);
  const [summary, setSummary] = useState<StreakSummaryShape | null>(null);
  const [week, setWeek] = useState<WeekProgress | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !habit) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [logsMap, hist, pauseRanges, sum, wk] = await Promise.all([
        logsForHabit(habit.id),
        historyForHabit(habit.id, 14),
        pausesForHabit(habit.id),
        streakSummaryForHabit(habit),
        weekProgressForHabit(habit),
      ]);
      if (cancelled) return;
      setLogs(logsMap);
      setHistory(hist);
      setPauses(pauseRanges);
      setSummary(sum);
      setWeek(wk);
      const today = dayKey();
      const covering = pauseRanges.find((p) => p.start_date <= today && (p.end_date === null || today <= p.end_date));
      setActivePauseRow(
        covering
          ? { id: '', habit_id: habit.id, start_date: covering.start_date, end_date: covering.end_date, reason: null }
          : null
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, habit]);

  if (!habit) return null;

  const today = dayKey();
  const consistencyResult = consistency(logs, today, 365, pauses);
  const consistencyPct = Math.round(consistencyResult.ratio * 100);
  const isPaused = activePauseRow != null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}>
        <View
          style={{
            maxHeight: '85%',
            backgroundColor: c.bgSecondary,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.s4,
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: spacing.s2,
              borderBottomWidth: 1,
              borderBottomColor: c.borderDefault,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
              <Ionicons name={habit.icon} size={22} color={c.accentDefault} />
              <Text
                numberOfLines={1}
                style={{
                  color: c.textPrimary,
                  fontFamily: fontFamily.semibold,
                  fontSize: fontSize.heading3,
                  marginLeft: spacing.s2,
                }}
              >
                {habit.name}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={24} color={c.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.s4, paddingBottom: spacing.s8 }}>
            {/* Stat tiles */}
            <View style={{ flexDirection: 'row', marginBottom: spacing.s5 }}>
              <StatTile
                value={summary ? String(summary.current) : '—'}
                label={summary?.unit === 'week' ? 'week streak' : 'day streak'}
              />
              <StatTile value={summary ? String(summary.longest) : '—'} label="best streak" />
              <StatTile value={`${consistencyPct}%`} label="consistency" />
            </View>

            {week != null ? (
              <Text
                style={{
                  color: week.met ? c.accentDefault : c.textSecondary,
                  fontFamily: fontFamily.medium,
                  fontSize: fontSize.bodySm,
                  fontVariant: ['tabular-nums'],
                  marginBottom: spacing.s4,
                }}
              >
                {week.done} of {week.quota} this week
              </Text>
            ) : null}

            {/* Heatmap */}
            <Text
              style={{
                color: c.textSecondary,
                fontFamily: fontFamily.semibold,
                fontSize: fontSize.bodySm,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                marginBottom: spacing.s2,
              }}
            >
              Activity
            </Text>
            <Heatmap logs={logs} endDay={today} pauses={pauses} />

            {/* Recent history */}
            <Text
              style={{
                color: c.textSecondary,
                fontFamily: fontFamily.semibold,
                fontSize: fontSize.bodySm,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                marginTop: spacing.s6,
                marginBottom: spacing.s2,
              }}
            >
              Recent
            </Text>
            {loading ? (
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>
                Loading…
              </Text>
            ) : history.length === 0 ? (
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>
                Nothing logged yet — that's alright, there's always today.
              </Text>
            ) : (
              history.map((row) => <HistoryRow key={row.id} row={row} habit={habit} />)
            )}
          </ScrollView>

          {/* Footer actions */}
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: spacing.s4,
              paddingTop: spacing.s3,
              borderTopWidth: 1,
              borderTopColor: c.borderDefault,
            }}
          >
            <PFButton
              label="Edit"
              variant="secondary"
              onPress={() => {
                haptic.selection();
                onEdit();
              }}
              style={{ flex: 1, marginRight: spacing.s2 }}
            />
            <PFButton
              label={isPaused ? 'Resume' : 'Pause'}
              variant="ghost"
              onPress={() => {
                haptic.selection();
                onPause();
              }}
              style={{ flex: 1, marginRight: spacing.s2 }}
            />
            <PFButton
              label="Add note"
              variant="ghost"
              onPress={() => {
                haptic.selection();
                const existing = history.find((h) => h.date === today);
                onNote(today, existing?.note ?? '');
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function StatTile({ value, label }: { value: string; label: string }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text
        style={{
          color: c.textPrimary,
          fontFamily: fontFamily.bold,
          fontSize: fontSize.heading2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          marginTop: 2,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function HistoryRow({ row, habit }: { row: HabitLogRow; habit: HabitRowModel }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const unit = habit.target_unit ?? '';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.s2,
        borderBottomWidth: 1,
        borderBottomColor: c.borderDefault,
      }}
    >
      <Ionicons
        name={STATUS_ICON[row.status]}
        size={18}
        color={row.status === 'done' ? c.statusSuccess : c.textTertiary}
      />
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.medium,
          fontSize: fontSize.bodySm,
          marginLeft: spacing.s2,
          width: 84,
        }}
      >
        {row.date}
      </Text>
      <Text style={{ color: c.textPrimary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, width: 64 }}>
        {STATUS_LABEL[row.status]}
      </Text>
      {row.value != null ? (
        <Text
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            fontVariant: ['tabular-nums'],
            marginRight: spacing.s2,
          }}
        >
          {row.value} {unit}
        </Text>
      ) : null}
      {row.note ? (
        <Text
          numberOfLines={1}
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            flex: 1,
            fontStyle: 'italic',
          }}
        >
          {row.note}
        </Text>
      ) : null}
    </View>
  );
}
