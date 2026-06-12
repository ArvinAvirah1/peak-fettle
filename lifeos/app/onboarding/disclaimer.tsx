/**
 * Onboarding disclaimer (TICKET-100 #2) — shown once, requires explicit
 * acknowledgement, gates all other UI. Copy reviewed under CONTENT_SAFETY.md.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/theme/ThemeContext';
import { PFButton, ScreenLayout } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, spacing } from '../../src/theme/tokens';
import { PRODUCT_NAME } from '../../src/config/product';
import { DISCLAIMER_KEY } from '../index';

export default function DisclaimerScreen(): React.ReactElement {
  const { theme } = useTheme();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const acknowledge = async (): Promise<void> => {
    setSaving(true);
    await AsyncStorage.setItem(DISCLAIMER_KEY, 'true').catch(() => undefined);
    router.replace('/');
  };

  return (
    <ScreenLayout scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Ionicons name="information-circle-outline" size={44} color={theme.colors.accentDefault} />
        <Text
          accessibilityRole="header"
          style={{
            color: theme.colors.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading2,
            marginTop: spacing.s5,
            marginBottom: spacing.s4,
          }}
        >
          Before you start
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyLg,
            lineHeight: 28,
            marginBottom: spacing.s4,
          }}
        >
          {PRODUCT_NAME} is a tool for focus, habits, and direction. It is not a substitute for
          professional mental-health care, and it never diagnoses or treats anything.
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyLg,
            lineHeight: 28,
            marginBottom: spacing.s8,
          }}
        >
          If you're in crisis, please reach out to a professional — support resources are always one tap
          away under "Need help?" in the You tab.
        </Text>
        <PFButton label="I understand" onPress={() => void acknowledge()} loading={saving} />
      </View>
    </ScreenLayout>
  );
}
