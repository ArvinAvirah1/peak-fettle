/**
 * Life OS design tokens — Primitive → Semantic → Component, mirroring
 * mobile/src/theme/tokens.ts so cross-app work feels familiar.
 *
 * Palette: "Summit" — sibling of the fitness app's Deep Ocean but warmer and
 * calmer: deep slate-indigo surfaces with an amber "sunrise" accent (ascent /
 * direction brand brief, Q16). Dark and light variants are designed together;
 * AA contrast targets: textPrimary ≥4.5:1, textSecondary ≥3:1 on every surface.
 */

import { StyleSheet, ViewStyle } from 'react-native';

export interface PrimitiveTokens {
  base950: string;
  base900: string;
  base800: string;
  base700: string;
  base600: string;
  accent500: string;
  accent400: string;
  accent600: string;
  white: string;
  ink900: string;
  muted400: string;
  muted600: string;
  buttonText: string;
  success: string;
  warning: string;
  error: string;
  focusRing: string;
}

export interface SemanticTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgElevated: string;
  accentDefault: string;
  accentPressed: string;
  accentMuted: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnAccent: string;
  borderDefault: string;
  statusSuccess: string;
  statusWarning: string;
  statusError: string;
  scrim: string;
  focusRing: string;
}

export interface Theme {
  name: 'summitDark' | 'summitLight';
  colors: SemanticTokens;
}

// --- Primitives ------------------------------------------------------------

const summitDarkPrimitives: PrimitiveTokens = {
  base950: '#0C0F17',
  base900: '#121624',
  base800: '#1A2032',
  base700: '#242C42',
  base600: '#303A55',
  accent500: '#F2A93B', // sunrise amber
  accent400: '#F7BE66',
  accent600: '#D98F1F',
  white: '#FFFFFF',
  ink900: '#11141C',
  muted400: '#9BA4BC',
  muted600: '#6B7490',
  buttonText: '#1A1304',
  success: '#4CC38A',
  warning: '#F2A93B',
  error: '#F26B6B',
  focusRing: '#F7BE66',
};

const summitLightPrimitives: PrimitiveTokens = {
  base950: '#F6F4EF',
  base900: '#FFFFFF',
  base800: '#EFECE4',
  base700: '#E2DDD1',
  base600: '#CFC8B8',
  accent500: '#B26F0A', // darkened amber for light-mode contrast
  accent400: '#8F5A08',
  accent600: '#7A4C06',
  white: '#FFFFFF',
  ink900: '#1C1A14',
  muted400: '#5C5A52',
  muted600: '#8A8678',
  buttonText: '#FFFFFF',
  success: '#1F7A4D',
  warning: '#9A6200',
  error: '#B3403C',
  focusRing: '#B26F0A',
};

// --- Semantic mapping --------------------------------------------------------

function toSemantic(p: PrimitiveTokens, dark: boolean): SemanticTokens {
  return {
    bgPrimary: p.base950,
    bgSecondary: p.base900,
    bgElevated: p.base800,
    accentDefault: p.accent500,
    accentPressed: p.accent600,
    accentMuted: dark ? 'rgba(242,169,59,0.16)' : 'rgba(178,111,10,0.12)',
    textPrimary: dark ? p.white : p.ink900,
    textSecondary: p.muted400,
    textTertiary: p.muted600,
    textOnAccent: p.buttonText,
    borderDefault: p.base700,
    statusSuccess: p.success,
    statusWarning: p.warning,
    statusError: p.error,
    scrim: 'rgba(0,0,0,0.55)',
    focusRing: p.focusRing,
  };
}

export const summitDark: Theme = { name: 'summitDark', colors: toSemantic(summitDarkPrimitives, true) };
export const summitLight: Theme = { name: 'summitLight', colors: toSemantic(summitLightPrimitives, false) };

// --- Shared scale tokens (4/8pt rhythm) --------------------------------------

export const spacing = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s12: 48, s16: 64 } as const;
export const radius = { sm: 6, md: 10, lg: 16, xl: 24, full: 9999 } as const;
export const fontSize = {
  display: 40,
  heading1: 32,
  heading2: 24,
  heading3: 20,
  bodyLg: 18,
  bodyMd: 16,
  bodySm: 14,
  caption: 12,
} as const;
export const fontWeight = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
export const fontFamily = {
  regular: 'Outfit-Regular',
  medium: 'Outfit-Medium',
  semibold: 'Outfit-SemiBold',
  bold: 'Outfit-Bold',
} as const;
export const iconSize = { sm: 18, md: 24, lg: 32 } as const;
/** Motion tokens — micro 150–300ms, exits ~65% of enters. */
export const motion = { enterMs: 240, exitMs: 160, microMs: 180, staggerMs: 40 } as const;
/** Minimum hit target (Apple HIG). */
export const HIT_TARGET = 44;

// --- Depth tokens (additive, TICKET-150 "Summit depth pass") ----------------

/** Single-pixel (or thinnest-possible) hairline border width for the platform. */
export const hairline = StyleSheet.hairlineWidth;

/**
 * Elevation tokens — restrained iOS shadow + Android elevation pairs.
 * shadowColor is intentionally a raw hex here (the one permitted location):
 * it mirrors the dark-theme base950 ink so shadows read as "depth", not tint,
 * on both light and dark surfaces. Kept calm: low opacity, small radii.
 */
export const elevation: { low: ViewStyle; mid: ViewStyle; high: ViewStyle } = {
  low: {
    shadowColor: '#0C0F17',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  mid: {
    shadowColor: '#0C0F17',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  high: {
    shadowColor: '#0C0F17',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
};

/**
 * Gradient-within-palette tokens — no linear-gradient dependency is installed,
 * so these are consumed as layered-View stops (or an svg fill) rather than a
 * true CSS gradient. Stops reference EXISTING primitives only — no new colors.
 */
export type GradientStops = readonly [string, string];
export interface GradientPair {
  accent: GradientStops;
  surface: GradientStops;
}

const summitDarkGradients: GradientPair = {
  accent: [summitDarkPrimitives.accent500, summitDarkPrimitives.accent600],
  surface: [summitDarkPrimitives.base800, summitDarkPrimitives.base900],
};

const summitLightGradients: GradientPair = {
  accent: [summitLightPrimitives.accent500, summitLightPrimitives.accent600],
  surface: [summitLightPrimitives.base800, summitLightPrimitives.base900],
};

/** Default (dark) gradient stops — prefer `gradientsFor(themeName)` when theme-aware. */
export const gradientStops: GradientPair = summitDarkGradients;

/** Theme-aware gradient stop lookup — 'summitLight' | 'summitDark' (mirrors Theme['name']). */
export function gradientsFor(themeName: 'summitDark' | 'summitLight'): GradientPair {
  return themeName === 'summitLight' ? summitLightGradients : summitDarkGradients;
}
