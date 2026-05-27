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

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';

import { AuthProvider } from '../src/context/AuthContext';
import { PowerSyncProvider } from '../src/context/PowerSyncContext';
import { useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, useTheme, ThemeName } from '../src/theme/ThemeContext';
import { patchProfile } from '../src/api/user';
import { registerForPushNotificationsAsync } from '../src/services/pushNotifications';

// ---------------------------------------------------------------------------
// Inner component — has access to AuthContext via useAuth()
// ---------------------------------------------------------------------------

function RootNavigator(): React.ReactElement {
  const { isLoading } = useAuth();
  // Access theme tokens so the loading spinner uses the design system —
  // no hardcoded hex values in this file (E-001 acceptance criterion).
  const { theme } = useTheme();

  // TICKET-024: Register for push notifications once the auth state has resolved.
  // Silent — registerForPushNotificationsAsync swallows all errors internally.
  useEffect(() => {
    if (!isLoading) {
      registerForPushNotificationsAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    // Show a loading spinner while the cold-start refresh runs.
    // This prevents flashing the login screen on every app open for
    // already-authenticated users.
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={theme.colors.accentDefault} />
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
        {/* Glossary — TICKET-043 / ROADMAP 1.1 */}
        <Stack.Screen name="glossary" options={{ title: 'Glossary', headerShown: true, gestureEnabled: true }} />
        {/* P2-001: Animated splash — routes new vs returning users */}
        <Stack.Screen name="splash" options={{ headerShown: false, gestureEnabled: false }} />
        {/* §2.2: Day 1 beginner intro — shown once after first launch */}
        <Stack.Screen name="intro" options={{ headerShown: false, gestureEnabled: false }} />
        {/* PL-1: Workout template browser */}
        <Stack.Screen name="templates" options={{ title: 'Workout Templates', headerShown: true, gestureEnabled: true }} />
        {/* PL-2: CSV import from Garmin / Strava */}
        <Stack.Screen name="csv-import" options={{ title: 'Import Activity Data', headerShown: true, gestureEnabled: true }} />
        {/* P2-002: Exercise Library — searchable/filterable browse screen */}
        <Stack.Screen name="exercise-library" options={{ title: 'Exercise Library', headerShown: true, gestureEnabled: true }} />
        {/* Progress & Analytics push screen */}
        <Stack.Screen name="progress" options={{ title: 'Progress', headerShown: true, gestureEnabled: true }} />
        {/* Day-detail drill-down from RECENT ACTIVITY rows */}
        <Stack.Screen name="workout-day" options={{ title: '', headerShown: true, gestureEnabled: true }} />
        {/* Full paginated workout history browse */}
        <Stack.Screen name="workout-history" options={{ title: 'Workout History', headerShown: true, gestureEnabled: true }} />
        {/* Cosmetics & shop — Phase F */}
        <Stack.Screen name="cosmetics" options={{ title: 'Achievements & Shop', headerShown: true, gestureEnabled: true }} />
      </Stack>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout — provides AuthContext + PowerSync to the entire tree
// ---------------------------------------------------------------------------

export default function RootLayout(): React.ReactElement {
  // TICKET-057: Load Outfit font family (offline-bundled in assets/fonts/).
  // fontsLoaded is false on the first frame; expo-router prevents the splash from
  // hiding so we just gate rendering until the fonts are ready.
  const [fontsLoaded] = useFonts({
    'Outfit-Regular':  require('../assets/fonts/Outfit-Regular.ttf'),
    'Outfit-Medium':   require('../assets/fonts/Outfit-Medium.ttf'),
    'Outfit-SemiBold': require('../assets/fonts/Outfit-SemiBold.ttf'),
    'Outfit-Bold':     require('../assets/fonts/Outfit-Bold.ttf'),
  });

  // Hold rendering until fonts are ready to avoid a flash of unstyled text.
  if (!fontsLoaded) return <View style={{ flex: 1 }} />;

  return (
    <ThemeProvider
      onThemeChange={async (newTheme: ThemeName) => {
        // Persist theme preference to Supabase whenever the user changes it.
        // Runs inside ThemeProvider so it has access to the new theme name.
        // Silent — do not block the UI on network availability.
        await patchProfile({ theme_preference: newTheme }).catch(() => {});
      }}
    >
      <AuthProvider>
        <PowerSyncProvider>
          <RootNavigator />
        </PowerSyncProvider>
      </AuthProvider>
    </ThemeProvider>
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
