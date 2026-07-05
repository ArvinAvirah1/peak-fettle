/**
 * ReclaimedHero (TICKET-163) — the Focus tab's hero: a single legible number
 * (time reclaimed today) + blocks-held + an hourly bar strip.
 *
 * Renders an informative, never-blank zero state (zeroState prop, or all-zero
 * data) rather than an empty hero — the app is fully honest when blocking is
 * unavailable or nothing has happened yet today. Card-based (ui.tsx), token
 * colors only, tabular-nums on every numeral, FadeSlideIn entrance.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import { Card } from '../ui';
import { FadeSlideIn } from '../motion';

const HOUR_LABELS: Record<number, string> = {
  6: '6a',
  12: '12p',
  18: '6p',
};

function formatReclaimed(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ReclaimedHero({
  totalMinutes,
  blocksHeld,
  hourly,
  zeroState = false,
}: {
  totalMinutes: number;
  blocksHeld: number;
  hourly: number[];
  zeroState?: boolean;
}): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  const maxBucket = hourly.reduce((max, v) => (v > max ? v : max), 0);
  const isAllZero = totalMinutes <= 0 && blocksHeld <= 0 && maxBucket <= 0;
  const showZero = zeroState || isAllZero;

  const accessibilityLabel = showZero
    ? 'Reclaimed 0 minutes today. Held blocks and finished sessions add up here.'
    : `Reclaimed ${formatReclaimed(totalMinutes)} today across ${blocksHeld} ${
        blocksHeld === 1 ? 'block' : 'blocks'
      } held.`;

  return (
    <FadeSlideIn>
      <Card variant="elevated" accessibilityLabel={accessibilityLabel}>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.bodySm,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          Reclaimed today
        </Text>

        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.display,
            fontVariant: ['tabular-nums'],
            marginTop: spacing.s1,
          }}
        >
          {formatReclaimed(totalMinutes)}
        </Text>

        {showZero ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              color: c.textSecondary,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodySm,
              marginTop: spacing.s2,
              lineHeight: 20,
            }}
          >
            Held blocks and finished sessions add up here.
          </Text>
        ) : (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              color: c.textSecondary,
              fontFamily: fontFamily.medium,
              fontSize: fontSize.bodySm,
              marginTop: spacing.s2,
              fontVariant: ['tabular-nums'],
            }}
          >
            {blocksHeld} {blocksHeld === 1 ? 'block' : 'blocks'} held
          </Text>
        )}

        {/* Hourly strip — 24 token-colored bars, sparse hour labels. Always
            rendered (even at zero) so the hero never looks broken; bars sit
            flat on the baseline when every bucket is 0. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            height: 40,
            marginTop: spacing.s5,
            borderBottomWidth: 1,
            borderBottomColor: c.borderDefault,
          }}
        >
          {hourly.map((v, hour) => {
            const heightPx = maxBucket > 0 ? Math.max(2, Math.round((v / maxBucket) * 36)) : 2;
            return (
              <View
                key={hour}
                style={{
                  flex: 1,
                  height: heightPx,
                  marginHorizontal: 1,
                  borderRadius: 2,
                  backgroundColor: v > 0 ? c.accentDefault : c.borderDefault,
                }}
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', marginTop: spacing.s1 }}>
          {hourly.map((_, hour) => (
            <View key={hour} style={{ flex: 1, alignItems: 'center' }}>
              {HOUR_LABELS[hour] ? (
                <Text
                  style={{
                    color: c.textTertiary,
                    fontFamily: fontFamily.regular,
                    fontSize: fontSize.caption,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {HOUR_LABELS[hour]}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    </FadeSlideIn>
  );
}
