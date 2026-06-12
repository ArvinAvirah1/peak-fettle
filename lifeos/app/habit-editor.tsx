/**
 * Habit/stack editor sheet (TICKET-103) — create or edit a habit; optionally
 * place it in a stack (existing or new). Archive = soft delete, confirmed.
 */

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import {
  archiveHabit,
  createHabit,
  createStack,
  HabitRow,
  listStacks,
  StackRow,
  updateHabit,
} from '../src/data/habits';
import { localDb } from '../src/db/localDb';

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
        }
      }
    })();
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
    if (isEdit) {
      await updateHabit(habitId as string, {
        name: name.trim(),
        icon,
        stack_id: targetStackId,
        est_duration_sec: estDurationSec,
      });
    } else {
      await createHabit({ name: name.trim(), icon, stackId: targetStackId, estDurationSec });
    }
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

      <PFButton label={isEdit ? 'Save changes' : 'Create'} onPress={() => void save()} loading={saving} disabled={!name.trim()} style={{ marginTop: spacing.s4 }} />
      {isEdit ? <PFButton label="Archive habit" variant="destructive" onPress={onArchive} style={{ marginTop: spacing.s3 }} /> : null}
    </ScreenLayout>
  );
}
