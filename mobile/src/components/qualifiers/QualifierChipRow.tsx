/**
 * QualifierChipRow — the per-set qualifier chips in the logger.
 * =============================================================================
 * One chip per axis that is BOTH enabled in Settings and applicable to this
 * exercise. Tapping a chip opens QualifierPickerSheet.
 *
 * ZERO TAPS IN THE COMMON CASE. This sits in the middle of a workout, so the
 * default state must already be right. Values prefill in this order, each layer
 * overriding the one before it (mergeQualifiers — later wins):
 *
 *   1. catalog default              — what this exercise usually is
 *   2. routine prescription         — what the plan says to do
 *   3. last session for THIS exercise — what you actually did last time
 *   4. previous set THIS session    — what you are doing right now
 *
 * The most recent ACTUAL beats the prescription on purpose: if the plan says
 * wide grip and you have already done two sets close-grip today because the bar
 * was taken, the third set should not silently revert.
 *
 * The parent owns that resolution (it holds the session and the routine); this
 * component renders what it is given.
 *
 * A value that differs from the routine PRESCRIPTION renders in the accent
 * colour, so a deliberate deviation is visible without nagging.
 *
 * The row renders NOTHING when the user has tracking off or no axis applies —
 * no empty container, no stray padding. Callers can mount it unconditionally.
 * =============================================================================
 */

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { getAxis, valueLabelKey } from '../../constants/qualifiers';
import { isCustomValue } from '../../lib/qualifierKey';

export interface QualifierChipRowProps {
  /** Axes to show: already enabled ∩ applicable (visibleAxesForExercise). */
  axisIds: readonly string[];
  /** Current value per axis (resolved by the parent). */
  values: Record<string, string>;
  /** The routine's prescription, if any — used only to highlight deviations. */
  prescription?: Record<string, string> | null;
  /** Labels for `custom:<id>` tokens (resolveCustomLabels). */
  customLabels?: Record<string, string>;
  onPressAxis: (axisId: string) => void;
}

export function QualifierChipRow(props: QualifierChipRowProps): React.ReactElement | null {
  const { axisIds, values, prescription = null, customLabels = {}, onPressAxis } = props;
  const { theme, fontSize: fs, fontWeight: fw, radius: r } = useTheme();
  const { t } = useTranslation();

  const chips = useMemo(
    () => axisIds.filter((id) => getAxis(id) != null),
    [axisIds],
  );

  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {chips.map((axisId) => {
        const axis = getAxis(axisId)!;
        const value = values[axisId];
        const prescribed = prescription ? prescription[axisId] : undefined;
        // Only a REAL difference from an existing prescription is a deviation.
        const deviates = prescribed != null && value != null && prescribed !== value;

        let label: string;
        if (!value) {
          // Nothing chosen yet: show the axis name so the chip reads as an action.
          label = t(axis.labelKey as never);
        } else if (isCustomValue(value)) {
          // An unresolved custom token renders as the axis name rather than as
          // "custom:abc123" — an id must never reach the user.
          label = customLabels[value] ?? t(axis.labelKey as never);
        } else {
          label = t(valueLabelKey(axisId, value) as never);
        }

        const tint = deviates ? theme.colors.accentDefault : theme.colors.textSecondary;
        const border = deviates ? theme.colors.accentDefault : theme.colors.borderDefault;

        return (
          <TouchableOpacity
            key={axisId}
            style={[styles.chip, { borderColor: border, borderRadius: r.sm }]}
            onPress={() => onPressAxis(axisId)}
            accessibilityRole="button"
            accessibilityLabel={t('components:qualifierChips.chipA11y', {
              axis: t(axis.labelKey as never),
              value: value ? label : t('components:qualifierChips.notSet'),
            })}
          >
            <Text
              style={{ color: tint, fontSize: fs.caption, fontWeight: value ? fw.medium : fw.regular }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    minHeight: 28,
    justifyContent: 'center',
  },
});

export default QualifierChipRow;
