/**
 * Root index route ("/") — the app's entry screen.
 *
 * WHY THIS FILE EXISTS (IOS-RELEASE-ROUTE-FIX, 2026-05-29):
 * expo-router v6 resolves routes LAZILY in dev (React.lazy) but SYNCHRONOUSLY
 * in a Release/production bundle. Previously there was no `app/index.tsx`, and
 * the cold-start bootstrap in AuthContext never navigates (it only sets state).
 * So once `isLoading` flips false, expo-router had to resolve "/" with no
 * concrete component → `loadRoute()` returned undefined → expo-router crashed
 * reading `undefined.ErrorBoundary` in `fromImport` (useScreens.js). This only
 * manifested in TestFlight/Release, never in dev — see
 * .planning/debug/ios-release-route-undefined.md.
 *
 * This screen gives "/" a real component. It shows the same cold-start spinner
 * while auth bootstrap runs, then redirects to the existing concrete screens —
 * mirroring exactly what login()/logout() already do:
 *   authenticated   → /(tabs)/        (same as AuthContext.login)
 *   unauthenticated → /(auth)/login   (same as AuthContext logout / 401 path)
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/theme/ThemeContext';

export default function Index(): React.ReactElement {
  const { isLoading, isAuthenticated } = useAuth();
  const { theme } = useTheme();

  // While the cold-start silent-refresh runs, show the same spinner the root
  // navigator uses. Do NOT redirect yet — auth state is not settled.
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={theme.colors.accentDefault} />
      </View>
    );
  }

  // Auth settled — send the user to a concrete screen. These targets match the
  // existing router.replace() calls in AuthContext, so behaviour is unchanged.
  return <Redirect href={isAuthenticated ? '/(tabs)/' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
