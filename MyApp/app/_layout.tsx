import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Brand } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

// ── Custom navigation themes built on the Peak Fettle palette ────────────────

const PeakFettleDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary:    Brand.turquoise,
    background: Brand.navyDeep,
    card:       Brand.navyMid,
    text:       Brand.offWhite,
    border:     Brand.navySurface,
    notification: Brand.turquoise,
  },
};

const PeakFettleLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary:    Brand.skyBlue,
    background: Brand.lightBg,
    card:       '#FFFFFF',
    text:       Brand.lightText,
    border:     Brand.lightSurface,
    notification: Brand.turquoise,
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? PeakFettleDark : PeakFettleLight}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
