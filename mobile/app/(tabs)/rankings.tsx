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
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { usePercentile } from '../../src/hooks/usePercentile';
import { useAuth } from '../../src/hooks/useAuth';
import { PercentileBar } from '../../src/components/PercentileBar';
import { ConfidenceRing, confidenceRingTooltip } from '../../src/components/ConfidenceRing';
import { confirm1rm } from '../../src/api/percentile';
import { liftIdToName } from '../../src/utils/liftNames';
import { PercentileRanking } from '../../src/types/api';

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

function percentileColor(percentile: number): string {
  if (percentile >= 75) return '#22c55e';
  if (percentile >= 40) return '#f59e0b';
  return '#ef4444';
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
  const defaultValue =
    epleyEstimateKg != null ? formatKg(epleyEstimateKg) : '';
  const [inputValue, setInputValue] = useState(defaultValue);
  const [isSaving, setIsSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Reset state when the sheet opens for a new lift
  React.useEffect(() => {
    if (visible) {
      setInputValue(epleyEstimateKg != null ? formatKg(epleyEstimateKg) : '');
      setIsSaving(false);
      setSavedOk(false);
    }
  }, [visible, epleyEstimateKg]);

  const handleConfirm = useCallback(async () => {
    const kg = parseFloat(inputValue.replace(',', '.'));
    if (!Number.isFinite(kg) || kg <= 0) return;
    setIsSaving(true);
    try {
      await onConfirm(kg);
      setSavedOk(true);
      // Auto-close after a short success flash
      setTimeout(() => onClose(), 1400);
    } catch {
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
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={confirmSheetStyles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Handle */}
        <View style={confirmSheetStyles.handle} />

        <Text style={confirmSheetStyles.title}>Confirm your max — {liftName}</Text>

        {savedOk ? (
          <View style={confirmSheetStyles.savedRow}>
            <Text style={confirmSheetStyles.savedText}>
              ✓ Saved. Your ranking updates on the next weekly run.
            </Text>
          </View>
        ) : (
          <>
            <Text style={confirmSheetStyles.body}>
              We estimated your 1-rep max from your logged sets. Adjust if it
              doesn't match your actual max — your ranking will use this value
              from the next weekly update.
            </Text>

            {epleyEstimateKg != null && (
              <Text style={confirmSheetStyles.estimate}>
                Our estimate: {formatKg(epleyEstimateKg)} kg
              </Text>
            )}

            <View style={confirmSheetStyles.inputRow}>
              <TextInput
                style={confirmSheetStyles.input}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="decimal-pad"
                placeholder="e.g. 120"
                placeholderTextColor="#475569"
                returnKeyType="done"
                onSubmitEditing={isValid ? handleConfirm : undefined}
                accessibilityLabel="Confirmed 1-rep max in kg"
              />
              <Text style={confirmSheetStyles.kgLabel}>kg</Text>
            </View>

            <TouchableOpacity
              style={[
                confirmSheetStyles.confirmButton,
                (!isValid || isSaving) && confirmSheetStyles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!isValid || isSaving}
              accessibilityRole="button"
              accessibilityLabel="Confirm this 1RM"
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={confirmSheetStyles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={confirmSheetStyles.cancelButton}
              onPress={onClose}
              disabled={isSaving}
              accessibilityRole="button"
            >
              <Text style={confirmSheetStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * ScoreBlock — one percentile score with its label, bar, and "Top X%" badge.
 * Renders a "Pending" pill when the value is null (batch job hasn't run yet).
 */
function ScoreBlock({
  value,
  label,
}: {
  value: number | null;
  label: string;
}): React.ReactElement {
  return (
    <View style={styles.scoreBlock}>
      <Text style={styles.scoreLabel}>{label}</Text>
      {value !== null ? (
        <>
          <View style={styles.scoreBadgeRow}>
            <Text style={[styles.scoreBadge, { color: percentileColor(value) }]}>
              {topPercentLabel(value)}
            </Text>
          </View>
          <View style={styles.barContainer}>
            <PercentileBar percentile={value} height={6} />
          </View>
        </>
      ) : (
        <View style={styles.pendingPill}>
          <Text style={styles.pendingText}>Pending weekly update</Text>
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
  onConfirmRequest,
}: {
  ranking: PercentileRanking;
  use1rmConfirmation: boolean;
  locallyConfirmed: boolean;
  onConfirmRequest: (ranking: PercentileRanking) => void;
}): React.ReactElement {
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
    <View style={styles.card}>
      {/* Card header: lift name */}
      <Text style={styles.liftName}>{liftName}</Text>

      {showConfirmState ? (
        /* ── Option C: Confirm your max ───────────────────────────── */
        <TouchableOpacity
          style={styles.confirmCta}
          onPress={() => onConfirmRequest(ranking)}
          accessibilityRole="button"
          accessibilityLabel={`Confirm your estimated max for ${liftName}`}
        >
          <View style={styles.confirmCtaInner}>
            <Text style={styles.confirmCtaTitle}>Confirm your max</Text>
            <Text style={styles.confirmCtaBody}>
              {ranking.epley_estimate_kg != null
                ? `We estimated ${formatKg(ranking.epley_estimate_kg)} kg from your sets. Tap to confirm or adjust.`
                : 'Tap to confirm your 1-rep max for this lift.'}
            </Text>
          </View>
          <Text style={styles.confirmCtaChevron}>›</Text>
        </TouchableOpacity>
      ) : showPendingNote ? (
        /* ── Option C: confirmed this session, awaiting next batch ── */
        <View style={styles.pendingNextRunPill}>
          <Text style={styles.pendingNextRunText}>
            ✓ Confirmed — ranking updates on the next weekly run
          </Text>
        </View>
      ) : (
        /* ── Option B / confirmed ranking: show scores ─────────────── */
        <View style={styles.scoresRow}>
          <ScoreBlock
            value={ranking.percentile}
            label="vs. lifters at your level"
          />
          <View style={styles.scoresDivider} />
          <ScoreBlock
            value={ranking.percentile_simple}
            label="vs. all strength trainees"
          />
        </View>
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
            <Text style={styles.confidenceText} numberOfLines={2}>
              {confidenceRingTooltip(ranking.cohort_size_internal)}
            </Text>
          </View>
          {updatedText ? (
            <Text style={styles.updatedText}>{updatedText}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function SkeletonCard(): React.ReactElement {
  return (
    <View style={[styles.card, styles.skeletonCard]}>
      {/* Lift name placeholder */}
      <View style={[styles.skeletonLine, { width: '50%', height: 16, marginBottom: 16 }]} />
      {/* Two score columns */}
      <View style={styles.scoresRow}>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '80%', height: 11 }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 14 }]} />
          <View style={[styles.skeletonLine, { width: '100%', height: 6, borderRadius: 99 }]} />
        </View>
        <View style={styles.scoresDivider} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '80%', height: 11 }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 14 }]} />
          <View style={[styles.skeletonLine, { width: '100%', height: 6, borderRadius: 99 }]} />
        </View>
      </View>
      {/* Footer */}
      <View style={[styles.skeletonLine, { width: '35%', height: 11, marginTop: 12 }]} />
    </View>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No rankings yet</Text>
      <Text style={styles.emptySubtext}>
        Log at least one workout and check back after the weekly update (every Monday)
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
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RankingsScreen(): React.ReactElement {
  const { response, isLoading, error, refetch } = usePercentile();
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const use1rmConfirmation = user?.use_1rm_confirmation ?? false;

  // Track lifts the user confirmed this session (so the card updates immediately
  // without waiting for the next batch run to flip is_estimated=false).
  const [confirmedThisSession, setConfirmedThisSession] = useState<Set<string>>(
    () => new Set()
  );

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
      await confirm1rm({ lift_id: confirmingRanking.lift_id, confirmed_kg: confirmedKg });
      setConfirmedThisSession((prev) => new Set([...prev, confirmingRanking.lift_id]));
    },
    [confirmingRanking]
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
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#64748b"
          />
        }
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.header}>
          <Text style={styles.title}>Your Rankings</Text>
          <Text style={styles.subtitle}>{cohortNote}</Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>🕐 Updated weekly</Text>
          </View>
        </View>

        {/* ---------------------------------------------------------------- */}
        {/* Option B banner — shown when any rankings used Epley estimates   */}
        {/* ---------------------------------------------------------------- */}
        {estimatedLiftNames.length > 0 && !isLoading && (
          <View style={styles.estimatedBanner}>
            <Text style={styles.estimatedBannerText}>
              Rankings for{' '}
              <Text style={styles.estimatedBannerLifts}>
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
          <View style={styles.listContainer}>
            {rankings.map((ranking) => (
              <RankingCard
                key={ranking.lift_id}
                ranking={ranking}
                use1rmConfirmation={use1rmConfirmation}
                locallyConfirmed={confirmedThisSession.has(ranking.lift_id)}
                onConfirmRequest={handleConfirmRequest}
              />
            ))}
          </View>
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
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
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
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  chipText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  // Card
  listContainer: {
    gap: 12,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
  },
  liftName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 14,
  },

  // Two-column score layout (v2 / TICKET-033)
  scoresRow: {
    flexDirection: 'row',
    gap: 0,
  },
  scoresDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 14,
  },
  scoreBlock: {
    flex: 1,
    gap: 6,
  },
  scoreLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    lineHeight: 15,
  },
  scoreBadgeRow: {
    flexDirection: 'row',
  },
  scoreBadge: {
    fontSize: 15,
    fontWeight: '700',
  },
  barContainer: {
    // bar fills the scoreBlock column
  },

  // Pending state (null percentile)
  pendingPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 2,
  },
  pendingText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
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
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },

  updatedText: {
    fontSize: 12,
    color: '#475569',
  },

  // Skeleton
  skeletonCard: {
    opacity: 0.6,
  },
  skeletonLine: {
    backgroundColor: '#334155',
    borderRadius: 4,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Option B estimated banner (TICKET-041)
  estimatedBanner: {
    backgroundColor: '#1c1917',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#78350f',
    padding: 14,
    marginBottom: 12,
  },
  estimatedBannerText: {
    fontSize: 13,
    color: '#a78bfa',
    lineHeight: 20,
  },
  estimatedBannerLifts: {
    fontWeight: '600',
    color: '#c4b5fd',
  },

  // Option C confirm CTA (TICKET-041)
  confirmCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4338ca',
    padding: 14,
    gap: 10,
  },
  confirmCtaInner: {
    flex: 1,
    gap: 4,
  },
  confirmCtaTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#a5b4fc',
  },
  confirmCtaBody: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },
  confirmCtaChevron: {
    fontSize: 20,
    color: '#4338ca',
  },

  // Option C: confirmed this session
  pendingNextRunPill: {
    backgroundColor: '#052e16',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pendingNextRunText: {
    fontSize: 13,
    color: '#86efac',
    lineHeight: 19,
  },

  // Error
  errorBanner: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    flex: 1,
  },
  retryButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
});

// ---------------------------------------------------------------------------
// ConfirmSheet styles (TICKET-041)
// ---------------------------------------------------------------------------

const confirmSheetStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    marginTop: 12,
    marginBottom: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
  },
  body: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
    marginBottom: 16,
  },
  estimate: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
  },
  kgLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  confirmButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
  savedRow: {
    backgroundColor: '#052e16',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#166534',
    padding: 16,
    marginTop: 8,
  },
  savedText: {
    fontSize: 15,
    color: '#86efac',
    fontWeight: '500',
    lineHeight: 22,
    textAlign: 'center',
  },
});
