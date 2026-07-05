/**
 * Player session (TICKET-165) — ephemeral, in-memory cross-screen contract
 * between the stack player and the Today tab's floating "resume" pill.
 *
 * Ownership: `app/stack-player.tsx` is the SOLE mutator (setPlayerSession /
 * updatePlayerSession). Today (and any other screen) is a READ-ONLY consumer
 * via `usePlayerSession()` — it renders a minimized-run resume affordance and
 * never writes back here.
 *
 * Intentionally ephemeral: this is a plain module-level singleton with no
 * DB/AsyncStorage backing. An app restart (or even a full JS reload) simply
 * drops the session — that's fine, because every step the player logs is
 * already persisted through the habits.ts data layer (lo_habit_logs) the
 * moment it happens. Losing this object loses only the "there's a run in
 * progress, tap to resume" affordance, never any actual habit data.
 *
 * No deps beyond React (for the hook) — pure state + pub/sub.
 */

import { useSyncExternalStore } from 'react';

export interface PlayerSessionState {
  stackId: string;
  stackName: string;
  stepIndex: number;
  totalSteps: number;
  doneCount: number;
  minimized: boolean;
  startedAtISO: string;
}

let state: PlayerSessionState | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Current session snapshot, or null when no run is active. */
export function getPlayerSession(): PlayerSessionState | null {
  return state;
}

/** Replace the whole session (pass null to end/clear it). Mutator: stack-player only. */
export function setPlayerSession(next: PlayerSessionState | null): void {
  state = next;
  notify();
}

/** Shallow-patch the active session. No-op (does not create a session) when none is active. */
export function updatePlayerSession(patch: Partial<PlayerSessionState>): void {
  if (!state) return;
  state = { ...state, ...patch };
  notify();
}

/** Subscribe to session changes. Returns an unsubscribe function. */
export function subscribePlayerSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — re-renders the caller whenever the session changes. */
export function usePlayerSession(): PlayerSessionState | null {
  return useSyncExternalStore(subscribePlayerSession, getPlayerSession, getPlayerSession);
}
