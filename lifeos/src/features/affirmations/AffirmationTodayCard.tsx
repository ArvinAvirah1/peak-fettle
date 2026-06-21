/**
 * AffirmationTodayCard — quiet Today-tab card (TICKET-123).
 *
 * Rendered only when isEnabled('affirmations') AND there is a line to show.
 * Does NOT self-gate on the feature flag — the caller (today.tsx) does that,
 * so the flag logic stays co-located with the other flag checks in that file.
 *
 * Tapping the card navigates to /affirmations so the user can manage lines.
 * The card is deliberately understated: no bold headline, single line of body
 * copy, accent-tinted sparkle icon.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../../components/ui';
import { Ionicons } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import type { AffirmationRow } from './affirmationsData';

interface Props {
  line: AffirmationRow;
}

export function AffirmationTodayCard({ line }: Props): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  return (
    <Card
      onPress={() => router.push('/affirmations')}
      accessibilityLabel={`Today's affirmation. ${line.text}. Tap to manage affirmations.`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Ionicons
          name="sparkles-outline"
          size={18}
          color={c.accentDefault}
          style={{ marginTop: 2, marginRight: spacing.s3 }}
          accessibilityLabel=""
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: c.textSecondary,
              fontFamily: fontFamily.medium,
              fontSize: fontSize.bodySm,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              marginBottom: spacing.s1,
            }}
          >
            Today
          </Text>
          <Text
            style={{
              color: c.textPrimary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodyMd,
              lineHeight: 24,
            }}
          >
            {line.text}
          </Text>
        </View>
      </View>
    </Card>
  );
}
