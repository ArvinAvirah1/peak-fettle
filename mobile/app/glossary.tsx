/**
 * Glossary screen — TICKET-043 / ROADMAP 1.1
 *
 * Searchable list of every fitness term used in the app.
 * Supports deep-linking via ?term=<slug> (opens pre-filtered to that term).
 *
 * Data lives in src/utils/glossaryTerms.ts — a local typed constant so the
 * glossary is always available offline (project rule: offline-first).
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SafeAreaView,
  StyleSheet,
  ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { GLOSSARY_TERMS, GlossaryTermEntry } from '../src/utils/glossaryTerms';
// TICKET-128: RIR ⇄ RPE display toggle. Local-only KV read (zero network,
// safe on mount) — the glossary badges whichever of RIR/RPE is the user's
// CURRENT effort-display setting, so the reference always matches the app.
import { getEffortDisplay, EffortDisplay } from '../src/data/appSettings';

// ---------------------------------------------------------------------------
// Term row
// ---------------------------------------------------------------------------

function TermRow({
  item,
  effortDisplay,
}: {
  item: GlossaryTermEntry;
  /** Current effort-display setting ('rir' | 'rpe'), or null while loading. */
  effortDisplay: EffortDisplay | null;
}): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const colors = theme.colors;
  // Badge whichever of the RIR/RPE glossary rows matches the user's CURRENT
  // setting — the glossary "respects the setting" by pointing at the active one
  // rather than changing the (educational) definition text itself.
  const isActiveEffortTerm = effortDisplay != null && item.slug === effortDisplay;
  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.bgSecondary,
          borderRadius: radius.md,
          marginHorizontal: spacing.s4,
          marginBottom: spacing.s3,
          padding: spacing.s4,
          borderWidth: 1,
          borderColor: isActiveEffortTerm ? colors.accentDefault : colors.borderDefault,
        },
      ]}
    >
      <View style={styles.rowHeader}>
        <Text
          style={{
            fontSize: fontSize.bodyLg,
            fontWeight: fontWeight.semibold,
            color: colors.textPrimary,
            flexShrink: 1,
          }}
        >
          {item.term}
        </Text>
        {item.category ? (
          <View
            style={[
              styles.categoryChip,
              {
                backgroundColor: colors.accentDefault + '1A',
                borderRadius: radius.sm,
                paddingHorizontal: spacing.s2,
                paddingVertical: 2,
                marginLeft: spacing.s2,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fontSize.caption,
                color: colors.accentDefault,
                fontWeight: fontWeight.medium,
              }}
            >
              {item.category}
            </Text>
          </View>
        ) : null}
        {isActiveEffortTerm ? (
          <View
            style={[
              styles.categoryChip,
              {
                backgroundColor: colors.accentDefault,
                borderRadius: radius.sm,
                paddingHorizontal: spacing.s2,
                paddingVertical: 2,
                marginLeft: spacing.s2,
              },
            ]}
          >
            <Text
              style={{
                fontSize: fontSize.caption,
                color: colors.bgPrimary,
                fontWeight: fontWeight.medium,
              }}
            >
              Your setting
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={{
          fontSize: fontSize.bodyMd,
          color: colors.textSecondary,
          marginTop: spacing.s1,
          lineHeight: 22,
        }}
      >
        {item.definition}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GlossaryScreen(): React.ReactElement {
  const { term: initialTerm } = useLocalSearchParams<{ term?: string }>();
  const [query, setQuery] = useState<string>(initialTerm ?? '');
  const { theme, fontSize, spacing, radius } = useTheme();
  const colors = theme.colors;
  const listRef = useRef<FlatList<GlossaryTermEntry>>(null);

  // TICKET-128: which of RIR/RPE is the user's current effort-display setting.
  // null while loading — TermRow treats null as "no badge yet" rather than
  // guessing, so a fresh load never flashes the wrong term as "Your setting".
  const [effortDisplay, setEffortDisplay] = useState<EffortDisplay | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEffortDisplay()
      .then((mode) => { if (!cancelled) setEffortDisplay(mode); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo<GlossaryTermEntry[]>(
    () =>
      GLOSSARY_TERMS.filter(
        (t) =>
          t.term.toLowerCase().includes(query.toLowerCase()) ||
          t.definition.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  // When opened via deep-link (?term=<slug>), scroll to the matching entry
  useEffect(() => {
    if (!initialTerm || filtered.length === 0) return;
    const idx = filtered.findIndex((t) => t.slug === initialTerm);
    if (idx > 0) {
      setTimeout(() => listRef.current?.scrollToIndex({ index: idx, animated: true }), 300);
    }
  }, []); // run once on mount

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Search bar */}
      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.bgSecondary,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            marginHorizontal: spacing.s4,
            marginTop: spacing.s4,
            marginBottom: spacing.s3,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.s3,
          },
        ]}
      >
        <Text style={{ fontSize: 16, color: colors.textTertiary, marginRight: spacing.s2 }}>
          🔍
        </Text>
        <TextInput
          style={{
            flex: 1,
            fontSize: fontSize.bodyMd,
            color: colors.textPrimary,
            paddingVertical: spacing.s3,
          }}
          placeholder="Search terms…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Result count */}
      <Text
        style={{
          fontSize: fontSize.caption,
          color: colors.textTertiary,
          marginHorizontal: spacing.s4,
          marginBottom: spacing.s2,
        }}
      >
        {filtered.length} {filtered.length === 1 ? 'term' : 'terms'}
      </Text>

      {/* Term list */}
      <FlatList<GlossaryTermEntry>
        ref={listRef}
        data={filtered}
        keyExtractor={(item) => item.slug}
        renderItem={({ item }: ListRenderItemInfo<GlossaryTermEntry>) => (
          <TermRow item={item} effortDisplay={effortDisplay} />
        )}
        contentContainerStyle={{ paddingBottom: spacing.s6 ?? 48 }}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={() => {
          // graceful no-op if the target index isn't rendered yet
        }}
        ListEmptyComponent={
          <View style={[styles.empty, { marginTop: spacing.s6 ?? 48 }]}>
            <Text style={{ fontSize: fontSize.bodyMd, color: colors.textTertiary, textAlign: 'center' }}>
              No terms match "{query}"
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Static styles (layout only — colors injected inline)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    height: 48,
  },
  row: {},
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  categoryChip: {},
  empty: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});
