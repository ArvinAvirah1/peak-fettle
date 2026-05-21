/**
 * PFCard — Peak Fettle design-system card component.
 * Phase E — E-004: Component Library Rebuild
 *
 * Four variants per peak_fettle_design_spec.docx §4.2:
 *   default   — standard bgSecondary card with border (most common)
 *   elevated  — bgElevated background for nested/raised content
 *   accent    — accent-tinted border for highlighted content
 *   flat      — no border or background; pure layout grouping
 *
 * All colors, spacing, and radii come from useTheme() tokens.
 * Zero hardcoded values.
 *
 * Usage:
 *   <PFCard>
 *     <Text>Content here</Text>
 *   </PFCard>
 *
 *   <PFCard variant="accent" padding="lg">
 *     <Text>Highlighted content</Text>
 *   </PFCard>
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PFCardVariant = 'default' | 'elevated' | 'accent' | 'flat';
export type PFCardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface PFCardProps {
  children: React.ReactNode;
  variant?: PFCardVariant;
  padding?: PFCardPadding;
  /** Additional style overrides for the outer container */
  style?: object;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PFCard({
  children,
  variant = 'default',
  padding = 'md',
  style,
}: PFCardProps): React.ReactElement {
  const { theme, spacing, radius } = useTheme();

  // ── Background ───────────────────────────────────────────────────────────
  let bgColor: string;
  let borderColor: string | undefined;
  let borderWidth = 0;

  switch (variant) {
    case 'default':
      bgColor = theme.colors.bgSecondary;
      borderColor = theme.colors.borderDefault;
      borderWidth = 1;
      break;
    case 'elevated':
      bgColor = theme.colors.bgElevated;
      borderColor = theme.colors.borderDefault;
      borderWidth = 1;
      break;
    case 'accent':
      bgColor = theme.colors.bgSecondary;
      borderColor = theme.colors.accentDefault;
      borderWidth = 1.5;
      break;
    case 'flat':
      bgColor = 'transparent';
      break;
  }

  // ── Padding ───────────────────────────────────────────────────────────────
  const paddingMap: Record<PFCardPadding, number> = {
    none: 0,
    sm:   spacing.s3,
    md:   spacing.s4,
    lg:   spacing.s6,
  };
  const paddingValue = paddingMap[padding];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: bgColor,
          borderWidth,
          borderColor,
          borderRadius: radius.lg,
          padding: paddingValue,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layout-only styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
