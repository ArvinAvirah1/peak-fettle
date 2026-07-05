/**
 * "Need help?" (TICKET-100 #1) — the permanent crisis-resource screen,
 * reachable from the You tab at all times. No engagement mechanics.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, ScreenLayout } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { CrisisResourcesBanner } from '../src/components/CrisisResourcesBanner';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { PRODUCT_NAME } from '../src/config/product';

export default function CrisisHelpScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  return (
    <ScreenLayout>
      <Card style={{ marginTop: spacing.s4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color={c.textSecondary}
            style={{ marginTop: 2, marginRight: spacing.s2 }}
            accessibilityLabel=""
          />
          <Text
            style={{
              flex: 1,
              color: c.textSecondary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodyMd,
              lineHeight: 24,
            }}
          >
            {PRODUCT_NAME} is a tool for everyday focus and habits — it is not equipped to help in a crisis,
            and you deserve more than an app right now. These services are free, confidential, and staffed by
            real people.
          </Text>
        </View>
      </Card>
      <CrisisResourcesBanner />
      <Text
        style={{
          color: c.textTertiary,
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
