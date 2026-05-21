/**
 * Auth group layout — shared header config for Login and Register screens.
 *
 * These screens are shown to unauthenticated users. expo-router groups
 * them under (auth)/ so the folder name doesn't appear in the URL.
 */

import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AuthLayout(): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgPrimary },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { fontWeight: fontWeight.bold },  // E-003: was '700'
        contentStyle: { backgroundColor: theme.colors.bgPrimary },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Create Account', headerShown: false }} />
    </Stack>
  );
}
