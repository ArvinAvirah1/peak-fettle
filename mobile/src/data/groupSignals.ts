/**
 * groupSignals -- fire-and-forget weekly signal sender for group accountability
 * AND group-scoped leaderboard opt-in aggregates (TICKET-139).
 *
 * Spec Agent P: on free AND pro, after a workout completes, POST
 * /groups/:id/weekly-signal for each group the user belongs to.
 *
 * The signal carries:
 *   hit_goal      -- whether the user has logged >= their weekly goal this week
 *   workouts_done -- count of workout rows with day_key in the current ISO week
 *   week_start    -- the Monday of the current ISO week (YYYY-MM-DD)
 *
 * TICKET-139 (2026-07-03) extends the payload with OPT-IN leaderboard
 * aggregates, PER GROUP, default OFF:
 *   opted_in        -- whether the user has enabled the leaderboard for THIS group
 *   total_volume_kg -- sum of (weight_kg x reps) across lift sets logged this ISO
 *                     week, restricted to sets within plausibility bounds (see
 *                     isPlausibleSet below) -- the anti-gaming guard v1.
 *   streak_weeks    -- the user's current week-streak (from computeStreak), sent
 *                     only when opted in.
 * When opted_in is false the aggregate fields are omitted/zeroed server-side --
 * non-participants must show as "--" in the UI, never as a zero volume (that
 * distinction is made in group-detail.tsx, not here).
 *
 * This module is called from usePowerSyncLog (the workout-save path) as a
 * fire-and-forget side-effect. Network errors are swallowed -- never block
 * the logging path. Rides the ONE sanctioned free-tier network call (CLAUDE.md):
 * no new on-mount fetch is introduced by this ticket, only a bigger payload on
 * the existing weekly-signal POST.
 *
 * Per-group opt-in flag storage: `mobile/src/data/appSettings.ts`'s generic KV
 * (`app_settings` table) under key `group_leaderboard_optin:<groupId>`, value
 * '1' | '0'. This is per-install device config in the same spirit as
 * effort_display / rest_timer_default_sec -- NOT in BACKUP_TABLES (the schema
 * track owns backup registration; this key deliberately doesn't need it, same
 * as the other appSettings keys). Free AND Pro read/write it identically --
 * zero REST, safe to call on mount.
 */

import { apiClient } from '../api/client';
import { getSetting, setSetting } from './appSettings';

// ---------------------------------------------------------------------------
// Anti-gaming guard v1 -- plausibility bounds for volume counting
// ---------------------------------------------------------------------------
//
// KNOWN LIMITATIONS (documented per TICKET-139 acceptance criterion 5):
//   - These are blunt, static bounds -- not the full training-engine model.
//     There is currently no shared `plausibility limits` module in
//     mobile/src/lib/trainingEngine to import from (checked: localContext.ts,
//     exerciseFill.ts, exerciseCatalog.ts -- none export weight/rep sanity
//     bounds), so v1 defines a conservative, exercise-agnostic bound here
//     rather than inventing a new engine-wide module out of scope for this
//     ticket. A future pass should replace this with a per-exercise bound
//     (e.g. deadlift vs lateral raise have very different plausible maxima).
//   - A user CAN still inflate volume within bounds (e.g. many bodyweight-ish
//     reps at a middling weight) -- v1 only rejects obviously-fabricated rows
//     (a 5000 kg squat, a 999-rep set), not sophisticated gaming.
//   - Bounds are per-SET, not per-session -- a user cannot game the guard by
//     splitting one implausible set into several plausible ones, but this is
//     an accepted v1 gap (documented, not solved here).
//   - No cross-checking against the user's own history/1RM -- a flat global
//     cap is intentionally simple for v1.
export const PLAUSIBILITY_MAX_WEIGHT_KG = 400; // beyond all-time raw record lifts
export const PLAUSIBILITY_MAX_REPS = 100; // beyond any plausible single set
export const PLAUSIBILITY_MIN_WEIGHT_KG = 0;
export const PLAUSIBILITY_MIN_REPS = 1;

/** True when a single set's weight x reps is within the anti-gaming bounds. */
export function isPlausibleSet(weightKg: number, reps: number): boolean {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return false;
  if (weightKg < PLAUSIBILITY_MIN_WEIGHT_KG || weightKg > PLAUSIBILITY_MAX_WEIGHT_KG) return false;
  if (reps < PLAUSIBILITY_MIN_REPS || reps > PLAUSIBILITY_MAX_REPS) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the Monday of the ISO week that contains `date` as YYYY-MM-DD. */
function isoWeekMonday(date: Date): string {
  const d = new Date(date);
  // getDay(): 0=Sun ... 6=Sat  ->  shift so Mon=0
  const dow = (d.getDay() + 6) % 7; // 0=Mon ... 6=Sun
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
// Per-group leaderboard opt-in flag (local KV, app_settings table)
// ---------------------------------------------------------------------------

function optInKey(groupId: string): string {
  return `group_leaderboard_optin:${groupId}`;
}

/** Whether the user has opted into the leaderboard for this specific group. Default OFF. */
export async function getLeaderboardOptIn(groupId: string): Promise<boolean> {
  const raw = await getSetting(optInKey(groupId));
  return raw === '1';
}

/** Persist the per-group leaderboard opt-in flag. */
export async function setLeaderboardOptIn(groupId: string, optedIn: boolean): Promise<void> {
  await setSetting(optInKey(groupId), optedIn ? '1' : '0');
}

// ---------------------------------------------------------------------------
// Pure aggregation helpers -- no clock/random reads inside; callers pass `now`
// and already-loaded rows in, per the Workflow lint + testability convention
// established in mobile/src/lib/shareCard/shareCardData.ts.
// ---------------------------------------------------------------------------

/** Minimal shape of a local `sets` row needed for volume aggregation. */
export interface VolumeSetRow {
  kind: string | null;
  weight_kg: number | null;
  weight_raw: number | null;
  reps: number | null;
  logged_at: string | null;
}

/**
 * Sum plausible lift-set volume (weight_kg x reps) for sets logged on/after
 * `weekStartIso` (a YYYY-MM-DD Monday, inclusive). Reads weight via
 * COALESCE(weight_kg, weight_raw/8.0) per the schema-v3 invariant (CLAUDE.md
 * S2). Non-lift sets (cardio) and implausible sets are excluded.
 *
 * Pure: takes the already-queried rows + the week boundary as parameters.
 */
export function sumPlausibleVolumeKg(rows: VolumeSetRow[], weekStartIso: string): number {
  let total = 0;
  for (const r of rows) {
    if (r.kind !== 'lift') continue;
    if (!r.logged_at || r.logged_at.slice(0, 10) < weekStartIso) continue;
    const weight = r.weight_kg != null ? r.weight_kg : r.weight_raw != null ? r.weight_raw / 8 : null;
    const reps = r.reps;
    if (weight == null || reps == null) continue;
    if (!isPlausibleSet(weight, reps)) continue;
    total += weight * reps;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GroupSignalPayload {
  week_start:    string;  // YYYY-MM-DD Monday
  hit_goal:      boolean;
  workouts_done: number;
  /** TICKET-139: whether the leaderboard opt-in aggregates below are meaningful. */
  opted_in?:        boolean;
  /** TICKET-139: plausible lift volume this ISO week, in kg. Only sent when opted_in. */
  total_volume_kg?: number;
  /** TICKET-139: the user's current week-streak. Only sent when opted_in. */
  streak_weeks?:    number;
}

/**
 * POST /groups/:id/weekly-signal for one group.
 * All errors are swallowed -- never blocks the caller.
 */
export async function sendWeeklySignal(
  groupId: string,
  payload: GroupSignalPayload
): Promise<void> {
  try {
    await apiClient.post(`/groups/${groupId}/weekly-signal`, payload);
  } catch (err) {
    // Fire-and-forget -- warn only.
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
 * @param volumeRows      Already-loaded local `sets` rows for volume aggregation
 *                        (TICKET-139). Optional -- omit to send no aggregates
 *                        (e.g. caller hasn't loaded them, or none opted in).
 * @param streakWeeks     Optional current streak-weeks value for this user, sent
 *                        as the leaderboard streak aggregate when a group has
 *                        opted in (opt-in is checked PER GROUP inside this fn).
 */
export async function maybeSendWeeklySignals(
  groupIds?: string[],
  workoutsThisWeek?: number,
  weeklyGoal: number = 3,
  volumeRows?: VolumeSetRow[],
  streakWeeks?: number,
): Promise<void> {
  const ids = groupIds ?? _activeGroupIds;
  if (ids.length === 0) return;

  const weekStart     = isoWeekMonday(new Date());
  const done          = workoutsThisWeek ?? 1; // at minimum 1 (the set we just logged)
  const hit_goal      = done >= weeklyGoal;
  const workouts_done = done;

  const volumeKg = volumeRows ? sumPlausibleVolumeKg(volumeRows, weekStart) : undefined;

  // Fan out -- fire-and-forget for each group. Opt-in is checked PER GROUP so a
  // user can share aggregates in one group and not another.
  void Promise.allSettled(
    ids.map(async (id) => {
      let optedIn = false;
      try {
        optedIn = await getLeaderboardOptIn(id);
      } catch {
        optedIn = false; // best-effort -- never block the signal on a settings read
      }

      const payload: GroupSignalPayload = { week_start: weekStart, hit_goal, workouts_done };
      if (optedIn) {
        payload.opted_in = true;
        if (volumeKg != null) payload.total_volume_kg = volumeKg;
        if (streakWeeks != null) payload.streak_weeks = streakWeeks;
      }

      return sendWeeklySignal(id, payload);
    })
  );
}
