/**
 * ExercisePicker — modal exercise search + browse sheet.
 *
 * Shows a search bar (debounced 300 ms) and a flat list of exercises
 * grouped by category. Tapping an exercise calls onSelect and closes.
 *
 * TODO(TICKET-027): swap for PowerSync hook after sync layer lands
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
  SafeAreaView,
} from 'react-native';
import { getExercises, searchExercises } from '../api/exercises';
import { Exercise, ExerciseCategory, ExerciseLibrary } from '../types/api';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';

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
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<ExerciseLibrary | null>(null);
  const [searchResults, setSearchResults] = useState<Exercise[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load full library when modal opens
  // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setSearchResults(null);
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

  // Debounced search
  // TODO(TICKET-027): swap for PowerSync hook after sync layer lands
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length === 0) {
      setSearchResults(null);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await searchExercises(text.trim());
        setSearchResults(result.results);
      } catch {
        // Swallow search errors silently — the library is still visible
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

    return (
      <TouchableOpacity
        style={[styles.exerciseRow, { borderBottomColor: theme.colors.borderDefault }]}
        onPress={() => handleSelect(exercise)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Select ${exercise.name}`}
      >
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.bgPrimary }]}>
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
              placeholder="Search exercises..."
              placeholderTextColor={theme.colors.textTertiary}
              value={query}
              onChangeText={handleQueryChange}
              autoCorrect={false}
              autoCapitalize="none"
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
          ) : listItems.length === 0 && query.trim().length > 0 ? (
            <View style={styles.centered}>
              <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>
                No exercises found for "{query}"
              </Text>
            </View>
          ) : (
            <FlatList
              data={listItems}
              keyExtractor={(item, index) =>
                item.type === 'header' ? `header-${item.category}` : `ex-${item.exercise.id}-${index}`
              }
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              getItemLayout={(_data, index) => ({
                length: 64,
                offset: 64 * index,
                index,
              })}
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
    fontSize: fontSize.bodyLg,  // E-003: was 18
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  closeButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.medium,  // E-003: was '500'
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
    fontSize: fontSize.bodyMd,  // E-003: was 16
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
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.bold,  // E-003: was '700'
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
  exerciseInfo: {
    flex: 1,
    gap: 4,
  },
  exerciseName: {
    fontSize: fontSize.bodyMd,  // E-003: was 16
    fontWeight: fontWeight.medium,  // E-003: was '500'
  },
  exerciseMeta: {
    fontSize: fontSize.bodySm,  // E-003: was 13
  },
  compoundBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 3,
    marginLeft: 8,
  },
  compoundBadgeText: {
    fontSize: fontSize.caption,  // E-003: was 11
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: fontSize.bodySm,  // E-003: was 14
  },
  errorText: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fontSize.bodyMd,  // E-003: was 15
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
    fontSize: fontSize.bodyMd,  // E-003: was 15
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
});
