/**
 * Exercise library (TICKET-108) — cards by type, filterable by pack.
 * All content seeded + human-written; skipping never penalised.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { Card, EmptyState, ScreenLayout, SectionTitle } from '../src/components/ui';
import { FadeSlideIn } from '../src/components/motion';
import { Ionicons } from '../src/components/Icon';
import { fontFamily, fontSize, HIT_TARGET, radius, spacing } from '../src/theme/tokens';
import { ExerciseRow, listExercises } from '../src/data/mood';

const TYPE_ICONS: Record<string, string> = {
  breathing: 'cloud-outline',
  grounding: 'earth-outline',
  cbt: 'bulb-outline',
  gratitude: 'heart-outline',
  mindfulness: 'leaf-outline',
  reflection: 'telescope-outline',
};

const PACK_LABELS: Record<string, string> = {
  'high-stress': 'High-stress pack',
  'competition-prep': 'Competition prep',
};

export default function ExercisesScreen(): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const router = useRouter();
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [packFilter, setPackFilter] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void listExercises().then((rows) => {
        if (cancelled) return;
        setExercises(rows);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const packs = Array.from(new Set(exercises.map((e) => e.pack).filter((p): p is string => p != null)));
  const visible = packFilter ? exercises.filter((e) => e.pack === packFilter) : exercises;

  if (loading) {
    return (
      <ScreenLayout>
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.s12 }}>
          <ActivityIndicator color={c.accentDefault} accessibilityLabel="Loading exercises" />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      {exercises.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.s3 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show all exercises"
            accessibilityState={{ selected: packFilter == null }}
            onPress={() => setPackFilter(null)}
            style={{
              minHeight: HIT_TARGET - 6,
              paddingHorizontal: spacing.s4,
              justifyContent: 'center',
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: packFilter == null ? c.accentDefault : c.borderDefault,
              backgroundColor: packFilter == null ? c.accentMuted : 'transparent',
              marginRight: spacing.s2,
              marginBottom: spacing.s2,
            }}
          >
            <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>All</Text>
          </Pressable>
          {packs.map((p) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityLabel={`Filter to ${PACK_LABELS[p] ?? p}`}
              accessibilityState={{ selected: packFilter === p }}
              onPress={() => setPackFilter(packFilter === p ? null : p)}
              style={{
                minHeight: HIT_TARGET - 6,
                paddingHorizontal: spacing.s4,
                justifyContent: 'center',
                borderRadius: radius.full,
                borderWidth: 1,
                borderColor: packFilter === p ? c.accentDefault : c.borderDefault,
                backgroundColor: packFilter === p ? c.accentMuted : 'transparent',
                marginRight: spacing.s2,
                marginBottom: spacing.s2,
              }}
            >
              <Text style={{ color: c.textPrimary, fontFamily: fontFamily.medium, fontSize: fontSize.bodySm }}>{PACK_LABELS[p] ?? p}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {exercises.length === 0 ? (
        <EmptyState
          icon="leaf-outline"
          illustration="focus"
          title="No exercises yet"
          body="Your exercise library will appear here once content is available. Check back soon."
          cta="Refresh"
          onPress={() => {
            setLoading(true);
            void listExercises().then((rows) => {
              setExercises(rows);
              setLoading(false);
            });
          }}
        />
      ) : (
        <>
          <SectionTitle>Library</SectionTitle>
          {visible.map((e, idx) => (
            <FadeSlideIn key={e.slug} index={idx}>
              <Card
                onPress={() => router.push({ pathname: '/exercise-player', params: { slug: e.slug } })}
                accessibilityLabel={`${e.title}, ${Math.round(e.duration_sec / 60)} minutes`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name={TYPE_ICONS[e.type] ?? 'leaf-outline'} size={24} color={c.accentDefault} />
                  <View style={{ flex: 1, marginLeft: spacing.s3 }}>
                    <Text style={{ color: c.textPrimary, fontFamily: fontFamily.semibold, fontSize: fontSize.bodyMd }}>{e.title}</Text>
                    <Text style={{ color: c.textTertiary, fontFamily: fontFamily.regular, fontSize: fontSize.caption, marginTop: 2, fontVariant: ['tabular-nums'] }}>
                      {e.type} · {Math.round(e.duration_sec / 60)} min
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={18} color={c.textTertiary} />
                </View>
              </Card>
            </FadeSlideIn>
          ))}
        </>
      )}
    </ScreenLayout>
  );
}
