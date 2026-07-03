/**
 * plan-adjust.tsx — Pro meta-change sheet for the active plan (Stage 2).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 section 3. "Request changes" opens this
 * screen: structured meta-adjustments (days/week, session length, split,
 * emphasis, disliked exercises, progression, deload, effort) that regenerate the
 * plan WITHOUT redoing the whole survey. Applied as a parameter patch ->
 * deterministic regeneration -> a diff summary + new week-1 preview -> confirm
 * replaces the saved plan (and its schedule entries if adopted, with a
 * replace/keep prompt).
 *
 * Pro-only + on-device (local-first): loads the saved SurveyAnswers from the
 * on-device plan store, regenerates via the pure engine adapter, persists via
 * planStore. No REST call. The clock is injected only at the regenerate/persist
 * call sites (never inside plan logic).
 * =============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import { ScreenLayout, PFButton } from '../src/components/ui';
import { Section, OptionCard, Chip, MultiChip } from '../src/planGen/steps/SurveyControls';
import {
  SPLIT_OPTIONS,
  SESSION_MINUTE_OPTIONS,
  PRIORITY_OPTIONS,
  PROGRESSION_OPTIONS,
  DELOAD_OPTIONS,
  FAILURE_OPTIONS,
} from '../src/planGen/steps/surveyConfig';
import type { SurveyAnswers } from '../src/planGen/surveyTypes';
import { applyMetaChange, diffSummary, hasAnyChange, type MetaChangePatch } from '../src/planGen/metaChanges';
import { generateFromSurvey } from '../src/planGen/generateFromSurvey';
import {
  loadActivePlan,
  saveActivePlan,
  saveActiveTrial,
  type StoredGeneratedPlan,
} from '../src/planGen/planStore';
import { adoptPlanToSchedule } from '../src/planGen/planAdoption';
import { SinglePlanPreview, TrialSequencePreview } from '../src/planGen/steps/PlanPreview';
import { toDateKey } from '../src/utils/dateHelpers';

function toggleSet<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export default function PlanAdjustScreen(): React.ReactElement {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;

  const [stored, setStored] = useState<StoredGeneratedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [patch, setPatch] = useState<MetaChangePatch>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadActivePlan(user);
      if (cancelled) return;
      setStored(s);
      // Seed the patch controls from the current answers so the pickers reflect
      // the plan's present settings (an unchanged pick produces no diff).
      if (s) {
        const a = s.survey;
        setPatch({
          daysPerWeek: a.daysPerWeek,
          sessionMinutes: a.sessionMinutes,
          splitPreference: a.splitPreference,
          musclePriorities: [...a.musclePriorities],
          excludedExerciseIds: a.excludedExerciseIds ? [...a.excludedExerciseIds] : [],
          progressionSpeed: a.knobs.progressionSpeed,
          deloadFrequency: a.knobs.deloadFrequency,
          failureProximity: a.knobs.failureProximity,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const answers: SurveyAnswers | null = stored?.survey ?? null;
  const nextAnswers = answers ? applyMetaChange(answers, patch) : null;
  const diff = answers && nextAnswers ? diffSummary(answers, nextAnswers) : [];
  const changed = answers ? hasAnyChange(answers, patch) : false;

  // Deterministic preview of the regenerated plan/sequence from patched answers.
  const preview = React.useMemo(() => {
    if (!nextAnswers) return null;
    try {
      return generateFromSurvey(nextAnswers, user?.id, { now: new Date() });
    } catch {
      return null;
    }
  }, [nextAnswers, user?.id]);

  const patchField = useCallback((p: Partial<MetaChangePatch>) => {
    setPatch((cur) => ({ ...cur, ...p }));
  }, []);

  const handleApply = useCallback(async () => {
    if (!stored || !nextAnswers || !preview) return;
    setSaving(true);
    try {
      const now = new Date();
      const wasAdopted = stored.status === 'plan_adopted' || stored.status === 'trial_adopted';

      if (preview.kind === 'plan') {
        const saved = await saveActivePlan(
          {
            userId: user?.id != null ? String(user.id) : null,
            plan: preview.plan,
            survey: nextAnswers,
            status: wasAdopted ? 'plan_adopted' : 'plan_saved',
          },
          now,
        );
        // If the plan was already on the calendar, offer to re-map it.
        if (wasAdopted) {
          Alert.alert(
            'Update your calendar?',
            'This plan is on your calendar. Replace the scheduled days with the new plan, or keep your current schedule?',
            [
              { text: 'Keep schedule', style: 'cancel', onPress: () => router.back() },
              {
                text: 'Replace',
                style: 'destructive',
                onPress: async () => {
                  try {
                    await adoptPlanToSchedule(
                      user,
                      user?.id != null ? String(user.id) : 'local',
                      preview.plan,
                      nextAnswers.trainingDays,
                      new Date(),
                    );
                  } catch {
                    // best-effort; the plan itself is saved regardless
                  }
                  router.replace('/routines');
                },
              },
            ],
            { cancelable: true },
          );
          void saved;
          return;
        }
        router.back();
        return;
      }

      // Trial sequence result (user switched split back to "unsure").
      await saveActiveTrial(
        {
          userId: user?.id != null ? String(user.id) : null,
          sequence: preview.sequence,
          survey: nextAnswers,
          startDayKey: toDateKey(now),
        },
        now,
      );
      router.back();
    } finally {
      setSaving(false);
    }
  }, [stored, nextAnswers, preview, user, router]);

  if (loading) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={c.accentDefault} />
        </View>
      </ScreenLayout>
    );
  }

  if (!stored || !answers) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            No active plan to adjust. Generate a plan first, then request changes.
          </Text>
          <PFButton variant="ghost" label="Back" onPress={() => router.back()} />
        </View>
      </ScreenLayout>
    );
  }

  const p = patch;

  return (
    <ScreenLayout horizontalPadding={false}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.header, { color: c.textPrimary }]}>Request changes</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>
          Adjust a few things — we rebuild your plan instantly. No need to redo the survey.
        </Text>

        <Section title="Days per week">
          <View style={styles.chipGrid}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Chip key={n} label={String(n)} selected={p.daysPerWeek === n} onPress={() => patchField({ daysPerWeek: n })} />
            ))}
          </View>
        </Section>

        <Section title="Session length">
          <View style={styles.optionGroup}>
            {SESSION_MINUTE_OPTIONS.map((o) => (
              <OptionCard key={o.value} label={o.label} subtitle={o.subtitle} value={o.value} selected={p.sessionMinutes === o.value} onPress={(v) => patchField({ sessionMinutes: v })} />
            ))}
          </View>
        </Section>

        <Section title="Split">
          <View style={styles.optionGroup}>
            {SPLIT_OPTIONS.map((o) => (
              <OptionCard key={o.value} label={o.label} subtitle={o.subtitle} value={o.value} selected={p.splitPreference === o.value} onPress={(v) => patchField({ splitPreference: v })} />
            ))}
          </View>
        </Section>

        <Section title="Muscle emphasis" subtitle="Bias extra volume toward these.">
          <View style={styles.chipGrid}>
            {PRIORITY_OPTIONS.map((o) => (
              <MultiChip key={o.value} label={o.label} selected={(p.musclePriorities ?? []).includes(o.value)} onPress={() => patchField({ musclePriorities: toggleSet(p.musclePriorities ?? [], o.value) })} />
            ))}
          </View>
        </Section>

        <Section title="How fast to progress?">
          <View style={styles.optionGroup}>
            {PROGRESSION_OPTIONS.map((o) => (
              <OptionCard key={o.value} label={o.label} subtitle={o.subtitle} value={o.value} selected={p.progressionSpeed === o.value} onPress={(v) => patchField({ progressionSpeed: v })} />
            ))}
          </View>
        </Section>

        <Section title="How often to deload?">
          <View style={styles.optionGroup}>
            {DELOAD_OPTIONS.map((o) => (
              <OptionCard key={o.value} label={o.label} subtitle={o.subtitle} value={o.value} selected={p.deloadFrequency === o.value} onPress={(v) => patchField({ deloadFrequency: v })} />
            ))}
          </View>
        </Section>

        <Section title="How close to failure?">
          <View style={styles.optionGroup}>
            {FAILURE_OPTIONS.map((o) => (
              <OptionCard key={o.value} label={o.label} subtitle={o.subtitle} value={o.value} selected={p.failureProximity === o.value} onPress={(v) => patchField({ failureProximity: v })} />
            ))}
          </View>
        </Section>

        {/* Diff summary */}
        {diff.length > 0 ? (
          <View style={[styles.diffCard, { backgroundColor: c.bgSecondary, borderLeftColor: c.accentDefault }]}>
            <Text style={[styles.diffTitle, { color: c.accentHover }]}>What changes</Text>
            {diff.map((line) => (
              <Text key={line.field} style={[styles.diffLine, { color: c.textSecondary }]}>
                {line.text}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={[styles.noChange, { color: c.textTertiary }]}>No changes yet — adjust an option above.</Text>
        )}

        {/* New week-1 preview */}
        {changed && preview ? (
          <View style={styles.previewWrap}>
            <Text style={[styles.previewHeader, { color: c.textTertiary }]}>NEW PREVIEW</Text>
            {preview.kind === 'plan' ? (
              <SinglePlanPreview plan={preview.plan} />
            ) : (
              <TrialSequencePreview sequence={preview.sequence} />
            )}
          </View>
        ) : null}

        <View style={styles.navRow}>
          <PFButton variant="ghost" label="Cancel" onPress={() => router.back()} />
          <PFButton
            variant="primary"
            label={saving ? 'Applying...' : 'Apply changes'}
            onPress={handleApply}
            disabled={!changed || saving || !preview}
          />
        </View>
        <View style={styles.bottomPad} />
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40, gap: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  emptyText: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 22 },

  header: { fontSize: fontSize.heading3, fontWeight: fontWeight.bold },
  sub: { fontSize: fontSize.bodySm, lineHeight: 20 },

  optionGroup: { gap: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  diffCard: { borderRadius: radius.md, padding: spacing.s4, gap: spacing.s1, borderLeftWidth: 3 },
  diffTitle: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, marginBottom: spacing.s1 },
  diffLine: { fontSize: fontSize.bodySm, lineHeight: 20 },
  noChange: { fontSize: fontSize.bodySm, fontStyle: 'italic' },

  previewWrap: { gap: spacing.s3 },
  previewHeader: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, letterSpacing: 1.1 },

  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.s3, marginTop: spacing.s2 },
  bottomPad: { height: 24 },
});
