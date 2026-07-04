/**
 * ShareCardSheet — TICKET-131 (shareable workout summary cards)
 *
 * Full-screen preview sheet: renders a themed workout summary card, lets the
 * user pick the export ratio (Story 1080x1920 / Square 1080x1080) and
 * optionally opt in to the percentile "flex line" for THIS share only, then
 * exports via react-native-view-shot -> expo-sharing to the OS share sheet.
 *
 * Zero server involvement anywhere in this component:
 *   - PR badges / volume / sets / streak are passed in by the caller, who
 *     already read them from the tier-branched local-first data layer.
 *   - The percentile flex line is computed ON-DEVICE from local sets + the
 *     local profile snapshot (loadLocalProfile) via lib/shareCard/
 *     shareCardPercentile.ts — never a network call, on ANY tier.
 *   - Export is a user-initiated OS share action; nothing is uploaded.
 *
 * SAFE-AREA (CLAUDE.md §3): insets do NOT propagate inside a RN <Modal> — the
 * bottom-sheet header gets `Math.max(insets.top, 12)` padding directly, and
 * the sheet's bottom edge gets `Math.max(insets.bottom, spacing.s4)`, mirroring
 * the pattern already used in SupersetPairSheet.tsx / DropsetConfigSheet.tsx.
 *
 * Styling: 100% from the user's ACTIVE THEME (useTheme()) — the accent color
 * IS the user's cosmetic/theme choice already (ThemeContext + cosmetics feed
 * the same `theme.colors.accentDefault`), so no separate "cosmetics accent"
 * plumbing is needed here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { haptics } from '../utils/haptics';
import { getSetting, setSetting } from '../data/appSettings';
import { loadLocalProfile } from '../data/profile';
import {
  buildShareCardDisplay,
  ShareCardPrBadge,
  ShareCardDisplay,
} from '../lib/shareCard/shareCardData';
import {
  bestLiftE1rms,
  flexLineForLift,
  flexLineOverall,
  FlexLiftSetInput,
  FlexLineResult,
} from '../lib/shareCard/shareCardPercentile';
import {
  exportAndShareCard,
  isViewShotAvailable,
  ShareCardRatio,
  ShareCardViewRef,
} from '../lib/shareCard/exportShareCard';
import { UnitSystem } from '../constants/units';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Persisted "remember the flex-line toggle" setting (generic appSettings KV —
// no edit to appSettings.ts needed, it already exposes getSetting/setSetting).
// ---------------------------------------------------------------------------

const FLEX_LINE_OPT_IN_KEY = 'share_card_flex_line_opt_in';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ShareCardSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Workout / routine name shown as the card title. */
  workoutName: string | null | undefined;
  /** Session date, YYYY-MM-DD (local-time day-key, same convention as the rest of the app). */
  dayKey: string;
  /** Session duration in seconds, if known (e.g. from the logger's elapsedSeconds). */
  durationSec?: number | null;
  /** Total volume across all lift sets, in exact kg. */
  totalVolumeKg: number;
  /** Total set count (lift + cardio). */
  setCount: number;
  /** Current week-streak (useStreak / useLocalStreak). */
  streakWeeks: number;
  /** PR badges earned in this session (already computed by the caller's PR table / e1RM compare). */
  prBadges: ShareCardPrBadge[];
  /**
   * Every lift set in the session (or, for a richer flex line, the user's
   * full history) — used ONLY on-device to find the best competition-lift
   * e1RM for the optional percentile line. Pass an empty array to disable
   * the flex-line feature entirely (it degrades to "unavailable" gracefully).
   */
  flexLineCandidateSets: FlexLiftSetInput[];
  unitPref: UnitSystem;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShareCardSheet(props: ShareCardSheetProps): React.ReactElement {
  const {
    visible,
    onClose,
    workoutName,
    dayKey,
    durationSec,
    totalVolumeKg,
    setCount,
    streakWeeks,
    prBadges,
    flexLineCandidateSets,
    unitPref,
  } = props;

  const { theme, spacing: sp, radius: r, fontSize: fs, fontWeight: fw } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [ratio, setRatio] = useState<ShareCardRatio>('story');
  const [flexEnabled, setFlexEnabled] = useState(false);
  const [flexAvailable, setFlexAvailable] = useState(false);
  const [flexResult, setFlexResult] = useState<FlexLineResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const cardRef = useRef<View>(null);

  // Load the remembered opt-in preference + compute the flex line candidate
  // on-device whenever the sheet opens. Best-effort: any failure just leaves
  // the flex line unavailable (never blocks the rest of the card).
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    (async () => {
      const [rememberedRaw, profile] = await Promise.all([
        getSetting(FLEX_LINE_OPT_IN_KEY).catch(() => null),
        loadLocalProfile().catch(() => null),
      ]);
      if (cancelled) return;

      const remembered = rememberedRaw === '1';
      setFlexEnabled(remembered);

      const bestByLift = bestLiftE1rms(flexLineCandidateSets);
      const liftIds = Object.keys(bestByLift) as Array<keyof typeof bestByLift>;
      if (liftIds.length === 0 || !profile?.bodyweight_kg) {
        setFlexAvailable(false);
        setFlexResult(null);
        return;
      }

      // Prefer a single named lift (the flex line reads best when it names the
      // exact lift just trained); fall back to the overall composite (squat/
      // bench/deadlift only — the DOTS composite has no OHP term) when the
      // session's lift isn't individually resolvable but a subset is known.
      const [firstLift] = liftIds;
      const single = firstLift
        ? flexLineForLift(firstLift, bestByLift[firstLift]!, profile.bodyweight_kg, profile.sex)
        : null;
      const competitionLifts: Partial<Record<'squat' | 'bench' | 'deadlift', number>> = {
        ...(bestByLift.squat != null ? { squat: bestByLift.squat } : {}),
        ...(bestByLift.bench != null ? { bench: bestByLift.bench } : {}),
        ...(bestByLift.deadlift != null ? { deadlift: bestByLift.deadlift } : {}),
      };
      const result = single ?? flexLineOverall(competitionLifts, profile.bodyweight_kg, profile.sex);

      setFlexAvailable(!!result);
      setFlexResult(result);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, flexLineCandidateSets]);

  const toggleFlexLine = useCallback((next: boolean) => {
    setFlexEnabled(next);
    haptics.light();
    void setSetting(FLEX_LINE_OPT_IN_KEY, next ? '1' : '0');
  }, []);

  const display: ShareCardDisplay = useMemo(
    () =>
      buildShareCardDisplay({
        workoutName,
        dayKey,
        durationSec,
        totalVolumeKg,
        setCount,
        streakWeeks,
        prBadges,
        unitPref,
        flexLine: flexEnabled && flexAvailable ? flexResult : null,
      }),
    [workoutName, dayKey, durationSec, totalVolumeKg, setCount, streakWeeks, prBadges, unitPref, flexEnabled, flexAvailable, flexResult],
  );

  const viewShotOk = isViewShotAvailable();

  const handleShare = useCallback(async () => {
    if (!viewShotOk) {
      setExportError(t('components:shareCardSheet.sharingNeedsUpdate'));
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const result = await exportAndShareCard(cardRef.current as ShareCardViewRef, ratio);
      if (!result.ok) {
        setExportError(result.error ?? t('components:shareCardSheet.couldNotShare'));
      } else {
        haptics.success();
      }
    } finally {
      setExporting(false);
    }
  }, [ratio, viewShotOk]);

  const cardAspect = ratio === 'story' ? 1080 / 1920 : 1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
        accessibilityLabel={t('components:shareCardSheet.dismissAccessibilityLabel')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.bgElevated,
            borderTopLeftRadius: r.lg,
            borderTopRightRadius: r.lg,
            paddingBottom: Math.max(insets.bottom, sp.s4) + sp.s2,
          },
        ]}
      >
        {/* Header row — safe-area-in-Modal fix per CLAUDE.md §3: pad DIRECTLY, do
            not rely on SafeAreaView/useSafeAreaInsets propagating through the Modal. */}
        <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 12), paddingHorizontal: sp.s5 }]}>
          <View style={[styles.handle, { backgroundColor: theme.colors.borderDefault, borderRadius: r.full ?? 999 }]} />
          <View style={styles.headerTitleRow}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold }}>
              {t('components:shareCardSheet.shareWorkout')}
            </Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common:close')}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: sp.s5, paddingBottom: sp.s4 }} keyboardShouldPersistTaps="handled">
          {/* ── Card preview ─────────────────────────────────────────────── */}
          <View style={[styles.previewFrame, { aspectRatio: cardAspect, borderRadius: r.lg, borderColor: theme.colors.borderDefault }]}>
            <View
              ref={cardRef}
              collapsable={false}
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.bgPrimary,
                  borderColor: theme.colors.accentDefault,
                },
              ]}
            >
              <View style={styles.cardBody}>
                <Text style={[styles.cardKicker, { color: theme.colors.accentDefault, fontSize: fs.caption, fontWeight: fw.semibold }]}>
                  {t('components:shareCardSheet.workoutComplete')}
                </Text>
                <Text style={[styles.cardTitle, { color: theme.colors.textPrimary, fontSize: fs.heading1, fontWeight: fw.bold }]} numberOfLines={2}>
                  {display.title}
                </Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodyMd, marginTop: sp.s1 }}>
                  {display.dateLabel}
                </Text>

                <View style={[styles.statsRow, { marginTop: sp.s5, gap: sp.s4 }]}>
                  <StatBlock label={t('components:shareCardSheet.volume')} value={display.volumeLabel} theme={theme} fs={fs} fw={fw} />
                  <StatBlock label={t('components:shareCardSheet.sets')} value={display.setCountLabel} theme={theme} fs={fs} fw={fw} />
                  {display.durationLabel ? (
                    <StatBlock label={t('components:shareCardSheet.duration')} value={display.durationLabel} theme={theme} fs={fs} fw={fw} />
                  ) : null}
                </View>

                {display.streakLabel ? (
                  <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, marginTop: sp.s3 }}>
                    🔥 {display.streakLabel}
                  </Text>
                ) : null}

                {display.prBadgeLabels.length > 0 ? (
                  <View style={{ marginTop: sp.s4, gap: sp.s1 }}>
                    {display.prBadgeLabels.map((label, i) => (
                      <View
                        key={i}
                        style={[
                          styles.prBadge,
                          { borderColor: theme.colors.statusSuccess, borderRadius: r.sm ?? 6 },
                        ]}
                      >
                        <Text style={{ color: theme.colors.statusSuccess, fontSize: fs.bodySm, fontWeight: fw.semibold }}>
                          {label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {display.flexLineLabel ? (
                  <View style={[styles.flexLine, { borderTopColor: theme.colors.borderDefault, marginTop: sp.s5, paddingTop: sp.s3 }]}>
                    <Text style={{ color: theme.colors.accentDefault, fontSize: fs.bodySm, fontWeight: fw.bold, letterSpacing: 0.6 }}>
                      {display.flexLineLabel}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Footer — wordmark + subtle app-store hint (no auto-post, no analytics). */}
              <View style={styles.cardFooter}>
                <Text style={{ color: theme.colors.textTertiary, fontSize: fs.caption, fontWeight: fw.semibold }}>
                  {t('components:shareCardSheet.wordmark')}
                </Text>
                <Text style={{ color: theme.colors.textTertiary, fontSize: fs.micro }}>
                  {t('components:shareCardSheet.trackYours')}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Ratio toggle ─────────────────────────────────────────────── */}
          <View style={[styles.ratioRow, { marginTop: sp.s4, gap: sp.s2 }]}>
            <RatioButton label={t('components:shareCardSheet.ratioStory')} active={ratio === 'story'} onPress={() => setRatio('story')} theme={theme} fs={fs} fw={fw} r={r} />
            <RatioButton label={t('components:shareCardSheet.ratioSquare')} active={ratio === 'square'} onPress={() => setRatio('square')} theme={theme} fs={fs} fw={fw} r={r} />
          </View>

          {/* ── Flex-line opt-in toggle (per-share, remembered) ─────────────── */}
          {flexAvailable ? (
            <TouchableOpacity
              style={[
                styles.flexToggleRow,
                {
                  marginTop: sp.s4,
                  borderRadius: r.md,
                  borderColor: theme.colors.borderDefault,
                  paddingHorizontal: sp.s4,
                  paddingVertical: sp.s3,
                },
              ]}
              onPress={() => toggleFlexLine(!flexEnabled)}
              accessibilityRole="switch"
              accessibilityState={{ checked: flexEnabled }}
              accessibilityLabel={t('components:shareCardSheet.includeFlexLineAccessibilityLabel')}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fw.medium }}>
                  {t('components:shareCardSheet.showFlexLine')}
                </Text>
                <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: 2 }}>
                  {flexResult?.headline ?? t('components:shareCardSheet.computedOnDevice')}
                </Text>
              </View>
              <View
                style={[
                  styles.switchTrack,
                  {
                    backgroundColor: flexEnabled ? theme.colors.accentDefault : theme.colors.bgTertiary,
                    borderRadius: r.full ?? 999,
                  },
                ]}
              >
                <View
                  style={[
                    styles.switchThumb,
                    {
                      backgroundColor: theme.components.buttonPrimaryText,
                      alignSelf: flexEnabled ? 'flex-end' : 'flex-start',
                    },
                  ]}
                />
              </View>
            </TouchableOpacity>
          ) : null}

          {!viewShotOk ? (
            <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: sp.s3 }}>
              {t('components:shareCardSheet.exportUnavailable')}
            </Text>
          ) : null}

          {exportError ? (
            <Text style={{ color: theme.colors.statusError, fontSize: fs.bodySm, marginTop: sp.s3 }}>
              {exportError}
            </Text>
          ) : null}

          <TouchableOpacity
            style={[
              styles.shareBtn,
              {
                backgroundColor: viewShotOk ? theme.colors.accentDefault : theme.colors.bgTertiary,
                borderRadius: r.md,
                marginTop: sp.s5,
              },
            ]}
            onPress={handleShare}
            disabled={exporting || !viewShotOk}
            accessibilityRole="button"
            accessibilityLabel={t('components:shareCardSheet.shareWorkoutCardAccessibilityLabel')}
          >
            {exporting ? (
              <ActivityIndicator color={theme.components.buttonPrimaryText} />
            ) : (
              <>
                <Ionicons name="share-outline" size={18} color={theme.components.buttonPrimaryText} />
                <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyLg, fontWeight: fw.bold, marginLeft: sp.s2 }}>
                  {t('common:share')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

interface ThemeLikeProps {
  theme: ReturnType<typeof useTheme>['theme'];
  fs: ReturnType<typeof useTheme>['fontSize'];
  fw: ReturnType<typeof useTheme>['fontWeight'];
}

function StatBlock({ label, value, theme, fs, fw }: ThemeLikeProps & { label: string; value: string }): React.ReactElement {
  return (
    <View>
      <Text style={{ color: theme.colors.textTertiary, fontSize: fs.caption, fontWeight: fw.semibold, letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.textPrimary, fontSize: fs.heading3, fontWeight: fw.bold, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

function RatioButton({
  label,
  active,
  onPress,
  theme,
  fs,
  fw,
  r,
}: ThemeLikeProps & { label: string; active: boolean; onPress: () => void; r: ReturnType<typeof useTheme>['radius'] }): React.ReactElement {
  return (
    <TouchableOpacity
      style={[
        styles.ratioBtn,
        {
          borderRadius: r.md,
          borderColor: active ? theme.colors.accentDefault : theme.colors.borderDefault,
          backgroundColor: active ? theme.colors.accentDefault + '1a' : 'transparent',
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text style={{ color: active ? theme.colors.accentDefault : theme.colors.textSecondary, fontSize: fs.bodySm, fontWeight: fw.semibold }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles (layout only — colors come from theme tokens above)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '92%',
  },
  headerRow: {},
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginBottom: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  previewFrame: {
    width: '100%',
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  card: {
    flex: 1,
    borderWidth: 2,
    justifyContent: 'space-between',
    padding: 24,
  },
  cardBody: {
    flex: 1,
  },
  cardKicker: {
    letterSpacing: 1.2,
  },
  cardTitle: {
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  prBadge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  flexLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  ratioRow: {
    flexDirection: 'row',
  },
  ratioBtn: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  flexToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  switchTrack: {
    width: 44,
    height: 26,
    padding: 3,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
});
