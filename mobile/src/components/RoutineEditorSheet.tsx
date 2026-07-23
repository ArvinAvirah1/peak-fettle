/**
 * RoutineEditorSheet — full routine exercise-editor.
 *
 * Replaces the old name-only "Edit" modal on the Routines page. Lets the user:
 *   • rename the routine
 *   • add exercises inline (via the shared ExercisePicker — option 10)
 *   • remove exercises (trash button)
 *   • reorder exercises (up/down chevrons — option 9)
 *   • edit each exercise's target sets (numeric) and target reps (string)
 *   • S2: per-row kebab (3-dots) menu → "Make dropsets" / "Superset with…"
 *     (and "Remove dropsets" / "Unlink superset" when applicable). Grouped
 *     exercises render as ONE bracketed card with a shared rounds stepper.
 *   • Save → full replace via the tier-branched data module (local-first for
 *     free users; REST for Pro). Option 8/11.
 *
 * Layout: SafeAreaView header + a sticky Save bar pinned above the bottom inset.
 * Visual style matches StepperLogger / routines.tsx (dark cards, teal accent).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from './Icon';
import { stepperPalette, fontFamily, fontSize, spacing, radius } from '../theme/tokens';
import { Routine, RoutineExercise, updateRoutine } from '../data/routines';
import { useAuth } from '../hooks/useAuth';
import { ExercisePicker } from './ExercisePicker';
import { Exercise } from '../types/api';
import { DropsetConfigSheet, DropsetConfig } from './routineEditor/DropsetConfigSheet';
import { SupersetLinkSheet, SupersetLinkCandidate } from './routineEditor/SupersetLinkSheet';
import { SubstituteSwapSheet, SwapSelection } from './SubstituteSwapSheet';
import {
  mergedSubstitutesFor,
  addGlobalSubstitute,
  removeGlobalSubstitute,
  routinesContainingExercise,
  addSubstituteToRoutines,
  uuidOrNull,
  ScopedSubstitute,
  SubstituteScope,
} from '../data/substitutes';
import { alternativesForDetailed, normalizeName, SwapCandidate } from '../planGen/quickSwap';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  routine: Routine | null; // null = not open
  onClose: () => void;
  onSaved: (updated: Routine) => void;
}

/** A render block: either one ungrouped row, or a contiguous superset group. */
type Block =
  | { kind: 'single'; index: number; item: RoutineExercise }
  | { kind: 'group'; groupId: string; letter: string; indices: number[]; items: RoutineExercise[] };

// ── Grouping helpers (pure) ────────────────────────────────────────────────────

/**
 * Fold the flat items[] into render blocks. Contiguous runs sharing a
 * superset_group collapse into one 'group' block; everything else is a 'single'.
 * Group letters (A, B, …) are derived from group order of appearance.
 */
function toBlocks(items: RoutineExercise[]): Block[] {
  const blocks: Block[] = [];
  const groupLetters = new Map<string, string>();
  let nextLetter = 0;
  let i = 0;
  while (i < items.length) {
    const cur = items[i];
    const g = cur ? cur.superset_group : null;
    if (cur && g) {
      // Gather the contiguous run of this group id.
      const indices: number[] = [];
      const groupItems: RoutineExercise[] = [];
      let j = i;
      while (j < items.length && items[j]?.superset_group === g) {
        const it = items[j];
        if (it) {
          indices.push(j);
          groupItems.push(it);
        }
        j++;
      }
      if (!groupLetters.has(g)) {
        groupLetters.set(g, String.fromCharCode(65 + (nextLetter % 26)));
        nextLetter++;
      }
      blocks.push({
        kind: 'group',
        groupId: g,
        letter: groupLetters.get(g) ?? '?',
        indices,
        items: groupItems,
      });
      i = j;
    } else if (cur) {
      blocks.push({ kind: 'single', index: i, item: cur });
      i++;
    } else {
      i++;
    }
  }
  return blocks;
}

/** A short display badge for a configured dropset, e.g. "Dropsets: last 2 · 2 drops @ -20%".
 * Pure helper called only from this file's own render — takes `t` per the
 * render-site translation rule. */
function dropsetBadgeLabel(d: DropsetConfig | RoutineExercise['dropset'], t: TFunction): string {
  if (!d) return '';
  const which = d.last_n === 'all' ? t('components:routineEditorSheet.allSets') : t('components:routineEditorSheet.lastNSets', { n: d.last_n });
  const drops = typeof d.drops === 'number' ? d.drops : 2;
  const pct = typeof d.drop_pct === 'number' ? d.drop_pct : 20;
  return t('components:routineEditorSheet.dropsetBadge', { which, count: drops, pct });
}

/** Generate a short unique group id (letters won't collide across sessions). */
function newGroupId(existing: RoutineExercise[]): string {
  const used = new Set(existing.map((e) => e.superset_group).filter(Boolean) as string[]);
  // Prefer single letters g1, g2… (persisted id; the DISPLAY letter is derived).
  let n = 1;
  while (used.has(`g${n}`)) n++;
  return `g${n}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RoutineEditorSheet({
  visible,
  routine,
  onClose,
  onSaved,
}: Props): React.ReactElement {
  const { user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState<string>(routine?.name ?? '');
  const [items, setItems] = useState<RoutineExercise[]>(routine?.exercises ?? []);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Kebab menu: index of the row whose menu is open (null = none).
  const [menuForIndex, setMenuForIndex] = useState<number | null>(null);
  // Dropset config sheet: the item index being configured (null = closed).
  const [dropsetForIndex, setDropsetForIndex] = useState<number | null>(null);
  // Superset link sheet: the anchor item index (null = closed).
  const [linkForIndex, setLinkForIndex] = useState<number | null>(null);
  // When the picker is opened to ADD a new member into a forming/existing group,
  // this holds the target group id; a normal "+ Add exercise" leaves it null.
  const [pickerTargetGroup, setPickerTargetGroup] = useState<string | null>(null);
  // "Make alternative" (kebab → ExercisePicker): the item index the picked
  // exercise becomes a routine-scoped substitute FOR (null = closed).
  const [altForIndex, setAltForIndex] = useState<number | null>(null);
  // SUBS-001 swap sheet: the item index being swapped (null = closed) + its lists.
  const [swapForIndex, setSwapForIndex] = useState<number | null>(null);
  const [swapSubs, setSwapSubs] = useState<ScopedSubstitute[]>([]);
  const [swapSuggested, setSwapSuggested] = useState<SwapCandidate[]>([]);
  const [swapReason, setSwapReason] = useState<string | null>(null);
  const [swapLoading, setSwapLoading] = useState(false);

  useEffect(() => {
    setName(routine?.name ?? '');
    setItems(routine?.exercises ?? []);
    setSavedFlash(false);
    setMenuForIndex(null);
    setDropsetForIndex(null);
    setLinkForIndex(null);
    setPickerTargetGroup(null);
    setSwapForIndex(null);
    setAltForIndex(null);
  }, [routine]);

  const blocks = useMemo(() => toBlocks(items), [items]);

  // ── Per-exercise field edits ─────────────────────────────────────────────
  const updateSets = useCallback((index: number, text: string) => {
    const trimmed = text.trim();
    const parsed = trimmed === '' ? undefined : parseInt(trimmed, 10);
    const next = trimmed === '' || Number.isNaN(parsed) ? undefined : parsed;
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, target_sets: next } : it)));
  }, []);

  const updateReps = useCallback((index: number, text: string) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, target_reps: text } : it)));
  }, []);

  // ── Reorder a single ungrouped row (swap with neighbour) ──────────────────
  const moveUp = useCallback((index: number) => {
    setItems((prev) => {
      if (index <= 0) return prev;
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  // ── Reorder a whole group as a unit ───────────────────────────────────────
  // Move the contiguous block [start..end] up/down past the adjacent block.
  const moveGroup = useCallback((indices: number[], dir: -1 | 1) => {
    setItems((prev) => {
      if (indices.length === 0) return prev;
      const start = indices[0]!;
      const end = indices[indices.length - 1]!;
      const block = prev.slice(start, end + 1);
      if (dir === -1) {
        if (start === 0) return prev;
        const before = prev[start - 1]!;
        const next = [...prev];
        next.splice(start - 1, block.length + 1, ...block, before);
        return next;
      } else {
        if (end >= prev.length - 1) return prev;
        const after = prev[end + 1]!;
        const next = [...prev];
        next.splice(start, block.length + 1, after, ...block);
        return next;
      }
    });
  }, []);

  // ── Reorder a member WITHIN its group (swap with in-group neighbour) ──────
  const moveMemberWithinGroup = useCallback((absIndex: number, dir: -1 | 1) => {
    setItems((prev) => {
      const target = absIndex + dir;
      if (target < 0 || target >= prev.length) return prev;
      // Only swap when the neighbour shares the same group (stay contiguous).
      if (prev[target]?.superset_group !== prev[absIndex]?.superset_group) return prev;
      const next = [...prev];
      [next[absIndex], next[target]] = [next[target]!, next[absIndex]!];
      return next;
    });
  }, []);

  // ── Remove ───────────────────────────────────────────────────────────────
  const removeItem = useCallback((index: number) => {
    setItems((prev) => {
      const removed = prev[index];
      let next = prev.filter((_, i) => i !== index);
      // If removing a group member drops the group below 2, dissolve the rest.
      if (removed?.superset_group) {
        const remaining = next.filter((e) => e.superset_group === removed.superset_group);
        if (remaining.length < 2) {
          next = next.map((e) =>
            e.superset_group === removed.superset_group
              ? { ...e, superset_group: null, superset_rounds: null }
              : e,
          );
        }
      }
      return next;
    });
    setMenuForIndex(null);
  }, []);

  // ── Add (from ExercisePicker — inline) ────────────────────────────────────
  const handlePicked = useCallback((ex: Exercise) => {
    const targetGroup = pickerTargetGroup;
    setItems((prev) => {
      if (ex.id && prev.some((it) => it.exercise_id === ex.id)) return prev;
      const newEx: RoutineExercise = {
        exercise_id: ex.id,
        name: ex.name,
        target_sets: 3,
        target_reps: '8-12',
      };
      if (targetGroup) {
        // Insert INTO the group with defaults, keeping the group contiguous —
        // append right after the group's last member. Share the group rounds.
        const memberIdxs = prev
          .map((e, i) => (e.superset_group === targetGroup ? i : -1))
          .filter((i) => i >= 0);
        if (memberIdxs.length === 0) {
          return [...prev, newEx];
        }
        const firstIdx = memberIdxs[0]!;
        const rounds = prev[firstIdx]?.superset_rounds ?? 3;
        const insertAt = memberIdxs[memberIdxs.length - 1]! + 1;
        const grouped: RoutineExercise = {
          ...newEx,
          superset_group: targetGroup,
          superset_rounds: rounds,
        };
        const next = [...prev];
        next.splice(insertAt, 0, grouped);
        return next;
      }
      return [...prev, newEx];
    });
    setPickerVisible(false);
    setPickerTargetGroup(null);
  }, [pickerTargetGroup]);

  // ── Dropset config (kebab → sheet) ────────────────────────────────────────
  const openDropset = useCallback((index: number) => {
    setMenuForIndex(null);
    setDropsetForIndex(index);
  }, []);

  const saveDropset = useCallback((config: DropsetConfig) => {
    setItems((prev) =>
      prev.map((it, i) => (i === dropsetForIndex ? { ...it, dropset: config } : it)),
    );
    setDropsetForIndex(null);
  }, [dropsetForIndex]);

  const removeDropset = useCallback(() => {
    setItems((prev) =>
      prev.map((it, i) => (i === dropsetForIndex ? { ...it, dropset: null } : it)),
    );
    setDropsetForIndex(null);
  }, [dropsetForIndex]);

  const removeDropsetAt = useCallback((index: number) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, dropset: null } : it)));
    setMenuForIndex(null);
  }, []);

  // ── Superset link (kebab → sheet) ─────────────────────────────────────────
  const openLink = useCallback((index: number) => {
    setMenuForIndex(null);
    setLinkForIndex(index);
  }, []);

  /**
   * Create a group from the anchor + chosen member indices, making them
   * contiguous (anchored at the anchor's original position) and sharing rounds.
   * Returns the new group id (so the caller can chain "search library").
   */
  const createGroup = useCallback((anchorIndex: number, memberIndices: number[]): string => {
    let createdGroupId = '';
    setItems((prev) => {
      const idxSet = new Set<number>([anchorIndex, ...memberIndices].filter(
        (i) => i >= 0 && i < prev.length,
      ));
      const idxList = Array.from(idxSet).sort((a, b) => a - b);
      if (idxList.length < 2) return prev;
      if (idxList.length > 5) idxList.length = 5;

      const gid = newGroupId(prev);
      createdGroupId = gid;
      // Shared rounds = max target_sets among members (default 3).
      const rounds = Math.max(3, ...idxList.map((i) => prev[i]?.target_sets ?? 0));

      const memberSet = new Set(idxList);
      const members: RoutineExercise[] = idxList.map((i) => ({
        ...(prev[i] as RoutineExercise),
        superset_group: gid,
        superset_rounds: rounds,
      }));
      const insertionPoint = idxList.reduce((m, i) => Math.min(m, i), Infinity);
      const rest = prev.filter((_, i) => !memberSet.has(i));
      return [
        ...rest.slice(0, insertionPoint),
        ...members,
        ...rest.slice(insertionPoint),
      ];
    });
    return createdGroupId;
  }, []);

  const confirmLink = useCallback((memberIndices: number[]) => {
    if (linkForIndex == null) return;
    createGroup(linkForIndex, memberIndices);
    setLinkForIndex(null);
  }, [linkForIndex, createGroup]);

  // "Search library" from the link sheet: create the group from the current
  // selection (if any), then open the picker to append a new member into it.
  const searchLibraryForGroup = useCallback((memberIndices: number[]) => {
    if (linkForIndex == null) return;
    let gid: string;
    if (memberIndices.length >= 1) {
      gid = createGroup(linkForIndex, memberIndices);
    } else {
      // No other member picked yet — start a 1-member "forming" group on the
      // anchor so the new library exercise lands beside it as a pair.
      gid = newGroupId(items);
      const anchor = linkForIndex;
      setItems((prev) => {
        const rounds = Math.max(3, prev[anchor]?.target_sets ?? 0);
        return prev.map((it, i) =>
          i === anchor
            ? ({ ...it, superset_group: gid, superset_rounds: rounds } as RoutineExercise)
            : it,
        );
      });
    }
    setLinkForIndex(null);
    setPickerTargetGroup(gid);
    setPickerVisible(true);
  }, [linkForIndex, createGroup, items]);

  // ── Make alternative (kebab → ExercisePicker → routine-scoped substitute) ──
  /**
   * One-tap path to preload an alternative for a slot: pick an exercise and it
   * lands in the slot's substitute list (routine scope), WITHOUT swapping now.
   * During a workout the swap sheet then offers it first ("machine is busy").
   * Persisted on Save via the normal full-replace updateRoutine path; the
   * exercise_id goes through uuidOrNull (server Zod only accepts UUIDs).
   */
  const openMakeAlternative = useCallback((index: number) => {
    setMenuForIndex(null);
    setAltForIndex(index);
  }, []);

  /**
   * Founder request (2026-07-22): after preloading an alternative for a slot,
   * offer to mirror it into every OTHER routine that contains the same exercise
   * (e.g. Shoulder Press in Push A AND Push B). Only routines still MISSING the
   * alternative are offered. The other routines save immediately (they are not
   * part of this editor's draft); the current routine's copy still lands on
   * "Save routine" as before. Best-effort — a failure never blocks the editor.
   */
  const offerCrossRoutineAlternative = useCallback(
    async (sourceName: string, entry: { exercise_id: string | null; name: string }) => {
      if (!routine) return;
      const subKey = normalizeName(entry.name);
      const others = (await routinesContainingExercise(user, sourceName)).filter(
        (r) =>
          r.id !== routine.id &&
          (r.exercises ?? []).some(
            (e) =>
              normalizeName(e.name) === normalizeName(sourceName) &&
              !(e.substitutes ?? []).some((s) => normalizeName(s.name) === subKey),
          ),
      );
      if (others.length === 0) return;
      // Let the picker/sheet Modal finish dismissing first — an Alert presented
      // while a Modal is mid-dismiss can be swallowed on iOS.
      await new Promise((resolve) => setTimeout(resolve, 400));
      const names = others.map((r) => r.name).join(', ');
      Alert.alert(
        t('components:routineEditorSheet.altAlsoAddTitle'),
        t('components:routineEditorSheet.altAlsoAddMessage', {
          original: sourceName,
          sub: entry.name,
          routines: names,
        }),
        [
          {
            text:
              others.length === 1
                ? t('components:routineEditorSheet.altAlsoAddConfirmOne', { name: others[0]!.name })
                : t('components:routineEditorSheet.altAlsoAddConfirmMany', { n: others.length }),
            onPress: () => void addSubstituteToRoutines(user, others, sourceName, entry),
          },
          { text: t('components:routineEditorSheet.altJustThisRoutine'), style: 'cancel' },
        ],
      );
    },
    [routine, user, t],
  );

  const handleAlternativePicked = useCallback((ex: Exercise) => {
    const idx = altForIndex;
    setAltForIndex(null);
    if (idx == null) return;
    const target = items[idx];
    if (!target) return;
    const subKey = normalizeName(ex.name);
    if (!subKey || subKey === normalizeName(target.name)) return;
    const entry = { exercise_id: uuidOrNull(ex.id || null), name: ex.name };
    setItems((prev) =>
      prev.map((e, i) => {
        if (i !== idx) return e;
        const cur = e.substitutes ?? [];
        if (cur.some((s) => normalizeName(s.name) === subKey)) return e;
        return { ...e, substitutes: [...cur, entry].slice(0, 10) };
      }),
    );
    // Cross-routine offer (only fires when another routine still lacks it).
    void offerCrossRoutineAlternative(target.name, entry);
  }, [altForIndex, items, offerCrossRoutineAlternative]);

  // ── SUBS-001: swap exercise (kebab → SubstituteSwapSheet) ─────────────────
  /**
   * Open the swap sheet for one slot. Lists are computed on-device:
   *   • user subs = the slot's routine-scoped substitutes merged with the
   *     GLOBAL exercise_substitutes table (data/substitutes.ts) — free feature;
   *   • suggested = the quick-swap engine ranking (Pro only; free users see
   *     the locked teaser), excluding everything already in the routine.
   */
  const openSwap = useCallback(async (index: number) => {
    setMenuForIndex(null);
    const it = items[index];
    if (!it) return;
    setSwapForIndex(index);
    setSwapLoading(true);
    setSwapSubs([]);
    setSwapSuggested([]);
    setSwapReason(null);
    try {
      const subs = await mergedSubstitutesFor(
        { exercise_id: it.exercise_id ?? null, name: it.name },
        it.substitutes,
      );
      setSwapSubs(subs);
    } catch { /* best-effort — sheet shows the empty state */ }
    if (user?.is_paid) {
      const excludeIds = items.map((e) => e.exercise_id).filter(Boolean) as string[];
      const excludeNames = items.map((e) => e.name).filter(Boolean);
      const result = alternativesForDetailed(
        { id: it.exercise_id ?? null, name: it.name || null },
        { excludeIds, excludeNames, limit: 6 },
      );
      setSwapSuggested(result.candidates);
      setSwapReason(result.reason ?? null);
    }
    setSwapLoading(false);
  }, [items, user?.is_paid]);

  /**
   * Apply a swap PERMANENTLY to the routine draft: the pick becomes the slot's
   * exercise (superset/dropset/targets kept) and the original drops into the
   * slot's substitute list so it stays one tap away ("swap back"). The pick is
   * removed from the sub list if it was there. exercise_id goes through
   * uuidOrNull — catalog-v2 (non-UUID) ids must never reach the server Zod.
   * Persisted on Save via the existing full-replace updateRoutine path.
   */
  const applySwap = useCallback((sel: SwapSelection) => {
    const idx = swapForIndex;
    if (idx == null) return;
    const selKey = normalizeName(sel.name);
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const original = { exercise_id: it.exercise_id ?? null, name: it.name };
        const subs = (it.substitutes ?? []).filter(
          (s) => normalizeName(s.name) !== selKey,
        );
        if (
          original.name &&
          normalizeName(original.name) !== selKey &&
          !subs.some((s) => normalizeName(s.name) === normalizeName(original.name))
        ) {
          subs.unshift(original);
        }
        return {
          ...it,
          exercise_id: uuidOrNull(sel.exercise_id),
          name: sel.name,
          substitutes: subs.slice(0, 10),
        };
      }),
    );
    setSwapForIndex(null);
  }, [swapForIndex]);

  /** Add a substitute from the sheet ('routine' → this slot's JSON; 'global' → device table). */
  const addSwapSub = useCallback((sub: { exercise_id: string | null; name: string }, scope: SubstituteScope) => {
    const idx = swapForIndex;
    if (idx == null) return;
    const it = items[idx];
    if (!it) return;
    const subKey = normalizeName(sub.name);
    if (!subKey || subKey === normalizeName(it.name)) return;
    const entry = { exercise_id: uuidOrNull(sub.exercise_id), name: sub.name };
    if (scope === 'routine') {
      setItems((prev) =>
        prev.map((e, i) => {
          if (i !== idx) return e;
          const cur = e.substitutes ?? [];
          if (cur.some((s) => normalizeName(s.name) === subKey)) return e;
          return { ...e, substitutes: [...cur, entry].slice(0, 10) };
        }),
      );
      // Cross-routine offer (only fires when another routine still lacks it).
      void offerCrossRoutineAlternative(it.name, entry);
    } else {
      void addGlobalSubstitute(
        { exercise_id: it.exercise_id ?? null, name: it.name },
        entry,
      ).catch(() => undefined);
    }
    // Optimistic list refresh (dedupe by normalized name).
    setSwapSubs((prev) =>
      prev.some((s) => normalizeName(s.name) === subKey)
        ? prev
        : [...prev, { ...entry, scope }],
    );
  }, [swapForIndex, items, offerCrossRoutineAlternative]);

  /** Remove a substitute from the sheet (routes by its scope). */
  const removeSwapSub = useCallback((sub: ScopedSubstitute) => {
    const idx = swapForIndex;
    if (idx == null) return;
    const subKey = normalizeName(sub.name);
    if (sub.scope === 'routine') {
      setItems((prev) =>
        prev.map((e, i) => {
          if (i !== idx) return e;
          const cur = (e.substitutes ?? []).filter(
            (s) => normalizeName(s.name) !== subKey,
          );
          return { ...e, substitutes: cur.length > 0 ? cur : null };
        }),
      );
    } else {
      const it = items[idx];
      if (it) {
        void removeGlobalSubstitute(
          { exercise_id: it.exercise_id ?? null, name: it.name },
          sub,
        ).catch(() => undefined);
      }
    }
    setSwapSubs((prev) =>
      prev.filter((s) => !(s.scope === sub.scope && normalizeName(s.name) === subKey)),
    );
  }, [swapForIndex, items]);

  // ── Unlink a whole group (dissolve) ───────────────────────────────────────
  const unlinkGroup = useCallback((groupId: string) => {
    setItems((prev) =>
      prev.map((e) =>
        e.superset_group === groupId
          ? { ...e, superset_group: null, superset_rounds: null }
          : e,
      ),
    );
  }, []);

  // ── Group shared rounds stepper ───────────────────────────────────────────
  const setGroupRounds = useCallback((groupId: string, rounds: number) => {
    const clamped = Math.max(1, Math.min(10, rounds));
    setItems((prev) =>
      prev.map((e) =>
        e.superset_group === groupId ? { ...e, superset_rounds: clamped } : e,
      ),
    );
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!routine) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      // handleSave full-replaces exercises — the S2 fields ride along in `items`.
      const updated = await updateRoutine(user, routine.id, { name: trimmed, exercises: items });
      onSaved(updated);
      setSavedFlash(true);
      setTimeout(() => {
        setSavedFlash(false);
        onClose();
      }, 450);
    } catch (err) {
      Alert.alert(t('components:routineEditorSheet.errorTitle'), err instanceof Error ? err.message : t('components:routineEditorSheet.couldNotSaveRoutine'));
    } finally {
      setSaving(false);
    }
  }, [routine, name, items, user, onSaved, onClose]);

  const saveDisabled = saving || name.trim().length === 0;

  // Candidates for the link sheet: OTHER ungrouped exercises (exclude anchor).
  const linkCandidates: SupersetLinkCandidate[] = useMemo(() => {
    if (linkForIndex == null) return [];
    return items
      .map((it, i) => ({ it, i }))
      .filter(({ it, i }) => i !== linkForIndex && !it.superset_group)
      .map(({ it, i }) => ({ index: i, name: it.name }));
  }, [items, linkForIndex]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header (explicit top-inset padding — CLAUDE.md in-Modal safe-area caveat). */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel={t('components:routineEditorSheet.closeEditorAccessibilityLabel')}
            >
              <Ionicons name="chevron-down" size={22} color={stepperPalette.muted} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} numberOfLines={1}>{t('components:routineEditorSheet.editRoutine')}</Text>
            {savedFlash ? (
              <View style={styles.savedBadge}>
                <Ionicons name="checkmark-circle" size={16} color={stepperPalette.accent} />
                <Text style={styles.savedBadgeText}>{t('components:routineEditorSheet.saved')}</Text>
              </View>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>{t('components:routineEditorSheet.nameLabel')}</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={t('components:routineEditorSheet.namePlaceholder')}
              placeholderTextColor={stepperPalette.muted}
              maxLength={100}
              returnKeyType="done"
            />

            <Text style={[styles.fieldLabel, styles.exercisesLabel]}>{t('components:routineEditorSheet.exercisesLabel')}</Text>

            {items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {t('components:routineEditorSheet.noExercisesYet')}
                </Text>
              </View>
            ) : (
              blocks.map((block, bi) =>
                block.kind === 'single' ? (
                  <ExerciseRow
                    key={`s-${block.item.exercise_id || block.item.name}-${block.index}`}
                    item={block.item}
                    index={block.index}
                    isFirst={block.index === 0}
                    isLast={block.index === items.length - 1}
                    menuOpen={menuForIndex === block.index}
                    onToggleMenu={() =>
                      setMenuForIndex((cur) => (cur === block.index ? null : block.index))
                    }
                    onRemove={() => removeItem(block.index)}
                    onUpdateSets={(t) => updateSets(block.index, t)}
                    onUpdateReps={(t) => updateReps(block.index, t)}
                    onMoveUp={() => moveUp(block.index)}
                    onMoveDown={() => moveDown(block.index)}
                    onMakeDropsets={() => openDropset(block.index)}
                    onRemoveDropsets={() => removeDropsetAt(block.index)}
                    onSupersetWith={() => openLink(block.index)}
                    onSwap={() => void openSwap(block.index)}
                    onMakeAlternative={() => openMakeAlternative(block.index)}
                  />
                ) : (
                  <GroupCard
                    key={`g-${block.groupId}-${bi}`}
                    letter={block.letter}
                    groupId={block.groupId}
                    indices={block.indices}
                    members={block.items}
                    isFirstBlock={bi === 0}
                    isLastBlock={bi === blocks.length - 1}
                    menuForIndex={menuForIndex}
                    onToggleMemberMenu={(idx) =>
                      setMenuForIndex((cur) => (cur === idx ? null : idx))
                    }
                    onSetRounds={(r) => setGroupRounds(block.groupId, r)}
                    onUnlink={() => unlinkGroup(block.groupId)}
                    onMoveGroupUp={() => moveGroup(block.indices, -1)}
                    onMoveGroupDown={() => moveGroup(block.indices, 1)}
                    onMemberUp={(idx) => moveMemberWithinGroup(idx, -1)}
                    onMemberDown={(idx) => moveMemberWithinGroup(idx, 1)}
                    onMemberRemove={(idx) => removeItem(idx)}
                    onMemberUpdateReps={(idx, t) => updateReps(idx, t)}
                    onMemberMakeDropsets={(idx) => openDropset(idx)}
                    onMemberRemoveDropsets={(idx) => removeDropsetAt(idx)}
                    onMemberSwap={(idx) => void openSwap(idx)}
                    onMemberMakeAlternative={(idx) => openMakeAlternative(idx)}
                  />
                ),
              )
            )}

            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                setPickerTargetGroup(null);
                setPickerVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('components:routineEditorSheet.addExercise')}
            >
              <Text style={styles.addLabel}>{t('components:routineEditorSheet.addExerciseButton')}</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, spacing.s3) }]}>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saveDisabled}
              style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t('components:routineEditorSheet.saveRoutineAccessibilityLabel')}
            >
              {saving ? (
                <ActivityIndicator size="small" color={stepperPalette.accentInk} />
              ) : (
                <Text style={styles.saveLabel}>{t('components:routineEditorSheet.saveRoutine')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Exercise picker (add inline / add into a group). */}
      <ExercisePicker
        visible={pickerVisible}
        onSelect={handlePicked}
        onClose={() => {
          setPickerVisible(false);
          setPickerTargetGroup(null);
        }}
      />

      {/* "Make alternative" picker — the pick becomes a routine-scoped
          substitute for the chosen slot (stacked-Modal pattern). */}
      <ExercisePicker
        visible={altForIndex != null}
        onSelect={handleAlternativePicked}
        onClose={() => setAltForIndex(null)}
      />

      {/* Dropset config sheet. */}
      <DropsetConfigSheet
        visible={dropsetForIndex != null}
        exerciseName={dropsetForIndex != null ? items[dropsetForIndex]?.name ?? '' : ''}
        value={dropsetForIndex != null ? items[dropsetForIndex]?.dropset ?? null : null}
        onSave={saveDropset}
        onRemove={removeDropset}
        onClose={() => setDropsetForIndex(null)}
      />

      {/* Superset link sheet. */}
      <SupersetLinkSheet
        visible={linkForIndex != null}
        currentName={linkForIndex != null ? items[linkForIndex]?.name ?? '' : ''}
        candidates={linkCandidates}
        onConfirm={confirmLink}
        onSearchLibrary={searchLibraryForGroup}
        onClose={() => setLinkForIndex(null)}
      />

      {/* SUBS-001: swap-exercise sheet (permanent replace; Save persists it). */}
      <SubstituteSwapSheet
        visible={swapForIndex != null}
        mode="editor"
        originalName={swapForIndex != null ? items[swapForIndex]?.name ?? '' : ''}
        userSubs={swapSubs}
        suggested={swapSuggested}
        suggestedLocked={!user?.is_paid}
        suggestedEmptyReason={swapReason}
        loading={swapLoading}
        onSelect={applySwap}
        onAddSub={addSwapSub}
        onRemoveSub={removeSwapSub}
        allowRoutineScope
        onUpgrade={() => {
          // Locked SUGGESTED teaser → plans tab (close both sheets first; the
          // editor is a fullScreen Modal and would otherwise cover the nav).
          setSwapForIndex(null);
          onClose();
          router.push('/(tabs)/plans');
        }}
        onClose={() => setSwapForIndex(null)}
      />
    </Modal>
  );
}

// ── Kebab menu (in-card overlay) ──────────────────────────────────────────────

function KebabMenu(props: {
  hasDropset: boolean;
  grouped: boolean;
  onMakeDropsets: () => void;
  onRemoveDropsets: () => void;
  onSupersetWith?: () => void;
  onUnlink?: () => void;
  onSwap?: () => void;
  onMakeAlternative?: () => void;
  onClose: () => void;
}): React.ReactElement {
  const { hasDropset, grouped, onMakeDropsets, onRemoveDropsets, onSupersetWith, onUnlink, onSwap, onMakeAlternative, onClose } = props;
  const { t } = useTranslation();
  return (
    <>
      {/* Full-screen catcher so a tap anywhere dismisses the menu. */}
      <Pressable style={styles.menuCatcher} onPress={onClose} accessibilityLabel={t('components:routineEditorSheet.closeMenuAccessibilityLabel')} />
      <View style={styles.menu}>
        {onSwap ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onSwap}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.swapExercise')}
          >
            <Ionicons name="swap-horizontal" size={16} color={stepperPalette.text} />
            <Text style={styles.menuItemText}>{t('components:routineEditorSheet.swapExercise')}</Text>
          </TouchableOpacity>
        ) : null}
        {onMakeAlternative ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onMakeAlternative}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.makeAlternative')}
          >
            <Ionicons name="repeat" size={16} color={stepperPalette.text} />
            <Text style={styles.menuItemText}>{t('components:routineEditorSheet.makeAlternative')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.menuItem}
          onPress={onMakeDropsets}
          accessibilityRole="button"
          accessibilityLabel={hasDropset ? t('components:routineEditorSheet.editDropsets') : t('components:routineEditorSheet.makeDropsets')}
        >
          <Ionicons name="trending-down" size={16} color={stepperPalette.text} />
          <Text style={styles.menuItemText}>{hasDropset ? t('components:routineEditorSheet.editDropsets') : t('components:routineEditorSheet.makeDropsets')}</Text>
        </TouchableOpacity>
        {hasDropset ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onRemoveDropsets}
            accessibilityRole="button"
            accessibilityLabel={t('components:dropsetConfigSheet.removeDropsets')}
          >
            <Ionicons name="close-circle-outline" size={16} color={stepperPalette.muted} />
            <Text style={styles.menuItemTextMuted}>{t('components:dropsetConfigSheet.removeDropsets')}</Text>
          </TouchableOpacity>
        ) : null}
        {grouped ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onUnlink}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.unlinkSuperset')}
          >
            <Ionicons name="git-merge" size={16} color={stepperPalette.muted} />
            <Text style={styles.menuItemTextMuted}>{t('components:routineEditorSheet.unlinkSuperset')}</Text>
          </TouchableOpacity>
        ) : onSupersetWith ? (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={onSupersetWith}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.supersetWithOthersAccessibilityLabel')}
          >
            <Ionicons name="git-merge" size={16} color={stepperPalette.text} />
            <Text style={styles.menuItemText}>{t('components:supersetLinkSheet.title')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );
}

function KebabButton(props: { onPress: () => void; label: string }): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={props.onPress}
      style={styles.iconBtn}
      accessibilityRole="button"
      accessibilityLabel={props.label}
    >
      <Ionicons name="ellipsis-vertical" size={18} color={stepperPalette.muted} />
    </TouchableOpacity>
  );
}

// ── Expandable alternatives badge (founder request 2026-07-22) ────────────────
// Tapping "N alternatives" expands the badge into a horizontally-scrollable
// chip row listing the slot's saved substitutes; tap again to collapse.
function AltBadge({
  name,
  subs,
}: {
  name: string;
  subs: { exercise_id?: string | null; name: string }[];
}): React.ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={styles.dropsetBadge}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={t('components:routineEditorSheet.altBadgeA11y', { count: subs.length, name })}
      >
        <Ionicons name="repeat" size={12} color={stepperPalette.accent} />
        <Text style={styles.dropsetBadgeText}>
          {t('components:routineEditorSheet.altBadge', { count: subs.length })}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={stepperPalette.accent} />
      </TouchableOpacity>
      {open ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.altChipsRow}
          contentContainerStyle={styles.altChipsContent}
        >
          {subs.map((s, i) => (
            <View key={`${s.name}-${i}`} style={styles.altChip}>
              <Text style={styles.altChipText} numberOfLines={1}>{s.name}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

// ── Ungrouped exercise row ────────────────────────────────────────────────────

function ExerciseRow(props: {
  item: RoutineExercise;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onRemove: () => void;
  onUpdateSets: (t: string) => void;
  onUpdateReps: (t: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMakeDropsets: () => void;
  onRemoveDropsets: () => void;
  onSupersetWith: () => void;
  onSwap: () => void;
  onMakeAlternative: () => void;
}): React.ReactElement {
  const {
    item, isFirst, isLast, menuOpen, onToggleMenu, onRemove, onUpdateSets, onUpdateReps,
    onMoveUp, onMoveDown, onMakeDropsets, onRemoveDropsets, onSupersetWith, onSwap,
    onMakeAlternative,
  } = props;
  const { t } = useTranslation();
  const hasDropset = !!item.dropset;
  const altCount = item.substitutes?.length ?? 0;
  return (
    <View style={styles.exRow}>
      <View style={styles.exRowTop}>
        <Text style={styles.exName} numberOfLines={1}>{item.name}</Text>
        <KebabButton onPress={onToggleMenu} label={t('components:routineEditorSheet.optionsForAccessibilityLabel', { name: item.name })} />
      </View>

      {hasDropset ? (
        <View style={styles.dropsetBadge}>
          <Ionicons name="trending-down" size={12} color={stepperPalette.accent} />
          <Text style={styles.dropsetBadgeText}>{dropsetBadgeLabel(item.dropset, t)}</Text>
        </View>
      ) : null}

      {altCount > 0 ? <AltBadge name={item.name} subs={item.substitutes ?? []} /> : null}

      <View style={styles.exRowBottom}>
        <View style={styles.targetGroup}>
          <Text style={styles.targetLabel}>{t('components:routineEditorSheet.setsLabel')}</Text>
          <TextInput
            style={styles.targetInput}
            value={item.target_sets != null ? String(item.target_sets) : ''}
            onChangeText={onUpdateSets}
            keyboardType="number-pad"
            placeholder="—"
            placeholderTextColor={stepperPalette.muted}
            selectTextOnFocus
            maxLength={2}
            accessibilityLabel={t('components:routineEditorSheet.targetSetsAccessibilityLabel', { name: item.name })}
          />
        </View>
        <View style={styles.targetGroup}>
          <Text style={styles.targetLabel}>{t('components:routineEditorSheet.repsLabel')}</Text>
          <TextInput
            style={styles.targetInput}
            value={item.target_reps ?? ''}
            onChangeText={onUpdateReps}
            placeholder="8-12"
            placeholderTextColor={stepperPalette.muted}
            selectTextOnFocus
            maxLength={12}
            accessibilityLabel={t('components:routineEditorSheet.targetRepsAccessibilityLabel', { name: item.name })}
          />
        </View>

        <View style={styles.reorderGroup}>
          <TouchableOpacity
            onPress={onMoveUp}
            disabled={isFirst}
            style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.moveUpAccessibilityLabel', { name: item.name })}
          >
            <Ionicons name="chevron-up" size={18} color={stepperPalette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveDown}
            disabled={isLast}
            style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.moveDownAccessibilityLabel', { name: item.name })}
          >
            <Ionicons name="chevron-down" size={18} color={stepperPalette.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onRemove}
          style={styles.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={t('components:routineEditorSheet.removeAccessibilityLabel', { name: item.name })}
        >
          <Ionicons name="trash-outline" size={18} color={stepperPalette.muted} />
        </TouchableOpacity>
      </View>

      {menuOpen ? (
        <KebabMenu
          hasDropset={hasDropset}
          grouped={false}
          onMakeDropsets={onMakeDropsets}
          onRemoveDropsets={onRemoveDropsets}
          onSupersetWith={onSupersetWith}
          onSwap={onSwap}
          onMakeAlternative={onMakeAlternative}
          onClose={onToggleMenu}
        />
      ) : null}
    </View>
  );
}

// ── Superset group card ───────────────────────────────────────────────────────

function GroupCard(props: {
  letter: string;
  groupId: string;
  indices: number[];
  members: RoutineExercise[];
  isFirstBlock: boolean;
  isLastBlock: boolean;
  menuForIndex: number | null;
  onToggleMemberMenu: (idx: number) => void;
  onSetRounds: (r: number) => void;
  onUnlink: () => void;
  onMoveGroupUp: () => void;
  onMoveGroupDown: () => void;
  onMemberUp: (idx: number) => void;
  onMemberDown: (idx: number) => void;
  onMemberRemove: (idx: number) => void;
  onMemberUpdateReps: (idx: number, t: string) => void;
  onMemberMakeDropsets: (idx: number) => void;
  onMemberRemoveDropsets: (idx: number) => void;
  onMemberSwap: (idx: number) => void;
  onMemberMakeAlternative: (idx: number) => void;
}): React.ReactElement {
  const {
    letter, indices, members, isFirstBlock, isLastBlock, menuForIndex, onToggleMemberMenu,
    onSetRounds, onUnlink, onMoveGroupUp, onMoveGroupDown, onMemberUp, onMemberDown,
    onMemberRemove, onMemberUpdateReps, onMemberMakeDropsets, onMemberRemoveDropsets,
    onMemberSwap, onMemberMakeAlternative,
  } = props;
  const rounds = members[0]?.superset_rounds ?? 3;
  const { t } = useTranslation();
  return (
    <View style={styles.groupCard}>
      {/* Group header: label + rounds stepper + group reorder + unlink. */}
      <View style={styles.groupHeader}>
        <View style={styles.groupTitleWrap}>
          <Ionicons name="git-merge" size={14} color={stepperPalette.accent} />
          <Text style={styles.groupTitle}>{t('components:routineEditorSheet.supersetHeader', { letter, count: rounds })}</Text>
        </View>
        <View style={styles.groupHeaderActions}>
          <TouchableOpacity
            onPress={onMoveGroupUp}
            disabled={isFirstBlock}
            style={[styles.smallBtn, isFirstBlock && styles.reorderBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.moveSupersetUpAccessibilityLabel', { letter })}
          >
            <Ionicons name="chevron-up" size={16} color={stepperPalette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onMoveGroupDown}
            disabled={isLastBlock}
            style={[styles.smallBtn, isLastBlock && styles.reorderBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.moveSupersetDownAccessibilityLabel', { letter })}
          >
            <Ionicons name="chevron-down" size={16} color={stepperPalette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onUnlink}
            style={styles.smallBtn}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.unlinkSupersetLetterAccessibilityLabel', { letter })}
          >
            <Ionicons name="close" size={16} color={stepperPalette.muted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Shared rounds stepper. */}
      <View style={styles.roundsRow}>
        <Text style={styles.roundsLabel}>{t('components:routineEditorSheet.roundsLabel')}</Text>
        <View style={styles.roundsControls}>
          <TouchableOpacity
            style={[styles.smallBtn, rounds <= 1 && styles.reorderBtnDisabled]}
            onPress={() => onSetRounds(rounds - 1)}
            disabled={rounds <= 1}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.decreaseRounds')}
          >
            <Ionicons name="remove" size={16} color={stepperPalette.text} />
          </TouchableOpacity>
          <Text style={styles.roundsValue}>{rounds}</Text>
          <TouchableOpacity
            style={[styles.smallBtn, rounds >= 10 && styles.reorderBtnDisabled]}
            onPress={() => onSetRounds(rounds + 1)}
            disabled={rounds >= 10}
            accessibilityRole="button"
            accessibilityLabel={t('components:routineEditorSheet.increaseRounds')}
          >
            <Ionicons name="add" size={16} color={stepperPalette.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Members. */}
      {members.map((m, mi) => {
        const absIndex = indices[mi]!;
        const hasDropset = !!m.dropset;
        const menuOpen = menuForIndex === absIndex;
        return (
          <View key={`m-${m.exercise_id || m.name}-${absIndex}`} style={styles.memberRow}>
            <View style={styles.memberTop}>
              <View style={styles.memberLetterWrap}>
                <Text style={styles.memberLetter}>{letter}{mi + 1}</Text>
              </View>
              <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
              <KebabButton onPress={() => onToggleMemberMenu(absIndex)} label={t('components:routineEditorSheet.optionsForAccessibilityLabel', { name: m.name })} />
            </View>

            {hasDropset ? (
              <View style={styles.dropsetBadge}>
                <Ionicons name="trending-down" size={12} color={stepperPalette.accent} />
                <Text style={styles.dropsetBadgeText}>{dropsetBadgeLabel(m.dropset, t)}</Text>
              </View>
            ) : null}

            {(m.substitutes?.length ?? 0) > 0 ? (
              <AltBadge name={m.name} subs={m.substitutes ?? []} />
            ) : null}

            <View style={styles.memberBottom}>
              <View style={styles.memberRepsWrap}>
                <Text style={styles.targetLabel}>{t('components:routineEditorSheet.repsLabel')}</Text>
                <TextInput
                  style={styles.targetInput}
                  value={m.target_reps ?? ''}
                  onChangeText={(txt) => onMemberUpdateReps(absIndex, txt)}
                  placeholder="8-12"
                  placeholderTextColor={stepperPalette.muted}
                  selectTextOnFocus
                  maxLength={12}
                  accessibilityLabel={t('components:routineEditorSheet.targetRepsAccessibilityLabel', { name: m.name })}
                />
              </View>
              <View style={styles.reorderGroup}>
                <TouchableOpacity
                  onPress={() => onMemberUp(absIndex)}
                  disabled={mi === 0}
                  style={[styles.reorderBtn, mi === 0 && styles.reorderBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('components:routineEditorSheet.moveUpWithinSupersetAccessibilityLabel', { name: m.name })}
                >
                  <Ionicons name="chevron-up" size={18} color={stepperPalette.text} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onMemberDown(absIndex)}
                  disabled={mi === members.length - 1}
                  style={[styles.reorderBtn, mi === members.length - 1 && styles.reorderBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={t('components:routineEditorSheet.moveDownWithinSupersetAccessibilityLabel', { name: m.name })}
                >
                  <Ionicons name="chevron-down" size={18} color={stepperPalette.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => onMemberRemove(absIndex)}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={t('components:routineEditorSheet.removeFromSupersetAccessibilityLabel', { name: m.name })}
              >
                <Ionicons name="trash-outline" size={18} color={stepperPalette.muted} />
              </TouchableOpacity>
            </View>

            {menuOpen ? (
              <KebabMenu
                hasDropset={hasDropset}
                grouped
                onMakeDropsets={() => onMemberMakeDropsets(absIndex)}
                onRemoveDropsets={() => onMemberRemoveDropsets(absIndex)}
                onUnlink={onUnlink}
                onSwap={() => onMemberSwap(absIndex)}
                onMakeAlternative={() => onMemberMakeAlternative(absIndex)}
                onClose={() => onToggleMemberMenu(absIndex)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: stepperPalette.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    gap: spacing.s3,
    borderBottomWidth: 1,
    borderBottomColor: stepperPalette.line,
  },
  headerBtn: { padding: spacing.s1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.bodyLg, color: stepperPalette.text },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s2,
    minHeight: 44,
  },
  savedBadgeText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.bodySm, color: stepperPalette.accent },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.s4, paddingBottom: spacing.s8 },
  fieldLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.s2,
  },
  exercisesLabel: { marginTop: spacing.s5 },
  nameInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
  },
  emptyCard: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginBottom: spacing.s3,
  },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, color: stepperPalette.muted, lineHeight: 20 },
  exRow: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  exRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  exName: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    marginRight: spacing.s2,
  },
  exRowBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s3 },
  targetGroup: { flex: 1 },
  targetLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.s1,
  },
  targetInput: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    textAlign: 'center',
  },
  reorderGroup: { flexDirection: 'row', gap: spacing.s2 },
  reorderBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    backgroundColor: stepperPalette.frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnDisabled: { opacity: 0.3 },
  iconBtn: { padding: spacing.s1, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    marginTop: spacing.s1,
  },
  addLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.bodySm, color: stepperPalette.accent },
  // Dropset badge
  dropsetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    alignSelf: 'flex-start',
    backgroundColor: stepperPalette.accentSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 3,
    marginBottom: spacing.s3,
  },
  dropsetBadgeText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.caption, color: stepperPalette.accent },
  // Expanded alternatives chip row (AltBadge)
  altChipsRow: { marginBottom: spacing.s3 },
  altChipsContent: { gap: spacing.s2, paddingRight: spacing.s3 },
  altChip: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 4,
    maxWidth: 180,
  },
  altChipText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.caption, color: stepperPalette.text },
  // Kebab menu
  menuCatcher: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  menu: {
    position: 'absolute',
    top: spacing.s8,
    right: spacing.s3,
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s1,
    minWidth: 180,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    zIndex: 50,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    minHeight: 44,
  },
  menuItemText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.bodySm, color: stepperPalette.text },
  menuItemTextMuted: { fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, color: stepperPalette.muted },
  // Group card
  groupCard: {
    backgroundColor: stepperPalette.card,
    borderWidth: 1,
    borderColor: stepperPalette.accentLine,
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s3,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s2,
  },
  groupTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1, flex: 1 },
  groupTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.accent,
    letterSpacing: 0.8,
  },
  groupHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.s1 },
  smallBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    backgroundColor: stepperPalette.frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: stepperPalette.line,
    borderBottomWidth: 1,
    borderBottomColor: stepperPalette.line,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s2,
  },
  roundsLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
  },
  roundsControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  roundsValue: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    minWidth: 28,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  memberRow: {
    backgroundColor: stepperPalette.frame,
    borderRadius: radius.sm,
    padding: spacing.s2,
    marginTop: spacing.s2,
  },
  memberTop: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.s2 },
  memberLetterWrap: {
    backgroundColor: stepperPalette.accentSurface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
    marginRight: spacing.s2,
  },
  memberLetter: { fontFamily: fontFamily.bold, fontSize: fontSize.caption, color: stepperPalette.accent },
  memberName: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    marginRight: spacing.s2,
  },
  memberBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.s2 },
  memberRepsWrap: { flex: 1 },
  // Sticky Save bar (pinned above the bottom inset).
  saveBar: {
    borderTopWidth: 1,
    borderTopColor: stepperPalette.line,
    backgroundColor: stepperPalette.bg,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  saveBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.accentInk,
  },
});
