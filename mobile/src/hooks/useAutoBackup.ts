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
import { AppState, AppStateStatus } from 'react-native';
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

    // Launch trigger — run once on mount.
    maybeAutoBackup('launch');

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
      subscription.remove();
    };
  }, [shouldBackup]);
}
