/**
 * MilestoneBanner — dismissable, non-blocking affordance for TICKET-120.
 *
 * Rendered inline in the Today tab (NOT as a modal) when the flag is on and a
 * milestone has just been crossed. The caller controls visibility (via
 * dismissedMilestone state); the banner provides its own dismiss affordance so
 * users are never trapped. Celebratory copy only (CONTENT_SAFETY §3).
 *
 * Usage in today/index.tsx — see entryPoints in the structured output.
 */

import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '../../components/ui';
import { Ionicons } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, spacing } from '../../theme/tokens';
import type { ShareMilestone } from './milestones';
import { MILESTONE_COPY, MILESTONE_LABELS } from './milestones';

export interface MilestoneBannerProps {
  milestone: ShareMilestone;
  streakCount: number;
  onDismiss: () => void;
}

export function MilestoneBanner({
  milestone,
  streakCount,
  onDismiss,
}: MilestoneBannerProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const copy = MILESTONE_COPY[milestone];
  const label = MILESTONE_LABELS[milestone];

  const handleShare = (): void => {
    router.push({
      pathname: '/share-card',
      params: { streakCount: String(streakCount), milestone: String(milestone) },
    });
    onDismiss();
  };

  return (
    <Card accessibilityLabel={`Milestone reached: ${label}. ${copy.heading}`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Icon */}
        <Ionicons
          name="trophy-outline"
          size={24}
          color={c.accentDefault}
          accessibilityLabel=""
        />

        {/* Copy block */}
        <View style={{ marginLeft: spacing.s3, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                backgroundColor: c.accentMuted,
                borderRadius: 99,
                paddingHorizontal: spacing.s2,
                paddingVertical: 2,
                marginBottom: spacing.s1,
              }}
            >
              <Text
                style={{
                  color: c.accentDefault,
                  fontFamily: fontFamily.semibold,
                  fontSize: fontSize.caption,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {label}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: c.textPrimary,
              fontFamily: fontFamily.semibold,
              fontSize: fontSize.bodyMd,
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
            }}
          >
            {copy.sub}
          </Text>

          {/* Share affordance */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create shareable card"
            onPress={handleShare}
            style={({ pressed }) => ({
              marginTop: spacing.s3,
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: HIT_TARGET,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="share-outline" size={18} color={c.accentDefault} accessibilityLabel="" />
            <Text
              style={{
                color: c.accentDefault,
                fontFamily: fontFamily.semibold,
                fontSize: fontSize.bodySm,
                marginLeft: spacing.s2,
              }}
            >
              Create shareable card
            </Text>
          </Pressable>
        </View>

        {/* Dismiss button — never traps the user */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss milestone banner"
          onPress={onDismiss}
          style={({ pressed }) => ({
            minWidth: HIT_TARGET,
            minHeight: HIT_TARGET,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="close-outline" size={22} color={c.textTertiary} accessibilityLabel="" />
        </Pressable>
      </View>
    </Card>
  );
}
