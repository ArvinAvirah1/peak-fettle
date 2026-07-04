/**
 * SetNoteSheet — TICKET-129: per-set notes + quick-tap flags.
 *
 * A bottom sheet reachable from a note icon / long-press on a logged-set chip
 * (StepperLogger.tsx) or a set row (workout-day.tsx). Free text + 5 flag chips
 * — flagging a set is <= 2 taps (open sheet, tap chip; the chip itself commits
 * the toggle, no separate "save" step for flags). Free text needs an explicit
 * Save because it has a keyboard in the loop.
 *
 * Safe-area (CLAUDE.md §3): SafeAreaView does NOT reliably propagate inside a
 * <Modal>. This is a BOTTOM sheet, so the bottom inset is what matters —
 * applied directly to the sheet's bottom padding via useSafeAreaInsets().
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stepperPalette, spacing, radius, fontSize, fontWeight } from '../../theme/tokens';
import { SET_FLAG_DEFS, hasFlag, toggleFlag } from '../../data/setNotes';
import { useTranslation } from 'react-i18next';

export interface SetNoteSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Existing note text, or null/empty for a fresh set. */
  initialNote: string | null | undefined;
  /** Existing flags bitmask (0 = none). */
  initialFlags: number | null | undefined;
  /** Label for the sheet title, e.g. "Set 3 — Bench Press". */
  setLabel?: string | null;
  /**
   * Called whenever the user commits a change: flag chips commit immediately
   * (tap = toggle + save, per the "<=2 taps" requirement); free text commits
   * on "Save note" or on close if the text changed since the last commit.
   */
  onSave: (patch: { note?: string | null; flags?: number }) => void | Promise<void>;
}

const MAX_NOTE_LENGTH = 500;

export function SetNoteSheet({
  visible,
  onClose,
  initialNote,
  initialFlags,
  setLabel,
  onSave,
}: SetNoteSheetProps): React.ReactElement {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [note, setNote] = useState(initialNote ?? '');
  const [flags, setFlags] = useState(initialFlags ?? 0);
  const [savedNote, setSavedNote] = useState(initialNote ?? '');

  useEffect(() => {
    if (visible) {
      setNote(initialNote ?? '');
      setSavedNote(initialNote ?? '');
      setFlags(initialFlags ?? 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialNote, initialFlags]);

  const noteDirty = note !== savedNote;

  const commitNote = (): void => {
    if (!noteDirty) return;
    const trimmed = note.trim();
    setSavedNote(trimmed);
    setNote(trimmed);
    void onSave({ note: trimmed.length > 0 ? trimmed : null });
  };

  const handleClose = (): void => {
    commitNote();
    onClose();
  };

  // Flag chip tap: toggle the bit AND persist immediately — this is the ONE
  // tap that both changes and commits state, satisfying "<= 2 taps to flag"
  // (tap the note icon to open the sheet = tap 1, tap the chip = tap 2).
  const handleToggleFlag = (bit: number): void => {
    const next = toggleFlag(flags, bit);
    setFlags(next);
    void onSave({ flags: next });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoidWrap}
        >
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + spacing.s4 }]}
            onPress={() => {}}
          >
            <View style={styles.handle} />
            <Text style={styles.title} numberOfLines={1}>
              {setLabel ? setLabel : t('logger:setNoteSheet.defaultTitle')}
            </Text>

            <Text style={styles.sectionLabel}>{t('logger:setNoteSheet.flagsLabel')}</Text>
            <View style={styles.chipRow}>
              {SET_FLAG_DEFS.map((def) => {
                const active = hasFlag(flags, def.bit);
                // Render-site translation of a data/localSchema.ts constant (not a
                // pure-logic module owned elsewhere): def.key -> logger:setNoteSheet.flag_<key>,
                // falling back to def.label if a key is ever added without a translation.
                const flagLabel = t(`logger:setNoteSheet.flag_${def.key}` as never, { defaultValue: def.label });
                return (
                  <TouchableOpacity
                    key={def.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => handleToggleFlag(def.bit)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={
                      active
                        ? t('logger:setNoteSheet.flagA11yOn', { label: flagLabel })
                        : t('logger:setNoteSheet.flagA11yOff', { label: flagLabel })
                    }
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                      {flagLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: spacing.s4 }]}>{t('logger:setNoteSheet.noteLabel')}</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder={t('logger:setNoteSheet.notePlaceholder')}
              placeholderTextColor={stepperPalette.muted}
              multiline
              maxLength={MAX_NOTE_LENGTH}
              accessibilityLabel={t('logger:setNoteSheet.noteInputA11y')}
            />

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel={t('logger:setNoteSheet.saveAndCloseA11y')}
              >
                <Text style={styles.saveLabel}>{noteDirty ? t('logger:setNoteSheet.saveNote') : t('logger:setNoteSheet.done')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

export default SetNoteSheet;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  avoidWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: stepperPalette.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    marginBottom: spacing.s4,
  },
  title: {
    color: stepperPalette.text,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.s4,
  },
  sectionLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: spacing.s2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  chip: {
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.full,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
  },
  chipActive: {
    borderColor: stepperPalette.accentLine,
    backgroundColor: stepperPalette.accentSurface,
  },
  chipLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
  chipLabelActive: {
    color: stepperPalette.accent,
    fontWeight: fontWeight.semibold,
  },
  noteInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    color: stepperPalette.text,
    fontSize: fontSize.bodyMd,
    padding: spacing.s3,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  actionRow: {
    marginTop: spacing.s4,
  },
  saveBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
  },
  saveLabel: {
    color: stepperPalette.accentInk,
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
});
