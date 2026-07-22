/**
 * Root layout — providers + the pending-unlock handoff.
 *
 * Gating order (spec §TICKET-101/100/107) lives in app/index.tsx:
 *   auth → entitlement → disclaimer → survey → tabs.
 *
 * Shield handoff (TICKET-104): shield extensions can't open the app, so on
 * every foreground we consume the App Group pending-unlock marker and route
 * into the friction flow. The same watcher consumes the pending-relock marker
 * the Live Activity's "Relock now" intent writes (TICKET-172) and re-applies
 * the enabled shields.
 */

import React, { useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { AuthProvider } from '../src/auth/AuthContext';
import { ToastProvider } from '../src/components/Toast';
import { localDb } from '../src/db/localDb';
import { blocking, isBlockingAvailable } from '../src/native/blocking';
import { consumePendingRelock } from '../modules/live-activity';
import { listFocusConfigs } from '../src/data/focus';
import { startWidgetBridge } from '../src/services/widgetBridge';
import { initObservability } from '../src/observability/sentry'; // 2026-07-21 crash reporting

function PendingUnlockWatcher(): null {
  const router = useRouter();

  useEffect(() => {
    if (!isBlockingAvailable()) return;

    const check = async (): Promise<void> => {
      const marker = await blocking.consumePendingUnlock();
      if (marker != null) {
        router.push('/unlock');
      }

      // TICKET-172: the island's "Relock now" intent (iOS 17+) writes a
      // pending_relock App Group marker — consume it and end the snooze
      // window early by re-applying every enabled rule's shield. The Live
      // Activity itself is already ended optimistically by the intent.
      // Fail-soft: a shield that can't re-apply never blocks foregrounding.
      const relock = consumePendingRelock();
      if (relock != null) {
        try {
          const configs = await listFocusConfigs();
          for (const cfg of configs) {
            if (cfg.enabled === 1 && cfg.selection_token) {
              await blocking.applyShield(cfg.id, cfg.selection_token);
            }
          }
        } catch {
          // never break the foreground path on a relock failure
        }
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

  // Crash reporting (2026-07-21): hard no-op until EXPO_PUBLIC_SENTRY_DSN is
  // set at build time (src/observability/sentry.ts). Deferred off the boot
  // frame — Sentry.init touches native modules, and the sibling app has a
  // documented iOS-26 boot-frame TurboModule crash class.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      initObservability();
    });
    return () => task.cancel();
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
