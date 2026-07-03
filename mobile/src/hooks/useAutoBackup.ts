/**
 * useAutoBackup — TICKET-094 (Agent G)
 *
 * Triggers maybeAutoBackup() on two lifecycle events:
 *   1. App moves to 'background' — AppState listener.
 *   2. Hook mounts (app launch / tab mount) — one-shot effect.
 *
 * Free tier only: no-ops for Pro users (usesBlobBackup returns false for Pro).
 * Uses useAuth() to get the current user, matching the pattern in insights.tsx.
 *
 * Never throws — maybeAutoBackup swallows all errors internally.
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, InteractionManager } from 'react-native';
import { useAuth } from './useAuth';
import { usesBlobBackup } from '../data/backup/tierPolicy';
import { maybeAutoBackup } from '../data/backup/backupManager';

export function useAutoBackup(): void {
  const { user } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Determine whether this user's tier warrants the blob backup.
  const shouldBackup = usesBlobBackup(user);

  useEffect(() => {
    if (!shouldBackup) return;

    // Launch trigger (2026-07-03 free-tier responsiveness fix): DEFERRED.
    // This used to fire synchronously with the tab-layout mount. backupNow()
    // SELECT*s every table (sets/workouts grow unboundedly) and canonicalizes
    // the whole document with a synchronous recursive stringify on the JS
    // thread - convoying Home's first-paint queries on the shared SQLite
    // connection and blocking tap handlers for seconds. It is FREE-TIER-ONLY
    // (usesBlobBackup), which is exactly why only free users felt the lag.
    // Defer past first interactions + a generous delay; the 6h debounce inside
    // maybeAutoBackup still applies, and the background-transition trigger
    // below stays immediate (the user is not interacting then, which is the
    // ideal moment to pay the backup cost).
    const LAUNCH_BACKUP_DELAY_MS = 20_000;
    let launchTimer: ReturnType<typeof setTimeout> | null = null;
    const launchTask = InteractionManager.runAfterInteractions(() => {
      launchTimer = setTimeout(() => {
        launchTimer = null;
        maybeAutoBackup('launch');
      }, LAUNCH_BACKUP_DELAY_MS);
    });

    // Background trigger — fires whenever the app moves to background.
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appStateRef.current !== 'background' &&
          nextState === 'background'
        ) {
          maybeAutoBackup('background');
        }
        appStateRef.current = nextState;
      },
    );

    return () => {
      launchTask.cancel();
      if (launchTimer) clearTimeout(launchTimer);
      subscription.remove();
    };
  }, [shouldBackup]);
}
