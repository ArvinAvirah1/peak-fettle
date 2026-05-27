/**
 * BrandLogo — Peak Fettle brand lockup
 * TICKET-063
 *
 * Renders the scatter-plot + wordmark logo from pre-exported PNG assets
 * (generated from mobile/assets/brand/peak-fettle-logo.svg at build time).
 * Using PNGs avoids the react-native-svg limitation where in-SVG @font-face
 * is ignored, so the Outfit wordmark always renders correctly on device.
 *
 * Variants
 *   dark       — light-on-dark recolor (white axes/wordmark, teal stays)
 *   horizontal — chart mark on left, "Peak Fettle" text on right
 *
 * For horizontal layout the mark-only PNG is used alongside a native <Text>
 * set in Outfit Bold (bundled via TICKET-057), giving crisp text at any size.
 *
 * The vertical lockup PNG (logo-light / logo-dark) is used for splash and
 * auth header surfaces where the full stacked lockup is appropriate.
 *
 * Asset source: scatter_09_outfit-stacked.svg → cairosvg exports
 * Dark variant: #13415C (slate) swapped to #FFFFFF; #0F9D8E (teal) unchanged.
 */

import React from 'react';
import { View, Text, Image } from 'react-native';
import { fontFamily } from '../theme/tokens';

// ── PNG asset references ─────────────────────────────────────────────────────

// Full vertical lockup (chart + "Peak Fettle" wordmark stacked)
const LOGO_LIGHT = require('../../assets/brand/logo-light.png');
const LOGO_DARK  = require('../../assets/brand/logo-dark.png');

// Mark-only (chart without wordmark) — used for horizontal layout
const MARK_LIGHT = require('../../assets/brand/mark-only.png');
const MARK_DARK  = require('../../assets/brand/mark-only-dark.png');

// ── Aspect ratios ────────────────────────────────────────────────────────────
// Full lockup exported from viewBox 0 0 620 560  → 620:560 ≈ 1.107
const LOGO_ASPECT = 620 / 560;
// Mark-only exported from viewBox 80 0 500 520 into a square canvas;
// resizeMode="contain" handles any padding automatically.

// ── Brand identity colors (fixed, not from theme) ────────────────────────────
const SLATE = '#13415C';
const WHITE = '#FFFFFF';

// ── Component ────────────────────────────────────────────────────────────────

export interface BrandLogoProps {
  /**
   * Controls the display height in logical pixels.
   * Width is derived from aspect ratio for the vertical lockup;
   * in horizontal layout the mark height equals this value.
   */
  height?: number;

  /**
   * Light-on-dark variant — white axes, dots, and wordmark; teal stays.
   * Use on all dark-background surfaces (splash, auth, home tab).
   */
  dark?: boolean;

  /**
   * Horizontal layout: chart mark on the left, wordmark to the right.
   * Use for compact surfaces like the home header bar.
   */
  horizontal?: boolean;
}

export function BrandLogo({
  height = 120,
  dark = false,
  horizontal = false,
}: BrandLogoProps): React.ReactElement {
  const textColor = dark ? WHITE : SLATE;

  if (horizontal) {
    // Mark-only PNG + native Text (Outfit Bold) side by side
    const markSize = height;          // mark is visually square-ish
    const wordmarkFontSize = Math.round(height * 0.42);

    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        accessible
        accessibilityRole="image"
        accessibilityLabel="Peak Fettle logo"
      >
        <Image
          source={dark ? MARK_DARK : MARK_LIGHT}
          style={{ width: markSize, height: markSize }}
          resizeMode="contain"
        />
        <Text
          style={{
            fontFamily: fontFamily.bold,
            fontSize: wordmarkFontSize,
            color: textColor,
            letterSpacing: -0.5,
            includeFontPadding: false,
          }}
        >
          Peak Fettle
        </Text>
      </View>
    );
  }

  // Vertical lockup: full PNG (chart + wordmark already baked in)
  const logoWidth = height * LOGO_ASPECT;

  return (
    <Image
      source={dark ? LOGO_DARK : LOGO_LIGHT}
      style={{ width: logoWidth, height }}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Peak Fettle logo"
    />
  );
}
