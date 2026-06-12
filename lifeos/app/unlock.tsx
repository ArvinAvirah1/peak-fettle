/**
 * Unlock friction flow (TICKET-104, Q19) — reached via the shield handoff
 * (App Group marker) or lifeos://unlock.
 *
 * Sequence: pick which rule to unlock → (breathing gate on repeat attempts)
 * → escalating wait timer (determinate ring, tabular digits) → grant window.
 * A daily snooze budget skips friction. "Never mind, keep it blocked" is
 * always visible (CONTENT_SAFETY.md §3) and logs a held block — the win.
 *
 * Security note (TICKET-113): this screen holds ALL friction state. The deep
 * link carries no authority — arriving here doesn't lift anything; only
 * grantExemption() after completion does.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { BreathingGate } from '../src/components/BreathingGate';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../src/theme/tokens';
import {
  FocusConfigRow,
  FrictionConfig,
  defaultFriction,
  listFocusConfigs,
  logFocusEvent,
  snoozesUsedToday,
  unlockAttemptsToday,
} from '../src/data/focus';
import { blocking } from '../src/native/blocking';

type Phase = 'pick' | 'breathing' | 'waiting' | 'granted';

export default function UnlockScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [configs, setConfigs] = useState<FocusConfigRow[]>([]);
  const [target, setTarget] = useState<FocusConfigRow | null>(null);
  const [friction, setFriction] = useState<FrictionConfig>(defaultFriction());
  const [phase, setPhase] = useState<Phase>('pick');
  const [waitTotal, setWaitTotal] = useState(60);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [snoozesLeft, setSnoozesLeft] = useState(0);

  useEffect(() => {
    void (async () => {
      const all = (await listFocusConfigs()).filter((cfg) => cfg.enabled === 1 && cfg.selection_token);
      setConfigs(all);
      const used = await snoozesUsedToday();
      setSnoozesLeft(Math.max(0, defaultFriction().snoozeBudget - used));
      if (all.length === 1) void begin(all[0]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = useCallback(async (cfg: FocusConfigRow) => {
    setTarget(cfg);
    let f = defaultFriction();
    try {
      const parsed = JSON.parse(cfg.friction_json) as Partial<FrictionConfig>;
      f = { ...f, ...parsed };
    } catch {
      // keep defaults
    }
    setFriction(f);

    const attempts = await unlockAttemptsToday(cfg.id);
    await logFocusEvent('unlock_started', { configId: cfg.id, attempt: attempts + 1 });

    const ladder = f.waitLadderSec.length > 0 ? f.waitLadderSec : [60];
    const wait = ladder[Math.min(attempts, ladder.length - 1)];
    setWaitTotal(wait);
    setSecondsLeft(wait);
    setPhase(attempts >= f.breathingFromAttempt ? 'breathing' : 'waiting');
  }, []);

  // countdown
  useEffect(() => {
    if (phase !== 'waiting') return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // completion
  useEffect(() => {
    if (phase === 'waiting' && secondsLeft === 0 && target) {
      void (async () => {
        await blocking.grantExemption(target.id, friction.grantWindowMin);
        await logFocusEvent('unlock_completed', { configId: target.id });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        setPhase('granted');
      })();
    }
  }, [phase, secondsLeft, target, friction.grantWindowMin]);

  const holdBlock = async (): Promise<void> => {
    if (target) await logFocusEvent('unlock_abandoned', { configId: target.id });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    router.back();
  };

  const useSnooze = async (): Promise<void> => {
    if (!target || snoozesLeft <= 0) return;
    await logFocusEvent('snooze_used', { configId: target.id });
    await blocking.grantExemption(target.id, friction.grantWindowMin);
    await logFocusEvent('unlock_completed', { configId: target.id, via: 'snooze' });
    setPhase('granted');
  };

  const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ring geometry
  const R = 70;
  const CIRC = 2 * Math.PI * R;
  const progress = waitTotal > 0 ? (waitTotal - secondsLeft) / waitTotal : 1;

  return (
    <ScreenLayout scroll={false} edges={['top', 'bottom']}>
      {phase === 'pick' ? (
        <View style={{ flex: 1 }}>
          <SectionTitle top={spacing.s4}>Which rule do you want to pause?</SectionTitle>
          {configs.length === 0 ? (
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s3 }}>
              No active rules right now.
            </Text>
          ) : (
            configs.map((cfg) => (
              <Card key={cfg.id} onPress={() => void begin(cfg)} accessibilityLabel={`Unlock ${cfg.name}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>{cfg.name}</Text>
                  <Ionicons name="chevron-forward-outline" size={18} color={c.textTertiary} />
                </View>
              </Card>
            ))
          )}
          <PFButton label="Never mind" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.s4 }} />
        </View>
      ) : null}

      {phase === 'breathing' && target ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text accessibilityRole="header" style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.heading3, textAlign: 'center' }}>
            First, one steady minute
          </Text>
          <BreathingGate onComplete={() => setPhase('waiting')} />
          <PFButton label="Never mind, keep it blocked" variant="secondary" onPress={() => void holdBlock()} />
        </View>
      ) : null}

      {phase === 'waiting' && target ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text accessibilityRole="header" style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.heading3, textAlign: 'center', marginBottom: spacing.s6 }}>
            Unlocking {target.name}
          </Text>
          <View accessibilityLabel={`${mmss(secondsLeft)} remaining`} style={{ width: 170, height: 170, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={170} height={170} style={{ position: 'absolute' }}>
              <Circle cx={85} cy={85} r={R} stroke={c.borderDefault} strokeWidth={8} fill="none" />
              <Circle
                cx={85}
                cy={85}
                r={R}
                stroke={c.accentDefault}
                strokeWidth={8}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${CIRC}`}
                strokeDashoffset={CIRC * (1 - progress)}
                transform="rotate(-90 85 85)"
              />
            </Svg>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading1, fontVariant: ['tabular-nums'] }}>
              {mmss(secondsLeft)}
            </Text>
          </View>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, marginTop: spacing.s4, textAlign: 'center', paddingHorizontal: spacing.s6 }}>
            The wait grows with each unlock today. Still want it when the timer ends? It's yours for {friction.grantWindowMin} minutes.
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: spacing.s8 }}>
            {snoozesLeft > 0 ? (
              <PFButton label={`Use a snooze (${snoozesLeft} left today)`} variant="secondary" onPress={() => void useSnooze()} />
            ) : (
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, textAlign: 'center' }}>
                0 snoozes left — the timer it is.
              </Text>
            )}
            <PFButton label="Never mind, keep it blocked" onPress={() => void holdBlock()} style={{ marginTop: spacing.s3 }} />
          </View>
        </View>
      ) : null}

      {phase === 'granted' && target ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="lock-open-outline" size={48} color={c.accentDefault} />
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading2, marginTop: spacing.s4 }}>
            Unlocked for {friction.grantWindowMin} minutes
          </Text>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s2, textAlign: 'center' }}>
            It re-blocks by itself. No judgment — see you back here.
          </Text>
          <PFButton label="Done" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: spacing.s8 }} />
        </View>
      ) : null}
    </ScreenLayout>
  );
}
