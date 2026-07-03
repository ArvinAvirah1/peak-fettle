/**
 * DropChainBar.tsx — S1 dropset chain UI (amber chain chips + drop actions).
 * =============================================================================
 * Shown in the stepper AFTER a lift set logs, replacing the plain rest ring while
 * a drop CHAIN is active. Renders the chain so far ("80×8 ↘ 60×6 ↘ …"), a
 * "+ Log drop N" button that pre-fills the next drop's weight (parent seeds it via
 * dropPrefillKg), and "Done — start rest" which ends the chain and fires the
 * normal rest. Rest stays FULLY suppressed while a chain is active (spec §D1).
 *
 * Presentational + callback-driven — the parent (WorkoutLoggerHost via
 * StepperLogger) owns the chain state machine; this component only renders it and
 * calls back. Keeping the big-file insertion minimal (hazard pattern).
 * =============================================================================
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';

/** One already-logged link in the chain, in DISPLAY units. */
export interface DropChainLink {
  /** Display-unit weight string (e.g. "60"). '' for bodyweight. */
  weight: string;
  /** Reps string. */
  reps: string;
  /** 0 = the top set, 1+ = each drop. */
  index: number;
}

export interface DropChainBarProps {
  /** The chain so far (top set first, then each drop), in log order. */
  links: DropChainLink[];
  /** The next drop's 1-based index (links.length, i.e. how many drops so far + 1). */
  nextDropIndex: number;
  /** Pre-fill weight for the next drop in DISPLAY units, e.g. "48". null = unknown. */
  nextDropWeightLabel?: string | null;
  /** Unit label for the chip weights ("kg"/"lb"). */
  unitLabel?: string;
  /** Log the next drop (parent focuses reps with the prefilled weight). */
  onLogDrop: () => void;
  /** End the chain and start the normal rest timer. */
  onDone: () => void;
}

/** "80×8" style, tolerating bodyweight (no weight). */
function linkLabel(l: DropChainLink, unitLabel: string): string {
  const w = l.weight?.trim();
  const reps = l.reps?.trim() || '0';
  if (!w) return `BW×${reps}`;
  return `${w}${unitLabel}×${reps}`;
}

export function DropChainBar(props: DropChainBarProps): React.ReactElement {
  const {
    links,
    nextDropIndex,
    nextDropWeightLabel = null,
    unitLabel = 'kg',
    onLogDrop,
    onDone,
  } = props;
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const amber = theme.colors.statusWarning;

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.bgElevated,
          borderColor: amber,
          borderRadius: r.md,
          padding: sp.s3,
        },
      ]}
      accessibilityLabel="Drop set chain in progress"
    >
      <View style={styles.titleRow}>
        <Ionicons name="trending-down" size={16} color={amber} />
        <Text style={[styles.title, { color: amber, fontSize: fs.bodySm, fontWeight: fw.bold, marginLeft: sp.s2 }]}>
          DROP SET
        </Text>
      </View>

      {/* Chain chips — "80×8 ↘ 60×6 ↘ …" */}
      <View style={styles.chipsRow}>
        {links.map((l, i) => (
          <React.Fragment key={`${l.index}:${i}`}>
            {i > 0 ? (
              <Text style={{ color: amber, fontSize: fs.bodySm, marginHorizontal: 4 }}>↘</Text>
            ) : null}
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: theme.colors.bgTertiary,
                  borderColor: i === 0 ? theme.colors.borderDefault : amber,
                  borderRadius: r.sm ?? 6,
                },
              ]}
            >
              <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodySm, fontVariant: ['tabular-nums'] }}>
                {linkLabel(l, unitLabel)}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.logDropBtn, { backgroundColor: amber, borderRadius: r.md }]}
          onPress={onLogDrop}
          accessibilityRole="button"
          accessibilityLabel={
            nextDropWeightLabel
              ? `Log drop ${nextDropIndex} at ${nextDropWeightLabel} ${unitLabel}`
              : `Log drop ${nextDropIndex}`
          }
        >
          <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fw.bold }}>
            + Log drop {nextDropIndex}
            {nextDropWeightLabel ? `  ·  ${nextDropWeightLabel}${unitLabel}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.doneBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md }]}
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel="Done, start rest"
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, fontWeight: fw.medium }}>
            Done — start rest
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: 1,
    marginTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { letterSpacing: 0.5 },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chip: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logDropBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  doneBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
});

export default DropChainBar;
