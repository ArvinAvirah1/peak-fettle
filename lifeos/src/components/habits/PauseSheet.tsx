/**
 * PauseSheet (TICKET-156) — pause/resume UI for a single habit.
 *
 * Pausing keeps streak + history safe while life happens; resuming un-pauses
 * as of today. Bottom-anchored RN Modal sheet, Summit tokens only.
 *
 * NOTE: Safe-area does NOT propagate inside a React Native <Modal> — apply
 * insets.bottom directly to the sheet's own padding rather than relying on
 * SafeAreaView/useSafeAreaInsets() further up the tree.
 */

import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { PFButton, PFInput } from '../ui';
import { Ionicons } from '../Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../theme/tokens';
import { addDays } from '../../engine/streaks';
import { dayKey } from '../../db/localDb';
import { createPause, endPause, HabitPauseRow } from '../../data/habits';
import { haptic } from '../../lib/haptics';
import { showToast } from '../../lib/feedback';

type DurationChoice = '3d' | '1w' | '2w' | 'open';

const DURATION_OPTIONS: { key: DurationChoice; label: string }[] = [
  { key: '3d', label: '3 days' },
  { key: '1w', label: '1 week' },
  { key: '2w', label: '2 weeks' },
  { key: 'open', label: 'Until I turn it back on' },
];

function endDateFor(choice: DurationChoice): string | null {
  const today = dayKey();
  if (choice === '3d') return addDays(today, 2);
  if (choice === '1w') return addDays(today, 6);
  if (choice === '2w') return addDays(today, 13);
  return null;
}

export function PauseSheet(props: {
  visible: boolean;
  habitId: string;
  habitName: string;
  activePause: HabitPauseRow | null;
  onClose: () => void;
  onChanged: () => void;
}): React.ReactElement {
  const { visible, habitId, habitName, activePause, onClose, onChanged } = props;
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [duration, setDuration] = useState<DurationChoice>('1w');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const isPaused = activePause != null;

  const onConfirmPause = async (): Promise<void> => {
    setSaving(true);
    const endDate = endDateFor(duration);
    await createPause(habitId, dayKey(), endDate, reason.trim() ? reason.trim() : null);
    setSaving(false);
    haptic.success();
    showToast({ message: 'Paused. It will be here when you are ready.', kind: 'success' });
    onChanged();
    onClose();
  };

  const onResume = async (): Promise<void> => {
    if (!activePause) return;
    setSaving(true);
    await endPause(activePause.id, addDays(dayKey(), -1));
    setSaving(false);
    haptic.success();
    showToast({ message: 'Welcome back.', kind: 'success' });
    onChanged();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: c.scrim, justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: c.bgSecondary,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingHorizontal: spacing.s4,
            paddingTop: spacing.s5,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          {isPaused ? (
            <>
              <Text
                accessibilityRole="header"
                style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3 }}
              >
                Paused since {activePause?.start_date}
              </Text>
              <Text
                style={{
                  color: c.textSecondary,
                  fontFamily: fontFamily.regular,
                  fontSize: fontSize.bodyMd,
                  lineHeight: 22,
                  marginTop: spacing.s2,
                  marginBottom: spacing.s5,
                }}
              >
                {activePause?.reason ? `${activePause.reason}. ` : ''}
                Resume whenever you're ready — your streak has been waiting safely.
              </Text>
              <PFButton label="Resume today" onPress={() => void onResume()} loading={saving} style={{ marginBottom: spacing.s3 }} />
              <PFButton label="Keep paused" variant="ghost" onPress={onClose} />
            </>
          ) : (
            <>
              <Text
                accessibilityRole="header"
                style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3 }}
              >
                Pause {habitName}
              </Text>
              <Text
                style={{
                  color: c.textSecondary,
                  fontFamily: fontFamily.regular,
                  fontSize: fontSize.bodyMd,
                  lineHeight: 22,
                  marginTop: spacing.s2,
                  marginBottom: spacing.s4,
                }}
              >
                Life happens. A pause keeps your history and your streak safe — misses while paused never count against you.
              </Text>

              <View style={{ marginBottom: spacing.s3 }}>
                {DURATION_OPTIONS.map((opt) => {
                  const selected = duration === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      accessibilityRole="button"
                      accessibilityLabel={opt.label}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        haptic.selection();
                        setDuration(opt.key);
                      }}
                      style={{
                        minHeight: HIT_TARGET,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: spacing.s4,
                        borderRadius: radius.md,
                        borderWidth: 1,
                        borderColor: selected ? c.accentDefault : c.borderDefault,
                        backgroundColor: selected ? c.accentMuted : 'transparent',
                        marginBottom: spacing.s2,
                      }}
                    >
                      <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>
                        {opt.label}
                      </Text>
                      {selected ? <Ionicons name="checkmark-circle" size={20} color={c.accentDefault} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <PFInput
                label="Reason (just for you)"
                value={reason}
                onChangeText={setReason}
                placeholder="travel, resting, busy season…"
                style={{ marginBottom: spacing.s2 }}
              />

              <PFButton label="Pause" onPress={() => void onConfirmPause()} loading={saving} style={{ marginTop: spacing.s3 }} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
