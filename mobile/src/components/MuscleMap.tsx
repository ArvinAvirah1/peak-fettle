/**
 * MuscleMap — human-body muscle highlighter.
 *
 * Rebuilt 2026-06-19: the hand-drawn SVG silhouette (which never read as a real
 * human) is replaced by `react-native-body-highlighter` — an anatomical
 * front/back, male/female body with per-muscle highlighting. The body is
 * recoloured to the active theme; the worked muscle group(s) light up in the
 * accent colour.
 *
 * Public contract is unchanged so existing call sites keep working:
 *   groups — canonical muscle labels to highlight (from muscleGroupsForExercise /
 *            muscleGroupsForRoutine, e.g. 'chest', 'lats', 'quads')
 *   size   — rendered HEIGHT in points (default 120). Each figure is ~size/2 wide.
 *   view   — 'front' | 'back' | 'both' (default 'front')
 *   sex    — 'male' | 'female' | null (default 'male'); null/undisclosed → male
 *   style  — optional container ViewStyle
 *
 * The library renders only the muscles relevant to the current side, so passing
 * the full highlighted-slug set for either side is safe.
 */

import React, { memo, useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Body, { type Slug, type ExtendedBodyPart } from 'react-native-body-highlighter';
import { useTheme } from '../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MuscleMapProps {
  /** Canonical muscle labels to highlight (from muscleGroupsForExercise / muscleGroupsForRoutine) */
  groups: string[];
  /** Rendered height in points — each figure is ~half this wide (default 120) */
  size?: number;
  /** Which body view to render (default 'front') */
  view?: 'front' | 'back' | 'both';
  /** Body sex — null/undisclosed falls back to 'male' (default 'male') */
  sex?: 'male' | 'female' | null;
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Canonical MuscleMap label → react-native-body-highlighter slug(s)
// ---------------------------------------------------------------------------

const LABEL_TO_SLUGS: Record<string, Slug[]> = {
  chest:      ['chest'],
  back:       ['upper-back', 'lower-back'],
  lats:       ['upper-back'],
  shoulders:  ['deltoids'],
  biceps:     ['biceps'],
  triceps:    ['triceps'],
  forearms:   ['forearm'],
  quads:      ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes:     ['gluteal'],
  calves:     ['calves'],
  abs:        ['abs'],
  obliques:   ['obliques'],
  traps:      ['trapezius'],
  // aggregate aliases (mirror muscleRegions.ts)
  legs:       ['quadriceps', 'hamstring', 'gluteal', 'calves'],
  core:       ['abs', 'obliques'],
};

/** The library renders height = 400 * scale (width = 200 * scale) at scale 1. */
const BASE_HEIGHT = 400;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MuscleMapInner({
  groups,
  size = 120,
  view = 'front',
  sex,
  style,
}: MuscleMapProps): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;

  // Resolve the highlighted slugs from the canonical labels (de-duplicated).
  const data: ExtendedBodyPart[] = useMemo(() => {
    const slugs = new Set<Slug>();
    for (const label of groups) {
      const mapped = LABEL_TO_SLUGS[label.toLowerCase().trim()];
      if (mapped) for (const s of mapped) slugs.add(s);
    }
    return Array.from(slugs).map((slug) => ({ slug, intensity: 1 }));
  }, [groups]);

  const gender: 'male' | 'female' = sex === 'female' ? 'female' : 'male';
  const scale = size / BASE_HEIGHT;

  // Theme-driven colours: resting muscles use the elevated surface, separations
  // and the body contour use the default border, and a worked muscle (intensity
  // 1) lights up in the accent colour.
  const bodyProps = {
    data,
    gender,
    scale,
    colors: [c.accentDefault],
    defaultFill: c.bgElevated,
    defaultStroke: c.borderDefault,
    defaultStrokeWidth: 0.5,
    border: c.borderDefault,
  };

  const a11y = `Muscle map highlighting ${groups.join(', ') || 'no muscles'}`;

  if (view === 'both') {
    return (
      <View style={[{ flexDirection: 'row' }, style]} accessibilityLabel={a11y}>
        <Body {...bodyProps} side="front" />
        <Body {...bodyProps} side="back" />
      </View>
    );
  }

  return (
    <View style={style} accessibilityLabel={a11y}>
      <Body {...bodyProps} side={view === 'back' ? 'back' : 'front'} />
    </View>
  );
}

/**
 * MuscleMap — memoized human-body muscle highlighter.
 *
 * @example
 * <MuscleMap groups={['chest', 'triceps']} size={64} view="front" sex="male" />
 * <MuscleMap groups={muscleGroupsForRoutine(exercises)} size={120} view="both" />
 */
export const MuscleMap = memo(MuscleMapInner);
export default MuscleMap;
