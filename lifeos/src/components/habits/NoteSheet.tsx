/**
 * NoteSheet (TICKET-157) — attach a short free-text note to a day's habit log.
 * Saving a note on an unlogged day also checks it off (check-off-with-note),
 * handled by data/habits.setLogNote.
 *
 * NOTE: Safe-area does NOT propagate inside a React Native <Modal> — apply
 * insets.bottom directly to the sheet's own padding.
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { PFButton } from '../ui';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../../theme/tokens';
import { setLogNote } from '../../data/habits';
import { haptic } from '../../lib/haptics';

const MAX_LEN = 280;

export function NoteSheet(props: {
  visible: boolean;
  habitId: string;
  habitName: string;
  date: string;
  initialNote: string;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const { visible, habitId, habitName, date, initialNote, onClose, onSaved } = props;
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [text, setText] = useState(initialNote);
  const [saving, setSaving] = useState(false);

  // Reset local text state whenever `visible` flips true (sync from initialNote).
  useEffect(() => {
    if (visible) {
      setText(initialNote);
    }
  }, [visible, initialNote]);

  const onSave = async (): Promise<void> => {
    setSaving(true);
    await setLogNote(habitId, date, text.trim());
    setSaving(false);
    haptic.success();
    onSaved();
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            <Text
              accessibilityRole="header"
              style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading3 }}
            >
              Note — {habitName}
            </Text>
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.caption,
                marginTop: spacing.s1,
                marginBottom: spacing.s3,
              }}
            >
              {date}
            </Text>

            <TextInput
              accessibilityLabel={`Note for ${habitName} on ${date}`}
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX_LEN))}
              placeholder="How did it go?"
              placeholderTextColor={c.textTertiary}
              multiline
              maxLength={MAX_LEN}
              style={{
                minHeight: HIT_TARGET * 2,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: c.borderDefault,
                backgroundColor: c.bgElevated,
                color: c.textPrimary,
                paddingHorizontal: spacing.s3,
                paddingVertical: spacing.s3,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.bodyMd,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.s1 }}>
              <Text
                style={{
                  color: c.textTertiary,
                  fontFamily: fontFamily.regular,
                  fontSize: fontSize.caption,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {text.length}/{MAX_LEN}
              </Text>
            </View>

            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.caption,
                lineHeight: 17,
                marginTop: spacing.s2,
                marginBottom: spacing.s4,
              }}
            >
              If today's not logged yet, saving a note also checks it off.
            </Text>

            <PFButton label="Save note" onPress={() => void onSave()} loading={saving} style={{ marginBottom: spacing.s3 }} />
            <PFButton label="Cancel" variant="ghost" onPress={onClose} />
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
