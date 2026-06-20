/**
 * Rankings tab — percentile rankings across all tracked lifts.
 *
 * FREE TIER: this screen is available to all users. Do NOT add an is_paid
 * gate or upsell prompt here. (CTO decision: percentile is a growth/retention
 * driver, not a paid hook.)
 *
 * Rankings are batch-computed weekly by a cron job. An empty rankings array
 * is an expected, non-error state for new users.
 *
 * V2 (TICKET-033): each card now shows two percentile scores side-by-side:
 *   • percentile        — "vs. lifters at your level" (experience-adjusted)
 *   • percentile_simple — "vs. all strength trainees" (gender + BW only)
 * Either value may be null if the batch job hasn't run yet or the user's
 * profile is incomplete. Both degrade gracefully to a "pending" label.
 *
 * V3 (TICKET-039 / ROADMAP 1.6): each card now shows a ConfidenceRing in the
 * footer to indicate internal cohort fullness. The ring is accompanied by the
 * exec-spec tooltip text per exec-percentile-decisions.md §4.
 *
 * V4 (TICKET-041): Option B banner (estimated max disclosure) and Option C
 * inline confirm flow (user confirms/overrides Epley estimate per lift).
 * Toggle lives in Settings (use_1rm_confirmation). Default: Option B.
 *
 * Implemented in TICKET-019; updated in TICKET-033, TICKET-039, TICKET-041.
 *
 * P2-005: Root SafeAreaView replaced with ScreenLayout.
 * P2-006: TextInput in ConfirmSheet replaced with PFInput.
 * P2-007: Reanimated spring slide-up on ConfirmSheet open.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePercentile } from '../../src/hooks/usePercentile';
import { useAuth } from '../../src/hooks/useAuth';
import { PercentileBar } from '../../src/components/PercentileBar';
import { ConfidenceRing, confidenceRingTooltip } from '../../src/components/ConfidenceRing';
import { confirm1rm } from '../../src/api/percentile';
import { saveProfile } from '../../src/data/profile';
import { liftIdToName } from '../../src/utils/liftNames';
import { TierLadderCard } from '../../src/components/TierLadderCard'; // TICKET-093 v3 tier headline
import {
  computeRankedPercentile,
  computePercentile,
  LiftId,
  Sex as ModelSex,
} from '../../src/lib/strengthModelV3'; // Agent N: on-device Lens 1 + 2a
import { BodyweightPromptCard } from '../../src/components/BodyweightPromptCard';
import Reanimated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useBodyweight } from '../../src/hooks/useBodyweight';
import { PercentileRanking } from '../../src/types/api';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';
import { PFProgressRing } from '../../src/components/ui/PFProgress';
import { PressableCard, ScreenLayout, PFInput } from '../../src/components/ui';
import { GlossaryTerm } from '../../src/components/Tooltip';
import { useReduceMotion } from '../../src/hooks/useReduceMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "2026-05-02T14:30:00Z" → "2 May" */
function formatComputedAt(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/** percentile 82 → "Top 18%" */
function topPercentLabel(percentile: number): string {
  const top = Math.round(100 - percentile);
  if (top <= 0) return 'Top 1%';
  if (top >= 100) return 'Bottom 1%';
  return `Top ${top}%`;
}

function percentileColorToken(percentile: number, theme: any): string {
  if (percentile >= 75) return theme.colors.statusSuccess;
  if (percentile >= 50) return theme.colors.accentDefault;
  return theme.colors.textTertiary;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Formats a kg value for display: rounds to 1 decimal, removes trailing .0 */
function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

// ---------------------------------------------------------------------------
// ConfirmSheet — bottom sheet modal for confirming/overriding the Epley estimate
// (Option C flow — TICKET-041)
// P2-006: TextInput → PFInput
// P2-007: Reanimated spring slide-up on open
// ---------------------------------------------------------------------------

interface ConfirmSheetProps {
  visible: boolean;
  liftName: string;
  epleyEstimateKg: number | null | undefined;
  onConfirm: (confirmedKg: number) => Promise<void>;
  onClose: () => void;
}

function ConfirmSheet({
  visible,
  liftName,
  epleyEstimateKg,
  onConfirm,
  onClose,
}: ConfirmSheetProps): React.ReactElement {
  const { theme } = useTheme();
  const reduceMotion = useReduceMotion();
  const defaultValue =
    epleyEstimateKg != null ? formatKg(epleyEstimateKg) : '';
  const [inputValue, setInputValue] = useState(defaultValue);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  // Ref to track the auto-close timer so it can be cleared on unmount.
  const closeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // P2-007: spring slide-up animation shared value
  const translateY = useSharedValue(400);

  // Reset state + trigger spring animation when the sheet opens for a new lift
  useEffect(() => {
    if (visible) {
      setInputValue(epleyEstimateKg != null ? formatKg(epleyEstimateKg) : '');
      setIsSaving(false);
      setSavedOk(false);
      // Animate in: reset to bottom, then spring to 0
      translateY.value = 400;
      translateY.value = reduceMotion
        ? 0
        : withSpring(0, { damping: 22, stiffness: 220 });
    }
  }, [visible, epleyEstimateKg, reduceMotion]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleConfirm = useCallback(async () => {
    const kg = parseFloat(inputValue.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) return;
    setIsSaving(true);
    try {
      await onConfirm(kg);
      setSavedOk(true);
      haptics.success(); // E-006: confirmed 1RM is a high-signal user commitment
      // Auto-close after a short success flash; ref allows cleanup on unmount.
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        onClose();
      }, 2000);
    } catch {
      haptics.error(); // E-006: save failure
      setIsSaving(false);
    }
  }, [inputValue, onConfirm, onClose]);

  const isValid = (() => {
    const kg = parseFloat(inputValue.replace(',', '.'));
    return Number.isFinite(kg) && kg > 0 && kg <= 1000;
  })();

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* P2-007: Animated.View provides the spring slide-up entry */}
      <Animated.View style={[{ flex: 1 }, sheetAnimStyle]}>
       <SafeAreaView style={[confirmSheetStyles.safeArea, { backgroundColor: theme.colors.bgPrimary }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={confirmSheetStyles.root}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Drag handle */}
          <View style={[confirmSheetStyles.handle, { backgroundColor: theme.colors.borderDefault }]} />

          <Text style={[confirmSheetStyles.title, { color: theme.colors.textPrimary }]}>Confirm your max — {liftName}</Text>

          {savedOk ? (
            <View style={[
              confirmSheetStyles.savedRow,
              { backgroundColor: theme.colors.statusSuccess + '18', borderColor: theme.colors.statusSuccess + '60' },
            ]}>
              <Text style={[confirmSheetStyles.savedText, { color: theme.colors.statusSuccess }]}>
                ✓ Saved. Your ranking updates on the next weekly run.
              </Text>
              <TouchableOpacity
                style={[confirmSheetStyles.doneButton, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault }]}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={[confirmSheetStyles.doneButtonText, { color: theme.colors.textPrimary }]}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[confirmSheetStyles.body, { color: theme.colors.textTertiary }]}>
                We estimated your 1-rep max from your logged sets. Adjust if it
                doesn't match your actual max — your ranking will use this value
                from the next weekly update.
              </Text>

              {epleyEstimateKg != null && (
                <Text style={[confirmSheetStyles.estimate, { color: theme.colors.textSecondary }]}>
                  Our estimate: {formatKg(epleyEstimateKg)} kg
                </Text>
              )}

              {/* P2-006: PFInput replaces raw TextInput */}
              <View style={confirmSheetStyles.inputRow}>
                <View style={{ flex: 1 }}>
                  <PFInput
                    value={inputValue}
                    onChangeText={setInputValue}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 120"
                    returnKeyType="done"
                    onSubmitEditing={isValid ? handleConfirm : undefined}
                    accessibilityLabel="Confirmed 1-rep max in kg"
                  />
                </View>
                <Text style={[confirmSheetStyles.kgLabel, { color: theme.colors.textTertiary }]}>kg</Text>
              </View>

              <TouchableOpacity
                style={[
                  confirmSheetStyles.confirmButton,
                  { backgroundColor: theme.colors.accentDefault },
                  (!isValid || isSaving) && confirmSheetStyles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!isValid || isSaving}
                accessibilityRole="button"
                accessibilityLabel="Confirm this 1RM"
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.components.buttonPrimaryText} />
                ) : (
                  <Text style={[confirmSheetStyles.confirmButtonText, { color: theme.components.buttonPrimaryText }]}>Confirm</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={confirmSheetStyles.cancelButton}
                onPress={onClose}
                disabled={isSaving}
                accessibilityRole="button"
              >
                <Text style={[confirmSheetStyles.cancelText, { color: theme.colors.textTertiary }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </KeyboardAvoidingView>
       </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// On-device percentile computation (Agent N — SPEC-094A)
// ---------------------------------------------------------------------------

/** server lift_id → v3 model LiftId (same four competition lifts supported). */
const LIFT_ID_TO_MODEL_ID: Record<string, LiftId> = {
  squat: 'squat',
  back_squat: 'squat',
  bench: 'bench',
  bench_press: 'bench',
  deadlift: 'deadlift',
  ohp: 'ohp',
  overhead_press: 'ohp',
};

/**
 * Compute on-device Lens 1 + Lens 2a percentiles for a single ranking entry.
 * Returns { lens1, lens2a } where either may be null if inputs are unavailable.
 * Falls back to null (caller uses server values) when:
 *   - lift_id not in our competition-lift map
 *   - bodyweight or sex is missing
 *   - e1RM (confirmed or Epley) is null/zero
 */
function localPercentiles(
  ranking: { lift_id: string; confirmed_1rm_kg?: number | null; epley_estimate_kg?: number | null },
  bwKg: number | null | undefined,
  sex: string | null | undefined,
  experienceLevel: string | null | undefined,
  ageBand: string | null | undefined,
): { lens1: number | null; lens2a: number | null } {
  const modelLift = LIFT_ID_TO_MODEL_ID[ranking.lift_id];
  const e1rm = ranking.confirmed_1rm_kg ?? ranking.epley_estimate_kg ?? null;
  if (!modelLift || !bwKg || bwKg <= 0 || !e1rm || e1rm <= 0) {
    return { lens1: null, lens2a: null };
  }
  const modelSex = sex === 'M' || sex === 'F' ? (sex as ModelSex) : null;
  if (!modelSex) return { lens1: null, lens2a: null };

  const lens2a = computeRankedPercentile(modelLift, modelSex, e1rm, bwKg);
  const lens1 = computePercentile(modelLift, modelSex, e1rm, bwKg, experienceLevel, ageBand);
  return { lens1, lens2a };
}

/**
 * ScoreBlock — one percentile score with its label, bar, and "Top X%" badge.
 * Renders a "Pending" pill when the value is null (batch job hasn't run yet).
 * label accepts ReactNode so GlossaryTerm wrappers can be embedded inline.
 */
function ScoreBlock({
  value,
  label,
}: {
  value: number | null;
  label: React.ReactNode;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.scoreBlock}>
      <Text style={[styles.scoreLabel, { color: theme.colors.textTertiary }]}>{label}</Text>
      {value !== null ? (
        <>
          <View style={styles.scoreBadgeRow}>
            <Text style={[styles.scoreBadge, { color: percentileColorToken(value, theme), fontVariant: ['tabular-nums'] }]}>
              {topPercentLabel(value)}
            </Text>
          </View>
          <View style={styles.barContainer}>
            <PercentileBar percentile={value} height={6} />
          </View>
        </>
      ) : (
        <View style={[styles.pendingPill, { backgroundColor: theme.colors.bgPrimary }]}>
          <Text style={[styles.pendingText, { color: theme.colors.textTertiary }]}>Pending weekly update</Text>
        </View>
      )}
    </View>
  );
}

/**
 * RankingCard — v3: shows both percentile scores (or "Confirm your max" state
 * for Option C users with an unconfirmed estimated lift).
 *
 * Option B (default): shows the scores + "Based on estimated max" note when
 *   is_estimated is true. The banner at the screen level lists affected lifts.
 *
 * Option C (use1rmConfirmation=true): when is_estimated && !locallyConfirmed,
 *   renders a "Confirm your max" CTA instead of the scores. Tapping opens
 *   the ConfirmSheet bottom sheet (TICKET-041).
 */
function RankingCard({
  ranking,
  use1rmConfirmation,
  locallyConfirmed,
  primaryDiscipline,
  showWilks,
  onConfirmRequest,
  localLens1,
  localLens2a,
}: {
  ranking: PercentileRanking;
  use1rmConfirmation: boolean;
  locallyConfirmed: boolean;
  primaryDiscipline?: string | null;
  showWilks: boolean;
  onConfirmRequest: (ranking: PercentileRanking) => void;
  /** Agent N: on-device Lens 1 (experience-adjusted). Falls back to server value when null. */
  localLens1: number | null;
  /** Agent N: on-device Lens 2a (ranked, BW-normalised). Falls back to server value when null. */
  localLens2a: number | null;
}): React.ReactElement {
  const { theme } = useTheme();
  const liftName = liftIdToName(ranking.lift_id);
  const updatedText = ranking.computed_at
    ? `Last updated ${formatComputedAt(ranking.computed_at)}`
    : '';

  // Option C: unconfirmed estimated lift — show confirm CTA instead of scores
  const showConfirmState =
    use1rmConfirmation &&
    ranking.is_estimated === true &&
    ranking.confirmed_1rm_kg == null &&
    !locallyConfirmed;

  // Locally confirmed this session — show "pending next run" note
  const showPendingNote = use1rmConfirmation && locallyConfirmed;

  return (
    <PressableCard style={[
      styles.card,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      {/* Card header: lift name */}
      <Text style={[styles.liftName, { color: theme.colors.textPrimary }]}>{liftName}</Text>

      {showConfirmState ? (
        /* ── Option C: Confirm your max ───────────────────────────── */
        <TouchableOpacity
          style={[
            styles.confirmCta,
            { backgroundColor: theme.colors.accentSecondary, borderColor: theme.colors.accentDefault },
          ]}
          onPress={() => onConfirmRequest(ranking)}
          accessibilityRole="button"
          accessibilityLabel={`Confirm your estimated max for ${liftName}`}
        >
          <View style={styles.confirmCtaInner}>
            <Text style={[styles.confirmCtaTitle, { color: theme.colors.accentHover }]}>Confirm your max</Text>
            <Text style={[styles.confirmCtaBody, { color: theme.colors.textTertiary }]}>
              {ranking.epley_estimate_kg != null
                ? `We estimated ${formatKg(ranking.epley_estimate_kg)} kg from your sets. Tap to confirm or adjust.`
                : 'Tap to confirm your 1-rep max for this lift.'}
            </Text>
          </View>
          <Text style={[styles.confirmCtaChevron, { color: theme.colors.accentDefault }]}>›</Text>
        </TouchableOpacity>
      ) : showPendingNote ? (
        /* ── Option C: confirmed this session, awaiting next batch ── */
        <View style={[
          styles.pendingNextRunPill,
          { backgroundColor: theme.colors.statusSuccess + '18', borderColor: theme.colors.statusSuccess + '60' },
        ]}>
          <Text style={[styles.pendingNextRunText, { color: theme.colors.statusSuccess }]}>
            ✓ Confirmed — ranking updates on the next weekly run
          </Text>
        </View>
      ) : (
        /* ── Option B / confirmed ranking: show scores ─────────────── */
        /* Agent N: prefer on-device model values; fall back to server when unavailable */
        <View style={styles.scoresRow}>
          <ScoreBlock
            value={localLens1 ?? ranking.percentile}
            label={<GlossaryTerm slug="percentile">vs. your experience band</GlossaryTerm>}
          />
          <View style={[styles.scoresDivider, { backgroundColor: theme.colors.borderDefault }]} />
          <ScoreBlock
            value={localLens2a ?? ranking.percentile_simple}
            label="vs. all strength trainees"
          />
        </View>
      )}

      {/* OD-2: Wilks2 score — shown only when the user has enabled the Wilks preference (TICKET-066) */}
      {showWilks && ranking.wilks_score != null && (
        <Text
          style={{
            fontSize: fontSize.caption,
            color: theme.colors.textTertiary,
            fontVariant: ['tabular-nums'],
            marginTop: 2,
          }}
        >
          Wilks2 {ranking.wilks_score.toFixed(1)}
        </Text>
      )}

      {/* Footer: confidence ring + last updated */}
      {!showConfirmState && (
        <View style={styles.cardFooter}>
          <View style={styles.confidenceRow}>
            <ConfidenceRing
              cohortSize={ranking.cohort_size_internal}
              size={32}
              strokeWidth={3}
            />
            <Text style={[styles.confidenceText, { color: theme.colors.textTertiary, fontVariant: ['tabular-nums'] }]} numberOfLines={2}>
              {/* UX-003: casual tooltip for non-strength disciplines */}
              {/* primary_discipline is now typed on User (TICKET-067) */}
              {(() => {
                const NON_STRENGTH = ['Running', 'Cycling', 'Swimming', 'Other/Mixed'];
                const discipline = primaryDiscipline ?? null;
                if (discipline && NON_STRENGTH.includes(discipline)) {
                  return `Your score is based on ${ranking.cohort_size_internal} people like you.`;
                }
                return confidenceRingTooltip(ranking.cohort_size_internal);
              })()}
            </Text>
          </View>
          {updatedText ? (
            <Text style={[styles.updatedText, { color: theme.colors.textTertiary }]}>{updatedText}</Text>
          ) : null}
        </View>
      )}
    </PressableCard>
  );
}

// ---------------------------------------------------------------------------
// PercentileRankHeroCard — P0-006 / Spec §6.7
// Hero card showing the user's best-ranked lift with a large PFProgressRing.
// Rendered at the top of the rankings list, above the per-lift cards.
// ---------------------------------------------------------------------------

function PercentileRankHeroCard({ rankings }: { rankings: PercentileRanking[] }): React.ReactElement | null {
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  if (!rankings || rankings.length === 0) return null;

  // Pick the ranking with the highest percentile value
  const top = [...rankings].sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))[0];
  if (!top || top.percentile == null) return null;

  const pct = Math.round(top.percentile);
  const topPct = 100 - pct; // "Top X%"

  return (
    <View style={{ alignItems: 'center', marginBottom: sp.s4 }}>
      <View style={{
        width: '82%',
        backgroundColor: theme.colors.bgSecondary,
        borderRadius: r.lg,
        padding: sp.s5,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.borderDefault,
      }}>
        <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s3 }}>
          Top lift
        </Text>
        <PFProgressRing
          value={top.percentile / 100}
          size={140}
          strokeWidth={10}
          showGradient
        />
        <Text style={{
          position: 'absolute',
          fontSize: fs.metric,  // 40pt
          fontWeight: fw.bold,
          color: theme.colors.accentDefault,
          // centered over the ring — s5 padding + ~50pt for label above ring
          top: sp.s5 + 50,
          fontVariant: ['tabular-nums'],
        }}>
          {pct}
        </Text>
        <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.semibold, marginTop: sp.s3 }}>
          {liftIdToName(top.lift_id)}
        </Text>
        <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: sp.s1, fontVariant: ['tabular-nums'] }}>
          Top {topPct}% of lifters
        </Text>
      </View>
    </View>
  );
}

/**
 * OverallPercentileCard — shows the median of all exercise percentile values.
 * Only rendered when rankings.length >= 10 (TICKET-066 founder spec).
 * Uses `percentile` (experience-adjusted) values for the median computation.
 */
function OverallPercentileCard({ rankings }: { rankings: PercentileRanking[] }): React.ReactElement | null {
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();

  // Collect non-null experience-adjusted percentile values and compute median
  const values = rankings
    .map((rk) => rk.percentile)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;

  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 0
      ? ((values[mid - 1] ?? 0) + (values[mid] ?? 0)) / 2
      : (values[mid] ?? 0);

  const medianRounded = Math.round(median);
  const topPct = 100 - medianRounded;

  return (
    <View style={{ marginTop: sp.s4 }}>
      <View style={{
        backgroundColor: theme.colors.bgSecondary,
        borderRadius: r.lg,
        borderWidth: 1,
        borderColor: theme.colors.borderDefault,
        padding: sp.s5,
        alignItems: 'center',
        gap: sp.s2,
      }}>
        <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm }}>
          Your overall percentile
        </Text>
        <Text style={{
          fontSize: fs.metric,
          fontWeight: fw.bold,
          color: theme.colors.accentDefault,
          fontVariant: ['tabular-nums'],
        }}>
          {medianRounded}%
        </Text>
        <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodyMd, fontWeight: fw.semibold }}>
          Top {topPct}% of lifters
        </Text>
        <Text style={{ color: theme.colors.textTertiary, fontSize: fs.caption, textAlign: 'center' }}>
          Median across {values.length} exercises · experience-adjusted
        </Text>
      </View>
    </View>
  );
}

function SkeletonCard(): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, styles.skeletonCard, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault }]}>
      {/* Lift name placeholder */}
      <View style={[styles.skeletonLine, { width: '50%', height: 16, marginBottom: 16, backgroundColor: theme.colors.borderDefault }]} />
      {/* Two score columns */}
      <View style={styles.scoresRow}>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '80%', height: 11, backgroundColor: theme.colors.borderDefault }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 14, backgroundColor: theme.colors.borderDefault }]} />
          <View style={[styles.skeletonLine, { width: '100%', height: 6, borderRadius: radius.full, backgroundColor: theme.colors.borderDefault }]} />
        </View>
        <View style={[styles.scoresDivider, { backgroundColor: theme.colors.borderDefault }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '80%', height: 11, backgroundColor: theme.colors.borderDefault }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 14, backgroundColor: theme.colors.borderDefault }]} />
          <View style={[styles.skeletonLine, { width: '100%', height: 6, borderRadius: radius.full, backgroundColor: theme.colors.borderDefault }]} />
        </View>
      </View>
      {/* Footer */}
      <View style={[styles.skeletonLine, { width: '35%', height: 11, marginTop: 12, backgroundColor: theme.colors.borderDefault }]} />
    </View>
  );
}

function EmptyState(): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>No rankings yet</Text>
      <Text style={[styles.emptySubtext, { color: theme.colors.textTertiary }]}>
        Log at least one workout and check back after the weekly update (every Sunday night)
      </Text>
      <Text style={[styles.emptyAction, { color: theme.colors.textTertiary }]}>
        Log 3 workouts to unlock your first ranking.
      </Text>
    </View>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={[
      styles.errorBanner,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.statusError },
    ]}>
      <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{message}</Text>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: theme.colors.statusError }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={[styles.retryButtonText, { color: theme.colors.textPrimary }]}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// P2-005: Root View → ScreenLayout (horizontalPadding={false} so the
//          ScrollView's contentContainerStyle padding takes precedence)
// ---------------------------------------------------------------------------

export default function RankingsScreen(): React.ReactElement {
  const { response, isLoading, error, refetch } = usePercentile();
  const { user, updateUser } = useAuth();
  // Weekly-median bodyweight (founder 2026-06-10): prompts weekly; gates the tier.
  const { latest: latestBw, freshForTier } = useBodyweight();
  const reducedMotion = useReducedMotion(); // 2026-06-10 aesthetic pass
  const { theme } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTogglingWilks, setIsTogglingWilks] = useState(false);

  const use1rmConfirmation = user?.use_1rm_confirmation ?? false;
  const showWilks = user?.show_wilks ?? false;

  const handleToggleWilks = useCallback(async () => {
    const next = !showWilks;
    // Optimistic update
    updateUser({ show_wilks: next });
    setIsTogglingWilks(true);
    try {
      // saveProfile() routes free users to localDb and Pro users to PATCH /user/profile.
      // It also calls updateUser() internally on success, but the optimistic call
      // above already did that — saveProfile's updateUser call is idempotent.
      await saveProfile(user, { show_wilks: next });
    } catch {
      // Revert on failure
      updateUser({ show_wilks: !next });
    } finally {
      setIsTogglingWilks(false);
    }
  }, [showWilks, updateUser, user]);

  // BUG-008 (2026-05-23): persist confirmed lift IDs to AsyncStorage so the
  // "confirmed" state survives an app restart before the nightly batch flips
  // is_estimated=false. Key is per-user to avoid bleed between accounts.
  const CONFIRMED_KEY = `confirmed_1rm_${user?.id ?? 'anon'}`;

  const [confirmedThisSession, setConfirmedThisSession] = useState<Set<string>>(
    () => new Set()
  );

  // Load persisted confirmed IDs on mount
  useEffect(() => {
    AsyncStorage.getItem(CONFIRMED_KEY).then((raw) => {
      if (raw) {
        try {
          const ids: string[] = JSON.parse(raw);
          setConfirmedThisSession(new Set(ids));
        } catch {
          // corrupt entry — ignore and start fresh
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CONFIRMED_KEY]);

  // The ranking currently being confirmed (drives the ConfirmSheet modal)
  const [confirmingRanking, setConfirmingRanking] = useState<PercentileRanking | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleConfirmRequest = useCallback((ranking: PercentileRanking) => {
    setConfirmingRanking(ranking);
  }, []);

  const handleConfirm = useCallback(
    async (confirmedKg: number) => {
      if (!confirmingRanking) return;
      if (user?.is_paid) {
        // Only paid users have a server percentile row to update.
        await confirm1rm({ lift_id: confirmingRanking.lift_id, confirmed_kg: confirmedKg });
      }
      // For free users: store to AsyncStorage only (local confirmation persists
      // the preference UI; the server ranking update requires a paid account).
      setConfirmedThisSession((prev) => {
        const next = new Set([...prev, confirmingRanking.lift_id]);
        // BUG-008: persist so CTA doesn't reappear after restart
        AsyncStorage.setItem(CONFIRMED_KEY, JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    [confirmingRanking, CONFIRMED_KEY, user?.is_paid]
  );

  const rankings = response?.rankings ?? [];
  const cohortNote =
    response?.cohort_note ??
    'Two views: how you rank within your experience tier, and vs. the full training population.';

  // Option B: lifts whose ranking used an Epley estimate (for the banner)
  const estimatedLiftNames = !use1rmConfirmation
    ? rankings
        .filter((r) => r.is_estimated === true)
        .map((r) => liftIdToName(r.lift_id))
    : [];

  return (
    // P2-005: ScreenLayout replaces the raw View + SafeAreaView.
    // horizontalPadding={false} — scrollContent manages its own padding.
    <ScreenLayout horizontalPadding={false}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.textTertiary}
          />
        }
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Your Rankings</Text>
            <TouchableOpacity
              style={[
                styles.wilksToggle,
                {
                  backgroundColor: showWilks ? theme.colors.accentDefault + '22' : theme.colors.bgSecondary,
                  borderColor: showWilks ? theme.colors.accentDefault : theme.colors.borderDefault,
                },
              ]}
              onPress={handleToggleWilks}
              disabled={isTogglingWilks}
              accessibilityRole="button"
              accessibilityLabel={showWilks ? 'Hide Wilks score' : 'Show Wilks score'}
            >
              <Text style={[styles.wilksToggleText, { color: showWilks ? theme.colors.accentDefault : theme.colors.textTertiary }]}>
                Wilks
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: theme.colors.textTertiary }]}>{cohortNote}</Text>
          <View style={[styles.chip, { backgroundColor: theme.colors.bgSecondary }]}>
            <Text style={[styles.chipText, { color: theme.colors.textTertiary }]}>🕐 Updated weekly</Text>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Option B banner — shown when any rankings used Epley estimates   */}
        {/* ---------------------------------------------------------------- */}
        {estimatedLiftNames.length > 0 && !isLoading && (
          <View style={[
            styles.estimatedBanner,
            { backgroundColor: theme.colors.bgElevated, borderColor: theme.colors.statusWarning + '60' },
          ]}>
            {/* WCAG AA: use textPrimary/textSecondary, not accent, on bgElevated surfaces */}
            <Text style={[styles.estimatedBannerText, { color: theme.colors.textPrimary }]}>
              Rankings for{' '}
              <Text style={[styles.estimatedBannerLifts, { color: theme.colors.textPrimary }]}>
                {estimatedLiftNames.join(', ')}
              </Text>{' '}
              are based on an estimated max calculated from your logged sets.
              To use your actual max, turn on "Confirm estimated maxes" in Settings.
            </Text>
          </View>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Content                                                           */}
        {/* ---------------------------------------------------------------- */}

        {/* Error state */}
        {error && !isLoading ? (
          <ErrorBanner
            message={error}
            onRetry={refetch}
          />
        ) : null}

        {/* Loading state — show skeleton cards */}
        {isLoading && !error ? (
          <View style={styles.listContainer}>
            {[1, 2, 3].map((n) => (
              <SkeletonCard key={n} />
            ))}
          </View>
        ) : null}

        {/* Empty state */}
        {!isLoading && !error && rankings.length === 0 ? (
          <EmptyState />
        ) : null}

        {/* Rankings list */}
        {!isLoading && !error && rankings.length > 0 ? (
          <>
            {/* Weekly bodyweight check-in — feeds the tier gate (founder 2026-06-10) */}
            <BodyweightPromptCard unitPref={(user?.unit_pref ?? 'kg') as 'kg' | 'lbs'} />
            {/* Tier ladder headline — on-device v3 model (TICKET-093 / Q2).
                Uses the real weekly-median weight; locked when it's stale. */}
            <TierLadderCard
              rankings={rankings}
              sex={user?.sex ?? null}
              bodyweightKg={latestBw?.weight_kg ?? user?.weight_class_kg ?? null}
              bodyweightFresh={freshForTier}
            />
            {/* Hero card — highest-percentile lift (P0-006 / Spec §6.7) */}
            <PercentileRankHeroCard rankings={rankings} />
          <View style={styles.listContainer}>
            {rankings.map((ranking, i) => (
              <Reanimated.View
                key={ranking.lift_id}
                entering={
                  reducedMotion
                    ? undefined
                    : FadeInDown.delay(Math.min(i * 50, 300)).duration(280)
                }
              >
                <RankingCard
                  ranking={ranking}
                  use1rmConfirmation={use1rmConfirmation}
                  locallyConfirmed={confirmedThisSession.has(ranking.lift_id) || ranking.confirmed_1rm_kg != null}
                  primaryDiscipline={user?.primary_discipline ?? null}
                  showWilks={showWilks}
                  onConfirmRequest={handleConfirmRequest}
                  {...(() => {
                    const lp = localPercentiles(
                      ranking,
                      latestBw?.weight_kg ?? user?.weight_class_kg,
                      user?.sex,
                      user?.experience_level,
                      user?.age_band,
                    );
                    return { localLens1: lp.lens1, localLens2a: lp.lens2a };
                  })()}
                />
              </Reanimated.View>
            ))}
          </View>

          {/* Median overall percentile card — only shown once ≥10 different exercises are logged */}
          {rankings.length >= 10 ? (
            <OverallPercentileCard rankings={rankings} />
          ) : (
            <View style={[styles.medianHint, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault }]}>
              <Text style={[styles.medianHintText, { color: theme.colors.textTertiary }]}>
                Log 10+ different exercises to see your overall rank.
              </Text>
            </View>
          )}
          </>
        ) : null}
      </ScrollView>

      {/* ── Option C: Confirm sheet ── */}
      {confirmingRanking && (
        <ConfirmSheet
          visible={confirmingRanking !== null}
          liftName={liftIdToName(confirmingRanking.lift_id)}
          epleyEstimateKg={confirmingRanking.epley_estimate_kg}
          onConfirm={handleConfirm}
          onClose={() => setConfirmingRanking(null)}
        />
      )}
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
  },

  // Header
  header: {
    marginBottom: 24,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Wilks toggle button in header (TICKET-066)
  wilksToggle: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: 4,
  },
  wilksToggleText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
  },
  title: {
    fontSize: fontSize.heading1,  // E-003: was 28
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  subtitle: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    lineHeight: 20,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: 4,
    marginTop: 4,
  },
  chipText: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },

  // Card
  listContainer: {
    gap: 12,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },
  liftName: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
    marginBottom: 14,
  },

  // Two-column score layout (v2 / TICKET-033)
  scoresRow: {
    flexDirection: 'row',
    gap: 0,
  },
  scoresDivider: {
    width: 1,
    marginHorizontal: 14,
  },
  scoreBlock: {
    flex: 1,
    gap: 6,
  },
  scoreLabel: {
    fontSize: fontSize.caption,  // E-003: was 11
    fontWeight: fontWeight.medium,  // E-003: was '500'
    lineHeight: 15,
  },
  scoreBadgeRow: {
    flexDirection: 'row',
  },
  scoreBadge: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  barContainer: {
    // bar fills the scoreBlock column
  },

  // Pending state (null percentile)
  pendingPill: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 4,
    marginTop: 2,
  },
  pendingText: {
    fontSize: fontSize.caption,  // E-003: was 11
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },

  // Card footer — confidence ring + last updated (TICKET-039 / ROADMAP 1.6)
  cardFooter: {
    marginTop: 14,
    gap: 8,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confidenceText: {
    flex: 1,
    fontSize: fontSize.caption,  // E-003: was 11
    lineHeight: 16,
  },

  updatedText: {
    fontSize: fontSize.caption,  // E-003: was 12
  },

  // Skeleton
  skeletonCard: {
    opacity: 0.6,
  },
  skeletonLine: {
    borderRadius: radius.sm,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.s16,
    paddingHorizontal: spacing.s6,
    gap: 12,
  },
  emptyTitle: {
    fontSize: fontSize.bodyLg,  // E-003: was 18
    fontWeight: fontWeight.semibold,  // E-003: was '600'
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    textAlign: 'center',
    lineHeight: 22,
  },

  // Option B estimated banner (TICKET-041)
  estimatedBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  estimatedBannerText: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 20,
  },
  estimatedBannerLifts: {
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },

  // Option C confirm CTA (TICKET-041)
  confirmCta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  confirmCtaInner: {
    flex: 1,
    gap: 4,
  },
  confirmCtaTitle: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  confirmCtaBody: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 19,
  },
  confirmCtaChevron: {
    fontSize: fontSize.heading3,  // E-003: was 20
  },

  // Option C: confirmed this session
  pendingNextRunPill: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  pendingNextRunText: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 20,
  },

  // Empty action hint (UX-004)
  emptyAction: {
    fontSize: fontSize.bodySm,  // caption-level action prompt
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 4,
  },

  // Median hint (shown when < 10 exercises logged, TICKET-066)
  medianHint: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginTop: 12,
    alignItems: 'center',
  },
  medianHintText: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Error banner
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  errorText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: spacing.s3,
    paddingVertical: 6,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  retryButtonText: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
});

// ---------------------------------------------------------------------------
// ConfirmSheet styles — layout only, no color values
// ---------------------------------------------------------------------------

const confirmSheetStyles = StyleSheet.create({
  // SafeAreaView wrapper — clears status bar (top) + home indicator (bottom)
  safeArea: {
    flex: 1,
  },
  root: {
    flex: 1,
    paddingHorizontal: spacing.s5,
    paddingBottom: spacing.s8,
  },
  // P2-007: visual drag handle at top of the sheet
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: fontSize.heading3,  // E-003: was 20
    fontWeight: fontWeight.bold,  // E-003: was '700'
    marginBottom: spacing.s3,
  },
  body: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    lineHeight: 22,
    marginBottom: spacing.s3,
  },
  estimate: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.medium,
    marginBottom: spacing.s4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: spacing.s4,
  },
  kgLabel: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
    paddingBottom: 2,
  },
  confirmButton: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: spacing.s3,
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
  },
  // Success state
  savedRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
    gap: spacing.s3,
    marginTop: spacing.s4,
  },
  savedText: {
    fontSize: fontSize.bodyMd,
    lineHeight: 22,
  },
  doneButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.s4,
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  doneButtonText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
});

// (IOS-RELEASE-ROUTE fix 2026-05-30) RankingsScreen is now the DIRECT default
// export. The previous `export default RankingsScreenWithBoundary` wrapper (in
// <TabErrorBoundary>) made this route module resolve as `undefined` in the
// Release/Hermes sync bundle. Crash protection is covered by the root
// BootErrorBoundary + the expo-router route guard.
