/**
 * Log tab — active workout header + set list + exercise picker + set entry form.
 *
 * TICKET-017: core set-tracking flow.
 * TICKET-027: PowerSync offline sync integration (read path wired; sync indicator added).
 *
 * Data architecture (post TICKET-027):
 *   READ  — usePowerSyncWorkout(todayKey): reactive SQLite queries via PowerSync.
 *           Updates automatically when sync pushes new data or local writes land.
 *   WRITE — apiLogSet / apiDeleteSet called directly. PowerSync connector queues
 *           these via uploadData() → Express API → Postgres → sync back to SQLite.
 *           createWorkout() is called once on mount to ensure today's row exists
 *           server-side; PowerSync syncs it down so the reactive query picks it up.
 *
 * Sections:
 *   A. Workout header  — date, set count, sync indicator, "+" button
 *   B. Set list        — sets grouped by exercise, trash to delete
 *   C. ExercisePicker  — modal search + browse
 *   D. SetEntryForm    — modal lift/cardio form
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { usePowerSyncWorkout } from '../../src/hooks/usePowerSyncWorkout';
import { useAuth } from '../../src/hooks/useAuth';
import { ExercisePicker } from '../../src/components/ExercisePicker';
import { SetEntryForm } from '../../src/components/SetEntryForm';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { formatWeight } from '../../src/constants/units';
import { createWorkout } from '../../src/api/workouts';
import { logSet as apiLogSet, deleteSet as apiDeleteSet } from '../../src/api/sets';
import { Exercise, WorkoutSet, LiftSet, CardioSet, LogSetPayload } from '../../src/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatTodayHeader(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatDuration(durationSec: number): string {
  const mm = Math.floor(durationSec / 60);
  const ss = durationSec % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function formatDistance(distanceM: number | null, unitPref: 'kg' | 'lbs'): string | null {
  if (distanceM === null) return null;
  if (unitPref === 'lbs') {
    return `${(distanceM / 1609.344).toFixed(2)} mi`;
  }
  return `${(distanceM / 1000).toFixed(2)} km`;
}

// Group sets by exercise_id, preserving insertion order of first occurrence.
interface ExerciseGroup {
  exerciseId: string;
  sets: WorkoutSet[];
}

function groupSetsByExercise(sets: WorkoutSet[]): ExerciseGroup[] {
  const map = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const list = map.get(s.exercise_id) ?? [];
    list.push(s);
    map.set(s.exercise_id, list);
  }
  return Array.from(map.entries()).map(([exerciseId, groupSets]) => ({
    exerciseId,
    sets: groupSets,
  }));
}

function countSetsForExercise(sets: WorkoutSet[], exerciseId: string): number {
  return sets.filter((s) => s.exercise_id === exerciseId).length;
}

// ---------------------------------------------------------------------------
// SetRow
// ---------------------------------------------------------------------------

interface SetRowProps {
  set: WorkoutSet;
  setNumber: number;
  unitPref: 'kg' | 'lbs';
  onDelete: (id: string) => void;
}

function SetRow({ set, setNumber, unitPref, onDelete }: SetRowProps): React.ReactElement {
  const handleDelete = useCallback(() => {
    Alert.alert('Delete Set', 'Remove this set from your workout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => onDelete(set.id),
      },
    ]);
  }, [set.id, onDelete]);

  let primaryLabel: string;
  let secondaryLabel: string | null = null;
  let rirLabel: string | null = null;

  if (set.kind === 'lift') {
    const liftSet = set as LiftSet;
    primaryLabel = `${formatWeight(liftSet.weight_kg, unitPref)} × ${liftSet.reps} reps`;
    if (liftSet.rir !== null && liftSet.rir >= 0) {
      rirLabel = liftSet.rir === 0 ? 'to failure' : `RIR ${liftSet.rir}`;
    }
  } else {
    const cardioSet = set as CardioSet;
    primaryLabel = formatDuration(cardioSet.duration_sec);
    const dist = formatDistance(cardioSet.distance_m, unitPref);
    if (dist) secondaryLabel = dist;
  }

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.setNum}>
        <Text style={rowStyles.setNumText}>{setNumber}</Text>
      </View>
      <View style={rowStyles.labels}>
        <Text style={rowStyles.primary}>{primaryLabel}</Text>
        {secondaryLabel ? (
          <Text style={rowStyles.secondary}>{secondaryLabel}</Text>
        ) : null}
        {rirLabel ? (
          <Text style={rowStyles.rir}>{rirLabel}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={rowStyles.deleteButton}
        onPress={handleDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Delete set"
      >
        <Text style={rowStyles.deleteIcon}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    minHeight: 56,
  },
  setNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#312e81',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  setNumText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a5b4fc',
  },
  labels: {
    flex: 1,
    gap: 2,
  },
  primary: {
    fontSize: 16,
    fontWeight: '500',
    color: '#f8fafc',
  },
  secondary: {
    fontSize: 13,
    color: '#64748b',
  },
  rir: {
    fontSize: 12,
    color: '#818cf8',
  },
  deleteButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    fontSize: 16,
  },
});

// ---------------------------------------------------------------------------
// ExerciseGroupCard
// ---------------------------------------------------------------------------

interface ExerciseGroupCardProps {
  group: ExerciseGroup;
  exerciseNames: Map<string, string>;
  unitPref: 'kg' | 'lbs';
  onDelete: (id: string) => void;
}

function ExerciseGroupCard({
  group,
  exerciseNames,
  unitPref,
  onDelete,
}: ExerciseGroupCardProps): React.ReactElement {
  const name = exerciseNames.get(group.exerciseId) ?? group.exerciseId;
  return (
    <View style={cardStyles.container}>
      <View style={cardStyles.header}>
        <Text style={cardStyles.exerciseName}>{name}</Text>
        <Text style={cardStyles.setCount}>
          {group.sets.length} set{group.sets.length !== 1 ? 's' : ''}
        </Text>
      </View>
      {group.sets.map((s, i) => (
        <SetRow
          key={s.id}
          set={s}
          setNumber={i + 1}
          unitPref={unitPref}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    flex: 1,
  },
  setCount: {
    fontSize: 13,
    color: '#64748b',
    marginLeft: 8,
  },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LogScreen(): React.ReactElement {
  const { user } = useAuth();
  const unitPref = user?.unit_pref ?? 'kg';

  // Stable today key — does not change for the lifetime of this screen mount.
  const todayKey = useMemo(() => getTodayKey(), []);

  // READ path — reactive from local PowerSync SQLite.
  // Re-renders automatically when sync delivers new data or local writes land.
  const { workout, sets, isLoading, error } = usePowerSyncWorkout(todayKey);

  // Ensure today's workout exists server-side on mount. PowerSync will sync it
  // down to local SQLite, which triggers usePowerSyncWorkout to return it.
  // createWorkout is idempotent — safe to call every mount.
  useEffect(() => {
    createWorkout(todayKey).catch((err: unknown) => {
      console.warn('[LogScreen] createWorkout failed:', err);
    });
  }, [todayKey]);

  // Modal state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  // Cache exercise names so group cards can display them without a library fetch.
  const [exerciseNames, setExerciseNames] = useState<Map<string, string>>(new Map());

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const groups = useMemo(() => groupSetsByExercise(sets), [sets]);
  const totalSets = sets.length;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleExerciseSelect = useCallback((exercise: Exercise) => {
    setPickerVisible(false);
    setSelectedExercise(exercise);
    setExerciseNames((prev) => {
      if (prev.has(exercise.id)) return prev;
      const next = new Map(prev);
      next.set(exercise.id, exercise.name);
      return next;
    });
  }, []);

  const handleSetLogged = useCallback((_set: WorkoutSet) => {
    // usePowerSyncWorkout updates reactively once PowerSync syncs the new set.
    // No manual state update required here.
  }, []);

  // WRITE path — calls Express API directly.
  // PowerSync connector's uploadData() will flush this to the server, then
  // sync the confirmed row back to local SQLite, triggering a reactive update.
  const handleSubmitSet = useCallback(
    async (payload: LogSetPayload): Promise<WorkoutSet> => {
      return apiLogSet(payload);
    },
    []
  );

  const handleDeleteSet = useCallback(async (id: string) => {
    try {
      await apiDeleteSet(id);
    } catch (err) {
      Alert.alert(
        'Delete failed',
        err instanceof Error ? err.message : 'Could not delete set'
      );
    }
  }, []);

  const nextSetIndex = selectedExercise
    ? countSetsForExercise(sets, selectedExercise.id)
    : 0;

  const errorMessage = error instanceof Error ? error.message : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      {/* ---- A. Workout header ---- */}
      <View style={styles.workoutHeader}>
        <View style={styles.workoutHeaderText}>
          <Text style={styles.dateLabel}>{formatTodayHeader()}</Text>
          <Text style={styles.setCountLabel}>
            {isLoading
              ? 'Loading…'
              : `${totalSets} set${totalSets !== 1 ? 's' : ''} logged`}
          </Text>
        </View>
        {/* Sync status pill — shows synced / syncing / offline at a glance */}
        <SyncStatusIndicator />
        <TouchableOpacity
          style={[styles.addButton, !workout && styles.addButtonDisabled]}
          onPress={() => setPickerVisible(true)}
          disabled={!workout || isLoading}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* ---- Error banner (no manual retry — PowerSync reconnects automatically) ---- */}
      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* ---- B. Set list ---- */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#818cf8" />
          <Text style={styles.loadingText}>Loading workout…</Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No sets yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Tap + to log your first set
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.setList}
          contentContainerStyle={styles.setListContent}
          showsVerticalScrollIndicator={false}
        >
          {groups.map((group) => (
            <ExerciseGroupCard
              key={group.exerciseId}
              group={group}
              exerciseNames={exerciseNames}
              unitPref={unitPref}
              onDelete={handleDeleteSet}
            />
          ))}
          <View style={styles.bottomPad} />
        </ScrollView>
      )}

      {/* ---- C. Exercise picker modal ---- */}
      <ExercisePicker
        visible={pickerVisible}
        onSelect={handleExerciseSelect}
        onClose={() => setPickerVisible(false)}
      />

      {/* ---- D. Set entry form modal ---- */}
      {selectedExercise && workout ? (
        <SetEntryForm
          exercise={selectedExercise}
          workoutId={workout.id}
          nextSetIndex={nextSetIndex}
          unitPref={unitPref}
          onLogged={handleSetLogged}
          onClose={() => setSelectedExercise(null)}
          onSubmit={handleSubmitSet}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 10,
  },
  workoutHeaderText: {
    flex: 1,
    gap: 4,
  },
  dateLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f8fafc',
  },
  setCountLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontSize: 24,
    fontWeight: '300',
    color: '#fff',
    lineHeight: 28,
  },
  errorBanner: {
    backgroundColor: '#450a0a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#7f1d1d',
  },
  errorBannerText: {
    fontSize: 14,
    color: '#fca5a5',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
  },
  emptyStateSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  setList: {
    flex: 1,
  },
  setListContent: {
    paddingTop: 16,
  },
  bottomPad: {
    height: 32,
  },
});
