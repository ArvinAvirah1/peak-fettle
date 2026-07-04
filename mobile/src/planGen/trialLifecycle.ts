/**
 * trialLifecycle.ts — pure derivation of trial-sequence progress (Stage 2).
 * =============================================================================
 * REQUIREMENTS_ADDENDUM_2026-07-02 §2. Given the persisted trial state and
 * TODAY's day-key, work out which 3-week block the user is currently in, how
 * many days remain, whether a block just completed, and whether the whole
 * sequence is done. All prompts ("Make this your main split?") are driven off
 * this.
 *
 * DETERMINISM / CLOCK INJECTION (CLAUDE.md #3 + addendum non-negotiables): this
 * module NEVER reads the current time. The caller (a UI screen) passes today's
 * day-key ("YYYY-MM-DD") which it may derive from a real clock AT THE CALL SITE.
 * All maths here is on that injected value, so it is fully unit-testable.
 *
 * Day-keys are compared as calendar dates. A trial block is BLOCK_WEEKS×7 days
 * long; the sequence has 3 fixed blocks (PPL → Upper/Lower → Body-part).
 * =============================================================================
 */

import type { SplitPreference } from '../lib/trainingEngine/v2/types';

/** Weeks per trial block (addendum §2: "three 3-week trial blocks"). */
export const BLOCK_WEEKS = 3;
/** Days per trial block. */
export const BLOCK_DAYS = BLOCK_WEEKS * 7;
/** Number of blocks in the fixed sequence. */
export const TRIAL_BLOCK_COUNT = 3;
/** Total days across all three blocks. */
export const SEQUENCE_DAYS = BLOCK_DAYS * TRIAL_BLOCK_COUNT;

/** Lifecycle status of the active generated plan / trial sequence. */
export type PlanLifecycleStatus =
  // A single generated plan the user saved but has NOT yet adopted to the calendar.
  | 'plan_saved'
  // A single plan that has been adopted into the schedule (the "main plan").
  | 'plan_adopted'
  // A trial sequence is running; the user is working through the blocks.
  | 'trial_active'
  // The trial sequence finished all three blocks with no early adoption; the
  // user should be shown the comparison summary to pick.
  | 'trial_complete'
  // A split was adopted out of the trial flow and regenerated into a main plan.
  | 'trial_adopted';

/**
 * Derived, human-facing view of where a trial sequence stands TODAY. Pure output
 * of trialProgress(); nothing here is persisted (it is recomputed each render).
 */
export interface TrialProgress {
  /** 0..2 — index of the block the user is currently inside (clamped). */
  currentBlockIndex: number;
  /** The split of the current block. */
  currentSplit: Exclude<SplitPreference, 'unsure'>;
  /** 1..BLOCK_DAYS — which day *within* the current block (1-based). */
  dayInBlock: number;
  /** Whole days elapsed since the sequence started (0-based, clamped ≥0). */
  daysElapsed: number;
  /** Days remaining in the CURRENT block (0 once the block is complete). */
  daysRemainingInBlock: number;
  /**
   * True on/after the last day of the current block — i.e. the "Make this your
   * main split?" prompt should be shown for `currentBlockIndex`.
   */
  blockJustCompleted: boolean;
  /** True once all three blocks' days have elapsed (sequence is done). */
  allBlocksComplete: boolean;
}

/** The fixed trial split order (mirrors the engine's TRIAL_ORDER). */
export const TRIAL_ORDER: Array<Exclude<SplitPreference, 'unsure'>> = [
  'ppl',
  'upper_lower',
  'body_part',
];

export const TRIAL_SPLIT_LABEL: Record<Exclude<SplitPreference, 'unsure'>, string> = {
  ppl: 'Push / Pull / Legs',
  upper_lower: 'Upper / Lower',
  body_part: 'Body-part split',
};

// ---------------------------------------------------------------------------
// Day-key maths (pure; no Date.now())
// ---------------------------------------------------------------------------

/**
 * Parse a "YYYY-MM-DD" day-key into a UTC-noon Date (noon avoids DST edge cases
 * when we only care about whole-day differences). Returns null if malformed.
 */
export function parseDayKey(dayKey: string | null | undefined): Date | null {
  if (!dayKey || typeof dayKey !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Whole calendar days between two day-keys (to − from). Positive when `to` is
 * later. Returns 0 if either key is unparseable (fail-safe: treat as day 0).
 */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = parseDayKey(fromKey);
  const b = parseDayKey(toKey);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Core derivation
// ---------------------------------------------------------------------------

/**
 * trialProgress — where the trial sequence stands as of `todayKey`.
 *
 * @param startDayKey  the day-key stamped when the sequence started (block 1, day 1)
 * @param todayKey     TODAY's day-key (injected by the caller from a real clock)
 *
 * The block a user is "in" advances every BLOCK_DAYS. A block is considered
 * COMPLETE (prompt eligible) on its final day and thereafter, so a user who
 * opens the app on the last day of block 1 is prompted to adopt PPL. Once all
 * SEQUENCE_DAYS have elapsed the sequence is complete and the comparison summary
 * should be shown.
 */
export function trialProgress(startDayKey: string, todayKey: string): TrialProgress {
  const rawElapsed = daysBetween(startDayKey, todayKey);
  const daysElapsed = rawElapsed < 0 ? 0 : rawElapsed;

  // Clamp the block index into [0, TRIAL_BLOCK_COUNT-1]; the "extra" days past
  // the last block keep the user on the final block for display.
  const rawBlock = Math.floor(daysElapsed / BLOCK_DAYS);
  const currentBlockIndex = Math.min(rawBlock, TRIAL_BLOCK_COUNT - 1);

  // Day within the current block, 1-based. On the boundary day (daysElapsed a
  // multiple of BLOCK_DAYS) the user is on day 1 of the NEXT block, except when
  // they have run past the end of the sequence — then they sit on the final day
  // of block 3.
  const withinBlockZero = daysElapsed - currentBlockIndex * BLOCK_DAYS; // 0..(BLOCK_DAYS-1) normally
  const cappedWithin = Math.min(withinBlockZero, BLOCK_DAYS - 1);
  const dayInBlock = cappedWithin + 1; // 1..BLOCK_DAYS

  const daysRemainingInBlock = Math.max(0, BLOCK_DAYS - dayInBlock);
  const allBlocksComplete = daysElapsed >= SEQUENCE_DAYS;

  // A block is "just completed" once the user reaches its final day (or beyond,
  // for the last block if they didn't adopt). For non-final blocks the natural
  // advancement moves them to the next block on the boundary, so this fires on
  // the last day of each block.
  const onFinalDayOfBlock = dayInBlock >= BLOCK_DAYS;
  const blockJustCompleted = onFinalDayOfBlock || allBlocksComplete;

  return {
    currentBlockIndex,
    currentSplit: TRIAL_ORDER[currentBlockIndex]!,
    dayInBlock,
    daysElapsed,
    daysRemainingInBlock,
    blockJustCompleted,
    allBlocksComplete,
  };
}

/**
 * A short human progress line, e.g. "Block 1 of 3 · Push / Pull / Legs · day 4 of 21".
 * Pure; safe to call every render. TICKET-146: takes a translate function so
 * the module itself stays a pure, language-agnostic derivation (no baked-in
 * t() at module scope) — the caller (ActivePlanCard) supplies its own t and
 * the split label (already resolved via the misc:activePlanCard.split* keys).
 */
export function trialProgressLabel(
  p: TrialProgress,
  t: (key: string, opts?: Record<string, unknown>) => string,
  splitLabel: string,
): string {
  const blockNo = p.currentBlockIndex + 1;
  return t('misc:activePlanCard.trialProgressLabel', {
    blockNumber: blockNo,
    blockCount: TRIAL_BLOCK_COUNT,
    split: splitLabel,
    dayInBlock: p.dayInBlock,
    blockDays: BLOCK_DAYS,
  });
}
