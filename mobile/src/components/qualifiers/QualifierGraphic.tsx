/**
 * QualifierGraphic — the explainer artwork for a qualifier value.
 * =============================================================================
 * Founder-signed-off style (2026-08-05): LINE WORK. One stroke weight, no fills,
 * accent colour reserved for the load path / the thing the axis actually
 * selects, annotation only where it explains a mechanism. Chosen because it is
 * the most legible at 44px chip size and the cheapest to extend across the
 * library — a shaded or isometric style turns to mush below ~60px.
 *
 * SVG, NOT RASTER, and that is a shipping decision as much as an aesthetic one:
 * react-native-svg is already a dependency, so these ship over the air via
 * `eas update` with no EAS rebuild, no app-size growth, and they inherit the
 * user's theme and accent colour automatically. Bundled artwork would need a
 * full rebuild plus separate light/dark variants of every image.
 *
 * PULLEY ANATOMY IS SHARED ON PURPOSE. Every pulley graphic draws the same
 * frame, the same stack riding its guide rods, the same handle, and the same
 * upward resistance arrow, so the ONLY thing that differs between them is the
 * cable routing. Founder feedback that killed the first attempt: the ratios had
 * different start points and the stack was drawn outside the frame, so they
 * couldn't be compared. Read them by asking "where is the movable pulley?" —
 * on the stack the load is shared and you feel less (2:1, 4:1); on the handle
 * you oppose two strands and feel double (1:2); neither means direct (1:1).
 *
 * Not every axis gets a graphic. bar_type / body_position / load_mode / rom /
 * laterality are self-evident from their labels and render as plain chips —
 * drawing them would be decoration, not explanation. hasGraphic() says which.
 *
 * Spec: docs/archive/SPEC_2026-08-05_EXERCISE_QUALIFIERS.md §5.2
 * =============================================================================
 */

import React from 'react';
import Svg, { Line, Circle, Rect, Path, G, Text as SvgText } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

// Axes that have explainer artwork. Others render label-only chips.
const GRAPHIC_AXES = new Set([
  'pulley_height',
  'pulley_ratio',
  'attachment',
  'grip_width',
  'grip_orientation',
  'bench_angle',
  'stance',
  'bar_position',
]);

export function hasGraphic(axisId: string): boolean {
  return GRAPHIC_AXES.has(axisId);
}

/**
 * Which values each renderer EXPLICITLY draws.
 *
 * Test-support export, and the reason it exists is a real failure mode: the
 * renderers below use switch statements with a sensible default (straight_bar,
 * pronated, shoulder...). If a value is added to the vocabulary in
 * constants/qualifiers.ts and nobody draws it, that default silently renders the
 * WRONG picture — a new attachment would appear as a straight bar, which is worse
 * than no artwork because it is confidently incorrect.
 *
 * __tests__/qualifierGraphic.test.js asserts this equals the vocabulary exactly,
 * so adding a value without drawing it fails the build instead of shipping a lie.
 */
export const GRAPHIC_COVERAGE: Record<string, string[]> = {
  pulley_height: ['floor', 'knee', 'hip', 'mid_chest', 'shoulder', 'high', 'overhead'],
  pulley_ratio: ['1_1', '2_1', '4_1', '1_2', 'unknown'],
  attachment: [
    'straight_bar', 'ez_bar', 'rope', 'single_d', 'dual_d', 'v_bar', 'lat_bar_wide',
    'mag_grip', 'ankle_strap', 'head_harness', 'tricep_v_strap', 'stirrup', 'band', 'sled_strap',
  ],
  grip_width: ['close', 'shoulder', 'medium', 'wide', 'extra_wide'],
  grip_orientation: ['pronated', 'supinated', 'neutral', 'mixed', 'thumbless', 'hook'],
  bench_angle: ['decline', 'flat', 'incline_15', 'incline_30', 'incline_45', 'incline_60', 'upright_90'],
  stance: [
    'narrow', 'shoulder', 'wide', 'sumo', 'staggered', 'split', 'feet_together',
    'high_platform', 'low_platform',
  ],
  bar_position: ['high_bar', 'low_bar'],
};

export interface QualifierGraphicProps {
  axisId: string;
  valueId: string;
  /** Rendered width in px. Height follows the axis's aspect ratio. */
  size?: number;
}

interface Ink {
  line: string;
  soft: string;
  accent: string;
  good: string;
}

// ── shared cable-tower geometry (pulley axes) ────────────────────────────────
// viewBox 120 x 92. Every pulley graphic uses these EXACT constants.
const F = {
  L: 26,
  R: 58,
  TOP: 12,
  BOT: 82,
  SX: 31,
  SW: 22,
  STOP: 50,
  PLATE: 6,
  MID: 42,
  HX: 104,
  HY: 40,
};

function Frame({ ink }: { ink: Ink }): React.ReactElement {
  return (
    <G>
      <Line x1={F.L} y1={F.TOP} x2={F.L} y2={F.BOT} stroke={ink.line} strokeWidth={2} strokeLinecap="round" />
      <Line x1={F.R} y1={F.TOP} x2={F.R} y2={F.BOT} stroke={ink.line} strokeWidth={2} strokeLinecap="round" />
      <Line x1={F.L - 4} y1={F.TOP} x2={F.R + 4} y2={F.TOP} stroke={ink.line} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={F.L - 6} y1={F.BOT} x2={F.R + 6} y2={F.BOT} stroke={ink.line} strokeWidth={2.4} strokeLinecap="round" />
    </G>
  );
}

function Stack({ ink }: { ink: Ink }): React.ReactElement {
  const plates = [];
  for (let i = 0; i < 5; i++) {
    plates.push(
      <Rect
        key={i}
        x={F.SX}
        y={F.STOP + i * F.PLATE}
        width={F.SW}
        height={F.PLATE - 1.2}
        rx={1}
        fill="none"
        stroke={ink.soft}
        strokeWidth={1.4}
      />,
    );
  }
  return (
    <G>
      {plates}
      <Circle cx={F.SX + F.SW + 3} cy={F.STOP + F.PLATE * 1.5} r={1.8} fill={ink.soft} />
    </G>
  );
}

/** Resistance direction — identical in every pulley graphic. */
function UpArrow({ ink }: { ink: Ink }): React.ReactElement {
  const x = F.L - 13;
  const y = F.STOP + 16;
  return (
    <Path
      d={`M${x} ${y} l0 -14 m-3.5 4 l3.5 -4.5 l3.5 4.5`}
      fill="none"
      stroke={ink.good}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Handle({ ink }: { ink: Ink }): React.ReactElement {
  return (
    <G>
      <Circle cx={F.HX} cy={F.HY} r={3.6} fill="none" stroke={ink.line} strokeWidth={1.8} />
      <Line x1={F.HX - 1.6} y1={F.HY - 3.2} x2={F.HX - 1.6} y2={F.HY + 3.2} stroke={ink.line} strokeWidth={1.4} />
    </G>
  );
}

/** Cable anchored (dead-ended) to the frame — the signature of a movable pulley. */
function DeadEnd({ x, y, ink }: { x: number; y: number; ink: Ink }): React.ReactElement {
  return (
    <G>
      <Line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke={ink.line} strokeWidth={2.2} strokeLinecap="round" />
      <Path d={`M${x - 3} ${y + 4} l2 -4 M${x + 1} ${y + 4} l2 -4`} fill="none" stroke={ink.soft} strokeWidth={1.2} />
    </G>
  );
}

function Pulley({ cx, cy, r, ink }: { cx: number; cy: number; r: number; ink: Ink }): React.ReactElement {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={ink.accent} strokeWidth={2.2} />
      <Circle cx={cx} cy={cy} r={1.5} fill={ink.accent} />
    </G>
  );
}

function cable(d: string, ink: Ink, w = 2.4, key?: string): React.ReactElement {
  return <Path key={key} d={d} fill="none" stroke={ink.accent} strokeWidth={w} strokeLinecap="round" />;
}

// ── pulley height ────────────────────────────────────────────────────────────

const HEIGHT_Y: Record<string, number> = {
  overhead: 16,
  high: 26,
  shoulder: 36,
  mid_chest: 46,
  hip: 56,
  knee: 66,
  floor: 74,
};

function PulleyHeight({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const cy = HEIGHT_Y[valueId] ?? 36;
  const ticks = [16, 26, 36, 46, 56, 66, 74];
  return (
    <G>
      <Frame ink={ink} />
      <Stack ink={ink} />
      <UpArrow ink={ink} />
      {cable(`M${F.MID} ${F.STOP} L${F.MID} ${F.TOP + 6}`, ink, 2)}
      <Pulley cx={F.MID} cy={F.TOP + 5} r={4.4} ink={ink} />
      {cable(`M${F.MID} ${F.TOP + 0.6} L${F.R - 3} ${F.TOP + 0.6}`, ink, 2)}
      {cable(`M${F.R - 3} ${F.TOP + 0.6} L${F.R - 3} ${cy}`, ink, 2)}
      {/* the adjustable carriage — what this axis actually selects */}
      <Rect x={F.R - 3.4} y={cy - 7.5} width={6.8} height={15} rx={2} fill="none" stroke={ink.accent} strokeWidth={1.8} />
      <Pulley cx={F.R} cy={cy} r={4.6} ink={ink} />
      {cable(`M${F.R + 4.6} ${cy} L${F.HX - 4} ${F.HY}`, ink, 1.9)}
      <Handle ink={ink} />
      <Line x1={F.R + 9} y1={F.TOP + 4} x2={F.R + 9} y2={F.BOT - 4} stroke={ink.soft} strokeWidth={0.9} />
      {ticks.map((t) => (
        <Line key={t} x1={F.R + 7} y1={t} x2={F.R + 11} y2={t} stroke={ink.soft} strokeWidth={0.9} />
      ))}
      <Circle cx={F.R + 9} cy={cy} r={2.4} fill={ink.accent} />
    </G>
  );
}

// ── pulley ratio ─────────────────────────────────────────────────────────────

function PulleyRatio({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const topY = F.TOP + 5;
  const exitX = F.R + 4.4;

  if (valueId === 'unknown') {
    return (
      <G>
        <Frame ink={ink} />
        <Stack ink={ink} />
        <UpArrow ink={ink} />
        <Path d={`M${F.MID} ${F.STOP} L${F.MID} ${topY}`} fill="none" stroke={ink.soft} strokeWidth={2.2} />
        <Circle cx={F.MID} cy={topY} r={4.4} fill="none" stroke={ink.soft} strokeWidth={2} />
        <Path d={`M${F.MID} ${F.TOP + 0.6} L${F.R} ${F.TOP + 0.6}`} fill="none" stroke={ink.soft} strokeWidth={1.8} />
        <Circle cx={exitX} cy={topY} r={4.4} fill="none" stroke={ink.soft} strokeWidth={2} />
        <Path d={`M${exitX + 4.4} ${topY} L${F.HX - 3} ${F.HY - 3}`} fill="none" stroke={ink.soft} strokeWidth={1.6} />
        <Handle ink={ink} />
        <SvgText x={F.MID} y={F.STOP - 14} fill={ink.soft} fontSize={17} textAnchor="middle">?</SvgText>
      </G>
    );
  }

  if (valueId === '1_2') {
    // MECHANICAL DISADVANTAGE — movable pulley on the HANDLE. The stack hangs on
    // ONE strand at full tension (T = W) while the user opposes TWO (2T = 2W).
    const mpx = F.HX;
    const mpy = F.HY - 9;
    return (
      <G>
        <Frame ink={ink} />
        <Stack ink={ink} />
        <UpArrow ink={ink} />
        {cable(`M${F.MID} ${F.STOP} L${F.MID} ${topY}`, ink, 2.6)}
        <Pulley cx={F.MID} cy={topY} r={4.4} ink={ink} />
        {cable(`M${F.MID} ${F.TOP + 0.6} L${F.R} ${F.TOP + 0.6}`, ink, 2)}
        <Pulley cx={exitX} cy={topY} r={4.4} ink={ink} />
        {cable(`M${exitX + 4.4} ${topY} L${mpx - 4.6} ${mpy}`, ink, 2.6)}
        <DeadEnd x={F.R - 7} y={F.TOP + 1} ink={ink} />
        {cable(`M${F.R - 7} ${F.TOP + 1} L${mpx + 4.6} ${mpy}`, ink, 2.6)}
        <Pulley cx={mpx} cy={mpy} r={5.2} ink={ink} />
        <Line x1={mpx} y1={mpy + 5.2} x2={mpx} y2={F.HY} stroke={ink.soft} strokeWidth={2} />
        <Handle ink={ink} />
        <SvgText x={F.MID} y={F.BOT + 8} fill={ink.soft} fontSize={8.5} textAnchor="middle">
          2 strands · on the handle
        </SvgText>
      </G>
    );
  }

  if (valueId === '2_1') {
    const mx = F.MID;
    const my = F.STOP - 9;
    return (
      <G>
        <Frame ink={ink} />
        <Stack ink={ink} />
        <UpArrow ink={ink} />
        <DeadEnd x={F.L + 8} y={F.TOP + 1} ink={ink} />
        {cable(`M${F.L + 8} ${F.TOP + 1} L${mx - 5} ${my}`, ink, 2.6)}
        <Pulley cx={mx} cy={my} r={5.2} ink={ink} />
        <Line x1={mx} y1={my + 5.2} x2={mx} y2={F.STOP} stroke={ink.soft} strokeWidth={2} />
        {cable(`M${mx + 5} ${my} L${F.R - 2} ${topY}`, ink, 2.6)}
        <Pulley cx={exitX} cy={topY} r={4.4} ink={ink} />
        {cable(`M${exitX + 4.4} ${topY} L${F.HX - 3} ${F.HY - 3}`, ink, 1.9)}
        <Handle ink={ink} />
        <SvgText x={F.MID} y={F.BOT + 8} fill={ink.soft} fontSize={8.5} textAnchor="middle">
          2 strands · on the stack
        </SvgText>
      </G>
    );
  }

  if (valueId === '4_1') {
    const ax = F.SX + 3;
    const bx = F.SX + F.SW - 3;
    const ay = F.STOP - 8;
    return (
      <G>
        <Frame ink={ink} />
        <Stack ink={ink} />
        <UpArrow ink={ink} />
        <DeadEnd x={F.L + 6} y={F.TOP + 1} ink={ink} />
        {cable(`M${F.L + 6} ${F.TOP + 1} L${ax - 4} ${ay}`, ink, 2.2)}
        <Pulley cx={ax} cy={ay} r={4.4} ink={ink} />
        <Line x1={ax} y1={ay + 4.4} x2={ax} y2={F.STOP} stroke={ink.soft} strokeWidth={1.8} />
        {cable(`M${ax + 4} ${ay} L${F.MID - 3} ${F.TOP + 3}`, ink, 2.2)}
        <Circle cx={F.MID} cy={F.TOP + 4} r={3.8} fill="none" stroke={ink.accent} strokeWidth={2} />
        {cable(`M${F.MID + 3} ${F.TOP + 5} L${bx - 4} ${ay}`, ink, 2.2)}
        <Pulley cx={bx} cy={ay} r={4.4} ink={ink} />
        <Line x1={bx} y1={ay + 4.4} x2={bx} y2={F.STOP} stroke={ink.soft} strokeWidth={1.8} />
        {cable(`M${bx + 4} ${ay} L${F.R - 1} ${topY}`, ink, 2.2)}
        <Pulley cx={exitX} cy={topY} r={4.4} ink={ink} />
        {cable(`M${exitX + 4.4} ${topY} L${F.HX - 3} ${F.HY - 3}`, ink, 1.9)}
        <Handle ink={ink} />
        <SvgText x={F.MID} y={F.BOT + 8} fill={ink.soft} fontSize={8.5} textAnchor="middle">
          4 strands · on the stack
        </SvgText>
      </G>
    );
  }

  // 1_1 — direct. One strand off the stack, no movable pulley anywhere.
  return (
    <G>
      <Frame ink={ink} />
      <Stack ink={ink} />
      <UpArrow ink={ink} />
      {cable(`M${F.MID} ${F.STOP} L${F.MID} ${topY}`, ink, 2.6)}
      <Pulley cx={F.MID} cy={topY} r={4.4} ink={ink} />
      {cable(`M${F.MID} ${F.TOP + 0.6} L${F.R} ${F.TOP + 0.6}`, ink, 2)}
      <Pulley cx={exitX} cy={topY} r={4.4} ink={ink} />
      {cable(`M${exitX + 4.4} ${topY} L${F.HX - 3} ${F.HY - 3}`, ink, 1.9)}
      <Handle ink={ink} />
      <SvgText x={F.MID} y={F.BOT + 8} fill={ink.soft} fontSize={8.5} textAnchor="middle">
        1 strand · on the stack
      </SvgText>
    </G>
  );
}

// ── attachments (viewBox 120 x 78) ───────────────────────────────────────────

function Attachment({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const L = ink.line;
  const stroke = { fill: 'none', stroke: L, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const carabiner = (
    <G>
      <Line x1={60} y1={4} x2={60} y2={14} stroke={L} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={60} cy={16} r={3} fill="none" stroke={L} strokeWidth={1.8} />
    </G>
  );

  let body: React.ReactElement;
  switch (valueId) {
    case 'ez_bar':
      body = <Path d="M24 32 q8 -10 16 -2 q8 8 16 0 q8 -8 16 0 q8 8 16 2 M60 19 L60 26" {...stroke} strokeWidth={2.4} />;
      break;
    case 'rope':
      body = (
        <G>
          <Path d="M60 19 L60 24 M60 24 l-16 26 M60 24 l16 26" {...stroke} strokeWidth={2.4} />
          <Circle cx={44} cy={53} r={3.4} fill={L} />
          <Circle cx={76} cy={53} r={3.4} fill={L} />
        </G>
      );
      break;
    case 'single_d':
      body = (
        <G>
          <Path d="M60 19 L60 26 M48 28 q12 -6 24 0 q4 12 -12 16 q-16 -4 -12 -16 z" {...stroke} strokeWidth={2} />
          <Line x1={52} y1={40} x2={68} y2={40} stroke={L} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
      break;
    case 'dual_d':
      body = (
        <Path
          d="M60 19 l-14 8 M60 19 l14 8 M34 30 q10 -5 20 0 q3 11 -10 14 q-13 -3 -10 -14 z M66 30 q10 -5 20 0 q3 11 -10 14 q-13 -3 -10 -14 z"
          {...stroke}
          strokeWidth={1.8}
        />
      );
      break;
    case 'v_bar':
      body = (
        <G>
          <Path d="M60 19 L60 24 M36 50 L60 26 L84 50" {...stroke} strokeWidth={3} />
          <Path d="M40 46 l8 8 M80 46 l-8 8" {...stroke} strokeWidth={2.4} />
        </G>
      );
      break;
    case 'lat_bar_wide':
      body = (
        <G>
          <Path d="M60 19 L60 26 M16 40 L34 28 L86 28 L104 40" {...stroke} strokeWidth={2.6} />
          <Path d="M22 36 l4 -4 M98 36 l-4 -4" {...stroke} strokeWidth={2.4} />
        </G>
      );
      break;
    case 'mag_grip':
      body = (
        <G>
          <Path d="M60 19 L60 26" {...stroke} strokeWidth={1.8} />
          <Rect x={26} y={27} width={68} height={5} rx={2.5} fill="none" stroke={L} strokeWidth={1.6} />
          <Path d="M30 32 q6 12 -2 16 q-8 -6 -4 -16 z M90 32 q-6 12 2 16 q8 -6 4 -16 z" {...stroke} strokeWidth={1.8} />
        </G>
      );
      break;
    case 'ankle_strap':
      body = (
        <G>
          <Path d="M60 19 L60 26" {...stroke} strokeWidth={1.8} />
          <Circle cx={60} cy={30} r={4} fill="none" stroke={L} strokeWidth={1.8} />
          <Path d="M40 38 q20 -6 40 0 q0 14 -20 16 q-20 -2 -20 -16 z" {...stroke} strokeWidth={2} />
          <Line x1={40} y1={44} x2={80} y2={44} stroke={ink.soft} strokeWidth={1.4} />
        </G>
      );
      break;
    case 'head_harness':
      body = (
        <G>
          <Path d="M60 19 l-18 10 M60 19 l18 10" {...stroke} strokeWidth={1.6} />
          <Path d="M34 40 q26 -20 52 0 M34 40 q26 20 52 0" {...stroke} strokeWidth={2.2} />
          <Line x1={34} y1={40} x2={86} y2={40} stroke={ink.soft} strokeWidth={1.4} />
        </G>
      );
      break;
    case 'tricep_v_strap':
      body = (
        <Path
          d="M60 19 L60 24 M60 24 l-18 28 M60 24 l18 28 M38 52 q4 8 8 0 M74 52 q4 8 8 0"
          {...stroke}
          strokeWidth={2.4}
        />
      );
      break;
    case 'stirrup':
      body = (
        <G>
          <Path d="M60 19 L60 26 M46 28 L74 28 L70 44 L50 44 z" {...stroke} strokeWidth={2} />
          <Line x1={50} y1={44} x2={70} y2={44} stroke={L} strokeWidth={3.4} strokeLinecap="round" />
        </G>
      );
      break;
    case 'band':
      body = (
        <Path
          d="M60 12 q-22 14 -14 30 q8 16 14 22 q6 -6 14 -22 q8 -16 -14 -30 z"
          fill="none"
          stroke={ink.accent}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      );
      break;
    case 'sled_strap':
      body = (
        <G>
          <Path d="M60 19 L60 26 M42 28 L78 28 M46 28 l-6 22 M74 28 l6 22" {...stroke} strokeWidth={2.2} />
          <Rect x={36} y={50} width={48} height={8} rx={2} fill="none" stroke={L} strokeWidth={1.6} />
        </G>
      );
      break;
    case 'straight_bar':
    default:
      body = (
        <G>
          <Path d="M60 19 L60 26" {...stroke} strokeWidth={1.8} />
          <Rect x={24} y={26} width={72} height={6} rx={3} fill="none" stroke={L} strokeWidth={1.8} />
          <Line x1={30} y1={26} x2={30} y2={32} stroke={L} strokeWidth={2} />
          <Line x1={90} y1={26} x2={90} y2={32} stroke={L} strokeWidth={2} />
        </G>
      );
      break;
  }
  // The band is self-anchoring; everything else hangs from the carabiner.
  return (
    <G>
      {valueId === 'band' ? null : carabiner}
      {body}
    </G>
  );
}

// ── grip width (viewBox 120 x 78) ────────────────────────────────────────────

const GRIP_HALF: Record<string, number> = {
  close: 12,
  shoulder: 20,
  medium: 26,
  wide: 34,
  extra_wide: 42,
};

function GripWidth({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const half = GRIP_HALF[valueId] ?? 26;
  const cx = 60;
  const y = 34;
  return (
    <G>
      <Line x1={14} y1={y} x2={106} y2={y} stroke={ink.line} strokeWidth={3} strokeLinecap="round" />
      {[-1, 1].map((s) => {
        const x = cx + s * half;
        return (
          <G key={s}>
            <Rect x={x - 5} y={y - 11} width={10} height={10} rx={2} fill="none" stroke={ink.accent} strokeWidth={1.8} />
            <Line x1={x} y1={y + 1} x2={x} y2={y + 7} stroke={ink.accent} strokeWidth={2.2} strokeLinecap="round" />
          </G>
        );
      })}
      <Line x1={cx - half} y1={y + 16} x2={cx + half} y2={y + 16} stroke={ink.soft} strokeWidth={1} />
      <Path
        d={`M${cx - half} ${y + 13} l0 6 M${cx + half} ${y + 13} l0 6`}
        fill="none"
        stroke={ink.soft}
        strokeWidth={1}
      />
    </G>
  );
}

// ── grip orientation (viewBox 120 x 78) ──────────────────────────────────────

function Hand({ rot, x, y, color }: { rot: number; x: number; y: number; color: string }): React.ReactElement {
  return (
    <G transform={`translate(${x},${y}) rotate(${rot})`}>
      <Path
        d="M-9 -3 q9 -9 18 0 l0 7 q-9 6 -18 0 z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M-9 0 l-4 2" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </G>
  );
}

function GripOrientation({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const y = 40;
  const bar = <Circle cx={60} cy={y} r={9} fill="none" stroke={ink.soft} strokeWidth={2.4} />;
  switch (valueId) {
    case 'supinated':
      return <G>{bar}<Hand rot={180} x={60} y={y} color={ink.accent} /></G>;
    case 'neutral':
      return <G>{bar}<Hand rot={90} x={60} y={y} color={ink.accent} /></G>;
    case 'mixed':
      return (
        <G>
          <Circle cx={44} cy={y} r={7} fill="none" stroke={ink.soft} strokeWidth={2} />
          <Circle cx={76} cy={y} r={7} fill="none" stroke={ink.soft} strokeWidth={2} />
          <Hand rot={0} x={44} y={y} color={ink.accent} />
          <Hand rot={180} x={76} y={y} color={ink.accent} />
        </G>
      );
    case 'thumbless':
      return (
        <G>
          {bar}
          <Hand rot={0} x={60} y={y} color={ink.accent} />
          {/* the absent thumb, struck through */}
          <Path d="M48 34 l-6 -6 M42 34 l6 -6" fill="none" stroke={ink.soft} strokeWidth={1.8} strokeLinecap="round" />
        </G>
      );
    case 'hook':
      return (
        <G>
          {bar}
          <Hand rot={0} x={60} y={y} color={ink.accent} />
          <Path d="M52 30 q8 -7 16 0" fill="none" stroke={ink.accent} strokeWidth={2.2} strokeLinecap="round" />
        </G>
      );
    case 'pronated':
    default:
      return <G>{bar}<Hand rot={0} x={60} y={y} color={ink.accent} /></G>;
  }
}

// ── bench angle (viewBox 120 x 78) ───────────────────────────────────────────

const BENCH_DEG: Record<string, number> = {
  decline: -14,
  flat: 0,
  incline_15: 15,
  incline_30: 30,
  incline_45: 45,
  incline_60: 60,
  upright_90: 82,
};

function BenchAngle({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const deg = BENCH_DEG[valueId] ?? 0;
  const rad = (deg * Math.PI) / 180;
  const x0 = 34;
  const y0 = 54;
  const len = 54;
  const x1 = x0 + len * Math.cos(rad);
  const y1 = y0 - len * Math.sin(rad);
  return (
    <G>
      <Line x1={18} y1={66} x2={102} y2={66} stroke={ink.soft} strokeWidth={2} />
      <Line x1={30} y1={66} x2={30} y2={54} stroke={ink.line} strokeWidth={2} />
      <Line x1={90} y1={66} x2={90} y2={54} stroke={ink.line} strokeWidth={2} />
      <Line x1={x0} y1={y0} x2={x1} y2={y1} stroke={ink.accent} strokeWidth={5} strokeLinecap="round" />
      <Path d={`M${x0} ${y0} l-8 0`} fill="none" stroke={ink.line} strokeWidth={2} strokeLinecap="round" />
    </G>
  );
}

// ── stance, seen from above (viewBox 120 x 78) ───────────────────────────────

function Foot({ x, y, rot, ink }: { x: number; y: number; rot?: number; ink: Ink }): React.ReactElement {
  return (
    <G transform={`translate(${x},${y}) rotate(${rot ?? 0})`}>
      <Path
        d="M-5 -10 q5 -4 10 0 l0 20 q-5 4 -10 0 z"
        fill="none"
        stroke={ink.accent}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </G>
  );
}

function Stance({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const cy = 38;
  switch (valueId) {
    case 'narrow':
      return <G><Foot x={53} y={cy} ink={ink} /><Foot x={67} y={cy} ink={ink} /></G>;
    case 'wide':
      return <G><Foot x={38} y={cy} rot={-12} ink={ink} /><Foot x={82} y={cy} rot={12} ink={ink} /></G>;
    case 'sumo':
      return <G><Foot x={30} y={cy} rot={-26} ink={ink} /><Foot x={90} y={cy} rot={26} ink={ink} /></G>;
    case 'staggered':
      return <G><Foot x={50} y={cy - 10} ink={ink} /><Foot x={70} y={cy + 12} ink={ink} /></G>;
    case 'split':
      return <G><Foot x={48} y={cy - 14} ink={ink} /><Foot x={72} y={cy + 16} ink={ink} /></G>;
    case 'feet_together':
      return <G><Foot x={56} y={cy} ink={ink} /><Foot x={64} y={cy} ink={ink} /></G>;
    case 'high_platform':
      return (
        <G>
          <Foot x={48} y={26} ink={ink} />
          <Foot x={72} y={26} ink={ink} />
          <Line x1={24} y1={44} x2={96} y2={44} stroke={ink.soft} strokeWidth={2} />
        </G>
      );
    case 'low_platform':
      return (
        <G>
          <Foot x={48} y={50} ink={ink} />
          <Foot x={72} y={50} ink={ink} />
          <Line x1={24} y1={30} x2={96} y2={30} stroke={ink.soft} strokeWidth={2} />
        </G>
      );
    case 'shoulder':
    default:
      return <G><Foot x={48} y={cy} ink={ink} /><Foot x={72} y={cy} ink={ink} /></G>;
  }
}

// ── bar position (viewBox 120 x 78) ──────────────────────────────────────────

function BarPosition({ valueId, ink }: { valueId: string; ink: Ink }): React.ReactElement {
  const y = valueId === 'low_bar' ? 34 : 24;
  return (
    <G>
      <Path
        d="M60 12 q-9 0 -9 9 l0 30 q0 9 9 9 q9 0 9 -9 l0 -30 q0 -9 -9 -9 z"
        fill="none"
        stroke={ink.line}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Line x1={34} y1={y} x2={86} y2={y} stroke={ink.accent} strokeWidth={4.5} strokeLinecap="round" />
    </G>
  );
}

// ── dispatcher ───────────────────────────────────────────────────────────────

/** Aspect ratios per axis family: pulley graphics are taller. */
function viewBoxFor(axisId: string): { w: number; h: number } {
  return axisId === 'pulley_height' || axisId === 'pulley_ratio' ? { w: 120, h: 92 } : { w: 120, h: 78 };
}

export function QualifierGraphic({ axisId, valueId, size = 120 }: QualifierGraphicProps): React.ReactElement | null {
  const { theme } = useTheme();

  if (!hasGraphic(axisId)) return null;

  const ink: Ink = {
    line: theme.colors.textPrimary,
    soft: theme.colors.textTertiary,
    accent: theme.colors.accentDefault,
    good: theme.colors.accentDefault,
  };

  const { w, h } = viewBoxFor(axisId);

  let content: React.ReactElement | null = null;
  switch (axisId) {
    case 'pulley_height': content = <PulleyHeight valueId={valueId} ink={ink} />; break;
    case 'pulley_ratio': content = <PulleyRatio valueId={valueId} ink={ink} />; break;
    case 'attachment': content = <Attachment valueId={valueId} ink={ink} />; break;
    case 'grip_width': content = <GripWidth valueId={valueId} ink={ink} />; break;
    case 'grip_orientation': content = <GripOrientation valueId={valueId} ink={ink} />; break;
    case 'bench_angle': content = <BenchAngle valueId={valueId} ink={ink} />; break;
    case 'stance': content = <Stance valueId={valueId} ink={ink} />; break;
    case 'bar_position': content = <BarPosition valueId={valueId} ink={ink} />; break;
    default: return null;
  }

  return (
    <Svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`}>
      {content}
    </Svg>
  );
}

export default QualifierGraphic;
