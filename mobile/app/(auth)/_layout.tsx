/**
 * Auth group layout — shared header config for Login and Register screens.
 *
 * These screens are shown to unauthenticated users. expo-router groups
 * them under (auth)/ so the folder name doesn't appear in the URL.
 */

import { Stack } from 'expo-router';

export default function AuthLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f8fafc',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#0f172a' },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Create Account', headerShown: false }} />
    </Stack>
  );
}
