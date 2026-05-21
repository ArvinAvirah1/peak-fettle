/**
 * Peak Fettle — Design Token Type Definitions
 * Phase E — E-001: Design Token System
 *
 * Three-tier architecture:
 *   Primitive  → raw hex values (only layer that changes between themes)
 *   Semantic   → purpose-named aliases (never reference primitives in components)
 *   Component  → element-scoped assignments (surgical overrides)
 *
 * See: peak_fettle_design_spec.docx §2 Color System & Design Tokens
 */

// ---------------------------------------------------------------------------
// Primitive color scale — raw hex. Only this layer changes per theme.
// ---------------------------------------------------------------------------

export interface PrimitiveTokens {
  // Background scale
  navy950: string;
  navy900: string;
  navy800: string;
  navy700: string;
  navy600: string;
  // Accent scale
  accent500: string; // primary accent
  accent400: string; // hover/focus
  accent600: string; // pressed/active
  // Neutrals
  white: string;
  slate400: string;
  slate600: string;
  // Button text override (darkest navy, used by buttonPrimaryText)
  buttonText: string;
  // Status
  success: string;
  warning: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Semantic tokens — purpose-named; stable across all themes
// ---------------------------------------------------------------------------

export interface SemanticTokens {
  // Backgrounds
  bgPrimary: string;     // App root background
  bgSecondary: string;   // Cards, list rows
  bgTertiary: string;    // Inputs, sub-cards
  bgElevated: string;    // Sheets, modals

  // Accents
  accentDefault: string; // Primary interactive element
  accentHover: string;   // Hover / focus ring
  accentPressed: string; // Tap / press feedback
  accentSecondary: string; // Secondary brand elements

  // Text
  textPrimary: string;   // Primary labels
  textSecondary: string; // Sub-labels, metadata
  textTertiary: string;  // Placeholders, disabled

  // Borders
  borderDefault: string; // Card borders, dividers

  // Status
  statusSuccess: string; // PR, gains
  statusWarning: string; // Rest timer, caution
  statusError: string;   // Injury flags, errors
}

// ---------------------------------------------------------------------------
// Component tokens — element-scoped. Import SemanticTokens, not primitives.
// ---------------------------------------------------------------------------

export interface ComponentTokens {
  // Buttons
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonPrimaryPressed: string;
  buttonSecondaryBorder: string;
  buttonSecondaryText: string;
  buttonDestructiveBg: string;
  buttonDestructiveText: string;
  buttonIconBg: string;

  // Cards
  cardBg: string;
  cardBorder: string;
  cardBorderRadius: number;

  // Inputs
  inputBg: string;
  inputBorder: string;
  inputBorderActive: string;
  inputBorderError: string;
  inputText: string;
  inputPlaceholder: string;

  // Navigation
  navBg: string;
  navBorder: string;
  navActiveIcon: string;
  navInactiveIcon: string;
  navActiveLabel: string;
  navInactiveLabel: string;

  // Progress
  progressTrack: string;
  progressFill: string;
  progressRingFill: string;
  progressRingTrack: string;
}

// ---------------------------------------------------------------------------
// Full theme object
// ---------------------------------------------------------------------------

export type ThemeName =
  | 'deepOcean'
  | 'ember'
  | 'forest'
  | 'midnight'
  | 'monochrome';

export interface Theme {
  name: ThemeName;
  displayName: string;
  primitives: PrimitiveTokens;
  colors: SemanticTokens;
  components: ComponentTokens;
}

// ---------------------------------------------------------------------------
// Spacing & Typography tokens (shared across all themes — not swapped)
// ---------------------------------------------------------------------------

export interface SpacingTokens {
  s1: number;   // 4  pt — icon-to-label gap, chip internal padding
  s2: number;   // 8  pt — badge margin, tightly coupled elements
  s3: number;   // 12 pt — list row internal vertical padding
  s4: number;   // 16 pt — standard horizontal page margin, card padding
  s5: number;   // 20 pt — section spacing within cards
  s6: number;   // 24 pt — card-to-card vertical gap
  s8: number;   // 32 pt — section header top padding
  s12: number;  // 48 pt — hero section breathing room
  s16: number;  // 64 pt — bottom nav safe area clearance
}

export interface RadiusTokens {
  sm: number; // 6  pt — chips, badges
  md: number; // 10 pt — inputs, inner elements
  lg: number; // 16 pt — primary cards
  full: number; // 9999 — pill shapes
}

export interface FontSizeTokens {
  display: number;   // 40 pt — splash wordmark, major stat callouts
  heading1: number;  // 32 pt — screen titles
  heading2: number;  // 24 pt — section headers within screens
  heading3: number;  // 20 pt — card headers, exercise group titles
  bodyLg: number;    // 18 pt — primary body copy, exercise names
  bodyMd: number;    // 16 pt — secondary body, set/rep values
  bodySm: number;    // 14 pt — metadata, timestamps, sub-labels
  caption: number;   // 12 pt — hints, helper text, footnotes
  micro: number;     // 10 pt — badges, chips, tab bar labels
  metric: number;    // 40 pt — single-stat callout cards (HR, volume, percentile)
}

export interface FontWeightTokens {
  regular: '400';
  medium: '500';
  semibold: '600';
  bold: '700';
}

// ---------------------------------------------------------------------------
// ThemeContext value shape
// ---------------------------------------------------------------------------

export interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  setTheme: (name: ThemeName) => Promise<void>;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  fontSize: FontSizeTokens;
  fontWeight: FontWeightTokens;
}
