/**
 * DropsetConfigSheet.tsx — S2 routine-editor "Make dropsets" configuration sheet.
 * =============================================================================
 * Opened from an exercise row's kebab menu in RoutineEditorSheet. Lets the user
 * pick WHICH sets are dropset sets — "Last set only" / "Last 2 sets" / "All sets"
 * — plus an OPTIONAL "Advanced" disclosure for drops-per-chain (1-3, default 2)
 * and weight drop % (10-30, default 20). Saving stores a `dropset` config on the
 * exercise; "Remove dropsets" clears it (only shown when already configured).
 *
 * Presentational + callback-driven - the editor owns the exercises[] state; this
 * sheet only reads the current config and calls back with the new one. Mirrors
 * the RoutineEditorSheet dark/teal token styling (stepperPalette).
 *
 * SAFE-AREA (CLAUDE.md #3): insets do NOT propagate inside a RN <Modal>, so the
 * bottom home-indicator inset is applied DIRECTLY to the bottom-anchored sheet
 * and the header row gets a min top pad for the grab handle.
 * =============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../Icon';
import { stepperPalette, fontFamily, fontSize, spacing, radius } from '../../theme/tokens';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

/** The persisted dropset config shape (matches RoutineExercise.dropset). */
export interface DropsetConfig {
  last_n: number | 'all';
  drops?: number;
  drop_pct?: number;
}

export interface DropsetConfigSheetProps {
  visible: boolean;
  /** Display name of the exercise being configured (header subtitle). */
  exerciseName: string;
  /** The current config, or null when not yet configured. */
  value: DropsetConfig | null;
  /** Save the new config. */
  onSave: (config: DropsetConfig) => void;
  /** Remove dropsets from this exercise (only meaningful when already set). */
  onRemove: () => void;
  /** Dismiss without changing. */
  onClose: () => void;
}

const DROPS_MIN = 1;
const DROPS_MAX = 3;
const DROPS_DEFAULT = 2;
const PCT_MIN = 10;
const PCT_MAX = 30;
const PCT_DEFAULT = 20;

type LastNChoice = 1 | 2 | 'all';

/** Pure lookup called only from this file's own render — takes `t` per the
 * render-site translation rule. */
function choiceLabel(key: LastNChoice, t: TFunction): string {
  if (key === 1) return t('components:dropsetConfigSheet.choice.lastSetOnly');
  if (key === 2) return t('components:dropsetConfigSheet.choice.last2Sets');
  return t('components:dropsetConfigSheet.choice.allSets');
}

const CHOICE_KEYS: LastNChoice[] = [1, 2, 'all'];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function DropsetConfigSheet(props: DropsetConfigSheetProps): React.ReactElement {
  const { visible, exerciseName, value, onSave, onRemove, onClose } = props;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [lastN, setLastN] = useState<LastNChoice>('all');
  const [drops, setDrops] = useState<number>(DROPS_DEFAULT);
  const [pct, setPct] = useState<number>(PCT_DEFAULT);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Re-seed from the current value whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    if (value) {
      // Map a persisted last_n back onto the three choices (2+ collapses to "2").
      const ln: LastNChoice = value.last_n === 'all' ? 'all' : value.last_n <= 1 ? 1 : 2;
      setLastN(ln);
      setDrops(typeof value.drops === 'number' ? clamp(value.drops, DROPS_MIN, DROPS_MAX) : DROPS_DEFAULT);
      setPct(typeof value.drop_pct === 'number' ? clamp(value.drop_pct, PCT_MIN, PCT_MAX) : PCT_DEFAULT);
      setAdvancedOpen(
        (typeof value.drops === 'number' && value.drops !== DROPS_DEFAULT) ||
          (typeof value.drop_pct === 'number' && value.drop_pct !== PCT_DEFAULT),
      );
    } else {
      setLastN('all');
      setDrops(DROPS_DEFAULT);
      setPct(PCT_DEFAULT);
      setAdvancedOpen(false);
    }
  }, [visible, value]);

  const handleSave = () => {
    onSave({ last_n: lastN, drops, drop_pct: pct });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('components:dropsetConfigSheet.dismissAccessibilityLabel')}
      />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.s4) + spacing.s2 }]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Ionicons name="trending-down" size={20} color={stepperPalette.accent} />
          <Text style={styles.title}>{t('components:dropsetConfigSheet.title')}</Text>
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {exerciseName}
        </Text>

        {/* Which sets are dropsets */}
        <Text style={styles.sectionLabel}>{t('components:dropsetConfigSheet.whichSets')}</Text>
        <View style={styles.choiceRow}>
          {CHOICE_KEYS.map((key) => {
            const on = lastN === key;
            const label = choiceLabel(key, t);
            return (
              <TouchableOpacity
                key={String(key)}
                style={[styles.choice, on && styles.choiceOn]}
                onPress={() => setLastN(key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
              >
                <Text style={[styles.choiceText, on && styles.choiceTextOn]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Advanced disclosure */}
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setAdvancedOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={advancedOpen ? t('components:dropsetConfigSheet.hideAdvanced') : t('components:dropsetConfigSheet.showAdvanced')}
        >
          <Ionicons
            name={advancedOpen ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={stepperPalette.muted}
          />
          <Text style={styles.advancedLabel}>{t('components:dropsetConfigSheet.advanced')}</Text>
        </TouchableOpacity>

        {advancedOpen ? (
          <View style={styles.advancedBody}>
            <StepperControl
              label={t('components:dropsetConfigSheet.dropsPerSet')}
              value={drops}
              min={DROPS_MIN}
              max={DROPS_MAX}
              suffix=""
              onChange={setDrops}
            />
            <StepperControl
              label={t('components:dropsetConfigSheet.weightDrop')}
              value={pct}
              min={PCT_MIN}
              max={PCT_MAX}
              step={5}
              suffix="%"
              onChange={setPct}
            />
          </View>
        ) : null}

        {/* Save */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel={t('components:dropsetConfigSheet.saveAccessibilityLabel')}
        >
          <Text style={styles.saveLabel}>{value ? t('components:dropsetConfigSheet.updateDropsets') : t('components:dropsetConfigSheet.addDropsets')}</Text>
        </TouchableOpacity>

        {value ? (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={t('components:dropsetConfigSheet.removeDropsets')}
          >
            <Text style={styles.removeLabel}>{t('components:dropsetConfigSheet.removeDropsets')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common:cancel')}
          >
            <Text style={styles.cancelLabel}>{t('common:cancel')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// -- Small +/- stepper --------------------------------------------------------

function StepperControl(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
}): React.ReactElement {
  const { label, value, min, max, step = 1, suffix = '', onChange } = props;
  const { t } = useTranslation();
  const dec = () => onChange(clamp(value - step, min, max));
  const inc = () => onChange(clamp(value + step, min, max));
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
          onPress={dec}
          disabled={value <= min}
          accessibilityRole="button"
          accessibilityLabel={t('components:dropsetConfigSheet.decreaseAccessibilityLabel', { label })}
        >
          <Ionicons name="remove" size={18} color={stepperPalette.text} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>
          {value}
          {suffix}
        </Text>
        <TouchableOpacity
          style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
          onPress={inc}
          disabled={value >= max}
          accessibilityRole="button"
          accessibilityLabel={t('components:dropsetConfigSheet.increaseAccessibilityLabel', { label })}
        >
          <Ionicons name="add" size={18} color={stepperPalette.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: stepperPalette.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.s5,
    paddingTop: spacing.s3,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: stepperPalette.line,
    marginBottom: spacing.s3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.bodyLg, color: stepperPalette.text },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    marginTop: spacing.s1,
    marginBottom: spacing.s4,
  },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    color: stepperPalette.muted,
    letterSpacing: 0.8,
    marginBottom: spacing.s2,
  },
  choiceRow: { flexDirection: 'row', gap: spacing.s2, marginBottom: spacing.s4 },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    backgroundColor: stepperPalette.frame,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  choiceOn: { borderColor: stepperPalette.accentLine, backgroundColor: stepperPalette.accentSurface },
  choiceText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodySm,
    color: stepperPalette.muted,
    textAlign: 'center',
  },
  choiceTextOn: { color: stepperPalette.accent },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    paddingVertical: spacing.s2,
    marginBottom: spacing.s1,
  },
  advancedLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.bodySm, color: stepperPalette.muted },
  advancedBody: {
    borderTopWidth: 1,
    borderTopColor: stepperPalette.line,
    paddingTop: spacing.s2,
    marginBottom: spacing.s2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.s2,
  },
  stepperLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.bodyMd, color: stepperPalette.text },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: stepperPalette.line,
    backgroundColor: stepperPalette.frame,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: { opacity: 0.3 },
  stepperValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.bodyMd,
    color: stepperPalette.text,
    minWidth: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  saveBtn: {
    backgroundColor: stepperPalette.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.s3,
  },
  saveLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.bodyMd, color: stepperPalette.accentInk },
  removeBtn: { paddingVertical: spacing.s3, alignItems: 'center', marginTop: spacing.s2 },
  removeLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.bodySm, color: '#f87171' },
  cancelBtn: { paddingVertical: spacing.s3, alignItems: 'center', marginTop: spacing.s2 },
  cancelLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.bodySm, color: stepperPalette.muted },
});

export default DropsetConfigSheet;
