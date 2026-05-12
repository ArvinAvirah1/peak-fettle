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
          <Text style={styles.sectionHeaderText}>
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
        style={styles.exerciseRow}
        onPress={() => handleSelect(exercise)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Select ${exercise.name}`}
      >
        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {muscleLabel ? (
            <Text style={styles.exerciseMeta}>{muscleLabel}</Text>
          ) : null}
        </View>
        {exercise.is_compound && (
          <View style={styles.compoundBadge}>
            <Text style={styles.compoundBadgeText}>Compound</Text>
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
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Choose Exercise</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close exercise picker"
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Search bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor="#64748b"
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
              <ActivityIndicator size="large" color="#818cf8" />
              <Text style={styles.loadingText}>Loading exercises...</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
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
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : listItems.length === 0 && query.trim().length > 0 ? (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
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
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#818cf8',
    fontWeight: '500',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  searchInput: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f8fafc',
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#334155',
  },
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    minHeight: 64,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  exerciseInfo: {
    flex: 1,
    gap: 4,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#f8fafc',
  },
  exerciseMeta: {
    fontSize: 13,
    color: '#64748b',
  },
  compoundBadge: {
    backgroundColor: '#312e81',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  compoundBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#a5b4fc',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  errorText: {
    fontSize: 15,
    color: '#f87171',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#818cf8',
  },
});
