/**
 * Body measurements — TICKET-130.
 *
 * Reachable via router.push('/measurements') from the Progress tab.
 * Preset metrics (waist, chest, hips, arms, thighs, calves, neck, body-fat %)
 * plus user-defined custom metrics, each with a full trend chart. Free tier:
 * fully local (on-device `body_measurements`, schema v12). Pro tier: additive
 * server sync. This screen ONLY talks to src/data/measurements.ts (the
 * tier-branched data layer) — no raw api/* import here.
 *
 * Entry UX (ticket AC3): pick metric → numeric pad → save; last value
 * prefilled; sparkline + full trend chart per metric.
 *
 * Bodyweight is intentionally NOT a loggable row here — it reads the existing
 * weekly `bodyweight` table (useBodyweight) so there is exactly one source of
 * truth for body weight (ticket AC4); this screen shows it as a read-only
 * reference row alongside the custom/preset metrics.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { useTheme } from '../src/theme/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import { ScreenLayout, PFButton } from '../src/components/ui';
import { fontSize, fontWeight, spacing, radius } from '../src/theme/tokens';
import {
  PRESET_METRICS,
  metricLabel,
  isPresetMetric,
  getMeasurementHistory,
  getLatestMeasurement,
  logMeasurement,
  getLoggedMetricKeys,
  MeasurementEntry,
} from '../src/data/measurements';
import {
  displayToCm,
  cmToInputValue,
  parseLengthInput,
  formatLength,
} from '../src/constants/units';
import { useBodyweight } from '../src/hooks/useBodyweight';
import { formatWeight, UnitSystem } from '../src/constants/units';

type LengthUnit = 'cm' | 'in';

// ---------------------------------------------------------------------------
// Trend chart — mirrors BodyweightChart's SVG polyline pattern (kept local so
// this screen owns its rendering; BodyweightChart itself is out of scope here).
// ---------------------------------------------------------------------------

function TrendChart({
  values,
  unitLabel,
  width = 320,
  height = 120,
}: {
  values: number[];
  unitLabel: string;
  width?: number;
  height?: number;
}): React.ReactElement | null {
  const { theme } = useTheme();
  if (values.length === 0) return null;

  const pad = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.1);
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - min) / span);
  const points = values.map((v, i) => `${pad + i * stepX},${y(v)}`).join(' ');
  const last = values[values.length - 1]!;

  return (
    <View
      style={[
        chartStyles.card,
        { backgroundColor: theme.colors.bgSecondary, borderColor: theme.colors.borderDefault },
      ]}
    >
      <View style={chartStyles.headerRow}>
        <Text style={[chartStyles.kicker, { color: theme.colors.textTertiary }]}>TREND</Text>
        <Text style={[chartStyles.latest, { color: theme.colors.textPrimary }]}>
          {last.toFixed(1)} {unitLabel}
        </Text>
      </View>
      <Svg width={width} height={height}>
        <Line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke={theme.colors.borderDefault} strokeWidth={1} />
        {values.length > 1 ? (
          <Polyline points={points} fill="none" stroke={theme.colors.accentDefault} strokeWidth={2} />
        ) : null}
        {values.map((v, i) => (
          <Circle key={i} cx={pad + i * stepX} cy={y(v)} r={3} fill={theme.colors.accentDefault} />
        ))}
      </Svg>
      <Text style={[chartStyles.range, { color: theme.colors.textTertiary }]}>
        {values.length} entr{values.length !== 1 ? 'ies' : 'y'} · low {min.toFixed(1)} · high {max.toFixed(1)} {unitLabel}
      </Text>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.s4, marginTop: spacing.s3 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.s2 },
  kicker: { fontSize: fontSize.micro, fontWeight: fontWeight.semibold, letterSpacing: 1.2 },
  latest: { fontSize: fontSize.bodyMd, fontWeight: fontWeight.bold },
  range: { fontSize: fontSize.caption, marginTop: spacing.s1 },
});

// ---------------------------------------------------------------------------
// Metric picker shelf
// ---------------------------------------------------------------------------

function MetricChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.colors.accentDefault : theme.colors.borderDefault,
          backgroundColor: selected ? theme.colors.accentDefault + '1A' : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: selected ? theme.colors.accentDefault : theme.colors.textSecondary }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MeasurementsScreen(): React.ReactElement {
  const { theme } = useTheme();
  const { user } = useAuth();
  // The LENGTH unit defaults to cm for metric users, in for lbs (weight) users
  // — a reasonable default; there is no separate server-side length pref field,
  // so this stays a local UI toggle (persists for the session only).
  const initialLengthUnit: LengthUnit = (user?.unit_pref as UnitSystem) === 'lbs' ? 'in' : 'cm';
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>(initialLengthUnit);

  const [loggedKeys, setLoggedKeys] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>(PRESET_METRICS[0]!.key);
  const [customMetric, setCustomMetric] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const [history, setHistory] = useState<MeasurementEntry[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);

  const { latest: bodyweightLatest } = useBodyweight();

  const metricKind = isPresetMetric(selectedMetric)
    ? PRESET_METRICS.find((m) => m.key === selectedMetric)!.kind
    : 'length';
  const isPercent = metricKind === 'percent';

  // Load which custom metrics already have entries (so the shelf shows them too).
  useEffect(() => {
    let cancelled = false;
    getLoggedMetricKeys(user)
      .then((keys) => { if (!cancelled) setLoggedKeys(keys); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const customLoggedKeys = useMemo(
    () => loggedKeys.filter((k) => !isPresetMetric(k)),
    [loggedKeys],
  );

  const reload = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [hist, latest] = await Promise.all([
        getMeasurementHistory(user, selectedMetric),
        getLatestMeasurement(user, selectedMetric),
      ]);
      setHistory(hist);
      // Prefill with the last logged value, converted to the display unit.
      if (latest) {
        setInputValue(
          isPercent ? String(latest.value) : cmToInputValue(latest.value, lengthUnit),
        );
      } else {
        setInputValue('');
      }
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [user, selectedMetric, lengthUnit, isPercent]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = useCallback(async () => {
    if (isPercent) {
      const pct = parseFloat(inputValue.trim());
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
      setSaving(true);
      await logMeasurement(user, selectedMetric, pct, 'pct');
      setSaving(false);
    } else {
      const parsed = parseLengthInput(inputValue);
      if (parsed == null) return;
      const valueCm = displayToCm(parsed, lengthUnit);
      setSaving(true);
      await logMeasurement(user, selectedMetric, valueCm, lengthUnit);
      setSaving(false);
    }
    await reload();
    setLoggedKeys((prev) => (prev.includes(selectedMetric) ? prev : [...prev, selectedMetric]));
  }, [user, selectedMetric, inputValue, lengthUnit, isPercent, reload]);

  const handleAddCustom = useCallback(() => {
    const key = customMetric.trim().toLowerCase().replace(/\s+/g, '_');
    if (!key) return;
    setSelectedMetric(key);
    setCustomMetric('');
    setShowCustomInput(false);
  }, [customMetric]);

  const chartValues = useMemo(() => {
    if (isPercent) return history.map((h) => h.value);
    return history.map((h) => (lengthUnit === 'in' ? h.value / 2.54 : h.value));
  }, [history, isPercent, lengthUnit]);

  const unitLabel = isPercent ? '%' : lengthUnit;

  return (
    <ScreenLayout scrollable contentStyle={styles.content}>
      <>
        <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>
          Track waist, chest, arms, and more over time — free, local, and private.
        </Text>

        {/* ── Bodyweight reference row (reads the canonical weekly table) ── */}
        {bodyweightLatest ? (
          <View style={[styles.bwRow, { borderColor: theme.colors.borderDefault, backgroundColor: theme.colors.bgSecondary }]}>
            <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary }}>Bodyweight (weekly)</Text>
            <Text style={{ fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: theme.colors.textPrimary }}>
              {formatWeight(bodyweightLatest.weight_kg, (user?.unit_pref as UnitSystem) ?? 'kg', 1)}
            </Text>
          </View>
        ) : null}

        {/* ── Length unit toggle ── */}
        <View style={styles.unitToggleRow}>
          {(['cm', 'in'] as LengthUnit[]).map((u) => (
            <TouchableOpacity
              key={u}
              onPress={() => setLengthUnit(u)}
              style={[
                styles.unitBtn,
                {
                  borderColor: lengthUnit === u ? theme.colors.accentDefault : theme.colors.borderDefault,
                  backgroundColor: lengthUnit === u ? theme.colors.bgSecondary : 'transparent',
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: lengthUnit === u }}
            >
              <Text style={{ fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: lengthUnit === u ? theme.colors.accentDefault : theme.colors.textSecondary }}>
                {u.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Metric picker shelf ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelf} contentContainerStyle={styles.shelfContent}>
          {PRESET_METRICS.map((m) => (
            <MetricChip key={m.key} label={m.label} selected={selectedMetric === m.key} onPress={() => setSelectedMetric(m.key)} />
          ))}
          {customLoggedKeys.map((k) => (
            <MetricChip key={k} label={metricLabel(k)} selected={selectedMetric === k} onPress={() => setSelectedMetric(k)} />
          ))}
          <MetricChip label="+ Custom" selected={showCustomInput} onPress={() => setShowCustomInput((s) => !s)} />
        </ScrollView>

        {showCustomInput ? (
          <View style={styles.customRow}>
            <TextInput
              style={[styles.customInput, { borderColor: theme.colors.borderDefault, color: theme.colors.textPrimary }]}
              value={customMetric}
              onChangeText={setCustomMetric}
              placeholder="e.g. left forearm"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel="Custom metric name"
            />
            <PFButton variant="primary" label="Add" onPress={handleAddCustom} />
          </View>
        ) : null}

        {/* ── Numeric entry ── */}
        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.colors.textTertiary }]}>
              {metricLabel(selectedMetric).toUpperCase()} ({unitLabel.toUpperCase()})
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.bgSecondary,
                  borderColor: theme.colors.borderDefault,
                  color: theme.colors.textPrimary,
                },
              ]}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel={`${metricLabel(selectedMetric)} value`}
            />
          </View>
          <PFButton
            variant="primary"
            label={saving ? 'Saving…' : 'Save'}
            onPress={handleSave}
            disabled={saving || inputValue.trim() === ''}
            style={{ marginTop: spacing.s5 }}
          />
        </View>

        {/* ── Trend chart ── */}
        {loadingHistory ? null : chartValues.length > 0 ? (
          <TrendChart values={chartValues} unitLabel={unitLabel} />
        ) : (
          <Text style={[styles.note, { color: theme.colors.textTertiary }]}>
            No entries yet for {metricLabel(selectedMetric)}. Log one above to start a trend.
          </Text>
        )}
      </>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.s8 },
  sub: { fontSize: fontSize.bodySm, marginBottom: spacing.s3 },
  bwRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s3,
  },
  unitToggleRow: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s3 },
  unitBtn: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  shelf: { marginBottom: spacing.s2 },
  shelfContent: { gap: spacing.s2, paddingRight: spacing.s4 },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  customRow: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s3, alignItems: 'center' },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    fontSize: fontSize.bodyMd,
  },
  inputRow: { flexDirection: 'row', gap: spacing.s3, marginBottom: spacing.s3, alignItems: 'flex-start' },
  inputGroup: { flex: 1 },
  inputLabel: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: spacing.s1,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    fontSize: fontSize.bodyLg,
  },
  note: { fontSize: fontSize.caption, marginTop: spacing.s3 },
});
