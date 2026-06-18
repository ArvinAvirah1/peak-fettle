/**
 * ExercisePicker — modal exercise search + browse sheet.
 *
 * Shows a search bar (debounced 300 ms) and a flat list of exercises
 * grouped by category. Tapping an exercise calls onSelect and closes.
 *
 * Free-text / custom exercise: when the user types a name that isn't in the
 * library, an "Add as custom exercise" button appears. Tapping it calls
 * POST /exercises (which uses ON CONFLICT DO NOTHING so the same name always
 * returns the same server-assigned UUID) and immediately selects the result.
 *
 * PowerSync does not cache the exercise library (read-only global table) —
 * direct API calls via getExercises/searchExercises are correct here.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExercises, searchExercises, createExercise } from '../api/exercises';
import { Exercise, ExerciseCategory, ExerciseLibrary } from '../types/api';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { useAuth } from '../hooks/useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { MuscleMap } from './MuscleMap';
import { muscleGroupsForExercise } from '../data/muscleRegions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: ExerciseCategory[] = ['lift', 'cardio', 'sport', 'mobility'];

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  lift: 'Strength',
  cardio: 'Cardio',
  sport: 'Sport',
  mobility: 'Mobility',
};

const DEBOUNCE_MS = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExercisePickerProps {
  visible: boolean;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

type ListItem =
  | { type: 'header'; category: ExerciseCategory }
  | { type: 'exercise'; exercise: Exercise };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ExercisePicker({
  visible,
  onSelect,
  onClose,
}: ExercisePickerProps): React.ReactElement {
  const { theme } = useTheme();
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<ExerciseLibrary | null>(null);
  const [searchResults, setSearchResults] = useState<Exercise[] | null>(null);
  // TICKET-089: distinguish "search request failed" from "0 genuine matches" so
  // we don't show the misleading "add as custom" empty state when the backend is
  // actually erroring (which would let users create duplicates of real exercises).
  const [searchFailed, setSearchFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList>(null);

  // Load full library when modal opens.
  // PowerSync does not cache exercises (global read-only library) — direct API call is correct.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSearchResults(null);
    setSearchFailed(false);
    setError(null);
    setIsLoading(true);

    getExercises()
      .then((lib) => setLibrary(lib))
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : 'Failed to load exercises';
        setError(message);
      })
      .finally(() => setIsLoading(false));
  }, [visible]);

  // Scroll to top whenever the result set changes (search results ↔ full library).
  // This ensures the top-ranked match is visible without manual scrolling.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searchResults]);

  // Debounced search.
  // PowerSync does not cache exercises (global read-only library) — direct API call is correct.
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length === 0) {
      setSearchResults(null);
      setSearchFailed(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await searchExercises(text.trim());
        setSearchResults(result.results);
        setSearchFailed(false);
      } catch (err) {
        // TICKET-089: a real failure is NOT "0 matches" — flag it so the UI shows
        // a retryable error instead of the misleading "add as custom" empty state.
        console.warn('[PF] ExercisePicker/handleQueryChange:', err instanceof Error ? err.message : String(err));
        setSearchResults([]);
        setSearchFailed(true);
      }
    }, DEBOUNCE_MS);
  }, []);

  // Build flat list items from library (grouped by category)
  const buildLibraryItems = useCallback((): ListItem[] => {
    if (!library) return [];
    const items: ListItem[] = [];
    for (const cat of CATEGORY_ORDER) {
      const exercises = library.exercises[cat];
      if (!exercises || exercises.length === 0) continue;
      items.push({ type: 'header', category: cat });
      for (const ex of exercises) {
        items.push({ type: 'exercise', exercise: ex });
      }
    }
    return items;
  }, [library]);

  const listItems: ListItem[] = searchResults
    ? searchResults.map((ex) => ({ type: 'exercise' as const, exercise: ex }))
    : buildLibraryItems();

  const handleSelect = useCallback(
    (exercise: Exercise) => {
      onSelect(exercise);
    },
    [onSelect]
  );

  // Create a custom exercise from the current search query, then select it.
  // Uses POST /exercises which returns the real server-assigned UUID (or the
  // existing row's UUID if the name already exists — safe to call redundantly).
  // This is the correct path for exercises not in the library; using a mock
  // UUID would cause a FK violation on POST /sets.
  // FREE (local-first) users must not call POST /exercises (exercisepicker-free-user-api).
  // For free users, show an upgrade prompt instead.
  const handleCreateCustom = useCallback(async () => {
    const name = query.trim();
    if (!name) return;
    if (localFirst) {
      // Personal custom-exercise creation is a server write — gate it behind Pro.
      setError('Creating custom exercises requires a Pro account. Upgrade to add your own exercises.');
      return;
    }
    setIsCreating(true);
    try {
      const exercise = await createExercise(name);
      onSelect(exercise);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add exercise';
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  }, [query, onSelect, localFirst]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionHeaderText, { color: theme.colors.textTertiary }]}>
            {CATEGORY_LABELS[item.category]}
          </Text>
        </View>
      );
    }

    const { exercise } = item;
    const muscleLabel =
      exercise.muscle_groups.length > 0
        ? exercise.muscle_groups.slice(0, 2).join(', ')
        : null;
    const muscleGroups = muscleGroupsForExercise(exercise.name, exercise.muscle_groups);

    return (
      <TouchableOpacity
        style={[styles.exerciseRow, { borderBottomColor: theme.colors.borderDefault }]}
        onPress={() => handleSelect(exercise)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Select ${exercise.name}`}
      >
        {/* Compact muscle map — 44 pt tall, front view only */}
        <MuscleMap
          groups={muscleGroups}
          size={44}
          view="front"
          style={styles.exerciseRowMap}
        />
        <View style={styles.exerciseInfo}>
          <Text style={[styles.exerciseName, { color: theme.colors.textPrimary }]}>{exercise.name}</Text>
          {muscleLabel ? (
            <Text style={[styles.exerciseMeta, { color: theme.colors.textTertiary }]}>{muscleLabel}</Text>
          ) : null}
        </View>
        {exercise.is_compound && (
          <View style={[styles.compoundBadge, { backgroundColor: theme.colors.accentPressed }]}>
            <Text style={[styles.compoundBadgeText, { color: theme.colors.accentSecondary }]}>Compound</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Footer shown at the bottom of search results (or in place of them) so the
  // user can add any exercise not yet in the library by exact typed name.
  const renderCustomButton = () => {
    if (query.trim().length === 0) return null;
    return (
      <TouchableOpacity
        style={[styles.customFooter, { borderTopColor: theme.colors.borderDefault }]}
        onPress={handleCreateCustom}
        disabled={isCreating}
        accessibilityRole="button"
        accessibilityLabel={`Add ${query.trim()} as a custom exercise`}
      >
        {isCreating ? (
          <ActivityIndicator color={theme.colors.accentDefault} size="small" />
        ) : (
          <Text style={[styles.customFooterText, { color: theme.colors.accentDefault }]}>
            + Add "{query.trim()}" as custom exercise
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bgPrimary }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.colors.borderDefault }]}>
            <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Choose Exercise</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close exercise picker"
            >
              <Text style={[styles.closeButtonText, { color: theme.colors.accentDefault }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={[styles.searchContainer, { borderBottomColor: theme.colors.borderDefault }]}>
            <TextInput
              style={[styles.searchInput, {
                backgroundColor: theme.colors.bgSecondary,
                color: theme.colors.textPrimary,
                borderColor: theme.colors.borderDefault,
              }]}
              placeholder="Search exercises or type a custom name…"
              placeholderTextColor={theme.colors.textTertiary}
              value={query}
              onChangeText={handleQueryChange}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              clearButtonMode="while-editing"
              accessibilityLabel="Search exercises"
            />
          </View>

          {/* Content */}
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.colors.accentDefault} />
              <Text style={[styles.loadingText, { color: theme.colors.textTertiary }]}>Loading exercises...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={[styles.errorText, { color: theme.colors.statusError }]}>{error}</Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault }]}
                accessibilityRole="button"
                accessibilityLabel="Retry"
                onPress={() => {
                  setError(null);
                  setIsLoading(true);
                  getExercises()
                    .then(setLibrary)
                    .catch((e) =>
                      setError(
                        e instanceof Error ? e.message : 'Failed to load exercises'
                      )
                    )
                    .finally(() => setIsLoading(false));
                }}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.accentDefault }]}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : searchFailed && query.trim().length > 0 ? (
            // TICKET-089: search request failed (network/5xx) — show a retryable
            // error, NOT the "add as custom" empty state (which would let users
            // create duplicates of exercises that actually exist).
            <View style={styles.centered}>
              <Text style={[styles.errorText, { color: theme.colors.statusError }]}>
                Couldn't search exercises. Check your connection and try again.
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault }]}
                accessibilityRole="button"
                accessibilityLabel="Retry search"
                onPress={() => {
                  // Clear the stale error/failed flags before retrying so the
                  // user sees a loading state rather than the old error message
                  // (exercise-picker-stale-error-on-retry).
                  setSearchFailed(false);
                  setSearchResults(null);
                  handleQueryChange(query);
                }}
              >
                <Text style={[styles.retryButtonText, { color: theme.colors.accentDefault }]}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : listItems.length === 0 && query.trim().length > 0 ? (
            // No search results — offer to add the typed name as a custom exercise
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                No exercises found for "{query}"
              </Text>
              {renderCustomButton()}
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={listItems}
              keyExtractor={(item, index) =>
                item.type === 'header' ? `header-${item.category}` : `ex-${item.exercise.id}-${index}`
              }
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              // When searching, show "Add as custom" below results so users can
              // log anything not in the library without clearing their query.
              // Pass the function reference (not the call result) so FlatList
              // renders it lazily and always sees the current query (WL-007).
              ListFooterComponent={renderCustomButton}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  searchContainer: {
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  searchInput: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    fontSize: fontSize.bodyMd,
    minHeight: 48,
    borderWidth: 1,
  },
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: spacing.s5,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    minHeight: 64,
    borderBottomWidth: 1,
  },
  exerciseRowMap: {
    marginRight: spacing.s3,
    flexShrink: 0,
  },
  exerciseInfo: {
    flex: 1,
    gap: 4,
  },
  exerciseName: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
  exerciseMeta: {
    fontSize: fontSize.bodySm,
  },
  compoundBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 3,
    marginLeft: 8,
  },
  compoundBadgeText: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: fontSize.bodySm,
  },
  errorText: {
    fontSize: fontSize.bodyMd,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fontSize.bodyMd,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.s6,
    paddingVertical: spacing.s3,
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
  },
  retryButtonText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.semibold,
  },
  customFooter: {
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'flex-start',
    borderTopWidth: 1,
  },
  customFooterText: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.medium,
  },
});
