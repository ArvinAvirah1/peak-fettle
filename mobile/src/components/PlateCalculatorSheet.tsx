/**
 * PlateCalculatorSheet — plate / machine load calculator (founder spec 2026-06-10).
 *
 * Two modes, persisted per exercise (exercise_prefs):
 *   • Barbell — target total + bar weight → plates PER SIDE (greedy, standard
 *     plate set per unit pref). Bar weight defaults to the last-used value for
 *     this exercise (or 20 kg / 45 lb).
 *   • Machine / cable — the MACHINE weight is entered first (pre-filled from
 *     the previous machine weight for this exercise), plus a pulley
 *     configuration (1:1 / 2:1 / 1:2). The sheet shows the EFFECTIVE load and
 *     "Use" logs that effective weight, so the strength metrics stay correct
 *     when switching gyms onto a different pulley setup.
 *
 * Dark-styled to sit over the stepper (stepperPalette).
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { stepperPalette, spacing, radius, fontSize, fontWeight } from '../theme/tokens';
import {
  plateBreakdown,
  effectiveLoad,
  pulleyById,
  PULLEY_OPTIONS,
  KG_PLATES,
  LB_PLATES,
  DEFAULT_BAR_KG,
  DEFAULT_BAR_LB,
} from '../lib/plateMath';
import { getExercisePrefs, setExercisePrefs } from '../data/exercisePrefs';
import { kgToLbs, displayToKg, UnitSystem } from '../constants/units';

type Mode = 'barbell' | 'machine';

interface Props {
  visible: boolean;
  onClose: () => void;
  exerciseId: string;
  unitPref: UnitSystem;
  /** Current weight input from the stepper (display units), used as the initial target. */
  initialTarget?: string;
  /** Fill the stepper's weight input with this display-unit value. */
  onUseWeight: (displayWeight: number) => void;
}

export default function PlateCalculatorSheet({
  visible,
  onClose,
  exerciseId,
  unitPref,
  initialTarget,
  onUseWeight,
}: Props): React.ReactElement {
  const isLbs = unitPref === 'lbs';
  const defaultBar = isLbs ? DEFAULT_BAR_LB : DEFAULT_BAR_KG;
  const plates = isLbs ? LB_PLATES : KG_PLATES;
  const unitLabel = isLbs ? 'lb' : 'kg';

  const [mode, setMode] = useState<Mode>('barbell');
  const [target, setTarget] = useState('');
  const [baseWeight, setBaseWeight] = useState(String(defaultBar));
  const [pulleyId, setPulleyId] = useState('1:1');

  // Load per-exercise defaults when opened (machine weight pulled from the
  // previous machine weight by default — founder spec).
  useEffect(() => {
    if (!visible || !exerciseId) return;
    setTarget(initialTarget?.trim() ? initialTarget.trim() : '');
    getExercisePrefs(exerciseId)
      .then((p) => {
        if (p.pulley_id != null) {
          setMode('machine');
          setPulleyId(p.pulley_id || '1:1');
        } else {
          setMode('barbell');
        }
        if (p.base_weight_kg != null && p.base_weight_kg > 0) {
          const disp = isLbs ? kgToLbs(p.base_weight_kg) : p.base_weight_kg;
          setBaseWeight(String(Math.round(disp * 100) / 100));
        } else {
          setBaseWeight(String(defaultBar));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, exerciseId]);

  const targetNum = parseFloat(target) || 0;
  const baseNum = parseFloat(baseWeight) || 0;
  const pulley = pulleyById(pulleyId);

  const breakdown =
    mode === 'barbell' && targetNum > 0 ? plateBreakdown(targetNum, baseNum, plates) : null;
  const effective = mode === 'machine' ? effectiveLoad(baseNum, pulley.factor) : 0;

  const persistPrefs = () => {
    if (!exerciseId) return;
    setExercisePrefs(exerciseId, {
      base_weight_kg: baseNum > 0 ? displayToKg(baseNum, unitPref) : null,
      pulley_id: mode === 'machine' ? pulleyId : null,
    }).catch(() => {});
  };

  const handleUse = (displayWeight: number) => {
    persistPrefs();
    onUseWeight(Math.round(displayWeight * 100) / 100);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Load calculator</Text>

          {/* Mode toggle */}
          <View style={styles.modeRow}>
            {(['barbell', 'machine'] as Mode[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => setMode(m)}
                accessibilityRole="button"
                accessibilityLabel={m === 'barbell' ? 'Barbell mode' : 'Machine or cable mode'}
              >
                <Text style={[styles.modeLabel, mode === m && styles.modeLabelActive]}>
                  {m === 'barbell' ? 'Barbell' : 'Machine / cable'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'barbell' ? (
            <>
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>TARGET TOTAL ({unitLabel.toUpperCase()})</Text>
                  <TextInput
                    style={styles.input}
                    value={target}
                    onChangeText={setTarget}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={stepperPalette.muted}
                    selectTextOnFocus
                    accessibilityLabel="Target total weight"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>BAR ({unitLabel.toUpperCase()})</Text>
                  <TextInput
                    style={styles.input}
                    value={baseWeight}
                    onChangeText={setBaseWeight}
                    keyboardType="decimal-pad"
                    placeholder={String(defaultBar)}
                    placeholderTextColor={stepperPalette.muted}
                    selectTextOnFocus
                    accessibilityLabel="Bar weight"
                  />
                </View>
              </View>

              {breakdown && !breakdown.belowBar ? (
                <View style={styles.resultCard}>
                  <Text style={styles.resultLabel}>PER SIDE</Text>
                  {breakdown.perSide.length === 0 ? (
                    <Text style={styles.resultBig}>Empty bar</Text>
                  ) : (
                    <Text style={styles.resultBig}>
                      {breakdown.perSide.map((p) => `${p.plate}×${p.count}`).join('  ·  ')}
                    </Text>
                  )}
                  <Text style={styles.resultSub}>
                    Loads {breakdown.achievedTotal} {unitLabel}
                    {breakdown.residual !== 0
                      ? ` (${breakdown.residual > 0 ? '−' : '+'}${Math.abs(breakdown.residual)} ${unitLabel} vs target)`
                      : ' — exact'}
                  </Text>
                  <TouchableOpacity
                    style={styles.useBtn}
                    onPress={() => handleUse(breakdown.achievedTotal)}
                    accessibilityRole="button"
                    accessibilityLabel="Use this weight"
                  >
                    <Text style={styles.useBtnLabel}>
                      Use {breakdown.achievedTotal} {unitLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : breakdown && breakdown.belowBar ? (
                <Text style={styles.hint}>Target is below the bar weight.</Text>
              ) : (
                <Text style={styles.hint}>Enter a target weight to see the plates.</Text>
              )}
            </>
          ) : (
            <>
              <View style={styles.inputRow}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>MACHINE WEIGHT ({unitLabel.toUpperCase()})</Text>
                  <TextInput
                    style={styles.input}
                    value={baseWeight}
                    onChangeText={setBaseWeight}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={stepperPalette.muted}
                    selectTextOnFocus
                    accessibilityLabel="Machine stack weight"
                  />
                </View>
              </View>
              <Text style={styles.inputLabel}>PULLEY CONFIGURATION</Text>
              <View style={styles.pulleyRow}>
                {PULLEY_OPTIONS.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.pulleyBtn, pulleyId === p.id && styles.modeBtnActive]}
                    onPress={() => setPulleyId(p.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Pulley ${p.label}`}
                  >
                    <Text style={[styles.modeLabel, pulleyId === p.id && styles.modeLabelActive]}>
                      {p.id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.pulleyHint}>{pulley.label}</Text>

              {baseNum > 0 ? (
                <View style={styles.resultCard}>
                  <Text style={styles.resultLabel}>EFFECTIVE LOAD</Text>
                  <Text style={styles.resultBig}>
                    {effective} {unitLabel}
                  </Text>
                  <Text style={styles.resultSub}>
                    {pulley.factor === 1
                      ? 'Direct drive — stack weight is the real load.'
                      : `Stack ${baseNum} ${unitLabel} × ${pulley.factor} — log the effective load so your strength stats stay accurate.`}
                  </Text>
                  <TouchableOpacity
                    style={styles.useBtn}
                    onPress={() => handleUse(effective)}
                    accessibilityRole="button"
                    accessibilityLabel="Use effective weight"
                  >
                    <Text style={styles.useBtnLabel}>
                      Use {effective} {unitLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.hint}>
                  Enter the machine weight first — it&apos;s remembered for this exercise.
                </Text>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: stepperPalette.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s8,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: stepperPalette.line,
    marginBottom: spacing.s4,
  },
  title: {
    color: stepperPalette.text,
    fontSize: fontSize.bodyLg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.s4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginBottom: spacing.s4,
  },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    alignItems: 'center',
  },
  modeBtnActive: {
    borderColor: stepperPalette.accentLine,
    backgroundColor: stepperPalette.accentSurface,
  },
  modeLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
  },
  modeLabelActive: {
    color: stepperPalette.accent,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  inputGroup: { flex: 1 },
  inputLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: spacing.s1,
  },
  input: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    color: stepperPalette.text,
    fontSize: fontSize.bodyLg,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
  },
  pulleyRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginBottom: spacing.s1,
  },
  pulleyBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    paddingVertical: spacing.s2,
    alignItems: 'center',
  },
  pulleyHint: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
    marginBottom: spacing.s3,
  },
  resultCard: {
    backgroundColor: stepperPalette.frame,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    borderRadius: radius.md,
    padding: spacing.s4,
    marginTop: spacing.s2,
  },
  resultLabel: {
    color: stepperPalette.muted,
    fontSize: fontSize.micro,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    marginBottom: spacing.s1,
  },
  resultBig: {
    color: stepperPalette.text,
    fontSize: fontSize.heading3,
    fontWeight: fontWeight.bold,
  },
  resultSub: {
    color: stepperPalette.muted,
    fontSize: fontSize.caption,
    marginTop: spacing.s1,
  },
  useBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    marginTop: spacing.s3,
  },
  useBtnLabel: {
    color: stepperPalette.accentInk,
    fontSize: fontSize.bodyMd,
    fontWeight: fontWeight.bold,
  },
  hint: {
    color: stepperPalette.muted,
    fontSize: fontSize.bodySm,
    marginTop: spacing.s2,
  },
});
