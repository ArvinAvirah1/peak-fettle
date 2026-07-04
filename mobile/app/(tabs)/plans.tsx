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

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { usePlans } from '../../src/hooks/usePlans';
import { getPlan, activatePlan, regeneratePlan } from '../../src/api/plans';
import type { EngineGenerateResponse } from '../../src/api/plans';
import { Plan, PlanWithStructure, PlanExercise, PlanWeek, PlanWeekSession } from '../../src/types/api';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { haptics } from '../../src/utils/haptics';
import { PFButton, ScreenLayout } from '../../src/components/ui';
import { syncsToServer } from '../../src/data/backup/tierPolicy';
import {
  buildLocalPlanContext,
  type LocalProfileInput,
} from '../../src/lib/trainingEngine';
// ── STAGE-2: engine-v2 active-plan persistence + lifecycle (addendum §2/§3) ──
import { ActivePlanCard } from '../../src/planGen/components/ActivePlanCard';
import {
  loadActivePlan,
  saveActivePlan,
  advanceTrialBlock,
  clearActivePlan,
  type StoredGeneratedPlan,
} from '../../src/planGen/planStore';
import { generateFromSurvey } from '../../src/planGen/generateFromSurvey';
import { adoptPlanToSchedule, hasExistingSchedule } from '../../src/planGen/planAdoption';
import { toDateKey } from '../../src/utils/dateHelpers';
import type { SplitPreference } from '../../src/lib/trainingEngine/v2/types';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// On-device Training Engine — generates plans LOCALLY for ALL tiers (local-first;
// the engine is pure on-device code, so there is no is_paid gate on generation).
// The Pro server path (saved plans + server generate) stays behind
// syncsToServer(user). The require is lazy + guarded so a load failure degrades
// to a friendly empty state instead of crashing the screen.
// ---------------------------------------------------------------------------

interface LocalEngineSlot {
  name?: string;
  exercise_id?: string;
  sets: number;
  reps: string;
  rpe?: number;
  rpe_target?: number;
  rest_seconds: number;
  coaching_note?: string;
  weight_kg?: number | null;
}

interface LocalEngineSession {
  day_label?: string;
  archetype?: string;
  slots?: LocalEngineSlot[];
}

interface LocalEngineWeek {
  week_number: number;
  sessions: LocalEngineSession[];
}

interface LocalEngineResult {
  weeks: LocalEngineWeek[];
  reasoning: string;
  rule_trace: string[];
  engine: string;
}

type LocalEngineModule = {
  generatePlan: (ctx: Record<string, unknown>) => LocalEngineResult;
};

function loadLocalEngine(): LocalEngineModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../src/lib/trainingEngine') as LocalEngineModule;
  } catch {
    return null;
  }
}

/** Map one engine slot → the PlanExercise shape the render components expect. */
function slotToPlanExercise(slot: LocalEngineSlot): PlanExercise {
  const rpe = slot.rpe_target ?? slot.rpe ?? 7;
  return {
    name: slot.name ?? 'Exercise',
    exercise_id: slot.exercise_id ?? null,
    sets: slot.sets ?? 3,
    reps: slot.reps ?? '8-12',
    rpe_target: typeof rpe === 'number' ? rpe : 7,
    rest_seconds: slot.rest_seconds ?? 90,
    coaching_note: slot.coaching_note,
  };
}

/** Map engine weeks → PlanWeek[] (defensive against missing slots/sessions). */
function engineWeeksToPlanWeeks(weeks: LocalEngineWeek[] | undefined): PlanWeek[] {
  if (!Array.isArray(weeks)) return [];
  return weeks.map((w, wi) => ({
    week_number: w?.week_number ?? wi + 1,
    sessions: (w?.sessions ?? []).map((s, si) => ({
      day_label: s?.day_label ?? s?.archetype ?? `Day ${si + 1}`,
      exercises: (s?.slots ?? []).map(slotToPlanExercise),
    })),
  }));
}

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
  const { t } = useTranslation();
  return (
    <View style={[
      styles.upsellCard,
      { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.accentDefault },
    ]}>
      <View style={styles.upsellIconRow}>
        <Text style={styles.upsellIcon}>⚡</Text>
        <Text style={[styles.upsellTitle, { color: theme.colors.textPrimary }]}>
          {t('tabs:plans.upsellTitle')}
        </Text>
      </View>
      <Text style={[styles.upsellBody, { color: theme.colors.textSecondary }]}>
        {t('tabs:plans.upsellBody')}
      </Text>
      <View style={styles.upsellFeatureList}>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('tabs:plans.upsellFeature1')}</Text>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('tabs:plans.upsellFeature2')}</Text>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('tabs:plans.upsellFeature3')}</Text>
        <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('tabs:plans.upsellFeature4')}</Text>
      </View>
      <View style={styles.upsellCTARow}>
        <Text style={[styles.upsellCTALabel, { color: theme.colors.textTertiary }]}>
          {t('tabs:plans.upsellCtaLabel')}
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
  const { t } = useTranslation();
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
          ? t('tabs:plans.activePlanTapToView', { name: plan.name })
          : t('tabs:plans.viewPlan', { name: plan.name })
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
                {t('tabs:plans.active')}
              </Text>
            </View>
          )}
          {plan.is_ai_generated && (
            <View style={[styles.engineBadge, { backgroundColor: theme.colors.accentSecondary }]}>
              <Text style={[styles.engineBadgeText, { color: theme.colors.accentHover }]}>
                {t('tabs:plans.engine')}
              </Text>
            </View>
          )}
          {plan.is_template && (
            <View style={[styles.templateBadge, { backgroundColor: theme.colors.bgElevated }]}>
              <Text style={[styles.templateBadgeText, { color: theme.colors.accentHover }]}>
                {t('tabs:plans.template')}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.planCardDate, { color: theme.colors.textTertiary }]}>
        {plan.is_template ? t('tabs:plans.globalTemplate') : t('tabs:plans.savedOn', { date: formatDate(plan.created_at) })}
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
          accessibilityLabel={t('tabs:plans.setAsActiveLabel', { name: plan.name })}
        >
          {isActivating ? (
            <ActivityIndicator size="small" color={theme.colors.accentDefault} />
          ) : (
            <Text style={[styles.activateButtonText, { color: theme.colors.accentDefault }]}>
              {t('tabs:plans.setAsActive')}
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
  const { t } = useTranslation();
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
      accessibilityLabel={t('tabs:plans.generateNewPlan')}
    >
      {isGenerating ? (
        <View style={styles.generateButtonContent}>
          <ActivityIndicator color={theme.components.buttonPrimaryText} size="small" />
          <Text style={[styles.generateButtonText, { color: theme.components.buttonPrimaryText }]}>
            {t('tabs:plans.buildingYourPlan')}
          </Text>
        </View>
      ) : (
        <View style={styles.generateButtonContent}>
          <Text style={styles.generateButtonIcon}>⚡</Text>
          <View style={styles.generateButtonLabels}>
            <Text style={[styles.generateButtonText, { color: theme.components.buttonPrimaryText }]}>
              {t('tabs:plans.generateMyPlan')}
            </Text>
            <Text style={[styles.generateButtonSub, { color: theme.components.buttonPrimaryText }]}>
              {t('tabs:plans.builtFromPublishedScience')}
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
  const { t } = useTranslation();
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
        accessibilityLabel={expanded ? t('tabs:plans.collapseRuleTrace') : t('tabs:plans.expandRuleTrace')}
        accessibilityState={{ expanded }}
      >
        <Text style={[detailStyles.ruleTraceTitle, { color: theme.colors.textSecondary }]}>
          {t('tabs:plans.heresWhy')}
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
  const { t } = useTranslation();
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
        setError(err instanceof Error ? err.message : t('tabs:plans.failedToLoadPlan'))
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
      const msg = err instanceof Error ? err.message : t('tabs:plans.regenerationFailed');
      Alert.alert(t('tabs:plans.regenerationFailed'), msg);
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
      <SafeAreaView style={[detailStyles.container, { backgroundColor: theme.colors.bgPrimary }]} edges={['top', 'bottom']}>
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
                    {t('tabs:plans.engineEvidenceBased')}
                  </Text>
                ) : null}
                <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm, marginTop: spacing.s1 }}>
                  {t('tabs:plans.personalisedForGoals')}
                </Text>
              </>
            ) : (
              <Text style={[detailStyles.title, { color: theme.colors.textPrimary }]}>{t('tabs:plans.planFallbackTitle')}</Text>
            )}
          </View>
          <TouchableOpacity
            style={detailStyles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('tabs:plans.closePlanDetail')}
          >
            <Text style={[detailStyles.closeButtonText, { color: theme.colors.accentDefault }]}>{t('tabs:plans.done')}</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={detailStyles.centered}>
            <ActivityIndicator size="large" color={theme.colors.accentDefault} />
            <Text style={[detailStyles.loadingText, { color: theme.colors.textTertiary }]}>{t('tabs:plans.loadingPlan')}</Text>
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
                    {t('tabs:plans.yourPlanExplained')}
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
                      accessibilityLabel={t('tabs:plans.viewWeek', { week: week.week_number })}
                    >
                      <Text style={[
                        detailStyles.pickerChipText,
                        { color: idx === selectedWeek ? theme.colors.accentDefault : theme.colors.textSecondary },
                      ]}>
                        {t('tabs:plans.weekLabel', { week: week.week_number })}
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
                      accessibilityLabel={t('tabs:plans.viewSession', { label: session.day_label })}
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
                <Text style={[detailStyles.sectionHeader, { color: theme.colors.textTertiary }]}>{t('tabs:plans.exercisesSectionHeader')}</Text>
                {exercises.map((ex, idx) => (
                  <ExerciseRow key={`${ex.name}-${idx}`} exercise={ex} index={idx} />
                ))}
              </View>
            ) : (
              <View style={detailStyles.centered}>
                <Text style={[detailStyles.emptyText, { color: theme.colors.textTertiary }]}>
                  {t('tabs:plans.noExercisesInPlan')}
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
              label={t('tabs:plans.startThisWorkout')}
              onPress={() => {
                onClose();
                router.push('/(tabs)?startWorkout=1');
              }}
            />
            <PFButton
              variant="ghost"
              label={isRegenerating ? t('tabs:plans.regenerating') : t('tabs:plans.regeneratePlan')}
              onPress={handleRegenerate}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Local plan detail modal — renders an IN-MEMORY engine result (no server fetch).
// Used for the on-device, all-tier plan. Mirrors PlanDetailModal's layout but is
// driven by the engine output directly.
// ---------------------------------------------------------------------------

interface LocalPlanModalProps {
  plan: LocalEngineResult;
  onClose: () => void;
  onRegenerate: () => void;
  isRegenerating: boolean;
}

function LocalPlanModal({ plan, onClose, onRegenerate, isRegenerating }: LocalPlanModalProps): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedWeek, setSelectedWeek] = React.useState(0);
  const [selectedDay, setSelectedDay] = React.useState(0);

  const weeks = React.useMemo(() => engineWeeksToPlanWeeks(plan?.weeks), [plan]);
  const reasoning = plan?.reasoning ?? '';
  const ruleTrace = plan?.rule_trace ?? [];
  const currentWeekSessions: PlanWeekSession[] = weeks[selectedWeek]?.sessions ?? [];
  const exercises: PlanExercise[] = currentWeekSessions[selectedDay]?.exercises ?? [];

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[detailStyles.container, { backgroundColor: theme.colors.bgPrimary }]} edges={['top', 'bottom']}>
        {/* Header — paddingTop applied directly (safe-area does NOT propagate into a Modal) */}
        <View style={[
          detailStyles.header,
          { borderBottomColor: theme.colors.bgSecondary, paddingTop: Math.max(insets.top, 12) },
        ]}>
          <View style={detailStyles.headerText}>
            <Text style={[detailStyles.title, { color: theme.colors.textPrimary }]} numberOfLines={2}>
              {t('tabs:plans.yourTrainingPlan')}
            </Text>
            <Text style={[detailStyles.engineLabel, { color: theme.colors.textTertiary }]}>
              {t('tabs:plans.engineBuiltOnDevice')}
            </Text>
          </View>
          <TouchableOpacity
            style={detailStyles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('tabs:plans.closePlanDetail')}
          >
            <Text style={[detailStyles.closeButtonText, { color: theme.colors.accentDefault }]}>{t('tabs:plans.done')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={detailStyles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Reasoning */}
          {reasoning ? (
            <View style={[
              detailStyles.reasoningCard,
              { backgroundColor: theme.colors.bgSecondary, borderLeftColor: theme.colors.accentDefault },
            ]}>
              <View style={detailStyles.reasoningHeader}>
                <Text style={detailStyles.reasoningIcon}>📋</Text>
                <Text style={[detailStyles.reasoningTitle, { color: theme.colors.accentHover }]}>
                  {t('tabs:plans.yourPlanExplained')}
                </Text>
              </View>
              <Text style={[detailStyles.reasoningText, { color: theme.colors.textSecondary }]}>
                {reasoning}
              </Text>
              {ruleTrace.length > 0 && <RuleTraceCollapsible ruleTrace={ruleTrace} />}
            </View>
          ) : null}

          {/* Week picker */}
          {weeks.length > 1 && (
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
                    accessibilityLabel={t('tabs:plans.viewWeek', { week: week.week_number })}
                  >
                    <Text style={[
                      detailStyles.pickerChipText,
                      { color: idx === selectedWeek ? theme.colors.accentDefault : theme.colors.textSecondary },
                    ]}>
                      {t('tabs:plans.weekLabel', { week: week.week_number })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Day picker */}
          {currentWeekSessions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={detailStyles.pickerRow}>
                {currentWeekSessions.map((session, idx) => (
                  <TouchableOpacity
                    key={`${session.day_label}-${idx}`}
                    style={[
                      detailStyles.pickerChip,
                      { borderColor: idx === selectedDay ? theme.colors.accentDefault : theme.colors.borderDefault },
                      idx === selectedDay && { backgroundColor: theme.colors.accentDefault + '22' },
                    ]}
                    onPress={() => setSelectedDay(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={t('tabs:plans.viewSession', { label: session.day_label })}
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

          {/* Exercises */}
          {exercises.length > 0 ? (
            <View style={detailStyles.exerciseList}>
              <Text style={[detailStyles.sectionHeader, { color: theme.colors.textTertiary }]}>{t('tabs:plans.exercisesSectionHeader')}</Text>
              {exercises.map((ex, idx) => (
                <ExerciseRow key={`${ex.name}-${idx}`} exercise={ex} index={idx} />
              ))}
            </View>
          ) : (
            <View style={detailStyles.centered}>
              <Text style={[detailStyles.emptyText, { color: theme.colors.textTertiary }]}>
                {t('tabs:plans.noExercisesGenerated')}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: spacing.s5, paddingBottom: Math.max(insets.bottom, spacing.s5), paddingTop: spacing.s3, gap: spacing.s2 }}>
          <PFButton
            variant="primary"
            label={t('tabs:plans.startThisWorkout')}
            onPress={() => {
              onClose();
              router.push('/(tabs)?startWorkout=1');
            }}
          />
          <PFButton
            variant="ghost"
            label={isRegenerating ? t('tabs:plans.regenerating') : t('tabs:plans.regeneratePlan')}
            onPress={onRegenerate}
          />
        </View>
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
  const { t } = useTranslation();
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
        <StatChip label={t('tabs:plans.setsLabel')} value={String(exercise.sets)} />
        <StatChip label={t('tabs:plans.repsLabel')} value={exercise.reps} />
        <StatChip label={t('tabs:plans.rpeLabel')} value={String(exercise.rpe_target)} valueStyle={rpeStyle} />
        <StatChip label={t('tabs:plans.restLabel')} value={restLabel(exercise.rest_seconds)} />
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
  const { t } = useTranslation();
  const router = useRouter();

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

  // ── On-device (local-first) plan generation — for ALL tiers ──────────────
  const proSync = syncsToServer(user);
  const [localPlan, setLocalPlan] = useState<LocalEngineResult | null>(null);
  const [showLocalPlan, setShowLocalPlan] = useState(false);
  const [isGeneratingLocal, setIsGeneratingLocal] = useState(false);
  const [localGenError, setLocalGenError] = useState<string | null>(null);

  // ── STAGE-2: the persisted active engine-v2 plan / trial sequence ──────────
  const [activePlan, setActivePlan] = useState<StoredGeneratedPlan | null>(null);
  // Today's day-key, resolved from the real clock HERE (UI layer), never inside
  // plan logic — the trial lifecycle derivation is pure and clock-injected.
  const todayKey = toDateKey(new Date());
  const reloadActive = useCallback(async () => {
    setActivePlan(await loadActivePlan(user));
  }, [user]);
  useEffect(() => { reloadActive(); }, [reloadActive]);

  // Regenerate a full single plan on a chosen split from the SAVED SurveyAnswers,
  // persist as the adopted main plan, integrate into the calendar, and redirect
  // to the schedule screen (addendum §2 adoption path). Deterministic: the split
  // is forced and the survey is otherwise unchanged.
  const adoptSplit = useCallback(async (survey: StoredGeneratedPlan['survey'], split: SplitPreference) => {
    const forced = { ...survey, splitPreference: split };
    const res = generateFromSurvey(forced, user?.id, { now: new Date() });
    if (res.kind !== 'plan') return; // forcing a concrete split always yields a plan
    const userIdStr = user?.id != null ? String(user.id) : null;
    await saveActivePlan(
      { userId: userIdStr, plan: res.plan, survey: forced, status: 'plan_adopted' },
      new Date(),
    );
    const proceed = async () => {
      try {
        await adoptPlanToSchedule(user, userIdStr ?? 'local', res.plan, forced.trainingDays, new Date());
      } catch {
        // best-effort; the plan is saved regardless
      }
      router.push('/routines');
    };
    if (await hasExistingSchedule()) {
      Alert.alert(
        t('tabs:plans.replaceScheduleTitle'),
        t('tabs:plans.replaceScheduleMessage'),
        [
          { text: t('tabs:plans.keep'), style: 'cancel', onPress: () => reloadActive() },
          { text: t('tabs:plans.replace'), style: 'destructive', onPress: proceed },
        ],
        { cancelable: true },
      );
    } else {
      await proceed();
    }
    await reloadActive();
  }, [user, router, reloadActive, t]);

  const handleAdoptPlan = useCallback(async () => {
    if (!activePlan?.plan) return;
    const userIdStr = user?.id != null ? String(user.id) : null;
    await saveActivePlan(
      { userId: userIdStr, plan: activePlan.plan, survey: activePlan.survey, status: 'plan_adopted' },
      new Date(),
    );
    const proceed = async () => {
      try {
        await adoptPlanToSchedule(user, userIdStr ?? 'local', activePlan.plan!, activePlan.survey.trainingDays, new Date());
      } catch { /* best-effort */ }
      router.push('/routines');
    };
    if (await hasExistingSchedule()) {
      Alert.alert(
        t('tabs:plans.replaceScheduleTitle'),
        t('tabs:plans.replaceScheduleMessage'),
        [
          { text: t('tabs:plans.keep'), style: 'cancel', onPress: () => reloadActive() },
          { text: t('tabs:plans.replace'), style: 'destructive', onPress: proceed },
        ],
        { cancelable: true },
      );
    } else {
      await proceed();
    }
    await reloadActive();
  }, [activePlan, user, router, reloadActive, t]);

  const handleContinueBlock = useCallback(async () => {
    await advanceTrialBlock(new Date());
    await reloadActive();
  }, [reloadActive]);

  const handleDiscardActive = useCallback(() => {
    Alert.alert(
      t('tabs:plans.discardPlanTitle'),
      t('tabs:plans.discardPlanMessage'),
      [
        { text: t('tabs:plans.cancel'), style: 'cancel' },
        {
          text: t('tabs:plans.discard'),
          style: 'destructive',
          onPress: async () => { await clearActivePlan(); await reloadActive(); },
        },
      ],
      { cancelable: true },
    );
  }, [reloadActive, t]);

  /**
   * Generate a plan ENTIRELY ON-DEVICE from the survey profile + local history.
   * No is_paid gate (the engine is pure local code); no personal REST call. Wrapped
   * defensively so any failure shows a friendly error rather than crashing.
   */
  const handleGenerateLocal = useCallback(async () => {
    setIsGeneratingLocal(true);
    setLocalGenError(null);
    haptics.medium();
    try {
      const engine = loadLocalEngine();
      if (!engine) throw new Error('engine_unavailable');

      const u = (user ?? {}) as Record<string, unknown>;
      const profile: LocalProfileInput = {
        experience_level: (u.experience_level as string | null) ?? null,
        sex: (u.sex as string | null) ?? null,
        age_band: (u.age_band as string | null) ?? null,
        weight_class_kg: (u.weight_class_kg as number | null) ?? null,
        training_goal: (u.training_goal as string | null) ?? null,
        sessions_per_week: (u.sessions_per_week as number | null) ?? null,
        session_minutes: (u.session_minutes as number | null) ?? null,
        goal_weight_kg: (u.goal_weight_kg as number | null) ?? null,
        equipment_profile: (u.equipment_profile as string[] | null) ?? null,
        season_phase: (u.season_phase as string | null) ?? null,
        primary_discipline: (u.primary_discipline as string | null) ?? null,
        id: (u.id as string | number | null) ?? null,
      };

      const ctx = await buildLocalPlanContext(profile);
      const result = engine.generatePlan(ctx as unknown as Record<string, unknown>);

      setLocalPlan(result);
      setShowLocalPlan(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      const isNoProfile = !((user as Record<string, unknown> | null)?.training_goal);
      setLocalGenError(
        isNoProfile
          ? t('tabs:plans.noProfileSetupError')
          : t('tabs:plans.couldNotBuildPlan')
      );
    } finally {
      setIsGeneratingLocal(false);
    }
  }, [user, t]);

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
        const message = err instanceof Error ? err.message : t('tabs:plans.couldNotSetActivePlan');
        Alert.alert(t('tabs:plans.activationFailedTitle'), message);
      } finally {
        setActivatingPlanId(null);
      }
    },
    [activatingPlanId, refetch, t]
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
          t('tabs:plans.proFeatureTitle'),
          t('tabs:plans.proFeatureMessage')
        );
      }
    }
  }, [generate, t]);

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
        {/* ── A. Generate CTA — on-device engine, ALL tiers (local-first) ── */}
        <View style={styles.generateSection}>
          <GenerateCTA onPress={handleGenerateLocal} isGenerating={isGeneratingLocal} />
          {/* Deep plan-builder survey (Pro). Free users see its upsell on push. */}
          <TouchableOpacity
            style={[styles.planBuilderButton, { borderColor: theme.colors.accentDefault }]}
            onPress={() => router.push('/plan-survey')}
            accessibilityRole="button"
            accessibilityLabel={t('tabs:plans.openDeepPlanBuilder')}
          >
            <Text style={[styles.planBuilderText, { color: theme.colors.accentDefault }]}>
              {syncsToServer(user) ? t('tabs:plans.buildDetailedPlanPro') : t('tabs:plans.generatePlanPro')}
            </Text>
          </TouchableOpacity>
          {localPlan && !showLocalPlan ? (
            <TouchableOpacity
              style={[
                styles.viewLastPlanButton,
                { borderColor: theme.colors.accentDefault },
              ]}
              onPress={() => setShowLocalPlan(true)}
              accessibilityRole="button"
              accessibilityLabel={t('tabs:plans.viewLastGeneratedPlan')}
            >
              <Text style={[styles.viewLastPlanText, { color: theme.colors.accentDefault }]}>
                {t('tabs:plans.viewYourLatestPlan')}
              </Text>
            </TouchableOpacity>
          ) : null}
          {localGenError ? (
            <View style={[
              styles.generateErrorBanner,
              { backgroundColor: theme.colors.statusError + '18', borderColor: theme.colors.statusError + '60' },
            ]}>
              <Text style={[styles.generateErrorText, { color: theme.colors.statusError }]}>{localGenError}</Text>
              <TouchableOpacity
                style={styles.generateRetryButton}
                onPress={() => router.push('/training-survey' as never)}
                accessibilityRole="button"
                accessibilityLabel={t('tabs:plans.openTrainingProfile')}
              >
                <Text style={[styles.generateRetryText, { color: theme.colors.statusError }]}>{t('tabs:plans.setUp')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* ── STAGE-2: active engine-v2 plan / trial lifecycle surface ── */}
        {activePlan ? (
          <View style={{ paddingHorizontal: spacing.s4 }}>
            <ActivePlanCard
              stored={activePlan}
              todayKey={todayKey}
              onAdoptPlan={handleAdoptPlan}
              onRequestChanges={() => router.push('/plan-adjust')}
              onAdoptSplit={(split) => { void adoptSplit(activePlan.survey, split); }}
              onContinueToNextBlock={handleContinueBlock}
              onDiscard={handleDiscardActive}
            />
          </View>
        ) : null}

        {/* ── B. Pro-only soft upsell (cross-device sync), shown for free tier ── */}
        {!proSync && <UpsellCard />}

        {/* ── C. Server-saved plan list (Pro only — server is the source of truth) ── */}
        {proSync ? (
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.colors.accentDefault} />
              <Text style={[styles.loadingText, { color: theme.colors.textTertiary }]}>{t('tabs:plans.loadingPlans')}</Text>
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
                accessibilityLabel={t('tabs:plans.retryLoadingPlans')}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.textPrimary }]}>{t('tabs:plans.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {userPlans.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>{t('tabs:plans.savedPlansSectionHeader')}</Text>
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
              ) : null}

              {templates.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionHeader, { color: theme.colors.textTertiary }]}>{t('tabs:plans.templatesSectionHeader')}</Text>
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
          )
        ) : null}

        {/* Browse the static workout templates — available to all tiers. */}
        <View style={{ paddingHorizontal: spacing.s4, paddingBottom: spacing.s3 }}>
          <PFButton
            variant="ghost"
            label={t('tabs:plans.browseWorkoutTemplates')}
            onPress={() => router.push('/templates')}
          />
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* ── D. Server plan detail modal (Pro) ── */}
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

      {/* ── E. Local (on-device) plan detail modal — all tiers ── */}
      {showLocalPlan && localPlan ? (
        <LocalPlanModal
          plan={localPlan}
          isRegenerating={isGeneratingLocal}
          onClose={() => setShowLocalPlan(false)}
          onRegenerate={handleGenerateLocal}
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
  viewLastPlanButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  viewLastPlanText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  planBuilderButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  planBuilderText: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
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
