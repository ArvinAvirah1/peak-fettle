/**
 * programs/types.ts — TICKET-132: prebuilt program shelf, static data types.
 * =============================================================================
 * PURE types only — no RN / expo / db / network. A `Program` is authored as a
 * plain JS object (see the sibling *.ts data files in this directory; TS files
 * rather than raw .json so we get compile-time checking against these types
 * with zero build-step changes, while staying 100% static/bundled data — no
 * network, no server round trip, nothing dynamic).
 *
 * Each `ProgramDay.exercises[]` entry uses EXACTLY the `RoutineExercise` shape
 * (src/api/routines.ts) — the same shape a saved routine or an imported
 * routine uses — so every program in this directory is validated through the
 * existing `allowlistExercise` (routineExerciseFields.ts) allowlist before it
 * is ever written to a routine. See `validateProgram` below and
 * `__tests__/programs.selfcheck.js` for the enforcement.
 *
 * `source_notes` is a required, human-readable field on every Program
 * documenting exactly which progression rule was encoded and — when the
 * source method's real progression can't be expressed by the current
 * deterministic engine (e.g. an AMRAP-set-driven training-max bump) — the
 * delta between the "real" method and what we encoded. This is reviewable
 * documentation, not executed by the engine.
 *
 * Trademark-safety: `name` / `subtitle` describe the METHOD generically
 * ("LP 4-day T1/T2/T3", "Wave 531 3-day") — no coach/brand names anywhere in
 * user-facing copy. See the founder trademark-review list in the ticket
 * report.
 */

import type { RoutineExercise } from '../../api/routines';

/** Difficulty/experience banding shown on the shelf card — display only. */
export type ProgramLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Progression style shown on the shelf card (display only — the actual
 * progression is executed by the existing deterministic engine once the
 * program is adopted as ordinary routines; this label just tells the user
 * what kind of progression to expect).
 */
export type ProgressionStyle =
  | 'linear' // add fixed load every session while reps hold
  | 'wave' // week-to-week intensity wave off a training max
  | 'dup' // daily-undulating (different rep ranges different days)
  | 'block'; // volume block → intensity block

/** One exercise slot within a program day. Identical shape to a saved routine's. */
export type ProgramExercise = RoutineExercise;

/** One training day within a program's repeating week. */
export interface ProgramDay {
  /** Stable local key, e.g. 'day-1'. Used only for React keys / linking. */
  slug: string;
  /** Display name, e.g. "T1 Squat + T2 Bench" or "Push A". */
  name: string;
  exercises: ProgramExercise[];
}

/** A static, bundled, prebuilt training program shown on the shelf. */
export interface Program {
  /** Stable id, e.g. 'lp-4day-t1t2t3'. Never reused across programs. */
  id: string;
  /** Trademark-safe display name — describes the method, not a coach's brand. */
  name: string;
  /** One-line subtitle for the card. */
  subtitle: string;
  daysPerWeek: number;
  level: ProgramLevel;
  progressionStyle: ProgressionStyle;
  /** Short label for the progression-style chip, e.g. "Linear (add load/session)". */
  progressionLabel: string;
  /**
   * The program's repeating week, in order. Most of these programs repeat the
   * SAME week every week (progression changes loads, not exercise selection),
   * so one week is the full definition — exactly what `planAdoption`'s
   * `mapWeekToRoutines` expects (it maps a plan's "week 1" to routines).
   */
  days: ProgramDay[];
  /**
   * Required. Documents exactly which progression rule this program encodes
   * once adopted, and any delta from the "real" version of the method that the
   * deterministic engine cannot express (per TICKET-132 spec: encode the
   * closest deterministic rule, document the gap here — do not special-case
   * the engine).
   */
  source_notes: string;
}
