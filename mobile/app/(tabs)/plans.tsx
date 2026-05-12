/**
 * Plans tab — AI-generated training plans.
 *
 * TICKET-020: full implementation.
 *
 * Sections:
 *   A. Free-tier upsell card  — shown when is_paid = false
 *   B. Plan list              — user's saved plans + global templates
 *   C. Generate CTA           — "Generate new plan" for paid users
 *   D. Plan detail modal      — exercises, sets, reps, RPE, AI reasoning
 *
 * Paid-tier gate:
 *   - UI hides the "Generate" button for free users and shows an upsell card.
 *   - The server enforces the gate regardless (defence-in-depth).
 *
 * AI generation uses Claude Haiku 4.5 (~2.5¢/plan, CTO cost guardrail).
 * The model is pinned to 'claude-haiku-4-5' on the server; we show it in the
 * reasoning banner so users know what generated their plan.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { usePlans } from '../../src/hooks/usePlans';
import { getPlan } from '../../src/api/plans';
import { Plan, PlanWithStructure, PlanExercise, GeneratePlanResponse } from '../../src/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

function rpeColor(rpe: number): string {
  if (rpe >= 9) return '#ef4444';
  if (rpe >= 7) return '#f59e0b';
  return '#22c55e';
}

function restLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Upgrade upsell card
// ---------------------------------------------------------------------------

function UpsellCard(): React.ReactElement {
  return (
    <View style={styles.upsellCard}>
      <View style={styles.upsellIconRow}>
        <Text style={styles.upsellIcon}>⚡</Text>
        <Text style={styles.upsellTitle}>AI Training Plans</Text>
      </View>
      <Text style={styles.upsellBody}>
        Upgrade to Peak Fettle Pro to unlock personalised AI-generated training plans.
        Each plan is built by Claude Haiku using your workout history, health metrics,
        and physical constraints — adapted to you specifically.
      </Text>
      <View style={styles.upsellFeatureList}>
        <Text style={styles.upsellFeature}>✓  Personalised exercises and loading</Text>
        <Text style={styles.upsellFeature}>✓  Respects your injury constraints</Text>
        <Text style={styles.upsellFeature}>✓  Adapts as you log more sessions</Text>
        <Text style={styles.upsellFeature}>✓  AI reasoning — see why each choice was made</Text>
      </View>
      <View style={styles.upsellCTARow}>
        <Text style={styles.upsellCTALabel}>~2.5¢/plan · Claude Haiku 4.5</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Plan list card
// ---------------------------------------------------------------------------

interface PlanCardProps {
  plan: Plan;
  onPress: (plan: Plan) => void;
}

function PlanCard({ plan, onPress }: PlanCardProps): React.ReactElement {
  return (
    <TouchableOpacity
      style={styles.planCard}
      onPress={() => onPress(plan)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`View plan: ${plan.name}`}
    >
      <View style={styles.planCardHeader}>
        <Text style={styles.planCardName} numberOfLines={2}>
          {plan.name}
        </Text>
        <View style={styles.planBadgeRow}>
          {plan.is_ai_generated && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI</Text>
            </View>
          )}
          {plan.is_template && (
            <View style={styles.templateBadge}>
              <Text style={styles.templateBadgeText}>Template</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.planCardDate}>
        {plan.is_template ? 'Global template' : `Saved ${formatDate(plan.created_at)}`}
      </Text>
      <Text style={styles.planCardChevron}>›</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Generate CTA button
// ---------------------------------------------------------------------------

interface GenerateCTAProps {
  onPress: () => void;
  isGenerating: boolean;
}

function GenerateCTA({ onPress, isGenerating }: GenerateCTAProps): React.ReactElement {
  return (
    <TouchableOpacity
      style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
      onPress={onPress}
      disabled={isGenerating}
      accessibilityRole="button"
      accessibilityLabel="Generate a new AI training plan"
    >
      {isGenerating ? (
        <View style={styles.generateButtonContent}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.generateButtonText}>Generating plan…</Text>
        </View>
      ) : (
        <View style={styles.generateButtonContent}>
          <Text style={styles.generateButtonIcon}>⚡</Text>
          <Text style={styles.generateButtonText}>Generate New Plan</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Plan detail modal
// ---------------------------------------------------------------------------

interface PlanDetailProps {
  planId: string;
  onClose: () => void;
}

function PlanDetailModal({ planId, onClose }: PlanDetailProps): React.ReactElement {
  const [plan, setPlan] = React.useState<PlanWithStructure | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsLoading(true);
    setError(null);
    getPlan(planId)
      .then(setPlan)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load plan')
      )
      .finally(() => setIsLoading(false));
  }, [planId]);

  const exercises: PlanExercise[] =
    plan?.structure?.session?.exercises ?? [];
  const reasoning = plan?.structure?.reasoning ?? null;
  const model = plan?.structure?.model ?? null;

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={detailStyles.container}>
        {/* Header */}
        <View style={detailStyles.header}>
          <View style={detailStyles.headerText}>
            {plan ? (
              <>
                <Text style={detailStyles.title} numberOfLines={2}>
                  {plan.name}
                </Text>
                {plan.is_ai_generated && model ? (
                  <Text style={detailStyles.modelLabel}>
                    Generated by {model}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={detailStyles.title}>Plan</Text>
            )}
          </View>
          <TouchableOpacity
            style={detailStyles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close plan detail"
          >
            <Text style={detailStyles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={detailStyles.centered}>
            <ActivityIndicator size="large" color="#818cf8" />
            <Text style={detailStyles.loadingText}>Loading plan…</Text>
          </View>
        ) : error ? (
          <View style={detailStyles.centered}>
            <Text style={detailStyles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={detailStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* AI Reasoning banner */}
            {reasoning ? (
              <View style={detailStyles.reasoningCard}>
                <View style={detailStyles.reasoningHeader}>
                  <Text style={detailStyles.reasoningIcon}>🤖</Text>
                  <Text style={detailStyles.reasoningTitle}>Why this plan?</Text>
                </View>
                <Text style={detailStyles.reasoningText}>{reasoning}</Text>
              </View>
            ) : null}

            {/* Exercise list */}
            {exercises.length > 0 ? (
              <View style={detailStyles.exerciseList}>
                <Text style={detailStyles.sectionHeader}>EXERCISES</Text>
                {exercises.map((ex, idx) => (
                  <ExerciseRow key={`${ex.name}-${idx}`} exercise={ex} index={idx} />
                ))}
              </View>
            ) : (
              <View style={detailStyles.centered}>
                <Text style={detailStyles.emptyText}>No exercises in this plan.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

interface ExerciseRowProps {
  exercise: PlanExercise;
  index: number;
}

function ExerciseRow({ exercise, index }: ExerciseRowProps): React.ReactElement {
  const rpeStyle = { color: rpeColor(exercise.rpe_target) };

  return (
    <View style={detailStyles.exerciseCard}>
      {/* Exercise number + name */}
      <View style={detailStyles.exerciseCardHeader}>
        <View style={detailStyles.exerciseNumber}>
          <Text style={detailStyles.exerciseNumberText}>{index + 1}</Text>
        </View>
        <Text style={detailStyles.exerciseName}>{exercise.name}</Text>
      </View>

      {/* Stats row */}
      <View style={detailStyles.statsRow}>
        <StatChip label="Sets" value={String(exercise.sets)} />
        <StatChip label="Reps" value={exercise.reps} />
        <StatChip label="RPE" value={String(exercise.rpe_target)} valueStyle={rpeStyle} />
        <StatChip label="Rest" value={restLabel(exercise.rest_seconds)} />
      </View>
    </View>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  valueStyle?: object;
}

function StatChip({ label, value, valueStyle }: StatChipProps): React.ReactElement {
  return (
    <View style={detailStyles.statChip}>
      <Text style={[detailStyles.statValue, valueStyle]}>{value}</Text>
      <Text style={detailStyles.statLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PlansScreen(): React.ReactElement {
  const { user } = useAuth();
  const isPaid = user?.is_paid ?? false;

  const {
    plans,
    isLoading,
    error,
    refetch,
    generate,
    isGenerating,
    generateError,
    clearGenerateError,
  } = usePlans();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<GeneratePlanResponse | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleGenerate = useCallback(async () => {
    try {
      const result = await generate();
      setLastGenerated(result);
      // Immediately open the newly generated plan detail.
      setSelectedPlanId(result.plan_id);
    } catch (err) {
      // generateError is already set in usePlans; show alert for 403
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('paid_tier_required')) {
        Alert.alert(
          'Pro feature',
          'AI-generated plans are a paid-tier feature. Upgrade to Peak Fettle Pro.'
        );
      }
      // 502 retryable errors are shown inline via generateError banner.
    }
  }, [generate]);

  // Dismiss generate error on next press
  const handleGeneratePress = useCallback(() => {
    clearGenerateError();
    handleGenerate();
  }, [clearGenerateError, handleGenerate]);

  // Split plans: user plans vs templates
  const userPlans = plans.filter((p) => !p.is_template);
  const templates = plans.filter((p) => p.is_template);

  return (
    <View style={styles.container}>
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
        {/* ── A. Free upsell card ── */}
        {!isPaid && <UpsellCard />}

        {/* ── B. Generate CTA (paid only) ── */}
        {isPaid && (
          <View style={styles.generateSection}>
            <GenerateCTA onPress={handleGeneratePress} isGenerating={isGenerating} />
            {/* Generation error banner (502 retryable errors) */}
            {generateError ? (
              <View style={styles.generateErrorBanner}>
                <Text style={styles.generateErrorText}>{generateError}</Text>
                <TouchableOpacity
                  style={styles.generateRetryButton}
                  onPress={handleGeneratePress}
                >
                  <Text style={styles.generateRetryText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {/* ── C. Plan list ── */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#818cf8" />
            <Text style={styles.loadingText}>Loading plans…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={refetch}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* User's plans */}
            {userPlans.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>YOUR PLANS</Text>
                {userPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onPress={(p) => setSelectedPlanId(p.id)}
                  />
                ))}
              </View>
            ) : !isLoading && isPaid ? (
              <View style={styles.emptyPlansCard}>
                <Text style={styles.emptyPlansTitle}>No plans yet</Text>
                <Text style={styles.emptyPlansSubtitle}>
                  Tap "Generate New Plan" to create your first AI-tailored session.
                </Text>
              </View>
            ) : null}

            {/* Global templates */}
            {templates.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>TEMPLATES</Text>
                {templates.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onPress={(p) => setSelectedPlanId(p.id)}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── D. Plan detail modal ── */}
      {selectedPlanId ? (
        <PlanDetailModal
          planId={selectedPlanId}
          onClose={() => {
            setSelectedPlanId(null);
            setLastGenerated(null);
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — main screen
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },

  // Upsell card
  upsellCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4f46e5',
    padding: 20,
    gap: 14,
  },
  upsellIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upsellIcon: {
    fontSize: 24,
  },
  upsellTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  upsellBody: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 22,
  },
  upsellFeatureList: {
    gap: 6,
  },
  upsellFeature: {
    fontSize: 14,
    color: '#c7d2fe',
    lineHeight: 20,
  },
  upsellCTARow: {
    alignItems: 'center',
    marginTop: 4,
  },
  upsellCTALabel: {
    fontSize: 12,
    color: '#64748b',
  },

  // Generate section
  generateSection: {
    gap: 12,
  },
  generateButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonIcon: {
    fontSize: 18,
  },
  generateButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  generateErrorBanner: {
    backgroundColor: '#450a0a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#7f1d1d',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  generateErrorText: {
    flex: 1,
    fontSize: 14,
    color: '#fca5a5',
  },
  generateRetryButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  generateRetryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f87171',
  },

  // Section
  section: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  // Plan card
  planCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
  },
  planCardHeader: {
    flex: 1,
    gap: 6,
  },
  planCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    flexShrink: 1,
  },
  planBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  aiBadge: {
    backgroundColor: '#312e81',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  templateBadge: {
    backgroundColor: '#1c2f3e',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  templateBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7dd3fc',
  },
  planCardDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  planCardChevron: {
    fontSize: 22,
    color: '#475569',
    marginLeft: 10,
  },

  // Loading / error
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  errorBanner: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
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

  // Empty state
  emptyPlansCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyPlansTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  emptyPlansSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },

  bottomPad: { height: 32 },
});

// ---------------------------------------------------------------------------
// Styles — plan detail modal
// ---------------------------------------------------------------------------

const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerText: {
    flex: 1,
    gap: 4,
    paddingRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  modelLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#818cf8',
    fontWeight: '500',
  },

  scrollContent: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },

  // Reasoning card
  reasoningCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#312e81',
    padding: 16,
    gap: 10,
  },
  reasoningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reasoningIcon: {
    fontSize: 18,
  },
  reasoningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a5b4fc',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  reasoningText: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 24,
  },

  // Exercise list
  exerciseList: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  exerciseCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    gap: 14,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#312e81',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  exerciseNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
    flexWrap: 'wrap',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Loading / error in detail
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  errorText: {
    fontSize: 15,
    color: '#f87171',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
});
