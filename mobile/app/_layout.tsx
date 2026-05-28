/**
 * Root layout — wraps the entire app in <ThemeProvider> + <AuthProvider> + <PowerSyncProvider>
 * and implements the auth guard.
 *
 * Provider nesting order (outermost → innermost):
 *   ThemeProvider       — design token system; provides useTheme() app-wide (E-001)
 *   AuthProvider        — provides Supabase JWT, user state, login/logout
 *   PowerSyncProvider   — opens the local SQLite DB and connects the sync
 *                         service using the JWT from AuthContext
 *   RootNavigator       — reads auth state to show spinner or route tree
 *
 * ThemeProvider is the outermost wrapper so every component (including auth
 * screens) can access design tokens. It reads the persisted theme from
 * AsyncStorage before rendering children to eliminate first-frame color flicker.
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

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Text, ScrollView } from 'react-native';
import { useFonts } from 'expo-font';

import { AuthProvider } from '../src/context/AuthContext';
import { PowerSyncProvider } from '../src/context/PowerSyncContext';
import { useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, useTheme, ThemeName } from '../src/theme/ThemeContext';
import { patchProfile } from '../src/api/user';
import { registerForPushNotificationsAsync } from '../src/services/pushNotifications';

// ---------------------------------------------------------------------------
// Root-level Error Boundary (2026-05-28)
// Surfaces ANY JS crash at boot with a visible red-screen error message
// instead of a blank screen. Without this, every previous startup crash
// (CORRUPT-001, PUSH-001, expo-font mismatch) presented as "the app launches
// and instantly dies with no feedback", making every root-cause hunt blind.
// ---------------------------------------------------------------------------

interface BootErrorBoundaryState {
  error: Error | null;
}

class BootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BootErrorBoundaryState
> {
  state: BootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BootErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[BootErrorBoundary] Crash at app root:', error, info?.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <ScrollView
          style={{ flex: 1, backgroundColor: '#0f172a' }}
          contentContainerStyle={{ padding: 24, paddingTop: 80 }}
        >
          <Text style={{ color: '#fca5a5', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
            Peak Fettle failed to start
          </Text>
          <Text style={{ color: '#fff', fontSize: 14, marginBottom: 16 }}>
            {String(this.state.error?.message ?? this.state.error)}
          </Text>
          <Text style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>
            {String(this.state.error?.stack ?? '')}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Inner component — has access to AuthContext via useAuth()
// ---------------------------------------------------------------------------

function RootNavigator(): React.ReactElement {
  const { isLoading } = useAuth();
  const { theme } = useTheme();

  useEffect(() => {
    if (!isLoading) {
      registerForPushNotificationsAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={theme.colors.accentDefault} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="health-metrics" options={{ headerShown: false }} />
        <Stack.Screen name="groups" options={{ headerShown: false }} />
        <Stack.Screen name="group-detail" options={{ headerShown: false }} />
        <Stack.Screen name="glossary" options={{ title: 'Glossary', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="splash" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="intro" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="templates" options={{ title: 'Workout Templates', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="csv-import" options={{ title: 'Import Activity Data', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="routines" options={{ title: 'Routines', headerShown: false, gestureEnabled: true }} />
        <Stack.Screen name="exercise-library" options={{ title: 'Exercise Library', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="progress" options={{ title: 'Progress', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="workout-day" options={{ title: '', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="workout-history" options={{ title: 'Workout History', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="cosmetics" options={{ title: 'Achievements & Shop', headerShown: true, gestureEnabled: true }} />
      </Stack>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout — provides ThemeProvider + AuthContext + PowerSync to the tree
// ---------------------------------------------------------------------------

export default function RootLayout(): React.ReactElement {
  // TICKET-057: Load Outfit font family (offline-bundled in assets/fonts/).
  // 2026-05-28: capture error and don't block forever if font load fails — the
  // app stayed blank when expo-font returned an error before the bump.
  const [fontsLoaded, fontError] = useFonts({
    'Outfit-Regular':  require('../assets/fonts/Outfit-Regular.ttf'),
    'Outfit-Medium':   require('../assets/fonts/Outfit-Medium.ttf'),
    'Outfit-SemiBold': require('../assets/fonts/Outfit-SemiBold.ttf'),
    'Outfit-Bold':     require('../assets/fonts/Outfit-Bold.ttf'),
  });

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#0f172a' }} />;
  }

  return (
    <BootErrorBoundary>
      <ThemeProvider
        onThemeChange={async (newTheme: ThemeName) => {
          await patchProfile({ theme_preference: newTheme }).catch(() => {});
        }}
      >
        <AuthProvider>
          <PowerSyncProvider>
            <RootNavigator />
          </PowerSyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </BootErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
