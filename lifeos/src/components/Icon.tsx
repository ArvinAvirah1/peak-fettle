/**
 * Ionicons shim — renders glyphs from the natively-embedded Ionicons font.
 *
 * Same pattern as mobile/src/components/Icon.tsx (IOS-26-CRASH-FIX):
 * @expo/vector-icons calls expo-font.loadAsync() at runtime, which crashes on
 * iOS 26. The font is embedded at build time via the expo-font plugin in
 * app.json, so rendering is a plain <Text> with the codepoint.
 */

import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import glyphMap from '../constants/ioniconsGlyphMap.json';

export interface IoniconsProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}

export const Ionicons = ({
  name,
  size = 24,
  color,
  style,
  accessibilityLabel,
  ...rest
}: IoniconsProps): React.ReactElement => {
  const codepoint = (glyphMap as Record<string, number>)[name];
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[{ fontFamily: 'Ionicons', fontSize: size, color, lineHeight: size + 2 }, style]}
      {...rest}
    >
      {codepoint != null ? String.fromCodePoint(codepoint) : ''}
    </Text>
  );
};
