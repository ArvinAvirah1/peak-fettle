/**
 * Date utility helpers for Peak Fettle.
 *
 * Kept pure (no side-effects, no imports from the app) so they can be
 * unit-tested in isolation.
 */

// ---------------------------------------------------------------------------
// ISO week key
// ---------------------------------------------------------------------------

/**
 * Returns the ISO 8601 week string for a given date, Monday-anchored.
 * Example: isoWeekKey(new Date('2026-05-04')) → "2026-W19"
 */
export function isoWeekKey(date: Date): string {
  // Clone and shift to Thursday of the same ISO week (ISO 8601 standard pivot)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day of week: 0 = Sunday … 6 = Saturday. Shift so Monday = 0.
  const dayOfWeek = (d.getUTCDay() + 6) % 7;
  // Move to Thursday (ISO week belongs to the year containing Thursday)
  d.setUTCDate(d.getUTCDate() - dayOfWeek + 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7
  );
  const year = d.getUTCFullYear();
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Day label
// ---------------------------------------------------------------------------

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Returns a human-friendly label for a YYYY-MM-DD date string.
 * - Same day as today → "Today"
 * - Previous calendar day → "Yesterday"
 * - Otherwise → "Mon 27 Apr"
 *
 * Comparison is done in local time against the current date at call time.
 */
export function formatDayLabel(dateStr: string): string {
  // Guard: a missing/malformed key must never render as "undefined NaN undefined".
  if (!dateStr || typeof dateStr !== 'string') return 'Workout';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return 'Workout';
  }
  const target = new Date(year, month - 1, day);
  if (Number.isNaN(target.getTime())) return 'Workout';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';

  const dayName = SHORT_DAYS[target.getDay()];
  const monthName = SHORT_MONTHS[target.getMonth()];
  return `${dayName} ${target.getDate()} ${monthName}`;
}

/**
 * Compact M/D/YY label for a YYYY-MM-DD string, e.g. "2026-06-04" → "6/4/26".
 * Used to suffix a routine-session title ("Leg Day 6/4/26"). Returns '' for a
 * missing/malformed key so callers can fall back cleanly.
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return '';
  }
  return `${month}/${day}/${String(year).slice(-2)}`;
}

/**
 * Title for a workout row in history/activity lists.
 * - Routine/template session → "<Routine name> M/D/YY" (e.g. "Leg Day 6/4/26")
 * - Ad-hoc session           → the friendly day label (Today / Yesterday / Mon 4 Jun)
 */
export function formatWorkoutLabel(
  dateStr: string,
  routineName?: string | null
): string {
  const name = routineName?.trim();
  if (name) {
    const short = formatShortDate(dateStr);
    return short ? `${name} ${short}` : name;
  }
  return formatDayLabel(dateStr);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a YYYY-MM-DD string for a given Date in local time.
 */
export function toDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns a YYYY-MM-DD string for N days before a reference date (local time).
 */
export function daysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}
