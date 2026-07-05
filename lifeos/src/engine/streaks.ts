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
 *
 * Pause semantics (TICKET-156, added schema v3): a day covered by a habit
 * pause range is TRANSPARENT in the walk — bridged over as if that calendar
 * day did not exist. It never counts, never accumulates a miss-gap, and does
 * NOT reset the "was the most recent logged day a done" redemption memory
 * (unlike 'skip', which IS a logged-day signal and does reset it). A logged
 * day that also happens to be paused still counts normally — an explicit log
 * always wins over a pause. Pauses can be any length and never break a chain.
 */

export type LogStatus = 'done' | 'rest' | 'skip';

export interface StreakResult {
  /** Count of active (done/rest) days in the current unbroken chain. */
  current: number;
  /** Longest chain ever observed in the provided logs. */
  longest: number;
  /** Milestone reached at or below `current` (null below 7). */
  milestone: 7 | 30 | 100 | 365 | null;
  /**
   * Day keys of forgiven single-miss days inside the CURRENT chain, most
   * recent first; [] when none. (TICKET-156.)
   */
  graceDaysUsed: string[];
  /**
   * True when today is unlogged AND yesterday is an unforgiven miss (i.e.
   * unlogged and not paused) AND a chain of >= 1 exists before that gap —
   * meaning logging 'done' today reconnects the chain via grace, but doing
   * nothing tomorrow (a 2nd consecutive miss) ends it. (TICKET-156.)
   */
  atRisk: boolean;
}

export const MILESTONES = [365, 100, 30, 7] as const;

/** A habit pause window; end_date null = open-ended (still active). */
export interface PauseRange {
  start_date: string;
  end_date: string | null;
}

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

// --- pauses ------------------------------------------------------------------

/** True when `day` falls inside any of `pauses` (start_date <= day <= end_date, or open-ended). */
export function isPausedOn(day: string, pauses: PauseRange[]): boolean {
  for (const p of pauses) {
    if (p.start_date <= day && (p.end_date === null || day <= p.end_date)) return true;
  }
  return false;
}

// --- streak computation --------------------------------------------------------

/**
 * Compute the current + longest forgiving streak.
 *
 * @param logs   map of dayKey → status for one habit (or a merged "any habit
 *               done" map for whole-person streaks)
 * @param today  the caller's local day key
 * @param opts   optional pause ranges (TICKET-156) — paused days are bridged
 *               over transparently and excluded from grace/at-risk logic.
 */
export function computeStreak(
  logs: Map<string, LogStatus>,
  today: string,
  opts?: { pauses?: PauseRange[] }
): StreakResult {
  const pauses = opts?.pauses ?? [];
  const endWalk = chainEndingAt(logs, today, true, pauses);
  const current = endWalk.count;
  let longest = current;

  // Longest-ever: evaluate a chain ending at every logged active day.
  // O(n²) worst case but n = logged days for one habit — fine on device.
  for (const [day, status] of logs) {
    if (status === 'done' || status === 'rest') {
      const len = chainEndingAt(logs, day, false, pauses).count;
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

  const atRisk = computeAtRisk(logs, today, pauses, current);

  return { current, longest, milestone, graceDaysUsed: endWalk.graceDaysUsed, atRisk };
}

interface ChainWalkResult {
  count: number;
  graceDaysUsed: string[];
}

/**
 * Length of the unbroken chain whose most recent day is `end`, plus the list
 * of forgiven miss day-keys crossed along the way (most recent first).
 * When `endIsPending` is true, an unlogged `end` day is treated as pending
 * (walk starts the day before); otherwise an unlogged end means length 0.
 * Paused days are bridged over transparently: they don't count, don't
 * accumulate pendingGap, and don't reset lastSeenDone.
 */
function chainEndingAt(
  logs: Map<string, LogStatus>,
  end: string,
  endIsPending: boolean,
  pauses: PauseRange[]
): ChainWalkResult {
  let cursor = end;
  let count = 0;
  let lastSeenDone = false; // was the most recent *logged, non-paused-bridge* day in the walk a 'done'?
  let pendingGap = 0; // consecutive unlogged (non-paused) days currently being crossed
  const graceDaysUsed: string[] = [];

  const endStatus = logs.get(end);
  const endPaused = isPausedOn(end, pauses);
  if (endStatus === undefined && !endPaused) {
    if (!endIsPending) return { count: 0, graceDaysUsed };
    cursor = addDays(end, -1);
  }

  // Safety bound: never walk more than 5 years.
  for (let i = 0; i < 1830; i++) {
    if (isPausedOn(cursor, pauses) && logs.get(cursor) === undefined) {
      // Transparent bridge: this calendar day does not exist for streak
      // purposes. Skip without touching pendingGap or lastSeenDone.
      cursor = addDays(cursor, -1);
      continue;
    }

    const status = logs.get(cursor);

    if (status === 'done' || status === 'rest') {
      // Crossing a 1-day gap requires the more-recent logged day to be 'done'.
      if (pendingGap === 1 && !lastSeenDone) break;
      if (pendingGap >= 2) break;
      if (pendingGap === 1 && lastSeenDone) {
        // The day we just crossed (one day more recent than `cursor`) was a
        // forgiven miss. Record its key.
        graceDaysUsed.push(addDays(cursor, 1));
      }
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

  return { count, graceDaysUsed };
}

/**
 * True when today is unlogged, yesterday is an unforgiven miss (unlogged AND
 * not paused), and a chain of >= 1 already exists ending the day before
 * yesterday — i.e. logging 'done' today would reconnect the chain via grace,
 * but a 2nd consecutive miss (doing nothing tomorrow) would end it.
 * A paused yesterday is never "at risk" (the pause bridges it away).
 */
function computeAtRisk(
  logs: Map<string, LogStatus>,
  today: string,
  pauses: PauseRange[],
  current: number
): boolean {
  if (logs.get(today) !== undefined) return false; // today already logged — not pending/at-risk
  const yesterday = addDays(today, -1);
  if (logs.get(yesterday) !== undefined) return false; // yesterday logged — no gap
  if (isPausedOn(yesterday, pauses)) return false; // yesterday paused — bridged, not a miss

  // A chain must exist ending the day before yesterday for the miss to be
  // "forgivable" rather than just the start of nothing.
  const priorDay = addDays(today, -2);
  const priorChain = chainEndingAt(logs, priorDay, false, pauses).count;
  return priorChain >= 1;
}

// --- daily aggregation (whole-person ring / widget) -----------------------------

/**
 * Collapse per-habit log rows into one status per day for an at-a-glance,
 * cross-habit "showing-up" chain (the widget streak ring, TICKET-116):
 *   any 'done' that day => 'done'; else any 'rest' => 'rest'; else 'skip'.
 * Pure (no RN/DB deps) so the widget bridge and unit tests share ONE definition.
 * Feed the result straight into computeStreak for an authoritative ring count.
 */
export function aggregateDailyStatus(
  rows: { date: string; status: LogStatus }[],
): Map<string, LogStatus> {
  const map = new Map<string, LogStatus>();
  for (const r of rows) {
    const prev = map.get(r.date);
    if (r.status === 'done' || prev === 'done') {
      map.set(r.date, 'done');
    } else if (r.status === 'rest' || prev === 'rest') {
      map.set(r.date, 'rest');
    } else {
      map.set(r.date, 'skip');
    }
  }
  return map;
}

// --- consistency (goals + insights) ---------------------------------------------

/**
 * Share of the last `windowDays` days with an active log (done/rest), for the
 * honest two-signal goal progress display (spec §TICKET-105 — never a single
 * judgmental score). Skips are excluded from numerator AND denominator.
 * Paused days (TICKET-156) are excluded from both sides too, same as 'skip'.
 */
export function consistency(
  logs: Map<string, LogStatus>,
  today: string,
  windowDays = 28,
  pauses?: PauseRange[]
): { active: number; eligible: number; ratio: number } {
  let active = 0;
  let eligible = 0;
  for (let i = 0; i < windowDays; i++) {
    const day = addDays(today, -i);
    const status = logs.get(day);
    if (status === undefined && pauses && isPausedOn(day, pauses)) continue;
    if (status === 'skip') continue;
    eligible += 1;
    if (status === 'done' || status === 'rest') active += 1;
  }
  return { active, eligible, ratio: eligible === 0 ? 0 : active / eligible };
}

// --- weekly quota streak (TICKET-154) -------------------------------------------

export interface WeekProgress {
  weekStart: string;
  done: number;
  quota: number;
  met: boolean;
}

/**
 * Progress for the week containing `today` (Monday-start). Only 'done' days
 * count toward quota — 'rest'/'skip' never do.
 */
export function weekProgress(
  logs: Map<string, LogStatus>,
  today: string,
  quota: number
): WeekProgress {
  const ws = weekStart(today);
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(ws, i);
    if (logs.get(day) === 'done') done += 1;
  }
  return { weekStart: ws, done, quota, met: done >= quota };
}

export interface WeeklyStreakResult {
  current: number;
  longest: number;
  milestone: 7 | 30 | 100 | 365 | null;
  pendingThisWeek: boolean;
}

/**
 * Walk whole weeks backward from weekStart(today), applying a weekly
 * done-count quota with pause-awareness (TICKET-154 + TICKET-156).
 *
 * Per PAST week: effectiveQuota = min(quota, number of non-paused days in
 * that week). effectiveQuota === 0 means the whole week is transparent
 * (bridged over — doesn't count, doesn't break). Otherwise the week counts
 * toward the chain if doneCount >= effectiveQuota, else the chain ends.
 *
 * The CURRENT week (containing `today`) is special: if it has already met
 * its effective quota, it counts toward `current` and `pendingThisWeek` is
 * false. Otherwise it is "transparent-pending" — it never breaks the chain
 * (the week isn't over yet) and `pendingThisWeek` is true; the walk
 * continues into last week to keep counting the historical chain.
 *
 * `longest` is the best chain over all weeks in the data, applying the same
 * per-week rules — a not-yet-over current week never breaks a historical
 * chain when computing longest either.
 */
export function computeWeeklyQuotaStreak(
  logs: Map<string, LogStatus>,
  today: string,
  quota: number,
  opts?: { pauses?: PauseRange[] }
): WeeklyStreakResult {
  const pauses = opts?.pauses ?? [];
  const todayWeekStart = weekStart(today);

  const evalWeek = (ws: string): { doneCount: number; nonPausedDays: number } => {
    let doneCount = 0;
    let nonPausedDays = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i);
      const paused = isPausedOn(day, pauses);
      const status = logs.get(day);
      if (paused && status === undefined) continue; // transparent day
      nonPausedDays += 1;
      if (status === 'done') doneCount += 1;
    }
    return { doneCount, nonPausedDays };
  };

  let pendingThisWeek = false;
  let current = 0;
  let cursorWeekStart = todayWeekStart;
  let firstWeek = true;
  let broke = false;

  // Safety bound: ~10 years of weeks.
  const MAX_WEEKS = 522;

  for (let i = 0; i < MAX_WEEKS; i++) {
    const { doneCount, nonPausedDays } = evalWeek(cursorWeekStart);
    const effectiveQuota = Math.min(quota, nonPausedDays);

    if (firstWeek) {
      firstWeek = false;
      if (effectiveQuota === 0) {
        // Fully-paused current week: transparent, bridge over, keep walking.
        cursorWeekStart = addDays(cursorWeekStart, -7);
        continue;
      }
      if (doneCount >= effectiveQuota) {
        current += 1;
        pendingThisWeek = false;
      } else {
        pendingThisWeek = true;
        // Current week not yet met — never breaks; keep walking into history
        // without counting this week.
      }
      cursorWeekStart = addDays(cursorWeekStart, -7);
      continue;
    }

    // Past week.
    if (effectiveQuota === 0) {
      // Fully paused historical week: transparent, bridge over.
      cursorWeekStart = addDays(cursorWeekStart, -7);
      continue;
    }
    if (doneCount >= effectiveQuota) {
      current += 1;
      cursorWeekStart = addDays(cursorWeekStart, -7);
    } else {
      broke = true;
      break;
    }
  }
  void broke;

  // Longest: best chain over all weeks in the data. Walk from the earliest
  // logged week through to the current week, applying the same rules but
  // never letting an unfinished current week break a historical chain.
  let longest = current;
  {
    let bestRun = 0;
    let runWeekStart = todayWeekStart;
    let isCurrent = true;
    for (let i = 0; i < MAX_WEEKS; i++) {
      const { doneCount, nonPausedDays } = evalWeek(runWeekStart);
      const effectiveQuota = Math.min(quota, nonPausedDays);

      if (effectiveQuota === 0) {
        // transparent — bridge, run continues
      } else if (doneCount >= effectiveQuota) {
        bestRun += 1;
        if (bestRun > longest) longest = bestRun;
      } else if (isCurrent) {
        // current week not met yet — doesn't break, just doesn't count
      } else {
        bestRun = 0;
      }

      isCurrent = false;
      runWeekStart = addDays(runWeekStart, -7);
    }
  }

  let milestone: WeeklyStreakResult['milestone'] = null;
  for (const m of MILESTONES) {
    if (current >= m) {
      milestone = m;
      break;
    }
  }

  return { current, longest, milestone, pendingThisWeek };
}

// --- quantity/timer status (TICKET-153) -----------------------------------------

/**
 * Status derived from an accumulated quantity/timer value against a target.
 * No target ("open" tracking) => any positive accumulation counts as done.
 * 'skip' here is a neutral partial (not a failure) — forgiving by design,
 * consistent with the rest of the engine's "never punish" philosophy.
 */
export function quantityStatus(accumulated: number, target: number | null): LogStatus {
  if (target === null || target === undefined) {
    return accumulated > 0 ? 'done' : 'skip';
  }
  return accumulated >= target ? 'done' : 'skip';
}
