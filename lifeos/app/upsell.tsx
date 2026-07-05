/**
 * Upsell — free-tier users see this, not an error (TICKET-101 #3).
 * Entitlement is bundled into the paid tier (Q31); plumbing stays separable.
 *
 * TICKET-167 "paywall transparency": Apple 3.1.2 requires clear price +
 * renewal terms before purchase. LifeOS never transacts directly — it
 * reflects entitlement purchased in the companion Peak Fettle app — so this
 * screen shows pricing/terms copy (from src/config/pricing.ts) rather than
 * a native purchase sheet. No toggles, no urgency timers, no fake discounts.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthContext';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, PFButton, ScreenLayout, SectionTitle } from '../src/components/ui';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, spacing } from '../src/theme/tokens';
import { COMPANION_FITNESS_NAME, PRODUCT_NAME } from '../src/config/product';
import { PRO_PRICE_LABEL, RENEWAL_TERMS } from '../src/config/pricing';
import { showToast } from '../src/lib/feedback';

interface Benefit {
  icon: string;
  label: string;
}

const BENEFITS: readonly Benefit[] = [
  { icon: 'shield-checkmark-outline', label: 'Focus blocking for the apps you choose to limit' },
  { icon: 'layers-outline', label: 'Habit stacks that chain small routines together' },
  { icon: 'trail-sign-outline', label: 'Goals that connect to your daily habits' },
  { icon: 'sparkles-outline', label: 'A plan built from your own survey answers' },
];

export default function UpsellScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { logout, refreshProfile } = useAuth();
  const c = theme.colors;

  const [checking, setChecking] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleCheckAgain = async (): Promise<void> => {
    setChecking(true);
    try {
      await refreshProfile();
      showToast({ kind: 'info', message: "Checked your account. If you've upgraded, this screen will update." });
    } catch {
      showToast({ kind: 'error', message: "Couldn't check your account. Try again in a moment." });
    } finally {
      setChecking(false);
    }
  };

  const handleRestore = async (): Promise<void> => {
    setRestoring(true);
    try {
      await refreshProfile();
      showToast({ kind: 'info', message: 'Restored from your Peak Fettle account.' });
    } catch {
      showToast({ kind: 'error', message: "Couldn't restore purchases. Try again in a moment." });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ScreenLayout>
      <View style={{ alignItems: 'center', marginTop: spacing.s8, marginBottom: spacing.s2 }}>
        <Ionicons name="trail-sign-outline" size={48} color={c.accentDefault} />
        <Text
          accessibilityRole="header"
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading2,
            textAlign: 'center',
            marginTop: spacing.s5,
          }}
        >
          {PRODUCT_NAME} comes with {COMPANION_FITNESS_NAME} Pro
        </Text>
        <Text
          style={{
            color: c.textSecondary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyMd,
            lineHeight: 24,
            textAlign: 'center',
            marginTop: spacing.s3,
          }}
        >
          Upgrade in the {COMPANION_FITNESS_NAME} app, then come back here.
        </Text>
      </View>

      <SectionTitle>What you get</SectionTitle>
      <Card>
        {BENEFITS.map((b, i) => (
          <View
            key={b.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.s2,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.borderDefault,
            }}
          >
            <Ionicons name={b.icon} size={20} color={c.accentDefault} />
            <Text
              style={{
                flex: 1,
                color: c.textPrimary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.bodyMd,
                lineHeight: 21,
                marginLeft: spacing.s3,
              }}
            >
              {b.label}
            </Text>
          </View>
        ))}
      </Card>

      <SectionTitle>Pricing & terms</SectionTitle>
      <Card variant="elevated">
        {PRO_PRICE_LABEL ? (
          <Text
            style={{
              color: c.textPrimary,
              fontFamily: fontFamily.bold,
              fontSize: fontSize.heading3,
              marginBottom: spacing.s3,
            }}
          >
            {PRO_PRICE_LABEL}
          </Text>
        ) : (
          <Text
            style={{
              color: c.textPrimary,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.bodyMd,
              marginBottom: spacing.s3,
            }}
          >
            Current pricing is shown in the Peak Fettle app.
          </Text>
        )}
        {RENEWAL_TERMS.map((term, i) => (
          <Text
            key={i}
            style={{
              color: c.textTertiary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.caption,
              lineHeight: 17,
              marginTop: i === 0 ? 0 : spacing.s1,
            }}
          >
            {term}
          </Text>
        ))}
      </Card>

      <SectionTitle>Your data</SectionTitle>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Ionicons name="lock-closed-outline" size={20} color={c.accentDefault} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, marginLeft: spacing.s3 }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>
              Your data stays on this device
            </Text>
            <Text
              style={{
                color: c.textSecondary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.bodySm,
                lineHeight: 20,
                marginTop: spacing.s1,
              }}
            >
              Habits, moods, and plans live in a local database on your phone. They are not uploaded — with or
              without Pro.
            </Text>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: spacing.s4 }}>
        <PFButton
          label="I've upgraded — check again"
          onPress={() => void handleCheckAgain()}
          loading={checking}
        />
        <PFButton
          label="Restore purchases"
          variant="secondary"
          onPress={() => void handleRestore()}
          loading={restoring}
          style={{ marginTop: spacing.s3 }}
        />
        <Text
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            textAlign: 'center',
            marginTop: spacing.s2,
          }}
        >
          Purchases restore through your Peak Fettle account.
        </Text>

        <PFButton
          label="Sign out"
          variant="ghost"
          onPress={() => void logout()}
          style={{ marginTop: spacing.s8 }}
        />
      </View>
    </ScreenLayout>
  );
}
