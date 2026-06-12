/**
 * "How we handle your data" (TICKET-100 #3) — plain-English, factual,
 * no absolute promises (CONTENT_SAFETY.md §5). Mirrors the legal addendum.
 */

import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, ScreenLayout, SectionTitle } from '../src/components/ui';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { PRODUCT_NAME } from '../src/config/product';

function Body({ children }: { children: string }): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.textSecondary,
        fontFamily: fontFamily.regular,
        fontSize: fontSize.bodyMd,
        lineHeight: 24,
      }}
    >
      {children}
    </Text>
  );
}

export default function DataHandlingScreen(): React.ReactElement {
  return (
    <ScreenLayout>
      <SectionTitle top={spacing.s4}>On this device</SectionTitle>
      <Card>
        <Body>
          Your habits, goals, mood check-ins, notes, survey answers, and focus rules live in a database on
          this phone. {PRODUCT_NAME} works fully offline.
        </Body>
      </Card>

      <SectionTitle>Screen time</SectionTitle>
      <Card>
        <Body>
          App usage and blocking run through Apple's Screen Time framework, which keeps that data on the
          device. Apple does not allow apps to export it — so we never receive which apps you use or for
          how long, and no copy exists on our servers.
        </Body>
      </Card>

      <SectionTitle>On our servers</SectionTitle>
      <Card>
        <Body>
          Three things: your account sign-in, a flag saying your subscription includes this app, and — if
          you turn on backup — an encrypted backup file. The backup is encrypted on your device before
          upload; the key comes from your recovery code, which we never see, so we cannot read the
          contents.
        </Body>
      </Card>

      <SectionTitle>What we don't do</SectionTitle>
      <Card>
        <Body>
          We don't sell or share your data, and we don't use your notes, moods, goals, or surveys for
          advertising or for training models.
        </Body>
      </Card>

      <SectionTitle>Your controls</SectionTitle>
      <Card>
        <Body>
          You can export everything, delete your backups, or delete your whole account from your Peak
          Fettle profile. Signing out and uninstalling removes the local database from the phone.
        </Body>
      </Card>
    </ScreenLayout>
  );
}
