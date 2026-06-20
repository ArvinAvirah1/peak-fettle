/**
 * Peak Fettle — ThemeContext
 * Phase E — E-001: Design Token System
 *
 * Provides the active theme to every component via useTheme().
 * Theme selection is:
 *   1. Loaded from AsyncStorage at boot (instant, no flicker)
 *   2. Persisted to AsyncStorage on every change (local)
 *   3. Persisted to Supabase (PATCH /user/profile { theme }) when a user
 *      is signed in — enables cross-device theme sync (E-002 requirement)
 *
 * Usage:
 *   const { theme, themeName, setTheme, spacing, radius, fontSize } = useTheme();
 *   <View style={{ backgroundColor: theme.colors.bgPrimary }} />
 *
 * See: peak_fettle_design_spec.docx §2.3, §8.3
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LayoutAnimation, Platform } from 'react-native';

import {
  DEFAULT_THEME,
  THEMES,
  fontSize,
  fontWeight,
  motion,
  radius,
  spacing,
} from './tokens';
import { Theme, ThemeContextValue, ThemeName } from './types';
import { refreshWidget } from '../services/widgetBridge';

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const THEME_STORAGE_KEY = '@peak_fettle/theme';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface ThemeProviderProps {
  children: React.ReactNode;
  /**
   * Optional: Supabase API client function to persist the theme server-side.
   * Signature: (themeName: ThemeName) => Promise<void>
   * If omitted, only AsyncStorage persistence is used (E-001 baseline).
   * Wire in the full Supabase call in E-002.
   */
  onThemeChange?: (themeName: ThemeName) => Promise<void>;
}

export function ThemeProvider({
  children,
  onThemeChange,
}: ThemeProviderProps): React.ReactElement {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  const [theme, setThemeObj] = useState<Theme>(THEMES[DEFAULT_THEME]);

  // Load persisted theme at boot. Children render with DEFAULT_THEME immediately
  // and re-render once the stored preference resolves — a theme swap is far less
  // jarring than a blank frame.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (stored && stored in THEMES) {
          const name = stored as ThemeName;
          setThemeName(name);
          setThemeObj(THEMES[name]);
        }
      } catch (err) {
        // If AsyncStorage fails, keep the default silently
        console.warn('[PF] ThemeContext/loadTheme:', err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  const setTheme = useCallback(
    async (name: ThemeName): Promise<void> => {
      // Theme cross-fade — 300ms easeInEaseOut, per spec §7 motion.themeSwitch
      if (Platform.OS !== 'web') {
        LayoutAnimation.configureNext({
          duration: 300,
          create: { type: 'easeInEaseOut', property: 'opacity' },
          update: { type: 'easeInEaseOut', property: 'opacity' },
          delete: { type: 'easeInEaseOut', property: 'opacity' },
        });
      }
      setThemeName(name);
      setThemeObj(THEMES[name]);

      // Persist locally
      try {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, name);
      } catch (err) {
        // Non-fatal: theme is still applied in memory
        console.warn('[PF] ThemeContext/setTheme persist:', err instanceof Error ? err.message : String(err));
      }

      // Re-skin the home/lock-screen widgets to the new theme (iOS only; no-op
      // elsewhere, never throws — WIDGET-003).
      void refreshWidget();

      // Persist to Supabase if callback provided (E-002)
      if (onThemeChange) {
        try {
          await onThemeChange(name);
        } catch (err) {
          // Non-fatal: local preference is already saved
          console.warn('[PF] ThemeContext/setTheme onThemeChange:', err instanceof Error ? err.message : String(err));
        }
      }
    },
    [onThemeChange],
  );

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    spacing,
    radius,
    fontSize,
    fontWeight,
  };

  // Render children immediately with whatever theme is active (default at boot,
  // then swapped to the stored theme once AsyncStorage resolves). This avoids a
  // blank frame while AsyncStorage is read — a theme flash is visually far less
  // jarring than a completely empty/transparent screen.
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useTheme — access design tokens in any component.
 *
 * @example
 * const { theme, setTheme, spacing, fontSize } = useTheme();
 * const styles = StyleSheet.create({
 *   container: { backgroundColor: theme.colors.bgPrimary },
 *   label: { color: theme.colors.textPrimary, fontSize: fontSize.bodyMd },
 * });
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export type { ThemeName, Theme };
export { THEMES, DEFAULT_THEME, spacing, radius, fontSize, fontWeight, motion };
