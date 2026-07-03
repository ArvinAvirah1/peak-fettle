/**
 * Root layout — wraps the entire app in <ThemeProvider> + <AuthProvider> + <PowerSyncProvider>
 * and implements the auth guard.
 *
 * 2026-05-28 IOS-26-CRASH-FIX:
 * Removed `useFonts` call from this file. Diff analysis vs known-working
 * commit 0088129 (pre-TICKET-051+) showed that the ONLY new boot-time
 * native TurboModule call introduced since the working build was
 * useFonts({ Outfit-Regular, Medium, SemiBold, Bold }) added in TICKET-057.
 *
 * Crash log PeakFettle-2026-05-28-174319.ips on iOS 26.5 PUBLIC release
 * showed an ObjC TurboModule throwing NSException at boot, which Hermes
 * could not safely convert to a JS error — segfaulting the app before
 * any UI rendered. Every other boot-time call (push registration,
 * SecureStore reads, AsyncStorage, status bar) was already present in
 * the working build, so they are NOT the culprit.
 *
 * Fonts now fall back to iOS system font (San Francisco). The Outfit
 * font referenced by src/theme/tokens.ts `fontFamily.*` constants will
 * simply not resolve on iOS — RN falls back gracefully. Visual difference
 * is limited to the BrandLogo horizontal variant and stepper screens.
 *
 * UPDATE 2026-05-29 (IOS-26-CRASH-FIX, part 2): Do NOT re-add useFonts here.
 * The Outfit + Ionicons fonts are now EMBEDDED natively at build time via the
 * `expo-font` config plugin in app.json, so they resolve by fontFamily name
 * with NO runtime loadAsync (the call that crashed iOS 26). Re-adding useFonts
 * would re-introduce the boot crash. Icons render via src/components/Icon.tsx,
 * a <Text>-glyph shim that never calls expo-font.loadAsync.
 */

import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Text, ScrollView, InteractionManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider } from '../src/context/AuthContext';
import { PowerSyncProvider } from '../src/context/PowerSyncContext';
import { useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, useTheme, ThemeName } from '../src/theme/ThemeContext';
import { patchProfile } from '../src/api/user';
import * as SecureStore from 'expo-secure-store';
import { registerForPushNotificationsAsync } from '../src/services/pushNotifications';
import { TourProvider } from '../src/components/tour/WelcomeTour'; // TICKET-095
import { startWidgetBridge } from '../src/services/widgetBridge'; // WIDGET-001
import { localDb } from '../src/db/localDb'; // warm on-device SQLite once at root
import { startPerfMonitor } from '../src/diagnostics/perfMonitor';

// Perf diagnostics (2026-07-02): start at BUNDLE EVAL, before first render, so
// the boot window - where the free-tier freeze lives - is captured. JS-only
// (timers + method wrappers), no native modules, so it cannot trip the iOS-26
// boot-frame TurboModule hazard documented above. Surfaced in app/diagnostics.tsx.
startPerfMonitor();

// ---------------------------------------------------------------------------
// Root-level Error Boundary (2026-05-28)
// Surfaces ANY JS crash at boot with a visible red-screen error message
// instead of a blank screen. Cannot catch native-level crashes (e.g. Hermes
// segfault from NSException) — for those the iOS crash log is the only signal.
// ---------------------------------------------------------------------------

// IOS-RELEASE-ROUTE-FIX (2026-05-29): make "index" the deterministic initial
// route for the root Stack so expo-router never has to resolve "/" to an
// implicit/undefined node in the Release (sync) bundle.
export const unstable_settings = {
  initialRouteName: 'index',
};

interface BootErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

class BootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  BootErrorBoundaryState
> {
  state: BootErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<BootErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[BootErrorBoundary] Crash at app root:', error, info?.componentStack);
    // Persist the component stack so it renders on-screen too — if a route ever
    // fails to resolve again, the stack names the offending screen component
    // (the raw error message does not). Avoids another blind crash-report loop.
    this.setState({ componentStack: info?.componentStack ?? null });
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
          {this.state.componentStack ? (
            <Text style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace', marginTop: 12 }}>
              {`Component stack:${this.state.componentStack}`}
            </Text>
          ) : null}
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
  const { isLoading, isAuthenticated } = useAuth();
  const { theme } = useTheme();

  // Push-token registration (IOS-26-CRASH-FIX, part 3 — 2026-05-30).
  // Two changes vs the old "fire on !isLoading" effect:
  //   1. Gate on isAuthenticated. registerPushToken() hits an authenticated
  //      endpoint, so firing at boot for logged-out users was a no-op that still
  //      triggered expo-notifications' native calls + permission prompt. The only
  //      case this effect must cover is silent-refresh auto-login (which IS
  //      authenticated); explicit login/register already register in AuthContext.
  //   2. Defer off the fragile app-boot frame via InteractionManager. On iOS 26,
  //      a TurboModule NSException thrown during the first ~2s of startup corrupts
  //      the Hermes heap (the underlying RN bug — see
  //      patches/react-native+0.81.5.patch). Keeping expo-notifications' native
  //      calls off the boot critical path avoids tripping that window at all.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    const task = InteractionManager.runAfterInteractions(() => {
      registerForPushNotificationsAsync();
    });
    return () => task.cancel();
  }, [isLoading, isAuthenticated]);

  // WIDGET-001 (2026-06-11): publish next-split / PRs / goals to the iOS
  // home & lock screen widget via App Group storage. Local-data only, so it
  // does NOT gate on auth. Deferred off the boot frame for the same iOS 26
  // reason as push registration above; the bridge is iOS-only and inert when
  // the native module is absent (Expo Go / Android).
  useEffect(() => {
    if (isLoading) return;
    const task = InteractionManager.runAfterInteractions(() => {
      startWidgetBridge();
    });
    return () => task.cancel();
  }, [isLoading]);

  // Warm the on-device SQLite database ONCE at the app root so no individual tab
  // pays the cold open/migrate cost on its first focus (the Routines/Home lists
  // would otherwise stall on init the first time they mount). Fire-and-forget:
  // localDb.init() is idempotent and shares a single init promise, so later
  // callers just await the already-resolved warm-up. Deferred off the boot frame
  // for the same iOS 26 TurboModule reason as the effects above; runs once on
  // mount (empty deps) and is auth-agnostic — local data exists for every tier.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      localDb.init().catch(() => {});
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* TICKET-095: TourProvider wraps the Stack so the coach-mark overlay can
          render above the tabs and drive navigation as the user steps through. */}
      <TourProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          // 2026-06-10 aesthetic pass: consistent, smooth pushes everywhere
          // (Android otherwise defaults to an abrupt fade-from-bottom).
          animation: 'slide_from_right',
          animationDuration: 280,
          // Theme the native stack header so screens like Trends / Workout
          // Templates ("Browse plans") don't show a bare white bar that clashes
          // with the app theme. Applies to every screen that sets headerShown.
          headerStyle: { backgroundColor: theme.colors.bgPrimary },
          headerTintColor: theme.colors.textPrimary,
          headerTitleStyle: { color: theme.colors.textPrimary },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.bgPrimary },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade', animationDuration: 220 }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade', animationDuration: 220 }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="health-metrics" options={{ headerShown: false }} />
        <Stack.Screen name="groups" options={{ headerShown: false }} />
        <Stack.Screen name="group-detail" options={{ headerShown: false }} />
        <Stack.Screen name="glossary" options={{ title: 'Glossary', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="one-rm" options={{ title: '1RM calculator', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Diagnostics', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="splash" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="intro" options={{ headerShown: false, gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="templates" options={{ title: 'Workout Templates', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="csv-import" options={{ title: 'Import Activity Data', headerShown: true, gestureEnabled: true }} />
<Stack.Screen name="exercise-library" options={{ title: 'Exercise Library', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="progress" options={{ title: 'Progress', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="workout-day" options={{ title: '', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="workout-history" options={{ title: 'Workout History', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="routine-history" options={{ title: '', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="trends" options={{ title: 'Trends', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="cosmetics" options={{ title: 'Achievements & Shop', headerShown: true, gestureEnabled: true }} />
        <Stack.Screen name="plan-survey" options={{ title: 'Plan builder', headerShown: true, gestureEnabled: true }} />
      </Stack>
      </TourProvider>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout — provides ThemeProvider + AuthContext + PowerSync to the tree
// ---------------------------------------------------------------------------

// Module-level (stable identity) on purpose — VERIFY 2026-07-01, Bug 1 hardening.
// ThemeContext memoises its context value with `setTheme` in the dependency
// chain, and `setTheme` is useCallback'd on [onThemeChange]. An INLINE arrow here
// would mint a new function on every RootLayout render, silently defeating the
// whole-tree memoization that fixes the free-tier touch lag. RootLayout is
// stateless today (renders once), but hoisting removes the footgun permanently.
async function syncThemeToServerIfPro(newTheme: ThemeName): Promise<void> {
  // Local-first: ThemeProvider already persists the choice to AsyncStorage.
  // Only SYNC to the server for confirmed Pro users — free/local-first users
  // must make NO personal REST call. This runs above AuthProvider, so we read
  // the cached profile (written by AuthContext) to get the tier.
  try {
    const cached = await SecureStore.getItemAsync('peak_fettle_user_profile');
    if (cached && JSON.parse(cached)?.is_paid) {
      await patchProfile({ theme_preference: newTheme }).catch(() => {});
    }
  } catch {
    // unreadable / web / free → no server sync (local-first)
  }
}

export default function RootLayout(): React.ReactElement {
  // useFonts removed (IOS-26-CRASH-FIX above). System fonts will be used.
  return (
    // GestureHandlerRootView must wrap the whole app so any RNGH gesture
    // (swipeable routine rows, drag-to-reorder, swipe-between-exercises) has a
    // valid root ancestor — without it those components crash on render.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BootErrorBoundary>
        <ThemeProvider onThemeChange={syncThemeToServerIfPro}>
          <AuthProvider>
            <PowerSyncProvider>
              <RootNavigator />
            </PowerSyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </BootErrorBoundary>
    </GestureHandlerRootView>
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
