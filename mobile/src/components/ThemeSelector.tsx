/**
 * ThemeSelector — 5-swatch theme picker component.
 * Phase E — E-002: Theme Switcher
 *
 * Used in:
 *   • Settings → Appearance (profile.tsx) — modal overlay
 *   • Onboarding Step 3 (onboarding.tsx) — inline
 *
 * Design spec §6.1 (Onboarding Step 3) + §6.8 (Settings):
 *   "5 theme discs (60 pt diameter circles) in a row, each with the theme
 *    name below. Active theme shows a checkmark. Selection applies
 *    immediately (live preview). Saved to Supabase on dismiss."
 *
 * The component calls useTheme().setTheme() which:
 *   1. Updates the ThemeContext immediately (live preview — no re-render flash)
 *   2. Persists to AsyncStorage (survives app restart)
 *   3. Fires the onThemeChange callback in _layout.tsx → PATCH /user/profile
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useTheme, THEMES, ThemeName } from '../theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Theme metadata for the swatches
// ---------------------------------------------------------------------------

const THEME_META: {
  name: ThemeName;
  displayName: string;
  accentHex: string;  // Raw hex for the swatch circle — this is the ONLY file allowed to hold hex
  bgHex: string;      // because it needs to render other themes' colors, not just the active one
}[] = [
  { name: 'deepOcean',  displayName: 'Deep Ocean', accentHex: '#00D4C8', bgHex: '#0A0E1A' },
  { name: 'ember',      displayName: 'Ember',       accentHex: '#FF6B35', bgHex: '#0D0A0A' },
  { name: 'forest',     displayName: 'Forest',      accentHex: '#22C55E', bgHex: '#050F07' },
  { name: 'midnight',   displayName: 'Midnight',    accentHex: '#8B5CF6', bgHex: '#07050F' },
  { name: 'monochrome', displayName: 'Mono',        accentHex: '#FFFFFF', bgHex: '#000000' },
];

// ---------------------------------------------------------------------------
// Single swatch
// ---------------------------------------------------------------------------

interface SwatchProps {
  meta: typeof THEME_META[number];
  isSelected: boolean;
  onPress: () => void;
}

function Swatch({ meta, isSelected, onPress }: SwatchProps): React.ReactElement {
  const { theme, fontSize } = useTheme();

  return (
    <TouchableOpacity
      style={styles.swatchContainer}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={`${meta.displayName} theme${isSelected ? ', selected' : ''}`}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
    >
      {/* Outer ring — shows when selected */}
      <View style={[
        styles.swatchRing,
        { borderColor: isSelected ? theme.colors.accentDefault : 'transparent' },
      ]}>
        {/* The disc itself — always uses the theme's own raw colors */}
        <View style={[styles.swatchDisc, { backgroundColor: meta.bgHex }]}>
          {/* Accent stripe across lower quarter */}
          <View style={[styles.swatchAccentStripe, { backgroundColor: meta.accentHex }]} />
          {/* Checkmark when selected */}
          {isSelected && (
            <View style={styles.checkmarkOverlay}>
              <Text style={{ fontSize: fontSize.bodyLg, color: meta.accentHex }}>✓</Text>
            </View>
          )}
        </View>
      </View>
      {/* Label */}
      <Text style={[styles.swatchLabel, {
        fontSize: fontSize.micro,
        color: isSelected ? theme.colors.textPrimary : theme.colors.textSecondary,
        fontWeight: isSelected ? '600' : '400',
      }]}>
        {meta.displayName}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Inline variant — used in onboarding
// ---------------------------------------------------------------------------

export function ThemeSelectorInline(): React.ReactElement {
  const { theme, themeName, setTheme, spacing } = useTheme();

  return (
    <View style={[styles.inlineContainer, { backgroundColor: theme.colors.bgSecondary,
      borderColor: theme.colors.borderDefault, padding: spacing.s4 }]}>
      <Text style={{ color: theme.colors.textSecondary, fontSize: fontSize.caption, marginBottom: spacing.s3,
        textTransform: 'uppercase', fontWeight: fontWeight.semibold, letterSpacing: 1 }}>
        Choose your theme
      </Text>
      <View style={styles.swatchRow}>
        {THEME_META.map((meta) => (
          <Swatch
            key={meta.name}
            meta={meta}
            isSelected={themeName === meta.name}
            onPress={() => setTheme(meta.name)}
          />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Modal variant — used in Settings → Appearance
// ---------------------------------------------------------------------------

interface ThemeSelectorModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ThemeSelectorModal({ visible, onClose }: ThemeSelectorModalProps): React.ReactElement {
  const { theme, themeName, setTheme, fontSize, spacing, radius } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalSheet, {
              backgroundColor: theme.colors.bgElevated,
              borderColor: theme.colors.borderDefault,
              borderRadius: radius.lg,
              padding: spacing.s5,
            }]}>
              {/* Header */}
              <View style={styles.modalHeaderRow}>
                <Text style={{ fontSize: fontSize.heading3, fontWeight: fontWeight.bold, color: theme.colors.textPrimary }}>
                  Appearance
                </Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Close theme picker">
                  <Text style={{ fontSize: fontSize.bodyLg, color: theme.colors.textTertiary }}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: fontSize.bodySm, color: theme.colors.textSecondary, marginBottom: spacing.s5 }}>
                Tap a theme to preview it live. Your choice is saved automatically.
              </Text>

              {/* Swatches */}
              <View style={styles.swatchRow}>
                {THEME_META.map((meta) => (
                  <Swatch
                    key={meta.name}
                    meta={meta}
                    isSelected={themeName === meta.name}
                    onPress={() => setTheme(meta.name)}
                  />
                ))}
              </View>

              {/* Active theme name */}
              <Text style={{ fontSize: fontSize.caption, color: theme.colors.textTertiary,
                textAlign: 'center', marginTop: spacing.s4 }}>
                {THEME_META.find(m => m.name === themeName)?.displayName ?? ''} theme active
              </Text>

              {/* Done button */}
              <TouchableOpacity
                style={[styles.doneButton, {
                  backgroundColor: theme.colors.accentDefault,
                  borderRadius: radius.md,
                  marginTop: spacing.s4,
                  paddingVertical: spacing.s3,
                }]}
                onPress={onClose}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={{ fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold,  // E-003: was '600'
                  color: theme.components.buttonPrimaryText, textAlign: 'center' }}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

// TODO: move to bgOverlay semantic token
const MODAL_BACKDROP = 'rgba(0,0,0,0.6)';

const styles = StyleSheet.create({
  inlineContainer: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  swatchContainer: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  swatchRing: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    borderWidth: 2.5,
    padding: 3,
  },
  swatchDisc: {
    flex: 1,
    borderRadius: radius.full,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  swatchAccentStripe: {
    height: '30%',
    width: '100%',
  },
  checkmarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchLabel: {
    textAlign: 'center',
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: MODAL_BACKDROP,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.s6,
  },
  modalSheet: {
    width: '100%',
    borderWidth: 1,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s2,
  },
  doneButton: {
    alignItems: 'center',
  },
});
