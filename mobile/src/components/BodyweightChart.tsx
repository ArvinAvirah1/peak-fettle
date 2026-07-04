/**
 * BodyweightChart — weekly-median bodyweight trend (founder 2026-06-10).
 * Lightweight SVG polyline over the local `bodyweight` history.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Polyline, Circle, Line } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { BodyweightEntry } from '../data/bodyweight';
import { kgToLbs, UnitSystem } from '../constants/units';

interface Props {
  history: BodyweightEntry[];
  unitPref: UnitSystem;
  width?: number;
  height?: number;
}

export function BodyweightChart({
  history,
  unitPref,
  width = 320,
  height = 120,
}: Props): React.ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();
  if (history.length === 0) return null;

  const toDisplay = (kg: number) => (unitPref === 'lbs' ? kgToLbs(kg) : kg);
  const values = history.map((h) => toDisplay(h.weight_kg));
  const unitLabel = unitPref === 'lbs' ? 'lb' : 'kg';

  const pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1); // avoid flat-line div-by-zero
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const points = values.map((v, i) => `${pad + i * stepX},${y(v)}`).join(' ');
  const last = values[values.length - 1]!;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.kicker, { color: theme.colors.textTertiary }]}>{t('components:bodyweightChart.kicker')}</Text>
        <Text style={[styles.latest, { color: theme.colors.textPrimary }]}>
          {last.toFixed(1)} {unitLabel}
        </Text>
      </View>
      <Svg width={width} height={height}>
        <Line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke={theme.colors.borderDefault}
          strokeWidth={1}
        />
        {values.length > 1 ? (
          <Polyline
            points={points}
            fill="none"
            stroke={theme.colors.accentDefault}
            strokeWidth={2}
          />
        ) : null}
        {values.map((v, i) => (
          <Circle
            key={i}
            cx={pad + i * stepX}
            cy={y(v)}
            r={3}
            fill={theme.colors.accentDefault}
          />
        ))}
      </Svg>
      <Text style={[styles.range, { color: theme.colors.textTertiary }]}>
        {t('components:bodyweightChart.rangeSummary', {
          count: history.length,
          low: min.toFixed(1),
          high: max.toFixed(1),
          unit: unitLabel,
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginBottom: spacing.s4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s2,
  },
  kicker: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1.2,
  },
  latest: {
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  range: {
    fontSize: fontSize.caption,
    marginTop: spacing.s1,
  },
});
