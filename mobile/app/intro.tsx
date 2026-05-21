/**
 * IntroScreen — Day 1 Beginner Intro (Spec §2.2)
 * 3-screen swipeable/stepped intro shown to first-time users only.
 * No jargon. Plain English. Drives to /onboarding at the end.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface IntroSlide {
  icon: string;
  headline: string;
  body: string;
}

const SLIDES: IntroSlide[] = [
  {
    icon: '🏋️',
    headline: 'Built for every body.',
    body: "Whether you're picking up a barbell for the first time or chasing a podium finish, Peak Fettle meets you where you are. No judgement. Just progress.",
  },
  {
    icon: '📊',
    headline: 'Log your sessions. See your rank.',
    body: "Log your workouts in seconds. We'll show you exactly where you stand compared to people at your level — not the internet's strongest 1%.",
  },
  {
    icon: '🔥',
    headline: 'Even a 5-minute session counts.',
    body: "Rest days don't break your streak. Only missing sessions back-to-back does. We built it this way on purpose.",
  },
];

export default function IntroScreen(): React.ReactElement {
  const router = useRouter();
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { colors } = theme;
  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const goToOnboarding = () => {
    router.replace('/onboarding');
  };

  const handleNext = () => {
    if (step < SLIDES.length - 1) {
      const next = step + 1;
      setStep(next);
      scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * next, animated: true });
    } else {
      goToOnboarding();
    }
  };

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const newStep = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (newStep !== step) {
      setStep(newStep);
    }
  };

  const isLast = step === SLIDES.length - 1;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgPrimary }]}>
      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i === step ? colors.accentDefault : colors.bgTertiary,
                width: i === step ? 20 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={styles.scrollView}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
            <Text style={styles.icon}>{slide.icon}</Text>
            <Text
              style={[
                styles.headline,
                {
                  fontSize: fontSize.heading2,
                  fontWeight: fontWeight.bold,
                  color: colors.textPrimary,
                },
              ]}
            >
              {slide.headline}
            </Text>
            <Text
              style={[
                styles.body,
                {
                  fontSize: fontSize.bodyLg,
                  color: colors.textSecondary,
                },
              ]}
            >
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Bottom controls */}
      <View style={[styles.footer, { paddingHorizontal: spacing.s6 }]}>
        {isLast ? (
          <>
            <Pressable
              onPress={goToOnboarding}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.accentDefault,
                  borderRadius: radius.md,
                  paddingVertical: spacing.s4,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Let's go"
            >
              <Text
                style={{
                  fontSize: fontSize.bodyLg,
                  fontWeight: fontWeight.semibold,
                  color: theme.components.buttonPrimaryText,
                  textAlign: 'center',
                }}
              >
                {"Let's go →"}
              </Text>
            </Pressable>
            <Pressable
              onPress={goToOnboarding}
              style={[styles.ghostButton, { marginTop: spacing.s3 }]}
              accessibilityRole="button"
              accessibilityLabel="Skip intro"
            >
              <Text
                style={{
                  fontSize: fontSize.bodySm,
                  color: colors.textSecondary,
                  textAlign: 'center',
                }}
              >
                Skip intro
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={handleNext}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.accentDefault,
                  borderRadius: radius.md,
                  paddingVertical: spacing.s4,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Next"
            >
              <Text
                style={{
                  fontSize: fontSize.bodyLg,
                  fontWeight: fontWeight.semibold,
                  color: theme.components.buttonPrimaryText,
                  textAlign: 'center',
                }}
              >
                Next
              </Text>
            </Pressable>
            <Pressable
              onPress={goToOnboarding}
              style={[styles.ghostButton, { marginTop: spacing.s3 }]}
              accessibilityRole="button"
              accessibilityLabel="Skip intro"
            >
              <Text
                style={{
                  fontSize: fontSize.bodySm,
                  color: colors.textSecondary,
                  textAlign: 'center',
                }}
              >
                Skip intro
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 8,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 72,
    marginBottom: 32,
    textAlign: 'center',
  },
  headline: {
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    textAlign: 'center',
    lineHeight: 28,
  },
  footer: {
    paddingBottom: Platform.OS === 'android' ? 24 : 16,
  },
  primaryButton: {
    width: '100%',
    alignItems: 'center',
  },
  ghostButton: {
    width: '100%',
    paddingVertical: 8,
    alignItems: 'center',
  },
});
