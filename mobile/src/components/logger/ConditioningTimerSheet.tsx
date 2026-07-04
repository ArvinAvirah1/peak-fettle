/**
 * ConditioningTimerSheet.tsx — TICKET-144 EMOM / AMRAP / interval timer sheet.
 * =============================================================================
 * Attachable to a cardio-type exercise from the logger's action bar. A
 * self-contained clock: pick a mode (EMOM / AMRAP / fixed intervals),
 * configure it, run it, then "Log set" hands the result back to the parent as
 * a normal cardio-kind set — `duration_sec` = elapsed time, and rounds (when
 * meaningful) are carried in the `metrics` extras bag (see
 * conditioningTimerLogic.ts's buildConditioningResult + this file's
 * `resultToCardioMetrics`), matching the existing metrics_json convention used
 * by drop/superset tags (server has no `sets.reps` column on cardio rows, so
 * "reps=rounds" lands in metrics_json.extras.rounds, not a real reps field).
 *
 * ZERO NETWORK — this sheet only computes locally and calls back to the
 * parent's existing onLogCardioSet (already local-first/tier-symmetric).
 *
 * PURE LOGIC lives in ./conditioningTimerLogic.ts (no Date.now/setInterval
 * there). This component is where the actual wall-clock ticking happens (one
 * setInterval + Date.now(), exactly like useRestTimer.ts's pattern), re-
 * deriving the phase from an absolute `startedAtMs` every tick so the display
 * is correct after a remount/backgrounding, never drifting.
 *
 * SAFE-AREA (CLAUDE.md §3): insets do NOT propagate inside a RN <Modal> — the
 * top inset is applied DIRECTLY to this sheet's header row
 * (paddingTop: Math.max(insets.top, 12)), and the bottom inset to the footer.
 * =============================================================================
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import {
  ConditioningConfig,
  ConditioningMode,
  ConditioningResult,
  amrapPhaseAt,
  buildConditioningResult,
  decrementRounds,
  emomPhaseAt,
  formatClock,
  incrementRounds,
  intervalPhaseAt,
  modeLabel,
  normalizeConfig,
  totalDurationSec,
} from './conditioningTimerLogic';
import type { CardioMetrics } from '../../data/cardioMetrics';

export interface ConditioningTimerSheetProps {
  visible: boolean;
  /** Display name of the cardio-type exercise this timer is attached to. */
  exerciseName: string;
  /**
   * Finish (or abandon) the run: `result` is ready to hand to onLogCardioSet
   * (durationSec) + resultToCardioMetrics(result, config) for the metrics bag.
   * The caller decides whether to actually log it (e.g. abandon-with-0-elapsed
   * could just close without logging).
   */
  onFinish: (result: ConditioningResult, config: ConditioningConfig) => void;
  onClose: () => void;
}

const DEFAULTS: Record<ConditioningMode, ConditioningConfig> = {
  emom: { mode: 'emom', rounds: 10, intervalSec: 60 },
  amrap: { mode: 'amrap', capSec: 600 },
  interval: { mode: 'interval', rounds: 8, workSec: 30, restSec: 15 },
};

/**
 * Tag a finished/abandoned conditioning run onto a CardioMetrics extras bag —
 * mirrors the drop/superset metrics_json precedent (spec §0.1 #4): an open,
 * device-only extension point, never a server schema change. `rounds` is
 * folded in only when non-null (AMRAP with no taps, or an aborted-at-0 run,
 * omit it rather than writing a misleading 0).
 */
export function resultToCardioMetrics(
  result: ConditioningResult,
  config: ConditioningConfig,
  base?: CardioMetrics,
): CardioMetrics {
  const extras: Record<string, number> = { ...(base?.extras ?? {}) };
  extras.conditioningMode = config.mode === 'emom' ? 1 : config.mode === 'amrap' ? 2 : 3;
  if (result.rounds != null) extras.conditioningRounds = result.rounds;
  return { ...(base ?? {}), extras };
}

export function ConditioningTimerSheet(props: ConditioningTimerSheetProps): React.ReactElement {
  const { visible, exerciseName, onFinish, onClose } = props;
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<ConditioningMode>('emom');
  const [config, setConfig] = useState<ConditioningConfig>(DEFAULTS.emom);
  const [running, setRunning] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(0);
  const [amrapRounds, setAmrapRounds] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset to a fresh, unstarted config whenever the sheet re-opens.
  useEffect(() => {
    if (!visible) return;
    setMode('emom');
    setConfig(DEFAULTS.emom);
    setRunning(false);
    setStartedAtMs(null);
    setNowMs(0);
    setAmrapRounds(0);
  }, [visible]);

  // Tick while running — the ONLY place Date.now()/setInterval appear; the
  // pure module only ever receives the derived elapsedMs.
  useEffect(() => {
    if (!running) {
      if (tickRef.current != null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    setNowMs(Date.now());
    tickRef.current = setInterval(() => setNowMs(Date.now()), 250);
    return () => {
      if (tickRef.current != null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [running]);

  const elapsedMs = running && startedAtMs != null ? Math.max(0, nowMs - startedAtMs) : 0;

  const changeMode = useCallback((m: ConditioningMode) => {
    if (running) return; // can't change mode mid-run — reset first
    setMode(m);
    setConfig(DEFAULTS[m]);
  }, [running]);

  const updateField = useCallback((patch: Partial<ConditioningConfig>) => {
    setConfig((prev) => normalizeConfig({ ...prev, ...patch } as ConditioningConfig));
  }, []);

  const start = useCallback(() => {
    setConfig((prev) => normalizeConfig(prev));
    setAmrapRounds(0);
    setStartedAtMs(Date.now());
    setNowMs(Date.now());
    setRunning(true);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setStartedAtMs(null);
    setNowMs(0);
    setAmrapRounds(0);
  }, []);

  // Phase for the currently-selected mode (only meaningful while running).
  const phase = useMemo(() => {
    if (!running) return null;
    if (config.mode === 'emom') return emomPhaseAt(config, elapsedMs);
    if (config.mode === 'amrap') return amrapPhaseAt(config, elapsedMs);
    return intervalPhaseAt(config, elapsedMs);
  }, [running, config, elapsedMs]);

  const planTotalSec = useMemo(() => totalDurationSec(config), [config]);

  // Auto-stop the clock once the plan completes (EMOM/interval only — AMRAP's
  // "done" just means the cap ran out, same handling: stop ticking, let the
  // user review/log).
  useEffect(() => {
    if (running && phase?.done) setRunning(false);
  }, [running, phase]);

  const finishOrAbandon = useCallback(() => {
    const result = buildConditioningResult(
      config,
      elapsedMs,
      config.mode === 'amrap' ? amrapRounds : undefined,
    );
    setRunning(false);
    onFinish(result, config);
  }, [config, elapsedMs, amrapRounds, onFinish]);

  const canStart = !running && startedAtMs == null;
  const hasResult = startedAtMs != null && !running && (phase?.done ?? elapsedMs > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
        onPress={running ? undefined : onClose}
        accessibilityLabel="Dismiss conditioning timer"
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.bgElevated,
            borderTopLeftRadius: r.lg,
            borderTopRightRadius: r.lg,
            paddingHorizontal: sp.s5,
            // CLAUDE.md §3: safe-area insets do not propagate inside a Modal —
            // apply directly to this header row / footer.
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, sp.s4) + sp.s2,
          },
        ]}
      >
        <View style={styles.handle} >
          <View style={[styles.handleBar, { backgroundColor: theme.colors.borderDefault }]} />
        </View>

        <View style={styles.headerRow}>
          <Ionicons name="stopwatch-outline" size={20} color={theme.colors.accentDefault} />
          <Text style={[styles.title, { color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold, marginLeft: sp.s2 }]}>
            Conditioning timer
          </Text>
        </View>
        <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: sp.s3 }} numberOfLines={1}>
          {exerciseName}
        </Text>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
          {/* Mode picker */}
          <View style={styles.modeRow}>
            {(['emom', 'amrap', 'interval'] as ConditioningMode[]).map((m) => {
              const on = mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => changeMode(m)}
                  disabled={running}
                  style={[
                    styles.modeChip,
                    {
                      borderColor: on ? theme.colors.accentDefault : theme.colors.borderDefault,
                      backgroundColor: on ? theme.colors.accentDefault : 'transparent',
                      borderRadius: r.md,
                      opacity: running && !on ? 0.4 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: running }}
                  accessibilityLabel={`${modeLabel(m)} mode`}
                >
                  <Text
                    style={{
                      color: on ? theme.components.buttonPrimaryText : theme.colors.textSecondary,
                      fontSize: fs.bodySm,
                      fontWeight: fw.bold,
                    }}
                  >
                    {modeLabel(m)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Config inputs — hidden once running to avoid mid-run edits. */}
          {!running && !hasResult ? (
            <View style={styles.configCard}>
              {config.mode === 'emom' ? (
                <View style={styles.configRow}>
                  <ConfigField
                    label="ROUNDS"
                    value={String(config.rounds)}
                    onChangeText={(t) => updateField({ rounds: parseInt(t, 10) || 0 } as Partial<ConditioningConfig>)}
                  />
                  <ConfigField
                    label="INTERVAL (SEC)"
                    value={String(config.intervalSec)}
                    onChangeText={(t) => updateField({ intervalSec: parseInt(t, 10) || 0 } as Partial<ConditioningConfig>)}
                  />
                </View>
              ) : null}
              {config.mode === 'amrap' ? (
                <View style={styles.configRow}>
                  <ConfigField
                    label="TIME CAP (SEC)"
                    value={String(config.capSec)}
                    onChangeText={(t) => updateField({ capSec: parseInt(t, 10) || 0 } as Partial<ConditioningConfig>)}
                  />
                </View>
              ) : null}
              {config.mode === 'interval' ? (
                <>
                  <View style={styles.configRow}>
                    <ConfigField
                      label="ROUNDS"
                      value={String(config.rounds)}
                      onChangeText={(t) => updateField({ rounds: parseInt(t, 10) || 0 } as Partial<ConditioningConfig>)}
                    />
                    <ConfigField
                      label="WORK (SEC)"
                      value={String(config.workSec)}
                      onChangeText={(t) => updateField({ workSec: parseInt(t, 10) || 0 } as Partial<ConditioningConfig>)}
                    />
                    <ConfigField
                      label="REST (SEC)"
                      value={String(config.restSec)}
                      onChangeText={(t) => updateField({ restSec: parseInt(t, 10) || 0 } as Partial<ConditioningConfig>)}
                    />
                  </View>
                </>
              ) : null}
              <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: sp.s2 }}>
                Planned total: {formatClock(planTotalSec)}
              </Text>
            </View>
          ) : null}

          {/* Live clock */}
          {running || hasResult ? (
            <View style={[styles.clockCard, { backgroundColor: theme.colors.bgTertiary, borderRadius: r.md }]}>
              {config.mode === 'emom' && phase && 'secLeftInRound' in phase ? (
                <>
                  <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm }}>
                    ROUND {phase.round} OF {(config as { rounds: number }).rounds}
                  </Text>
                  <Text style={[styles.bigClock, { color: theme.colors.textPrimary, fontWeight: fw.bold }]}>
                    {formatClock(phase.secLeftInRound)}
                  </Text>
                </>
              ) : null}
              {config.mode === 'amrap' && phase && 'secLeft' in phase ? (
                <>
                  <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm }}>TIME LEFT</Text>
                  <Text style={[styles.bigClock, { color: theme.colors.textPrimary, fontWeight: fw.bold }]}>
                    {formatClock(phase.secLeft)}
                  </Text>
                  <View style={styles.roundTapRow}>
                    <TouchableOpacity
                      onPress={() => setAmrapRounds((n) => decrementRounds(n))}
                      style={[styles.roundBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.sm ?? 6 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Remove one round"
                    >
                      <Ionicons name="remove" size={18} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold, marginHorizontal: sp.s3 }}>
                      {amrapRounds} rounds
                    </Text>
                    <TouchableOpacity
                      onPress={() => setAmrapRounds((n) => incrementRounds(n))}
                      style={[styles.roundBtn, { backgroundColor: theme.colors.accentDefault, borderRadius: r.sm ?? 6 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Add one round"
                    >
                      <Ionicons name="add" size={18} color={theme.components.buttonPrimaryText} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
              {config.mode === 'interval' && phase && 'phase' in phase ? (
                <>
                  <Text
                    style={{
                      color: phase.phase === 'work' ? theme.colors.statusSuccess : theme.colors.statusWarning,
                      fontSize: fs.bodySm,
                      fontWeight: fw.bold,
                    }}
                  >
                    {phase.phase === 'work' ? 'WORK' : 'REST'} · ROUND {phase.round} OF {(config as { rounds: number }).rounds}
                  </Text>
                  <Text style={[styles.bigClock, { color: theme.colors.textPrimary, fontWeight: fw.bold }]}>
                    {formatClock(phase.secLeftInPhase)}
                  </Text>
                </>
              ) : null}
              {hasResult && !running ? (
                <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginTop: sp.s2 }}>
                  {phase?.done ? 'Complete' : 'Stopped'} — {formatClock(Math.round(elapsedMs / 1000))} elapsed
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Footer actions */}
        <View style={{ marginTop: sp.s3 }}>
          {canStart ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.colors.accentDefault, borderRadius: r.md }]}
              onPress={start}
              accessibilityRole="button"
              accessibilityLabel={`Start ${modeLabel(mode)} timer`}
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fw.bold }}>
                Start {modeLabel(mode)}
              </Text>
            </TouchableOpacity>
          ) : running ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.colors.statusWarning, borderRadius: r.md }]}
              onPress={finishOrAbandon}
              accessibilityRole="button"
              accessibilityLabel="Stop and log this run"
            >
              <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fw.bold }}>
                Stop &amp; log
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: theme.colors.accentDefault, borderRadius: r.md }]}
                onPress={finishOrAbandon}
                accessibilityRole="button"
                accessibilityLabel="Log this result"
              >
                <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fw.bold }}>
                  Log set
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md, marginTop: sp.s2 }]}
                onPress={reset}
                accessibilityRole="button"
                accessibilityLabel="Reset and run again"
              >
                <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodyMd }}>Run again</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.cancelBtn, { marginTop: sp.s2 }]}
            onPress={onClose}
            disabled={running}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={{ color: running ? theme.colors.textTertiary : theme.colors.textTertiary, fontSize: fs.bodySm, opacity: running ? 0.4 : 1 }}>
              {running ? 'Stop the timer to close' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ConfigField(props: { label: string; value: string; onChangeText: (t: string) => void }): React.ReactElement {
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  return (
    <View style={{ flex: 1, marginRight: sp.s2 }}>
      <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm, marginBottom: 4 }}>{props.label}</Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: theme.colors.borderDefault,
          borderRadius: r.sm ?? 6,
          paddingVertical: 8,
          paddingHorizontal: 10,
          color: theme.colors.textPrimary,
          fontSize: fs.bodyMd,
          fontWeight: fw.medium,
        }}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType="number-pad"
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  handle: { alignItems: 'center', marginBottom: 12 },
  handleBar: { width: 36, height: 4, borderRadius: 999 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: {},
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  configCard: { marginBottom: 8 },
  configRow: { flexDirection: 'row', marginBottom: 8 },
  clockCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  bigClock: { fontSize: 48, fontVariant: ['tabular-nums'], marginTop: 4 },
  roundTapRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  roundBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ConditioningTimerSheet;
