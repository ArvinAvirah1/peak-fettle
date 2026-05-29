/**
 * Local Ionicons shim — drop-in replacement for `@expo/vector-icons`'s Ionicons.
 *
 * WHY (IOS-26-CRASH-FIX, 2026-05-29):
 * `@expo/vector-icons` loads its icon font at runtime via `expo-font`'s native
 * `loadAsync` the first time any icon renders. On iOS 26 that native call throws
 * an NSException which RN's bridge cannot convert to a JS error, segfaulting
 * Hermes. The first icon render happens on the first authenticated screen (the
 * tab bar), which is why the app reaches the login screen but crashes the moment
 * you sign in — and then crashes on every relaunch once a session is stored.
 *
 * This shim renders icon glyphs with a plain <Text> using the `Ionicons` font,
 * which is now EMBEDDED into the native binary at build time via the `expo-font`
 * config plugin in app.json. Because the font is registered natively, no runtime
 * `loadAsync` is ever called — the crashing code path is gone entirely, while the
 * icons still render identically.
 *
 * The glyph map (name -> unicode codepoint) is vendored at
 * src/constants/ioniconsGlyphMap.json (copied verbatim from @expo/vector-icons).
 */

import React from 'react';
import { Text, StyleProp, TextStyle, TextProps } from 'react-native';

import glyphMap from '../constants/ioniconsGlyphMap.json';

export type IoniconName = keyof typeof glyphMap;

export interface IoniconsProps extends Omit<TextProps, 'style' | 'children'> {
  name: IoniconName | string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

function IoniconsComponent({
  name,
  size = 24,
  color,
  style,
  ...rest
}: IoniconsProps): React.ReactElement {
  const codepoint = (glyphMap as Record<string, number>)[name as string];
  return (
    <Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      allowFontScaling={false}
      maxFontSizeMultiplier={1}
      {...rest}
      style={[{ fontFamily: 'Ionicons', fontSize: size, color }, style]}
    >
      {codepoint != null ? String.fromCodePoint(codepoint) : ''}
    </Text>
  );
}

// Expose the glyph map so existing `keyof typeof Ionicons.glyphMap` type
// references (e.g. cosmetics.tsx) keep compiling unchanged.
IoniconsComponent.glyphMap = glyphMap;

export const Ionicons = IoniconsComponent;

export default Ionicons;
