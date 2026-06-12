/**
 * Goals tab (TICKET-105) — 6-domain grid with goal counts, inline goal
 * creation, weekly review entry point.
 */

import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Card, EmptyState, PFButton, PFInput, ScreenLayout, SectionTitle } from '../../src/components/ui';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, fontSize, radius, spacing } from '../../src/theme/tokens';
import { createGoal, Domain, DOMAINS, GoalRow, listGoals } from '../../src/data/goals';

export default function GoalsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [creatingFor, setCreatingFor] = useState<Domain | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newWhy, setNewWhy] = useState('');

  const load = useCallback(async () => {
    setGoals(await listGoals());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const create = async (): Promise<void> => {
    if (!creatingFor || !newTitle.trim()) return;
    const id = await createGoal({ domain: creatingFor, title: newTitle.trim(), why: newWhy.trim() || undefined });
    setCreatingFor(null);
    setNewTitle('');
    setNewWhy('');
    await load();
    router.push({ pathname: '/goal-detail', params: { goalId: id } });
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
              onPress={() => setCreatingFor(creatingFor === d.key ? null : d.key)}
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
          <PFInput label="Outcome" value={newTitle} onChangeText={setNewTitle} placeholder="e.g. Run a 10k in under an hour" autoFocus />
          <PFInput label="Why does it matter? (optional)" value={newWhy} onChangeText={setNewWhy} placeholder="Your reason, in your words" />
          <PFButton label="Create goal" onPress={() => void create()} disabled={!newTitle.trim()} />
        </Card>
      ) : null}

      <SectionTitle>Active goals</SectionTitle>
      {goals.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title="No goals yet"
          body="Tap a domain above to set one — or run the survey and let the plan propose a starting point."
        />
      ) : (
        goals.map((g) => (
          <Card
            key={g.id}
            onPress={() => router.push({ pathname: '/goal-detail', params: { goalId: g.id } })}
            accessibilityLabel={`Open goal ${g.title}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ color: c.accentDefault, fontFamily: fontFamily.semibold, fontSize: fontSize.caption, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {DOMAINS.find((d) => d.key === g.domain)?.label}
                </Text>
                <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyLg, marginTop: spacing.s1 }}>
                  {g.title}
                </Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color={c.textTertiary} />
            </View>
          </Card>
        ))
      )}
    </ScreenLayout>
  );
}
