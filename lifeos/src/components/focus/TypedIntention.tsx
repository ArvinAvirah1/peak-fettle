/**
 * TypedIntention (TICKET-162) — one intervention option for the unlock gate
 * phase. Asks the user to articulate why they want back in before granting
 * the wait ladder. Mirrors BreathingGate's prop shape: { onComplete }.
 *
 * Privacy: the typed text is NEVER persisted or logged anywhere (not to
 * lo_focus_events, not to any local table). It exists purely as a moment of
 * friction/reflection — only whether the user typed enough to continue
 * matters, never what they wrote. The text lives in component state only
 * and is discarded on unmount.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import { PFButton, PFInput } from '../ui';

const MIN_CHARS = 3;

export function TypedIntention({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const [text, setText] = useState('');

  const trimmedLen = text.trim().length;
  const canContinue = trimmedLen >= MIN_CHARS;

  return (
    <View style={{ alignItems: 'stretch', paddingVertical: spacing.s6 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: c.textPrimary,
          fontFamily: fontFamily.semibold,
          fontSize: fontSize.bodyLg,
          textAlign: 'center',
          marginBottom: spacing.s4,
        }}
      >
        What do you need it for, specifically?
      </Text>
      <PFInput
        label="Your intention"
        placeholder="Type a specific reason…"
        value={text}
        onChangeText={setText}
        autoCorrect
        autoCapitalize="sentences"
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: spacing.s3 }}
        helper="Not saved or logged anywhere — this is just for you, to make the reason concrete."
      />
      <PFButton label="Continue" onPress={onComplete} disabled={!canContinue} style={{ marginTop: spacing.s2 }} />
    </View>
  );
}
