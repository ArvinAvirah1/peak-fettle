/**
 * SubstituteSwapSheet.tsx — SUBS-001: the unified "swap exercise" bottom sheet.
 * =============================================================================
 * ONE sheet, two mount points:
 *   • RoutineEditorSheet ('editor' mode) — picking a target PERMANENTLY replaces
 *     the exercise in the routine (the parent rewrites the exercises array and
 *     the original drops into the slot's substitute list). Substitutes can be
 *     added (with a "Save for all routines" scope checkbox) and removed here.
 *   • WorkoutLoggerHost ('session' mode) — picking a target swaps for TODAY
 *     only (the parent mutates the live RoutineSession; the saved routine is
 *     NEVER touched — founder decision 2026-07-18). New substitutes added
 *     mid-session are always GLOBAL (routine writes are editor-only).
 *
 * Sections, in order:
 *   1. YOUR SUBSTITUTES — the user's preloaded subs (routine-scoped +
 *      global, merged/deduped by the parent via data/substitutes.ts).
 *      FREE for all tiers.
 *   2. SUGGESTED — algorithmic candidates from the on-device quick-swap
 *      engine (planGen/quickSwap.ts). Pro-gated: free users see a locked
 *      teaser row (onUpgrade). Empty-state copy reuses misc:quickSwapSheet.
 *   3. Add substitute / Browse full library — both open the shared
 *      ExercisePicker (stacked-Modal pattern, same as RoutineEditorSheet).
 *
 * Presentational + callback-driven like QuickSwapSheet (which this supersedes
 * in the logger): the parent computes lists, performs the swap/persistence,
 * and applies the uuidOrNull server-compat guard before any routine write.
 *
 * SAFE-AREA (CLAUDE.md §3): insets do NOT propagate inside a RN <Modal>; the
 * sheet is bottom-anchored so the BOTTOM inset is applied directly.
 * =============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Ionicons } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { ExercisePicker } from './ExercisePicker';
import type { Exercise } from '../types/api';
import type { SwapCandidate } from '../planGen/quickSwap';
import type { ScopedSubstitute, SubstituteScope } from '../data/substitutes';

// ── Types ────────────────────────────────────────────────────────────────────

/** What the parent receives when the user picks a swap target. */
export interface SwapSelection {
  exercise_id: string | null;
  name: string;
  /** Where the pick came from (analytics/copy — parents may ignore). */
  source: 'substitute' | 'suggested' | 'library';
}

export interface SubstituteSwapSheetProps {
  visible: boolean;
  /** 'editor' = permanent replace in the routine; 'session' = today only. */
  mode: 'editor' | 'session';
  /** Display name of the exercise being swapped away (for copy). */
  originalName: string;
  /** Merged user substitutes (routine + global), from data/substitutes.ts. */
  userSubs: ScopedSubstitute[];
  /** Ranked engine candidates (Pro). Empty for free users. */
  suggested: SwapCandidate[];
  /** Free tier: show the locked SUGGESTED teaser instead of candidates. */
  suggestedLocked?: boolean;
  /** Populated when `suggested` is empty — quickSwap SwapResult.reason. */
  suggestedEmptyReason?: string | null;
  /** True while lists are being computed (usually instant — on-device). */
  loading?: boolean;
  /** Inline confirmation after a swap (session mode: "Swapped … for today"). */
  confirmation?: string | null;
  /** Session mode: show "Never suggest <original> again" (generated plan exists). */
  canMakePermanent?: boolean;
  /** Called when the user picks any swap target. */
  onSelect: (sel: SwapSelection) => void;
  /** Persist a new substitute. Parent routes by scope (routine JSON vs global table). */
  onAddSub: (sub: { exercise_id: string | null; name: string }, scope: SubstituteScope) => void;
  /** Editor mode: remove a substitute (routine or global, per its scope). */
  onRemoveSub?: (sub: ScopedSubstitute) => void;
  /** Editor mode: allow the "this routine" scope (checkbox). Session forces global. */
  allowRoutineScope?: boolean;
  /** Session mode: permanent plan exclusion (existing quick-swap feature). */
  onNeverSuggest?: () => void;
  /** Open the exercise detail sheet (diagram + cues) for a suggested candidate. */
  onViewDetails?: (candidate: SwapCandidate) => void;
  /** Free tier: navigate to plans/paywall from the locked SUGGESTED teaser. */
  onUpgrade?: () => void;
  onClose: () => void;
}

// Reuses the quick-swap empty-state copy (same engine, same reasons).
function suggestedEmptyCopy(t: TFunction, reason: string | null | undefined): string {
  switch (reason) {
    case 'unresolved-exercise':
      return t('misc:quickSwapSheet.emptyUnresolvedExercise');
    case 'no-match-after-filters':
      return t('misc:quickSwapSheet.emptyNoMatchAfterFilters');
    case 'no-match':
    default:
      return t('misc:quickSwapSheet.emptyNoMatch');
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function SubstituteSwapSheet(props: SubstituteSwapSheetProps): React.ReactElement {
  const {
    visible,
    mode,
    originalName,
    userSubs,
    suggested,
    suggestedLocked = false,
    suggestedEmptyReason = null,
    loading = false,
    confirmation = null,
    canMakePermanent = false,
    onSelect,
    onAddSub,
    onRemoveSub,
    allowRoutineScope = false,
    onNeverSuggest,
    onViewDetails,
    onUpgrade,
    onClose,
  } = props;
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Picker intent: 'swap' = pick a one-off swap target; 'add' = pick a new sub.
  const [pickerIntent, setPickerIntent] = useState<'swap' | 'add' | null>(null);
  // Add-flow scope (editor only): unchecked = this routine, checked = global.
  const [addGlobal, setAddGlobal] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPickerIntent(null);
      setAddGlobal(false);
    }
  }, [visible]);

  const handlePicked = useCallback(
    (ex: Exercise) => {
      const picked = { exercise_id: ex.id || null, name: ex.name };
      if (pickerIntent === 'add') {
        const scope: SubstituteScope =
          mode === 'session' || !allowRoutineScope || addGlobal ? 'global' : 'routine';
        onAddSub(picked, scope);
      } else {
        onSelect({ ...picked, source: 'library' });
      }
      setPickerIntent(null);
    },
    [pickerIntent, mode, allowRoutineScope, addGlobal, onAddSub, onSelect],
  );

  const sectionHeaderStyle = {
    color: theme.colors.textTertiary,
    fontSize: fs.caption,
    fontWeight: fw.bold,
    letterSpacing: 0.8,
    marginTop: sp.s3,
    marginBottom: sp.s2,
  } as const;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={onClose}
          accessibilityLabel={t('components:substituteSwapSheet.dismissA11y')}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.bgElevated,
              borderTopLeftRadius: r.lg,
              borderTopRightRadius: r.lg,
              paddingHorizontal: sp.s5,
              paddingTop: sp.s3,
              // Home-indicator inset applied directly (does not propagate in Modal).
              paddingBottom: Math.max(insets.bottom, sp.s4) + sp.s2,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.colors.borderDefault, borderRadius: r.full ?? 999 }]} />
          <View style={styles.headerRow}>
            <Ionicons name="swap-horizontal" size={20} color={theme.colors.accentDefault} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold, marginLeft: sp.s2 }}>
              {t('components:substituteSwapSheet.title')}
            </Text>
          </View>
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s2 }}>
            {mode === 'editor'
              ? t('components:substituteSwapSheet.subtitleEditor', { name: originalName })
              : t('components:substituteSwapSheet.subtitleSession', { name: originalName })}
          </Text>

          {confirmation ? (
            <View
              style={[
                styles.confirmBanner,
                { backgroundColor: theme.colors.accentSecondary, borderRadius: r.md, marginBottom: sp.s3 },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.accentDefault} />
              <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodySm, marginLeft: sp.s2, flex: 1 }}>
                {confirmation}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={theme.colors.accentDefault} style={{ marginTop: sp.s4, marginBottom: sp.s4 }} />
          ) : (
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {/* ── 1. Your substitutes (free for everyone) ── */}
              <Text style={sectionHeaderStyle}>
                {t('components:substituteSwapSheet.yourSubsHeader')}
              </Text>
              {userSubs.length === 0 ? (
                <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s2 }}>
                  {t('components:substituteSwapSheet.noSubsYet')}
                </Text>
              ) : (
                userSubs.map((s) => (
                  <TouchableOpacity
                    key={`${s.scope}-${s.exercise_id || s.name}`}
                    style={[styles.row, { borderBottomColor: theme.colors.borderDefault }]}
                    onPress={() => onSelect({ exercise_id: s.exercise_id ?? null, name: s.name, source: 'substitute' })}
                    accessibilityRole="button"
                    accessibilityLabel={t('components:substituteSwapSheet.swapToA11y', { name: s.name })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fw.medium }}>
                        {s.name}
                      </Text>
                      <View
                        style={[
                          styles.scopeBadge,
                          { backgroundColor: theme.colors.accentSecondary, borderRadius: r.sm, marginTop: 3 },
                        ]}
                      >
                        <Text style={{ color: theme.colors.accentDefault, fontSize: fs.caption, fontWeight: fw.bold }}>
                          {s.scope === 'routine'
                            ? t('components:substituteSwapSheet.scopeRoutineBadge')
                            : t('components:substituteSwapSheet.scopeGlobalBadge')}
                        </Text>
                      </View>
                    </View>
                    {mode === 'editor' && onRemoveSub ? (
                      <TouchableOpacity
                        onPress={() => onRemoveSub(s)}
                        style={styles.rowIconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('components:substituteSwapSheet.removeSubA11y', { name: s.name })}
                      >
                        <Ionicons name="trash-outline" size={17} color={theme.colors.textTertiary} />
                      </TouchableOpacity>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ))
              )}

              {/* ── 2. Suggested (Pro; locked teaser on free) ── */}
              <Text style={sectionHeaderStyle}>
                {t('components:substituteSwapSheet.suggestedHeader')}
              </Text>
              {suggestedLocked ? (
                <TouchableOpacity
                  style={[
                    styles.lockedCard,
                    { backgroundColor: theme.colors.bgTertiary, borderColor: theme.colors.borderDefault, borderRadius: r.md },
                  ]}
                  onPress={onUpgrade}
                  accessibilityRole="button"
                  accessibilityLabel={t('components:substituteSwapSheet.suggestedLockedCta')}
                >
                  <Ionicons name="lock-closed" size={16} color={theme.colors.textTertiary} />
                  <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, flex: 1, marginLeft: sp.s2 }}>
                    {t('components:substituteSwapSheet.suggestedLockedBody')}
                  </Text>
                  <Text style={{ color: theme.colors.accentDefault, fontSize: fs.bodySm, fontWeight: fw.bold }}>
                    {t('components:substituteSwapSheet.suggestedLockedCta')}
                  </Text>
                </TouchableOpacity>
              ) : suggested.length === 0 ? (
                <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s2 }}>
                  {suggestedEmptyCopy(t, suggestedEmptyReason)}
                </Text>
              ) : (
                suggested.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.row, { borderBottomColor: theme.colors.borderDefault }]}
                    onPress={() => onSelect({ exercise_id: c.id, name: c.name, source: 'suggested' })}
                    accessibilityRole="button"
                    accessibilityLabel={t('components:substituteSwapSheet.swapToA11y', { name: c.name })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fw.medium }}>
                        {c.name}
                      </Text>
                      <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: 2 }}>
                        {c.why}
                      </Text>
                    </View>
                    {onViewDetails ? (
                      <TouchableOpacity
                        onPress={() => onViewDetails(c)}
                        style={styles.rowIconBtn}
                        accessibilityRole="button"
                        accessibilityLabel={t('components:substituteSwapSheet.viewDetailsA11y', { name: c.name })}
                      >
                        <Ionicons name="information-circle-outline" size={18} color={theme.colors.textTertiary} />
                      </TouchableOpacity>
                    ) : null}
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}

          {/* ── 3. Add substitute + browse library ── */}
          {mode === 'editor' && allowRoutineScope ? (
            <TouchableOpacity
              style={[styles.scopeToggleRow, { marginTop: sp.s3 }]}
              onPress={() => setAddGlobal((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: addGlobal }}
              accessibilityLabel={t('components:substituteSwapSheet.addScopeAllRoutines')}
            >
              <Ionicons
                name={addGlobal ? 'checkbox' : 'square-outline'}
                size={18}
                color={addGlobal ? theme.colors.accentDefault : theme.colors.textTertiary}
              />
              <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, marginLeft: sp.s2 }}>
                {t('components:substituteSwapSheet.addScopeAllRoutines')}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ color: theme.colors.textTertiary, fontSize: fs.caption, marginTop: sp.s3 }}>
              {t('components:substituteSwapSheet.addScopeSessionHint')}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: sp.s2, marginTop: sp.s2 }}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { borderColor: theme.colors.accentDefault, borderRadius: r.md, flex: 1 },
              ]}
              onPress={() => setPickerIntent('add')}
              accessibilityRole="button"
              accessibilityLabel={t('components:substituteSwapSheet.addSubstituteA11y')}
            >
              <Text style={{ color: theme.colors.accentDefault, fontSize: fs.bodySm, fontWeight: fw.bold }}>
                {t('components:substituteSwapSheet.addSubstitute')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { borderColor: theme.colors.borderDefault, borderRadius: r.md, flex: 1 },
              ]}
              onPress={() => setPickerIntent('swap')}
              accessibilityRole="button"
              accessibilityLabel={t('components:substituteSwapSheet.browseLibrary')}
            >
              <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, fontWeight: fw.medium }}>
                {t('components:substituteSwapSheet.browseLibrary')}
              </Text>
            </TouchableOpacity>
          </View>

          {mode === 'session' && canMakePermanent && onNeverSuggest ? (
            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: sp.s2 }]}
              onPress={onNeverSuggest}
              accessibilityRole="button"
              accessibilityLabel={t('misc:quickSwapSheet.neverSuggestAgainA11y', { name: originalName })}
            >
              <Ionicons name="close-circle-outline" size={16} color={theme.colors.textTertiary} />
              <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginLeft: sp.s2 }} numberOfLines={1}>
                {t('misc:quickSwapSheet.neverSuggestAgain', { name: originalName })}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md, marginTop: sp.s2 }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('components:substituteSwapSheet.close')}
          >
            <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodyMd }}>
              {confirmation
                ? t('components:substituteSwapSheet.done')
                : t('components:substituteSwapSheet.cancel')}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Shared library picker (stacked-Modal pattern — same as RoutineEditorSheet). */}
      <ExercisePicker
        visible={pickerIntent != null}
        onSelect={handlePicked}
        onClose={() => setPickerIntent(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    minHeight: 52,
  },
  rowIconBtn: {
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  scopeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
  },
  actionBtn: {
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 40,
  },
  cancelBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});

export default SubstituteSwapSheet;
