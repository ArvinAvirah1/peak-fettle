/**
 * Forgiving streak engine (TICKET-103, Q23) — pure functions over
 * YYYY-MM-DD day keys. No Date.now() inside compute paths: callers pass
 * `today`, which keeps everything unit-testable and timezone-explicit.
 *
 * Semantics (ports the fitness app's forgiving model, spec §TICKET-103):
 *   - 'done' and 'rest' days are ACTIVE — they extend and count in the streak.
 *   - 'skip' is NEUTRAL — an intentional pause: it neither counts nor breaks.
 *   - An unlogged day is a MISS. ONE missing day is forgiven when the next
 *     (more recent) logged day is 'done'. Two consecutive missing days break
 *     the chain.
 *   - `today` being unlogged never breaks anything — it is pending, not a miss.
 *   - Copy rule (CONTENT_SAFETY.md §3): breaks render as gaps, never as red.
 */

export type LogStatus = 'done' | 'rest' | 'skip';

export interface StreakResult {
  /** Count of active (done/rest) days in the current unbroken chain. */
  current: number;
  /** Longest chain ever observed in the provided logs. */
  longest: number;
  /** Milestone reached at or below `current` (null below 7). */
  milestone: 7 | 30 | 100 | 365 | null;
}

export const MILESTONES = [365, 100, 30, 7] as const;

// --- day-key arithmetic ------------------------------------------------------

export function addDays(dayKeyStr: string, delta: number): string {
  const [y, m, d] = dayKeyStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + delta);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / 86_400_000);
}

/** Monday-of-week for a day key (weekly review anchoring). */
export function weekStart(dayKeyStr: string): string {
  const [y, m, d] = dayKeyStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(dayKeyStr, -back);
}

// --- streak computation --------------------------------------------------------

/**
 * Compute the current + longest forgiving streak.
 *
 * @param logs   map of dayKey → status for one habit (or a merged "any habit
 *               done" map for whole-person streaks)
 * @param today  the caller's local day key
 */
export function computeStreak(logs: Map<string, LogStatus>, today: string): StreakResult {
  const current = chainEndingAt(logs, today, true);
  let longest = current;

  // Longest-ever: evaluate a chain ending at every logged active day.
  // O(n²) worst case but n = logged days for one habit — fine on device.
  for (const [day, status] of logs) {
    if (status === 'done' || status === 'rest') {
      const len = chainEndingAt(logs, day, false);
      if (len > longest) longest = len;
    }
  }

  let milestone: StreakResult['milestone'] = null;
  for (const m of MILESTONES) {
    if (current >= m) {
      milestone = m;
      break;
    }
  }

  return { current, longest, milestone };
}

/**
 * Length of the unbroken chain whose most recent day is `end`.
 * When `endIsPending` is true, an unlogged `end` day is treated as pending
 * (walk starts the day before); otherwise an unlogged end means length 0.
 */
function chainEndingAt(logs: Map<string, LogStatus>, end: string, endIsPending: boolean): number {
  let cursor = end;
  let count = 0;
  let lastSeenDone = false; // was the most recent *logged* day in the walk a 'done'?
  let pendingGap = 0; // consecutive unlogged days currently being crossed

  const endStatus = logs.get(end);
  if (endStatus === undefined) {
    if (!endIsPending) return 0;
    cursor = addDays(end, -1);
  }

  // Safety bound: never walk more than 5 years.
  for (let i = 0; i < 1830; i++) {
    const status = logs.get(cursor);

    if (status === 'done' || status === 'rest') {
      // Crossing a 1-day gap requires the more-recent logged day to be 'done'.
      if (pendingGap === 1 && !lastSeenDone) break;
      if (pendingGap >= 2) break;
      count += 1;
      pendingGap = 0;
      lastSeenDone = status === 'done';
    } else if (status === 'skip') {
      // Neutral: pause the chain without breaking or counting.
      if (pendingGap === 1 && !lastSeenDone) break;
      if (pendingGap >= 2) break;
      pendingGap = 0;
      // 'skip' is not 'done' — it cannot redeem an earlier (older) gap.
      lastSeenDone = false;
    } else {
      pendingGap += 1;
      if (pendingGap >= 2) break; // two unlogged days in a row: chain over
    }

    cursor = addDays(cursor, -1);
  }

  return count;
}

// --- consistency (goals + insights) ---------------------------------------------

/**
 * Share of the last `windowDays` days with an active log (done/rest), for the
 * honest two-signal goal progress display (spec §TICKET-105 — never a single
 * judgmental score). Skips are excluded from numerator AND denominator.
 */
export function consistency(
  logs: Map<string, LogStatus>,
  today: string,
  windowDays = 28
): { active: number; eligible: number; ratio: number } {
  let active = 0;
  let eligible = 0;
  for (let i = 0; i < windowDays; i++) {
    const day = addDays(today, -i);
    const status = logs.get(day);
    if (status === 'skip') continue;
    eligible += 1;
    if (status === 'done' || status === 'rest') active += 1;
  }
  return { active, eligible, ratio: eligible === 0 ? 0 : active / eligible };
}
