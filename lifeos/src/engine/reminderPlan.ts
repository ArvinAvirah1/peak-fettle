/**
 * reminderPlan — PURE reminder-scheduling logic for Life OS (TICKET-124).
 *
 * No React Native / native / DB imports, so it parses in the @babel sweep AND
 * unit-tests cleanly via the tsLoader (same pattern as engine/streaks.ts). The
 * native layer (src/services/notifications.ts) imports planWeek()/parseTime() and
 * renders each PlannedReminder as an expo-notifications weekly trigger.
 *
 * Rules baked in here (CONTENT_SAFETY.md §6 + locked decisions):
 *   - All reminder types default OFF.
 *   - ≤2 notifications per calendar day across ALL types, on EVERY day.
 *   - Quiet hours: nothing fires inside the window (wrap-around aware).
 *   - Copy never references missed days / streak loss / money / clinical claims.
 */

// ---------------------------------------------------------------------------
// Types & defaults
// ---------------------------------------------------------------------------

export interface ReminderConfig {
  dailyHabit?: { enabled: boolean; time: string /* 'HH:MM' */ };
  moodPrompt?: { enabled: boolean; time: string };
  weeklyReview?: { enabled: boolean; weekday: number /* 0=Sun..6=Sat */; time: string };
  affirmationMorning?: { enabled: boolean; time: string };
  affirmationEvening?: { enabled: boolean; time: string };
  /** Wall-clock start of quiet period — default '22:00'. */
  quietStart: string;
  /** Wall-clock end of quiet period — default '07:00'. */
  quietEnd: string;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  dailyHabit: { enabled: false, time: '08:00' },
  moodPrompt: { enabled: false, time: '12:00' },
  weeklyReview: { enabled: false, weekday: 0 /* Sunday */, time: '18:00' },
  affirmationMorning: { enabled: false, time: '07:30' },
  affirmationEvening: { enabled: false, time: '21:00' },
  quietStart: '22:00',
  quietEnd: '07:00',
};

export const REMINDER_META_KEY = 'reminder_config';

// ---------------------------------------------------------------------------
// Copy — forward-looking, identity-affirming, NON-shaming (CONTENT_SAFETY §6)
// ---------------------------------------------------------------------------

export const REMINDER_COPY = {
  dailyHabit: {
    title: 'A moment for your habits',
    body: 'Whenever you are ready — small steps are still steps.',
  },
  moodPrompt: {
    title: 'How are you arriving today?',
    body: 'A quick check-in to notice where you are right now.',
  },
  weeklyReview: {
    title: 'Time to reflect on your week',
    body: 'A few minutes to see what worked and what to carry forward.',
  },
  affirmationMorning: {
    title: 'Good morning',
    body: 'You are building something worth showing up for — today counts.',
  },
  affirmationEvening: {
    title: 'One thing that moved you forward today',
    body: 'Rest, reflect, and let what went well settle in.',
  },
} as const;

// ---------------------------------------------------------------------------
// Pure time helpers
// ---------------------------------------------------------------------------

/** Parse 'HH:MM' → { hour, minute }. Returns null on invalid input. */
export function parseTime(hhmm: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Minutes-since-midnight for a HH:MM string; -1 if invalid. */
function toMinutes(hhmm: string): number {
  const t = parseTime(hhmm);
  return t ? t.hour * 60 + t.minute : -1;
}

/**
 * True if HH:MM falls inside the quiet window [start, end). Wrap-around aware
 * (e.g. 22:00–07:00). Pure, unit-tested.
 */
export function isWithinQuietHours(hhmm: string, quietStart: string, quietEnd: string): boolean {
  const t = toMinutes(hhmm);
  const s = toMinutes(quietStart);
  const e = toMinutes(quietEnd);
  if (t < 0 || s < 0 || e < 0) return false;
  if (s < e) return t >= s && t < e; // normal window (e.g. 09:00–17:00)
  if (s > e) return t >= s || t < e; // wrap-around (e.g. 22:00–07:00)
  return false; // s === e → no quiet hours
}

// ---------------------------------------------------------------------------
// Config merge (forward/backward compatible)
// ---------------------------------------------------------------------------

/** Deep-merge a stored partial config over the defaults. */
export function mergeReminderConfig(stored: Partial<ReminderConfig>): ReminderConfig {
  const d = DEFAULT_REMINDER_CONFIG;
  return {
    dailyHabit: stored.dailyHabit ? { ...d.dailyHabit!, ...stored.dailyHabit } : d.dailyHabit,
    moodPrompt: stored.moodPrompt ? { ...d.moodPrompt!, ...stored.moodPrompt } : d.moodPrompt,
    weeklyReview: stored.weeklyReview ? { ...d.weeklyReview!, ...stored.weeklyReview } : d.weeklyReview,
    affirmationMorning: stored.affirmationMorning
      ? { ...d.affirmationMorning!, ...stored.affirmationMorning }
      : d.affirmationMorning,
    affirmationEvening: stored.affirmationEvening
      ? { ...d.affirmationEvening!, ...stored.affirmationEvening }
      : d.affirmationEvening,
    quietStart: stored.quietStart ?? d.quietStart,
    quietEnd: stored.quietEnd ?? d.quietEnd,
  };
}

// ---------------------------------------------------------------------------
// The ≤2/day planner (pure)
// ---------------------------------------------------------------------------

interface Candidate {
  key: string;
  weekday?: number; // 0=Sun..6=Sat (weekly only)
  time: string;
  title: string;
  body: string;
  priority: number; // lower = higher priority when the cap must drop one
}

/** One concrete (weekday, reminder) the native layer will register. */
export interface PlannedReminder {
  weekday: number; // 0=Sun..6=Sat
  time: string;    // 'HH:MM'
  title: string;
  body: string;
}

/**
 * Returns every (weekday, reminder) pair to register, enforcing: quiet hours
 * (in-window items dropped), the ≤2/day cap on EVERY weekday INCLUDING the
 * weekly-review day, and priority order (weekly review > daily habit > mood >
 * morning aff > evening aff). Daily reminders are emitted once per weekday so the
 * per-day cap holds even on the review day, where the review claims one slot.
 */
export function planWeek(cfg: ReminderConfig): PlannedReminder[] {
  const qs = cfg.quietStart;
  const qe = cfg.quietEnd;
  const dailyCandidates: Candidate[] = [];
  let weeklyCand: Candidate | null = null;

  const addDaily = (
    key: string,
    entry: { enabled: boolean; time: string } | undefined,
    priority: number,
    copy: { title: string; body: string },
  ): void => {
    if (entry?.enabled && !isWithinQuietHours(entry.time, qs, qe)) {
      dailyCandidates.push({ key, time: entry.time, title: copy.title, body: copy.body, priority });
    }
  };
  addDaily('dailyHabit', cfg.dailyHabit, 1, REMINDER_COPY.dailyHabit);
  addDaily('moodPrompt', cfg.moodPrompt, 2, REMINDER_COPY.moodPrompt);
  addDaily('affirmationMorning', cfg.affirmationMorning, 3, REMINDER_COPY.affirmationMorning);
  addDaily('affirmationEvening', cfg.affirmationEvening, 4, REMINDER_COPY.affirmationEvening);

  if (cfg.weeklyReview?.enabled && !isWithinQuietHours(cfg.weeklyReview.time, qs, qe)) {
    weeklyCand = {
      key: 'weeklyReview',
      weekday: cfg.weeklyReview.weekday,
      time: cfg.weeklyReview.time,
      title: REMINDER_COPY.weeklyReview.title,
      body: REMINDER_COPY.weeklyReview.body,
      priority: 0,
    };
  }

  dailyCandidates.sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : toMinutes(a.time) - toMinutes(b.time),
  );

  const MAX_PER_DAY = 2;
  const out: PlannedReminder[] = [];
  for (let dow = 0; dow < 7; dow++) {
    let slots = MAX_PER_DAY;
    if (weeklyCand && weeklyCand.weekday === dow && slots > 0) {
      out.push({ weekday: dow, time: weeklyCand.time, title: weeklyCand.title, body: weeklyCand.body });
      slots -= 1;
    }
    for (const cand of dailyCandidates) {
      if (slots <= 0) break;
      out.push({ weekday: dow, time: cand.time, title: cand.title, body: cand.body });
      slots -= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Human-readable summary (pure)
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Short description of what will fire, so the UI can show the cap working.
 * Examples: "No reminders scheduled" / "1 a day — daily habit check-in" /
 * "2 a day — daily habit check-in + mood check (+ weekly review on Sundays)".
 */
export function summarizeSchedule(cfg: ReminderConfig): string {
  const qs = cfg.quietStart;
  const qe = cfg.quietEnd;

  const dailyLabels: string[] = [];
  const add = (entry: { enabled: boolean; time: string } | undefined, label: string): void => {
    if (entry?.enabled && !isWithinQuietHours(entry.time, qs, qe)) dailyLabels.push(label);
  };
  add(cfg.dailyHabit, 'daily habit check-in');
  add(cfg.moodPrompt, 'mood check');
  add(cfg.affirmationMorning, 'morning affirmation');
  add(cfg.affirmationEvening, 'evening affirmation');

  const capped = dailyLabels.slice(0, 2); // matches the ≤2/day cap

  let weeklyLabel: string | null = null;
  if (cfg.weeklyReview?.enabled && !isWithinQuietHours(cfg.weeklyReview.time, qs, qe)) {
    weeklyLabel = `weekly review on ${WEEKDAY_NAMES[cfg.weeklyReview.weekday] ?? 'Sunday'}s`;
  }

  if (capped.length === 0 && !weeklyLabel) return 'No reminders scheduled';

  const parts: string[] = [];
  if (capped.length > 0) parts.push(`${capped.length} a day — ${capped.join(' + ')}`);
  if (weeklyLabel) parts.push(capped.length > 0 ? `plus ${weeklyLabel}` : weeklyLabel);
  return parts.join(', ');
}
