/**
 * Goals tab (TICKET-105, extended TICKET-161) — 6-domain grid with goal
 * counts, inline goal creation (milestone or numeric-metric goals), weekly
 * review entry point, and per-goal progress (two honest signals + an
 * explicit third numeric-metric signal, never blended).
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, PFInput, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { FadeSlideIn } from '../../src/components/motion';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, radius, spacing } from '../../src/theme/tokens';
import { createGoal, Domain, DOMAINS, GoalProgress, goalProgress, GoalRow, listGoals } from '../../src/data/goals';
import { safeWrite } from '../../src/lib/feedback';
import { haptic } from '../../src/lib/haptics';

type MetricMode = 'milestone' | 'numeric';

const DOMAIN_ENCOURAGEMENT: Record<Domain, string> = {
  health: 'One concrete outcome beats a vague "get fit."',
  professional: 'Pick the result, not the busywork.',
  growth: 'What would you like to be able to do by then?',
  interpersonal: 'Small, regular reach-outs move this most.',
  financial: 'A number and a date make money goals real.',
  mind: "Keep it gentle — this one's about steadiness.",
};

function formatMetricNumber(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.trunc(rounded)) : rounded.toFixed(1);
}

export default function GoalsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [progressByGoal, setProgressByGoal] = useState<Record<string, GoalProgress>>({});
  const [loaded, setLoaded] = useState(false);
  const [creatingFor, setCreatingFor] = useState<Domain | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newWhy, setNewWhy] = useState('');
  const [metricMode, setMetricMode] = useState<MetricMode>('milestone');
  const [metricTargetInput, setMetricTargetInput] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const rows = await listGoals();
    setGoals(rows);
    const entries = await Promise.all(
      rows.map(async (g) => [g.id, await goalProgress(g.id)] as const)
    );
    const map: Record<string, GoalProgress> = {};
    for (const [id, p] of entries) map[id] = p;
    setProgressByGoal(map);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const resetCreationForm = (): void => {
    setCreatingFor(null);
    setNewTitle('');
    setNewWhy('');
    setMetricMode('milestone');
    setMetricTargetInput('');
  };

  const parsedTarget = parseFloat(metricTargetInput);
  const targetValid = Number.isFinite(parsedTarget) && parsedTarget > 0;
  const canCreate = !!creatingFor && !!newTitle.trim() && (metricMode === 'milestone' || targetValid);

  const create = async (): Promise<void> => {
    if (!creatingFor || !newTitle.trim() || creating) return;
    if (metricMode === 'numeric' && !targetValid) return;
    setCreating(true);
    const id = await safeWrite(
      () =>
        createGoal({
          domain: creatingFor,
          title: newTitle.trim(),
          why: newWhy.trim() || undefined,
          metricType: metricMode,
          metricTarget: metricMode === 'numeric' ? parsedTarget : null,
          metricCurrent: metricMode === 'numeric' ? 0 : null,
        }),
      { context: 'goals.create' }
    );
    setCreating(false);
    if (!id) return;
    resetCreationForm();
    await load();
    router.push({ pathname: '/goal-detail', params: { goalId: id } });
  };

  const selectDomain = (d: Domain): void => {
    haptic.selection();
    if (creatingFor === d) {
      resetCreationForm();
    } else {
      setCreatingFor(d);
      setNewTitle('');
      setNewWhy('');
      setMetricMode('milestone');
      setMetricTargetInput('');
    }
  };

  const switchMetricMode = (mode: MetricMode): void => {
    if (mode === metricMode) return;
    haptic.selection();
    setMetricMode(mode);
  };

  return (
    <ScreenLayout>
      <Card onPress={() => router.push('/weekly-review')} accessibilityLabel="Open weekly review">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="calendar-outline" size={22} color={c.accentDefault} />
          <View style={{ marginLeft: spacing.s3 }}>
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>Weekly review</Text>
            <Text style={{ color: c.textSecondary, fontFamily: fontFamily.regular, fontSize: fontSize.bodySm }}>
              Close the week, aim the next one.
            </Text>
          </View>
        </View>
      </Card>

      <SectionTitle>Domains</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {DOMAINS.map((d) => {
          const count = goals.filter((g) => g.domain === d.key).length;
          return (
            <Pressable
              key={d.key}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}, ${count} active ${count === 1 ? 'goal' : 'goals'}`}
              onPress={() => selectDomain(d.key)}
              style={({ pressed }) => ({
                width: '48.5%',
                backgroundColor: c.bgSecondary,
                borderWidth: 1,
                borderColor: creatingFor === d.key ? c.accentDefault : c.borderDefault,
                borderRadius: radius.lg,
                padding: spacing.s4,
                marginBottom: spacing.s3,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Ionicons name={d.icon} size={22} color={c.accentDefault} />
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd, marginTop: spacing.s2 }}>
                {d.label}
              </Text>
              <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s1, fontVariant: ['tabular-nums'] }}>
                {count} active
              </Text>
            </Pressable>
          );
        })}
      </View>

      {creatingFor ? (
        <Card>
          <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd, marginBottom: spacing.s3 }}>
            New goal — {DOMAINS.find((d) => d.key === creatingFor)?.label}
          </Text>

          {goals.filter((g) => g.domain === creatingFor).length === 0 ? (
            <Text
              style={{
                color: c.textTertiary,
                fontFamily: fontFamily.regular,
                fontSize: fontSize.caption,
                marginBottom: spacing.s3,
                lineHeight: 18,
              }}
            >
              {DOMAIN_ENCOURAGEMENT[creatingFor]}
            </Text>
          ) : null}

          <PFInput label="Outcome" value={newTitle} onChangeText={setNewTitle} placeholder="e.g. Run a 10k in under an hour" autoFocus />
          <PFInput label="Why does it matter? (optional)" value={newWhy} onChangeText={setNewWhy} placeholder="Your reason, in your words" />

          <Text style={{ color: c.textSecondary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm, marginBottom: spacing.s2 }}>
            How will you track it?
          </Text>
          <View style={{ flexDirection: 'row', marginBottom: spacing.s4 }}>
            {(
              [
                { key: 'milestone' as MetricMode, label: 'Milestones' },
                { key: 'numeric' as MetricMode, label: 'Track a number' },
              ]
            ).map((opt, i) => {
              const selected = metricMode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                  onPress={() => switchMetricMode(opt.key)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: selected ? c.accentMuted : c.bgSecondary,
                    borderWidth: 1,
                    borderColor: selected ? c.accentDefault : c.borderDefault,
                    borderTopLeftRadius: i === 0 ? radius.md : 0,
                    borderBottomLeftRadius: i === 0 ? radius.md : 0,
                    borderTopRightRadius: i === 1 ? radius.md : 0,
                    borderBottomRightRadius: i === 1 ? radius.md : 0,
                    marginLeft: i === 1 ? -1 : 0,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? c.accentDefault : c.textSecondary,
                      fontFamily: fontFamily.semibold,
                      fontSize: fontSize.bodySm,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {metricMode === 'numeric' ? (
            <PFInput
              label="Target"
              value={metricTargetInput}
              onChangeText={setMetricTargetInput}
              placeholder="12"
              keyboardType="numeric"
              helper='e.g. "12" if the goal is 12 sessions'
            />
          ) : null}

          <PFButton label="Create goal" onPress={() => void create()} disabled={!canCreate} loading={creating} />
        </Card>
      ) : null}

      <SectionTitle>Active goals</SectionTitle>
      {!loaded ? (
        <View style={{ paddingVertical: spacing.s12, alignItems: 'center' }}>
          <ActivityIndicator color={c.accentDefault} />
        </View>
      ) : goals.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          illustration="goals"
          title="No goals yet"
          body="Tap a domain above to set one — or run the survey and let the plan propose a starting point."
        />
      ) : (
        goals.map((g, index) => {
          const progress = progressByGoal[g.id];
          const isNumeric = g.metric_type === 'numeric' && g.metric_target != null && g.metric_target > 0;
          const current = g.metric_current ?? 0;
          const target = g.metric_target ?? 0;
          const pct = isNumeric ? Math.min(100, Math.round((current / target) * 100)) : 0;

          let a11yLabel = `Open goal ${g.title}`;
          if (isNumeric) {
            a11yLabel += `, ${formatMetricNumber(current)} of ${formatMetricNumber(target)}`;
          } else if (progress && progress.milestonesTotal > 0) {
            a11yLabel += `, ${progress.milestonesDone} of ${progress.milestonesTotal} milestones`;
          }

          return (
            <FadeSlideIn key={g.id} index={index}>
              <Card
                onPress={() => router.push({ pathname: '/goal-detail', params: { goalId: g.id } })}
                accessibilityLabel={a11yLabel}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexShrink: 1, flex: 1 }}>
                    <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semibold, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      {DOMAINS.find((d) => d.key === g.domain)?.label}
                    </Text>
                    <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyLg, marginTop: spacing.s1 }}>
                      {g.title}
                    </Text>

                    {isNumeric ? (
                      <View style={{ marginTop: spacing.s3 }}>
                        <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.bgElevated, overflow: 'hidden' }}>
                          <View style={{ height: 6, borderRadius: radius.full, backgroundColor: c.accentDefault, width: `${pct}%` }} />
                        </View>
                        <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s1, fontVariant: ['tabular-nums'] }}>
                          {formatMetricNumber(current)} / {formatMetricNumber(target)}
                        </Text>
                      </View>
                    ) : progress && progress.milestonesTotal > 0 ? (
                      <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: spacing.s2, fontVariant: ['tabular-nums'] }}>
                        {progress.milestonesDone}/{progress.milestonesTotal} milestones
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward-outline" size={20} color={c.textTertiary} />
                </View>
              </Card>
            </FadeSlideIn>
          );
        })
      )}
    </ScreenLayout>
  );
}
