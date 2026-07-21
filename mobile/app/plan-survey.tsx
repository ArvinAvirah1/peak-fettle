/**
 * plan-survey.tsx — Pro deep plan-generation survey (Stage 1).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 §1/§2/§6. Tapping "Generate plan (Pro)"
 * launches this multi-step wizard, pre-filled from the user's profile. On the
 * final step it calls the on-device v2 engine (generateFromSurvey) and shows a
 * PREVIEW — a single plan's week-1 breakdown, or the three trial blocks.
 *
 * Local-first invariant: the feature is Pro-only, but generation is fully
 * ON-DEVICE (no personal REST call). We only READ the profile via the
 * tier-branched loadLocalProfile() + the in-memory user (no raw api/*).
 *
 * Persistence: the app has NO tier-branched local plan store today (on-device
 * plans live only in-memory on the Plans tab; server plans are Pro-server-only).
 * Wiring "Save plan" would require a new local schema + a server contract, so
 * Stage 1 STOPS at preview — see the // STAGE-2 note near the preview actions.
 * =============================================================================
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout, PFButton } from '../src/components/ui';
import { loadLocalProfile } from '../src/data/profile';
import { parseWeightInput, displayToKg, type UnitSystem } from '../src/constants/units';
import {
  DEFAULT_SURVEY_ANSWERS,
  type SurveyAnswers,
  type SurveyGoal,
  type ExperienceLevel,
  type SessionMinutes,
} from '../src/planGen/surveyTypes';
import { generateFromSurvey, type SurveyGenerationResult } from '../src/planGen/generateFromSurvey';
import {
  Section,
  OptionCard,
  Chip,
  MultiChip,
  NumberField,
  TextField,
  Hint,
  ProgressDots,
} from '../src/planGen/steps/SurveyControls';
import {
  GOAL_OPTIONS,
  EXPERIENCE_OPTIONS,
  SPLIT_OPTIONS,
  SPLIT_EXPLAINER,
  SESSION_MINUTE_OPTIONS,
  DAY_OPTIONS,
  EQUIPMENT_OPTIONS,
  PRIORITY_OPTIONS,
  INJURY_OPTIONS,
  SPORT_OPTIONS,
  SEASON_OPTIONS,
  FAILURE_OPTIONS,
  PROGRESSION_OPTIONS,
  DELOAD_OPTIONS,
  KNOB_SAFETY_NOTE,
} from '../src/planGen/steps/surveyConfig';
import { SinglePlanPreview, TrialSequencePreview } from '../src/planGen/steps/PlanPreview';
import { saveActivePlan, saveActiveTrial } from '../src/planGen/planStore';
import { adoptPlanToSchedule, hasExistingSchedule } from '../src/planGen/planAdoption';
import { toDateKey } from '../src/utils/dateHelpers';

// Map the LEGACY profile training_goal (5-goal server taxonomy) onto a v2 goal,
// as a best-effort PRE-FILL default only (the user can change it in step 1).
function legacyGoalToV2(goal: string | null | undefined): SurveyGoal | null {
  switch (goal) {
    case 'hypertrophy': return 'hypertrophy';
    case 'strength': return 'strength_powerlifting';
    case 'sport_performance': return 'athletic_power';
    case 'endurance':
    case 'general_fitness': return 'general_fitness';
    default: return null;
  }
}

const V2_EXPERIENCE = new Set<ExperienceLevel>(['beginner', 'novice', 'intermediate', 'advanced', 'elite']);
const V2_MINUTES = new Set<SessionMinutes>([15, 30, 45, 60, 75, 90, 120]);

// ── Toggle helper for Set-backed multi-selects ──
function toggleSet<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

// ── Step identifiers ──
type StepId =
  | 'goal'
  | 'sport'
  | 'experience'
  | 'schedule'
  | 'split'
  | 'equipment'
  | 'focus'
  | 'lifts'
  | 'meet'
  | 'knobs'
  | 'preview';

export default function PlanSurveyScreen(): React.ReactElement {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const isPaid = !!user?.is_paid;

  // ── Pro gate — render the upsell WITHOUT importing/executing the engine. ──
  if (!isPaid) {
    return <ProUpsell onBack={() => router.back()} />;
  }

  return <PlanSurveyWizard />;
}

// ---------------------------------------------------------------------------
// Pro upsell (free tier) — no engine import is executed on this path.
// ---------------------------------------------------------------------------

function ProUpsell({ onBack }: { onBack: () => void }): React.ReactElement {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ScreenLayout edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.upsellScroll}>
        <View
          style={[
            styles.upsellCard,
            { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.accentDefault },
          ]}
        >
          <Text style={styles.upsellIcon}>⚡</Text>
          <Text style={[styles.upsellTitle, { color: theme.colors.textPrimary }]}>
            {t('screens2:planSurvey.upsellTitle')}
          </Text>
          <Text style={[styles.upsellBody, { color: theme.colors.textSecondary }]}>
            {t('screens2:planSurvey.upsellBody')}
          </Text>
          <View style={styles.upsellFeatures}>
            <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('screens2:planSurvey.upsellFeature1')}</Text>
            <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('screens2:planSurvey.upsellFeature2')}</Text>
            <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('screens2:planSurvey.upsellFeature3')}</Text>
            <Text style={[styles.upsellFeature, { color: theme.colors.accentHover }]}>{t('screens2:planSurvey.upsellFeature4')}</Text>
          </View>
        </View>
        <PFButton variant="ghost" label={t('screens2:planSurvey.maybeLater')} onPress={onBack} fullWidth />
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// The wizard (Pro users only — reached past the gate above).
// ---------------------------------------------------------------------------

function PlanSurveyWizard(): React.ReactElement {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const { t } = useTranslation();

  // TICKET-146 (B6 handoff wiring): survey option labels/subtitles render
  // through misc:surveyConfig keys; the pure-data English stays the fallback.
  const optionLabel = (prefix: string, o: { value: string | number; label: string }): string =>
    t(`misc:surveyConfig.${prefix}_${o.value}.label` as never, { defaultValue: o.label }) as string;
  const optionSubtitle = (prefix: string, o: { value: string | number; subtitle?: string }): string | undefined =>
    o.subtitle == null
      ? undefined
      : (t(`misc:surveyConfig.${prefix}_${o.value}.subtitle` as never, { defaultValue: o.subtitle }) as string);


  const unitPref: UnitSystem = (user?.unit_pref as UnitSystem) ?? 'kg';

  // Seed answers from the in-memory user, then hydrate empty fields from the
  // on-device profile (free/local-first survey answers live only in SQLite).
  const [answers, setAnswers] = useState<SurveyAnswers>(() => {
    const u = (user ?? {}) as Record<string, unknown>;
    const goal = legacyGoalToV2(u.training_goal as string | null);
    const exp = u.experience_level as ExperienceLevel | undefined;
    const spw = u.sessions_per_week as number | undefined;
    const mins = u.session_minutes as SessionMinutes | undefined;
    return {
      ...DEFAULT_SURVEY_ANSWERS,
      knobs: { ...DEFAULT_SURVEY_ANSWERS.knobs },
      goal: goal ?? DEFAULT_SURVEY_ANSWERS.goal,
      experienceLevel: exp && V2_EXPERIENCE.has(exp) ? exp : DEFAULT_SURVEY_ANSWERS.experienceLevel,
      daysPerWeek: typeof spw === 'number' ? spw : DEFAULT_SURVEY_ANSWERS.daysPerWeek,
      sessionMinutes: mins && V2_MINUTES.has(mins) ? mins : DEFAULT_SURVEY_ANSWERS.sessionMinutes,
      sex: (u.sex as 'M' | 'F' | null) ?? null,
      equipment: Array.isArray(u.equipment_profile) ? (u.equipment_profile as string[]) : [],
      injuries: Array.isArray(u.injuries) ? (u.injuries as string[]) : [],
      musclePriorities: Array.isArray(u.muscle_priorities) ? (u.muscle_priorities as string[]) : [],
      trainingDays: Array.isArray(u.training_days) ? (u.training_days as number[]) : [],
    };
  });

  // Hydrate from on-device profile once (fills EMPTY fields only).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;
    (async () => {
      const saved = await loadLocalProfile().catch(() => null);
      if (!saved || cancelled) return;
      setAnswers((cur) => ({
        ...cur,
        goal: cur.goal !== DEFAULT_SURVEY_ANSWERS.goal ? cur.goal : legacyGoalToV2(saved.training_goal) ?? cur.goal,
        experienceLevel:
          cur.experienceLevel !== DEFAULT_SURVEY_ANSWERS.experienceLevel
            ? cur.experienceLevel
            : saved.experience_level && V2_EXPERIENCE.has(saved.experience_level as ExperienceLevel)
              ? (saved.experience_level as ExperienceLevel)
              : cur.experienceLevel,
        daysPerWeek: cur.daysPerWeek !== DEFAULT_SURVEY_ANSWERS.daysPerWeek ? cur.daysPerWeek : saved.sessions_per_week ?? cur.daysPerWeek,
        sessionMinutes:
          cur.sessionMinutes !== DEFAULT_SURVEY_ANSWERS.sessionMinutes
            ? cur.sessionMinutes
            : saved.session_minutes && V2_MINUTES.has(saved.session_minutes as SessionMinutes)
              ? (saved.session_minutes as SessionMinutes)
              : cur.sessionMinutes,
        sex: cur.sex ?? (saved.sex as 'M' | 'F' | null) ?? null,
        birthDate: cur.birthDate ?? saved.birth_date ?? null,
        bodyweightKg: cur.bodyweightKg ?? saved.bodyweight_kg ?? null,
        equipment: cur.equipment.length > 0 ? cur.equipment : saved.equipment_profile ?? [],
        injuries: cur.injuries.length > 0 ? cur.injuries : saved.injuries ?? [],
        musclePriorities: cur.musclePriorities.length > 0 ? cur.musclePriorities : saved.muscle_priorities ?? [],
        trainingDays: cur.trainingDays.length > 0 ? cur.trainingDays : saved.training_days ?? [],
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Bodyweight / 1RM text fields (entered in the user's unit, stored as kg) ──
  const [bwInput, setBwInput] = useState('');
  const [squatInput, setSquatInput] = useState('');
  const [benchInput, setBenchInput] = useState('');
  const [deadliftInput, setDeadliftInput] = useState('');
  const [ohpInput, setOhpInput] = useState('');
  const [weeksToMeetInput, setWeeksToMeetInput] = useState('');

  const patch = useCallback((p: Partial<SurveyAnswers>) => setAnswers((cur) => ({ ...cur, ...p })), []);

  // ── Dynamic step list (branches appear conditionally) ──
  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = ['goal'];
    if (answers.goal === 'team_sport') s.push('sport');
    s.push('experience', 'schedule', 'split', 'equipment', 'focus', 'lifts');
    if (answers.goal === 'strength_powerlifting') s.push('meet');
    s.push('knobs', 'preview');
    return s;
  }, [answers.goal]);

  const [stepIdx, setStepIdx] = useState(0);
  const clampedIdx = Math.min(stepIdx, steps.length - 1);
  const currentStep = steps[clampedIdx] ?? 'goal';

  const [result, setResult] = useState<SurveyGenerationResult | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  // STAGE-2: the exact answers that produced `result` (persisted alongside the
  // plan so it can be regenerated on adoption / meta-change).
  const [finalAnswers, setFinalAnswers] = useState<SurveyAnswers | null>(null);
  const [saving, setSaving] = useState(false);

  const goNext = useCallback(() => setStepIdx((i) => Math.min(i + 1, steps.length - 1)), [steps.length]);
  const goBack = useCallback(() => {
    if (clampedIdx === 0) { router.back(); return; }
    setStepIdx((i) => Math.max(i - 1, 0));
  }, [clampedIdx, router]);

  // ── Commit the text fields into the typed answers, then generate. ──
  const handleGenerate = useCallback(() => {
    setGenError(null);
    try {
      const toKg = (t: string): number | null => {
        const p = parseWeightInput(t);
        return p != null && p > 0 ? displayToKg(p, unitPref) : null;
      };
      const bodyweightKg = toKg(bwInput) ?? answers.bodyweightKg ?? null;
      const lifts = {
        squat: toKg(squatInput),
        bench: toKg(benchInput),
        deadlift: toKg(deadliftInput),
        ohp: toKg(ohpInput),
      };
      const hasLift = Object.values(lifts).some((v) => v != null);
      const weeksToMeet = parseInt(weeksToMeetInput, 10);
      const meet =
        answers.goal === 'strength_powerlifting' && Number.isFinite(weeksToMeet) && weeksToMeet > 0
          ? { weeksToMeet, targetSquatKg: lifts.squat, targetBenchKg: lifts.bench, targetDeadliftKg: lifts.deadlift }
          : null;

      const finalAnswers: SurveyAnswers = {
        ...answers,
        bodyweightKg,
        lifts: hasLift ? lifts : answers.lifts ?? null,
        meet,
      };
      const res = generateFromSurvey(finalAnswers, user?.id, { now: new Date() });
      setResult(res);
      setFinalAnswers(finalAnswers);
      goNext();
    } catch {
      setGenError(t('screens2:planSurvey.genError'));
    }
  }, [answers, bwInput, squatInput, benchInput, deadliftInput, ohpInput, weeksToMeetInput, unitPref, user?.id, goNext]);

  // ── STAGE-2: persist the generated plan / trial sequence, then route on. ──
  const userIdStr = user?.id != null ? String(user.id) : null;

  const handleSavePlan = useCallback(async () => {
    if (saving || !finalAnswers || result?.kind !== 'plan') return;
    setSaving(true);
    try {
      const now = new Date();
      await saveActivePlan(
        { userId: userIdStr, plan: result.plan, survey: finalAnswers, status: 'plan_saved' },
        now,
      );
      // Offer to add it to the calendar now (adoption + redirect per addendum §2).
      Alert.alert(
        t('screens2:planSurvey.planSavedTitle'),
        t('screens2:planSurvey.planSavedBody'),
        [
          { text: t('screens2:planSurvey.later'), style: 'cancel', onPress: () => router.replace('/plans') },
          {
            text: t('screens2:planSurvey.addToCalendar'),
            onPress: async () => {
              const proceed = async () => {
                try {
                  await saveActivePlan(
                    { userId: userIdStr, plan: result.plan, survey: finalAnswers, status: 'plan_adopted' },
                    new Date(),
                  );
                  await adoptPlanToSchedule(user, userIdStr ?? 'local', result.plan, finalAnswers.trainingDays, new Date());
                } catch {
                  // best-effort; the plan is saved regardless
                }
                router.replace('/routines');
              };
              // Never clobber an existing schedule silently.
              if (await hasExistingSchedule()) {
                Alert.alert(
                  t('screens2:planSurvey.replaceScheduleTitle'),
                  t('screens2:planSurvey.replaceScheduleBody'),
                  [
                    { text: t('screens2:planSurvey.keep'), style: 'cancel', onPress: () => router.replace('/plans') },
                    { text: t('screens2:planAdjust.replace'), style: 'destructive', onPress: proceed },
                  ],
                  { cancelable: true },
                );
              } else {
                await proceed();
              }
            },
          },
        ],
        { cancelable: true },
      );
    } finally {
      setSaving(false);
    }
  }, [saving, finalAnswers, result, userIdStr, user, router]);

  const handleStartTrials = useCallback(async () => {
    if (saving || !finalAnswers || result?.kind !== 'trial') return;
    setSaving(true);
    try {
      const now = new Date();
      await saveActiveTrial(
        { userId: userIdStr, sequence: result.sequence, survey: finalAnswers, startDayKey: toDateKey(now) },
        now,
      );
      router.replace('/plans');
    } finally {
      setSaving(false);
    }
  }, [saving, finalAnswers, result, userIdStr, router]);

  const unitSuffix = unitPref === 'lbs' ? 'lbs' : 'kg';

  return (
    <ScreenLayout horizontalPadding={false} edges={['bottom']}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <ProgressDots total={steps.length} current={clampedIdx} />

        {/* ── STEP CONTENT ── */}
        {currentStep === 'goal' && (
          <Section title={t('screens2:planSurvey.goalTitle')} subtitle={t('screens2:planSurvey.goalSubtitle')}>
            <View style={styles.optionGroup}>
              {GOAL_OPTIONS.map((o) => (
                <OptionCard key={o.value} label={optionLabel('goal', o)} subtitle={optionSubtitle('goal', o)} value={o.value} selected={answers.goal === o.value} onPress={(v) => patch({ goal: v })} />
              ))}
            </View>
            {answers.goal === 'general_fitness' && (
              <MultiChip label={t('screens2:planSurvey.fatLossEmphasis')} selected={answers.fatLossEmphasis} onPress={() => patch({ fatLossEmphasis: !answers.fatLossEmphasis })} />
            )}
          </Section>
        )}

        {currentStep === 'sport' && (
          <View style={styles.stepGap}>
            <Section title={t('screens2:planSurvey.sportTitle')} subtitle={t('screens2:planSurvey.sportSubtitle')}>
              <View style={styles.chipGrid}>
                {SPORT_OPTIONS.map((o) => (
                  <Chip key={o.value} label={optionLabel('sport', o)} selected={answers.sport === o.value} onPress={() => patch({ sport: o.value })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planSurvey.seasonPhaseTitle')}>
              <View style={styles.optionGroup}>
                {SEASON_OPTIONS.map((o) => (
                  <OptionCard key={o.value} label={optionLabel('season', o)} subtitle={optionSubtitle('season', o)} value={o.value} selected={answers.seasonPhase === o.value} onPress={(v) => patch({ seasonPhase: v })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planSurvey.gameDayTitle')} subtitle={t('screens2:planSurvey.gameDaySubtitle')}>
              <View style={styles.chipGrid}>
                {DAY_OPTIONS.map((o) => (
                  <Chip key={o.value} label={optionLabel('day', o)} selected={answers.gameDay === o.value} onPress={() => patch({ gameDay: answers.gameDay === o.value ? null : o.value })} />
                ))}
              </View>
            </Section>
          </View>
        )}

        {currentStep === 'experience' && (
          <Section title={t('screens2:planSurvey.experienceTitle')} subtitle={t('screens2:planSurvey.experienceSubtitle')}>
            <View style={styles.optionGroup}>
              {EXPERIENCE_OPTIONS.map((o) => (
                <OptionCard key={o.value} label={optionLabel('experience', o)} subtitle={optionSubtitle('experience', o)} value={o.value} selected={answers.experienceLevel === o.value} onPress={(v) => patch({ experienceLevel: v })} />
              ))}
            </View>
          </Section>
        )}

        {currentStep === 'schedule' && (
          <View style={styles.stepGap}>
            <Section title={t('screens2:planAdjust.daysPerWeek')} subtitle={t('screens2:planSurvey.daysPerWeekSubtitle')}>
              <View style={styles.chipGrid}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <Chip key={n} label={String(n)} selected={answers.daysPerWeek === n} onPress={() => patch({ daysPerWeek: n })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planAdjust.sessionLength')}>
              <View style={styles.optionGroup}>
                {SESSION_MINUTE_OPTIONS.map((o) => (
                  <OptionCard key={o.value} label={optionLabel('sessionMinutes', o)} subtitle={optionSubtitle('sessionMinutes', o)} value={o.value} selected={answers.sessionMinutes === o.value} onPress={(v) => patch({ sessionMinutes: v })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planSurvey.weekdaysTitle')} subtitle={t('screens2:planSurvey.weekdaysSubtitle')}>
              <View style={styles.chipGrid}>
                {DAY_OPTIONS.map((o) => (
                  <MultiChip key={o.value} label={optionLabel('day', o)} selected={answers.trainingDays.includes(o.value)} onPress={() => patch({ trainingDays: toggleSet(answers.trainingDays, o.value) })} />
                ))}
              </View>
            </Section>
          </View>
        )}

        {currentStep === 'split' && (
          <Section title={t('screens2:planSurvey.splitTitle')} subtitle={t('screens2:planSurvey.splitSubtitle')}>
            <View style={styles.optionGroup}>
              {SPLIT_OPTIONS.map((o) => (
                <OptionCard key={o.value} label={optionLabel('split', o)} subtitle={optionSubtitle('split', o)} value={o.value} selected={answers.splitPreference === o.value} onPress={(v) => patch({ splitPreference: v })} />
              ))}
            </View>
            <Hint>{answers.splitPreference === 'unsure' ? SPLIT_EXPLAINER : t('screens2:planSurvey.tipPrefix') + SPLIT_EXPLAINER}</Hint>
          </Section>
        )}

        {currentStep === 'equipment' && (
          <Section title={t('screens2:planSurvey.equipmentTitle')} subtitle={t('screens2:planSurvey.equipmentSubtitle')}>
            <View style={styles.chipGrid}>
              {EQUIPMENT_OPTIONS.map((o) => (
                <MultiChip key={o.value} label={optionLabel('equipment', o)} selected={answers.equipment.includes(o.value)} onPress={() => patch({ equipment: toggleSet(answers.equipment, o.value) })} />
              ))}
            </View>
            {answers.equipment.length === 0 && <Hint>{t('screens2:planSurvey.equipmentEmptyHint')}</Hint>}
          </Section>
        )}

        {currentStep === 'focus' && (
          <View style={styles.stepGap}>
            <Section title={t('screens2:planSurvey.prioritiesTitle')} subtitle={t('screens2:planSurvey.prioritiesSubtitle')}>
              <View style={styles.chipGrid}>
                {PRIORITY_OPTIONS.map((o) => (
                  <MultiChip key={o.value} label={optionLabel('priority', o)} selected={answers.musclePriorities.includes(o.value)} onPress={() => patch({ musclePriorities: toggleSet(answers.musclePriorities, o.value) })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planSurvey.injuriesTitle')} subtitle={t('screens2:planSurvey.injuriesSubtitle')}>
              <View style={styles.chipGrid}>
                {INJURY_OPTIONS.map((o) => (
                  <MultiChip key={o.value} label={optionLabel('injury', o)} selected={answers.injuries.includes(o.value)} onPress={() => patch({ injuries: toggleSet(answers.injuries, o.value) })} />
                ))}
              </View>
            </Section>
          </View>
        )}

        {currentStep === 'lifts' && (
          <View style={styles.stepGap}>
            <Section title={t('screens2:planSurvey.bestLiftsTitle')} subtitle={t('screens2:planSurvey.bestLiftsSubtitle', { unit: unitSuffix })}>
              <NumberField value={squatInput} onChangeText={setSquatInput} placeholder={t('screens2:planSurvey.squat1rm')} accessibilityLabel={t('screens2:planSurvey.squat1rmA11y', { unit: unitSuffix })} suffix={unitSuffix} />
              <NumberField value={benchInput} onChangeText={setBenchInput} placeholder={t('screens2:planSurvey.bench1rm')} accessibilityLabel={t('screens2:planSurvey.bench1rmA11y', { unit: unitSuffix })} suffix={unitSuffix} />
              <NumberField value={deadliftInput} onChangeText={setDeadliftInput} placeholder={t('screens2:planSurvey.deadlift1rm')} accessibilityLabel={t('screens2:planSurvey.deadlift1rmA11y', { unit: unitSuffix })} suffix={unitSuffix} />
              <NumberField value={ohpInput} onChangeText={setOhpInput} placeholder={t('screens2:planSurvey.ohp1rm')} accessibilityLabel={t('screens2:planSurvey.ohp1rmA11y', { unit: unitSuffix })} suffix={unitSuffix} />
            </Section>
            <Section title={t('screens2:planSurvey.bodyWeightTitle')} subtitle={t('screens2:planSurvey.bodyWeightSubtitle')}>
              <NumberField value={bwInput} onChangeText={setBwInput} placeholder={unitPref === 'lbs' ? 'e.g. 165' : 'e.g. 75'} accessibilityLabel={t('screens2:planSurvey.bodyWeightA11y', { unit: unitSuffix })} suffix={unitSuffix} />
            </Section>
            <Section title={t('screens2:planSurvey.dobTitle')} subtitle={t('screens2:planSurvey.dobSubtitle')}>
              <TextField value={answers.birthDate ?? ''} onChangeText={(t2) => patch({ birthDate: t2 })} placeholder="YYYY-MM-DD" accessibilityLabel={t('screens2:planSurvey.dobA11y')} maxLength={10} />
            </Section>
          </View>
        )}

        {currentStep === 'meet' && (
          <Section title={t('screens2:planSurvey.meetTitle')} subtitle={t('screens2:planSurvey.meetSubtitle')}>
            <NumberField value={weeksToMeetInput} onChangeText={setWeeksToMeetInput} placeholder={t('screens2:planSurvey.weeksToMeet')} accessibilityLabel={t('screens2:planSurvey.weeksToMeet')} suffix="wks" />
            <Hint>{t('screens2:planSurvey.meetHint')}</Hint>
          </Section>
        )}

        {currentStep === 'knobs' && (
          <View style={styles.stepGap}>
            <Section title={t('screens2:planAdjust.failureProximity')} subtitle={t('screens2:planSurvey.failureProximitySubtitle')}>
              <View style={styles.optionGroup}>
                {FAILURE_OPTIONS.map((o) => (
                  <OptionCard key={o.value} label={optionLabel('failure', o)} subtitle={optionSubtitle('failure', o)} value={o.value} selected={answers.knobs.failureProximity === o.value} onPress={(v) => patch({ knobs: { ...answers.knobs, failureProximity: v } })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planAdjust.progressSpeed')}>
              <View style={styles.optionGroup}>
                {PROGRESSION_OPTIONS.map((o) => (
                  <OptionCard key={o.value} label={optionLabel('progression', o)} subtitle={optionSubtitle('progression', o)} value={o.value} selected={answers.knobs.progressionSpeed === o.value} onPress={(v) => patch({ knobs: { ...answers.knobs, progressionSpeed: v } })} />
                ))}
              </View>
            </Section>
            <Section title={t('screens2:planAdjust.deloadFrequency')}>
              <View style={styles.optionGroup}>
                {DELOAD_OPTIONS.map((o) => (
                  <OptionCard key={o.value} label={optionLabel('deload', o)} subtitle={optionSubtitle('deload', o)} value={o.value} selected={answers.knobs.deloadFrequency === o.value} onPress={(v) => patch({ knobs: { ...answers.knobs, deloadFrequency: v } })} />
                ))}
              </View>
            </Section>
            <Hint>{KNOB_SAFETY_NOTE}</Hint>
          </View>
        )}

        {currentStep === 'preview' && (
          <View style={styles.stepGap}>
            <Text style={[styles.previewHeader, { color: theme.colors.textPrimary }]}>{t('screens2:planSurvey.planPreviewTitle')}</Text>
            {genError ? (
              <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{genError}</Text>
            ) : result?.kind === 'plan' ? (
              <SinglePlanPreview plan={result.plan} />
            ) : result?.kind === 'trial' ? (
              <TrialSequencePreview sequence={result.sequence} />
            ) : (
              <Text style={[styles.errorText, { color: theme.colors.textTertiary }]}>{t('screens2:planSurvey.generating')}</Text>
            )}
            {/* STAGE-2: persist the plan / trial sequence, then route on. */}
            {result?.kind === 'plan' ? (
              <PFButton
                variant="primary"
                label={saving ? t('screens2:planSurvey.savingPlan') : t('screens2:planSurvey.savePlan')}
                onPress={handleSavePlan}
                fullWidth
              />
            ) : result?.kind === 'trial' ? (
              <PFButton
                variant="primary"
                label={saving ? t('screens2:planSurvey.startingTrials') : t('screens2:planSurvey.startTrials')}
                onPress={handleStartTrials}
                fullWidth
              />
            ) : null}
            <View style={styles.previewNote}>
              <Text style={[styles.previewNoteText, { color: theme.colors.textTertiary }]}>
                {result?.kind === 'trial'
                  ? t('screens2:planSurvey.trialNote')
                  : t('screens2:planSurvey.savePlanNote')}
              </Text>
            </View>
          </View>
        )}

        {/* ── NAV BAR ── */}
        <View style={styles.navRow}>
          <PFButton variant="ghost" label={clampedIdx === 0 ? t('common:cancel') : t('common:back')} onPress={goBack} />
          {currentStep === 'preview' ? (
            <PFButton variant="ghost" label={t('common:close')} onPress={() => router.back()} />
          ) : steps[clampedIdx + 1] === 'preview' ? (
            <PFButton variant="primary" label={t('screens2:planSurvey.generatePlan')} onPress={handleGenerate} />
          ) : (
            <PFButton variant="primary" label={t('screens2:planSurvey.next')} onPress={goNext} />
          )}
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, gap: 24 },

  stepGap: { gap: 24 },
  optionGroup: { gap: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  previewHeader: { fontSize: fontSize.heading3, fontWeight: fontWeight.bold },
  previewNote: { marginTop: spacing.s2 },
  previewNoteText: { fontSize: fontSize.caption, lineHeight: 18, fontStyle: 'italic' },
  errorText: { fontSize: fontSize.bodySm, lineHeight: 20 },

  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s2,
  },
  bottomPad: { height: 24 },

  // ── Pro upsell ──
  upsellScroll: { flexGrow: 1, justifyContent: 'center', gap: 20, paddingVertical: 40 },
  upsellCard: { borderRadius: radius.lg, borderWidth: 1, padding: 24, gap: 14, alignItems: 'flex-start' },
  upsellIcon: { fontSize: fontSize.heading1 },
  upsellTitle: { fontSize: fontSize.heading3, fontWeight: fontWeight.bold },
  upsellBody: { fontSize: fontSize.bodySm, lineHeight: 22 },
  upsellFeatures: { gap: 8, marginTop: 4 },
  upsellFeature: { fontSize: fontSize.bodySm, lineHeight: 20 },
});
