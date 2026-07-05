/**
 * NotificationPrime.tsx (TICKET-166) — contextual, once-only notification
 * permission "prime" card.
 *
 * Self-gating: renders null until `shouldShowPrime()` resolves true, so a
 * caller can mount `<MaybeNotificationPrime />` unconditionally at a good
 * moment (the plan-reveal completion screen) without its own gating logic.
 * This is an inline Card, never a modal — it must never block navigation.
 * Either choice ("Turn on reminders" or "Not now") marks the prime as shown
 * and hides the card; permission itself is requested via the frozen
 * src/services/notifications.ts surface, never expo-notifications directly.
 */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';
import { Card, PFButton } from './ui';
import { Ionicons } from './Icon';
import { fontFamily, fontSize, spacing } from '../theme/tokens';
import { haptic } from '../lib/haptics';
import { showToast } from '../lib/feedback';
import { shouldShowPrime, markPrimeShown } from '../lib/primeGate';
import { requestPermission, rescheduleAll } from '../services/notifications';
import { FadeSlideIn } from './motion';

export function MaybeNotificationPrime(): React.ReactElement | null {
  const { theme } = useTheme();
  const c = theme.colors;
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void shouldShowPrime().then((show) => {
      if (cancelled) return;
      setVisible(show);
      setChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async (): Promise<void> => {
    await markPrimeShown();
    setVisible(false);
  };

  const onEnable = async (): Promise<void> => {
    setLoading(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        await rescheduleAll();
        haptic.success();
        showToast({ kind: 'success', message: 'Reminders are on.' });
      } else {
        showToast({
          kind: 'info',
          message: 'You can turn these on anytime in You → Reminders.',
        });
      }
    } finally {
      setLoading(false);
      await dismiss();
    }
  };

  const onNotNow = (): void => {
    void dismiss();
  };

  if (!checked || !visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(160)}>
      <FadeSlideIn>
        <Card
          variant="elevated"
          accessibilityLabel="Want a nudge at the right moments?"
          style={{ alignItems: 'flex-start' }}
        >
          <Ionicons
            name="notifications-outline"
            size={26}
            color={c.accentDefault}
            style={{ marginBottom: spacing.s3 }}
          />
          <Text
            accessibilityRole="header"
            style={{
              color: c.textPrimary,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.bodyLg,
              marginBottom: spacing.s2,
            }}
          >
            Want a nudge at the right moments?
          </Text>
          <Text
            style={{
              color: c.textSecondary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodySm,
              lineHeight: 20,
              marginBottom: spacing.s4,
            }}
          >
            Reminders stay on this device — at most 2 a day, and never during your quiet hours.
          </Text>
          <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
            <PFButton
              label="Not now"
              variant="ghost"
              onPress={onNotNow}
              disabled={loading}
              style={{ flex: 1, marginRight: spacing.s3 }}
            />
            <PFButton
              label="Turn on reminders"
              onPress={() => void onEnable()}
              loading={loading}
              style={{ flex: 2 }}
            />
          </View>
        </Card>
      </FadeSlideIn>
    </Animated.View>
  );
}
