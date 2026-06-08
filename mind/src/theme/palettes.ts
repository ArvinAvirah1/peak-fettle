/**
 * Peak Fettle Mind — Theme Palettes (sibling brand)
 *
 * Founder decisions (2026-05-29):
 *   • Relationship to Peak Fettle = SIBLING — same token architecture and
 *     component shapes as mobile/src/theme/tokens.ts, but a distinct calmer
 *     palette, softer type, and slower motion (see COMPANION_APP_STYLE_OPTIONS).
 *   • Ship ALL FOUR families, each as an adaptive light + dark pair.
 *
 * This file is the Mind app's PRIMITIVE layer only. It is deliberately
 * self-contained (inline type, no app imports) so it can be reviewed and
 * parsed before the mind/ app is scaffolded (TICKET-074). When the foundation
 * lands, the SAME buildSemanticTokens()/buildComponentTokens() from Peak Fettle
 * consume these primitives unchanged — only the palette differs.
 *
 * LIGHT vs DARK mapping: the semantic builder maps bgPrimary = navy950 and
 * textPrimary = white. For LIGHT palettes we simply put the lightest surface in
 * the navy950 slot and a near-black ink color in the `white` slot. No builder
 * or component change is required — the architecture is palette-agnostic.
 *
 * ACCESSIBILITY: every palette below was contrast-checked (WCAG 2.1). Annotated
 * ratios are textPrimary-on-bgPrimary / textSecondary-on-bgPrimary /
 * accentDefault-on-bgPrimary (UI ≥3:1) / buttonText-on-accentDefault (≥4.5:1).
 * Calm themes cap saturation, so the light themes use either a dark buttonText
 * or a slightly deepened accent to keep button labels AA — verified, not assumed.
 */

// ---------------------------------------------------------------------------
// Primitive token shape — identical to Peak Fettle's PrimitiveTokens.
// (Inlined so this module stands alone until the mind/ app shares the type.)
// ---------------------------------------------------------------------------
export interface MindPrimitiveTokens {
  navy950: string; // app background (lightest surface on light themes)
  navy900: string; // cards / list rows
  navy800: string; // inputs / sub-cards
  navy700: string; // elevated / borders
  navy600: string; // secondary brand surface
  accent500: string; // primary interactive (button bg, UI accent)
  accent400: string; // hover / focus (lighter)
  accent600: string; // pressed / active (darker)
  white: string;     // textPrimary (near-black on light themes)
  slate400: string;  // textSecondary
  slate600: string;  // textTertiary (placeholders/disabled)
  buttonText: string; // contrast color ON accent500
  success: string;
  warning: string;
  error: string;
}

export type MindThemeName =
  | 'stillWater' | 'deepCalm'      // Family 1 — Cool & Serene
  | 'warmSand'   | 'clayDusk'      // Family 2 — Warm & Grounding
  | 'paper'      | 'ink'           // Family 3 — Minimal / Editorial
  | 'sage'       | 'forestNight';  // Family 4 — Nature / Restorative

// ===========================================================================
// FAMILY 1 — Cool & Serene  (closest sibling to Peak Fettle's teal)
// ===========================================================================

/** Still Water (LIGHT). text 14.10 / sec 5.30 / accentUI 3.03 / btn(dark) 5.28 — all AA. */
export const stillWater: MindPrimitiveTokens = {
  navy950: '#F7FAFC', navy900: '#EDF3F6', navy800: '#E1EAEF', navy700: '#D2DEE5', navy600: '#B8CAD4',
  accent500: '#5B9AA6', accent400: '#7FB3BD', accent600: '#48808B',
  white: '#1B2A30', slate400: '#5A6B72', slate600: '#78878D',
  buttonText: '#0F2024', // dark ink on the soft teal keeps the calm accent AA (5.28:1)
  success: '#5FA46F', warning: '#B0832E', error: '#C2564B',
};

/** Deep Calm (DARK). text 16.10 / sec 8.26 / accentUI 7.64 / btn 7.57 — all AA. */
export const deepCalm: MindPrimitiveTokens = {
  navy950: '#0C1418', navy900: '#111C22', navy800: '#16252C', navy700: '#1D3038', navy600: '#234049',
  accent500: '#5FB3B8', accent400: '#7FC7CB', accent600: '#469499',
  white: '#E8F0F2', slate400: '#9DB0B6', slate600: '#76888E',
  buttonText: '#08161A',
  success: '#56B36B', warning: '#D6A24A', error: '#D06A60',
};

// ===========================================================================
// FAMILY 2 — Warm & Grounding  (most emotionally separate; journal feel)
// ===========================================================================

/** Warm Sand (LIGHT). text 14.14 / sec 5.50 / accentUI 4.85 / btn(white) 5.22 — all AA.
 *  Accent deepened to terracotta #A85539 so white labels pass; lighter clay is the hover. */
export const warmSand: MindPrimitiveTokens = {
  navy950: '#FAF6F1', navy900: '#F2EAE0', navy800: '#E9DDCE', navy700: '#DCCBB6', navy600: '#C9B299',
  accent500: '#A85539', accent400: '#C2745A', accent600: '#8E4630',
  white: '#2C2420', slate400: '#6E6258', slate600: '#8A7C70',
  buttonText: '#FFF8F2',
  success: '#6E8A54', warning: '#A9772B', error: '#BF5E4E',
};

/** Clay & Dusk (DARK). text 15.51 / sec 7.19 / accentUI 7.25 / btn 7.03 — all AA. */
export const clayDusk: MindPrimitiveTokens = {
  navy950: '#141009', navy900: '#1D170F', navy800: '#261E14', navy700: '#33271A', navy600: '#46341F',
  accent500: '#D98E6A', accent400: '#E6A684', accent600: '#BD7250',
  white: '#F0E7DD', slate400: '#B09C8A', slate600: '#897668',
  buttonText: '#1A130C',
  success: '#86A45E', warning: '#D6A24A', error: '#CC6B57',
};

// ===========================================================================
// FAMILY 3 — Minimal / Editorial  (cheapest to build, timeless)
// ===========================================================================

/** Paper (LIGHT). text 15.52 / sec 6.35 / accentUI 4.94 / btn(white) 5.07 — all AA.
 *  Accent deepened to slate-blue #4F7388 so white labels pass; original is the hover. */
export const paper: MindPrimitiveTokens = {
  navy950: '#FCFCFB', navy900: '#F4F4F2', navy800: '#EAEAE7', navy700: '#DCDCD8', navy600: '#C3C3BD',
  accent500: '#4F7388', accent400: '#6A8CA4', accent600: '#3D5C70',
  white: '#222220', slate400: '#5E5E59', slate600: '#7C7C76',
  buttonText: '#FFFFFF',
  success: '#5E9468', warning: '#9A7A2E', error: '#B85B4E',
};

/** Ink (DARK). text 16.72 / sec 6.99 / accentUI 8.96 / btn 8.96 — all AA. */
export const ink: MindPrimitiveTokens = {
  navy950: '#0C0C0D', navy900: '#151517', navy800: '#1F1F22', navy700: '#2B2B2F', navy600: '#3A3A40',
  accent500: '#9FB2C2', accent400: '#B8C7D4', accent600: '#7E94A6',
  white: '#EDEDEF', slate400: '#9A9AA0', slate600: '#74747A',
  buttonText: '#0C0C0D',
  success: '#66BB6A', warning: '#D6A24A', error: '#D06A60',
};

// ===========================================================================
// FAMILY 4 — Nature / Restorative  (pairs with habit-"garden" mood metaphor)
// ===========================================================================

/** Sage (LIGHT). text 13.89 / sec 5.27 / accentUI 4.64 / btn(white) 4.97 — all AA.
 *  Accent deepened to #4A7A5A so it clears the 3:1 UI floor and white labels pass. */
export const sage: MindPrimitiveTokens = {
  navy950: '#F5F8F3', navy900: '#E9F0E6', navy800: '#DCE7D7', navy700: '#C9D8C2', navy600: '#AEC4A4',
  accent500: '#4A7A5A', accent400: '#6E9E78', accent600: '#3C6449',
  white: '#1F2A21', slate400: '#5C6B5F', slate600: '#79877B',
  buttonText: '#FFFFFF',
  success: '#5FA46F', warning: '#A9772B', error: '#C2564B',
};

/** Forest Night (DARK). text 16.18 / sec 8.30 / accentUI 7.41 / btn 7.38 — all AA. */
export const forestNight: MindPrimitiveTokens = {
  navy950: '#0A120C', navy900: '#101B13', navy800: '#16241A', navy700: '#1E3124', navy600: '#284332',
  accent500: '#6FB07E', accent400: '#8FC79C', accent600: '#4F8C61',
  white: '#E6EFE8', slate400: '#9DB0A2', slate600: '#76887B',
  buttonText: '#08130C',
  success: '#5FA46F', warning: '#D6A24A', error: '#C8665A',
};

// ===========================================================================
// ADAPTIVE PAIRS — one entry per family. The Mind app selects light/dark by
// OS appearance (userInterfaceStyle: automatic), with a manual override in
// settings. `family` is the user-facing chooser; light/dark resolve at runtime.
// ===========================================================================

export interface MindThemePair {
  family: string;        // user-facing family name
  description: string;   // one-line mood
  light: MindPrimitiveTokens;
  dark: MindPrimitiveTokens;
}

export const MIND_THEME_FAMILIES: Record<string, MindThemePair> = {
  cool: {
    family: 'Cool & Serene',
    description: 'Spa-calm muted teal. Closest sibling to Peak Fettle.',
    light: stillWater, dark: deepCalm,
  },
  warm: {
    family: 'Warm & Grounding',
    description: 'Sand, clay and terracotta with a journal feel.',
    light: warmSand, dark: clayDusk,
  },
  minimal: {
    family: 'Minimal / Editorial',
    description: 'Near-monochrome with one soft slate-blue accent.',
    light: paper, dark: ink,
  },
  nature: {
    family: 'Nature / Restorative',
    description: 'Soft sage greens; pairs with the habit-garden metaphor.',
    light: sage, dark: forestNight,
  },
};

/** Lookup by individual theme name (e.g. for an explicit user override). */
export const MIND_PALETTES: Record<MindThemeName, MindPrimitiveTokens> = {
  stillWater, deepCalm,
  warmSand, clayDusk,
  paper, ink,
  sage, forestNight,
};

/**
 * Shared-token OVERRIDES for the sibling voice (calmer than Peak Fettle).
 * These layer onto Peak Fettle's spacing/radius/fontSize/motion; only the
 * deltas are listed here. Applied app-wide in the Mind ThemeProvider.
 */
export const MIND_TOKEN_OVERRIDES = {
  // Airier layout (Axis F1): bump the standard page margin and section gaps.
  spacing: { pageMargin: 20, sectionGap: 28 },
  // Softer corners (Axis E1/E2): pill CTAs, gently rounded cards.
  radius: { card: 18, cta: 9999 },
  // Calmer voice (Axis D): cap weight at SemiBold; serif headings optional per family.
  fontWeightCeiling: '600' as const,
  // Slow & breathing motion (Axis G1): ~1.4x Peak Fettle durations, ease-in-out.
  motionScale: 1.4,
  // Default to OS appearance (Axis A3).
  defaultAppearance: 'automatic' as const,
} as const;

export const MIND_DEFAULT_FAMILY = 'warm'; // Warm Sand (light) / Clay & Dusk (dark) — founder choice 2026-05-29
