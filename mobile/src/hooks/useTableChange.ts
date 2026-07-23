/**
 * useTableChange — subscribe a screen/hook to localDb table-change notifications.
 *
 * Home-staleness fix (2026-07-22): Home's data hooks (useWorkout,
 * useWorkoutHistory) and the RoutineStrip each load ONCE on mount, while the
 * always-mounted WorkoutLoggerHost writes through its own usePowerSyncLog
 * instance — so a workout logged mid-session (or a routine edited elsewhere)
 * never reached Home's state and the screen showed "no sets / no sessions / no
 * routines" despite fresh local data. localDb.execute() already notify()s the
 * affected tables; this hook turns those notifications into a debounced reload
 * callback.
 *
 * The first watch() yield (immediate-on-entry) is skipped — the caller's mount
 * effect already did the initial load. Bursts (a set logged every few seconds)
 * coalesce into one trailing reload per `debounceMs`.
 *
 * Local-first note: table notifications only fire for LOCAL writes, so gate
 * `enabled` to isLocalFirst(user) when the reload would otherwise issue REST
 * calls — Pro screens refresh on focus / finish instead (no mount-path REST is
 * added by this hook either way).
 */

import { useEffect, useRef } from 'react';
import { localDb, makeWatchToken } from '../db/localDb';

export function useTableChange(
  tables: string[],
  onChange: () => void,
  opts?: { enabled?: boolean; debounceMs?: number },
): void {
  const enabled = opts?.enabled ?? true;
  const debounceMs = opts?.debounceMs ?? 500;
  // Latest-callback ref so the watch loop never restarts on a new closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const tablesKey = tables.join(',');

  useEffect(() => {
    if (!enabled) return;
    const token = makeWatchToken();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      try {
        let first = true;
        for await (const _ of localDb.watch('SELECT 1', [], {
          tables: new Set(tablesKey.split(',')),
          token,
        })) {
          if (cancelled) break;
          if (first) {
            // Immediate on-entry yield — the caller already loaded on mount.
            first = false;
            continue;
          }
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            if (!cancelled) onChangeRef.current();
          }, debounceMs);
        }
      } catch {
        // watch() throws when the generator is torn down — expected.
      }
    })();

    return () => {
      cancelled = true;
      token.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [tablesKey, enabled, debounceMs]);
}
