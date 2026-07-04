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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface IntroSlide {
  icon: string;
  headline: string;
  body: string;
}

const SLIDES: IntroSlide[] = [
  {
    icon: '🏋️',
    headline: 'intro.slide1Headline',
    body: 'intro.slide1Body',
  },
  {
    icon: '📊',
    headline: 'intro.slide2Headline',
    body: 'intro.slide2Body',
  },
  {
    icon: '🔥',
    headline: 'intro.slide3Headline',
    body: 'intro.slide3Body',
  },
];

export default function IntroScreen(): React.ReactElement {
  const router = useRouter();
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
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
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgPrimary }]} edges={['top', 'bottom']}>
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
              {t(`screens:${slide.headline}`)}
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
              {t(`screens:${slide.body}`)}
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
              accessibilityLabel={t('screens:intro.letsGoLabel')}
            >
              <Text
                style={{
                  fontSize: fontSize.bodyLg,
                  fontWeight: fontWeight.semibold,
                  color: theme.components.buttonPrimaryText,
                  textAlign: 'center',
                }}
              >
                {t('screens:intro.letsGo')}
              </Text>
            </Pressable>
            <Pressable
              onPress={goToOnboarding}
              style={[styles.ghostButton, { marginTop: spacing.s3 }]}
              accessibilityRole="button"
              accessibilityLabel={t('screens:intro.skipIntro')}
            >
              <Text
                style={{
                  fontSize: fontSize.bodySm,
                  color: colors.textSecondary,
                  textAlign: 'center',
                }}
              >
                {t('screens:intro.skipIntro')}
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
              accessibilityLabel={t('screens:intro.next')}
            >
              <Text
                style={{
                  fontSize: fontSize.bodyLg,
                  fontWeight: fontWeight.semibold,
                  color: theme.components.buttonPrimaryText,
                  textAlign: 'center',
                }}
              >
                {t('screens:intro.next')}
              </Text>
            </Pressable>
            <Pressable
              onPress={goToOnboarding}
              style={[styles.ghostButton, { marginTop: spacing.s3 }]}
              accessibilityRole="button"
              accessibilityLabel={t('screens:intro.skipIntro')}
            >
              <Text
                style={{
                  fontSize: fontSize.bodySm,
                  color: colors.textSecondary,
                  textAlign: 'center',
                }}
              >
                {t('screens:intro.skipIntro')}
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
    // SafeAreaView (edges top) clears the status bar; this is just breathing room.
    paddingTop: 8,
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
    // SafeAreaView (edges bottom) clears the home indicator; this is breathing room.
    paddingBottom: 16,
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
