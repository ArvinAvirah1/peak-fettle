/**
 * Focus rule editor (TICKET-104) — create a session, daily limit, or
 * focus-now rule. App selection happens afterwards via the system picker
 * (never pre-selected). Friction settings show the honest defaults.
 */

import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { createFocusConfig, defaultFriction, FocusKind, FocusSchedule } from '../src/data/focus';
import { blocking, isBlockingAvailable } from '../src/native/blocking';
import { setSelectionToken, setFocusEnabled, logFocusEvent } from '../src/data/focus';
import { FRICTION_DEFAULTS } from '../src/config/product';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DURATIONS = [15, 25, 50, 90];

export default function FocusEditorScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();

  const [kind, setKind] = useState<FocusKind>((params.kind as FocusKind) ?? 'session');
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('12:00');
  const [limitMin, setLimitMin] = useState('45');
  const [durationMin, setDurationMin] = useState(25);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    setSaving(true);
    let schedule: FocusSchedule;
    let defaultName: string;
    if (kind === 'session') {
      schedule = { days, startHHMM: start, endHHMM: end };
      defaultName = 'Focus hours';
    } else if (kind === 'limit') {
      schedule = { dailyLimitMin: Math.max(5, parseInt(limitMin, 10) || 45) };
      defaultName = 'Daily limit';
    } else {
      schedule = { durationMin };
      defaultName = `${durationMin}-minute focus`;
    }

    const id = await createFocusConfig({
      kind,
      name: name.trim() || defaultName,
      schedule,
      friction: defaultFriction(),
    });

    // focus-now starts immediately: pick apps → shield now; a one-shot
    // session window (now → now+duration) lets the monitor extension clear
    // the shield at intervalDidEnd.
    if (kind === 'focus_now' && isBlockingAvailable()) {
      const token = await blocking.pickApps(null);
      if (token) {
        const hhmm = (d: Date): string =>
          `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const now = new Date();
        const until = new Date(now.getTime() + durationMin * 60_000);
        const onceSchedule = JSON.stringify({ startHHMM: hhmm(now), endHHMM: hhmm(until) });
        await setSelectionToken(id, token);
        await blocking.applyShield(id, token);
        await blocking.scheduleActivity(id, onceSchedule, token);
        await setFocusEnabled(id, true);
        await logFocusEvent('session_started', { configId: id, durationMin });
      }
    }

    router.back();
  };

  const chip = (selected: boolean) => ({
    minHeight: HIT_TARGET,
    paddingHorizontal: spacing.s4,
    justifyContent: 'center' as const,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: selected ? c.accentDefault : c.borderDefault,
    backgroundColor: selected ? c.accentMuted : 'transparent',
    marginRight: spacing.s2,
    marginBottom: spacing.s2,
  });

  return (
    <ScreenLayout>
      <SectionTitle top={spacing.s3}>Rule type</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {(
          [
            ['session', 'Scheduled session'],
            ['limit', 'Daily limit'],
            ['focus_now', 'Focus now'],
          ] as const
        ).map(([k, label]) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === k }}
            onPress={() => setKind(k)}
            style={chip(kind === k)}
          >
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <PFInput label="Name (optional)" value={name} onChangeText={setName} placeholder="e.g. Morning deep work" />

      {kind === 'session' ? (
        <View>
          <SectionTitle top={0}>Days</SectionTitle>
          <View style={{ flexDirection: 'row' }}>
            {DAY_LABELS.map((d, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`Day ${i}`}
                accessibilityState={{ selected: days.includes(i) }}
                onPress={() => setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort()))}
                style={{
                  width: HIT_TARGET,
                  height: HIT_TARGET,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderColor: days.includes(i) ? c.accentDefault : c.borderDefault,
                  backgroundColor: days.includes(i) ? c.accentMuted : 'transparent',
                  marginRight: spacing.s1,
                }}
              >
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>{d}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginTop: spacing.s4 }}>
            <View style={{ flex: 1, marginRight: spacing.s3 }}>
              <PFInput label="From" value={start} onChangeText={setStart} placeholder="09:00" helper="24h HH:MM" />
            </View>
            <View style={{ flex: 1 }}>
              <PFInput label="Until" value={end} onChangeText={setEnd} placeholder="12:00" helper="24h HH:MM" />
            </View>
          </View>
        </View>
      ) : null}

      {kind === 'limit' ? (
        <PFInput
          label="Minutes per day"
          value={limitMin}
          onChangeText={setLimitMin}
          keyboardType="number-pad"
          helper="After this much use, the apps shield until midnight."
        />
      ) : null}

      {kind === 'focus_now' ? (
        <View>
          <SectionTitle top={0}>Duration</SectionTitle>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: durationMin === d }}
                onPress={() => setDurationMin(d)}
                style={chip(durationMin === d)}
              >
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>{d} min</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <SectionTitle>Unlock friction</SectionTitle>
      <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, lineHeight: 21 }}>
        Unlocking a blocked app starts a wait that grows through the day ({FRICTION_DEFAULTS.waitLadderSec
          .map((s) => (s < 60 ? `${s}s` : `${Math.round(s / 60)}m`))
          .join(' → ')}), with a short breathing pause on repeat attempts. You get{' '}
        {FRICTION_DEFAULTS.snoozeBudget} quick snoozes a day. "Keep me blocked" is always one tap — and you
        can switch any rule off right here, any time.
      </Text>

      <PFButton label="Create rule" onPress={() => void save()} loading={saving} style={{ marginTop: spacing.s5 }} />
    </ScreenLayout>
  );
}
