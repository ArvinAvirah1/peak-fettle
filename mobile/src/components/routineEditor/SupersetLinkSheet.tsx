/**
 * SupersetLinkSheet.tsx — S2 routine-editor "Superset with..." linking sheet.
 * =============================================================================
 * Opened from an exercise row's kebab menu in RoutineEditorSheet. Lists the
 * routine's OTHER ungrouped exercises (multi-select; a group is 2-5 exercises
 * total, so 1-4 more beyond the anchor) PLUS a "Search library" row that opens
 * the existing ExercisePicker to add a brand-new exercise directly into the
 * group. Confirming creates the group (the editor makes members contiguous and
 * renders them as one bracketed card with a shared rounds stepper).
 *
 * Presentational + callback-driven - the editor owns the exercises[] state and
 * the ExercisePicker. Mirrors the RoutineEditorSheet dark/teal token styling.
 *
 * SAFE-AREA (CLAUDE.md #3): the bottom home-indicator inset is applied DIRECTLY
 * to the bottom-anchored sheet (insets do not propagate inside a RN <Modal>).
 * =============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../Icon';
import { stepperPalette, fontFamily, fontSize, spacing, radius } from '../../theme/tokens';

/** A candidate exercise the anchor can be linked with (routine-ungrouped). */
export interface SupersetLinkCandidate {
  /** Absolute index in the editor's items[] (the editor links by index). */
  index: number;
  name: string;
}

export interface SupersetLinkSheetProps {
  visible: boolean;
  /** Display name of the anchor exercise being linked. */
  currentName: string;
  /** The routine's OTHER ungrouped exercises (already excludes the anchor). */
  candidates: SupersetLinkCandidate[];
  /**
   * Confirm the link with the chosen member indices (1-4). The editor creates
   * the group (assigns a group letter, shared rounds, makes members contiguous).
   */
  onConfirm: (memberIndices: number[]) => void;
  /**
   * Open the exercise library to add a NEW exercise directly into the group.
   * The editor closes this sheet, opens ExercisePicker, and on pick creates the
   * group from the current selection + the newly-added exercise.
   */
  onSearchLibrary: (memberIndices: number[]) => void;
  /** Dismiss without linking. */
  onClose: () => void;
}

/** Max additional members (a group is 2-5 exercises -> 1-4 MORE beyond anchor). */
const MAX_EXTRA = 4;

export function SupersetLinkSheet(props: SupersetLinkSheetProps): React.ReactElement {
  const { visible, currentName, candidates, onConfirm, onSearchLibrary, onClose } = props;
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    if (visible) setSelected([]);
  }, [visible]);

  const atLimit = selected.length >= MAX_EXTRA;

  const toggle = (idx: number) => {
    setSelected((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= MAX_EXTRA) return prev;
      return [...prev, idx];
    });
  };

  const canConfirm = selected.length >= 1;
  const confirmLabel = useMemo(() => {
    const n = selected.length + 1; // + the anchor exercise
    return `Link ${n} exercise${n !== 1 ? 's' : ''}`;
  }, [selected.length]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Dismiss superset sheet"
      />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s2 }]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Ionicons name="git-merge" size={20} color={stepperPalette.accent} />
          <Text style={styles.title}>Superset with…</Text>
        </View>
        <Text style={styles.subtitle}>
          Link {currentName} with 1–4 more — done back-to-back, rest after each round.
        </Text>

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {candidates.map((c) => {
            const on = selected.includes(c.index);
            const disabled = !on && atLimit;
            return (
              <TouchableOpacity
                key={`${c.index}:${c.name}`}
                style={[styles.row, disabled && styles.rowDisabled]}
                onPress={() => toggle(c.index)}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled }}
                accessibilityLabel={`${on ? 'Remove' : 'Add'} ${c.name} to the superset`}
              >
                <View style={[styles.check, on && styles.checkOn]}>
                  {on ? <Ionicons name="checkmark" size={14} color={stepperPalette.accentInk} /> : null}
                </View>
                <Text style={styles.rowText} numberOfLines={1}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Search library — add a NEW exercise into the group. */}
          <TouchableOpacity
            style={styles.libraryRow}
            onPress={() => onSearchLibrary(selected)}
            accessibilityRole="button"
            accessibilityLabel="Search library to add a new exercise to the superset"
          >
            <View style={styles.libraryIcon}>
              <Ionicons name="search" size={16} color={stepperPalette.accent} />
            </View>
            <Text style={styles.libraryText}>Search library…</Text>
            <Ionicons name="chevron-forward" size={16} color={stepperPalette.muted} />
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
          onPress={() => canConfirm && onConfirm(selected)}
          disabled={!canConfirm}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
        >
          <Text style={[styles.confirmLabel, !canConfirm && styles.confirmLabelDisabled]}>
            {canConfirm ? confirmLabel : 'Pick one or search the library'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    borderRadius: 999,
    backgroundColor: stepperPalette.line,
    marginBottom: spacing.s3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.bodyLg, color: stepperPalette.text },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    marginTop: spacing.s1,
    marginBottom: spacing.s3,
    lineHeight: 20,
  },
  list: { maxHeight: 320 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: stepperPalette.line,
    minHeight: 52,
  },
  rowDisabled: { opacity: 0.4 },
  check: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: stepperPalette.line,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s3,
  },
  checkOn: { borderColor: stepperPalette.accent, backgroundColor: stepperPalette.accent },
  rowText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.s3,
    minHeight: 52,
  },
  libraryIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s3,
  },
  libraryText: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.accent,
  },
  confirmBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.s3,
  },
  confirmBtnDisabled: { backgroundColor: stepperPalette.frame },
  confirmLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.bodyMd, color: stepperPalette.accentInk },
  confirmLabelDisabled: { color: stepperPalette.muted },
  cancelBtn: { paddingVertical: spacing.s3, alignItems: 'center', marginTop: spacing.s2 },
  cancelLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, color: stepperPalette.muted },
});

export default SupersetLinkSheet;
