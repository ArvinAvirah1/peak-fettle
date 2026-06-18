/**
 * TemplateDetailSheet — TICKET-055
 * Bottom-sheet showing a template/routine's exercise list.
 * Extracted from templates.tsx so both the Templates screen and the
 * Log tab RoutineStrip can render the same sheet.
 *
 * Props:
 *   visible     — controls Modal visibility
 *   onClose     — dismiss handler
 *   title       — sheet heading (template/routine name)
 *   exercises   — flat list of exercises to display
 *   onStart     — called when the user taps "Start" — caller decides what to do
 *   startLabel  — optional CTA label override (default "Start Workout")
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { spacing, radius, fontSize, fontWeight } from '../theme/tokens';
import { MuscleMap } from './MuscleMap';
import { muscleGroupsForRoutine } from '../data/muscleRegions';

export interface SheetExercise {
  /** Display name — may be a template exercise_name or a resolved exercise name */
  name: string;
  sets?: number;
  reps?: string;    // "8-12" or "5" or undefined
  rest_s?: number;
  form_cue?: string;
  /** For routines: the resolved exercise_id needed for logging */
  exercise_id?: string;
}

interface TemplateDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  exercises: SheetExercise[];
  onStart: () => void;
  startLabel?: string;
}

export function TemplateDetailSheet({
  visible,
  onClose,
  title,
  description,
  exercises,
  onStart,
  startLabel = 'Start Workout',
}: TemplateDetailSheetProps): React.ReactElement {
  const { theme } = useTheme();
  // Compute aggregated muscle groups for the whole routine
  const routineMuscleGroups = muscleGroupsForRoutine(exercises);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close sheet"
      />

      {/* Sheet */}
      <SafeAreaView
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.bgPrimary,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
          },
        ]}
      >
        {/* Drag pill */}
        <View style={[styles.pill, { backgroundColor: theme.colors.borderDefault }]} />

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.borderDefault }]}>
          <Text
            style={[styles.title, { color: theme.colors.textPrimary }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={{ fontSize: fontSize.bodyLg, color: theme.colors.textTertiary }}>✕</Text>
          </TouchableOpacity>
        </View>

        {description ? (
          <Text
            style={[styles.description, { color: theme.colors.textSecondary }]}
            numberOfLines={3}
          >
            {description}
          </Text>
        ) : null}

        {/* Routine muscle map — aggregated front+back view */}
        {routineMuscleGroups.length > 0 ? (
          <View
            style={[
              styles.muscleMapContainer,
              {
                borderBottomColor: theme.colors.borderDefault,
              },
            ]}
          >
            <MuscleMap
              groups={routineMuscleGroups}
              size={80}
              view="both"
            />
          </View>
        ) : null}

        {/* Exercise list */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: spacing.s5 }}
          showsVerticalScrollIndicator={false}
        >
          {exercises.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
              No exercises in this session.
            </Text>
          ) : (
            exercises.map((ex, i) => (
              <View
                key={`${ex.name}-${i}`}
                style={[
                  styles.exRow,
                  {
                    backgroundColor: theme.colors.bgSecondary,
                    borderRadius: radius.md,
                    marginBottom: spacing.s2,
                  },
                ]}
              >
                {/* Index badge */}
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: theme.colors.accentSecondary,
                      borderRadius: radius.sm,
                    },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: theme.colors.accentDefault }]}>
                    {i + 1}
                  </Text>
                </View>

                {/* Name + targets */}
                <View style={styles.exInfo}>
                  <Text
                    style={[styles.exName, { color: theme.colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {ex.name}
                  </Text>
                  {(ex.sets || ex.reps) ? (
                    <Text style={[styles.exTarget, { color: theme.colors.textTertiary }]}>
                      {[
                        ex.sets ? `${ex.sets} sets` : null,
                        ex.reps ? `${ex.reps} reps` : null,
                        ex.rest_s ? `${ex.rest_s}s rest` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                  {ex.form_cue ? (
                    <Text
                      style={[styles.formCue, { color: theme.colors.textTertiary }]}
                      numberOfLines={2}
                    >
                      {ex.form_cue}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* CTA */}
        <View style={[styles.footer, { borderTopColor: theme.colors.borderDefault }]}>
          <TouchableOpacity
            onPress={onStart}
            disabled={exercises.length === 0}
            style={[
              styles.startBtn,
              {
                backgroundColor:
                  exercises.length === 0
                    ? theme.colors.bgElevated
                    : theme.colors.accentDefault,
                borderRadius: radius.md,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={startLabel}
          >
            <Text
              style={[
                styles.startBtnText,
                {
                  color:
                    exercises.length === 0
                      ? theme.colors.textTertiary
                      : theme.components.buttonPrimaryText,
                },
              ]}
            >
              {startLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '85%',
  },
  pill: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: spacing.s3,
    marginBottom: spacing.s2,
  },
  muscleMapContainer: {
    alignItems: 'center',
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
    borderBottomWidth: 1,
  },
  title: {
    flex: 1,
    fontSize: fontSize.heading3,
    fontWeight: fontWeight.bold,
    marginRight: spacing.s3,
  },
  description: {
    fontSize: fontSize.bodySm,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
    paddingBottom: spacing.s1,
    lineHeight: 18,
  },
  list: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    flexShrink: 1,
  },
  emptyText: {
    fontSize: fontSize.bodySm,
    textAlign: 'center',
    marginTop: spacing.s4,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.s3,
  },
  badge: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.s3,
    marginTop: 1,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
  },
  exInfo: {
    flex: 1,
    gap: 2,
  },
  exName: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  exTarget: {
    fontSize: fontSize.bodySm,
  },
  formCue: {
    fontSize: fontSize.caption,
    fontStyle: 'italic',
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s4,
    borderTopWidth: 1,
  },
  startBtn: {
    alignItems: 'center',
    paddingVertical: spacing.s4,
  },
  startBtnText: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
});
