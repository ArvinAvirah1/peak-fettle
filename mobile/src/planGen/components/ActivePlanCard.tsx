/**
 * ActivePlanCard.tsx — Plans-tab surface for the active engine-v2 plan (Stage 2).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 section 2. Renders the persisted active plan
 * or trial sequence and drives its lifecycle:
 *   - single plan          → summary + "Adopt to calendar" / "Request changes".
 *   - trial mid-block       → active block + progress line.
 *   - trial block complete  → "Make this your main split?" prompt with
 *                             adopt / continue-to-next options.
 *   - trial all done        → comparison summary → pick a split to adopt.
 *
 * This component OWNS its own rendering; the Plans tab mounts it with a small
 * mount point (hazard pattern — keep insertions into the large screen minimal).
 * It is presentational + callback-driven: the parent screen supplies the action
 * handlers (adopt / request-changes / continue) so persistence + navigation live
 * in one place. Today's day-key is injected (clock at the call site, never here).
 * =============================================================================
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../theme/tokens';
import type { StoredGeneratedPlan } from '../planStore';
import {
  trialProgress,
  trialProgressLabel,
  TRIAL_SPLIT_LABEL,
  TRIAL_ORDER,
  type TrialProgress,
} from '../trialLifecycle';
import type { SplitPreference } from '../../lib/trainingEngine/v2/types';

const SPLIT_LABEL: Record<SplitPreference, string> = {
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  body_part: 'Body-part split',
  unsure: 'Trial three splits',
};

// TICKET-146: SPLIT_LABEL / TRIAL_SPLIT_LABEL stay pure English data (module
// scope) so this file never bakes a frozen-at-import t() call into a
// constant. Render sites resolve the translated label via t() with the
// English string as defaultValue, per the documented misc:surveyConfig
// pattern used across this batch.
const SPLIT_LABEL_KEY: Record<SplitPreference, string> = {
  ppl: 'misc:activePlanCard.splitPpl',
  upper_lower: 'misc:activePlanCard.splitUpperLower',
  body_part: 'misc:activePlanCard.splitBodyPart',
  unsure: 'misc:activePlanCard.splitTrialAll',
};
const TRIAL_SPLIT_LABEL_KEY: Record<Exclude<SplitPreference, 'unsure'>, string> = {
  ppl: 'misc:activePlanCard.splitPpl',
  upper_lower: 'misc:activePlanCard.splitUpperLower',
  body_part: 'misc:activePlanCard.splitBodyPart',
};
function splitLabel(t: TFunction, split: SplitPreference): string {
  return t(SPLIT_LABEL_KEY[split], { defaultValue: SPLIT_LABEL[split] });
}
function trialSplitLabel(t: TFunction, split: Exclude<SplitPreference, 'unsure'>): string {
  return t(TRIAL_SPLIT_LABEL_KEY[split], { defaultValue: TRIAL_SPLIT_LABEL[split] });
}

export interface ActivePlanCardProps {
  stored: StoredGeneratedPlan;
  /** Today's day-key ("YYYY-MM-DD"), injected from a real clock at the call site. */
  todayKey: string;
  /** Adopt a single saved plan to the calendar. */
  onAdoptPlan: () => void;
  /** Open the meta-change sheet for the saved plan. */
  onRequestChanges: () => void;
  /** Adopt the given trial split as the main plan (regenerate + calendar). */
  onAdoptSplit: (split: Exclude<SplitPreference, 'unsure'>) => void;
  /** Advance a completed trial block to the next block (no adoption). */
  onContinueToNextBlock: () => void;
  /** Discard the active plan/trial entirely. */
  onDiscard: () => void;
}

export function ActivePlanCard(props: ActivePlanCardProps): React.ReactElement {
  const { stored } = props;
  if (stored.kind === 'trial') {
    return <TrialCard {...props} />;
  }
  return <SinglePlanCard {...props} />;
}

// ---------------------------------------------------------------------------
// Single-plan card
// ---------------------------------------------------------------------------

function SinglePlanCard({
  stored,
  onAdoptPlan,
  onRequestChanges,
  onDiscard,
}: ActivePlanCardProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const plan = stored.plan;
  const split = plan?.splitPreference ?? stored.split ?? 'unsure';
  const weeks = plan?.weeks.length ?? 0;
  const adopted = stored.status === 'plan_adopted' || stored.status === 'trial_adopted';

  return (
    <View style={[styles.card, { backgroundColor: c.bgSecondary, borderColor: c.accentDefault }]}>
      <Text style={[styles.kicker, { color: c.accentHover }]}>{t('misc:activePlanCard.yourPlanKicker')}</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>{splitLabel(t, split)}</Text>
      <Text style={[styles.meta, { color: c.textSecondary }]}>
        {t(adopted ? 'misc:activePlanCard.weeksScheduled' : 'misc:activePlanCard.weeksUnscheduled', { count: weeks })}
      </Text>

      <View style={styles.actionRow}>
        {!adopted ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: c.accentDefault }]}
            onPress={onAdoptPlan}
            accessibilityRole="button"
            accessibilityLabel={t('misc:activePlanCard.adoptThisPlanA11y')}
          >
            <Text style={[styles.primaryBtnText, { color: theme.components.buttonPrimaryText }]}>
              {t('misc:activePlanCard.addToCalendar')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.ghostBtn, { borderColor: c.accentDefault }]}
          onPress={onRequestChanges}
          accessibilityRole="button"
          accessibilityLabel={t('misc:activePlanCard.requestChangesA11y')}
        >
          <Text style={[styles.ghostBtnText, { color: c.accentDefault }]}>{t('misc:activePlanCard.requestChanges')}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={onDiscard}
        accessibilityRole="button"
        accessibilityLabel={t('misc:activePlanCard.discardPlanA11y')}
        style={styles.discardRow}
      >
        <Text style={[styles.discardText, { color: c.textTertiary }]}>{t('misc:activePlanCard.discardPlan')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Trial-sequence card
// ---------------------------------------------------------------------------

function TrialCard(props: ActivePlanCardProps): React.ReactElement {
  const { stored, todayKey } = props;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;

  const startKey = stored.blockStartDayKey;
  const progress: TrialProgress | null =
    startKey ? trialProgress(startKey, todayKey) : null;

  // Sequence complete → comparison summary + pick.
  if (stored.status === 'trial_complete' || (progress && progress.allBlocksComplete)) {
    return <TrialComparison {...props} />;
  }

  if (!progress) {
    // No start key (shouldn't happen) — degrade to a simple pick.
    return <TrialComparison {...props} />;
  }

  return (
    <View style={[styles.card, { backgroundColor: c.bgSecondary, borderColor: c.accentDefault }]}>
      <Text style={[styles.kicker, { color: c.accentHover }]}>{t('misc:activePlanCard.trialSplitsKicker')}</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>
        {trialSplitLabel(t, progress.currentSplit)}
      </Text>
      <Text style={[styles.meta, { color: c.textSecondary }]}>{trialProgressLabel(progress, t, trialSplitLabel(t, progress.currentSplit))}</Text>

      {/* Progress bar for the current block */}
      <View style={[styles.progressTrack, { backgroundColor: c.bgTertiary }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: c.accentDefault,
              width: `${Math.round((progress.dayInBlock / (progress.dayInBlock + progress.daysRemainingInBlock)) * 100)}%`,
            },
          ]}
        />
      </View>

      {progress.blockJustCompleted ? (
        <BlockCompletePrompt {...props} split={progress.currentSplit} isLastBlock={progress.currentBlockIndex >= TRIAL_ORDER.length - 1} />
      ) : (
        <Text style={[styles.hint, { color: c.textTertiary }]}>
          {t('misc:activePlanCard.daysLeftInBlockHint', { count: progress.daysRemainingInBlock })}
        </Text>
      )}
      <TouchableOpacity
        onPress={props.onDiscard}
        accessibilityRole="button"
        accessibilityLabel={t('misc:activePlanCard.discardTrialsA11y')}
        style={styles.discardRow}
      >
        <Text style={[styles.discardText, { color: c.textTertiary }]}>{t('misc:activePlanCard.discardTrials')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// The "Make this your main split?" prompt at the end of a block.
function BlockCompletePrompt({
  onAdoptSplit,
  onContinueToNextBlock,
  split,
  isLastBlock,
}: ActivePlanCardProps & {
  split: Exclude<SplitPreference, 'unsure'>;
  isLastBlock: boolean;
}): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const resolvedSplit = trialSplitLabel(t, split);
  return (
    <View style={[styles.promptBox, { backgroundColor: c.bgElevated, borderColor: c.borderDefault }]}>
      <Text style={[styles.promptTitle, { color: c.textPrimary }]}>{t('misc:activePlanCard.makeMainSplitTitle')}</Text>
      <Text style={[styles.promptBody, { color: c.textSecondary }]}>
        {t(isLastBlock ? 'misc:activePlanCard.makeMainSplitBodyLastBlock' : 'misc:activePlanCard.makeMainSplitBodyNextBlock', { split: resolvedSplit })}
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: c.accentDefault, alignSelf: 'stretch' }]}
        onPress={() => onAdoptSplit(split)}
        accessibilityRole="button"
        accessibilityLabel={t('misc:activePlanCard.adoptSplitA11y', { split: resolvedSplit })}
      >
        <Text style={[styles.primaryBtnText, { color: theme.components.buttonPrimaryText }]}>
          {t('misc:activePlanCard.adoptSplit', { split: resolvedSplit })}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.ghostBtn, { borderColor: c.accentDefault, alignSelf: 'stretch' }]}
        onPress={onContinueToNextBlock}
        accessibilityRole="button"
        accessibilityLabel={t(isLastBlock ? 'misc:activePlanCard.compareAllThreeA11y' : 'misc:activePlanCard.continueToNextSplitA11y')}
      >
        <Text style={[styles.ghostBtnText, { color: c.accentDefault }]}>
          {t(isLastBlock ? 'misc:activePlanCard.compareAllThree' : 'misc:activePlanCard.continueToNextSplit')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// After all three blocks: pick from a comparison summary.
function TrialComparison({ stored, onAdoptSplit, onDiscard }: ActivePlanCardProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const c = theme.colors;
  const blocks = stored.sequence?.blocks ?? [];

  return (
    <View style={[styles.card, { backgroundColor: c.bgSecondary, borderColor: c.accentDefault }]}>
      <Text style={[styles.kicker, { color: c.accentHover }]}>{t('misc:activePlanCard.trialsCompleteKicker')}</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('misc:activePlanCard.pickYourSplit')}</Text>
      <Text style={[styles.meta, { color: c.textSecondary }]}>
        {t('misc:activePlanCard.pickComparisonBody')}
      </Text>

      {blocks.map((block) => {
        const days = (block.weeks[0]?.sessions ?? []).map((s) => s.day_label).join(' · ');
        return (
          <View
            key={block.blockIndex}
            style={[styles.compareRow, { backgroundColor: c.bgElevated, borderColor: c.borderDefault }]}
          >
            <View style={styles.compareInfo}>
              <Text style={[styles.compareName, { color: c.textPrimary }]}>{block.splitLabel}</Text>
              {days ? (
                <Text style={[styles.compareDays, { color: c.textTertiary }]} numberOfLines={1}>
                  {days}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.pickBtn, { backgroundColor: c.accentDefault }]}
              onPress={() => onAdoptSplit(block.splitPreference)}
              accessibilityRole="button"
              accessibilityLabel={t('misc:activePlanCard.pickA11y', { splitLabel: block.splitLabel })}
            >
              <Text style={[styles.pickBtnText, { color: theme.components.buttonPrimaryText }]}>{t('misc:activePlanCard.pick')}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <TouchableOpacity
        onPress={onDiscard}
        accessibilityRole="button"
        accessibilityLabel={t('misc:activePlanCard.discardTrialsA11y')}
        style={styles.discardRow}
      >
        <Text style={[styles.discardText, { color: c.textTertiary }]}>{t('misc:activePlanCard.discardTrials')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s2,
  },
  kicker: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
  },
  title: { fontSize: fontSize.heading3, fontWeight: fontWeight.bold },
  meta: { fontSize: fontSize.bodySm, lineHeight: 20 },
  hint: { fontSize: fontSize.caption, lineHeight: 18, marginTop: spacing.s1 },

  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: spacing.s1,
  },
  progressFill: { height: 8, borderRadius: radius.full },

  actionRow: { flexDirection: 'row', gap: spacing.s2, marginTop: spacing.s2, flexWrap: 'wrap' },
  primaryBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    flexGrow: 1,
  },
  primaryBtnText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold },
  ghostBtn: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    flexGrow: 1,
  },
  ghostBtnText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },

  discardRow: { alignItems: 'center', paddingTop: spacing.s2, minHeight: 36, justifyContent: 'center' },
  discardText: { fontSize: fontSize.caption },

  promptBox: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s2,
    marginTop: spacing.s2,
  },
  promptTitle: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.bold },
  promptBody: { fontSize: fontSize.bodySm, lineHeight: 20, marginBottom: spacing.s1 },

  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.s3,
    marginTop: spacing.s1,
    minHeight: 56,
  },
  compareInfo: { flex: 1, gap: 2 },
  compareName: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold },
  compareDays: { fontSize: fontSize.caption },
  pickBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 64,
  },
  pickBtnText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold },
});
