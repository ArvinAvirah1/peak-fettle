/**
 * Stack player (TICKET-103, extended TICKET-165) - full-screen guided
 * run-through, StepperLogger-style: one step at a time, optional countdown +
 * auto-advance, check/skip, haptic per completion, slide-up step transitions
 * (reduced-motion aware), overall progress ring, summary. Partial completion
 * counts (Q22) - every step logs independently.
 *
 * TICKET-165 additions:
 *  - Overall progress ring (SVG, same technique as unlock.tsx) around a
 *    "{resolved}/{total}" center readout, plus the original slim per-step
 *    segment strip underneath the header.
 *  - Per-step countdown auto-advances 5s after hitting 0 (cancelable per
 *    step via "Stay on this step"); steps without a duration never auto-
 *    advance.
 *  - Minimize: a new header button stashes state in playerSession.ts and
 *    pops the screen while the run (and its Live Activity) keeps going; the
 *    Today tab reads that session read-only to render a resume pill. The X
 *    close button fully ends the run instead.
 *  - Live Activity start/update/end via the existing native-module bridge
 *    (modules/live-activity) - Dynamic Island / lock-screen countdown.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, ScreenLayout } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { haptic } from '../src/lib/haptics';
import { HabitRow, habitsInStack, listStacks, logHabit, todayLogs } from '../src/data/habits';
import {
  getPlayerSession,
  setPlayerSession,
  updatePlayerSession,
} from '../src/lib/playerSession';
import { liveActivity } from '../modules/live-activity';

const AUTO_ADVANCE_SEC = 5;
const FALLBACK_STEP_SEC = 60;

export default function StackPlayerScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { stackId, resume } = useLocalSearchParams<{ stackId: string; resume?: string }>();

  const [steps, setSteps] = useState<HabitRow[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, 'done' | 'skip'>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [autoAdvanceIn, setAutoAdvanceIn] = useState<number | null>(null);
  const [autoAdvanceCancelledFor, setAutoAdvanceCancelledFor] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [stackDoneCount, setStackDoneCount] = useState(0);

  // Guards against double-logging: the auto-advance timer and a manual Done
  // tap can race in the same tick window.
  const advancingRef = useRef(false);

  // --- load steps + establish/resume the player session ------------------------

  useEffect(() => {
    (async () => {
      if (!stackId) return;
      const all = await habitsInStack(stackId);
      const logged = await todayLogs();
      const remaining = all.filter((h) => !logged.has(h.id));
      const run = remaining.length > 0 ? remaining : all;
      setSteps(run);

      const stacks = await listStacks();
      const name = stacks.find((s) => s.id === stackId)?.name ?? 'Stack';

      const doneCount = all.filter((h) => logged.get(h.id) === 'done').length;
      setStackDoneCount(doneCount);

      const existing = getPlayerSession();
      const isResume = resume === '1' && existing?.stackId === stackId;

      if (isResume) {
        updatePlayerSession({ minimized: false });
      } else {
        setPlayerSession({
          stackId,
          stackName: name,
          stepIndex: 0,
          totalSteps: all.length,
          doneCount,
          minimized: false,
          startedAtISO: new Date().toISOString(),
        });

        // Fresh run only (not a resume-from-pill) - start the Live Activity.
        const totalSec = run.reduce((sum, h) => sum + (h.est_duration_sec ?? FALLBACK_STEP_SEC), 0);
        const estimatedEnd = new Date(Date.now() + totalSec * 1000).toISOString();
        liveActivity.start(name, estimatedEnd, c.accentDefault);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackId]);

  const current = steps[index];

  // --- optional per-step countdown -> auto-advance ------------------------------

  useEffect(() => {
    advancingRef.current = false;
    setAutoAdvanceIn(null);
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

  // Countdown hit zero -> arm the auto-advance window (unless the user
  // already cancelled it for this exact step).
  useEffect(() => {
    if (secondsLeft !== 0 || !current) return;
    if (autoAdvanceCancelledFor === current.id) return;
    setAutoAdvanceIn(AUTO_ADVANCE_SEC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, current?.id, autoAdvanceCancelledFor]);

  // Auto-advance ticker.
  useEffect(() => {
    if (autoAdvanceIn == null) return;
    if (autoAdvanceIn <= 0) {
      void advance('done', { auto: true });
      return;
    }
    const timer = setTimeout(() => setAutoAdvanceIn((n) => (n != null ? n - 1 : null)), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdvanceIn]);

  const cancelAutoAdvance = useCallback(() => {
    if (!current) return;
    setAutoAdvanceIn(null);
    setAutoAdvanceCancelledFor(current.id);
    haptic.selection();
  }, [current]);

  // --- advance / finish ----------------------------------------------------------

  const advance = useCallback(
    async (status: 'done' | 'skip', opts?: { auto?: boolean }) => {
      if (!current || advancingRef.current) return;
      advancingRef.current = true;
      setAutoAdvanceIn(null);

      await logHabit(current.id, status === 'done' ? 'done' : 'skip');
      if (status === 'done') {
        haptic.success();
      } else if (!opts?.auto) {
        haptic.selection();
      }

      setResults((prev) => ({ ...prev, [current.id]: status }));

      const nextStackDoneCount = status === 'done' ? stackDoneCount + 1 : stackDoneCount;
      setStackDoneCount(nextStackDoneCount);

      const isLast = index >= steps.length - 1;
      const nextIndex = isLast ? index : index + 1;
      if (!isLast) setIndex(nextIndex);
      else setFinished(true);

      updatePlayerSession({ stepIndex: nextIndex, doneCount: nextStackDoneCount });
      liveActivity.update(nextStackDoneCount, null);

      if (isLast) {
        setPlayerSession(null);
        liveActivity.end();
      }
    },
    [current, index, steps.length, stackDoneCount]
  );

  const resolvedCount = useMemo(() => Object.keys(results).length, [results]);
  const doneCount = useMemo(() => Object.values(results).filter((r) => r === 'done').length, [results]);
  const runProgress = steps.length > 0 ? resolvedCount / steps.length : 0;

  const mmss = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleMinimize = useCallback(() => {
    updatePlayerSession({ minimized: true });
    router.back();
  }, [router]);

  const handleClose = useCallback(() => {
    setPlayerSession(null);
    liveActivity.end();
    router.back();
  }, [router]);

  const handleFinishDone = useCallback(() => {
    setPlayerSession(null);
    liveActivity.end();
    router.back();
  }, [router]);

  // --- progress ring geometry (shared by run + finish screens) ------------------

  const R = 64;
  const CIRC = 2 * Math.PI * R;

  function ProgressRing({
    progress,
    label,
    complete,
  }: {
    progress: number;
    label: string;
    complete: boolean;
  }): React.ReactElement {
    return (
      <View style={{ width: 152, height: 152, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={152} height={152} style={{ position: 'absolute' }}>
          <Circle cx={76} cy={76} r={R} stroke={c.borderDefault} strokeWidth={8} fill="none" />
          <Circle
            cx={76}
            cy={76}
            r={R}
            stroke={complete ? c.statusSuccess : c.accentDefault}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 76 76)"
          />
        </Svg>
        <Text
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading1,
            fontVariant: ['tabular-nums'],
          }}
        >
          {label}
        </Text>
      </View>
    );
  }

  // --- finish screen ---------------------------------------------------------------

  useEffect(() => {
    if (finished) haptic.success();
  }, [finished]);

  if (finished || (steps.length > 0 && index >= steps.length)) {
    return (
      <ScreenLayout scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ProgressRing
            progress={steps.length > 0 ? resolvedCount / steps.length : 1}
            label={`${doneCount}/${steps.length}`}
            complete={doneCount === steps.length}
          />
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s5, textAlign: 'center', paddingHorizontal: spacing.s6 }}>
            {doneCount === steps.length ? 'Clean sweep. See you tomorrow.' : 'Every step you did counts. The rest will keep.'}
          </Text>
          <PFButton label="Done" onPress={handleFinishDone} style={{ alignSelf: 'stretch', marginTop: spacing.s8 }} />
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
      {/* header: minimize + step count + close */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.s2 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Minimize player"
          onPress={handleMinimize}
          style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-down-outline" size={24} color={c.textSecondary} />
        </Pressable>
        <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }}>
          Step {index + 1} of {steps.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close player"
          onPress={handleClose}
          style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close-outline" size={26} color={c.textSecondary} />
        </Pressable>
      </View>

      {/* slim per-step segment strip */}
      <View style={{ flexDirection: 'row', marginTop: spacing.s2, marginBottom: spacing.s5 }}>
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
        <ProgressRing progress={runProgress} label={`${resolvedCount}/${steps.length}`} complete={resolvedCount === steps.length} />

        <Ionicons name={current.icon} size={40} color={c.accentDefault} style={{ marginTop: spacing.s6 }} />
        <Text
          accessibilityRole="header"
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading2,
            textAlign: 'center',
            marginTop: spacing.s4,
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

        {autoAdvanceIn != null ? (
          <View style={{ alignItems: 'center', marginTop: spacing.s5 }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{
                color: c.textSecondary,
                fontFamily: fontFamily.medium,
                fontSize: fontSize.bodyMd,
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
              }}
            >
              {`Moving on in ${autoAdvanceIn}...`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stay on this step"
              onPress={cancelAutoAdvance}
              style={{ minHeight: HIT_TARGET, paddingHorizontal: spacing.s5, alignItems: 'center', justifyContent: 'center', marginTop: spacing.s2 }}
            >
              <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
                Stay on this step
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Animated.View>

      <View style={{ paddingBottom: spacing.s4 }}>
        <PFButton label="Done" icon="checkmark-outline" onPress={() => void advance('done')} />
        <PFButton label="Skip for today" variant="ghost" onPress={() => void advance('skip')} style={{ marginTop: spacing.s2 }} />
      </View>
    </ScreenLayout>
  );
}
