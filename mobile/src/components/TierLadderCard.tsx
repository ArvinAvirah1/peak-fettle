/**
 * TierLadderCard — the headline strength tier (Q2 decision: tier ladder is
 * the headline; the per-lift experience-adjusted percentiles remain below).
 *
 * Computed ON-DEVICE with the v3 model (TICKET-093, strengthModelV3.ts):
 * DOTS-composite calibrated percentile over the user's best squat / bench /
 * deadlift e1RMs, mapped to the §9 tier ladder. Partial totals (D4) are
 * supported and flagged "provisional"; undisclosed sex uses the 50/50
 * mixture convention (D5).
 *
 * Inputs come from data the screen already has: the server rankings list
 * (confirmed_1rm_kg ?? epley_estimate_kg per lift) + the profile's
 * weight_class_kg and sex. Degrades to a hint card when bodyweight or all
 * three competition lifts are missing — never throws (TICKET-051 AC#3).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { PercentileRanking } from '../types/api';
import {
  overallStrengthPercentilePartial,
  tierForOverall,
  TIER_LADDER,
  OverallResult,
  Sex,
} from '../lib/strengthModelV3';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// Server lift_id → v3 model lift. Strict mapping: variants (front squat,
// sumo) deliberately do NOT feed the competition-lift composite.
const LIFT_ID_TO_MODEL: Record<string, 'squat' | 'bench' | 'deadlift'> = {
  back_squat: 'squat',
  squat: 'squat',
  bench_press: 'bench',
  bench: 'bench',
  deadlift: 'deadlift',
};

// Tier accent colors are brand data (metallics), not theme tokens.
const TIER_COLORS: Record<string, string> = {
  'Iron': '#8a8d93',
  // D9: Stone sits between Iron and Bronze — tone interpolated from the two metal hues.
  'Stone': '#a87550',
  'Bronze': '#cd7f32',
  'Silver': '#c0c4cc',
  'Gold': '#e6b84c',
  'Platinum': '#7fd4d4',
  'Diamond': '#7fb3ff',
  'Elite': '#c084fc',
  'World Class': '#ff6b6b',
};

// D8-UI copy bank -- warm, never condescending. Rotated by pct bucket for context.
// Pure helper called only from this file's own render — takes `t` per the
// render-site translation rule.
function tierCopyForPct(pct: number, t: TFunction): string {
  if (pct < 8) return t('components:tierLadderCard.trajectory.early');
  if (pct < 16) return t('components:tierLadderCard.trajectory.mid');
  return t('components:tierLadderCard.trajectory.climbing');
}

function normalizeSex(raw: string | null | undefined): Sex | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'm' || s === 'male') return 'M';
  if (s === 'f' || s === 'female') return 'F';
  return null;
}

export interface TierLadderCardProps {
  rankings: PercentileRanking[];
  sex: string | null;
  bodyweightKg: number | null;
  /**
   * Founder rule (2026-06-10): the tier is HIDDEN unless the user has a fresh
   * weekly-median bodyweight (a big bulk/cut between weigh-ins would make the
   * tier wrong). When false, a locked card prompts the weekly check-in.
   */
  bodyweightFresh?: boolean;
}

export function TierLadderCard({
  rankings,
  sex,
  bodyweightKg,
  bodyweightFresh = true,
}: TierLadderCardProps): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();

  // Tier gate: stale/missing weekly median → locked card, never a tier.
  if (!bodyweightFresh) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.bgSecondary,
            borderColor: theme.colors.borderDefault,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>
          {t('components:tierLadderCard.kicker')}
        </Text>
        <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
          {t('components:tierLadderCard.freshnessHint')}
        </Text>
      </View>
    );
  }

  // Best e1RM per competition lift from data already on the screen.
  const lifts: Partial<Record<'squat' | 'bench' | 'deadlift', number>> = {};
  for (const r of rankings) {
    const model = LIFT_ID_TO_MODEL[r.lift_id];
    if (!model) continue;
    const e1rm = r.confirmed_1rm_kg ?? r.epley_estimate_kg ?? null;
    if (e1rm == null || !(e1rm > 0)) continue;
    if ((lifts[model] ?? 0) < e1rm) lifts[model] = e1rm;
  }
  const liftCount = Object.keys(lifts).length;

  const bw = bodyweightKg != null && bodyweightKg > 0 ? bodyweightKg : null;

  // Hint card when we can't compute yet — never an error, never null layout.
  if (liftCount === 0 || bw == null) {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.bgSecondary,
            borderColor: theme.colors.borderDefault,
          },
        ]}
      >
        <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>
          {t('components:tierLadderCard.kicker')}
        </Text>
        <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
          {bw == null
            ? t('components:tierLadderCard.setBodyweightHint')
            : t('components:tierLadderCard.logLiftsHint')}
        </Text>
      </View>
    );
  }

  // D5: undisclosed sex → 50/50 mixture of the two calibrated results.
  const normSex = normalizeSex(sex);
  let result: OverallResult | null;
  if (normSex) {
    result = overallStrengthPercentilePartial(lifts, bw, normSex);
  } else {
    const m = overallStrengthPercentilePartial(lifts, bw, 'M');
    const f = overallStrengthPercentilePartial(lifts, bw, 'F');
    result =
      m && f
        ? {
            pct: 0.5 * m.pct + 0.5 * f.pct,
            provisional: m.provisional || f.provisional,
            dots: 0.5 * m.dots + 0.5 * f.dots,
          }
        : null;
  }
  if (!result) return null;

  const tier = tierForOverall(result.pct);
  const tierColor = TIER_COLORS[tier.name] ?? theme.colors.textPrimary;
  const tierIndex = TIER_LADDER.findIndex((t) => t.name === tier.name);
  const nextTier = tierIndex >= 0 ? TIER_LADDER[tierIndex + 1] : undefined;
  const provisional = result.provisional || liftCount < 3;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: tierColor,
        },
      ]}
    >
      <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>
        {t('components:tierLadderCard.kicker')}
      </Text>

      <View style={styles.tierRow}>
        <Text style={[styles.tierName, { color: tierColor }]}>{tier.name}</Text>
        {provisional ? (
          <View
            style={[
              styles.badge,
              { borderColor: theme.colors.borderDefault },
            ]}
          >
            <Text style={[styles.badgeText, { color: theme.colors.textTertiary }]}>
              {t('components:tierLadderCard.provisional')}
            </Text>
          </View>
        ) : null}
      </View>

      {/* D8-UI: suppress raw percentile in Iron band (overall_pct < 25).
           Show tier + warm trajectory copy + upward-trend icon instead.
           The tier name, ladder, and drill-in detail are never suppressed. */}
      {result.pct < 25 ? (
        <View style={styles.trajectoryRow}>
          <Text style={[styles.trajectoryIcon, { color: theme.colors.statusSuccess }]}>↑</Text>
          <Text style={[styles.trajectoryText, { color: theme.colors.textSecondary }]}>
            {tierCopyForPct(result.pct, t)}
          </Text>
        </View>
      ) : (
        <Text style={[styles.pct, { color: theme.colors.textSecondary }]}>
          {t('components:tierLadderCard.strongerThan', { pct: result.pct.toFixed(result.pct >= 99 ? 1 : 0) })}
        </Text>
      )}

      {nextTier ? (
        <Text style={[styles.next, { color: theme.colors.textTertiary }]}>
          {t('components:tierLadderCard.nextTierAt', { name: nextTier.name, min: nextTier.min })}
        </Text>
      ) : null}

      {provisional ? (
        <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
          {t('components:tierLadderCard.basedOnLifts', {
            liftCount,
            remaining: 3 - liftCount === 1
              ? t('components:tierLadderCard.theLastOne')
              : t('components:tierLadderCard.theOthers'),
          })}
        </Text>
      ) : null}
    </View>
  );
}

// Layout only — no color values (theme provides all colors above).
const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.s5,
    marginBottom: spacing.s4,
  },
  kicker: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
    marginBottom: spacing.s2,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  tierName: {
    fontSize: fontSize.heading2,
    fontWeight: fontWeight.bold,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.8,
  },
  pct: {
    fontSize: fontSize.bodySm,
    marginTop: spacing.s1,
  },
  next: {
    fontSize: fontSize.caption,
    marginTop: 2,
  },
  hint: {
    fontSize: fontSize.bodySm,
    marginTop: spacing.s1,
  },
  note: {
    fontSize: fontSize.caption,
    marginTop: spacing.s3,
  },
  // D8-UI: Iron-band trajectory affordance
  trajectoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s2,
    marginTop: spacing.s1,
  },
  trajectoryIcon: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    lineHeight: 22,
  },
  trajectoryText: {
    flex: 1,
    fontSize: fontSize.bodySm,
    lineHeight: 20,
  },
});
