/**
 * Peak Fettle — Design tokens (dark-mode default)
 * Matches the "Charcoal Dark" cosmetic theme seeded in 20260503_cosmetics.sql.
 * Light mode and user-unlocked themes are Phase D cosmetics work (TICKET-026).
 */

export const Colors = {
    // Surface
    background:   '#1A202C',
    surface:      '#2D3748',
    surfaceAlt:   '#4A5568',
    border:       '#4A5568',

    // Text
    textPrimary:   '#F7FAFC',
    textSecondary: '#A0AEC0',
    textDisabled:  '#718096',

    // Accent / interactive
    accent:        '#63B3ED',
    accentDark:    '#3182CE',

    // Semantic
    success:       '#68D391',
    warning:       '#F6AD55',
    error:         '#FC8181',
    pr:            '#81E6D9',   // turquoise — PR badge colour (matches Qt prototype)

    // Tab bar
    tabActive:     '#63B3ED',
    tabInactive:   '#718096',
} as const;

export const Spacing = {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
} as const;

export const Radii = {
    sm:   4,
    md:   8,
    lg:   12,
    full: 9999,
} as const;

export const FontSizes = {
    xs:   12,
    sm:   14,
    md:   16,
    lg:   18,
    xl:   22,
    xxl:  28,
} as const;

export const FontWeights = {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
} as const;
