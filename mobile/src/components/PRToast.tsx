/**
 * PRToast — non-blocking personal record celebration toast.
 *
 * Spec §6: "🏆 New best: Bench 102.5kg e1RM (+2.5)"
 * Appears at the top of the screen for ~3 s then slides away.
 * Themed, no raw 'bold' — uses fontWeight token.
 *
 * Motion polish (Agent K, 2026-06-11):
 *   - Entrance: spring slide-up + concurrent opacity fade (ease-out character)
 *   - Exit: ease-in timing slide-down + opacity fade
 *   - Reduce Motion: instant opacity cross-fade only, no slide
 *   - Shadow elevation bumped for visual lift
 *
 * Usage:
 *   const [prToast, setPrToast] = useState<PRToastData | null>(null);
 *   <PRToast data={prToast} onDismiss={() => setPrToast(null)} />
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTranslation } from 'react-i18next';

export interface PRToastData {
  exerciseName: string;
  e1rm: number;
  delta: number;
  unitLabel: string;
}

interface Props {
  data: PRToastData | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const SLIDE_PX = -80;

export default function PRToast({ data, onDismiss, autoDismissMs = 3000 }: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const reduceMotion = useReduceMotion();
  const slideAnim = useRef(new Animated.Value(SLIDE_PX)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data) {
      if (timerRef.current) clearTimeout(timerRef.current);

      if (reduceMotion) {
        slideAnim.setValue(0);
        opacityAnim.setValue(1);
      } else {
        slideAnim.setValue(SLIDE_PX);
        opacityAnim.setValue(0);
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 10,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      }

      timerRef.current = setTimeout(() => {
        dismiss();
      }, autoDismissMs);
    } else {
      slideAnim.setValue(SLIDE_PX);
      opacityAnim.setValue(0);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const dismiss = () => {
    if (reduceMotion) {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => onDismiss());
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SLIDE_PX,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss());
    }
  };

  if (!data) return null;

  const { exerciseName, e1rm, delta, unitLabel } = data;
  const e1rmStr = Math.round(e1rm * 10) / 10;
  const deltaStr = Math.round(delta * 10) / 10;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('logger:prToast.a11yLabel', { exercise: exerciseName, value: e1rmStr, unit: unitLabel, delta: deltaStr })}
      style={[
        styles.container,
        {
          backgroundColor: colors.accentDefault,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.s4,
          paddingVertical: spacing.s3,
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={t('logger:prToast.dismissLabel')}
        style={styles.inner}
      >
        <Text style={styles.emoji}>🏆</Text>
        <Text
          style={[
            styles.text,
            {
              color: theme.components.buttonPrimaryText,
              fontSize: fontSize.bodyMd,
              fontWeight: fontWeight.semibold,
            },
          ]}
          numberOfLines={1}
        >
          {delta > 0
            ? t('logger:prToast.newBestDelta', { exercise: exerciseName, value: e1rmStr, unit: unitLabel, delta: deltaStr })
            : t('logger:prToast.newBest', { exercise: exerciseName, value: e1rmStr, unit: unitLabel })}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 20,
  },
  text: {
    flex: 1,
  },
});
