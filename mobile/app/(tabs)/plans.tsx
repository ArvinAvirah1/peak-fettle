/**
 * Plans tab — Training Engine plans.
 *
 * TICKET-020: full implementation.
 * 2026-06-11: rebranded to Training Engine (spec §5, §7). No "AI" strings.
 *   - UpsellCard copy updated: "evidence-based Training Engine"
 *   - Plan detail shows reasoning prominently + collapsible "Why this plan"
 *     rule_trace list.
 *   - GenerateCTA copy: "Generate my plan — built from published sports science"
 *   - is_ai_generated badge renamed to "Engine"
 *
 * Sections:
 *   A. Free-tier upsell card  — shown when is_paid = false
 *   B. Plan list              — user's saved plans + global templates
 *   C. Generate CTA           — "Generate my plan" for paid users
 *   D. Plan detail modal      — exercises, sets, reps, RPE, reasoning + rule_trace
 *
 * Paid-tier gate:
 *   - UI hides the "Generate" button for free users and shows an upsell card.
 *   - The server enforces the gate regardless (defence-in-depth).
 *
 * Daily limit: 20 plans/day (server-enforced).
 */

import React, { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
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
import { getPlan, activatePlan, regeneratePlan } from '../../src/api/plans';
import type { EngineGenerateResponse } from '../../src/api/plans';
import { Plan, PlanWithStructure, PlanExercise, PlanWeek, PlanWeekSession } from '../../src/types/api';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';
import { PFButton, ScreenLayout } from '../../src/components/ui';

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

function rpeColorToken(rpe: number, theme: any): string {
  if (rpe >= 9) return theme.colors.statusError;
  if (rpe >= 7) return theme.colors.statusWarning;
  return theme.colors.statusSuccess;
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
  const { theme } = useTheme();
  return (
    <View style={[
      styles.upsellCard,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.accentDefault },
    ]}>
      <View style={styles.upsellIconRow}>
        <Text style={styles.upsellIcon}>⚡</Text>
        <Text style={[styles.upsellTitle, { color: theme.colors.textPrimary }]}>
          Training Engine Plans
        </Text>
      </View>
      <Text style={[styles.upsellBody, { color: theme.colors.textSecondary }]}>
        Upgrade to Peak Fettle Pro to unlock personalised, evidence-based
        training plans. Every plan is built from published sports science using
        your workout history, health metrics, and physical constraints —
        adapted to you specifically.
      </Text>
      <View style={styles.upsellFeatureList}>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>✓  Personalised exercises and loading</Text>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>✓  Respects your injury constraints</Text>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>✓  Adapts as you log more sessions</Text>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>✓  See exactly why each choice was made</Text>
      </View>
      <View style={styles.upsellCTARow}>
        <Text style={[styles.upsellCTALabel, { color: theme.colors.textTertiary }]}>
          Built from published sports science
        </Text>
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
  /** PLANS-001 (2026-05-19): set-as-active handler for user-owned plans. */
  onActivate?: (plan: Plan) => void;
  /** True while an activation request for THIS plan is in flight. */
  isActivating?: boolean;
}

function PlanCard({ plan, onPress, onActivate, isActivating }: PlanCardProps): React.ReactElement {
  const { theme } = useTheme();
  const canActivate = !plan.is_template && !!onActivate;

  return (
    <TouchableOpacity
      style={[
        styles.planCard,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: plan.is_active ? theme.colors.accentDefault : theme.colors.borderDefault,
          borderWidth: plan.is_active ? 2 : 1,
        },
      ]}
      onPress={() => onPress(plan)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={
        plan.is_active
          ? `Active plan: ${plan.name}. Tap to view.`
          : `View plan: ${plan.name}`
      }
    >
      <View style={styles.planCardHeader}>
        <Text style={[styles.planCardName, { color: theme.colors.textPrimary }]} numberOfLines={2}>
          {plan.name}
        </Text>
        <View style={styles.planBadgeRow}>
          {plan.is_active && (
            <View style={[styles.activeBadge, { backgroundColor: theme.colors.accentDefault }]}>
              <Text style={[styles.activeBadgeText, { color: theme.components.buttonPrimaryText }]}>
                ACTIVE
              </Text>
            </View>
          )}
          {plan.is_ai_generated && (
            <View style={[styles.engineBadge, { backgroundColor: theme.colors.accentSecondary }]}>
              <Text style={[styles.engineBadgeText, { color: theme.colors.accentHover }]}>
                Engine
              </Text>
            </View>
          )}
          {plan.is_template && (
            <View style={[styles.templateBadge, { backgroundColor: theme.colors.bgElevated }]}>
              <Text style={[styles.templateBadgeText, { color: theme.colors.accentHover }]}>
                Template
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.planCardDate, { color: theme.colors.textTertiary }]}>
        {plan.is_template ? 'Global template' : `Saved ${formatDate(plan.created_at)}`}
      </Text>

      {canActivate && !plan.is_active && (
        <TouchableOpacity
          style={[
            styles.activateButton,
            {
              borderColor: theme.colors.accentDefault,
              opacity: isActivating ? 0.55 : 1,
            },
          ]}
          onPress={(e) => {
            e.stopPropagation?.();
            onActivate!(plan);
          }}
          disabled={isActivating}
          accessibilityRole="button"
          accessibilityLabel={`Set ${plan.name} as your active plan`}
        >
          {isActivating ? (
            <ActivityIndicator size="small" color={theme.colors.accentDefault} />
          ) : (
            <Text style={[styles.activateButtonText, { color: theme.colors.accentDefault }]}>
              Set as active
            </Text>
          )}
        </TouchableOpacity>
      )}

      <Text style={[styles.planCardChevron, { color: theme.colors.textTertiary }]}>›</Text>
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
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.generateButton,
        { backgroundColor: theme.colors.accentDefault },
        isGenerating && styles.generateButtonDisabled,
      ]}
      onPress={onPress}
      disabled={isGenerating}
      accessibilityRole="button"
      accessibilityLabel="Generate a new training plan"
    >
      {isGenerating ? (
        <View style={styles.generateButtonContent}>
          <ActivityIndicator color={theme.components.buttonPrimaryText} size="small" />
          <Text style={[styles.generateButtonText, { color: theme.components.buttonPrimaryText }]}>
            Building your plan…
          </Text>
        </View>
      ) : (
        <View style={styles.generateButtonContent}>
          <Text style={styles.generateButtonIcon}>⚡</Text>
          <View style={styles.generateButtonLabels}>
            <Text style={[styles.generateButtonText, { color: theme.components.buttonPrimaryText }]}>
              Generate my plan
            </Text>
            <Text style={[styles.generateButtonSub, { color: theme.components.buttonPrimaryText }]}>
              built from published sports science
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Rule trace collapsible
// ---------------------------------------------------------------------------

function RuleTraceCollapsible({ ruleTrace }: { ruleTrace: string[] }): React.ReactElement {
  const { theme } = useTheme();
  const [expanded, setExpanded] = React.useState(false);

  if (!ruleTrace || ruleTrace.length === 0) return <View />;

  return (
    <View style={[
      detailStyles.ruleTraceContainer,
      { backgroundColor: theme.colors.bgPrimary, borderColor: theme.colors.borderDefault },
    ]}>
      <TouchableOpacity
        style={detailStyles.ruleTraceHeader}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse rule trace' : 'Expand rule trace'}
        accessibilityState={{ expanded }}
      >
        <Text style={[detailStyles.ruleTraceTitle, { color: theme.colors.textSecondary }]}>
          Here's why ›
        </Text>
        <Text style={[detailStyles.ruleTraceChevron, { color: theme.colors.textTertiary }]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={detailStyles.ruleTraceList}>
          {ruleTrace.map((rule, idx) => (
            <View key={idx} style={detailStyles.ruleTraceRow}>
              <Text style={[detailStyles.ruleTraceBullet, { color: theme.colors.accentDefault }]}>
                {'•'}
              </Text>
              <Text style={[detailStyles.ruleTraceText, { color: theme.colors.textTertiary }]}>
                {rule}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Plan detail modal
// ---------------------------------------------------------------------------

interface PlanDetailProps {
  planId: string;
  onClose: () => void;
  onRegenerate: () => void;
}

function PlanDetailModal({ planId, onClose, onRegenerate }: PlanDetailProps): React.ReactElement {
  const { theme } = useTheme();
  const router = useRouter();
  const [plan, setPlan] = React.useState<PlanWithStructure | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = React.useState(false);
  const [selectedWeek, setSelectedWeek] = React.useState(0);
  const [selectedDay, setSelectedDay] = React.useState(0);

  const loadPlan = React.useCallback(() => {
    setIsLoading(true);
    setError(null);
    getPlan(planId)
      .then(setPlan)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load plan')
      )
      .finally(() => setIsLoading(false));
  }, [planId]);

  React.useEffect(() => {
    setSelectedWeek(0);
    setSelectedDay(0);
    loadPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  const handleRegenerate = React.useCallback(async () => {
    setIsRegenerating(true);
    haptics.medium();
    try {
      await regeneratePlan(planId);
      haptics.success();
      setSelectedWeek(0);
      setSelectedDay(0);
      loadPlan();
    } catch (err) {
      haptics.error();
      const msg = err instanceof Error ? err.message : 'Regeneration failed';
      Alert.alert('Regeneration failed', msg);
    } finally {
      setIsRegenerating(false);
    }
  }, [planId, loadPlan]);

  const hasWeeks = (plan?.structure?.weeks?.length ?? 0) > 0;
  const weeks: PlanWeek[] = plan?.structure?.weeks ?? [];
  const currentWeekSessions: PlanWeekSession[] = weeks[selectedWeek]?.sessions ?? [];
  const exercises: PlanExercise[] = hasWeeks
    ? (currentWeekSessions[selectedDay]?.exercises ?? [])
    : (plan?.structure?.session?.exercises ?? []);
  const reasoning = plan?.structure?.reasoning ?? null;
  // rule_trace — may be in structure or top-level depending on server version
  const ruleTrace: string[] = (plan?.structure as any)?.rule_trace ?? [];

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[detailStyles.container, { backgroundColor: theme.colors.bgPrimary }]}>
        {/* Header */}
        <View style={[detailStyles.header, { borderBottomColor: theme.colors.bgSecondary }]}>
          <View style={detailStyles.headerText}>
            {plan ? (
              <>
                <Text style={[detailStyles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                  {plan.name}
                </Text>
                {plan.is_ai_generated ? (
                  <Text style={[detailStyles.engineLabel, { color: theme.colors.textTertiary }]}>
                    Training Engine — evidence-based
                  </Text>
                ) : null}
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginTop: spacing.s1 }}>
                  Personalised for your goals.
                </Text>
              </>
            ) : (
              <Text style={[detailStyles.title, { color: theme.colors.textPrimary }]}>Plan</Text>
            )}
          </View>
          <TouchableOpacity
            style={detailStyles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close plan detail"
          >
            <Text style={[detailStyles.closeButtonText, { color: theme.colors.accentDefault }]}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={detailStyles.centered}>
            <ActivityIndicator size="large" color={theme.colors.accentDefault} />
            <Text style={[detailStyles.loadingText, { color: theme.colors.textTertiary }]}>Loading plan…</Text>
          </View>
        ) : error ? (
          <View style={detailStyles.centered}>
            <Text style={[detailStyles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={detailStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Reasoning banner — shown prominently per spec §5 */}
            {reasoning ? (
              <View style={[
                detailStyles.reasoningCard,
                { backgroundColor: theme.colors.bgSecondary, borderLeftColor: theme.colors.accentDefault },
              ]}>
                <View style={detailStyles.reasoningHeader}>
                  <Text style={detailStyles.reasoningIcon}>📋</Text>
                  <Text style={[detailStyles.reasoningTitle, { color: theme.colors.accentHover }]}>
                    Your plan, explained
                  </Text>
                </View>
                <Text style={[detailStyles.reasoningText, { color: theme.colors.textSecondary }]}>
                  {reasoning}
                </Text>
                {/* Rule trace collapsible — "Why this plan" detail */}
                {ruleTrace.length > 0 && (
                  <RuleTraceCollapsible ruleTrace={ruleTrace} />
                )}
              </View>
            ) : null}

            {/* Week picker — shown for multi-week plans */}
            {hasWeeks && weeks.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={detailStyles.pickerRow}>
                  {weeks.map((week, idx) => (
                    <TouchableOpacity
                      key={week.week_number}
                      style={[
                        detailStyles.pickerChip,
                        { borderColor: idx === selectedWeek ? theme.colors.accentDefault : theme.colors.borderDefault },
                        idx === selectedWeek && { backgroundColor: theme.colors.accentDefault + '22' },
                      ]}
                      onPress={() => { setSelectedWeek(idx); setSelectedDay(0); }}
                      accessibilityRole="button"
                      accessibilityLabel={`View Week ${week.week_number}`}
                    >
                      <Text style={[
                        detailStyles.pickerChipText,
                        { color: idx === selectedWeek ? theme.colors.accentDefault : theme.colors.textSecondary },
                      ]}>
                        Week {week.week_number}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Day picker */}
            {hasWeeks && currentWeekSessions.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={detailStyles.pickerRow}>
                  {currentWeekSessions.map((session, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        detailStyles.pickerChip,
                        { borderColor: idx === selectedDay ? theme.colors.accentDefault : theme.colors.borderDefault },
                        idx === selectedDay && { backgroundColor: theme.colors.accentDefault + '22' },
                      ]}
                      onPress={() => setSelectedDay(idx)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${session.day_label}`}
                    >
                      <Text style={[
                        detailStyles.pickerChipText,
                        { color: idx === selectedDay ? theme.colors.accentDefault : theme.colors.textSecondary },
                      ]}>
                        {session.day_label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Exercise list */}
            {exercises.length > 0 ? (
              <View style={detailStyles.exerciseList}>
                <Text style={[detailStyles.sectionHeader, { color: theme.colors.textTertiary }]}>EXERCISES</Text>
                {exercises.map((ex, idx) => (
                  <ExerciseRow key={`${ex.name}-${idx}`} exercise={ex} index={idx} />
                ))}
              </View>
            ) : (
              <View style={detailStyles.centered}>
                <Text style={[detailStyles.emptyText, { color: theme.colors.textTertiary }]}>
                  No exercises in this plan.
                </Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Footer actions */}
        {!isLoading && !error && (
          <View style={{ paddingHorizontal: spacing.s5, paddingBottom: spacing.s5, paddingTop: spacing.s3, gap: spacing.s2 }}>
            <PFButton
              variant="primary"
              label="Start This Workout"
              onPress={() => {
                onClose();
                router.push('/(tabs)?startWorkout=1');
              }}
            />
            <PFButton
              variant="ghost"
              label={isRegenerating ? 'Regenerating…' : 'Regenerate Plan'}
              onPress={handleRegenerate}
            />
          </View>
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
  const { theme } = useTheme();
  const rpeStyle = { color: rpeColorToken(exercise.rpe_target, theme) };

  return (
    <View style={[
      detailStyles.exerciseCard,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
    ]}>
      <View style={detailStyles.exerciseCardHeader}>
        <View style={[detailStyles.exerciseNumber, { backgroundColor: theme.colors.accentSecondary }]}>
          <Text style={[detailStyles.exerciseNumberText, { color: theme.colors.accentHover }]}>{index + 1}</Text>
        </View>
        <Text style={[detailStyles.exerciseName, { color: theme.colors.textPrimary }]}>{exercise.name}</Text>
      </View>

      <View style={detailStyles.statsRow}>
        <StatChip label="Sets" value={String(exercise.sets)} />
        <StatChip label="Reps" value={exercise.reps} />
        <StatChip label="RPE" value={String(exercise.rpe_target)} valueStyle={rpeStyle} />
        <StatChip label="Rest" value={restLabel(exercise.rest_seconds)} />
      </View>

      {!!exercise.coaching_note && (
        <Text style={[detailStyles.coachingNote, { color: theme.colors.textTertiary }]}>
          {exercise.coaching_note}
        </Text>
      )}
    </View>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  valueStyle?: object;
}

function StatChip({ label, value, valueStyle }: StatChipProps): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View style={[
      detailStyles.statChip,
      { backgroundColor: theme.colors.bgPrimary, borderColor: theme.colors.bgSecondary },
    ]}>
      <Text style={[detailStyles.statValue, { color: theme.colors.textPrimary }, valueStyle]}>{value}</Text>
      <Text style={[detailStyles.statLabel, { color: theme.colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PlansScreen(): React.ReactElement {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();
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
  const [lastGenerated, setLastGenerated] = useState<EngineGenerateResponse | null>(null);
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);

  const handleActivatePlan = useCallback(
    async (plan: Plan) => {
      if (activatingPlanId) return;
      setActivatingPlanId(plan.id);
      haptics.medium();
      try {
        await activatePlan(plan.id);
        haptics.success();
        await refetch();
      } catch (err) {
        haptics.error();
        const message = err instanceof Error ? err.message : 'Could not set active plan';
        Alert.alert('Activation failed', message);
      } finally {
        setActivatingPlanId(null);
      }
    },
    [activatingPlanId, refetch]
  );

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const handleGenerate = useCallback(async () => {
    haptics.medium();
    try {
      const result = await generate();
      setLastGenerated(result as EngineGenerateResponse);
      setSelectedPlanId(result.plan_id);
      haptics.success();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('paid_tier_required')) {
        haptics.error();
        Alert.alert(
          'Pro feature',
          'Training Engine plans are a paid-tier feature. Upgrade to Peak Fettle Pro.'
        );
      }
    }
  }, [generate]);

  const handleGeneratePress = useCallback(() => {
    clearGenerateError();
    handleGenerate();
  }, [clearGenerateError, handleGenerate]);

  const userPlans = plans.filter((p) => !p.is_template);
  const templates = plans.filter((p) => p.is_template);

  return (
    <ScreenLayout horizontalPadding={false}>
    <View style={styles.container}>
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
        {/* ── A. Free upsell card ── */}
        {!isPaid && <UpsellCard />}

        {/* ── B. Generate CTA (paid only) ── */}
        {isPaid && (
          <View style={styles.generateSection}>
            <GenerateCTA onPress={handleGeneratePress} isGenerating={isGenerating} />
            {generateError ? (
              <View style={[
                styles.generateErrorBanner,
                { backgroundColor: theme.colors.statusError + '18', borderColor: theme.colors.statusError + '60' },
              ]}>
                <Text style={[styles.generateErrorText, { color: theme.colors.statusError }]}>{generateError}</Text>
                <TouchableOpacity
                  style={styles.generateRetryButton}
                  onPress={handleGeneratePress}
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                >
                  <Text style={[styles.generateRetryText, { color: theme.colors.statusError }]}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {/* ── C. Plan list ── */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.accentDefault} />
            <Text style={[styles.loadingText, { color: theme.colors.textTertiary }]}>Loading plans…</Text>
          </View>
        ) : error ? (
          <View style={[
            styles.errorBanner,
            { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.statusError },
          ]}>
            <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: theme.colors.statusError }]}
              onPress={refetch}
              accessibilityRole="button"
              accessibilityLabel="Retry loading plans"
            >
              <Text style={[styles.retryButtonText, { color: theme.colors.textPrimary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {userPlans.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>YOUR PLANS</Text>
                {userPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onPress={(p) => setSelectedPlanId(p.id)}
                    onActivate={handleActivatePlan}
                    isActivating={activatingPlanId === plan.id}
                  />
                ))}
              </View>
            ) : !isLoading && isPaid ? (
              <View style={[
                styles.emptyPlansCard,
                { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
              ]}>
                <Text style={[styles.emptyPlansTitle, { color: theme.colors.textPrimary }]}>No plans yet</Text>
                <Text style={[styles.emptyPlansSubtitle, { color: theme.colors.textTertiary }]}>
                  Tap "Generate my plan" to create your first evidence-based training plan.
                </Text>
              </View>
            ) : null}

            {templates.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>TEMPLATES</Text>
                {templates.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onPress={(p) => setSelectedPlanId(p.id)}
                  />
                ))}
              </View>
            ) : null}

            <View style={{ paddingHorizontal: spacing.s4, paddingBottom: spacing.s3 }}>
              <PFButton
                variant="ghost"
                label="Browse Workout Templates"
                onPress={() => router.push('/templates')}
              />
            </View>
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
          onRegenerate={handleGeneratePress}
        />
      ) : null}
    </View>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — main screen
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: 20,
    gap: 16,
  },

  upsellCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  upsellIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upsellIcon: {
    fontSize: fontSize.heading2,   // E-003
  },
  upsellTitle: {
    fontSize: fontSize.heading3,   // E-003
    fontWeight: fontWeight.bold,   // E-003
  },
  upsellBody: {
    fontSize: fontSize.bodySm,     // E-003
    lineHeight: 22,
  },
  upsellFeatureList: { gap: 6 },
  upsellFeature: {
    fontSize: fontSize.bodySm,     // E-003
    lineHeight: 20,
  },
  upsellCTARow: {
    alignItems: 'center',
    marginTop: 4,
  },
  upsellCTALabel: {
    fontSize: fontSize.caption,    // E-003
  },

  generateSection: { gap: 12 },
  generateButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  generateButtonDisabled: { opacity: 0.6 },
  generateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  generateButtonLabels: {
    alignItems: 'center',
    gap: 2,
  },
  generateButtonIcon: {
    fontSize: fontSize.bodyLg,     // E-003
  },
  generateButtonText: {
    fontSize: fontSize.bodyMd,     // E-003
    fontWeight: fontWeight.bold,   // E-003
  },
  generateButtonSub: {
    fontSize: fontSize.caption,    // E-003
    opacity: 0.8,
  },
  generateErrorBanner: {
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  generateErrorText: {
    flex: 1,
    fontSize: fontSize.bodySm,    // E-003
  },
  generateRetryButton: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  generateRetryText: {
    fontSize: fontSize.bodySm,         // E-003
    fontWeight: fontWeight.semibold,   // E-003
  },

  section: { gap: 10 },
  sectionHeader: {
    fontSize: fontSize.caption,     // E-003
    fontWeight: fontWeight.bold,    // E-003
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },

  planCard: {
    borderRadius: radius.md,
    borderWidth: 1,
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
    fontSize: fontSize.bodyMd,        // E-003
    fontWeight: fontWeight.semibold,  // E-003
    flexShrink: 1,
  },
  planBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  engineBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  engineBadgeText: {
    fontSize: fontSize.caption,   // E-003
    fontWeight: fontWeight.bold,  // E-003
  },
  templateBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  templateBadgeText: {
    fontSize: fontSize.caption,       // E-003
    fontWeight: fontWeight.semibold,  // E-003
  },
  activeBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  activeBadgeText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  activateButton: {
    marginTop: spacing.s2,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: spacing.s1,
    paddingHorizontal: spacing.s3,
    alignSelf: 'flex-start',
    minHeight: 28,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateButtonText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  planCardDate: {
    fontSize: fontSize.caption,   // E-003
    marginTop: 2,
  },
  planCardChevron: {
    fontSize: fontSize.heading3,  // E-003
    marginLeft: 10,
  },

  centered: {
    paddingVertical: spacing.s12,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: fontSize.bodySm,    // E-003
  },
  errorBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.bodySm,    // E-003
  },
  retryButton: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s4,
    paddingVertical: 8,
  },
  retryButtonText: {
    fontSize: fontSize.bodySm,        // E-003
    fontWeight: fontWeight.semibold,  // E-003
  },

  emptyPlansCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyPlansTitle: {
    fontSize: fontSize.bodyMd,        // E-003
    fontWeight: fontWeight.semibold,  // E-003
  },
  emptyPlansSubtitle: {
    fontSize: fontSize.bodySm,  // E-003
    textAlign: 'center',
    lineHeight: 22,
  },

  bottomPad: { height: 32 },
});

// ---------------------------------------------------------------------------
// Styles — plan detail modal
// ---------------------------------------------------------------------------

const detailStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
  },
  headerText: {
    flex: 1,
    gap: 4,
    paddingRight: spacing.s4,
  },
  title: {
    fontSize: fontSize.heading3,  // E-003
    fontWeight: fontWeight.bold,  // E-003
  },
  engineLabel: {
    fontSize: fontSize.bodySm,     // E-003
    fontWeight: fontWeight.medium, // E-003
  },
  closeButton: {
    paddingLeft: spacing.s4,
    minHeight: 44,
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: spacing.s12,
  },
  loadingText: { fontSize: fontSize.bodySm },
  errorText: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
    paddingHorizontal: spacing.s5,
  },
  scrollContent: {
    padding: spacing.s5,
    gap: spacing.s4,
    paddingBottom: spacing.s12,
  },

  // Reasoning card — prominent per spec §5
  reasoningCard: {
    borderRadius: radius.md,
    padding: spacing.s4,
    gap: spacing.s2,
    borderLeftWidth: 3,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  reasoningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  reasoningIcon: {
    fontSize: fontSize.bodyMd,
  },
  reasoningTitle: {
    fontSize: fontSize.bodyMd,        // E-003 — more prominent than before
    fontWeight: fontWeight.semibold,  // E-003
  },
  reasoningText: {
    fontSize: fontSize.bodySm,  // E-003
    lineHeight: 20,
  },

  // Rule trace collapsible
  ruleTraceContainer: {
    marginTop: spacing.s2,
    borderRadius: radius.sm,
    borderWidth: 1,
    overflow: 'hidden',
  },
  ruleTraceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    minHeight: 40,
  },
  ruleTraceTitle: {
    fontSize: fontSize.bodySm,        // E-003
    fontWeight: fontWeight.semibold,  // E-003
  },
  ruleTraceChevron: {
    fontSize: fontSize.caption,       // E-003
  },
  ruleTraceList: {
    paddingHorizontal: spacing.s3,
    paddingBottom: spacing.s3,
    gap: spacing.s2,
  },
  ruleTraceRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    alignItems: 'flex-start',
  },
  ruleTraceBullet: {
    fontSize: fontSize.bodySm,   // E-003
    lineHeight: 20,
    marginTop: 1,
  },
  ruleTraceText: {
    flex: 1,
    fontSize: fontSize.caption,  // E-003
    lineHeight: 18,
  },

  exerciseList: { gap: spacing.s3 },
  sectionHeader: {
    fontSize: fontSize.caption,   // E-003
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  emptyText: {
    fontSize: fontSize.bodySm,  // E-003
    textAlign: 'center',
  },
  exerciseCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.s4,
    gap: spacing.s3,
  },
  exerciseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNumberText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
  },
  exerciseName: {
    flex: 1,
    fontSize: fontSize.bodyMd,        // E-003
    fontWeight: fontWeight.semibold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  statChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    alignItems: 'center',
    minWidth: 56,
  },
  statValue: {
    fontSize: fontSize.bodyMd,        // E-003
    fontWeight: fontWeight.semibold,
  },
  statLabel: {
    fontSize: fontSize.micro,         // E-003
  },
  coachingNote: {
    fontSize: fontSize.bodySm,
    fontStyle: 'italic',
    marginTop: spacing.s2,
    lineHeight: fontSize.bodySm * 1.45,
  },
  pickerRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    paddingBottom: spacing.s1,
  },
  pickerChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    minHeight: 36,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  pickerChipText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.medium,
  },
});
