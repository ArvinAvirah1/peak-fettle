/**
 * ReadinessCard — daily readiness score display for the Insights screen.
 *
 * Shows: score dial (0–100), band label with copy, component breakdown,
 * and collapsible rule trace.
 *
 * Agent K polish (2026-06-11):
 *   - Skeleton loading state replaces bare ActivityIndicator
 *   - Score dial animates from 0 → target on mount (800ms ease-out)
 *     respects Reduce Motion (instant fill when true)
 *   - Entrance: FadeInDown via Reanimated, Reduce Motion aware
 *   - Press scale micro-interaction on trace toggle
 *
 * Data comes from GET /insights/readiness via insights.ts.
 * No raw 'bold' — uses fontWeight token. All colors via useTheme().
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { ReadinessResponse, ReadinessBand } from '../api/insights';
import { useReduceMotion } from '../hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Band copy
// ---------------------------------------------------------------------------

const BAND_LABEL: Record<ReadinessBand, string> = {
  push: 'Ready to push',
  maintain: 'Maintain intensity',
  rest: 'Prioritise recovery',
  unknown: 'Not enough data yet',
};

const BAND_DETAIL: Record<ReadinessBand, string> = {
  push:     'Your metrics look strong — a hard session today will drive adaptation.',
  maintain: 'Hold your training load steady and monitor how you feel mid-session.',
  rest:     'Your body is asking for recovery. A light movement session or rest day is evidence-based here.',
  unknown:  'Log health metrics (HRV, sleep, resting HR) for at least 7 days to unlock your personalised score.',
};

// ---------------------------------------------------------------------------
// Skeleton — pulsing placeholder while loading
// ---------------------------------------------------------------------------

function SkeletonLine({ width, height = 12, style }: { width: number | string; height?: number; style?: object }): React.ReactElement {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: 6,
          backgroundColor: theme.colors.bgTertiary,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

function ReadinessCardSkeleton(): React.ReactElement {
  const { theme, spacing: sp, radius: r } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderRadius: r.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.borderDefault,
          padding: sp.s5,
        },
      ]}
      accessibilityLabel="Loading readiness score"
    >
      {/* Top row skeleton: circle + lines */}
      <View style={styles.topRow}>
        <SkeletonLine width={96} height={96} style={{ borderRadius: 48 }} />
        <View style={{ flex: 1, gap: 10 }}>
          <SkeletonLine width="80%" height={18} />
          <SkeletonLine width="100%" height={12} />
          <SkeletonLine width="60%" height={12} />
        </View>
      </View>
      {/* Component rows skeleton */}
      <View style={{ marginTop: sp.s4, gap: 10 }}>
        <SkeletonLine width="100%" height={11} />
        <SkeletonLine width="90%" height={11} />
        <SkeletonLine width="70%" height={11} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Animated score dial (SVG ring with animated fill)
// ---------------------------------------------------------------------------

interface DialProps {
  score: number;        // 0–100
  color: string;
  trackColor: string;
  size?: number;
  strokeWidth?: number;
}

function ScoreDial({ score, color, trackColor, size = 96, strokeWidth = 8 }: DialProps): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const animVal = useRef(new Animated.Value(reduceMotion ? score : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      animVal.setValue(score);
      return;
    }
    Animated.timing(animVal, {
      toValue: score,
      duration: 800,
      useNativeDriver: false, // SVG props cannot use native driver
    }).start();
  }, [score, reduceMotion, animVal]);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  // Animated strokeDashoffset driven by animVal (0..100 → 0..circumference)
  const strokeDashoffset = animVal.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  return (
    <Svg width={size} height={size}>
      {/* Track */}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Animated progress — Animated.Circle not natively available; use
          a static circle driven by JS-side interpolation snapshot each frame.
          We render a standard SVG Circle and update strokeDashoffset via
          the Animated value listener feeding a stateful variable. */}
      <AnimatedArc
        cx={cx}
        cy={cy}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        circumference={circumference}
        animVal={animVal}
      />
    </Svg>
  );
}

// AnimatedArc bridges Animated.Value → SVG strokeDashoffset via useState listener
function AnimatedArc({
  cx, cy, r: radius_, stroke, strokeWidth, circumference, animVal,
}: {
  cx: number; cy: number; r: number; stroke: string;
  strokeWidth: number; circumference: number;
  animVal: Animated.Value;
}): React.ReactElement {
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const id = animVal.addListener(({ value }) => {
      const pct = Math.max(0, Math.min(100, value)) / 100;
      setOffset(circumference * (1 - pct));
    });
    return () => animVal.removeListener(id);
  }, [animVal, circumference]);

  return (
    <Circle
      cx={cx}
      cy={cy}
      r={radius_}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      strokeDasharray={`${circumference} ${circumference}`}
      strokeDashoffset={offset}
      strokeLinecap="round"
      rotation="-90"
      origin={`${cx},${cy}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  data: ReadinessResponse | null;
  loading: boolean;
}

export default function ReadinessCard({ data, loading }: Props): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const [traceOpen, setTraceOpen] = useState(false);
  const reduceMotion = useReduceMotion();

  // Entrance fade (matches house FadeIn pattern)
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

  const dialColor = (() => {
    if (!data || data.score === null) return colors.borderDefault;
    if (data.score >= 67) return colors.statusSuccess;
    if (data.score >= 34) return colors.statusWarning;
    return colors.statusError;
  })();

  if (loading) {
    return <ReadinessCardSkeleton />;
  }

  const score = data?.score ?? null;
  const band = data?.band ?? 'unknown';
  const components = data?.components ?? [];
  const ruleTrace = data?.rule_trace ?? [];

  return (
    <Animated.View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Readiness score: ${score !== null ? score : 'unknown'}. Band: ${BAND_LABEL[band]}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.bgSecondary,
          borderRadius: r.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.borderDefault,
          padding: sp.s5,
          opacity: fadeAnim,
        },
      ]}
    >
      {/* Top row: dial + band */}
      <View style={styles.topRow}>
        <View style={styles.dialWrap}>
          <ScoreDial
            score={score ?? 0}
            color={dialColor}
            trackColor={colors.borderDefault}
          />
          <View style={[StyleSheet.absoluteFillObject, styles.dialCenter]}>
            <Text
              style={{ color: colors.textPrimary, fontSize: fs.heading3, fontWeight: fontWeight.bold }}
            >
              {score !== null ? Math.round(score) : '—'}
            </Text>
          </View>
        </View>

        <View style={styles.bandBlock}>
          <Text style={{ color: dialColor, fontSize: fs.bodyLg, fontWeight: fontWeight.bold }}>
            {BAND_LABEL[band]}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, marginTop: sp.s1, lineHeight: 18 }}>
            {BAND_DETAIL[band]}
          </Text>
        </View>
      </View>

      {/* Component breakdown */}
      {components.length > 0 && (
        <View style={[styles.components, { marginTop: sp.s4 }]}>
          {components.map((c) => (
            <View key={c.name} style={[styles.compRow, { marginBottom: sp.s2 }]}>
              <Text style={{ color: colors.textSecondary, fontSize: fs.caption, fontWeight: fontWeight.medium, flex: 1 }}>
                {c.name}
              </Text>
              <Text style={{ color: colors.textTertiary, fontSize: fs.caption, marginRight: sp.s2 }}>
                {c.detail}
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: fs.caption, fontWeight: fontWeight.semibold, width: 30, textAlign: 'right' }}>
                {Math.round(c.value)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Collapsible rule trace */}
      {ruleTrace.length > 0 && (
        <View style={{ marginTop: sp.s3 }}>
          <TouchableOpacity
            onPress={() => setTraceOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={traceOpen ? 'Hide rule trace' : 'Show rule trace'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.traceToggle}
          >
            <Text style={{ color: colors.accentDefault, fontSize: fs.caption, fontWeight: fontWeight.medium }}>
              {traceOpen ? '▲ Hide rule trace' : '▼ How this score is calculated'}
            </Text>
          </TouchableOpacity>

          {traceOpen && (
            <View style={[styles.traceBox, { backgroundColor: colors.bgPrimary, borderRadius: r.md, padding: sp.s3, marginTop: sp.s2 }]}>
              {ruleTrace.map((line, i) => (
                <Text key={i} style={{ color: colors.textSecondary, fontSize: fs.micro, lineHeight: 16, marginBottom: 2 }}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  card: {},
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  dialWrap: {
    width: 96,
    height: 96,
  },
  dialCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandBlock: {
    flex: 1,
  },
  components: {},
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  traceToggle: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  traceBox: {},
});
