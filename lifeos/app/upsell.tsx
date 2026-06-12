/**
 * Upsell — free-tier users see this, not an error (TICKET-101 #3).
 * Entitlement is bundled into the paid tier (Q31); plumbing stays separable.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, ScreenLayout } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { COMPANION_FITNESS_NAME, PRODUCT_NAME } from '../src/config/product';

export default function UpsellScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { logout, refreshProfile } = useAuth();

  return (
    <ScreenLayout scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Ionicons name="trail-sign-outline" size={48} color={theme.colors.accentDefault} />
        <Text
          accessibilityRole="header"
          style={{
            color: theme.colors.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading2,
            marginTop: spacing.s5,
          }}
        >
          {PRODUCT_NAME} comes with {COMPANION_FITNESS_NAME} Pro
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyMd,
            lineHeight: 24,
            marginTop: spacing.s3,
            marginBottom: spacing.s8,
          }}
        >
          Focus blocking, habit stacks, goals, and a plan built around your answers — included with your
          existing {COMPANION_FITNESS_NAME} subscription. Upgrade in the {COMPANION_FITNESS_NAME} app, then
          come back here.
        </Text>
        <PFButton label="I've upgraded — check again" onPress={() => void refreshProfile()} />
        <PFButton label="Sign out" variant="ghost" onPress={() => void logout()} style={{ marginTop: spacing.s3 }} />
      </View>
    </ScreenLayout>
  );
}
