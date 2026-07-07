/**
 * healthGoals — device-local daily activity goals for the local-first health
 * dashboard (steps / active kcal / exercise minutes).
 *
 * Backed by the shared app_settings KV store (mobile/src/data/appSettings.ts)
 * — same local-first-by-construction guarantee: no REST call, safe to read on
 * mount, identical behavior for free and Pro tiers (no tier branch here).
 *
 * All reads are best-effort: any SQLite failure resolves to
 * DEFAULT_HEALTH_GOALS rather than throwing, so a goals read can never block
 * the dashboard. Writes are best-effort too (swallow errors) and only touch
 * the fields provided in the patch.
 */

import { getSetting, setSetting } from './appSettings';

export interface HealthGoals {
  stepsDaily: number;
  activeKcalDaily: number;
  exerciseMinutesDaily: number;
}

export const DEFAULT_HEALTH_GOALS: HealthGoals = {
  stepsDaily: 10000,
  activeKcalDaily: 500,
  exerciseMinutesDaily: 30,
};

const STEPS_DAILY_KEY = 'health_goal_steps_daily';
const ACTIVE_KCAL_DAILY_KEY = 'health_goal_active_kcal_daily';
const EXERCISE_MINUTES_DAILY_KEY = 'health_goal_exercise_min_daily';

// Sane positive-range clamps so a corrupt/garbage stored value never produces
// a nonsensical goal (e.g. 0, negative, or absurdly large).
const STEPS_MIN = 100;
const STEPS_MAX = 100_000;
const ACTIVE_KCAL_MIN = 10;
const ACTIVE_KCAL_MAX = 20_000;
const EXERCISE_MINUTES_MIN = 1;
const EXERCISE_MINUTES_MAX = 1_440;

function parseClamped(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null) return fallback;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Read the user's health goals. Falls back to DEFAULT_HEALTH_GOALS on any
 * failure or for any unset/invalid field — never throws.
 */
export async function getHealthGoals(): Promise<HealthGoals> {
  try {
    const [stepsRaw, kcalRaw, exerciseRaw] = await Promise.all([
      getSetting(STEPS_DAILY_KEY),
      getSetting(ACTIVE_KCAL_DAILY_KEY),
      getSetting(EXERCISE_MINUTES_DAILY_KEY),
    ]);

    return {
      stepsDaily: parseClamped(
        stepsRaw,
        DEFAULT_HEALTH_GOALS.stepsDaily,
        STEPS_MIN,
        STEPS_MAX,
      ),
      activeKcalDaily: parseClamped(
        kcalRaw,
        DEFAULT_HEALTH_GOALS.activeKcalDaily,
        ACTIVE_KCAL_MIN,
        ACTIVE_KCAL_MAX,
      ),
      exerciseMinutesDaily: parseClamped(
        exerciseRaw,
        DEFAULT_HEALTH_GOALS.exerciseMinutesDaily,
        EXERCISE_MINUTES_MIN,
        EXERCISE_MINUTES_MAX,
      ),
    };
  } catch {
    return DEFAULT_HEALTH_GOALS;
  }
}

/**
 * Persist a partial patch of health goals. Only provided fields are written;
 * best-effort (a write failure is swallowed so it never disrupts the caller).
 */
export async function setHealthGoals(patch: Partial<HealthGoals>): Promise<void> {
  try {
    const writes: Promise<void>[] = [];
    if (patch.stepsDaily != null && Number.isFinite(patch.stepsDaily)) {
      writes.push(
        setSetting(
          STEPS_DAILY_KEY,
          String(Math.round(Math.min(STEPS_MAX, Math.max(STEPS_MIN, patch.stepsDaily)))),
        ),
      );
    }
    if (patch.activeKcalDaily != null && Number.isFinite(patch.activeKcalDaily)) {
      writes.push(
        setSetting(
          ACTIVE_KCAL_DAILY_KEY,
          String(
            Math.round(Math.min(ACTIVE_KCAL_MAX, Math.max(ACTIVE_KCAL_MIN, patch.activeKcalDaily))),
          ),
        ),
      );
    }
    if (patch.exerciseMinutesDaily != null && Number.isFinite(patch.exerciseMinutesDaily)) {
      writes.push(
        setSetting(
          EXERCISE_MINUTES_DAILY_KEY,
          String(
            Math.round(
              Math.min(EXERCISE_MINUTES_MAX, Math.max(EXERCISE_MINUTES_MIN, patch.exerciseMinutesDaily)),
            ),
          ),
        ),
      );
    }
    await Promise.all(writes);
  } catch {
    // best-effort — a failed goal write just means the previous value sticks
  }
}
