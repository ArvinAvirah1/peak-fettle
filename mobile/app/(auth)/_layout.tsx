/**
 * Auth group layout — shared header config for Login and Register screens.
 *
 * These screens are shown to unauthenticated users. expo-router groups
 * them under (auth)/ so the folder name doesn't appear in the URL.
 */

import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function AuthLayout(): React.ReactElement {
  const { theme, fontWeight } = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgPrimary },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: { fontWeight: fontWeight.bold },  // E-003: was '700'
        contentStyle: { backgroundColor: theme.colors.bgPrimary },
      }}
    >
      <Stack.Screen name="login" options={{ title: t('tabs:authLayout.signIn'), headerShown: false }} />
      <Stack.Screen name="register" options={{ title: t('tabs:authLayout.createAccount'), headerShown: false }} />
    </Stack>
  );
}
