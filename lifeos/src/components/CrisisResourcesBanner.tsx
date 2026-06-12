/**
 * CrisisResourcesBanner (TICKET-100 #1) — reusable across all screens.
 *
 * Rendered automatically after a mood check-in ≤ 2/5 and reachable any time
 * from the permanent "Need help?" link on the You tab. Never dismiss-blocked,
 * never buried, no engagement mechanics anywhere near it.
 */

import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../theme/tokens';
import { Ionicons } from './Icon';
import { CRISIS_LEAD_COPY, getCrisisResources } from '../content/crisis';

export function CrisisResourcesBanner({ region }: { region?: string }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const resources = getCrisisResources(region);

  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: c.bgElevated,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.borderDefault,
        padding: spacing.s4,
        marginVertical: spacing.s3,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s2 }}>
        <Ionicons name="heart-outline" size={20} color={c.textPrimary} />
        <Text
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.bodyMd,
            marginLeft: spacing.s2,
          }}
        >
          You're not alone
        </Text>
      </View>
      <Text
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodySm,
          lineHeight: 21,
          marginBottom: spacing.s3,
        }}
      >
        {CRISIS_LEAD_COPY}
      </Text>
      {resources.map((r) => (
        <Pressable
          key={r.name}
          accessibilityRole="button"
          accessibilityLabel={`${r.name} — ${r.action}`}
          onPress={() => Linking.openURL(r.url).catch(() => undefined)}
          style={({ pressed }) => ({
            minHeight: HIT_TARGET,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: spacing.s2,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ flexShrink: 1, paddingRight: spacing.s2 }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodyMd }}>
              {r.name}
            </Text>
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>
              {r.action}
            </Text>
          </View>
          <Ionicons name="call-outline" size={20} color={c.accentDefault} />
        </Pressable>
      ))}
    </View>
  );
}
