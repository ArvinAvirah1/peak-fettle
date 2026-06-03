/**
 * First-encounter tooltip system.
 *
 * TICKET-043 / ROADMAP 1.1 — Step 8b.
 *
 * Exports:
 *  - useFirstEncounter(slug)  — AsyncStorage-backed "have they seen this term?"
 *                               hook. Persists across sessions.
 *  - InlineTooltipBubble      — the standalone definition bubble (a View, so it
 *                               can be placed in any block-level layout).
 *  - GlossaryTerm             — the inline, tappable term. Two modes:
 *      • default (inline): a nestable <Text> with a subtle dotted underline.
 *        Drop it inside an existing <Text> block. Tapping deep-links to the
 *        glossary. (No bubble — a <Text> cannot host a <View> child.)
 *      • block ({block}): a <View> wrapper that renders the term AND, on the
 *        user's first encounter, the InlineTooltipBubble beneath it.
 *
 * "Seen" state is a JSON array of term slugs stored under a single
 * AsyncStorage key, so the whole set is one read/write.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getGlossaryTerm } from '../utils/glossaryTerms';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius } from '../theme/tokens';

// ---------------------------------------------------------------------------
// First-encounter persistence
// ---------------------------------------------------------------------------

const SEEN_STORAGE_KEY = '@peak_fettle/tooltip_seen';

// In-memory mirror of the persisted set. Loaded once on first hook use so that
// multiple GlossaryTerms mounting in the same render don't each hit disk, and
// so a term marked seen by one instance is immediately visible to siblings.
let seenCache: Set<string> | null = null;
let seenCacheLoad: Promise<Set<string>> | null = null;

async function loadSeenSet(): Promise<Set<string>> {
  if (seenCache) return seenCache;
  if (!seenCacheLoad) {
    seenCacheLoad = (async () => {
      try {
        const raw = await AsyncStorage.getItem(SEEN_STORAGE_KEY);
        const arr: unknown = raw ? JSON.parse(raw) : [];
        seenCache = new Set(Array.isArray(arr) ? (arr as string[]) : []);
      } catch (err) {
        // Corrupt/unavailable storage — fail open with an empty set. Worst case
        // the user sees a tooltip an extra time; never a crash.
        console.warn('[PF] Tooltip/loadSeenSet:', err instanceof Error ? err.message : String(err));
        seenCache = new Set();
      }
      return seenCache;
    })();
  }
  return seenCacheLoad;
}

async function persistSeenSet(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...set]));
  } catch (err) {
    // Best-effort. If the write fails the in-memory cache still suppresses the
    // bubble for the rest of this session.
    console.warn('[PF] Tooltip/persistSeenSet:', err instanceof Error ? err.message : String(err));
  }
}

export interface FirstEncounter {
  /** null while the persisted set is still loading; boolean once known. */
  seen: boolean | null;
  /** Marks the term seen (memory + disk). Idempotent. */
  markSeen: () => void;
}

/**
 * Tracks whether the user has already encountered `slug`.
 *
 * Returns `seen: null` until the persisted set has loaded — callers should
 * render nothing tooltip-related while `seen === null` to avoid a flash.
 */
export function useFirstEncounter(slug: string): FirstEncounter {
  const [seen, setSeen] = useState<boolean | null>(
    seenCache ? seenCache.has(slug) : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (seenCache) {
      setSeen(seenCache.has(slug));
      return;
    }
    loadSeenSet().then((set) => {
      if (!cancelled) setSeen(set.has(slug));
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const markSeen = useCallback(() => {
    const set = seenCache ?? new Set<string>();
    seenCache = set;
    if (!set.has(slug)) {
      set.add(slug);
      void persistSeenSet(set);
    }
    setSeen(true);
  }, [slug]);

  return { seen, markSeen };
}

// ---------------------------------------------------------------------------
// InlineTooltipBubble — the definition bubble
// ---------------------------------------------------------------------------

export interface InlineTooltipBubbleProps {
  slug: string;
  /** Called when the user taps "Learn more" or dismisses the bubble. */
  onDismiss?: () => void;
}

/**
 * A small definition card. Block-level (a View) — place it in column layouts,
 * not inside a <Text>. Used by GlossaryTerm's block mode and reusable anywhere
 * a one-off explainer is wanted.
 */
export function InlineTooltipBubble({
  slug,
  onDismiss,
}: InlineTooltipBubbleProps): React.ReactElement | null {
  const router = useRouter();
  const { theme } = useTheme();
  const entry = getGlossaryTerm(slug);
  if (!entry) return null;

  return (
    <View
      style={[styles.bubble, {
        backgroundColor: theme.colors.bgElevated,
        borderColor: theme.colors.accentHover,
      }]}
      accessibilityRole="summary"
    >
      <View style={styles.bubbleHeader}>
        <Text style={[styles.bubbleTerm, { color: theme.colors.accentSecondary }]}>{entry.term}</Text>
        <TouchableOpacity
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${entry.term} explanation`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.bubbleDismiss, { color: theme.colors.accentDefault }]}>Got it</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.bubbleDefinition, { color: theme.colors.textSecondary }]}>{entry.definition}</Text>
      <TouchableOpacity
        onPress={() => {
          onDismiss?.();
          router.push(`/glossary?term=${entry.slug}`);
        }}
        accessibilityRole="link"
        accessibilityLabel={`Open the glossary at ${entry.term}`}
      >
        <Text style={[styles.bubbleLearnMore, { color: theme.colors.accentDefault }]}>Learn more in the glossary →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// GlossaryTerm — the inline, tappable term
// ---------------------------------------------------------------------------

export interface GlossaryTermProps {
  /** Glossary slug. If unknown, the component degrades to plain text. */
  slug: string;
  /**
   * Text to display. Defaults to the glossary entry's `term`. Override when the
   * sentence needs a different surface form (e.g. lowercase "rep" mid-sentence).
   */
  children?: string;
  /**
   * Block mode: render a <View> wrapper that also shows the first-encounter
   * bubble beneath the term. Use this when the term sits in a column layout.
   * Leave false (default) to nest the term inside an existing <Text>.
   */
  block?: boolean;
}

/**
 * Inline, tappable jargon term. Tapping always deep-links to the glossary
 * filtered to this term. In `block` mode it additionally shows the definition
 * bubble once, on the user's first encounter with this slug.
 */
export function GlossaryTerm({
  slug,
  children,
  block = false,
}: GlossaryTermProps): React.ReactElement {
  const router = useRouter();
  const { theme } = useTheme();
  const entry = getGlossaryTerm(slug);
  const { seen, markSeen } = useFirstEncounter(slug);

  // Whether the first-encounter bubble is currently showing (block mode only).
  const [bubbleOpen, setBubbleOpen] = useState(false);

  // Open the bubble exactly once, the first time we learn this term is unseen.
  useEffect(() => {
    if (block && seen === false) {
      setBubbleOpen(true);
      markSeen();
    }
  }, [block, seen, markSeen]);

  const label = children ?? entry?.term ?? slug;

  // Unknown slug — degrade gracefully to plain, non-interactive text.
  if (!entry) {
    return <Text>{label}</Text>;
  }

  const openGlossary = () => router.push(`/glossary?term=${entry.slug}`);

  const inlineTerm = (
    <Text
      style={[styles.term, { color: theme.colors.accentSecondary, textDecorationColor: theme.colors.accentDefault }]}
      onPress={openGlossary}
      accessibilityRole="link"
      accessibilityLabel={`${entry.term}. Tap for definition.`}
      accessibilityHint="Opens the glossary"
    >
      {label}
    </Text>
  );

  if (!block) {
    // Nestable inline mode — safe to drop inside an existing <Text>.
    return inlineTerm;
  }

  // Block mode — View wrapper hosts the term plus the first-encounter bubble.
  return (
    <View style={styles.blockWrap}>
      <Text>{inlineTerm}</Text>
      {bubbleOpen ? (
        <InlineTooltipBubble slug={slug} onDismiss={() => setBubbleOpen(false)} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Inline term: accent colour + dotted underline so it reads as tappable
  // without looking like a hyperlink.
  term: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },

  blockWrap: {
    alignSelf: 'flex-start',
    gap: 8,
  },

  // Definition bubble
  bubble: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
    gap: 6,
    maxWidth: 340,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bubbleTerm: {
    fontSize: fontSize.bodySm,  // E-003: was 14
    fontWeight: fontWeight.bold,  // E-003: was '700'
  },
  bubbleDismiss: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    fontWeight: fontWeight.semibold,  // E-003: was '600'
  },
  bubbleDefinition: {
    fontSize: fontSize.bodySm,  // E-003: was 13
    lineHeight: 19,
  },
  bubbleLearnMore: {
    fontSize: fontSize.caption,  // E-003: was 12
    fontWeight: fontWeight.semibold,  // E-003: was '600'
    marginTop: 2,
  },
});
