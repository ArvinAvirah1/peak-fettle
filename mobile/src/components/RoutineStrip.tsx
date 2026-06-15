/**
 * RoutineStrip — TICKET-055/056
 *
 * Two collapsible strips rendered above the active set list in log.tsx:
 *   1. "My Routines"    — user-saved routines (GET /routines)
 *   2. "Starter Splits" — built-in PPL/Upper-Lower templates (GET /templates)
 *
 * Tapping a card opens TemplateDetailSheet showing that routine/template's
 * exercises. The "Start" button calls onStartRoutine / onStartTemplate so
 * log.tsx can seed the routine session and enter the logging flow.
 *
 * Auto-collapses once the caller signals a set has been logged (hasLoggedSets).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, fontSize, fontWeight } from '../theme/tokens';
import { Routine } from '../api/routines';
import { listRoutines } from '../data/routines';
import { useAuth } from '../hooks/useAuth';
import { getTemplates, getTemplate, WorkoutTemplate } from '../api/templates';
import { TemplateDetailSheet, SheetExercise } from './TemplateDetailSheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutineSession {
  /** 'routine' = user-saved; 'template' = starter split; 'free' = ad-hoc session */
  source: 'routine' | 'template' | 'free';
  routineId?: string;
  templateId?: string;
  name: string;
  exercises: RoutineSessionExercise[];
  currentIndex: number;
  weekNumber?: number;
}

export interface RoutineSessionExercise {
  exerciseId: string;
  name: string;
  targetSets?: number;
  targetReps?: string;
  loggedSetCount: number;
  done: boolean;
  category?: 'lift' | 'cardio' | 'sport' | 'mobility';
}

interface RoutineStripProps {
  /** When true, strips auto-collapse (user already started logging) */
  hasLoggedSets: boolean;
  /** Called when the user starts a user routine */
  onStartRoutine: (session: RoutineSession) => void;
  /** Called when the user starts a starter-split template */
  onStartTemplate: (session: RoutineSession) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRoutineSession(routine: Routine): RoutineSession {
  return {
    source: 'routine',
    routineId: routine.id,
    name: routine.name,
    exercises: routine.exercises.map((ex) => ({
      exerciseId: ex.exercise_id,
      name: ex.name,
      targetSets: ex.target_sets,
      targetReps: ex.target_reps,
      loggedSetCount: 0,
      done: false,
    })),
    currentIndex: 0,
  };
}

function buildTemplateSession(template: WorkoutTemplate, sessionIdx = 0): RoutineSession {
  const session = template.sessions?.[sessionIdx];
  const exercises: RoutineSessionExercise[] = (session?.exercises ?? []).map((ex) => ({
    // Template exercises don't have resolved exercise_ids — exercise_id is blank until
    // resolved; log.tsx will handle the "No PB yet" graceful degradation.
    exerciseId: '',
    name: ex.exercise_name,
    targetSets: ex.sets,
    targetReps: ex.reps,
    loggedSetCount: 0,
    done: false,
  }));
  return {
    source: 'template',
    templateId: template.id,
    name: session?.session_name ?? template.name,
    exercises,
    currentIndex: 0,
  };
}

// ---------------------------------------------------------------------------
// SectionHeader chip
// ---------------------------------------------------------------------------

function StripHeader({
  label,
  expanded,
  onToggle,
  rightNode,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  rightNode?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={onToggle}
      style={styles.stripHeader}
      accessibilityRole="button"
      accessibilityLabel={expanded ? `Collapse ${label}` : `Expand ${label}`}
    >
      <Text style={[styles.stripLabel, { color: theme.colors.textTertiary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {rightNode}
        <Text style={{ color: theme.colors.textTertiary, fontSize: fontSize.bodySm }}>
          {expanded ? '▲' : '▼'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// RoutineCard
// ---------------------------------------------------------------------------

function RoutineCard({
  name,
  exerciseCount,
  isBuiltIn,
  onPress,
}: {
  name: string;
  exerciseCount: number;
  isBuiltIn?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.md,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${exerciseCount} exercises`}
    >
      {isBuiltIn && (
        <View
          style={[
            styles.builtInBadge,
            { backgroundColor: theme.colors.accentSecondary, borderRadius: radius.sm },
          ]}
        >
          <Text style={[styles.builtInText, { color: theme.colors.accentDefault }]}>
            ★ Built-in
          </Text>
        </View>
      )}
      <Text style={[styles.cardName, { color: theme.colors.textPrimary }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.cardMeta, { color: theme.colors.textTertiary }]}>
        {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RoutineStrip({
  hasLoggedSets,
  onStartRoutine,
  onStartTemplate,
}: RoutineStripProps): React.ReactElement {
  const { theme } = useTheme();
  // 'Manage →' / routines-tab navigation. (Previously referenced an undefined
  // `router` in this scope — useRouter() only existed inside StripHeader.)
  const router = useRouter();
  const { user } = useAuth();

  // Auto-collapse once the user has logged sets, but allow manual re-expand.
  const [routinesExpanded, setRoutinesExpanded] = useState(true);
  const [splitsExpanded, setSplitsExpanded] = useState(true);

  useEffect(() => {
    if (hasLoggedSets) {
      setRoutinesExpanded(false);
      setSplitsExpanded(false);
    }
  }, [hasLoggedSets]);

  // Data
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loadingRoutines, setLoadingRoutines] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  useEffect(() => {
    // Tier-branched: free/local-first users read the on-device `routines` table
    // (no REST round-trip on Home startup); Pro users hit the server. Fixes the
    // startup delay where every free Home open waited on GET /routines.
    listRoutines(user)
      .then(setRoutines)
      .catch((err: unknown) => { console.warn('[PF] RoutineStrip/listRoutines:', err instanceof Error ? err.message : String(err)); })
      .finally(() => setLoadingRoutines(false));
    // Templates are the global, non-personal library — fine to fetch for everyone.
    getTemplates()
      .then((all) => setTemplates(all.filter((t) => t.is_featured).slice(0, 6)))
      .catch((err: unknown) => { console.warn('[PF] RoutineStrip/getTemplates:', err instanceof Error ? err.message : String(err)); })
      .finally(() => setLoadingTemplates(false));
  }, [user]);

  // Sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetDescription, setSheetDescription] = useState<string | undefined>();
  const [sheetExercises, setSheetExercises] = useState<SheetExercise[]>([]);
  const [sheetOnStart, setSheetOnStart] = useState<() => void>(() => {});
  const [loadingDetail, setLoadingDetail] = useState(false);

  const openRoutineSheet = useCallback((routine: Routine) => {
    setSheetTitle(routine.name);
    setSheetDescription(undefined);
    setSheetExercises(
      routine.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.target_sets,
        reps: ex.target_reps,
        exercise_id: ex.exercise_id,
      }))
    );
    setSheetOnStart(() => () => {
      setSheetVisible(false);
      onStartRoutine(buildRoutineSession(routine));
    });
    setSheetVisible(true);
  }, [onStartRoutine]);

  const openTemplateSheet = useCallback(async (template: WorkoutTemplate) => {
    // If sessions are already loaded (from template detail cache), use them.
    // Otherwise fetch the full template.
    let full = template;
    if (!template.sessions) {
      setLoadingDetail(true);
      try {
        full = await getTemplate(template.id);
      } catch (err) {
        console.warn('[PF] RoutineStrip/openTemplateSheet:', err instanceof Error ? err.message : String(err));
        full = template;
      } finally {
        setLoadingDetail(false);
      }
    }
    const session = full.sessions?.[0];
    setSheetTitle(session?.session_name ?? full.name);
    setSheetDescription(full.description);
    setSheetExercises(
      (session?.exercises ?? []).map((ex) => ({
        name: ex.exercise_name,
        sets: ex.sets,
        reps: ex.reps,
        rest_s: ex.rest_seconds,
        form_cue: ex.form_cue,
      }))
    );
    setSheetOnStart(() => () => {
      setSheetVisible(false);
      onStartTemplate(buildTemplateSession(full));
    });
    setSheetVisible(true);
  }, [onStartTemplate]);

  return (
    <View style={styles.container}>
      {/* ── My Routines ── */}
      <StripHeader
        label="MY ROUTINES"
        expanded={routinesExpanded}
        onToggle={() => setRoutinesExpanded((v) => !v)}
        rightNode={
          <TouchableOpacity
            onPress={() => router.push('/routines')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Manage routines"
          >
            <Text style={{ color: theme.colors.accentDefault, fontSize: fontSize.bodySm }}>
              Manage →
            </Text>
          </TouchableOpacity>
        }
      />

      {routinesExpanded && (
        <View style={styles.stripBody}>
          {loadingRoutines ? (
            <ActivityIndicator size="small" color={theme.colors.accentDefault} style={styles.loader} />
          ) : routines.length === 0 ? (
            <Text style={[styles.emptyState, { color: theme.colors.textTertiary }]}>
              No routines yet. Save a workout as a routine to see it here.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripScroll}
            >
              {routines.map((r) => (
                <RoutineCard
                  key={r.id}
                  name={r.name}
                  exerciseCount={r.exercises.length}
                  onPress={() => openRoutineSheet(r)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Starter Splits ── */}
      <StripHeader
        label="STARTER SPLITS"
        expanded={splitsExpanded}
        onToggle={() => setSplitsExpanded((v) => !v)}
      />

      {splitsExpanded && (
        <View style={styles.stripBody}>
          {loadingTemplates || loadingDetail ? (
            <ActivityIndicator size="small" color={theme.colors.accentDefault} style={styles.loader} />
          ) : templates.length === 0 ? (
            <Text style={[styles.emptyState, { color: theme.colors.textTertiary }]}>
              No templates available.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stripScroll}
            >
              {templates.map((t) => (
                <RoutineCard
                  key={t.id}
                  name={t.name}
                  exerciseCount={t.sessions?.[0]?.exercises?.length ?? t.days_per_week}
                  isBuiltIn
                  onPress={() => openTemplateSheet(t)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Detail sheet */}
      <TemplateDetailSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        title={sheetTitle}
        description={sheetDescription}
        exercises={sheetExercises}
        onStart={sheetOnStart}
        startLabel="Start Workout"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.s2,
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
  },
  stripLabel: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  stripBody: {
    minHeight: 44,
  },
  stripScroll: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s2,
    gap: spacing.s2,
  },
  loader: {
    alignSelf: 'center',
    marginVertical: spacing.s2,
  },
  emptyState: {
    fontSize: fontSize.bodySm,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    fontStyle: 'italic',
  },
  card: {
    width: 140,
    padding: spacing.s3,
    borderWidth: 1,
    gap: 4,
  },
  builtInBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  builtInText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  cardName: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
  },
  cardMeta: {
    fontSize: fontSize.caption,
  },
});
