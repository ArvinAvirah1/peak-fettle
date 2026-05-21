/**
 * Peak Fettle — Design Tokens
 * Phase E — E-001: Design Token System
 *
 * Primitive → Semantic → Component three-tier architecture.
 * Only the Primitive layer changes between themes.
 * All components reference SemanticTokens via useTheme().
 *
 * See: peak_fettle_design_spec.docx §2 Color System & Design Tokens
 */

import {
  PrimitiveTokens,
  SemanticTokens,
  ComponentTokens,
  Theme,
  ThemeName,
  SpacingTokens,
  RadiusTokens,
  FontSizeTokens,
  FontWeightTokens,
} from './types';

// ============================================================================
// PRIMITIVE PALETTES — one per theme
// ============================================================================

const primitiveDeepOcean: PrimitiveTokens = {
  // Background scale
  navy950: '#0A0E1A',
  navy900: '#0F1629',
  navy800: '#151D35',
  navy700: '#1A2340',
  navy600: '#1E3A8A',
  // Accent: turquoise
  accent500: '#00D4C8',
  accent400: '#33DDCA',
  accent600: '#00A89F',
  // Neutrals
  white: '#FFFFFF',
  slate400: '#94A3B8',
  slate600: '#6D87A6', // E-008: WCAG AA 5.14:1 on bgPrimary, 4.86:1 on bgSec,
  // Button text: darkest navy for contrast on bright accent
  buttonText: '#0A0E1A',
  // Status
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

const primitiveEmber: PrimitiveTokens = {
  navy950: '#0D0A0A',
  navy900: '#150C08',
  navy800: '#1C0F0A',
  navy700: '#24120C',
  navy600: '#7C2D12',
  accent500: '#FF6B35',
  accent400: '#FF8C5F',
  accent600: '#E04E1B',
  white: '#FFFFFF',
  slate400: '#A8927F',
  slate600: '#957570', // E-008: WCAG AA 4.75:1 on #0D0A0A,
  // Button text: darkest navy for contrast on bright accent
  buttonText: '#0D0A0A',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

const primitiveForest: PrimitiveTokens = {
  navy950: '#050F07',
  navy900: '#071510',
  navy800: '#0A1C13',
  navy700: '#0D2419',
  navy600: '#14532D',
  accent500: '#22C55E',
  accent400: '#4ADE80',
  accent600: '#16A34A',
  white: '#FFFFFF',
  slate400: '#86A893',
  slate600: '#628A6E', // E-008: WCAG AA 4.99:1 on #050F07,
  // Button text: darkest navy for contrast on bright accent
  buttonText: '#050F07',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

const primitiveMidnight: PrimitiveTokens = {
  navy950: '#07050F',
  navy900: '#0D0B18',
  navy800: '#130F22',
  navy700: '#19132C',
  navy600: '#4C1D95',
  accent500: '#8B5CF6',
  accent400: '#A78BFA',
  accent600: '#7C3AED',
  white: '#FFFFFF',
  slate400: '#9B93B8',
  slate600: '#887C9C', // E-008: WCAG AA 4.83:1 on bgTer, passes all 3 bgs,
  // Button text: darkest navy for contrast on bright accent
  buttonText: '#07050F',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
};

const primitiveMonochrome: PrimitiveTokens = {
  navy950: '#000000',
  navy900: '#111111',
  navy800: '#1C1C1C',
  navy700: '#2A2A2A',
  navy600: '#3D3D3D',
  accent500: '#FFFFFF',
  accent400: '#E0E0E0',
  accent600: '#BDBDBD',
  white: '#FFFFFF',
  slate400: '#9E9E9E',
  slate600: '#888888', // E-008: WCAG AA 4.81:1 on bgTer, passes all 3 bgs,
  // Button text: accent is white, so use black for contrast
  buttonText: '#000000',
  success: '#66BB6A',
  warning: '#FFA726',
  error: '#EF5350',
};

// ============================================================================
// SEMANTIC TOKEN BUILDER — maps primitives to purpose-named roles
// ============================================================================

function buildSemanticTokens(p: PrimitiveTokens): SemanticTokens {
  return {
    bgPrimary: p.navy950,
    bgSecondary: p.navy900,
    bgTertiary: p.navy800,
    bgElevated: p.navy700,

    accentDefault: p.accent500,
    accentHover: p.accent400,
    accentPressed: p.accent600,
    accentSecondary: p.navy600,

    textPrimary: p.white,
    textSecondary: p.slate400,
    textTertiary: p.slate600,

    borderDefault: p.navy700,

    statusSuccess: p.success,
    statusWarning: p.warning,
    statusError: p.error,
  };
}

// ============================================================================
// COMPONENT TOKEN BUILDER — references semantic tokens (not primitives)
// ============================================================================

function buildComponentTokens(s: SemanticTokens, p: PrimitiveTokens): ComponentTokens {
  return {
    // Buttons
    buttonPrimaryBg: s.accentDefault,
    buttonPrimaryText: p.buttonText, // always dark text on bright accent
    buttonPrimaryPressed: s.accentPressed,
    buttonSecondaryBorder: s.accentDefault,
    buttonSecondaryText: s.accentDefault,
    buttonDestructiveBg: s.statusError,
    buttonDestructiveText: s.textPrimary,
    buttonIconBg: s.bgTertiary,

    // Cards
    cardBg: s.bgSecondary,
    cardBorder: s.borderDefault,
    cardBorderRadius: 16,

    // Inputs
    inputBg: s.bgTertiary,
    inputBorder: s.borderDefault,
    inputBorderActive: s.accentDefault,
    inputBorderError: s.statusError,
    inputText: s.textPrimary,
    inputPlaceholder: s.textTertiary,

    // Navigation
    navBg: s.bgPrimary,
    navBorder: s.borderDefault,
    navActiveIcon: s.accentDefault,
    navInactiveIcon: s.textTertiary,
    navActiveLabel: s.accentDefault,
    navInactiveLabel: s.textTertiary,

    // Progress indicators
    progressTrack: s.bgTertiary,
    progressFill: s.accentDefault,
    progressRingFill: s.accentDefault,
    progressRingTrack: s.bgTertiary,
  };
}

// ============================================================================
// THEME BUILDERS
// ============================================================================

function buildTheme(
  name: ThemeName,
  displayName: string,
  primitives: PrimitiveTokens,
): Theme {
  const colors = buildSemanticTokens(primitives);
  const components = buildComponentTokens(colors, primitives);
  return { name, displayName, primitives, colors, components };
}

export const THEMES: Record<ThemeName, Theme> = {
  deepOcean: buildTheme('deepOcean', 'Deep Ocean', primitiveDeepOcean),
  ember:     buildTheme('ember',     'Ember',       primitiveEmber),
  forest:    buildTheme('forest',    'Forest',      primitiveForest),
  midnight:  buildTheme('midnight',  'Midnight',    primitiveMidnight),
  monochrome: buildTheme('monochrome', 'Monochrome', primitiveMonochrome),
};

export const DEFAULT_THEME: ThemeName = 'deepOcean';

// ============================================================================
// SHARED DESIGN TOKENS — spacing, radius, typography
// (These do not change between themes)
// ============================================================================

export const spacing: SpacingTokens = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s12: 48,
  s16: 64,
};

export const radius: RadiusTokens = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
};

export const fontSize: FontSizeTokens = {
  display: 40,
  heading1: 32,
  heading2: 24,
  heading3: 20,
  bodyLg: 18,
  bodyMd: 16,
  bodySm: 14,
  caption: 12,
  micro: 10,
  metric: 40,
};

export const fontWeight: FontWeightTokens = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// ============================================================================
// ANIMATION CONSTANTS (Spec §7 Motion & Micro-interactions)
// ============================================================================

export const motion = {
  screenPush: { duration: 300, easing: 'easeInOut' },
  bottomSheet: { duration: 280, damping: 0.8 },
  cardTap: { duration: 120, easing: 'easeOut', scale: 0.97 },
  setCheckmark: { duration: 200, easing: 'easeOut' },
  prBadge: { duration: 400, damping: 0.6 },
  themeSwitch: { duration: 300, easing: 'easeInOut' },
  tabActiveIcon: { duration: 180, easing: 'easeOut', scale: 1.15 },
  percentileRing: { duration: 800, easing: 'easeOut' },
  // Reduce Motion fallback: all animations become instant cross-fades
  reducedMotion: { duration: 0 },
} as const;

// ============================================================================
// ACCESSIBILITY — minimum touch targets (Spec §4.2, WCAG 2.5.5)
// ============================================================================

export const a11y = {
  minTouchTarget: 48, // pt — all interactive elements
  minTouchTargetAndroid: 48, // dp
} as const;
