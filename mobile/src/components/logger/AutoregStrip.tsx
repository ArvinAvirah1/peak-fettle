/**
 * AutoregStrip.tsx — TICKET-141 in-session autoregulation suggestion strip.
 * =============================================================================
 * Presentational + callback-driven (mirrors DropChainBar.tsx): the parent
 * (StepperLogger) owns computing the suggestion (via the FROZEN rule module,
 * lib/trainingEngine/v2/autoregulation.ts + data/autoregHistory.ts) and all
 * dismiss/mute state; this component only renders one suggestion and calls back.
 *
 * The copy IS the feature (founder spec): the "because" line is rendered
 * VERBATIM from the rule module's output — it already names the rule id and
 * respects the RIR/RPE display setting (loggerLogic.formatEffort). This
 * component must never rewrite, summarize, or truncate that line, and must
 * never introduce the word "AI" anywhere (the rule module's own copy is
 * covered by its test; this component adds no new user-facing strings that
 * could violate the rule either).
 *
 * One-tap actions:
 *   • Apply  — prefills the weight input with the suggested load. The PARENT
 *     performs the actual prefill via kgToInputValue (CLAUDE.md §2 — weight
 *     I/O only through constants/units.ts); this component only reports the
 *     suggested_kg back via onApply so the caller can convert/prefill/focus.
 *   • Dismiss — hides the strip for the rest of THIS session only (session-
 *     local; not persisted — reappears next time this exercise is logged).
 *   • Mute this exercise — persists exercisePrefs.autoreg_muted so the strip
 *     never shows for this exercise again until unmuted in settings.
 *
 * Zero network, zero storage of its own — purely a render of the suggestion
 * object the parent computed on-device.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';
import { formatWeight, UnitSystem } from '../../constants/units';
import type { AutoregSuggestion } from '../../lib/trainingEngine/v2/autoregulation';
import { useTranslation } from 'react-i18next';
import { engineBecause } from '../../i18n/engine';

export interface AutoregStripProps {
  /** The computed suggestion for the CURRENT exercise, or null (renders nothing). */
  suggestion: AutoregSuggestion | null;
  unitPref: UnitSystem;
  /** Apply the suggested load: parent prefills the weight input via kgToInputValue. */
  onApply: (suggestedKg: number) => void;
  /** Hide the strip for the rest of THIS session (not persisted). */
  onDismiss: () => void;
  /** Mute the suggestion strip for this exercise going forward (persisted). */
  onMute: () => void;
}

/**
 * Renders nothing when `suggestion` is null — callers can mount this
 * unconditionally and let the null-check live here, same convenience as
 * DropChainBar's null-chain callers already use.
 */
export function AutoregStrip(props: AutoregStripProps): React.ReactElement | null {
  const { suggestion, unitPref, onApply, onDismiss, onMute } = props;
  const { theme, fontSize: fs, fontWeight: fw, spacing: sp, radius: r } = useTheme();
  const { t } = useTranslation();

  if (!suggestion) return null;

  const accent = theme.colors.accentDefault;
  const suggestedLabel = formatWeight(suggestion.suggested_kg, unitPref);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.bgElevated,
          borderColor: accent,
          borderRadius: r.md,
          padding: sp.s3,
        },
      ]}
      accessibilityLabel={t('logger:autoregStrip.a11ySuggestedLoad')}
    >
      <View style={styles.titleRow}>
        <Ionicons name="bulb-outline" size={16} color={accent} />
        <Text style={[styles.title, { color: accent, fontSize: fs.bodySm, fontWeight: fw.bold, marginLeft: sp.s2 }]}>
          {t('logger:autoregStrip.title')}
        </Text>
        <TouchableOpacity
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('logger:autoregStrip.dismissA11y')}
          style={styles.dismissBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <Text
        style={[styles.suggestedValue, { color: theme.colors.textPrimary, fontSize: fs.heading3, fontWeight: fw.bold }]}
        accessibilityLabel={t('logger:autoregStrip.suggestedA11y', { value: suggestedLabel })}
      >
        {suggestedLabel}
      </Text>

      {/* The "because" line — translated via engineBecause; EN copy is the guaranteed fallback (founder spec: never rewritten/summarized). */}
      <Text style={[styles.becauseText, { color: theme.colors.textSecondary, fontSize: fs.bodySm }]}>
        {engineBecause(suggestion)}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.applyBtn, { backgroundColor: accent, borderRadius: r.md }]}
          onPress={() => onApply(suggestion.suggested_kg)}
          accessibilityRole="button"
          accessibilityLabel={t('logger:autoregStrip.applyA11y', { value: suggestedLabel })}
        >
          <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fw.bold }}>
            {t('logger:autoregStrip.applyLabel', { value: suggestedLabel })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.muteBtn, { borderColor: theme.colors.borderDefault, borderRadius: r.md }]}
          onPress={onMute}
          accessibilityRole="button"
          accessibilityLabel={t('logger:autoregStrip.muteA11y')}
        >
          <Text style={{ color: theme.colors.textSecondary, fontSize: fs.bodySm, fontWeight: fw.medium }}>
            {t('logger:autoregStrip.muteLabel')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: 1,
    marginTop: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: { letterSpacing: 0.5, flex: 1 },
  dismissBtn: {
    paddingHorizontal: 2,
  },
  suggestedValue: {
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  becauseText: {
    marginBottom: 10,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  muteBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
});

export default AutoregStrip;
