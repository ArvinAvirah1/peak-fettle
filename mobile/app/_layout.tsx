/**
 * Root layout — wraps the entire app in <AuthProvider> + <PowerSyncProvider>
 * and implements the auth guard.
 *
 * Provider nesting order (outermost → innermost):
 *   AuthProvider        — provides Supabase JWT, user state, login/logout
 *   PowerSyncProvider   — opens the local SQLite DB and connects the sync
 *                         service using the JWT from AuthContext
 *   RootNavigator       — reads auth state to show spinner or route tree
 *
 * PowerSyncProvider MUST be inside AuthProvider because it consumes useAuth()
 * to get the access token and to call setAccessToken() on the connector
 * whenever the token rotates.
 *
 * expo-router renders this component as the root of the navigation tree.
 * The auth guard works by:
 *   1. Rendering nothing (or a loading indicator) while isLoading is true
 *      (cold-start silent refresh in flight).
 *   2. Once isLoading resolves, expo-router's <Slot> renders the matched route.
 *   3. AuthContext.login() / logout() call router.replace() to switch between
 *      /(auth)/* and /(tabs)/*, which re-evaluates this guard on the next render.
 *
 * We do NOT implement a redirect loop in the layout because expo-router handles
 * redirects inside AuthContext directly. This keeps the layout simple and avoids
 * double-render issues.
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { AuthProvider } from '../src/context/AuthContext';
import { PowerSyncProvider } from '../src/context/PowerSyncContext';
import { useAuth } from '../src/hooks/useAuth';

// ---------------------------------------------------------------------------
// Inner component — has access to AuthContext via useAuth()
// ---------------------------------------------------------------------------

function RootNavigator(): React.ReactElement {
  const { isLoading } = useAuth();

  if (isLoading) {
    // Show a loading spinner while the cold-start refresh runs.
    // This prevents flashing the login screen on every app open for
    // already-authenticated users.
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // expo-router's <Stack> renders the file-based route tree.
  // Groups /(auth)/ and /(tabs)/ handle their own headers/tab bars.
  // The initial route is determined by expo-router's file structure;
  // AuthContext.login() and logout() drive navigation via router.replace().
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Post-registration onboarding — biological sex + discipline (TICKET-038 / ROADMAP 1.6) */}
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        {/* Push screens accessible from any tab */}
        <Stack.Screen name="health-metrics" options={{ headerShown: false }} />
        <Stack.Screen name="groups" options={{ headerShown: false }} />
        <Stack.Screen name="group-detail" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout — provides AuthContext + PowerSync to the entire tree
// ---------------------------------------------------------------------------

export default function RootLayout(): React.ReactElement {
  return (
    <AuthProvider>
      {/* PowerSyncProvider is inside AuthProvider so it can read the JWT. */}
      <PowerSyncProvider>
        <RootNavigator />
      </PowerSyncProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
});
