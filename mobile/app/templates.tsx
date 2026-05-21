/**
 * TemplatesScreen — PL-1: Template Browse
 * Fetches GET /templates, renders a searchable/filterable list of workout templates.
 * Tapping a card opens a bottom-sheet modal with full session list + "Start Workout" CTA.
 * "Start Workout" logs the first template session as a new workout and pushes to /(tabs)/log.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { apiClient } from '../src/api/client';
import PFCard from '../src/components/ui/PFCard';
import PFButton from '../src/components/ui/PFButton';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateSession {
  id: string;
  name: string;
  order: number;
  exercises: Array<{
    name: string;
    sets: number;
    reps_range: string;
    rest_s?: number;
  }>;
}

interface Template {
  id: string;
  name: string;
  discipline: string;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | 'elite';
  days_per_week: number;
  description: string;
  sessions: TemplateSession[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISCIPLINES = ['All', 'powerlifting', 'weightlifting', 'strength', 'running', 'cycling', 'swimming'];
const EXPERIENCE_LEVELS = ['All', 'beginner', 'intermediate', 'advanced', 'elite'];

const LEVEL_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite',
  All: 'All',
};

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function TemplateSkeleton({ colors, spacing, radius }: { colors: any; spacing: any; radius: any }) {
  return (
    <View style={{ gap: spacing.s3 }}>
      {[1, 2, 3, 4].map((k) => (
        <View
          key={k}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: colors.bgSecondary,
              borderRadius: radius.lg,
              padding: spacing.s4,
            },
          ]}
        >
          <View style={[styles.skeletonLine, { width: '60%', backgroundColor: colors.bgTertiary, marginBottom: spacing.s2 }]} />
          <View style={[styles.skeletonLine, { width: '40%', backgroundColor: colors.bgTertiary, marginBottom: spacing.s2, height: 10 }]} />
          <View style={[styles.skeletonLine, { width: '90%', backgroundColor: colors.bgTertiary, height: 10 }]} />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

function Chip({
  label,
  active,
  onPress,
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
  fontSize: any;
  fontWeight: any;
  radius: any;
  spacing: any;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accentDefault : colors.bgTertiary,
          borderRadius: radius.full,
          paddingHorizontal: spacing.s3,
          paddingVertical: spacing.s1,
          borderWidth: active ? 0 : 1,
          borderColor: colors.borderDefault,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: active ? fontWeight.semibold : fontWeight.regular,
          color: active ? colors.bgPrimary : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Template Card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onPress,
  colors,
  fontSize,
  fontWeight,
  spacing,
  radius,
}: {
  template: Template;
  onPress: () => void;
  colors: any;
  fontSize: any;
  fontWeight: any;
  spacing: any;
  radius: any;
}) {
  return (
    <PFCard>
      <Pressable onPress={onPress} style={{ padding: spacing.s4 }} accessibilityRole="button">
        {/* Name */}
        <Text
          style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing.s2 }}
          numberOfLines={1}
        >
          {template.name}
        </Text>

        {/* Chips row */}
        <View style={[styles.chipRow, { marginBottom: spacing.s2 }]}>
          <View
            style={[
              styles.inlineChip,
              { backgroundColor: colors.accentSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.s2, paddingVertical: 2 },
            ]}
          >
            <Text style={{ fontSize: fontSize.caption, color: colors.accentDefault, fontWeight: fontWeight.medium }}>
              {template.discipline}
            </Text>
          </View>
          <View
            style={[
              styles.inlineChip,
              { backgroundColor: colors.bgTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.s2, paddingVertical: 2 },
            ]}
          >
            <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary }}>
              {LEVEL_LABEL[template.experience_level] ?? template.experience_level}
            </Text>
          </View>
          <View
            style={[
              styles.inlineChip,
              { backgroundColor: colors.bgTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.s2, paddingVertical: 2 },
            ]}
          >
            <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary }}>
              {template.days_per_week}d/wk
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={{ fontSize: fontSize.bodySm, color: colors.textSecondary, lineHeight: 20 }} numberOfLines={2}>
          {template.description}
        </Text>
      </Pressable>
    </PFCard>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function TemplatesScreen(): React.ReactElement {
  const router = useRouter();
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const { colors } = theme;
  const { user } = useAuth();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('All');
  const [levelFilter, setLevelFilter] = useState('All');
  const [selected, setSelected] = useState<Template | null>(null);
  const [starting, setStarting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (disciplineFilter !== 'All') params.discipline = disciplineFilter;
      if (levelFilter !== 'All') params.experience_level = levelFilter;

      const query = new URLSearchParams(params).toString();
      const url = `/templates${query ? `?${query}` : ''}`;
      const res = await apiClient.get<Template[]>(url);
      setTemplates(res.data ?? []);
    } catch {
      setError('Could not load templates. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [disciplineFilter, levelFilter]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Recommended: same discipline + level as user
  const recommended = templates.filter(
    (t) =>
      (user?.experience_level ? t.experience_level === user.experience_level : true),
  );

  // Filtered by search + chips
  const filtered = templates.filter((t) => {
    const matchesSearch =
      search.length === 0 ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handleStartWorkout = async () => {
    if (!selected || !selected.sessions.length) return;
    setStarting(true);
    try {
      const firstSession = selected.sessions[0];
      await apiClient.post('/workouts', {
        template_id: selected.id,
        session_name: firstSession.name,
        exercises: firstSession.exercises,
      });
      setSelected(null);
      router.push('/(tabs)/log' as any);
    } catch {
      // Non-fatal — still close modal
      setSelected(null);
      router.push('/(tabs)/log' as any);
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bgPrimary }]}>
      {/* Search bar */}
      <View style={[styles.searchRow, { paddingHorizontal: spacing.s4, paddingTop: spacing.s4 }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search templates..."
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.bgTertiary,
              color: colors.textPrimary,
              borderRadius: radius.md,
              fontSize: fontSize.bodyMd,
              paddingHorizontal: spacing.s4,
              paddingVertical: Platform.OS === 'ios' ? spacing.s3 : spacing.s2,
              borderWidth: 1,
              borderColor: colors.borderDefault,
            },
          ]}
          accessibilityLabel="Search templates"
          returnKeyType="search"
        />
      </View>

      {/* Discipline filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 44 }}
        contentContainerStyle={{ paddingHorizontal: spacing.s4, paddingVertical: spacing.s2, gap: spacing.s2 }}
      >
        {DISCIPLINES.map((d) => (
          <Chip
            key={d}
            label={d === 'All' ? 'All disciplines' : d}
            active={disciplineFilter === d}
            onPress={() => setDisciplineFilter(d)}
            colors={colors}
            fontSize={fontSize}
            fontWeight={fontWeight}
            radius={radius}
            spacing={spacing}
          />
        ))}
      </ScrollView>

      {/* Level filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 40 }}
        contentContainerStyle={{ paddingHorizontal: spacing.s4, paddingBottom: spacing.s2, gap: spacing.s2 }}
      >
        {EXPERIENCE_LEVELS.map((l) => (
          <Chip
            key={l}
            label={LEVEL_LABEL[l]}
            active={levelFilter === l}
            onPress={() => setLevelFilter(l)}
            colors={colors}
            fontSize={fontSize}
            fontWeight={fontWeight}
            radius={radius}
            spacing={spacing}
          />
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={{ paddingHorizontal: spacing.s4, marginTop: spacing.s4 }}>
          <TemplateSkeleton colors={colors} spacing={spacing} radius={radius} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={{ color: colors.statusError, fontSize: fontSize.bodyMd, textAlign: 'center', marginBottom: spacing.s4 }}>
            {error}
          </Text>
          <PFButton label="Retry" onPress={fetchTemplates} variant="secondary" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TemplateCard
              template={item}
              onPress={() => setSelected(item)}
              colors={colors}
              fontSize={fontSize}
              fontWeight={fontWeight}
              spacing={spacing}
              radius={radius}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: spacing.s4, paddingBottom: spacing.s8 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.s3 }} />}
          ListHeaderComponent={
            recommended.length > 0 && disciplineFilter === 'All' && levelFilter === 'All' && search.length === 0 ? (
              <View style={{ marginBottom: spacing.s4, marginTop: spacing.s2 }}>
                <Text
                  style={{
                    fontSize: fontSize.heading3,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.s3,
                  }}
                >
                  Recommended for you
                </Text>
                {recommended.slice(0, 2).map((t) => (
                  <View key={t.id} style={{ marginBottom: spacing.s3 }}>
                    <TemplateCard
                      template={t}
                      onPress={() => setSelected(t)}
                      colors={colors}
                      fontSize={fontSize}
                      fontWeight={fontWeight}
                      spacing={spacing}
                      radius={radius}
                    />
                  </View>
                ))}
                <Text
                  style={{
                    fontSize: fontSize.heading3,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.s3,
                    marginTop: spacing.s2,
                  }}
                >
                  All templates
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.errorContainer}>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.bodyMd, textAlign: 'center' }}>
                No templates match your filters.
              </Text>
            </View>
          }
        />
      )}

      {/* Detail modal */}
      <Modal
        visible={selected !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)} />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.bgSecondary,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.modalHandle, { backgroundColor: colors.bgElevated }]} />

          {selected && (
            <>
              {/* Header */}
              <View style={{ paddingHorizontal: spacing.s6, paddingTop: spacing.s4, paddingBottom: spacing.s3 }}>
                <Text
                  style={{
                    fontSize: fontSize.heading2,
                    fontWeight: fontWeight.bold,
                    color: colors.textPrimary,
                    marginBottom: spacing.s2,
                  }}
                >
                  {selected.name}
                </Text>
                <View style={[styles.chipRow, { marginBottom: spacing.s3 }]}>
                  <View style={[styles.inlineChip, { backgroundColor: colors.accentSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.s2, paddingVertical: 2 }]}>
                    <Text style={{ fontSize: fontSize.caption, color: colors.accentDefault, fontWeight: fontWeight.medium }}>
                      {selected.discipline}
                    </Text>
                  </View>
                  <View style={[styles.inlineChip, { backgroundColor: colors.bgTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.s2, paddingVertical: 2 }]}>
                    <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary }}>
                      {LEVEL_LABEL[selected.experience_level] ?? selected.experience_level}
                    </Text>
                  </View>
                  <View style={[styles.inlineChip, { backgroundColor: colors.bgTertiary, borderRadius: radius.sm, paddingHorizontal: spacing.s2, paddingVertical: 2 }]}>
                    <Text style={{ fontSize: fontSize.caption, color: colors.textSecondary }}>
                      {selected.days_per_week} days/week
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: fontSize.bodyMd, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.s3 }}>
                  {selected.description}
                </Text>
              </View>

              {/* Session list */}
              <ScrollView
                style={{ maxHeight: 280 }}
                contentContainerStyle={{ paddingHorizontal: spacing.s6, paddingBottom: spacing.s4 }}
              >
                <Text
                  style={{
                    fontSize: fontSize.heading3,
                    fontWeight: fontWeight.semibold,
                    color: colors.textPrimary,
                    marginBottom: spacing.s3,
                  }}
                >
                  Sessions ({selected.sessions.length})
                </Text>
                {selected.sessions.map((session, idx) => (
                  <View
                    key={session.id}
                    style={[
                      styles.sessionRow,
                      {
                        backgroundColor: colors.bgTertiary,
                        borderRadius: radius.md,
                        padding: spacing.s3,
                        marginBottom: spacing.s2,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 4 }}>
                      {`Day ${idx + 1}: ${session.name}`}
                    </Text>
                    {session.exercises.map((ex, ei) => (
                      <Text key={ei} style={{ fontSize: fontSize.caption, color: colors.textSecondary }}>
                        {`• ${ex.name}  ${ex.sets}×${ex.reps_range}${ex.rest_s ? `  ${ex.rest_s}s rest` : ''}`}
                      </Text>
                    ))}
                  </View>
                ))}
              </ScrollView>

              {/* CTA */}
              <View style={{ paddingHorizontal: spacing.s6, paddingTop: spacing.s2 }}>
                <PFButton
                  label={starting ? 'Starting…' : 'Start Workout'}
                  onPress={handleStartWorkout}
                  variant="primary"
                  fullWidth
                  disabled={starting}
                />
              </View>
            </>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchRow: { marginBottom: 8 },
  searchInput: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  inlineChip: { alignSelf: 'flex-start' },
  chip: { alignSelf: 'flex-start' },
  skeletonCard: {},
  skeletonLine: { height: 14, borderRadius: 6 },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sessionRow: {},
});
