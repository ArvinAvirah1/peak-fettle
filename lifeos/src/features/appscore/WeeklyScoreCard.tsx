/**
 * WeeklyScoreCard — TICKET-122.
 *
 * Insight card for the Insights/You surface. Shows the weekly WEQI index
 * with a numeral + text label + correlation-not-causation framing.
 *
 * Design rules (LIFEOS_DESIGN_CONTRACT_V3 §4):
 *  - Color is never the only signal: numeral + label always shown.
 *  - tabular-nums for the index number.
 *  - No clinical/therapeutic claims, no money stakes (CONTENT_SAFETY).
 *  - Copy is informational only — "you had more energizing apps this week"
 *    not "your mental health improved".
 *  - Guard: returns null when flag is off.
 */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { useTheme } from '../../theme/ThemeContext';
import { Card, SectionTitle } from '../../components/ui';
import { Ionicons } from '../../components/Icon';
import { fontFamily, fontSize, spacing } from '../../theme/tokens';
import { getAllRatings } from './appRatingsDb';
import { computeRatingOnlyScore, WeeklyScore } from './scoringEngine';

export function WeeklyScoreCard(): React.ReactElement | null {
  const { isEnabled } = useFeatureFlags();
  const { theme } = useTheme();
  const c = theme.colors;

  const [score, setScore] = useState<WeeklyScore | null>(null);

  useEffect(() => {
    if (!isEnabled('appWellbeingScoring')) return;
    let cancelled = false;
    getAllRatings()
      .then((rows) => {
        if (!cancelled) {
          setScore(computeRatingOnlyScore(rows));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isEnabled]);

  if (!isEnabled('appWellbeingScoring')) return null;
  if (!score || score.totalRated === 0) return null;

  const indexStr = score.index > 0
    ? `+${score.index.toFixed(1)}`
    : score.index.toFixed(1);

  const iconName =
    score.index > 0.5
      ? 'trending-up-outline'
      : score.index < -0.5
        ? 'trending-down-outline'
        : 'remove-outline';

  return (
    <>
      <SectionTitle>App wellbeing</SectionTitle>
      <Card accessibilityLabel={`App wellbeing score: ${score.label}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name={iconName} size={28} color={c.accentDefault} />
          <View style={{ marginLeft: spacing.s3, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text
                style={{
                  color: c.textPrimary,
                  fontFamily: fontFamily.bold,
                  fontSize: fontSize.heading2,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {indexStr}
              </Text>
              <Text
                style={{
                  color: c.textSecondary,
                  fontFamily: fontFamily.medium,
                  fontSize: fontSize.bodySm,
                  marginLeft: spacing.s2,
                }}
              >
                {score.label}
              </Text>
            </View>
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.caption,
                marginTop: 2,
              }}
            >
              {score.energizingCount} energizing · {score.drainingCount} draining · {score.totalRated} rated
            </Text>
          </View>
        </View>

        <View
          style={{
            marginTop: spacing.s3,
            paddingTop: spacing.s3,
            borderTopWidth: 1,
            borderTopColor: c.borderDefault,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={c.textTertiary}
              style={{ marginTop: 1 }}
              accessibilityLabel="Information"
            />
            <Text
              style={{
                flex: 1,
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.caption,
                lineHeight: 17,
                marginLeft: spacing.s1,
              }}
            >
              This score reflects your own tagging of apps as Energizing, Neutral, or Draining.
              It is observational — not a measurement of wellbeing or a clinical finding.
            </Text>
          </View>
        </View>
      </Card>
    </>
  );
}
