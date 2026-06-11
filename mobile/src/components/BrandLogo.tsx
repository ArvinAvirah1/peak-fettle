/**
 * BrandLogo — Peak Fettle brand lockup (founder 2026-06-10 revision).
 *
 * The mark is now the APP ICON artwork (BrandMark: ascending teal bars +
 * peak arrow), replacing the earlier scatter-plot iteration, so the home
 * header, auth screens, and splash all match the App Store icon. The
 * "Peak Fettle" lettering stays beside (horizontal) or below (vertical)
 * the mark, set in Outfit Bold.
 *
 * Variants (API unchanged from TICKET-063):
 *   dark       — white lettering for dark surfaces; mark teal is identical
 *   horizontal — mark left, lettering right (home header)
 *   default    — stacked lockup (splash / auth headers)
 */

import React from 'react';
import { View, Text } from 'react-native';
import { fontFamily } from '../theme/tokens';
import { BrandMark } from './BrandMark';

// Brand lettering colors (fixed, not from theme)
const SLATE = '#13415C';
const WHITE = '#FFFFFF';

export interface BrandLogoProps {
  /** Display height in logical pixels (mark height; lockup scales from it). */
  height?: number;
  /** Light-on-dark variant — white lettering; the teal mark is unchanged. */
  dark?: boolean;
  /** Horizontal layout: mark on the left, lettering to the right. */
  horizontal?: boolean;
}

export function BrandLogo({
  height = 120,
  dark = false,
  horizontal = false,
}: BrandLogoProps): React.ReactElement {
  const textColor = dark ? WHITE : SLATE;

  if (horizontal) {
    const wordmarkFontSize = Math.round(height * 0.52);
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        accessible
        accessibilityRole="image"
        accessibilityLabel="Peak Fettle logo"
      >
        <BrandMark size={height} />
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

  // Vertical lockup: mark stacked above the lettering.
  const markSize = Math.round(height * 0.72);
  const wordmarkFontSize = Math.round(height * 0.2);
  return (
    <View
      style={{ alignItems: 'center', gap: 4 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Peak Fettle logo"
    >
      <BrandMark size={markSize} />
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
