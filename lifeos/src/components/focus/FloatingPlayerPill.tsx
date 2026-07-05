/**
 * FloatingPlayerPill (TICKET-164) — resumes a minimized stack-player session
 * from anywhere Today is visible. Reads the FROZEN src/lib/playerSession.ts
 * contract (owned by a sibling STACK agent) read-only: only usePlayerSession()
 * is called here, no mutator.
 *
 * Renders null unless a session exists AND it is minimized — otherwise the
 * full-screen player is presumably already on top, so no pill is needed (and
 * rendering null means it never intercepts touches when hidden).
 *
 * Progress shown is WHOLE-STACK (doneCount/totalSteps) per the playerSession
 * contract — stepIndex is run-local (remaining-steps list) and would misread
 * here when some steps were logged before the run started.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing, elevation, hairline } from '../../theme/tokens';
import { Ionicons } from '../Icon';
import { PressableScale } from '../motion';
import { haptic } from '../../lib/haptics';
import { usePlayerSession } from '../../lib/playerSession';

export function FloatingPlayerPill(): React.ReactElement | null {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const session = usePlayerSession();

  if (!session || !session.minimized) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: spacing.s4,
        alignItems: 'center',
        zIndex: 50,
      }}
    >
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Resume ${session.stackName}, ${session.doneCount} of ${session.totalSteps} steps done`}
        onPress={() => {
          haptic.impact('light');
          router.push({
            pathname: '/stack-player',
            params: { stackId: session.stackId, resume: '1' },
          });
        }}
        style={{
          minHeight: HIT_TARGET,
          maxWidth: '92%',
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: radius.full,
          borderWidth: hairline,
          borderColor: c.borderDefault,
          backgroundColor: c.bgElevated,
          paddingVertical: spacing.s2,
          paddingHorizontal: spacing.s4,
          ...elevation.mid,
        }}
      >
        <Ionicons name="play-circle-outline" size={24} color={c.accentDefault} />
        <Text
          numberOfLines={1}
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.bodyMd,
            marginLeft: spacing.s2,
            flexShrink: 1,
          }}
        >
          {session.stackName}
        </Text>
        <Text
          style={{
            color: c.textSecondary,
            fontFamily: fontFamily.medium,
            fontSize: fontSize.bodySm,
            fontVariant: ['tabular-nums'],
            marginLeft: spacing.s3,
          }}
        >
          {session.doneCount}/{session.totalSteps} done
        </Text>
      </PressableScale>
    </View>
  );
}
