/**
 * SplashScreen — P2-001
 * Full-screen animated entry point. Checks AsyncStorage for first-launch flag
 * and routes to /intro (new users) or /(tabs)/ (returning users).
 * Respects reduced-motion accessibility preference.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, SlideInUp, useReducedMotion } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/theme/ThemeContext';

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

  const wordmarkEntering = reducedMotion ? undefined : FadeIn.duration(600);
  const sublineEntering = reducedMotion
    ? undefined
    : SlideInUp.duration(400).delay(200);

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <Animated.Text
        entering={wordmarkEntering}
        style={{
          fontSize: fontSize.display,
          fontWeight: fontWeight.bold,
          color: colors.accentDefault,
          letterSpacing: 4,
        }}
      >
        PEAK FETTLE
      </Animated.Text>
      <Animated.Text
        entering={sublineEntering}
        style={{
          fontSize: fontSize.bodyLg,
          color: colors.textSecondary,
          marginTop: 12,
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
