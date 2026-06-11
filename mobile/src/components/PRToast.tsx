/**
 * PRToast — non-blocking personal record celebration toast.
 *
 * Spec §6: "🏆 New best: Bench 102.5kg e1RM (+2.5)"
 * Appears at the top of the screen for ~3 s then slides away.
 * Themed, no raw 'bold' — uses fontWeight token.
 *
 * Usage:
 *   const [prToast, setPrToast] = useState<PRToastData | null>(null);
 *   <PRToast data={prToast} onDismiss={() => setPrToast(null)} />
 *
 * Fire with:
 *   setPrToast({ exerciseName: 'Bench Press', e1rm: 102.5, delta: 2.5, unitLabel: 'kg' });
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PRToastData {
  exerciseName: string;
  /** e1RM value in the user's display unit. */
  e1rm: number;
  /** Improvement over prior max (always positive). */
  delta: number;
  unitLabel: string;
}

interface Props {
  data: PRToastData | null;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Default 3000. */
  autoDismissMs?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SLIDE_PX = -80;   // slides up from off-screen top

export default function PRToast({ data, onDismiss, autoDismissMs = 3000 }: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { colors } = theme;
  const slideAnim = useRef(new Animated.Value(SLIDE_PX)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data) {
      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      // Auto-dismiss
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        dismiss();
      }, autoDismissMs);
    } else {
      slideAnim.setValue(SLIDE_PX);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const dismiss = () => {
    Animated.timing(slideAnim, {
      toValue: SLIDE_PX,
      duration: 220,
      useNativeDriver: true,
    }).start(() => onDismiss());
  };

  if (!data) return null;

  const { exerciseName, e1rm, delta, unitLabel } = data;
  const e1rmStr = Math.round(e1rm * 10) / 10;
  const deltaStr = Math.round(delta * 10) / 10;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`New personal record: ${exerciseName} ${e1rmStr} ${unitLabel} estimated 1RM, up ${deltaStr}`}
      style={[
        styles.container,
        {
          backgroundColor: colors.accentDefault,
          borderRadius: radius.lg,
          paddingHorizontal: spacing.s4,
          paddingVertical: spacing.s3,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss record toast"
        style={styles.inner}
      >
        <Text style={[styles.emoji]}>🏆</Text>
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
          New best: {exerciseName} {e1rmStr}{unitLabel} e1RM
          {delta > 0 ? ` (+${deltaStr})` : ''}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles (non-themed static)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
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
