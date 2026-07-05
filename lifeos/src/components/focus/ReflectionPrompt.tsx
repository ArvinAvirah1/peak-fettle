/**
 * ReflectionPrompt (TICKET-162) — one intervention option for the unlock
 * gate phase. Shows a single reflective question, deterministically picked
 * by day-of-month (no randomness), plus a 10-second minimum-read countdown
 * before Continue enables. Mirrors BreathingGate's prop shape: { onComplete }.
 *
 * Copy stays kind, never shaming (CONTENT_SAFETY.md).
 */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import { PFButton } from '../ui';

const QUESTIONS = [
  'What were you about to open it for?',
  'Will this matter to you tonight?',
  "What's the thing you're avoiding right now?",
  'If it can wait an hour, what would you rather do with these minutes?',
] as const;

const MIN_READ_SECONDS = 10;

function pickQuestion(now: Date): string {
  const dayOfMonth = now.getDate(); // 1-31, deterministic — no randomness
  return QUESTIONS[dayOfMonth % QUESTIONS.length];
}

export function ReflectionPrompt({ onComplete }: { onComplete: () => void }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const [question] = useState(() => pickQuestion(new Date()));
  const [secondsLeft, setSecondsLeft] = useState(MIN_READ_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const canContinue = secondsLeft === 0;

  return (
    <View style={{ alignItems: 'stretch', paddingVertical: spacing.s6 }}>
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={{
          color: c.textPrimary,
          fontFamily: fontFamily.semibold,
          fontSize: fontSize.heading3,
          textAlign: 'center',
          marginBottom: spacing.s5,
        }}
      >
        {question}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: c.textSecondary,
          fontFamily: fontFamily.regular,
          fontSize: fontSize.bodySm,
          fontVariant: ['tabular-nums'],
          textAlign: 'center',
          marginBottom: spacing.s5,
        }}
      >
        {canContinue ? 'Take your time.' : `A moment to sit with it… ${secondsLeft}s`}
      </Text>
      <PFButton label="Continue" onPress={onComplete} disabled={!canContinue} />
    </View>
  );
}
