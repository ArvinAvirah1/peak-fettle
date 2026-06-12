/**
 * 14-day mood sparkline (TICKET-108) — pure SVG, readable without color
 * alone (dots + accessible summary label).
 */

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

export function MoodSparkline({
  moods,
  width = 280,
  height = 48,
}: {
  /** Oldest-first mood values 1–5. */
  moods: number[];
  width?: number;
  height?: number;
}): React.ReactElement | null {
  const { theme } = useTheme();
  if (moods.length < 2) return null;

  const pad = 6;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = innerW / (moods.length - 1);
  const points = moods.map((m, i) => {
    const x = pad + i * stepX;
    const y = pad + innerH - ((m - 1) / 4) * innerH;
    return { x, y };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const avg = moods.reduce((a, b) => a + b, 0) / moods.length;

  return (
    <View
      accessible
      accessibilityLabel={`Mood over the last ${moods.length} days, average ${avg.toFixed(1)} out of 5`}
    >
      <Svg width={width} height={height}>
        <Polyline
          points={polyline}
          fill="none"
          stroke={theme.colors.accentDefault}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={2.5} fill={theme.colors.textSecondary} />
        ))}
      </Svg>
    </View>
  );
}
