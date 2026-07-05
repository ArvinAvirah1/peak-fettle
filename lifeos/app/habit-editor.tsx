/**
 * Habit/stack editor sheet (TICKET-103) — create or edit a habit; optionally
 * place it in a stack (existing or new). Archive = soft delete, confirmed.
 *
 * T153/T154/T156: habit type picker (check-off / amount / timer), weekly
 * quota cadence, and pause/resume (edit mode only, via PauseSheet).
 */

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import {
  activePause,
  archiveHabit,
  createHabit,
  createStack,
  HabitPauseRow,
  HabitRow,
  HabitType,
  listStacks,
  StackRow,
  updateHabit,
} from '../src/data/habits';
import { localDb } from '../src/db/localDb';
import { haptic } from '../src/lib/haptics';
import { PauseSheet } from '../src/components/habits/PauseSheet';

const ICON_CHOICES = [
  'leaf-outline',
  'book-outline',
  'body-outline',
  'water-outline',
  'sunny-outline',
  'moon-outline',
  'walk-outline',
  'barbell-outline',
  'create-outline',
  'heart-outline',
  'school-outline',
  'wallet-outline',
];

const TYPE_OPTIONS: { key: HabitType; label: string }[] = [
  { key: 'boolean', label: 'Check-off' },
  { key: 'quantity', label: 'Amount' },
  { key: 'timer', label: 'Timer' },
];

const CADENCE_OPTIONS: { key: 'daily' | 'weekly'; label: string }[] = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekly', label: 'Times per week' },
];

/** Parse a number-pad string into a float, tolerating blank/garbage input — never NaN. */
function parseOptionalFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function HabitEditorScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const { habitId } = useLocalSearchParams<{ habitId?: string }>();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('leaf-outline');
  const [stacks, setStacks] = useState<StackRow[]>([]);
  const [stackId, setStackId] = useState<string | null>(null);
  const [newStackName, setNewStackName] = useState('');
  const [newStackTime, setNewStackTime] = useState('07:00');
  const [durationMin, setDurationMin] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = habitId != null && habitId !== '';

  // --- T153: habit type ---------------------------------------------------
  const [habitType, setHabitType] = useState<HabitType>('boolean');
  const [targetValue, setTargetValue] = useState(''); // quantity daily target OR timer minutes (raw text)
  const [targetUnit, setTargetUnit] = useState(''); // quantity unit only

  // --- T154: weekly quota cadence ------------------------------------------
  const [cadenceChoice, setCadenceChoice] = useState<'daily' | 'weekly'>('daily');
  const [weeklyQuota, setWeeklyQuota] = useState(3);

  // --- T156: pause/resume (edit mode only) ---------------------------------
  const [pause, setPause] = useState<HabitPauseRow | null>(null);
  const [pauseSheetVisible, setPauseSheetVisible] = useState(false);

  const refreshPause = async (): Promise<void> => {
    if (!isEdit) return;
    setPause(await activePause(habitId as string));
  };

  useEffect(() => {
    void (async () => {
      setStacks(await listStacks());
      if (isEdit) {
        const row = await localDb.getFirst<HabitRow>(`SELECT * FROM lo_habits WHERE id = ?`, [habitId]);
        if (row) {
          setName(row.name);
          setIcon(row.icon);
          setStackId(row.stack_id);
          setDurationMin(row.est_duration_sec ? String(Math.round(row.est_duration_sec / 60)) : '');
          setHabitType(row.habit_type ?? 'boolean');
          if (row.habit_type === 'timer') {
            setTargetValue(row.target_value != null ? String(row.target_value) : '');
          } else {
            setTargetValue(row.target_value != null ? String(row.target_value) : '');
            setTargetUnit(row.target_unit ?? '');
          }
          setCadenceChoice(row.weekly_quota != null ? 'weekly' : 'daily');
          setWeeklyQuota(row.weekly_quota ?? 3);
        }
        await refreshPause();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habitId, isEdit]);

  const save = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true);
    let targetStackId = stackId;
    if (!targetStackId && newStackName.trim()) {
      targetStackId = await createStack({
        name: newStackName.trim(),
        anchorType: 'time',
        anchorValue: /^\d{2}:\d{2}$/.test(newStackTime) ? newStackTime : '07:00',
      });
    }
    const estDurationSec = durationMin ? Math.max(1, parseInt(durationMin, 10)) * 60 : null;

    let finalTargetValue: number | null = null;
    let finalTargetUnit: string | null = null;
    if (habitType === 'quantity') {
      finalTargetValue = parseOptionalFloat(targetValue);
      finalTargetUnit = targetUnit.trim() ? targetUnit.trim() : null;
    } else if (habitType === 'timer') {
      finalTargetValue = parseOptionalFloat(targetValue);
      finalTargetUnit = 'min';
    }

    const finalWeeklyQuota = cadenceChoice === 'weekly' ? weeklyQuota : null;

    if (isEdit) {
      await updateHabit(habitId as string, {
        name: name.trim(),
        icon,
        stack_id: targetStackId,
        est_duration_sec: estDurationSec,
        habit_type: habitType,
        target_value: finalTargetValue,
        target_unit: finalTargetUnit,
        weekly_quota: finalWeeklyQuota,
        cadence: finalWeeklyQuota != null ? 'weekly' : 'daily',
      });
    } else {
      await createHabit({
        name: name.trim(),
        icon,
        stackId: targetStackId,
        estDurationSec,
        habitType,
        targetValue: finalTargetValue,
        targetUnit: finalTargetUnit,
        weeklyQuota: finalWeeklyQuota,
      });
    }
    haptic.success();
    router.back();
  };

  const onArchive = (): void => {
    Alert.alert('Archive habit?', 'It disappears from your lists but the history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          void archiveHabit(habitId as string).then(() => router.back());
        },
      },
    ]);
  };

  return (
    <ScreenLayout>
      <PFInput label="Name" value={name} onChangeText={setName} placeholder="e.g. Read 10 pages" autoFocus={!isEdit} />

      <SectionTitle top={spacing.s2}>Icon</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {ICON_CHOICES.map((i) => (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={`Icon ${i}`}
            accessibilityState={{ selected: icon === i }}
            onPress={() => setIcon(i)}
            style={{
              width: HIT_TARGET,
              height: HIT_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: icon === i ? c.accentDefault : c.borderDefault,
              backgroundColor: icon === i ? c.accentMuted : 'transparent',
              marginRight: spacing.s2,
              marginBottom: spacing.s2,
            }}
          >
            <Ionicons name={i} size={22} color={icon === i ? c.accentDefault : c.textSecondary} />
          </Pressable>
        ))}
      </View>

      <PFInput
        label="Duration (minutes, optional)"
        value={durationMin}
        onChangeText={setDurationMin}
        keyboardType="number-pad"
        placeholder="e.g. 10"
        helper="Shown as a countdown in the stack player."
      />

      <SectionTitle top={spacing.s2}>Type</SectionTitle>
      <View style={{ flexDirection: 'row', marginBottom: spacing.s2 }}>
        {TYPE_OPTIONS.map((opt, idx) => {
          const selected = habitType === opt.key;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected }}
              onPress={() => {
                haptic.selection();
                setHabitType(opt.key);
              }}
              style={{
                flex: 1,
                minHeight: HIT_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? c.accentDefault : c.borderDefault,
                backgroundColor: selected ? c.accentMuted : 'transparent',
                borderRadius: radius.md,
                marginRight: idx !== TYPE_OPTIONS.length - 1 ? spacing.s2 : 0,
              }}
            >
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {habitType === 'quantity' ? (
        <View style={{ marginBottom: spacing.s2 }}>
          <PFInput
            label="Daily target"
            value={targetValue}
            onChangeText={setTargetValue}
            keyboardType="number-pad"
            placeholder="e.g. 8"
            helper="Log progress through the day — the day counts once you reach the target."
          />
          <PFInput label="Unit" value={targetUnit} onChangeText={setTargetUnit} placeholder="e.g. pages, glasses" />
        </View>
      ) : null}

      {habitType === 'timer' ? (
        <View style={{ marginBottom: spacing.s2 }}>
          <PFInput
            label="Target minutes"
            value={targetValue}
            onChangeText={setTargetValue}
            keyboardType="number-pad"
            placeholder="e.g. 20"
            helper="Start and stop the timer from the habit row. Time only counts while the app is open."
          />
        </View>
      ) : null}

      <SectionTitle top={spacing.s2}>How often</SectionTitle>
      <View style={{ flexDirection: 'row', marginBottom: spacing.s2 }}>
        {CADENCE_OPTIONS.map((opt, idx) => {
          const selected = cadenceChoice === opt.key;
          return (
            <Pressable
              key={opt.key}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected }}
              onPress={() => {
                haptic.selection();
                setCadenceChoice(opt.key);
              }}
              style={{
                flex: 1,
                minHeight: HIT_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: selected ? c.accentDefault : c.borderDefault,
                backgroundColor: selected ? c.accentMuted : 'transparent',
                borderRadius: radius.md,
                marginRight: idx !== CADENCE_OPTIONS.length - 1 ? spacing.s2 : 0,
              }}
            >
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cadenceChoice === 'weekly' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.s2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease times per week"
            onPress={() => {
              haptic.selection();
              setWeeklyQuota((n) => Math.max(1, n - 1));
            }}
            style={{
              width: HIT_TARGET,
              height: HIT_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: c.borderDefault,
            }}
          >
            <Ionicons name="remove-outline" size={20} color={c.textPrimary} />
          </Pressable>
          <Text
            style={{
              width: 64,
              textAlign: 'center',
              color: c.textPrimary,
              fontFamily: fontFamily.bold,
              fontSize: fontSize.heading2,
              fontVariant: ['tabular-nums'],
            }}
          >
            {weeklyQuota}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase times per week"
            onPress={() => {
              haptic.selection();
              setWeeklyQuota((n) => Math.min(7, n + 1));
            }}
            style={{
              width: HIT_TARGET,
              height: HIT_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: c.borderDefault,
            }}
          >
            <Ionicons name="add-outline" size={20} color={c.textPrimary} />
          </Pressable>
        </View>
      ) : null}
      {cadenceChoice === 'weekly' ? (
        <Text
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            textAlign: 'center',
            marginBottom: spacing.s2,
          }}
        >
          {weeklyQuota} times a week — any days you like.
        </Text>
      ) : null}

      <SectionTitle top={spacing.s2}>Stack</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.s3 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: stackId == null }}
          onPress={() => setStackId(null)}
          style={{
            minHeight: HIT_TARGET,
            paddingHorizontal: spacing.s4,
            justifyContent: 'center',
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: stackId == null ? c.accentDefault : c.borderDefault,
            marginRight: spacing.s2,
            marginBottom: spacing.s2,
          }}
        >
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>Solo habit</Text>
        </Pressable>
        {stacks.map((s) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityState={{ selected: stackId === s.id }}
            onPress={() => setStackId(s.id)}
            style={{
              minHeight: HIT_TARGET,
              paddingHorizontal: spacing.s4,
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: stackId === s.id ? c.accentDefault : c.borderDefault,
              backgroundColor: stackId === s.id ? c.accentMuted : 'transparent',
              marginRight: spacing.s2,
              marginBottom: spacing.s2,
            }}
          >
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>{s.name}</Text>
          </Pressable>
        ))}
      </View>

      {stackId == null ? (
        <View>
          <PFInput
            label="…or start a new stack (optional)"
            value={newStackName}
            onChangeText={setNewStackName}
            placeholder="e.g. Morning Stack"
          />
          {newStackName.trim() ? (
            <PFInput label="Anchor time" value={newStackTime} onChangeText={setNewStackTime} placeholder="07:00" helper="24h format HH:MM" />
          ) : null}
        </View>
      ) : null}

      {isEdit ? (
        <>
          <SectionTitle top={spacing.s2}>Need a break?</SectionTitle>
          <Card>
            {pause == null ? (
              <>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.bodyMd,
                    lineHeight: 21,
                    marginBottom: spacing.s3,
                  }}
                >
                  Pausing keeps your streak and history safe while life happens.
                </Text>
                <PFButton label="Pause this habit" variant="ghost" onPress={() => setPauseSheetVisible(true)} />
              </>
            ) : (
              <>
                <Text
                  style={{
                    color: c.textSecondary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.bodyMd,
                    lineHeight: 21,
                    marginBottom: spacing.s3,
                  }}
                >
                  Paused since {pause.start_date}
                  {pause.reason ? ` — ${pause.reason}` : ''}
                </Text>
                <PFButton label="Resume" variant="secondary" onPress={() => setPauseSheetVisible(true)} />
              </>
            )}
          </Card>
        </>
      ) : null}

      <PFButton label={isEdit ? 'Save changes' : 'Create'} onPress={() => void save()} loading={saving} disabled={!name.trim()} style={{ marginTop: spacing.s4 }} />
      {isEdit ? <PFButton label="Archive habit" variant="destructive" onPress={onArchive} style={{ marginTop: spacing.s3 }} /> : null}

      {isEdit ? (
        <PauseSheet
          visible={pauseSheetVisible}
          habitId={habitId as string}
          habitName={name || 'this habit'}
          activePause={pause}
          onClose={() => setPauseSheetVisible(false)}
          onChanged={() => void refreshPause()}
        />
      ) : null}
    </ScreenLayout>
  );
}
