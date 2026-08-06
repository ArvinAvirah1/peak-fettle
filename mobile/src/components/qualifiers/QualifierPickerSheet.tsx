/**
 * QualifierPickerSheet — pick a value for one qualifier axis.
 * =============================================================================
 * Opened from a chip in the logger (or the routine editor). Shows every value
 * that applies to this exercise as a card with its explainer graphic, plus
 * "add your own" on axes where the list genuinely cannot be exhaustive.
 *
 * ⚠️ MOUNTING — READ BEFORE MOVING THIS COMPONENT.
 * This renders a <Modal>. It is opened from inside the stepper's full-screen
 * Modal, so the CONSUMER MUST render it as a CHILD of that Modal, never as a
 * sibling: on iOS a Modal presented while another is presented is silently
 * dropped, and the button just does nothing. That exact bug has now shipped
 * twice in this repo (GL-1 2026-08-04, GL-2 2026-08-05 — the second because a
 * file header claimed the pattern was followed while the JSX did the opposite).
 * Verify the JSX, not the comment.
 *
 * THE `?` AFFORDANCE (founder request): "it should in subsequent operations
 * still be visible to the user after they type a ? in the submenu". Two ways in,
 * both landing on the same full-screen explainer:
 *   • the persistent `?` button in the sheet header, and
 *   • typing `?` into the add-your-own field.
 * Available on every axis, not just pulley configuration.
 *
 * SAFE AREA: insets do NOT propagate inside a RN <Modal> (CLAUDE.md §3), so the
 * bottom inset is applied directly here rather than via SafeAreaView.
 * =============================================================================
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { QualifierGraphic, hasGraphic } from './QualifierGraphic';
import {
  getAxis,
  valueLabelKey,
  valueDescKey,
  QUALIFIER_UNSPECIFIED,
  type QualifierAxis,
} from '../../constants/qualifiers';
import {
  listCustomValues,
  addCustomValue,
  customValueToken,
  MAX_LABEL_LEN,
  type CustomQualifierValue,
} from '../../data/customQualifiers';

export interface QualifierPickerSheetProps {
  visible: boolean;
  /** Axis being chosen. */
  axisId: string;
  /** Values that apply to THIS exercise (from exerciseQualifierMap). */
  applicableValues: readonly string[];
  /** Currently selected value id, or a `custom:<id>` token. */
  selectedValue?: string | null;
  /** Whether this exercise's axis accepts user-authored options. */
  allowsCustom?: boolean;
  /** Scopes a new custom option to one exercise. Null = offer it everywhere. */
  exerciseId?: string | null;
  /** Exercise name, for the sheet subtitle. */
  exerciseName?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function QualifierPickerSheet(props: QualifierPickerSheetProps): React.ReactElement | null {
  const {
    visible,
    axisId,
    applicableValues,
    selectedValue = null,
    allowsCustom = false,
    exerciseId = null,
    exerciseName,
    onSelect,
    onClose,
  } = props;

  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const axis: QualifierAxis | null = getAxis(axisId);

  const [customValues, setCustomValues] = useState<CustomQualifierValue[]>([]);
  const [draft, setDraft] = useState('');
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setDraft('');
      setExplainerOpen(false);
      return;
    }
    let alive = true;
    listCustomValues(axisId, exerciseId)
      .then((rows) => { if (alive) setCustomValues(rows); })
      .catch(() => {});
    return () => { alive = false; };
  }, [visible, axisId, exerciseId]);

  /**
   * Typing `?` opens the explainer instead of becoming an option name. Nobody
   * wants an attachment called "?", and the founder asked for exactly this
   * gesture — so we consume it rather than storing it.
   */
  const handleDraftChange = useCallback((text: string) => {
    if (text.trim() === '?') {
      setExplainerOpen(true);
      setDraft('');
      return;
    }
    setDraft(text.slice(0, MAX_LABEL_LEN));
  }, []);

  const handleAddCustom = useCallback(async () => {
    const label = draft.trim();
    if (label.length === 0 || saving) return;
    setSaving(true);
    try {
      const row = await addCustomValue(axisId, label, exerciseId);
      if (row) {
        setDraft('');
        onSelect(customValueToken(row.id));
      }
    } finally {
      setSaving(false);
    }
  }, [draft, saving, axisId, exerciseId, onSelect]);

  const shipped = useMemo(
    () => applicableValues.filter((v) => typeof v === 'string' && v.length > 0),
    [applicableValues],
  );

  if (!axis) return null;

  const axisLabel = t(axis.labelKey as never);

  function renderOption(value: string, label: string, desc: string | null, key: string) {
    // An absent value IS "not specified", so that card shows as selected when
    // nothing is set — the user can see the current state rather than inferring
    // it from an empty chip.
    const selected =
      value === QUALIFIER_UNSPECIFIED ? !selectedValue : selectedValue === value;
    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.card,
          {
            borderColor: selected ? theme.colors.accentDefault : theme.colors.borderDefault,
            backgroundColor: selected ? theme.colors.accentSecondary : theme.colors.bgTertiary,
            borderRadius: r.md,
          },
        ]}
        onPress={() => onSelect(value)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        {hasGraphic(axisId) && value !== QUALIFIER_UNSPECIFIED ? (
          <View style={styles.cardArt}>
            <QualifierGraphic axisId={axisId} valueId={value} size={104} />
          </View>
        ) : null}
        <Text
          style={{
            color: theme.colors.textPrimary,
            fontSize: fs.bodySm,
            fontWeight: selected ? fw.bold : fw.medium,
            textAlign: 'center',
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {desc ? (
          <Text
            style={{ color: theme.colors.textTertiary, fontSize: fs.caption, textAlign: 'center' }}
            numberOfLines={2}
          >
            {desc}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessibilityLabel={t('components:qualifierPicker.dismissA11y')}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.colors.bgElevated,
            borderTopLeftRadius: r.lg,
            borderTopRightRadius: r.lg,
            paddingHorizontal: sp.s5,
            paddingTop: sp.s3,
            // Home-indicator inset applied directly — it does not propagate in a Modal.
            paddingBottom: Math.max(insets.bottom, sp.s4) + sp.s2,
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: theme.colors.borderDefault }]} />

        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold }}>
              {axisLabel}
            </Text>
            {exerciseName ? (
              <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm }} numberOfLines={1}>
                {exerciseName}
              </Text>
            ) : null}
          </View>
          {/* Persistent way back to the graphics after the first choice. */}
          <TouchableOpacity
            onPress={() => setExplainerOpen(true)}
            style={[styles.helpBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.full ?? 999 }]}
            accessibilityRole="button"
            accessibilityLabel={t('components:qualifierPicker.explainA11y', { axis: axisLabel })}
          >
            <Text style={{ color: theme.colors.accentDefault, fontSize: fs.bodyMd, fontWeight: fw.bold }}>?</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
          <View style={styles.grid}>
            {/* "Not specified" comes FIRST and is not a stored value — choosing
                it removes the axis from the set, so it is indistinguishable from
                never having touched the chip. Present on every axis, because
                "I didn't note it" is an honest answer that the app should let
                you give rather than guessing a default on your behalf. */}
            {renderOption(
              QUALIFIER_UNSPECIFIED,
              t('components:qualifierPicker.notSpecified'),
              t('components:qualifierPicker.notSpecifiedDesc'),
              '__unspecified__',
            )}
            {shipped.map((v) =>
              renderOption(v, t(valueLabelKey(axisId, v) as never), t(valueDescKey(axisId, v) as never), v),
            )}
            {customValues.map((c) =>
              renderOption(customValueToken(c.id), c.label, t('components:qualifierPicker.yourOption'), c.id),
            )}
          </View>

          {allowsCustom ? (
            <View style={{ marginTop: sp.s3 }}>
              <Text style={{ color: theme.colors.textTertiary, fontSize: fs.caption, marginBottom: sp.s2 }}>
                {t('components:qualifierPicker.addYourOwn')}
              </Text>
              <View style={styles.addRow}>
                <TextInput
                  value={draft}
                  onChangeText={handleDraftChange}
                  placeholder={axis.customHintKey ? t(axis.customHintKey as never) : ''}
                  placeholderTextColor={theme.colors.textTertiary}
                  style={[
                    styles.input,
                    {
                      color: theme.colors.textPrimary,
                      borderColor: theme.colors.borderDefault,
                      borderRadius: r.md,
                      backgroundColor: theme.colors.bgTertiary,
                    },
                  ]}
                  maxLength={MAX_LABEL_LEN}
                  returnKeyType="done"
                  onSubmitEditing={() => { void handleAddCustom(); }}
                  accessibilityLabel={t('components:qualifierPicker.addYourOwn')}
                />
                <TouchableOpacity
                  onPress={() => { void handleAddCustom(); }}
                  disabled={draft.trim().length === 0 || saving}
                  style={[
                    styles.addBtn,
                    {
                      borderColor: theme.colors.accentDefault,
                      borderRadius: r.md,
                      opacity: draft.trim().length === 0 || saving ? 0.4 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('components:qualifierPicker.add')}
                >
                  <Text style={{ color: theme.colors.accentDefault, fontSize: fs.bodySm, fontWeight: fw.bold }}>
                    {t('components:qualifierPicker.add')}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: theme.colors.textTertiary, fontSize: fs.caption, marginTop: sp.s2 }}>
                {t('components:qualifierPicker.customNotRanked')}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <TouchableOpacity
          style={[styles.cancelBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md, marginTop: sp.s3 }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('components:qualifierPicker.close')}
        >
          <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodyMd }}>
            {t('components:qualifierPicker.close')}
          </Text>
        </TouchableOpacity>

        {/* Explainer — NESTED inside this sheet's own Modal, for the same reason
            this sheet must be nested inside the stepper's. */}
        <QualifierExplainer
          visible={explainerOpen}
          axisId={axisId}
          values={shipped}
          onClose={() => setExplainerOpen(false)}
        />
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The `?` overlay — every option drawn large, with its description.
// ---------------------------------------------------------------------------

function QualifierExplainer({
  visible,
  axisId,
  values,
  onClose,
}: {
  visible: boolean;
  axisId: string;
  values: readonly string[];
  onClose: () => void;
}): React.ReactElement | null {
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const axis = getAxis(axisId);
  if (!axis) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.colors.bgPrimary }}>
        {/* Dynamic Island: apply the top inset DIRECTLY to the header row — a
            SafeAreaView around or inside a Modal does not reliably do it. */}
        <View style={[styles.explainHeader, { paddingTop: Math.max(insets.top, 12), paddingHorizontal: sp.s5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyLg, fontWeight: fw.bold }}>
              {t(axis.labelKey as never)}
            </Text>
            <Text style={{ color: theme.colors.textTertiary, fontSize: fs.bodySm }}>
              {t(axis.descKey as never)}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.explainClose}
            accessibilityRole="button"
            accessibilityLabel={t('components:qualifierPicker.close')}
          >
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: sp.s5, paddingBottom: Math.max(insets.bottom, sp.s5) + sp.s5 }}>
          {values.map((v) => (
            <View
              key={v}
              style={[
                styles.explainRow,
                { borderColor: theme.colors.borderDefault, borderRadius: r.md, backgroundColor: theme.colors.bgSecondary },
              ]}
            >
              {hasGraphic(axisId) ? <QualifierGraphic axisId={axisId} valueId={v} size={132} /> : null}
              <View style={{ flex: 1, marginLeft: sp.s3 }}>
                <Text style={{ color: theme.colors.textPrimary, fontSize: fs.bodyMd, fontWeight: fw.bold }}>
                  {t(valueLabelKey(axisId, v) as never)}
                </Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, marginTop: 2 }}>
                  {t(valueDescKey(axisId, v) as never)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  helpBtn: {
    width: 32, height: 32, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: {
    width: '31%', minWidth: 96, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 6, gap: 4, alignItems: 'center',
  },
  cardArt: { width: '100%', alignItems: 'center' },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
  addBtn: {
    borderWidth: 1, paddingHorizontal: 16, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: { borderWidth: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  explainHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 12 },
  explainClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  explainRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 12, marginBottom: 10 },
});

export default QualifierPickerSheet;
