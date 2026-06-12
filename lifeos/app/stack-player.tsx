/**
 * Stack player (TICKET-103) — full-screen guided run-through, StepperLogger-
 * style: one step at a time, optional countdown, check/skip, haptic per
 * completion, slide-up step transitions (reduced-motion aware), summary.
 * Partial completion counts (Q22) — every step logs independently.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, ScreenLayout } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { HabitRow, habitsInStack, logHabit, todayLogs } from '../src/data/habits';

export default function StackPlayerScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { stackId } = useLocalSearchParams<{ stackId: string }>();

  const [steps, setSteps] = useState<HabitRow[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, 'done' | 'skip'>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      if (!stackId) return;
      const all = await habitsInStack(stackId);
      const logged = await todayLogs();
      const remaining = all.filter((h) => !logged.has(h.id));
      setSteps(remaining.length > 0 ? remaining : all);
    })();
  }, [stackId]);

  const current = steps[index];

  // optional per-step countdown — purely informative, never blocks the buttons
  useEffect(() => {
    if (!current?.est_duration_sec) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(current.est_duration_sec);
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s != null && s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [current?.id, current?.est_duration_sec]);

  const advance = useCallback(
    async (status: 'done' | 'skip') => {
      if (!current) return;
      await logHabit(current.id, status === 'done' ? 'done' : 'skip');
      if (status === 'done') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      }
      setResults((prev) => ({ ...prev, [current.id]: status }));
      if (index < steps.length - 1) setIndex(index + 1);
      else setFinished(true);
    },
    [current, index, steps.length]
  );

  const doneCount = useMemo(() => Object.values(results).filter((r) => r === 'done').length, [results]);

  const mmss = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  if (finished || (steps.length > 0 && index >= steps.length)) {
    return (
      <ScreenLayout scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={c.statusSuccess} />
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading2, marginTop: spacing.s4, fontVariant: ['tabular-nums'] }}>
            {doneCount}/{steps.length}
          </Text>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s2, textAlign: 'center' }}>
            {doneCount === steps.length ? 'Clean sweep. See you tomorrow.' : 'Every step you did counts. The rest will keep.'}
          </Text>
          <PFButton label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: spacing.s8 }} />
        </View>
      </ScreenLayout>
    );
  }

  if (!current) {
    return (
      <ScreenLayout scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <PFButton label="Close" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scroll={false} edges={['top', 'bottom']}>
      {/* header: progress + close */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.s2 }}>
        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }}>
          Step {index + 1} of {steps.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close player"
          onPress={() => router.back()}
          style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close-outline" size={26} color={c.textSecondary} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: spacing.s6 }}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.full,
              marginRight: i < steps.length - 1 ? spacing.s1 : 0,
              backgroundColor: i < index ? c.statusSuccess : i === index ? c.accentDefault : c.borderDefault,
            }}
          />
        ))}
      </View>

      <Animated.View
        key={current.id}
        entering={reducedMotion ? undefined : FadeInDown.duration(240)}
        exiting={reducedMotion ? undefined : FadeOut.duration(160)}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      >
        <Ionicons name={current.icon} size={48} color={c.accentDefault} />
        <Text
          accessibilityRole="header"
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading2,
            textAlign: 'center',
            marginTop: spacing.s5,
            paddingHorizontal: spacing.s6,
          }}
        >
          {current.name}
        </Text>
        {secondsLeft != null ? (
          <Text
            style={{
              color: secondsLeft === 0 ? c.statusSuccess : c.textSecondary,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.heading1,
              marginTop: spacing.s5,
              fontVariant: ['tabular-nums'],
            }}
          >
            {mmss(secondsLeft)}
          </Text>
        ) : null}
      </Animated.View>

      <View style={{ paddingBottom: spacing.s4 }}>
        <PFButton label="Done" icon="checkmark-outline" onPress={() => void advance('done')} />
        <PFButton label="Skip for today" variant="ghost" onPress={() => void advance('skip')} style={{ marginTop: spacing.s2 }} />
      </View>
    </ScreenLayout>
  );
}
