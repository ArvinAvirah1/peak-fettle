/**
 * Exercise player (TICKET-108) — one step per screen, share of duration as a
 * soft countdown, completion logs + credits a matching habit if one exists.
 * Skippable at every point; no penalty copy anywhere.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, ScreenLayout } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { ExerciseRow, getExercise, logExerciseCompletion } from '../src/data/mood';
import { listHabits, logHabit } from '../src/data/habits';
import { haptic } from '../src/lib/haptics';

export default function ExercisePlayerScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const [exercise, setExercise] = useState<ExerciseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    void getExercise(slug).then((row) => {
      setExercise(row);
      setLoading(false);
    });
  }, [slug]);

  const steps = useMemo(() => (exercise ? exercise.body.split('\n').filter(Boolean) : []), [exercise]);

  const finish = async (): Promise<void> => {
    if (!exercise) return;
    await logExerciseCompletion(exercise.id);
    // Credit a matching breathing/mindfulness habit if the user has one.
    const habits = await listHabits();
    const match = habits.find((h) => {
      const n = h.name.toLowerCase();
      return n.includes('breath') || n.includes('mindful') || n.includes('meditat');
    });
    if (match) await logHabit(match.id, 'done');
    haptic.success();
    setDone(true);
  };

  if (loading || !exercise) {
    return (
      <ScreenLayout scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {loading ? (
            <ActivityIndicator color={c.accentDefault} accessibilityLabel="Loading exercise" />
          ) : (
            <PFButton label="Close" variant="secondary" onPress={() => router.back()} />
          )}
        </View>
      </ScreenLayout>
    );
  }

  if (done) {
    return (
      <ScreenLayout scroll={false} edges={['top', 'bottom']}>
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="checkmark-circle-outline" size={56} color={c.statusSuccess} accessibilityLabel="" />
          <Text
            accessibilityRole="header"
            style={{ color: c.textPrimary, fontFamily: fontFamily.bold, fontSize: fontSize.heading2, marginTop: spacing.s4 }}
          >
            {exercise.title} — done
          </Text>
          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, marginTop: spacing.s2, textAlign: 'center' }}>
            Take that steadiness with you.
          </Text>
          <PFButton label="Close" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: spacing.s8 }} />
        </View>
      </ScreenLayout>
    );
  }

  const step = steps[index];
  const isLastStep = index === steps.length - 1;

  return (
    <ScreenLayout scroll={false} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.s2 }}>
        <Text
          accessibilityLabel={`${exercise.title}, step ${index + 1} of ${steps.length}`}
          style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, fontVariant: ['tabular-nums'] }}
        >
          {exercise.title} · {index + 1}/{steps.length}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close exercise"
          onPress={() => router.back()}
          style={{ width: HIT_TARGET, height: HIT_TARGET, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close-outline" size={26} color={c.textSecondary} />
        </Pressable>
      </View>
      <View
        style={{ flexDirection: 'row', marginBottom: spacing.s6 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {steps.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: radius.full,
              marginRight: i < steps.length - 1 ? spacing.s1 : 0,
              backgroundColor: i < index ? c.statusSuccess : i === index ? c.accentDefault : c.borderDefault,
            }}
          />
        ))}
      </View>

      <Animated.View
        key={index}
        entering={reducedMotion ? undefined : FadeInDown.duration(240)}
        style={{ flex: 1, justifyContent: 'center' }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.medium,
            fontSize: fontSize.heading3,
            lineHeight: 32,
            textAlign: 'center',
            paddingHorizontal: spacing.s4,
          }}
        >
          {step}
        </Text>
      </Animated.View>

      <View style={{ paddingBottom: spacing.s4 }}>
        <PFButton
          label={isLastStep ? 'Finish' : 'Next'}
          onPress={() => {
            if (isLastStep) {
              void finish();
            } else {
              haptic.impact('light');
              setIndex(index + 1);
            }
          }}
        />
        {index > 0 ? (
          <PFButton
            label="Back"
            variant="ghost"
            onPress={() => {
              haptic.selection();
              setIndex(index - 1);
            }}
            style={{ marginTop: spacing.s2 }}
          />
        ) : null}
      </View>
    </ScreenLayout>
  );
}
