/**
 * MuscleHeatmap -- front/back anatomical body coloured by freshness score
 * from GET /insights/recovery.
 *
 * Rebuilt 2026-07-07: the legacy hand-drawn SVG outline + ellipse "blob"
 * regions (which never read as a real human) are replaced by the same
 * `react-native-body-highlighter` anatomical body MuscleMap adopted on
 * 2026-06-19 -- one art pipeline everywhere. Taxonomy (region keys, aliases,
 * freshness buckets, detail sheet, substitutes hook) is unchanged.
 *
 * Freshness colour mapping (spec section 6):
 *   0-39  -> theme statusError   (needs recovery)
 *   40-74 -> theme statusWarning (moderate)
 *   75-100 -> theme statusSuccess (fresh)
 *   Not in data (never trained) -> body default fill
 *
 * Agent K polish (2026-06-11):
 *   - Empty state: icon + headline + guidance when muscles array is empty
 *   - Entrance animation (FadeInDown, Reduce Motion aware)
 *   - Detail modal dismiss button min touch target 44pt
 *
 * No raw 'bold' -- fontWeight token only.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Body, { type Slug, type ExtendedBodyPart } from 'react-native-body-highlighter';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight, radius } from '../theme/tokens';
import { MuscleRecovery } from '../api/insights';
import { useAuth } from '../hooks/useAuth';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Freshness -> color
// ---------------------------------------------------------------------------

function freshnessColor(
  freshness: number | undefined,
  colors: { statusError: string; statusWarning: string; statusSuccess: string; borderDefault: string },
): string {
  if (freshness === undefined) return colors.borderDefault + '88';
  if (freshness < 40) return colors.statusError;
  if (freshness < 75) return colors.statusWarning;
  return colors.statusSuccess;
}

// ---------------------------------------------------------------------------
// Muscle -> canonical key mapping (normalise server names)
// ---------------------------------------------------------------------------

const MUSCLE_ALIASES: Record<string, string> = {
  chest: 'chest',
  pectorals: 'chest',
  pecs: 'chest',
  front_delts: 'front_delts',
  front_deltoids: 'front_delts',
  anterior_deltoids: 'front_delts',
  side_delts: 'side_delts',
  lateral_deltoids: 'side_delts',
  rear_delts: 'rear_delts',
  posterior_deltoids: 'rear_delts',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  abs: 'abs',
  core: 'abs',
  obliques: 'obliques',
  quads: 'quads',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  gastrocnemius: 'calves',
  upper_back: 'upper_back',
  traps: 'upper_back',
  trapezius: 'upper_back',
  lats: 'lats',
  latissimus: 'lats',
  lower_back: 'lower_back',
  erectors: 'lower_back',
};

function normalise(muscle: string): string {
  const k = muscle.toLowerCase().replace(/\s+/g, '_');
  return MUSCLE_ALIASES[k] ?? k;
}

// ---------------------------------------------------------------------------
// Region taxonomy
//
// Region `key`s are stable taxonomy IDS consumed by exerciseCatalog media +
// heatmap logic elsewhere (untouched); `label` is the English fallback for
// callers that don't have a translation for a given key.
// ---------------------------------------------------------------------------

export interface Region {
  key: string;
  label: string;
}

/** Translate a region's display name (falls back to the English label). */
export function regionLabel(region: Pick<Region, 'key' | 'label'>, t: TFunction): string {
  const key = `components:muscleHeatmap.regionLabel.${region.key}`;
  return t(key, { defaultValue: region.label });
}

const REGIONS: Region[] = [
  { key: 'chest',       label: 'Chest' },
  { key: 'front_delts', label: 'Front delts' },
  { key: 'side_delts',  label: 'Side delts' },
  { key: 'rear_delts',  label: 'Rear delts' },
  { key: 'biceps',      label: 'Biceps' },
  { key: 'forearms',    label: 'Forearms' },
  { key: 'abs',         label: 'Abs' },
  { key: 'obliques',    label: 'Obliques' },
  { key: 'quads',       label: 'Quads' },
  { key: 'calves',      label: 'Calves' },
  { key: 'upper_back',  label: 'Upper back' },
  { key: 'lats',        label: 'Lats' },
  { key: 'lower_back',  label: 'Lower back' },
  { key: 'triceps',     label: 'Triceps' },
  { key: 'glutes',      label: 'Glutes' },
  { key: 'hamstrings',  label: 'Hamstrings' },
];

const REGION_BY_KEY = new Map(REGIONS.map((r) => [r.key, r]));

// Region key -> react-native-body-highlighter slug(s). Several regions share
// a slug (the library has one 'deltoids' part per side); colour conflicts
// resolve to the WORST freshness so a fatigued head is never hidden.
const REGION_TO_SLUGS: Record<string, Slug[]> = {
  chest:       ['chest'],
  front_delts: ['deltoids'],
  side_delts:  ['deltoids'],
  rear_delts:  ['deltoids'],
  biceps:      ['biceps'],
  forearms:    ['forearm'],
  abs:         ['abs'],
  obliques:    ['obliques'],
  quads:       ['quadriceps'],
  calves:      ['calves'],
  upper_back:  ['trapezius'],
  lats:        ['upper-back'],
  lower_back:  ['lower-back'],
  triceps:     ['triceps'],
  glutes:      ['gluteal'],
  hamstrings:  ['hamstring'],
};

/** Reverse lookup: slug -> region keys that render onto it. */
const SLUG_TO_REGIONS = new Map<Slug, string[]>();
for (const [regionKey, slugs] of Object.entries(REGION_TO_SLUGS)) {
  for (const slug of slugs) {
    const arr = SLUG_TO_REGIONS.get(slug) ?? [];
    arr.push(regionKey);
    SLUG_TO_REGIONS.set(slug, arr);
  }
}

/** The library renders height = 400 * scale (width = 200 * scale) at scale 1. */
const BODY_SCALE = 0.65; // ~130 x 260 pt per figure, matching the old SVG footprint

// ---------------------------------------------------------------------------
// Detail pop-up
// ---------------------------------------------------------------------------

interface DetailSheet {
  key: string;
  label: string;
  freshness: number | undefined;
  last_worked: string | null | undefined;
  sets_last_session: number | undefined;
}

/** Pure helper called only from this file's own render — takes `t` per the
 * render-site translation rule. */
function formatDate(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return t('components:muscleHeatmap.never');
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function HeatmapEmptyState(): React.ReactElement {
  const { theme, spacing: sp, radius: r, fontSize: fs } = useTheme();
  const { t } = useTranslation();
  const { colors } = theme;
  return (
    <View
      style={[
        styles.emptyCard,
        {
          backgroundColor: colors.bgSecondary,
          borderRadius: r.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderDefault,
          padding: sp.s6,
        },
      ]}
      accessibilityLabel={t('components:muscleHeatmap.emptyStateAccessibilityLabel')}
    >
      <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: sp.s3 }}>
        {'\u{1F4AA}'}
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, textAlign: 'center', marginBottom: sp.s2 }}>
        {t('components:muscleHeatmap.emptyStateTitle')}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, textAlign: 'center', lineHeight: 20 }}>
        {t('components:muscleHeatmap.emptyStateBody')}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  muscles: MuscleRecovery[];
  loading: boolean;
  onSuggestSubstitutes?: (muscleName: string) => void;
}

export default function MuscleHeatmap({ muscles, loading, onSuggestSubstitutes }: Props): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { t } = useTranslation();
  const { colors } = theme;
  const { user } = useAuth();
  const [detail, setDetail] = useState<DetailSheet | null>(null);
  const reduceMotion = useReduceMotion();

  // Entrance fade
  const fadeAnim = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (!loading) {
      if (reduceMotion) {
        fadeAnim.setValue(1);
      } else {
        Animated.timing(fadeAnim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
      }
    }
  }, [loading, reduceMotion, fadeAnim]);

  // Region key -> recovery datum
  const dataMap = useMemo(() => {
    const m = new Map<string, MuscleRecovery>();
    for (const item of muscles) {
      m.set(normalise(item.muscle), item);
    }
    return m;
  }, [muscles]);

  // Slug -> colour: worst (lowest) freshness wins when regions share a slug.
  const bodyData: ExtendedBodyPart[] = useMemo(() => {
    const worstBySlug = new Map<Slug, number | undefined>();
    for (const [key, data] of dataMap) {
      for (const slug of REGION_TO_SLUGS[key] ?? []) {
        const current = worstBySlug.get(slug);
        const candidate = data.freshness;
        if (!worstBySlug.has(slug)) {
          worstBySlug.set(slug, candidate);
        } else if (candidate !== undefined && (current === undefined || candidate < current)) {
          worstBySlug.set(slug, candidate);
        }
      }
    }
    return Array.from(worstBySlug.entries()).map(([slug, freshness]) => ({
      slug,
      color: freshnessColor(freshness, colors),
    }));
  }, [dataMap, colors]);

  // Tap on a body part -> detail for the worst contributing tracked region
  // (or the first mapped region, shown as "not tracked").
  const handlePress = (part: ExtendedBodyPart) => {
    const slug = part.slug as Slug | undefined;
    if (!slug) return;
    const regionKeys = SLUG_TO_REGIONS.get(slug) ?? [];
    if (regionKeys.length === 0) return;

    let chosen: string | null = null;
    let chosenFreshness: number | undefined;
    for (const key of regionKeys) {
      const d = dataMap.get(key);
      if (!d) continue;
      if (chosen === null || (d.freshness ?? Infinity) < (chosenFreshness ?? Infinity)) {
        chosen = key;
        chosenFreshness = d.freshness;
      }
    }
    const key = chosen ?? regionKeys[0]!;
    const region = REGION_BY_KEY.get(key);
    if (!region) return;
    const data = dataMap.get(key);
    setDetail({
      key,
      label: regionLabel(region, t),
      freshness: data?.freshness,
      last_worked: data?.last_worked,
      sets_last_session: data?.sets_last_session,
    });
  };

  const gender: 'male' | 'female' =
    (user?.sex ?? '').toLowerCase() === 'female' ? 'female' : 'male';

  const bodyProps = {
    data: bodyData,
    gender,
    scale: BODY_SCALE,
    onBodyPartPress: handlePress,
    defaultFill: colors.bgElevated,
    defaultStroke: colors.borderDefault,
    defaultStrokeWidth: 0.5,
    border: colors.borderDefault,
  };

  if (!loading && muscles.length === 0) {
    return <HeatmapEmptyState />;
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* Legend */}
      <View style={[styles.legend, { marginBottom: sp.s3 }]}>
        {[
          { label: t('components:muscleHeatmap.legend.fresh'), color: colors.statusSuccess },
          { label: t('components:muscleHeatmap.legend.moderate'), color: colors.statusWarning },
          { label: t('components:muscleHeatmap.legend.needsRecovery'), color: colors.statusError },
        ].map(({ label, color }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color, borderRadius: radius.full ?? 999 }]} />
            <Text style={{ color: colors.textSecondary, fontSize: fs.micro }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Diagrams */}
      <View style={styles.diagrams}>
        <View
          style={styles.sideWrap}
          accessibilityLabel={t('components:muscleHeatmap.frontBodyDiagram')}
        >
          <Body {...bodyProps} side="front" />
          <Text style={[styles.sideLabel, { color: colors.textTertiary, fontSize: fs.micro }]}>{t('components:muscleHeatmap.front')}</Text>
        </View>
        <View
          style={styles.sideWrap}
          accessibilityLabel={t('components:muscleHeatmap.backBodyDiagram')}
        >
          <Body {...bodyProps} side="back" />
          <Text style={[styles.sideLabel, { color: colors.textTertiary, fontSize: fs.micro }]}>{t('components:muscleHeatmap.back')}</Text>
        </View>
      </View>

      {/* Detail modal */}
      <Modal
        visible={detail !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDetail(null)}
          accessibilityLabel={t('components:muscleHeatmap.dismissDetailAccessibilityLabel')}
        >
          <View
            style={[
              styles.detailSheet,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: r.lg,
                padding: sp.s5,
              },
            ]}
          >
            {detail && (
              <>
                <Text style={{ color: colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fontWeight.bold, marginBottom: sp.s3 }}>
                  {detail.label}
                </Text>

                <View style={[styles.detailRow, { marginBottom: sp.s2 }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>{t('components:muscleHeatmap.freshness')}</Text>
                  <Text style={{ color: freshnessColor(detail.freshness, colors), fontSize: fs.bodySm, fontWeight: fontWeight.semibold }}>
                    {detail.freshness !== undefined ? `${detail.freshness}%` : t('components:muscleHeatmap.notTracked')}
                  </Text>
                </View>

                <View style={[styles.detailRow, { marginBottom: sp.s2 }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>{t('components:muscleHeatmap.lastWorked')}</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: fs.bodySm }}>
                    {formatDate(detail.last_worked, t)}
                  </Text>
                </View>

                {detail.sets_last_session !== undefined && (
                  <View style={[styles.detailRow, { marginBottom: sp.s4 }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>{t('components:muscleHeatmap.setsLastSession')}</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: fs.bodySm }}>{detail.sets_last_session}</Text>
                  </View>
                )}

                {onSuggestSubstitutes && (
                  <TouchableOpacity
                    onPress={() => {
                      setDetail(null);
                      onSuggestSubstitutes(detail.key);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('components:muscleHeatmap.suggestSubstitutesAccessibilityLabel', { muscle: detail.label })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.accentDefault, fontSize: fs.bodySm, fontWeight: fontWeight.medium }}>
                      {t('components:muscleHeatmap.suggestSubstitutes')} {'→'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setDetail(null)}
                  style={[styles.dismissBtn, { borderColor: colors.borderDefault, borderRadius: r.md, marginTop: sp.s4 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t('common:close')}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>{t('common:close')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
  },
  diagrams: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  sideWrap: {
    alignItems: 'center',
  },
  sideLabel: {
    marginTop: 4,
    letterSpacing: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dismissBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
  },
});
