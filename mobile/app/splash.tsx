/**
 * SplashScreen — P2-001
 * Full-screen animated entry point. Checks AsyncStorage for first-launch flag
 * and routes to /intro (new users) or /(tabs)/ (returning users).
 * Respects reduced-motion accessibility preference.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme/ThemeContext';
import { BrandMark, BRAND_NAVY } from '../src/components/BrandMark';
import { fontFamily } from '../src/theme/tokens';

const FIRST_LAUNCH_KEY = '@peak_fettle/first_launch_done';

export default function SplashScreen(): React.ReactElement {
  const router = useRouter();
  const { theme, fontSize, fontWeight } = useTheme();
  const { colors } = theme;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(
      async () => {
        try {
          const done = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
          if (!done) {
            await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
            router.replace('/intro');
          } else {
            router.replace('/(tabs)/');
          }
        } catch {
          // If AsyncStorage fails, default to tabs
          router.replace('/(tabs)/');
        }
      },
      reducedMotion ? 0 : 1800,
    );
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Staggered entrance: mark springs in, lettering follows, subline last.
  // (Founder 2026-06-10: splash artwork now matches the App Store icon.)
  const markEntering = reducedMotion
    ? undefined
    : FadeInDown.springify().damping(14).stiffness(120).duration(600);
  const wordmarkEntering = reducedMotion ? undefined : FadeIn.duration(450).delay(250);
  const sublineEntering = reducedMotion ? undefined : FadeInUp.duration(400).delay(500);

  return (
    <View style={[styles.container, { backgroundColor: BRAND_NAVY }]}>
      {/* App-icon mark (bars + peak) — seamless against the native splash,
          which uses the same artwork and background (founder 2026-06-10). */}
      <Animated.View entering={markEntering}>
        <BrandMark size={132} />
      </Animated.View>
      <Animated.Text
        entering={wordmarkEntering}
        style={{
          fontFamily: fontFamily.bold,
          fontSize: fontSize.heading2,
          color: '#FFFFFF',
          letterSpacing: -0.5,
          marginTop: 12,
        }}
      >
        Peak Fettle
      </Animated.Text>
      <Animated.Text
        entering={sublineEntering}
        style={{
          fontSize: fontSize.bodyLg,
          color: colors.textSecondary,
          marginTop: 20,
          letterSpacing: 1,
        }}
      >
        Train. Rank. Dominate.
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
