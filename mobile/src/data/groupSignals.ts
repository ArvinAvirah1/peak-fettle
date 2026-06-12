/**
 * groupSignals — fire-and-forget weekly signal sender for group accountability.
 *
 * Spec §Agent P: on free AND pro, after a workout completes, POST
 * /groups/:id/weekly-signal for each group the user belongs to.
 *
 * The signal carries:
 *   hit_goal      — whether the user has logged ≥ their weekly goal this week
 *   workouts_done — count of workout rows with day_key in the current ISO week
 *   week_start    — the Monday of the current ISO week (YYYY-MM-DD)
 *
 * This module is called from usePowerSyncLog (the workout-save path) as a
 * fire-and-forget side-effect. Network errors are swallowed — never block
 * the logging path.
 *
 * Group IDs are injected by WorkoutLoggerHost (or any component with access to
 * useGroups) via setActiveGroupIds(). The setter is a thin module-level
 * singleton so the hook and component layers don't need a circular import.
 */

import { apiClient } from '../api/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the Monday of the ISO week that contains `date` as YYYY-MM-DD. */
function isoWeekMonday(date: Date): string {
  const d = new Date(date);
  // getDay(): 0=Sun … 6=Sat  →  shift so Mon=0
  const dow = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
  d.setDate(d.getDate() - dow);
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Module-level group-id registry (injected by callers with useGroups access)
// ---------------------------------------------------------------------------

let _activeGroupIds: string[] = [];

/**
 * Set the active group IDs for the current user session.
 * Call this from any component that has access to useGroups.groups, e.g.
 * WorkoutLoggerHost after groups load.
 */
export function setActiveGroupIds(ids: string[]): void {
  _activeGroupIds = ids;
}

/** Read the current registered group IDs. */
export function getActiveGroupIds(): string[] {
  return _activeGroupIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GroupSignalPayload {
  week_start:    string;  // YYYY-MM-DD Monday
  hit_goal:      boolean;
  workouts_done: number;
}

/**
 * POST /groups/:id/weekly-signal for one group.
 * All errors are swallowed — never blocks the caller.
 */
export async function sendWeeklySignal(
  groupId: string,
  payload: GroupSignalPayload
): Promise<void> {
  try {
    await apiClient.post(`/groups/${groupId}/weekly-signal`, payload);
  } catch (err) {
    // Fire-and-forget — warn only.
    console.warn(
      '[PF] groupSignals/sendWeeklySignal:',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Send weekly signals to every group the user belongs to.
 *
 * @param groupIds        Array of group UUIDs the user is a member of.
 *                        Defaults to the module-level registry set via
 *                        setActiveGroupIds().
 * @param workoutsThisWeek  Count of workout rows logged this ISO week.
 * @param weeklyGoal      The user's weekly workout goal (default 3).
 */
export async function maybeSendWeeklySignals(
  groupIds?: string[],
  workoutsThisWeek?: number,
  weeklyGoal: number = 3
): Promise<void> {
  const ids = groupIds ?? _activeGroupIds;
  if (ids.length === 0) return;

  const weekStart     = isoWeekMonday(new Date());
  const done          = workoutsThisWeek ?? 1; // at minimum 1 (the set we just logged)
  const hit_goal      = done >= weeklyGoal;
  const workouts_done = done;

  // Fan out — fire-and-forget for each group.
  void Promise.allSettled(
    ids.map((id) =>
      sendWeeklySignal(id, { week_start: weekStart, hit_goal, workouts_done })
    )
  );
}
