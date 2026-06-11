/**
 * ReadinessCard — daily readiness score display for the Insights screen.
 *
 * Shows: score dial (0–100), band label with copy, component breakdown,
 * and collapsible rule trace.
 *
 * Data comes from GET /insights/readiness via insights.ts.
 * No raw 'bold' — uses fontWeight token. All colors via useTheme().
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';
import { ReadinessResponse, ReadinessBand } from '../api/insights';

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
// Score dial (SVG ring)
// ---------------------------------------------------------------------------

interface DialProps {
  score: number;        // 0–100
  color: string;
  trackColor: string;
  size?: number;
  strokeWidth?: number;
}

function ScoreDial({ score, color, trackColor, size = 96, strokeWidth = 8 }: DialProps): React.ReactElement {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const strokeDashoffset = circumference * (1 - pct);
  const cx = size / 2;
  const cy = size / 2;

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
      {/* Progress — starts at 12 o'clock */}
      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx},${cy}`}
      />
    </Svg>
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

  const dialColor = (() => {
    if (!data || data.score === null) return colors.borderDefault;
    if (data.score >= 67) return colors.statusSuccess;
    if (data.score >= 34) return colors.statusWarning;
    return colors.statusError;
  })();

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderRadius: r.lg, padding: sp.s5 }]}>
        <ActivityIndicator color={colors.accentDefault} />
      </View>
    );
  }

  const score = data?.score ?? null;
  const band = data?.band ?? 'unknown';
  const components = data?.components ?? [];
  const ruleTrace = data?.rule_trace ?? [];

  return (
    <View
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
    </View>
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
  },
  traceBox: {},
});
