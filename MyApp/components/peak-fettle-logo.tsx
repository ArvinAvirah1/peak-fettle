/**
 * PeakFettleLogo
 *
 * A Qt-inspired geometric badge mark for Peak Fettle.
 * Built entirely from React Native primitives — no SVG dependency needed.
 *
 * Visual anatomy:
 *   ┌─────────────────┐
 *   │  ╱╲  ╱╲         │   ← two stylised peaks (rotated Views)
 *   │ ╱  ╲╱  ╲        │
 *   │  PEAK FETTLE    │   ← wordmark (optional)
 *   └─────────────────┘
 *
 * The outer badge is a navy rounded-rectangle; the peaks are rendered using
 * border-trick triangles — the same technique React Native devs use when
 * react-native-svg isn't available.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Brand } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PeakFettleLogoProps {
  /** Overall size of the badge square (default 64) */
  size?: number;
  /** Show the text wordmark below the mark (default true) */
  showWordmark?: boolean;
  /** Override badge background colour */
  badgeColor?: string;
  /** Override peak accent colour */
  accentColor?: string;
  style?: ViewStyle;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Renders a single upward-pointing triangle via the CSS border trick. */
function Triangle({
  width,
  height,
  color,
  style,
}: {
  width: number;
  height: number;
  color: string;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        {
          width: 0,
          height: 0,
          borderLeftWidth: width / 2,
          borderRightWidth: width / 2,
          borderBottomWidth: height,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        },
        style,
      ]}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PeakFettleLogo({
  size = 64,
  showWordmark = true,
  badgeColor = Brand.navyMid,
  accentColor = Brand.turquoise,
  style,
}: PeakFettleLogoProps) {
  const radius = size * 0.22;           // badge corner radius (Qt-ish ~22 %)
  const peakW  = size * 0.38;          // each peak triangle width
  const peakH  = size * 0.42;          // peak height
  const peakY  = size * 0.10;          // top padding for peaks
  const gap    = size * 0.04;          // horizontal gap between the two peaks
  const shadowColor = Brand.turquoiseHi;

  // Inner "glow" strip — a subtle horizontal line at the peak bases
  const baseBarH = Math.max(2, size * 0.045);

  return (
    <View style={[styles.wrapper, style]}>
      {/* ── Badge ────────────────────────────────────────────────── */}
      <View
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: badgeColor,
            // Turquoise border — like Qt's coloured outline
            borderWidth: Math.max(1.5, size * 0.025),
            borderColor: accentColor,
          },
        ]}>

        {/* ── Peak group ────────────────────────────────────────── */}
        <View
          style={[
            styles.peaksRow,
            {
              top: peakY,
              gap: gap,
            },
          ]}>
          {/* Left peak — slightly taller for dynamic asymmetry */}
          <Triangle
            width={peakW}
            height={peakH * 1.0}
            color={accentColor}
          />
          {/* Right peak — slightly shorter */}
          <Triangle
            width={peakW * 0.82}
            height={peakH * 0.78}
            color={shadowColor}
            style={{ alignSelf: 'flex-end' }}
          />
        </View>

        {/* ── Base glow bar ─────────────────────────────────────── */}
        <View
          style={{
            position: 'absolute',
            bottom: size * 0.22,
            left: size * 0.12,
            right: size * 0.12,
            height: baseBarH,
            borderRadius: baseBarH / 2,
            backgroundColor: accentColor,
            opacity: 0.35,
          }}
        />

        {/* ── "PF" monogram ─────────────────────────────────────── */}
        <Text
          style={[
            styles.monogram,
            {
              fontSize: size * 0.185,
              color: accentColor,
              bottom: size * 0.065,
              letterSpacing: size * 0.025,
            },
          ]}
          numberOfLines={1}>
          PF
        </Text>
      </View>

      {/* ── Wordmark ───────────────────────────────────────────────── */}
      {showWordmark && (
        <Text
          style={[
            styles.wordmark,
            {
              fontSize: size * 0.2,
              marginTop: size * 0.12,
              color: accentColor,
              letterSpacing: size * 0.018,
            },
          ]}
          numberOfLines={1}>
          PEAK FETTLE
        </Text>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  badge: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  peaksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  monogram: {
    position: 'absolute',
    fontWeight: '800',
    fontFamily: 'System',
  },
  wordmark: {
    fontWeight: '700',
    fontFamily: 'System',
  },
});
