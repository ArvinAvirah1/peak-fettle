/**
 * LiftProgressChart — TICKET-086.
 *
 * Self-contained component that fetches lift-progress data for a single
 * exercise and renders a labelled SVG line chart with a 4-metric toggle.
 *
 * FROZEN CONTRACT (Agent 3 codes against this):
 *   <LiftProgressChart
 *     exerciseId={string}
 *     exerciseName={string}
 *     unitPref?={'kg'|'lbs'}
 *     initialMetric?={'e1rm'|'topWeight'|'volume'|'bestReps'}
 *   />
 *
 * Token note (TICKET-078): spacing/fontSize/radius are OBJECTS from useTheme()
 * (spacing.s4, fontSize.bodySm, radius.md), NOT scalar numbers. colors uses the
 * semantic names (accentDefault, bgElevated, borderDefault, textPrimary).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';

import { getExerciseProgress, ProgressPoint, ProgressSeries } from '../api/progress';
import { getLocalExerciseProgress } from '../data/localProgress';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { useAuth } from '../hooks/useAuth';
import { formatWeight } from '../constants/units';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Metric = 'e1rm' | 'topWeight' | 'volume' | 'bestReps';

interface LiftProgressChartProps {
  exerciseId: string;
  exerciseName: string;
  unitPref?: 'kg' | 'lbs';
  initialMetric?: Metric;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_HEIGHT = 200;
const PADDING = { top: 16, right: 16, bottom: 40, left: 52 };
const DOT_R = 4;
const GRID_LINES = 4;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metricValue(pt: ProgressPoint, metric: Metric): number {
  return pt[metric];
}

function formatAxisValue(
  value: number,
  metric: Metric,
  unitPref: 'kg' | 'lbs',
): string {
  if (metric === 'bestReps') return String(Math.round(value));
  if (metric === 'volume') {
    if (unitPref === 'lbs') return `${Math.round(value * 2.20462)} lbs`;
    return `${Math.round(value)} kg`;
  }
  // e1rm and topWeight — formatWeight expects kg, handles conversion
  return formatWeight(value, unitPref, 0);
}

/** Pure helper called only from this file's own render — takes `t` per the
 * render-site translation rule (it lives outside component/hook scope). */
function metricLabel(metric: Metric, unitPref: 'kg' | 'lbs', t: TFunction): string {
  switch (metric) {
    case 'e1rm':
      return t('components:liftProgressChart.metric.e1rm');
    case 'topWeight':
      return t('components:liftProgressChart.metric.topWeight');
    case 'volume':
      return t('components:liftProgressChart.metric.volume', { unit: unitPref });
    case 'bestReps':
      return t('components:liftProgressChart.metric.bestReps');
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LiftProgressChart({
  exerciseId,
  exerciseName,
  unitPref = 'kg',
  initialMetric = 'e1rm',
}: LiftProgressChartProps): React.ReactElement {
  const { theme, spacing, fontSize, radius } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const colors = theme.colors;
  const activeChipInk = theme.components.buttonPrimaryText;

  const [series, setSeries] = useState<ProgressSeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>(initialMetric);
  const [chartWidth, setChartWidth] = useState(0);

  const loadedForId = useRef<string>('');

  // Fetch data whenever exerciseId changes
  useEffect(() => {
    if (loadedForId.current === exerciseId && series !== null) return;

    let cancelled = false;
    setLoading(true);
    setSeries(null);

    // Free/local-first users read the on-device sets table (no GET /sets hang);
    // Pro users keep the server aggregation.
    const fetcher = isLocalFirst(user)
      ? getLocalExerciseProgress(exerciseId)
      : getExerciseProgress(exerciseId);
    fetcher.then((result) => {
      if (!cancelled) {
        setSeries(result);
        loadedForId.current = exerciseId;
        setLoading(false);
      }
    }).catch(() => {
      // S3-11: without a catch, a rejected fetch leaves loading=true forever.
      if (!cancelled) {
        setSeries(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [exerciseId, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setChartWidth(e.nativeEvent.layout.width);
  }, []);

  // ---- Render: loading ----
  if (loading) {
    return (
      <View style={[styles.center, { paddingVertical: spacing.s6 }]}>
        <ActivityIndicator color={colors.accentDefault} />
      </View>
    );
  }

  const points = series?.points ?? [];

  // ---- Render: empty ----
  if (points.length === 0) {
    return (
      <View style={[styles.center, { paddingVertical: spacing.s6 }]}>
        <Text
          style={[
            styles.emptyText,
            { color: colors.textSecondary, fontSize: fontSize.bodySm },
          ]}
        >
          {t('components:liftProgressChart.emptyState')}
        </Text>
      </View>
    );
  }

  const values = points.map((p) => metricValue(p, metric));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);

  // ---- Metric toggle ----
  const metricToggle = (
    <View style={[styles.toggleRow, { gap: spacing.s2 }]}>
      {(['e1rm', 'topWeight', 'volume', 'bestReps'] as Metric[]).map((m) => {
        const active = m === metric;
        return (
          <TouchableOpacity
            key={m}
            onPress={() => setMetric(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              {
                borderRadius: radius.md,
                paddingHorizontal: spacing.s2,
                paddingVertical: spacing.s1,
                backgroundColor: active ? colors.accentDefault : colors.bgElevated,
                borderColor: active ? colors.accentDefault : colors.borderDefault,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? activeChipInk : colors.textSecondary, fontSize: fontSize.caption },
              ]}
            >
              {metricLabel(m, unitPref, t)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ---- Render: single point ----
  if (points.length === 1) {
    const val = values[0] ?? 0;
    const only = points[0]!;
    return (
      <View>
        <Text style={[styles.titleText, { color: colors.textPrimary, fontSize: fontSize.bodyMd, marginBottom: spacing.s2 }]}>
          {exerciseName}
        </Text>
        {metricToggle}
        <View style={[styles.center, { paddingVertical: spacing.s5 }]}>
          <View style={[styles.singleDot, { backgroundColor: colors.accentDefault, borderRadius: DOT_R * 2 }]} />
          <Text style={[styles.singleValue, { color: colors.textPrimary, fontSize: fontSize.bodyLg, marginTop: spacing.s2 }]}>
            {formatAxisValue(val, metric, unitPref)}
          </Text>
          <Text style={[styles.singleDate, { color: colors.textSecondary, fontSize: fontSize.caption, marginTop: spacing.s1 }]}>
            {only.date}
          </Text>
        </View>
      </View>
    );
  }

  // ---- Render: full chart ----
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const plotW = Math.max(chartWidth - PADDING.left - PADDING.right, 0);
  const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;

  const yRange = maxVal - minVal || 1;
  const yMin = minVal - yRange * 0.08;
  const yMax = maxVal + yRange * 0.08;

  const xPos = (i: number): number =>
    PADDING.left + (plotW > 0 ? (i / (points.length - 1)) * plotW : 0);
  const yPos = (v: number): number =>
    PADDING.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const polylinePoints = points
    .map((p, i) => `${xPos(i)},${yPos(metricValue(p, metric))}`)
    .join(' ');

  // Grid lines + y-axis min/max labels
  const gridElements: React.ReactElement[] = [];
  for (let g = 0; g <= GRID_LINES; g++) {
    const v = yMin + ((yMax - yMin) * g) / GRID_LINES;
    const y = yPos(v);
    gridElements.push(
      <Line
        key={`grid-${g}`}
        x1={PADDING.left}
        y1={y}
        x2={PADDING.left + plotW}
        y2={y}
        stroke={colors.borderDefault}
        strokeWidth={0.5}
        strokeDasharray="4 4"
      />,
    );
    if (g === 0 || g === GRID_LINES) {
      gridElements.push(
        <SvgText
          key={`ylabel-${g}`}
          x={PADDING.left - 4}
          y={y + 4}
          fontSize={10}
          fill={colors.textSecondary}
          textAnchor="end"
        >
          {formatAxisValue(v, metric, unitPref)}
        </SvgText>,
      );
    }
  }

  // X-axis: first and last date labels (MM-DD)
  const xLabels: React.ReactElement[] = [
    <SvgText key="x0" x={xPos(0)} y={CHART_HEIGHT - PADDING.bottom + 14} fontSize={10} fill={colors.textSecondary} textAnchor="middle">
      {first.date.slice(5)}
    </SvgText>,
    <SvgText key="xN" x={xPos(points.length - 1)} y={CHART_HEIGHT - PADDING.bottom + 14} fontSize={10} fill={colors.textSecondary} textAnchor="middle">
      {last.date.slice(5)}
    </SvgText>,
  ];

  const baseline = (
    <Line
      x1={PADDING.left}
      y1={PADDING.top + plotH}
      x2={PADDING.left + plotW}
      y2={PADDING.top + plotH}
      stroke={colors.borderDefault}
      strokeWidth={1}
    />
  );

  const dots = points.map((p, i) => (
    <Circle key={i} cx={xPos(i)} cy={yPos(metricValue(p, metric))} r={DOT_R} fill={colors.accentDefault} />
  ));

  return (
    <View>
      <Text style={[styles.titleText, { color: colors.textPrimary, fontSize: fontSize.bodyMd, marginBottom: spacing.s2 }]}>
        {exerciseName}
      </Text>

      {metricToggle}

      <View style={[styles.chartContainer, { marginTop: spacing.s2 }]} onLayout={onLayout}>
        {chartWidth > 0 && (
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {gridElements}
            {baseline}
            {xLabels}
            <Polyline
              points={polylinePoints}
              fill="none"
              stroke={colors.accentDefault}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {dots}
          </Svg>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only (no token access here, per TICKET-078)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { textAlign: 'center' },
  titleText: { fontWeight: '600' },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontWeight: '500' },
  chartContainer: { width: '100%' },
  singleDot: { width: DOT_R * 4, height: DOT_R * 4 },
  singleValue: { fontWeight: '700' },
  singleDate: {},
});
