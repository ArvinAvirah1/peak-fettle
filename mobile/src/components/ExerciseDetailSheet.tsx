/**
 * ExerciseDetailSheet -- TICKET-134 (exercise media v1: muscle diagrams + form cues).
 *
 * A full-screen Modal showing, for one exercise:
 *   - a target-muscle diagram, reusing MuscleHeatmap's body-outline/region SVG
 *     assets (primary = accent fill, secondary = dimmed) -- no new art pipeline.
 *   - exactly 3 written form cues (see exerciseCatalog.ts ENGINE_EXERCISE_MEDIA --
 *     COACHING-CLAIM CONTENT, founder review pass required before ship).
 *   - an equipment tag.
 *   - best set / e1RM / goal, sourced from EXISTING data only:
 *       * LiftProgressChart (already tier-branched local-first/Pro, gives e1RM +
 *         recent-history bars/chart in one reused component).
 *       * exerciseGoals.ts (on-device exercise_goals table, all tiers).
 *   - recent history, via the reused <LiftProgressChart> (its own empty/loading
 *     states already handle "no history yet").
 *
 * Data sources are 100% local-first / already-tier-branched -- this component
 * makes ZERO new network calls of its own (CLAUDE.md #1). Media (muscles/cues)
 * comes only from the on-device exerciseCatalog.ts catalog via getExerciseMedia();
 * when an exercise has no authored media (e.g. a custom/server exercise not in
 * the local catalog), the diagram/cues section is omitted gracefully and only
 * the equipment tag (if known) + history/goal sections render.
 *
 * SAFE-AREA (CLAUDE.md #3): SafeAreaView/insets do not reliably propagate inside
 * a RN <Modal> -- paddingTop: Math.max(insets.top, 12) is applied directly to
 * the header row (same pattern as StepperLogger/RoutineEditorSheet/ScheduleEditorSheet).
 *
 * Entry points (this ticket wires ExercisePicker; logger header + quickSwap are
 * patch snippets in the TICKET-134 report -- StepperLogger.tsx and quickSwap's
 * consumer (WorkoutLoggerHost.tsx) are owned by another Wave-1 agent this run):
 *   <ExerciseDetailSheet
 *     visible={visible}
 *     onClose={() => setVisible(false)}
 *     exercise={{ id: exercise.id, name: exercise.name, equipment: exercise.equipment }}
 *   />
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Svg from 'react-native-svg';
import { Ellipse } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight } from '../theme/tokens';
import { Ionicons } from './Icon';
import { useAuth } from '../hooks/useAuth';
import { getExerciseMedia, ExerciseMedia } from '../lib/trainingEngine/exerciseCatalog';
import { ALL_REGIONS, BodyOutline } from './MuscleHeatmap';
import { getExerciseGoal, ExerciseGoal } from '../data/exerciseGoals';
import { formatWeight } from '../constants/units';
import LiftProgressChart from './LiftProgressChart';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal exercise identity this sheet needs. Deliberately loose (not the full
 * server Exercise type) so it works from ExercisePicker (server Exercise),
 * StepperLogger (name/id only, sometimes off-catalog), and quickSwap's
 * SwapCandidate (id/name/equipment) without any adapter code at the call site.
 */
export interface ExerciseDetailTarget {
  id?: string | null;
  name: string;
  /** Equipment tag(s), when the caller already knows them (skips a lookup). */
  equipment?: string[] | null;
}

export interface ExerciseDetailSheetProps {
  visible: boolean;
  exercise: ExerciseDetailTarget | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Muscle diagram -- thin wrapper around MuscleHeatmap's own region layout
// ---------------------------------------------------------------------------

interface MuscleDiagramProps {
  primary: string[];
  secondary: string[];
  accentColor: string;
  dimColor: string;
  outlineColor: string;
}

function MuscleDiagramSide({
  side,
  primary,
  secondary,
  accentColor,
  dimColor,
  outlineColor,
  t,
}: MuscleDiagramProps & { side: 'front' | 'back'; t: TFunction }): React.ReactElement {
  const regions = ALL_REGIONS.filter((r) => r.side === side);
  const primarySet = new Set(primary);
  const secondarySet = new Set(secondary);
  return (
    <Svg
      width={100}
      height={220}
      viewBox="0 0 120 260"
      accessibilityLabel={side === 'front' ? t('components:exerciseDetailSheet.frontMuscleDiagram') : t('components:exerciseDetailSheet.backMuscleDiagram')}
    >
      <BodyOutline color={outlineColor} />
      {regions.map((reg, i) => {
        const isPrimary = primarySet.has(reg.key);
        const isSecondary = secondarySet.has(reg.key);
        if (!isPrimary && !isSecondary) return null;
        const fill = isPrimary ? accentColor : dimColor;
        return (
          <Ellipse
            key={`${reg.key}-${i}`}
            cx={reg.cx}
            cy={reg.cy}
            rx={reg.rx}
            ry={reg.ry}
            fill={fill + (isPrimary ? 'E6' : '80')}
            stroke={fill}
            strokeWidth={1}
          />
        );
      })}
    </Svg>
  );
}

function MuscleDiagram(props: MuscleDiagramProps): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs } = useTheme();
  const { t } = useTranslation();
  const allKeys = [...props.primary, ...props.secondary];
  const hasFront = ALL_REGIONS.some((r) => r.side === 'front' && allKeys.includes(r.key));
  const hasBack = ALL_REGIONS.some((r) => r.side === 'back' && allKeys.includes(r.key));
  return (
    <View style={diagramStyles.row}>
      {(hasFront || !hasBack) && (
        <View style={diagramStyles.sideWrap}>
          <MuscleDiagramSide side="front" {...props} t={t} />
          <Text style={[diagramStyles.sideLabel, { color: theme.colors.textTertiary, fontSize: fs.micro, marginTop: sp.s1 }]}>
            {t('components:muscleHeatmap.front')}
          </Text>
        </View>
      )}
      {(hasBack || !hasFront) && (
        <View style={diagramStyles.sideWrap}>
          <MuscleDiagramSide side="back" {...props} t={t} />
          <Text style={[diagramStyles.sideLabel, { color: theme.colors.textTertiary, fontSize: fs.micro, marginTop: sp.s1 }]}>
            {t('components:muscleHeatmap.back')}
          </Text>
        </View>
      )}
    </View>
  );
}

const diagramStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-evenly' },
  sideWrap: { alignItems: 'center' },
  sideLabel: { letterSpacing: 1 },
});

// ---------------------------------------------------------------------------
// Section: legend for the muscle diagram
// ---------------------------------------------------------------------------

function MuscleLegend({ accentColor, dimColor }: { accentColor: string; dimColor: string }): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={[legendStyles.row, { marginTop: sp.s2, gap: sp.s4 }]}>
      <View style={legendStyles.item}>
        <View style={[legendStyles.dot, { backgroundColor: accentColor, borderRadius: r.full ?? 999 }]} />
        <Text style={{ color: theme.colors.textSecondary, fontSize: fs.micro }}>{t('components:exerciseDetailSheet.primary')}</Text>
      </View>
      <View style={legendStyles.item}>
        <View style={[legendStyles.dot, { backgroundColor: dimColor, borderRadius: r.full ?? 999 }]} />
        <Text style={{ color: theme.colors.textSecondary, fontSize: fs.micro }}>{t('components:exerciseDetailSheet.secondary')}</Text>
      </View>
    </View>
  );
}

const legendStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8 },
});

// ---------------------------------------------------------------------------
// Section: goal (existing exercise_goals data, all tiers -- on-device only)
// ---------------------------------------------------------------------------

function GoalRow({ goal, unitPref }: { goal: ExerciseGoal; unitPref: 'kg' | 'lbs' }): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { t } = useTranslation();
  const achieved = !!goal.achieved_at;
  return (
    <View
      style={[
        goalStyles.row,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderRadius: r.md,
          padding: sp.s3,
          marginTop: sp.s2,
        },
      ]}
    >
      <Ionicons
        name={achieved ? 'checkmark-circle' : 'flag-outline'}
        size={18}
        color={achieved ? theme.colors.statusSuccess : theme.colors.accentDefault}
      />
      <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodySm, marginLeft: sp.s2 }}>
        {t('components:exerciseDetailSheet.goalLine', {
          weight: formatWeight(goal.target_weight_kg, unitPref, 1),
          reps: goal.target_reps,
        })}
        {achieved ? ` ${t('components:exerciseDetailSheet.goalAchievedSuffix')}` : ''}
      </Text>
    </View>
  );
}

const goalStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExerciseDetailSheet({
  visible,
  exercise,
  onClose,
}: ExerciseDetailSheetProps): React.ReactElement | null {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const unitPref = user?.unit_pref ?? 'kg';

  const [media, setMedia] = useState<ExerciseMedia | null>(null);
  const [goal, setGoal] = useState<ExerciseGoal | null>(null);

  useEffect(() => {
    if (!visible || !exercise) {
      setMedia(null);
      setGoal(null);
      return;
    }
    // Static, on-device, synchronous lookup -- no network, no schema access.
    setMedia(getExerciseMedia({ id: exercise.id, name: exercise.name }));

    // Goal read is on-device (exercise_goals table) for ALL tiers -- safe to
    // call unconditionally, never gated behind is_paid/isLocalFirst.
    let cancelled = false;
    if (exercise.id) {
      getExerciseGoal(exercise.id)
        .then((g) => { if (!cancelled) setGoal(g); })
        .catch(() => { if (!cancelled) setGoal(null); });
    } else {
      setGoal(null);
    }
    return () => { cancelled = true; };
  }, [visible, exercise?.id, exercise?.name]);

  if (!exercise) return null;

  const equipmentTag = (exercise.equipment && exercise.equipment.length > 0)
    ? exercise.equipment[0]
    : (media?.equipment && media.equipment.length > 0 ? media.equipment[0] : null);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.bgPrimary }]} edges={['bottom']}>
        {/* CLAUDE.md #3: paddingTop applied directly to the header row -- insets
            do not reliably propagate to a SafeAreaView's top edge inside a Modal. */}
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.colors.borderDefault, paddingTop: Math.max(insets.top, 12) },
          ]}
        >
          <Text style={[styles.headerTitle, { color: theme.colors.textPrimary, fontSize: fs.bodyLg }]} numberOfLines={1}>
            {exercise.name}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('components:exerciseDetailSheet.closeAccessibilityLabel')}
          >
            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { padding: sp.s5 }]} showsVerticalScrollIndicator={false}>
          {/* Equipment tag */}
          {equipmentTag && (
            <View
              style={[
                styles.equipmentTag,
                {
                  backgroundColor: theme.colors.accentPressed,
                  borderRadius: r.sm,
                  marginBottom: sp.s4,
                },
              ]}
            >
              <Text style={{ color: theme.colors.accentSecondary, fontSize: fs.caption, fontWeight: fontWeight.semibold }}>
                {equipmentTag.charAt(0).toUpperCase() + equipmentTag.slice(1)}
              </Text>
            </View>
          )}

          {/* Muscle diagram + cues -- only when this exercise has authored media */}
          {media ? (
            <>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, fontSize: fs.bodyMd, marginBottom: sp.s2 }]}>
                {t('components:exerciseDetailSheet.targetMuscles')}
              </Text>
              <MuscleDiagram
                primary={media.primary_muscles}
                secondary={media.secondary_muscles}
                accentColor={theme.colors.accentDefault}
                dimColor={theme.colors.borderDefault}
                outlineColor={theme.colors.borderDefault}
              />
              <MuscleLegend accentColor={theme.colors.accentDefault} dimColor={theme.colors.borderDefault} />

              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, fontSize: fs.bodyMd, marginTop: sp.s5, marginBottom: sp.s2 }]}>
                {t('components:exerciseDetailSheet.formCues')}
              </Text>
              {media.cues.map((cue, i) => (
                <View key={i} style={[styles.cueRow, { marginBottom: sp.s2 }]}>
                  <View style={[styles.cueBadge, { backgroundColor: theme.colors.accentDefault, borderRadius: r.full ?? 999 }]}>
                    <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.caption, fontWeight: fontWeight.bold }}>
                      {i + 1}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, flex: 1, marginLeft: sp.s2, lineHeight: 20 }}>
                    {cue}
                  </Text>
                </View>
              ))}
            </>
          ) : (
            <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s4 }}>
              {t('components:exerciseDetailSheet.noMediaYet')}
            </Text>
          )}

          {/* Goal (existing on-device data, all tiers) */}
          {goal && <GoalRow goal={goal} unitPref={unitPref} />}

          {/* Best set / e1RM / recent history -- existing tier-branched component */}
          {exercise.id && (
            <View style={{ marginTop: sp.s6 }}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary, fontSize: fs.bodyMd, marginBottom: sp.s2 }]}>
                {t('components:exerciseDetailSheet.progress')}
              </Text>
              <LiftProgressChart exerciseId={exercise.id} exerciseName={exercise.name} unitPref={unitPref} />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default ExerciseDetailSheet;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontWeight: fontWeight.bold, flex: 1, marginRight: 12 },
  closeButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 48 },
  equipmentTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4 },
  sectionTitle: { fontWeight: fontWeight.semibold },
  cueRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cueBadge: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
