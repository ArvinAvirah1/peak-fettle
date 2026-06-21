/**
 * ShareCard — off-screen capturable view for TICKET-120.
 *
 * Styled with Card + Summit tokens. Rendered at a fixed 375×280pt size so
 * react-native-view-shot captures a consistent aspect ratio regardless of
 * the device screen. The caller passes a ref to this view and calls
 * captureRef() from react-native-view-shot.
 *
 * CONTENT_SAFETY: celebratory copy only; no streak-loss framing; no shaming.
 * Design rules: no raw hex (theme tokens only), Ionicons for icons (no emoji),
 * tabular-nums for streak count, PRODUCT_NAME wordmark from src/config/product.
 */

import React from 'react';
import { Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import {
  fontFamily,
  fontSize,
  radius,
  spacing,
} from '../../theme/tokens';
import { Ionicons } from '../../components/Icon';
import { PRODUCT_NAME } from '../../config/product';
import type { ShareMilestone } from './milestones';
import { MILESTONE_COPY, MILESTONE_LABELS } from './milestones';

export interface ShareCardProps {
  /** Current streak count to display. */
  streakCount: number;
  /** The milestone that was just crossed. */
  milestone: ShareMilestone;
  /** Habit / stack names participating in this streak (up to 3 shown). */
  habitNames: string[];
  /**
   * Heat snippet: last 14 day-key statuses ('done' | 'rest' | 'skip' | null).
   * Length must be 14; null = unlogged day.
   */
  heatSnippet: (string | null)[];
  /** Forwarded ref so react-native-view-shot can capture this view. */
  cardRef?: React.RefObject<View>;
}

const CARD_WIDTH = 375;
const CARD_HEIGHT = 280;
const DOT_SIZE = 14;
const HEAT_DAYS = 14;

function heatColor(
  status: string | null,
  c: ReturnType<typeof useTheme>['theme']['colors']
): string {
  if (status === 'done') return c.statusSuccess;
  if (status === 'rest') return c.accentDefault;
  if (status === 'skip') return c.textTertiary;
  return c.borderDefault;
}

export function ShareCard({
  streakCount,
  milestone,
  habitNames,
  heatSnippet,
  cardRef,
}: ShareCardProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  const copy = MILESTONE_COPY[milestone];
  const label = MILESTONE_LABELS[milestone];
  const displayHabits = habitNames.slice(0, 3);
  const normalized = heatSnippet.slice(0, HEAT_DAYS);
  while (normalized.length < HEAT_DAYS) normalized.push(null);

  const containerStyle: ViewStyle = {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: c.bgSecondary,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: c.borderDefault,
    padding: spacing.s5,
    justifyContent: 'space-between',
  };

  return (
    <View ref={cardRef} style={containerStyle}>
      {/* Header row: milestone badge + streak count */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            backgroundColor: c.accentMuted,
            borderRadius: radius.full,
            paddingHorizontal: spacing.s3,
            paddingVertical: spacing.s1,
          }}
        >
          <Text
            style={{
              color: c.accentDefault,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.bodySm,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {label}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons
            name="flame-outline"
            size={22}
            color={c.accentDefault}
            accessibilityLabel="streak"
          />
          <Text
            style={{
              color: c.textPrimary,
              fontFamily: fontFamily.bold,
              fontSize: fontSize.heading2,
              marginLeft: spacing.s1,
              fontVariant: ['tabular-nums'],
            }}
          >
            {streakCount}
          </Text>
        </View>
      </View>

      {/* Celebratory copy */}
      <View style={{ marginTop: spacing.s3 }}>
        <Text
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.bodyLg,
            lineHeight: 26,
          }}
        >
          {copy.heading}
        </Text>
        <Text
          style={{
            color: c.textSecondary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodySm,
            marginTop: spacing.s1,
            lineHeight: 20,
          }}
        >
          {copy.sub}
        </Text>
      </View>

      {/* Habit / stack names */}
      {displayHabits.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s2, marginTop: spacing.s3 }}>
          {displayHabits.map((name) => (
            <View
              key={name}
              style={{
                backgroundColor: c.bgElevated,
                borderRadius: radius.full,
                paddingHorizontal: spacing.s3,
                paddingVertical: spacing.s1,
              }}
            >
              <Text
                style={{
                  color: c.textSecondary,
                  fontFamily: fontFamily.medium,
                  fontSize: fontSize.caption,
                }}
                numberOfLines={1}
              >
                {name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 14-day heat snippet */}
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.s4 }}
        accessibilityLabel="14-day activity heat map"
      >
        {normalized.map((status, i) => (
          <View
            key={i}
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: radius.sm,
              backgroundColor: heatColor(status, c),
            }}
          />
        ))}
      </View>

      {/* Footer: wordmark */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          marginTop: spacing.s3,
        }}
      >
        <Ionicons
          name="trending-up-outline"
          size={14}
          color={c.textTertiary}
          accessibilityLabel=""
        />
        <Text
          style={{
            color: c.textTertiary,
            fontFamily: fontFamily.medium,
            fontSize: fontSize.caption,
            marginLeft: spacing.s1,
          }}
        >
          {PRODUCT_NAME}
        </Text>
      </View>
    </View>
  );
}
