/**
 * MuscleMap — compact SVG body silhouette with highlighted muscle regions.
 *
 * Props:
 *   groups  — array of canonical muscle labels to highlight (from muscleRegions.ts)
 *   size    — rendered height in points (default 120). Width scales automatically.
 *   view    — 'front' | 'back' | 'both' (default 'front')
 *   style   — optional ViewStyle applied to the outer container
 *
 * Design rules:
 *   - Body fill  = theme.colors.bgElevated
 *   - Outlines   = theme.colors.borderDefault
 *   - Highlighted regions = theme.colors.accentDefault (never hardcoded hex)
 *   - Unhighlighted region fill = theme.colors.bgTertiary
 *   - Memoized — safe for use inside list cells
 *
 * Coordinate space: each figure is 120 × 270 px.  'both' renders two figures
 * side-by-side in a 260 × 270 viewBox.
 */

import React, { memo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { MUSCLE_REGION_IDS } from '../data/muscleRegions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MuscleMapProps {
  /** Canonical muscle labels to highlight (from muscleGroupsForExercise / muscleGroupsForRoutine) */
  groups: string[];
  /** Height in points — width scales proportionally (default 120) */
  size?: number;
  /** Which body view to render (default 'front') */
  view?: 'front' | 'back' | 'both';
  style?: StyleProp<ViewStyle>;
}

// ---------------------------------------------------------------------------
// Region geometry
// ---------------------------------------------------------------------------

interface RegionDef {
  id: string;
  /** 'ellipse' uses cx/cy/rx/ry; 'path' uses d */
  shape: 'ellipse' | 'path';
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  d?: string;
  side: 'front' | 'back';
}

/**
 * All region definitions on a 120 × 270 coordinate space per figure.
 * Bilateral muscles appear as left+right pairs (_l / _r).
 */
const REGION_DEFS: RegionDef[] = [
  // ── FRONT ─────────────────────────────────────────────────────────────────
  // chest (left / right pec)
  { id: 'chest_l',     shape: 'ellipse', cx: 46, cy: 86,  rx: 14, ry: 10, side: 'front' },
  { id: 'chest_r',     shape: 'ellipse', cx: 74, cy: 86,  rx: 14, ry: 10, side: 'front' },
  // shoulders
  { id: 'shoulder_l',  shape: 'ellipse', cx: 27, cy: 72,  rx: 9,  ry: 11, side: 'front' },
  { id: 'shoulder_r',  shape: 'ellipse', cx: 93, cy: 72,  rx: 9,  ry: 11, side: 'front' },
  // biceps
  { id: 'bicep_l',     shape: 'ellipse', cx: 18, cy: 112, rx: 7,  ry: 18, side: 'front' },
  { id: 'bicep_r',     shape: 'ellipse', cx: 102,cy: 112, rx: 7,  ry: 18, side: 'front' },
  // forearms
  { id: 'forearm_l',   shape: 'ellipse', cx: 14, cy: 148, rx: 5,  ry: 14, side: 'front' },
  { id: 'forearm_r',   shape: 'ellipse', cx: 106,cy: 148, rx: 5,  ry: 14, side: 'front' },
  // abs
  { id: 'abs',         shape: 'ellipse', cx: 60, cy: 120, rx: 13, ry: 18, side: 'front' },
  // obliques
  { id: 'oblique_l',   shape: 'ellipse', cx: 44, cy: 122, rx: 7,  ry: 14, side: 'front' },
  { id: 'oblique_r',   shape: 'ellipse', cx: 76, cy: 122, rx: 7,  ry: 14, side: 'front' },
  // quads
  { id: 'quad_l',      shape: 'ellipse', cx: 46, cy: 192, rx: 14, ry: 26, side: 'front' },
  { id: 'quad_r',      shape: 'ellipse', cx: 74, cy: 192, rx: 14, ry: 26, side: 'front' },
  // calves
  { id: 'calf_l',      shape: 'ellipse', cx: 46, cy: 246, rx: 9,  ry: 14, side: 'front' },
  { id: 'calf_r',      shape: 'ellipse', cx: 74, cy: 246, rx: 9,  ry: 14, side: 'front' },

  // ── BACK ──────────────────────────────────────────────────────────────────
  // upper back (traps area also uses trap_l/trap_r drawn over it)
  { id: 'upper_back_l',shape: 'ellipse', cx: 46, cy: 80,  rx: 14, ry: 14, side: 'back' },
  { id: 'upper_back_r',shape: 'ellipse', cx: 74, cy: 80,  rx: 14, ry: 14, side: 'back' },
  // traps (slightly higher than upper_back)
  { id: 'trap_l',      shape: 'ellipse', cx: 46, cy: 68,  rx: 12, ry: 9,  side: 'back' },
  { id: 'trap_r',      shape: 'ellipse', cx: 74, cy: 68,  rx: 12, ry: 9,  side: 'back' },
  // lats
  { id: 'lats_l',      shape: 'ellipse', cx: 42, cy: 108, rx: 13, ry: 20, side: 'back' },
  { id: 'lats_r',      shape: 'ellipse', cx: 78, cy: 108, rx: 13, ry: 20, side: 'back' },
  // lower back
  { id: 'lower_back',  shape: 'ellipse', cx: 60, cy: 134, rx: 12, ry: 10, side: 'back' },
  // shoulders (rear delt)
  { id: 'shoulder_l',  shape: 'ellipse', cx: 27, cy: 72,  rx: 9,  ry: 11, side: 'back' },
  { id: 'shoulder_r',  shape: 'ellipse', cx: 93, cy: 72,  rx: 9,  ry: 11, side: 'back' },
  // triceps
  { id: 'tricep_l',    shape: 'ellipse', cx: 18, cy: 112, rx: 7,  ry: 18, side: 'back' },
  { id: 'tricep_r',    shape: 'ellipse', cx: 102,cy: 112, rx: 7,  ry: 18, side: 'back' },
  // glutes
  { id: 'glute_l',     shape: 'ellipse', cx: 47, cy: 163, rx: 16, ry: 14, side: 'back' },
  { id: 'glute_r',     shape: 'ellipse', cx: 73, cy: 163, rx: 16, ry: 14, side: 'back' },
  // hamstrings
  { id: 'hamstring_l', shape: 'ellipse', cx: 46, cy: 200, rx: 13, ry: 24, side: 'back' },
  { id: 'hamstring_r', shape: 'ellipse', cx: 74, cy: 200, rx: 13, ry: 24, side: 'back' },
  // calves (back view — same as front)
  { id: 'calf_l',      shape: 'ellipse', cx: 46, cy: 246, rx: 9,  ry: 14, side: 'back' },
  { id: 'calf_r',      shape: 'ellipse', cx: 74, cy: 246, rx: 9,  ry: 14, side: 'back' },
  // forearms (back)
  { id: 'forearm_l',   shape: 'ellipse', cx: 14, cy: 148, rx: 5,  ry: 14, side: 'back' },
  { id: 'forearm_r',   shape: 'ellipse', cx: 106,cy: 148, rx: 5,  ry: 14, side: 'back' },
];

// ---------------------------------------------------------------------------
// Silhouette outline — shared body path on 120 × 270 coordinate space
// ---------------------------------------------------------------------------

interface OutlineProps {
  stroke: string;
  bodyFill: string;
}

function BodyOutlineFront({ stroke, bodyFill }: OutlineProps): React.ReactElement {
  return (
    <G>
      {/* Head */}
      <Ellipse cx={60} cy={26} rx={16} ry={20} stroke={stroke} strokeWidth={1.2} fill={bodyFill} />
      {/* Neck */}
      <Rect x={54} y={44} width={12} height={10} fill={bodyFill} stroke={stroke} strokeWidth={1.2} rx={3} />
      {/* Torso */}
      <Path
        d="M26 58 L20 160 L42 166 L42 265 L78 265 L78 166 L100 160 L94 58 Z"
        stroke={stroke}
        strokeWidth={1.2}
        fill={bodyFill}
      />
      {/* Left arm */}
      <Path d="M26 58 L8 88 L6 162 L20 162 L22 90 L32 60" stroke={stroke} strokeWidth={1.2} fill={bodyFill} />
      {/* Right arm */}
      <Path d="M94 58 L112 88 L114 162 L100 162 L98 90 L88 60" stroke={stroke} strokeWidth={1.2} fill={bodyFill} />
    </G>
  );
}

function BodyOutlineBack({ stroke, bodyFill }: OutlineProps): React.ReactElement {
  return (
    <G>
      {/* Head */}
      <Ellipse cx={60} cy={26} rx={16} ry={20} stroke={stroke} strokeWidth={1.2} fill={bodyFill} />
      {/* Neck */}
      <Rect x={54} y={44} width={12} height={10} fill={bodyFill} stroke={stroke} strokeWidth={1.2} rx={3} />
      {/* Torso */}
      <Path
        d="M26 58 L20 160 L42 166 L42 265 L78 265 L78 166 L100 160 L94 58 Z"
        stroke={stroke}
        strokeWidth={1.2}
        fill={bodyFill}
      />
      {/* Left arm */}
      <Path d="M26 58 L8 88 L6 162 L20 162 L22 90 L32 60" stroke={stroke} strokeWidth={1.2} fill={bodyFill} />
      {/* Right arm */}
      <Path d="M94 58 L112 88 L114 162 L100 162 L98 90 L88 60" stroke={stroke} strokeWidth={1.2} fill={bodyFill} />
    </G>
  );
}

// ---------------------------------------------------------------------------
// Single figure (front or back)
// ---------------------------------------------------------------------------

interface FigureProps {
  side: 'front' | 'back';
  highlightedIds: Set<string>;
  colors: {
    bodyFill: string;
    outline: string;
    highlight: string;
    regionFill: string;
  };
  /** Optional x-translate for the 'both' layout */
  offsetX?: number;
}

function Figure({ side, highlightedIds, colors, offsetX = 0 }: FigureProps): React.ReactElement {
  const OutlineComponent = side === 'front' ? BodyOutlineFront : BodyOutlineBack;

  const sideRegions = REGION_DEFS.filter((r) => r.side === side);

  return (
    <G transform={offsetX !== 0 ? `translate(${offsetX}, 0)` : undefined}>
      {/* Silhouette first */}
      <OutlineComponent stroke={colors.outline} bodyFill={colors.bodyFill} />

      {/* Muscle regions layered on top */}
      {sideRegions.map((region) => {
        const isHighlighted = highlightedIds.has(region.id);
        const fill = isHighlighted ? colors.highlight : colors.regionFill;
        const opacity = isHighlighted ? 0.85 : 0.35;

        if (region.shape === 'ellipse' && region.cx !== undefined) {
          return (
            <Ellipse
              key={`${region.id}-${region.cx}-${region.cy}`}
              cx={region.cx}
              cy={region.cy}
              rx={region.rx}
              ry={region.ry}
              fill={fill}
              opacity={opacity}
            />
          );
        }
        if (region.shape === 'path' && region.d) {
          return (
            <Path
              key={region.id}
              d={region.d}
              fill={fill}
              opacity={opacity}
            />
          );
        }
        return null;
      })}
    </G>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FIGURE_WIDTH  = 120;
const FIGURE_HEIGHT = 270;
const GAP = 20; // gap between front and back in 'both' mode

function MuscleMapInner({
  groups,
  size = 120,
  view = 'front',
  style,
}: MuscleMapProps): React.ReactElement {
  const { theme } = useTheme();
  const colors = theme.colors;

  // Resolve all highlighted SVG region ids from the canonical group labels
  const highlightedIds = new Set<string>();
  for (const label of groups) {
    const ids = MUSCLE_REGION_IDS[label.toLowerCase()] ?? [];
    for (const id of ids) {
      highlightedIds.add(id);
    }
  }

  const figureColors = {
    bodyFill:   colors.bgElevated,
    outline:    colors.borderDefault,
    highlight:  colors.accentDefault,
    regionFill: colors.bgTertiary,
  };

  const isBoth = view === 'both';

  // Scale to requested size (height-based, maintain aspect ratio)
  const viewBoxWidth  = isBoth ? FIGURE_WIDTH * 2 + GAP : FIGURE_WIDTH;
  const viewBoxHeight = FIGURE_HEIGHT;
  const aspectRatio   = viewBoxWidth / viewBoxHeight;
  const svgHeight     = size;
  const svgWidth      = size * aspectRatio;

  return (
    <View style={style} accessibilityLabel={`Muscle map highlighting ${groups.join(', ') || 'no muscles'}`}>
      <Svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      >
        {view === 'front' || view === 'both' ? (
          <Figure
            side="front"
            highlightedIds={highlightedIds}
            colors={figureColors}
            offsetX={0}
          />
        ) : null}

        {view === 'back' ? (
          <Figure
            side="back"
            highlightedIds={highlightedIds}
            colors={figureColors}
            offsetX={0}
          />
        ) : null}

        {view === 'both' ? (
          <Figure
            side="back"
            highlightedIds={highlightedIds}
            colors={figureColors}
            offsetX={FIGURE_WIDTH + GAP}
          />
        ) : null}
      </Svg>
    </View>
  );
}

/**
 * MuscleMap — memoized SVG muscle highlight component.
 *
 * @example
 * <MuscleMap groups={['chest', 'triceps']} size={80} view="front" />
 * <MuscleMap groups={muscleGroupsForRoutine(exercises)} size={100} view="both" />
 */
export const MuscleMap = memo(MuscleMapInner);
export default MuscleMap;
