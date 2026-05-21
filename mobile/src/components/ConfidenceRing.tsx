/**
 * ConfidenceRing — shows how full the internal Peak Fettle cohort is for a
 * given percentile ranking.
 *
 * TICKET-039 | ROADMAP item 1.6 | 2026-05-10
 * E-001 update: migrated all hardcoded hex values to semantic tokens via useTheme().
 *
 * Design spec (exec-percentile-decisions.md §4 / ROADMAP 1.6):
 *   "Display a confidence indicator alongside each percentile — a ring that
 *   fills as internal cohort size grows. Tooltip: 'Your cohort has [N] Peak
 *   Fettle athletes. Rankings become more precise as more athletes join.'"
 *
 * The ring reflects INTERNAL user count only. External reference data
 * (Open Powerlifting, race results) does not inflate it.
 *
 * Implementation note:
 *   We use a pure React Native approach (View + borderRadius + overflow) to
 *   avoid adding react-native-svg as a dependency at this stage.  The ring is
 *   built from two semi-circle masks rotated to the fill angle.  This gives
 *   accurate rendering up to 360° without SVG.
 *
 * Props:
 *   cohortSize  — number of internal PF users in this cohort (null = not yet known)
 *   maxFull     — cohort size at which the ring is considered full (default: 500)
 *   size        — outer diameter in logical pixels (default: 36)
 *   strokeWidth — ring stroke width (default: 4)
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfidenceRingProps {
  cohortSize: number | null;
  maxFull?: number;
  size?: number;
  strokeWidth?: number;
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns [0, 1] fill fraction, clamped. */
function fillFraction(cohortSize: number | null, maxFull: number): number {
  if (cohortSize === null || cohortSize < 0) return 0;
  return Math.min(cohortSize / maxFull, 1);
}

/** Colour interpolated from red → amber → green across [0, 1].
 *  Uses status semantic tokens so it stays consistent across themes. */
function ringColor(fraction: number, theme: ReturnType<typeof useTheme>['theme']): string {
  if (fraction >= 0.6) return theme.colors.statusSuccess; // green
  if (fraction >= 0.2) return theme.colors.statusWarning; // amber
  return theme.colors.statusError;                        // red
}

/** Tooltip text per exec spec. */
function tooltipText(cohortSize: number | null): string {
  if (cohortSize === null) return 'Cohort size loading…';
  if (cohortSize === 0)    return 'You\'re the first in your cohort! Rankings use reference data until more athletes join.';
  if (cohortSize === 1)    return 'Your cohort has 1 Peak Fettle athlete. Rankings become more precise as more join.';
  return `Your cohort has ${cohortSize} Peak Fettle athletes. Rankings become more precise as more join.`;
}

// ---------------------------------------------------------------------------
// Segment ring — pure RN implementation using rotated half-masks
//
// The ring is drawn as:
//   • A full circle track (dim background)
//   • Two clip masks (left and right halves) whose rotation reveals the
//     filled arc up to `fraction * 360°`.
// ---------------------------------------------------------------------------

function RingArc({
  size,
  strokeWidth,
  fraction,
  color,
  trackColor,
  innerBg,
}: {
  size: number;
  strokeWidth: number;
  fraction: number;
  color: string;
  trackColor: string;
  innerBg: string;
}): React.ReactElement {
  const inner = size - strokeWidth * 2;
  const radius = size / 2;

  // Degrees to fill
  const degrees = fraction * 360;

  // We split at 180°: right half fills first (0→180°), then left (180→360°).
  const rightDeg = Math.min(degrees, 180);
  const leftDeg  = Math.max(degrees - 180, 0);

  const arcStyle = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: radius,
      borderWidth: strokeWidth,
      borderColor: color,
      position: 'absolute' as const,
      top: 0,
      left: 0,
    }),
    [size, radius, strokeWidth, color]
  );

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Track (dim ring) — semantic token, not hardcoded hex */}
      <View
        style={[
          arcStyle,
          { borderColor: trackColor },
        ]}
      />

      {/* Right half (0–180°) */}
      {rightDeg > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: radius, // clip to right half
            width: radius,
            height: size,
            overflow: 'hidden',
          }}
        >
          <View
            style={[
              arcStyle,
              {
                // Rotate from 12 o'clock: start at -90°, sweep rightDeg.
                // We offset left back to 0 since we're inside a right-half clip.
                left: -radius,
                transform: [{ rotate: `${rightDeg - 90}deg` }],
              },
            ]}
          />
        </View>
      )}

      {/* Left half (180–360°) — only visible once right is full */}
      {leftDeg > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: radius,
            height: size,
            overflow: 'hidden',
          }}
        >
          <View
            style={[
              arcStyle,
              {
                transform: [{ rotate: `${leftDeg + 90}deg` }],
              },
            ]}
          />
        </View>
      )}

      {/* Inner mask to turn filled circle into a ring — semantic bgSecondary */}
      <View
        style={{
          position: 'absolute',
          top: strokeWidth,
          left: strokeWidth,
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: innerBg,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ConfidenceRing({
  cohortSize,
  maxFull = 500,
  size = 36,
  strokeWidth = 4,
  style,
}: ConfidenceRingProps): React.ReactElement {
  const { theme } = useTheme();
  const fraction  = fillFraction(cohortSize, maxFull);
  const color     = ringColor(fraction, theme);
  const label     = cohortSize !== null ? String(cohortSize) : '–';

  return (
    <View style={[styles.container, style]}>
      <RingArc
        size={size}
        strokeWidth={strokeWidth}
        fraction={fraction}
        color={color}
        // Semantic tokens — no hardcoded hex
        trackColor={theme.colors.bgTertiary}
        innerBg={theme.colors.bgSecondary}
      />
      {/* Cohort count in centre of ring */}
      <View
        style={[
          styles.labelContainer,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Text style={[styles.label, { fontSize: size * 0.28, color }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tooltip text export — used in rankings screen info row
// ---------------------------------------------------------------------------

export { tooltipText as confidenceRingTooltip };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    position: 'relative',
  },
  labelContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
