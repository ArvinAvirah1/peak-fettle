/**
 * programs/index.ts — TICKET-132: prebuilt program shelf, static loader.
 * =============================================================================
 * Aggregates the 7 newly-authored static programs in this directory. All are
 * bundled with the app (imported as ordinary TS modules, no JSON.parse/network/
 * DB) — fully offline, free tier, no server, no tier branch, per spec.
 *
 * The 8th shelf item ("full-body beginner (already exists — link it on the
 * shelf rather than duplicating)") is NOT re-encoded here: the app already
 * ships bundled beginner programs at `src/data/beginnerTemplates.ts`
 * (`BEGINNER_PROGRAMS`: 'ppl-3', 'ppl-6', 'upper-lower-4'), rendered on this
 * same templates screen in the existing "BEGINNER PROGRAMS · WORKS OFFLINE"
 * section. `BEGINNER_SHELF_LINK` below is a lightweight pointer (not a
 * Program — it renders as a "see beginner programs above" card on the shelf)
 * so the UI can link to that section instead of duplicating its content.
 *
 * Every exercise in every program is run through the SAME `allowlistExercise`
 * (routineExerciseFields.ts) allowlist used by routine import/local-DB reads,
 * both in `getProgram`'s output (defense in depth — see `sanitizeProgram`
 * below) and in the standalone self-check script
 * (`__tests__/programs.selfcheck.js`), so a malformed program can never reach
 * `planAdoption` un-sanitized and the allowlist is verified in CI-style dev
 * checks without needing the app running.
 */

import type { Program, ProgramDay } from './types';
import { allowlistExercise } from '../routineExerciseFields';

import lp4dayT1t2t3 from './lp4dayT1t2t3';
import wave531ThreeDay from './wave531ThreeDay';
import ppl6day from './ppl6day';
import highFreq5day from './highFreq5day';
import novaLp3day from './novaLp3day';
import upperLower4day from './upperLower4day';
import minimalist2day from './minimalist2day';

export type { Program, ProgramDay, ProgramExercise, ProgramLevel, ProgressionStyle } from './types';

/**
 * sanitizeProgram — run every exercise in every day through the shared
 * allowlist before the program is ever handed to a caller. This is
 * belt-and-suspenders: the source files above are hand-authored to already
 * be valid, but any future edit to a program file gets the exact same
 * silent-drop-garbage protection routine import/local-DB reads get, rather
 * than relying on hand-review alone.
 */
function sanitizeProgram(p: Program): Program {
  return {
    ...p,
    days: p.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((e) => allowlistExercise(e as unknown as Record<string, unknown>)),
    })),
  };
}

const RAW_PROGRAMS: Program[] = [
  lp4dayT1t2t3,
  wave531ThreeDay,
  ppl6day,
  highFreq5day,
  novaLp3day,
  upperLower4day,
  minimalist2day,
];

/** Sanitized, ready-to-render/adopt program list — the shelf's data source. */
export const PROGRAMS: Program[] = RAW_PROGRAMS.map(sanitizeProgram);

/** Lightweight pointer card for the shelf: links to the existing bundled beginner
 * section instead of duplicating a "full-body beginner" program. Not a `Program`
 * (no days/exercises of its own — nothing to adopt directly; tapping it should
 * scroll to / open the existing "BEGINNER PROGRAMS · WORKS OFFLINE" section that
 * already renders `beginnerTemplates.ts`'s bundled programs on this same screen).
 */
export interface BeginnerShelfLink {
  id: 'beginner-programs-link';
  name: string;
  subtitle: string;
}

export const BEGINNER_SHELF_LINK: BeginnerShelfLink = {
  id: 'beginner-programs-link',
  name: 'Full-body beginner programs',
  subtitle: 'Already below — PPL and Upper/Lower starter splits, safe-swapped for beginners',
};

export function listPrograms(): Program[] {
  return PROGRAMS;
}

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

/** First training day of a program, for the shelf card's "week 1 preview". */
export function getProgramPreviewDay(program: Program): ProgramDay | undefined {
  return program.days[0];
}
