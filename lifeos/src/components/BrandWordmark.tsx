/**
 * BrandWordmark — the LIFEOS caps wordmark (logo direction locked by the
 * founder 2026-07-05: tracked Outfit-semibold caps, LIFE in text color,
 * OS in the sunrise amber accent — see logos/lifeos/round3/r3-w1-caps.svg).
 *
 * This is the ONE place the in-app logo is drawn. Screens must render
 * <BrandWordmark /> rather than typing the product name as styled text, so a
 * future rebrand stays a one-file swap (same rule as PRODUCT_NAME in
 * src/config/product.ts).
 */

import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily } from '../theme/tokens';
import { PRODUCT_NAME } from '../config/product';

interface BrandWordmarkProps {
  /** Caps font size; letter-spacing scales with it (logo spec ratio 0.15). */
  size?: number;
  /** Set false when the wordmark is decorative rather than the screen header. */
  isHeader?: boolean;
  style?: StyleProp<TextStyle>;
}

export function BrandWordmark({
  size = 32,
  isHeader = true,
  style,
}: BrandWordmarkProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Text
      accessibilityRole={isHeader ? 'header' : 'text'}
      accessibilityLabel={PRODUCT_NAME}
      style={[
        {
          color: theme.colors.textPrimary,
          fontFamily: fontFamily.semibold,
          fontSize: size,
          letterSpacing: size * 0.15,
        },
        style,
      ]}
    >
      LIFE
      <Text style={{ color: theme.colors.accentDefault }}>OS</Text>
    </Text>
  );
}

export default BrandWordmark;
