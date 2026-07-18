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

    // Launch trigger (2026-07-03 first attempt, finished 2026-07-05): DEFERRED
    // *and* now FIRST-BACKUP-ONLY. The 2026-07-03 fix deferred this by 20s, but
    // that only moved the JS-thread freeze (sync stringify + pure-JS AES-GCM in
    // backupNow) to 20s after launch — the tester's recurring "tabs dead for
    // ~5s" bug. maybeAutoBackup('launch') now returns immediately whenever ANY
    // successful backup exists, so this trigger is purely a first-run safety
    // net (tiny DB → negligible cost). Steady-state backups run on the
    // background transition below, when the user is not interacting; that path
    // also aborts if the app comes back to the foreground mid-pipeline. See
    // backupManager.maybeAutoBackup / backupNow({shouldAbort}).
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
