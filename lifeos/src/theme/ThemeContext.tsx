/**
 * ThemeContext — exposes the Summit theme (dark/light, follows system by
 * default with a manual override persisted to AsyncStorage).
 *
 * Consumption mirrors the fitness app:
 *   const { theme } = useTheme();
 *   <View style={{ backgroundColor: theme.colors.bgPrimary }} />
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { summitDark, summitLight, Theme } from './tokens';

type ThemeMode = 'system' | 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'lifeos.themeMode';

const ThemeContext = createContext<ThemeContextValue>({
  theme: summitDark,
  mode: 'system',
  setMode: () => undefined,
});

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'dark' || stored === 'light' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => undefined);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const resolved: Theme = useMemo(() => {
    const effective = mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode;
    return effective === 'light' ? summitLight : summitDark;
  }, [mode, systemScheme]);

  const value = useMemo(() => ({ theme: resolved, mode, setMode }), [resolved, mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
