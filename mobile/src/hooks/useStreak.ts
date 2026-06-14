/**
 * useStreak — pure hook that computes the current week-streak from a list of
 * Workout objects.
 *
 * ── CANONICAL STREAK DEFINITION (TICKET-054) ────────────────────────────────
 * A week counts as "active" if the workouts array contains at least one row
 * whose day_key falls in that ISO week — REGARDLESS of session_type.
 * That means lift sessions, rest_day rows, and cardio_import rows all satisfy
 * the weekly requirement.  Rationale: logging a rest day is intentional
 * self-care; it should preserve the streak just as a lift would.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Definition: count consecutive ISO weeks (Monday–Sunday) going backward from
 * the current week where at least one workout row was logged.
 *
 * Special rule: the current week is NOT penalised for having 0 workouts yet —
 * it is still "live". The streak can only be broken by a fully elapsed week
 * with 0 workouts.
 *
 * Extracted as a standalone hook so it can be unit-tested without any API
 * layer involvement.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Workout } from '../types/api';
import { isoWeekKey, daysAgo, toDateKey } from '../utils/dateHelpers';
import { useAuth } from './useAuth';
import { isLocalFirst } from '../data/backup/tierPolicy';
import { localDb } from '../db/localDb';

/**
 * Returns the current week-streak given a list of workouts.
 * @param workouts - Any array of Workout objects (order irrelevant).
 * @returns Number of consecutive weeks with ≥1 workout ending with the most
 *          recent completed week that has a workout (or 0 if none).
 */
export function computeStreak(workouts: Workout[]): number {
  if (workouts.length === 0) return 0;

  // Build a Set of ISO week keys that have at least one workout.
  const weeksWithWorkout = new Set<string>();
  for (const w of workouts) {
    // Guard: a malformed day_key must not poison the week set with NaN dates.
    const [year = NaN, month = NaN, day = NaN] = w.day_key.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) continue;
    weeksWithWorkout.add(isoWeekKey(new Date(year, month - 1, day)));
  }

  const currentWeekKey = isoWeekKey(new Date());

  let streak = 0;
  // Walk backwards week by week starting from the current week.
  const cursor = new Date();

  // Move cursor to Monday of the current week.
  const dayOfWeek = (cursor.getDay() + 6) % 7; // 0=Mon … 6=Sun
  cursor.setDate(cursor.getDate() - dayOfWeek);

  // The current week is always counted as "live" — skip it for break-checking
  // but include it in the streak if it has a workout.
  let firstIteration = true;

  while (true) {
    const weekKey = isoWeekKey(cursor);
    const hasWorkout = weeksWithWorkout.has(weekKey);

    if (firstIteration) {
      // Current week: include in streak if it has a workout, but don't break
      // the streak if it doesn't (week is still in progress).
      if (hasWorkout) streak++;
      firstIteration = false;
    } else {
      if (!hasWorkout) break; // Gap found — streak ends
      streak++;
    }

    // Move cursor back 7 days to the previous Monday.
    cursor.setDate(cursor.getDate() - 7);

    // Safety: stop after 520 weeks (10 years) to prevent infinite loops.
    if (streak > 520) break;
  }

  return streak;
}

/**
 * React hook wrapper around computeStreak — memoises the result so it only
 * recomputes when the workouts array reference changes.
 */
export function useStreak(workouts: Workout[]): number {
  return useMemo(() => computeStreak(workouts), [workouts]);
}

// ---------------------------------------------------------------------------
// useLocalStreak — self-contained, NEVER-HANGS streak source for the Home tab
// (Workstream B, SPEC-094A). Free/local-first users have no PowerSync/server to
// wait on; this hook reads the on-device `workouts` table directly and computes
// the streak with the same canonical definition above.
//
// Hang-proofing: the local read is raced against a hard timeout, so the section
// resolves to a number (worst case 0) within ~1s even if SQLite stalls — the
// Home tab must never show an infinite spinner for the streak (the bug this
// fixes). A rejected/slow read falls back to streak 0 rather than pinning
// isLoading=true forever.
//
// Pro behaviour is intentionally untouched: for syncsToServer users this hook is
// a pass-through that returns the streak/loading the caller already derived from
// the server (via useWorkoutHistory), so no duplicate REST call is made and the
// existing Pro data path is preserved verbatim.
// ---------------------------------------------------------------------------

const LOCAL_STREAK_TIMEOUT_MS = 1000;

export interface UseLocalStreakResult {
  streak: number;
  isLoading: boolean;
}

interface LocalWorkoutDayRow {
  day_key: string;
}

/** Wrap a promise so it can never hang the UI: resolves to `fallback` after `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);
    p.then(
      (v) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(v);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      }
    );
  });
}

/**
 * Streak for the Home tab that resolves within ~1s regardless of tier.
 *
 * @param proStreak   - streak already computed for Pro users (from useWorkoutHistory)
 * @param proLoading  - that hook's loading flag (Pro only)
 *
 * For local-first users both args are ignored and the streak is read from
 * on-device SQLite (timeout-guarded). For Pro users the args are passed through
 * unchanged, so the existing server-backed behaviour is preserved exactly.
 */
export function useLocalStreak(
  proStreak: number,
  proLoading: boolean
): UseLocalStreakResult {
  const { user } = useAuth();
  const localFirst = isLocalFirst(user);

  const [localStreak, setLocalStreak] = useState(0);
  const [localLoading, setLocalLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLocal = useCallback(async () => {
    setLocalLoading(true);
    // Pull a generous window so a long-running streak is captured, but bound it
    // (3 years) so the query stays cheap. The canonical streak only needs the
    // most recent unbroken run of weeks anyway.
    const from = daysAgo(365 * 3);
    const to = toDateKey(new Date());

    const rows = await withTimeout<LocalWorkoutDayRow[]>(
      (async () => {
        await localDb.init();
        return localDb.getAll<LocalWorkoutDayRow>(
          `SELECT day_key FROM workouts
             WHERE day_key >= ? AND day_key <= ?
             ORDER BY day_key DESC`,
          [from, to]
        );
      })(),
      LOCAL_STREAK_TIMEOUT_MS,
      [] // worst case: no rows → streak 0, never a hang
    );

    if (!mountedRef.current) return;

    // computeStreak only reads day_key off each Workout; a minimal shape is enough.
    const workouts = rows
      .filter((r) => typeof r?.day_key === 'string' && r.day_key.length > 0)
      .map((r) => ({ day_key: r.day_key }) as Workout);

    setLocalStreak(computeStreak(workouts));
    setLocalLoading(false);
  }, []);

  useEffect(() => {
    if (!localFirst) return;
    loadLocal();
  }, [localFirst, loadLocal]);

  if (!localFirst) {
    return { streak: proStreak, isLoading: proLoading };
  }
  return { streak: localStreak, isLoading: localLoading };
}
