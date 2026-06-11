/**
 * BrandMark — the Peak Fettle app-icon mark as a vector (founder 2026-06-10).
 *
 * Reproduces assets/icon.png exactly: three ascending rounded bars in deepening
 * teal with the bright "peak" arrow above the last bar. Geometry and colors
 * were sampled pixel-for-pixel from the 1024×1024 icon, so the in-app mark and
 * the App Store icon are the same artwork.
 *
 * Used by BrandLogo (home header lockup, auth, splash). `withBackground`
 * draws the icon's navy rounded square for standalone tile contexts.
 */

import React from 'react';
import Svg, { Rect, Polygon } from 'react-native-svg';

// Sampled from assets/icon.png (1024×1024)
export const BRAND_NAVY = '#06080f';
export const BAR_COLORS = ['#136760', '#1f9c8f', '#2bd1bd'] as const;
export const PEAK_COLOR = '#3edcc6';

// Bars: x, y, w, h (1024 viewBox), bottom-aligned at y=831, corner radius 40
const BARS = [
  { x: 192, y: 640, w: 144, h: 191, color: BAR_COLORS[0] },
  { x: 416, y: 480, w: 144, h: 351, color: BAR_COLORS[1] },
  { x: 640, y: 608, w: 144, h: 223, color: BAR_COLORS[2] },
];

// Peak arrow: tip → right base → notch → left base
const PEAK_POINTS = '767,192 927,511 815,511 767,409 720,511 608,511';

export interface BrandMarkProps {
  /** Rendered square size in logical pixels. */
  size?: number;
  /** Draw the icon's navy rounded-square background behind the mark. */
  withBackground?: boolean;
}

export function BrandMark({
  size = 32,
  withBackground = false,
}: BrandMarkProps): React.ReactElement {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      accessibilityLabel="Peak Fettle mark"
    >
      {withBackground ? (
        <Rect x={0} y={0} width={1024} height={1024} rx={224} fill={BRAND_NAVY} />
      ) : null}
      {BARS.map((b, i) => (
        <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={40} fill={b.color} />
      ))}
      <Polygon points={PEAK_POINTS} fill={PEAK_COLOR} />
    </Svg>
  );
}
