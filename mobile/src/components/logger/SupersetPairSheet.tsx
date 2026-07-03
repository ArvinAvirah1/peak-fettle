/**
 * SupersetPairSheet.tsx — S1 "Superset with…" session-only pairing sheet.
 * =============================================================================
 * Mirrors QuickSwapSheet's bottom-sheet pattern (hazard: keep StepperLogger's
 * big-file insertion minimal — this component OWNS the pairing UI). Lists the
 * session's OTHER pending exercises; the user multi-selects 1–4 more members to
 * pair with the current exercise FOR TODAY only. The parent (WorkoutLoggerHost)
 * assigns a fresh groupId + shared rounds and reorders members contiguous.
 *
 * This is a FREE feature (spec §2 Option B / founder decision) — NO Pro gating.
 * Library search to add a not-yet-in-session exercise arrives with routine
 * editing in S2; for S1 the picker is limited to the session's pending exercises.
 *
 * SAFE-AREA (CLAUDE.md §3): insets do NOT propagate inside a RN <Modal>, so the
 * home-indicator bottom inset is applied DIRECTLY to the bottom-anchored sheet;
 * the header row gets a min top pad for the grab handle.
 * =============================================================================
 */

import React, { useMemo, useState, useEffect } from 'react';
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
import { useTheme } from '../../theme/ThemeContext';

/** A candidate exercise the current one can be paired with (session-pending). */
export interface SupersetPairCandidate {
  /** Absolute index in the session's exercises[] (the parent pairs by index). */
  index: number;
  exerciseId: string;
  name: string;
  /** Optional per-exercise planned sets (used to seed the shared rounds). */
  targetSets?: number;
}

export interface SupersetPairSheetProps {
  visible: boolean;
  /** Display name of the current (anchor) exercise being paired. */
  currentName: string;
  /** The session's OTHER pending exercises (already excludes the current one). */
  candidates: SupersetPairCandidate[];
  /**
   * Confirm the pairing with the chosen member indices (1–4). The parent creates
   * the group (fresh groupId + shared rounds = max targetSets) and reorders.
   */
  onConfirm: (memberIndices: number[]) => void;
  /** Dismiss without pairing. */
  onClose: () => void;
}

/** Max additional members (a group is 2–5 exercises → 1–4 MORE beyond current). */
const MAX_EXTRA = 4;

export function SupersetPairSheet(props: SupersetPairSheetProps): React.ReactElement {
  const { visible, currentName, candidates, onConfirm, onClose } = props;
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const insets = useSafeAreaInsets();

  // Selected candidate indices (into the SESSION exercises[], via candidate.index).
  const [selected, setSelected] = useState<number[]>([]);

  // Reset the selection whenever the sheet re-opens.
  useEffect(() => {
    if (visible) setSelected([]);
  }, [visible]);

  const atLimit = selected.length >= MAX_EXTRA;

  const toggle = (idx: number) => {
    setSelected((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx);
      if (prev.length >= MAX_EXTRA) return prev; // cap at 4 extra (5-member group)
      return [...prev, idx];
    });
  };

  const canConfirm = selected.length >= 1;
  const confirmLabel = useMemo(() => {
    const n = selected.length + 1; // + the current exercise
    return `Superset ${n} exercise${n !== 1 ? 's' : ''}`;
  }, [selected.length]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
        onPress={onClose}
        accessibilityLabel="Dismiss superset sheet"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.bgElevated,
            borderTopLeftRadius: r.lg,
            borderTopRightRadius: r.lg,
            paddingHorizontal: sp.s5,
            paddingTop: sp.s3,
            paddingBottom: Math.max(insets.bottom, sp.s4) + sp.s2,
          },
        ]}
      >
        {/* Header — grab handle + title. */}
        <View>
          <View style={[styles.handle, { backgroundColor: theme.colors.borderDefault, borderRadius: r.full ?? 999 }]} />
          <View style={styles.headerRow}>
            <Ionicons name="git-merge" size={20} color={theme.colors.accentDefault} />
            <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold, marginLeft: sp.s2 }]}>
              Superset with…
            </Text>
          </View>
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s3 }}>
            Pair {currentName} with 1–4 more — done back-to-back, rest after each round. For today only.
          </Text>
        </View>

        {candidates.length === 0 ? (
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: sp.s3, marginBottom: sp.s3 }}>
            No other pending exercises in this session to superset with. Add one first, or link exercises when editing the routine.
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
            {candidates.map((c) => {
              const on = selected.includes(c.index);
              const disabled = !on && atLimit;
              return (
                <TouchableOpacity
                  key={`${c.index}:${c.exerciseId || c.name}`}
                  style={[
                    styles.row,
                    { borderBottomColor: theme.colors.borderDefault },
                    disabled && { opacity: 0.4 },
                  ]}
                  onPress={() => toggle(c.index)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled }}
                  accessibilityLabel={`${on ? 'Remove' : 'Add'} ${c.name} to the superset`}
                >
                  <View
                    style={[
                      styles.check,
                      {
                        borderColor: on ? theme.colors.accentDefault : theme.colors.borderDefault,
                        backgroundColor: on ? theme.colors.accentDefault : 'transparent',
                        borderRadius: r.sm ?? 6,
                      },
                    ]}
                  >
                    {on ? <Ionicons name="checkmark" size={14} color={theme.components.buttonPrimaryText} /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fw.medium }} numberOfLines={1}>
                      {c.name}
                    </Text>
                    {c.targetSets ? (
                      <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: 2 }}>
                        {c.targetSets} sets
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Note about the S2 library search. */}
        <Text style={{ color: theme.colors.textTertiary, fontSize: fs.micro ?? fs.bodySm, marginTop: sp.s3 }}>
          Searching the exercise library to add a new pairing arrives with routine editing.
        </Text>

        <TouchableOpacity
          style={[
            styles.confirmBtn,
            {
              backgroundColor: canConfirm ? theme.colors.accentDefault : theme.colors.bgTertiary,
              borderRadius: r.md,
              marginTop: sp.s3,
            },
          ]}
          onPress={() => canConfirm && onConfirm(selected)}
          disabled={!canConfirm}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
        >
          <Text
            style={{
              color: canConfirm ? theme.components.buttonPrimaryText : theme.colors.textTertiary,
              fontSize: fs.bodyMd,
              fontWeight: fw.bold,
            }}
          >
            {canConfirm ? confirmLabel : 'Pick at least one'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md, marginTop: sp.s3 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodyMd }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  handle: { alignSelf: 'center', width: 36, height: 4, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  title: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  check: {
    width: 22,
    height: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  confirmBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});

export default SupersetPairSheet;
