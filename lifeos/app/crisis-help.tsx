/**
 * "Need help?" (TICKET-100 #1) — the permanent crisis-resource screen,
 * reachable from the You tab at all times. No engagement mechanics.
 */

import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { ScreenLayout } from '../src/components/ui';
import { CrisisResourcesBanner } from '../src/components/CrisisResourcesBanner';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { PRODUCT_NAME } from '../src/config/product';

export default function CrisisHelpScreen(): React.ReactElement {
  const { theme } = useTheme();
  return (
    <ScreenLayout>
      <Text
        style={{
          color: theme.colors.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodyMd,
          lineHeight: 24,
          marginTop: spacing.s4,
        }}
      >
        {PRODUCT_NAME} is a tool for everyday focus and habits — it is not equipped to help in a crisis,
        and you deserve more than an app right now. These services are free, confidential, and staffed by
        real people.
      </Text>
      <CrisisResourcesBanner />
      <Text
        style={{
          color: theme.colors.textTertiary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodySm,
          lineHeight: 21,
          marginTop: spacing.s3,
        }}
      >
        If you're outside the US, your local emergency number and national crisis lines are the right
        place to start.
      </Text>
    </ScreenLayout>
  );
}
