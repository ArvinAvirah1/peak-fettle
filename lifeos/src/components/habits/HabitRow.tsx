/**
 * HabitRow (T152/T153/T154/T156/T157) — one habit row, type-aware, used
 * inside Cards on the Habits screen (both stack steps and solo habits).
 *
 * Gestures (T152): swipe RIGHT (finger drags left→right, revealing the LEFT
 * action pane) = complete (onDone). Swipe LEFT (finger drags right→left,
 * revealing the RIGHT action pane) = open the rest/skip sheet (onRestSkip).
 * Built on ReanimatedSwipeable so the reveal is spring-driven and
 * reduce-motion is inherited from reanimated's global config. The check-off
 * circle remains a plain 44pt tappable control so the swipe is never the
 * ONLY way to complete a habit (a11y).
 *
 * Long-press on the row body = quick actions. Plain tap on the row body =
 * open the detail sheet.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../theme/tokens';
import { Ionicons } from '../Icon';
import { haptic } from '../../lib/haptics';
import { springs } from '../motion';
import type { HabitLogRow, HabitRow as HabitRowModel } from '../../data/habits';
import type { WeekProgress } from '../../engine/streaks';

export interface HabitRowStreakSummary {
  current: number;
  longest: number;
  milestone: 7 | 30 | 100 | 365 | null;
  unit: 'day' | 'week';
  atRisk: boolean;
  graceDaysUsed: string[];
}

export interface HabitRowProps {
  habit: HabitRowModel;
  log: HabitLogRow | undefined;
  summary: HabitRowStreakSummary | undefined;
  week: WeekProgress | null;
  paused: boolean;
  onDone: () => void;
  onRestSkip: () => void;
  onQuickActions: () => void;
  onOpenDetail: () => void;
  onAddQuantity: (delta: number) => void;
  onTimerStop: (minutes: number) => void;
}

const SWIPE_THRESHOLD = 88;

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function HabitRow({
  habit,
  log,
  summary,
  week,
  paused,
  onDone,
  onRestSkip,
  onQuickActions,
  onOpenDetail,
  onAddQuantity,
  onTimerStop,
}: HabitRowProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const reducedMotion = useReducedMotion();
  const swipeableRef = useRef<SwipeableMethods>(null);
  const checkScale = useSharedValue(1);

  const isDone = log?.status === 'done';
  const disabled = paused;

  const checkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const pulseCheck = (): void => {
    if (reducedMotion) return;
    checkScale.value = withSpring(1.18, springs.bouncy, () => {
      checkScale.value = withSpring(1, springs.bouncy);
    });
  };

  const handleDone = (): void => {
    if (disabled) return;
    pulseCheck();
    haptic.success();
    onDone();
  };

  // --- timer state (foreground only, no persistence) --------------------------
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startEpochRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimerInterval = (): void => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => clearTimerInterval, []);

  const startTimer = (): void => {
    if (disabled) return;
    haptic.impact('medium');
    const nowEpoch = Date.now();
    startEpochRef.current = nowEpoch;
    setElapsedSec(0);
    setRunning(true);
    clearTimerInterval();
    intervalRef.current = setInterval(() => {
      const start = startEpochRef.current;
      if (start == null) return;
      setElapsedSec((Date.now() - start) / 1000);
    }, 1000);
  };

  const stopTimer = (): void => {
    clearTimerInterval();
    const start = startEpochRef.current;
    const secs = start != null ? (Date.now() - start) / 1000 : elapsedSec;
    setRunning(false);
    startEpochRef.current = null;
    const minutes = Math.max(0.1, Math.round((secs / 60) * 10) / 10);
    haptic.success();
    onTimerStop(minutes);
  };

  // --- swipe underlays ----------------------------------------------------------

  const renderLeftActions = (): React.ReactElement => (
    <View
      style={{
        flex: 1,
        backgroundColor: c.accentMuted,
        justifyContent: 'center',
        paddingHorizontal: spacing.s5,
        borderRadius: radius.md,
      }}
    >
      <Ionicons name="checkmark-circle" size={26} color={c.statusSuccess} accessibilityLabel="Complete" />
    </View>
  );

  const renderRightActions = (): React.ReactElement => (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bgElevated,
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingHorizontal: spacing.s5,
        borderRadius: radius.md,
      }}
    >
      <Ionicons name="moon-outline" size={24} color={c.textTertiary} accessibilityLabel="Rest or skip" />
    </View>
  );

  const onSwipeableWillOpen = (direction: 'left' | 'right'): void => {
    // RNGH direction naming: 'left' means the LEFT action pane is opening
    // (finger dragged left→right) = complete. 'right' means the RIGHT pane
    // opens (finger dragged right→left) = rest/skip.
    if (direction === 'left') {
      handleDone();
    } else {
      onRestSkip();
    }
    swipeableRef.current?.close();
  };

  // --- meta chips -----------------------------------------------------------------

  const streakLabel = summary && summary.current > 0 ? `${summary.current}-${summary.unit} streak` : null;
  const quotaLabel = week != null ? `${week.done} of ${week.quota} this week` : null;
  const showGrace = !!summary?.atRisk;
  const hasNote = !!log?.note;

  const middleWidth = 64;

  return (
    <View style={{ marginBottom: spacing.s2 }}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={2}
        leftThreshold={SWIPE_THRESHOLD}
        rightThreshold={SWIPE_THRESHOLD}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={onSwipeableWillOpen}
        overshootLeft={false}
        overshootRight={false}
        enabled={!disabled}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: HIT_TARGET + 4,
            paddingVertical: spacing.s1,
            backgroundColor: c.bgSecondary,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {/* Check-off circle — plain tappable 44pt control, accessible alternative to swipe. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isDone ? `${habit.name}, done — tap to log again` : `Mark ${habit.name} done`}
            onPress={handleDone}
            style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            <Animated.View style={checkAnimatedStyle}>
              <Ionicons
                name={isDone ? 'checkmark-circle' : 'ellipse-outline'}
                size={28}
                color={isDone ? c.statusSuccess : c.textTertiary}
              />
            </Animated.View>
          </Pressable>

          {/* Name + meta — tap = detail, long-press = quick actions. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${habit.name}, open details`}
            onPress={onOpenDetail}
            onLongPress={() => {
              haptic.impact('medium');
              onQuickActions();
            }}
            style={{ flex: 1, marginLeft: spacing.s1, paddingRight: spacing.s2 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>
                {habit.name}
              </Text>
              {hasNote ? (
                <Ionicons
                  name="document-text-outline"
                  size={14}
                  color={c.textTertiary}
                  style={{ marginLeft: spacing.s2 }}
                  accessibilityLabel="Has a note today"
                />
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: spacing.s1 }}>
              {streakLabel ? <MetaChip label={streakLabel} tone="tertiary" /> : null}
              {quotaLabel ? <MetaChip label={quotaLabel} tone={week?.met ? 'accent' : 'tertiary'} /> : null}
              {paused ? <MetaChip label="Paused" icon="pause-circle-outline" tone="tertiary" /> : null}
              {showGrace ? <MetaChip label="grace day — today still counts" tone="muted" /> : null}
            </View>
          </Pressable>

          {/* Type-aware control. */}
          <View style={{ width: middleWidth, alignItems: 'flex-end' }}>
            {habit.habit_type === 'quantity' ? (
              <QuantityControl habit={habit} log={log} disabled={disabled} onAddQuantity={onAddQuantity} />
            ) : habit.habit_type === 'timer' ? (
              <TimerControl
                habit={habit}
                log={log}
                disabled={disabled}
                running={running}
                elapsedSec={elapsedSec}
                onStart={startTimer}
                onStop={stopTimer}
              />
            ) : null}
          </View>

          {/* Quick actions affordance (explicit control in addition to long-press). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${habit.name}`}
            onPress={() => {
              haptic.impact('medium');
              onQuickActions();
            }}
            style={{ width: 28, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={c.textTertiary} />
          </Pressable>
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}

// ---------------------------------------------------------------------------

function MetaChip({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: 'tertiary' | 'accent' | 'muted';
  icon?: string;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const fg = tone === 'accent' ? c.accentDefault : tone === 'muted' ? c.accentDefault : c.textTertiary;
  const bg = tone === 'muted' ? c.accentMuted : 'transparent';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        borderRadius: radius.full,
        paddingHorizontal: tone === 'muted' ? spacing.s2 : 0,
        paddingVertical: tone === 'muted' ? 2 : 0,
        marginRight: spacing.s3,
        marginTop: 2,
      }}
    >
      {icon ? <Ionicons name={icon} size={11} color={fg} style={{ marginRight: 3 }} /> : null}
      <Text
        style={{
          color: fg,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          fontVariant: ['tabular-nums'],
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function QuantityControl({
  habit,
  log,
  disabled,
  onAddQuantity,
}: {
  habit: HabitRowModel;
  log: HabitLogRow | undefined;
  disabled: boolean;
  onAddQuantity: (delta: number) => void;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const value = log?.value ?? 0;
  const target = habit.target_value;
  const unit = habit.target_unit ?? '';
  const met = target != null && value >= target;

  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={met ? `${habit.name} target met` : `Add 1 ${unit} to ${habit.name}`}
        disabled={disabled}
        onPress={() => {
          haptic.impact('light');
          onAddQuantity(1);
        }}
        style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons
          name={met ? 'checkmark-circle' : 'add-circle-outline'}
          size={28}
          color={met ? c.statusSuccess : c.accentDefault}
        />
      </Pressable>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          fontVariant: ['tabular-nums'],
        }}
      >
        {target != null ? `${value} of ${target} ${unit}` : `${value} ${unit}`}
      </Text>
    </View>
  );
}

function TimerControl({
  habit,
  log,
  disabled,
  running,
  elapsedSec,
  onStart,
  onStop,
}: {
  habit: HabitRowModel;
  log: HabitLogRow | undefined;
  disabled: boolean;
  running: boolean;
  elapsedSec: number;
  onStart: () => void;
  onStop: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const value = log?.value ?? 0;
  const target = habit.target_value;
  const unit = habit.target_unit ?? 'min';

  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={running ? `Stop timer for ${habit.name}` : `Start timer for ${habit.name}`}
        disabled={disabled}
        onPress={() => {
          if (running) onStop();
          else onStart();
        }}
        style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons
          name={running ? 'stop-circle' : 'play-circle-outline'}
          size={28}
          color={running ? c.statusWarning : c.accentDefault}
        />
      </Pressable>
      <Text
        style={{
          color: c.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.caption,
          fontVariant: ['tabular-nums'],
        }}
      >
        {running ? formatElapsed(elapsedSec) : target != null ? `${value} of ${target} ${unit}` : `${value} ${unit}`}
      </Text>
    </View>
  );
}
