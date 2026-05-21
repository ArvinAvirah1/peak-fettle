/**
 * PFProgress — Peak Fettle design-system progress indicators.
 * Phase E — E-004: Component Library Rebuild
 *
 * Two components per peak_fettle_design_spec.docx §4.3:
 *
 *   PFProgressBar  — horizontal bar (0–1 value)
 *     Used for: workout completion, loading states
 *
 *   PFProgressRing — circular ring (0–1 value)
 *     Used for: percentile display, streak rings
 *     Note: pure RN implementation (no SVG) using View transforms,
 *     consistent with the approach in ConfidenceRing.tsx.
 *
 * All colors and sizing come from useTheme() tokens.
 * Zero hardcoded color values.
 *
 * Usage:
 *   <PFProgressBar value={0.65} />
 *   <PFProgressRing value={0.82} size={64} label="82nd" />
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../theme/ThemeContext';

// ---------------------------------------------------------------------------
// PFProgressBar
// ---------------------------------------------------------------------------

export interface PFProgressBarProps {
  /** Progress value between 0 and 1 */
  value: number;
  /** Bar height in points. Defaults to 6. */
  height?: number;
  /** Optional explicit track color override (defaults to theme token) */
  trackColor?: string;
  /** Optional explicit fill color override (defaults to theme token) */
  fillColor?: string;
}

export function PFProgressBar({
  value,
  height = 6,
  trackColor,
  fillColor,
}: PFProgressBarProps): React.ReactElement {
  const { theme, radius } = useTheme();
  const clampedValue = Math.min(1, Math.max(0, value));

  return (
    <View
      style={{
        height,
        borderRadius: radius.full,
        backgroundColor: trackColor ?? theme.components.progressTrack,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          height,
          width: `${clampedValue * 100}%`,
          borderRadius: radius.full,
          backgroundColor: fillColor ?? theme.components.progressFill,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// PFProgressRing
// ---------------------------------------------------------------------------

export interface PFProgressRingProps {
  /** Progress value between 0 and 1 */
  value: number;
  /** Outer diameter in points. Defaults to 64. */
  size?: number;
  /** Ring stroke width in points. Defaults to 6. */
  strokeWidth?: number;
  /** Optional label rendered in the center of the ring */
  label?: string;
  /** Optional explicit fill color override (defaults to theme token) */
  fillColor?: string;
  /**
   * When true, renders the ring arc with a gradient sweep.
   * Gradient: accentSecondary (start) → accentDefault (end), per spec §5.3 and §5.5
   */
  showGradient?: boolean;
}

export function PFProgressRing({
  value,
  size = 64,
  strokeWidth = 6,
  label,
  fillColor,
  showGradient = false,
}: PFProgressRingProps): React.ReactElement {
  const { theme, fontSize, fontWeight } = useTheme();
  const clampedValue = Math.min(1, Math.max(0, value));

  // Pure-RN ring using two rotated half-masks (same technique as ConfidenceRing).
  // The ring is split into left (0–180°) and right (180–360°) half-circles.
  const innerSize = size - strokeWidth * 2;
  const halfSize = size / 2;
  const fill = fillColor ?? theme.components.progressRingFill;
  const track = theme.components.progressRingTrack;

  // How many degrees to fill (0–360)
  const degrees = clampedValue * 360;

  // Right half fills from 0° to min(degrees, 180°)
  const rightDeg = Math.min(degrees, 180);
  // Left half fills from 0° to max(degrees - 180, 0°)
  const leftDeg = Math.max(degrees - 180, 0);

  // Gradient: accentSecondary (start) → accentDefault (end), per spec §5.3 and §5.5
  const gradientStart = theme.colors.accentSecondary;
  const gradientEnd = theme.colors.accentDefault;

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Track circle */}
      <View style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: halfSize,
          borderWidth: strokeWidth,
          borderColor: track,
        },
      ]} />

      {/* Right half-fill */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: halfSize,
        width: halfSize,
        height: size,
        overflow: 'hidden',
      }}>
        {showGradient ? (
          /* Gradient overlay for right half — clip to ring arc */
          <View style={{
            width: size,
            height: size,
            borderRadius: halfSize,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            position: 'absolute',
            right: 0,
            transform: [{ rotate: `${rightDeg - 90}deg` }],
            overflow: 'hidden',
          }}>
            <LinearGradient
              colors={[gradientStart, gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Inner mask to hollow out the ring (leave only the stroke) */}
            <View style={{
              position: 'absolute',
              top: strokeWidth,
              left: strokeWidth,
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              backgroundColor: track,
            }} />
          </View>
        ) : (
          <View style={{
            width: size,
            height: size,
            borderRadius: halfSize,
            borderWidth: strokeWidth,
            borderColor: fill,
            position: 'absolute',
            right: 0,
            transform: [{ rotate: `${rightDeg - 90}deg` }],
          }} />
        )}
      </View>

      {/* Left half-fill (only visible when > 50%) */}
      {leftDeg > 0 && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: halfSize,
          height: size,
          overflow: 'hidden',
        }}>
          {showGradient ? (
            <View style={{
              width: size,
              height: size,
              borderRadius: halfSize,
              borderWidth: strokeWidth,
              borderColor: 'transparent',
              position: 'absolute',
              left: 0,
              transform: [{ rotate: `${leftDeg - 90}deg` }],
              overflow: 'hidden',
            }}>
              <LinearGradient
                colors={[gradientStart, gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* Inner mask to hollow out the ring (leave only the stroke) */}
              <View style={{
                position: 'absolute',
                top: strokeWidth,
                left: strokeWidth,
                width: innerSize,
                height: innerSize,
                borderRadius: innerSize / 2,
                backgroundColor: track,
              }} />
            </View>
          ) : (
            <View style={{
              width: size,
              height: size,
              borderRadius: halfSize,
              borderWidth: strokeWidth,
              borderColor: fill,
              position: 'absolute',
              left: 0,
              transform: [{ rotate: `${leftDeg - 90}deg` }],
            }} />
          )}
        </View>
      )}

      {/* Center label */}
      {label ? (
        <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text
            style={{
              fontSize: size < 60 ? fontSize.caption : fontSize.bodyMd,
              fontWeight: fontWeight.bold,
              color: theme.colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
