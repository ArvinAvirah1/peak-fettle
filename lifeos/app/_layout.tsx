/**
 * Root layout — providers + the pending-unlock handoff.
 *
 * Gating order (spec §TICKET-101/100/107) lives in app/index.tsx:
 *   auth → entitlement → disclaimer → survey → tabs.
 *
 * Shield handoff (TICKET-104): shield extensions can't open the app, so on
 * every foreground we consume the App Group pending-unlock marker and route
 * into the friction flow.
 */

import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/auth/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import { localDb } from '../src/db/localDb';
import { blocking, isBlockingAvailable } from '../src/native/blocking';
import { startWidgetBridge } from '../src/services/widgetBridge';

function PendingUnlockWatcher(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isBlockingAvailable()) return;

    const check = async (): Promise<void> => {
      const marker = await blocking.consumePendingUnlock();
      if (marker != null) {
        router.push('/unlock');
      }
    };

    void check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

function RootStack(): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgPrimary },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.bgPrimary },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding/disclaimer" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="onboarding/survey" options={{ title: 'About you' }} />
      <Stack.Screen name="onboarding/plan-reveal" options={{ title: 'Your plan' }} />
      <Stack.Screen name="upsell" options={{ headerShown: false }} />
      <Stack.Screen name="stack-player" options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="habit-editor" options={{ presentation: 'modal', title: 'Habit' }} />
      <Stack.Screen name="goal-detail" options={{ title: 'Goal' }} />
      <Stack.Screen name="weekly-review" options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="mood-checkin" options={{ presentation: 'modal', title: 'Check in' }} />
      <Stack.Screen name="exercises" options={{ title: 'Exercises' }} />
      <Stack.Screen name="exercise-player" options={{ presentation: 'fullScreenModal', headerShown: false }} />
      <Stack.Screen name="unlock" options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="focus-editor" options={{ presentation: 'modal', title: 'Focus rule' }} />
      <Stack.Screen name="data-handling" options={{ title: 'Your data' }} />
      <Stack.Screen name="crisis-help" options={{ title: 'Need help?' }} />
      <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
      <Stack.Screen name="partner" options={{ title: 'Accountability partner' }} />
      <Stack.Screen name="share-card" options={{ title: 'Milestone card', presentation: 'modal' }} />
      <Stack.Screen name="app-wellbeing" options={{ title: 'App wellbeing' }} />
      <Stack.Screen name="affirmations" options={{ title: 'Affirmations' }} />
    </Stack>
  );
}

export default function RootLayout(): React.ReactElement {
  useEffect(() => {
    // Init the local DB, then start the widget bridge (iOS-only, idempotent,
    // self-guarded) so the first payload build queries an initialised DB. The
    // bridge then re-publishes on watched-table changes (TICKET-116).
    void localDb.init().then(() => startWidgetBridge());
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <StatusBar style="auto" />
              <PendingUnlockWatcher />
              <RootStack />
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
