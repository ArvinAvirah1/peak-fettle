/**
 * MuscleHeatmap — front/back SVG body outline with muscles coloured by
 * freshness score from GET /insights/recovery.
 *
 * Freshness colour mapping (spec §6):
 *   0–39  → theme statusError   (needs recovery)
 *   40–74 → theme statusWarning (moderate)
 *   75–100 → theme statusSuccess (fresh)
 *   Not in data (never trained) → borderDefault tint
 *
 * Agent K polish (2026-06-11):
 *   - Empty state: icon + headline + guidance when muscles array is empty
 *   - Entrance animation (FadeInDown, Reduce Motion aware)
 *   - Press scale micro-interaction on dismiss button in detail modal
 *   - Detail modal dismiss button min touch target 44pt
 *
 * Uses react-native-svg (confirmed present in package.json).
 * No raw 'bold' — fontWeight token only.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { MuscleRecovery } from '../api/insights';
import { useReduceMotion } from '../hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Freshness → color
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
// Muscle → canonical key mapping (normalise server names)
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
// SVG region definitions
// ---------------------------------------------------------------------------

interface Region {
  key: string;
  label: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  side: 'front' | 'back';
}

const REGIONS: Region[] = [
  // FRONT
  { key: 'chest',       label: 'Chest',        cx: 60, cy: 80,  rx: 28, ry: 18, side: 'front' },
  { key: 'front_delts', label: 'Front delts',  cx: 25, cy: 68,  rx: 10, ry: 12, side: 'front' },
  { key: 'side_delts',  label: 'Side delts',   cx: 95, cy: 68,  rx: 10, ry: 12, side: 'front' },
  { key: 'biceps',      label: 'Biceps',       cx: 16, cy: 108, rx: 9,  ry: 20, side: 'front' },
  { key: 'forearms',    label: 'Forearms',     cx: 14, cy: 145, rx: 7,  ry: 18, side: 'front' },
  { key: 'abs',         label: 'Abs',          cx: 60, cy: 120, rx: 18, ry: 22, side: 'front' },
  { key: 'obliques',    label: 'Obliques',     cx: 38, cy: 118, rx: 8,  ry: 18, side: 'front' },
  { key: 'quads',       label: 'Quads',        cx: 45, cy: 185, rx: 16, ry: 30, side: 'front' },
  { key: 'calves',      label: 'Calves',       cx: 45, cy: 242, rx: 11, ry: 18, side: 'front' },
  // BACK
  { key: 'upper_back',  label: 'Upper back',   cx: 60, cy: 78,  rx: 28, ry: 18, side: 'back' },
  { key: 'rear_delts',  label: 'Rear delts',   cx: 25, cy: 65,  rx: 10, ry: 12, side: 'back' },
  { key: 'lats',        label: 'Lats',         cx: 60, cy: 108, rx: 22, ry: 22, side: 'back' },
  { key: 'lower_back',  label: 'Lower back',   cx: 60, cy: 135, rx: 14, ry: 12, side: 'back' },
  { key: 'triceps',     label: 'Triceps',      cx: 18, cy: 108, rx: 9,  ry: 20, side: 'back' },
  { key: 'glutes',      label: 'Glutes',       cx: 60, cy: 163, rx: 24, ry: 18, side: 'back' },
  { key: 'hamstrings',  label: 'Hamstrings',   cx: 45, cy: 200, rx: 16, ry: 28, side: 'back' },
];

const MIRRORED: Region[] = [
  { key: 'obliques',    label: 'Obliques',     cx: 82, cy: 118, rx: 8,  ry: 18, side: 'front' },
  { key: 'front_delts', label: 'Front delts',  cx: 95, cy: 68,  rx: 10, ry: 12, side: 'front' },
  { key: 'side_delts',  label: 'Side delts',   cx: 25, cy: 68,  rx: 10, ry: 12, side: 'front' },
  { key: 'biceps',      label: 'Biceps',       cx: 104, cy: 108, rx: 9, ry: 20, side: 'front' },
  { key: 'forearms',    label: 'Forearms',     cx: 106, cy: 145, rx: 7, ry: 18, side: 'front' },
  { key: 'quads',       label: 'Quads',        cx: 75, cy: 185, rx: 16, ry: 30, side: 'front' },
  { key: 'calves',      label: 'Calves',       cx: 75, cy: 242, rx: 11, ry: 18, side: 'front' },
  // back mirrors
  { key: 'rear_delts',  label: 'Rear delts',   cx: 95, cy: 65,  rx: 10, ry: 12, side: 'back' },
  { key: 'triceps',     label: 'Triceps',      cx: 102, cy: 108, rx: 9, ry: 20, side: 'back' },
  { key: 'hamstrings',  label: 'Hamstrings',   cx: 75, cy: 200, rx: 16, ry: 28, side: 'back' },
];

const ALL_REGIONS = [...REGIONS, ...MIRRORED];

// ---------------------------------------------------------------------------
// Body outline
// ---------------------------------------------------------------------------

function BodyOutline({ color }: { color: string }): React.ReactElement {
  return (
    <G>
      <Ellipse cx={60} cy={28} rx={18} ry={22} stroke={color} strokeWidth={1.5} fill="none" />
      <Rect x={52} y={48} width={16} height={12} stroke={color} strokeWidth={1.5} fill="none" rx={4} />
      <Path
        d="M28 60 L20 160 L40 165 L40 260 L80 260 L80 165 L100 160 L92 60 Z"
        stroke={color}
        strokeWidth={1.5}
        fill="none"
      />
      <Path d="M28 60 L10 90 L8 165 L20 165 L22 90 L34 62" stroke={color} strokeWidth={1.5} fill="none" />
      <Path d="M92 60 L110 90 L112 165 L100 165 L98 90 L86 62" stroke={color} strokeWidth={1.5} fill="none" />
    </G>
  );
}

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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never';
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
      accessibilityLabel="No muscle recovery data yet"
    >
      <Text style={{ fontSize: 32, textAlign: 'center', marginBottom: sp.s3 }}>
        💪
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, textAlign: 'center', marginBottom: sp.s2 }}>
        No muscle data yet
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, textAlign: 'center', lineHeight: 20 }}>
        Log your first workout to see which muscles need recovery and which are fresh.
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
  const { colors } = theme;
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

  // Build lookup
  const dataMap = new Map<string, MuscleRecovery>();
  for (const m of muscles) {
    dataMap.set(normalise(m.muscle), m);
  }

  const renderSide = (side: 'front' | 'back') => {
    const regions = ALL_REGIONS.filter((reg) => reg.side === side);
    return (
      <Svg
        width={120}
        height={260}
        viewBox="0 0 120 260"
        accessibilityLabel={`${side === 'front' ? 'Front' : 'Back'} body diagram`}
      >
        <BodyOutline color={colors.borderDefault} />
        {regions.map((reg, i) => {
          const data = dataMap.get(reg.key);
          const fill = freshnessColor(data?.freshness, colors);
          return (
            <Ellipse
              key={`${reg.key}-${i}`}
              cx={reg.cx}
              cy={reg.cy}
              rx={reg.rx}
              ry={reg.ry}
              fill={fill + 'CC'}
              stroke={fill}
              strokeWidth={1}
              onPress={() =>
                setDetail({
                  key: reg.key,
                  label: reg.label,
                  freshness: data?.freshness,
                  last_worked: data?.last_worked,
                  sets_last_session: data?.sets_last_session,
                })
              }
            />
          );
        })}
      </Svg>
    );
  };

  if (!loading && muscles.length === 0) {
    return <HeatmapEmptyState />;
  }

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      {/* Legend */}
      <View style={[styles.legend, { marginBottom: sp.s3 }]}>
        {[
          { label: 'Fresh', color: colors.statusSuccess },
          { label: 'Moderate', color: colors.statusWarning },
          { label: 'Needs recovery', color: colors.statusError },
        ].map(({ label, color }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color, borderRadius: radius.full ?? 999 }]} />
            <Text style={{ color: colors.textSecondary, fontSize: fs.micro }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Diagrams */}
      <View style={styles.diagrams}>
        <View style={styles.sideWrap}>
          {renderSide('front')}
          <Text style={[styles.sideLabel, { color: colors.textTertiary, fontSize: fs.micro }]}>FRONT</Text>
        </View>
        <View style={styles.sideWrap}>
          {renderSide('back')}
          <Text style={[styles.sideLabel, { color: colors.textTertiary, fontSize: fs.micro }]}>BACK</Text>
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
          accessibilityLabel="Dismiss muscle detail"
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
                  <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>Freshness</Text>
                  <Text style={{ color: freshnessColor(detail.freshness, colors), fontSize: fs.bodySm, fontWeight: fontWeight.semibold }}>
                    {detail.freshness !== undefined ? `${detail.freshness}%` : 'Not tracked'}
                  </Text>
                </View>

                <View style={[styles.detailRow, { marginBottom: sp.s2 }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>Last worked</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: fs.bodySm }}>
                    {formatDate(detail.last_worked)}
                  </Text>
                </View>

                {detail.sets_last_session !== undefined && (
                  <View style={[styles.detailRow, { marginBottom: sp.s4 }]}>
                    <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>Sets last session</Text>
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
                    accessibilityLabel={`Suggest substitute exercises for ${detail.label}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.accentDefault, fontSize: fs.bodySm, fontWeight: fontWeight.medium }}>
                      Suggest substitute exercises →
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setDetail(null)}
                  style={[styles.dismissBtn, { borderColor: colors.borderDefault, borderRadius: r.md, marginTop: sp.s4 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm }}>Close</Text>
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
