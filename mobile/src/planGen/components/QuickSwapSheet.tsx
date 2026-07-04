/**
 * QuickSwapSheet.tsx — Pro "Machine busy? Swap" bottom sheet (Stage 3).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 §4. Lists region-aware, deterministically
 * ranked alternatives (from planGen/quickSwap.ts — on-device, no network) for the
 * exercise a Pro user is mid-set on. Selecting one swaps the exercise for TODAY's
 * session only; an optional "Never suggest <original> again" action makes it a
 * permanent Stage-2 meta-change when a generated plan exists.
 *
 * This component OWNS all the swap UI; WorkoutLoggerHost only mounts it with a
 * small mount point (hazard pattern — keep the big-file insertion minimal).
 * Presentational + callback-driven: the parent computes candidates, performs the
 * swap, and (optionally) the permanent exclusion.
 *
 * SAFE-AREA (CLAUDE.md §3): SafeAreaView / insets do NOT propagate inside a RN
 * <Modal>, so paddingTop from useSafeAreaInsets() is applied DIRECTLY to the
 * sheet — here the sheet is bottom-anchored, so the inset that matters is the
 * BOTTOM one (home-indicator); the header row still gets a min top pad for the
 * grab handle. The bottom inset is applied directly to the sheet container.
 * =============================================================================
 */

import React from 'react';
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
import { Ionicons } from '../../components/Icon';
import { useTheme } from '../../theme/ThemeContext';
import type { SwapCandidate } from '../quickSwap';

export interface QuickSwapSheetProps {
  visible: boolean;
  /** Display name of the exercise being swapped away (for copy). */
  originalName: string;
  /** Ranked alternatives (planGen/quickSwap.ts). */
  candidates: SwapCandidate[];
  /** True while candidates are being computed (usually instant — on-device). */
  loading?: boolean;
  /** Populated when candidates is empty — a short human explanation. */
  emptyReason?: string | null;
  /** Inline confirmation to show after a swap (e.g. "Swapped for today"). */
  confirmation?: string | null;
  /** Show the "Never suggest again" action (only when a generated plan exists). */
  canMakePermanent?: boolean;
  /** Called when the user picks an alternative (today-only swap). */
  onSelect: (candidate: SwapCandidate) => void;
  /** Called when the user taps "Never suggest <original> again". */
  onNeverSuggest?: () => void;
  /** TICKET-134: open the exercise detail sheet (diagram + cues) for a candidate. */
  onViewDetails?: (candidate: SwapCandidate) => void;
  /** Dismiss the sheet. */
  onClose: () => void;
}

function emptyCopy(reason: string | null | undefined): string {
  switch (reason) {
    case 'unresolved-exercise':
      return "We don't have alternatives catalogued for this exercise yet.";
    case 'no-match-after-filters':
      return 'No alternatives match your equipment and injury settings right now.';
    case 'no-match':
    default:
      return 'No suitable alternatives found for this exercise.';
  }
}

export function QuickSwapSheet(props: QuickSwapSheetProps): React.ReactElement {
  const {
    visible,
    originalName,
    candidates,
    loading = false,
    emptyReason = null,
    confirmation = null,
    canMakePermanent = false,
    onSelect,
    onNeverSuggest,
    onViewDetails,
    onClose,
  } = props;
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const insets = useSafeAreaInsets();

  return (
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
        accessibilityLabel="Dismiss swap sheet"
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
        {/* Header row — grab handle + title. Min top pad per the safe-area caveat. */}
        <View style={{ paddingTop: Math.max(insets.top > 0 ? 0 : 0, 4) }}>
          <View style={[styles.handle, { backgroundColor: theme.colors.borderDefault, borderRadius: r.full ?? 999 }]} />
          <View style={styles.headerRow}>
            <Ionicons name="swap-horizontal" size={20} color={theme.colors.accentDefault} />
            <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold, marginLeft: sp.s2 }]}>
              Machine busy? Swap
            </Text>
          </View>
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s3 }}>
            Same target, different setup — for today only.
          </Text>
        </View>

        {confirmation ? (
          <View
            style={[
              styles.confirmBanner,
              { backgroundColor: theme.colors.accentSecondary, borderRadius: r.md, marginBottom: sp.s3 },
            ]}
          >
            <Ionicons name="checkmark-circle" size={16} color={theme.colors.accentDefault} />
            <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodySm, marginLeft: sp.s2 }}>
              {confirmation}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={theme.colors.accentDefault} style={{ marginTop: sp.s4, marginBottom: sp.s4 }} />
        ) : candidates.length === 0 ? (
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: sp.s3, marginBottom: sp.s3 }}>
            {emptyCopy(emptyReason)}
          </Text>
        ) : (
          <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
            {candidates.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.row, { borderBottomColor: theme.colors.borderDefault }]}
                onPress={() => onSelect(c)}
                accessibilityRole="button"
                accessibilityLabel={`Swap to ${c.name}. ${c.why}`}
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
                    style={{ minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${c.name}`}
                  >
                    <Ionicons name="information-circle-outline" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {canMakePermanent && onNeverSuggest ? (
          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: sp.s3 }]}
            onPress={onNeverSuggest}
            accessibilityRole="button"
            accessibilityLabel={`Never suggest ${originalName} again`}
          >
            <Ionicons name="close-circle-outline" size={16} color={theme.colors.textTertiary} />
            <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginLeft: sp.s2 }} numberOfLines={1}>
              Never suggest {originalName} again
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md, marginTop: sp.s3 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodyMd }}>
            {confirmation ? 'Done' : 'Cancel'}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
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
  title: {},
  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 44,
  },
  cancelBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});

export default QuickSwapSheet;
