// localContext.ts — Training Engine v1 (mobile, on-device)
// -----------------------------------------------------------------------------
// Assembles a PlanCtx for generatePlan() entirely from ON-DEVICE data + the
// bundled exercise catalogue. This is the local-first plan-generation path used
// for ALL tiers (free users never make a personal REST call; Pro users use it
// too when offline / as the on-device default before the server path).
//
// Sources (all local SQLite reads — NOT REST):
//   • profile     — passed in from the in-session `user` (survey fields live there).
//   • exercises   — the bundled ENGINE_EXERCISE_CATALOG (no /exercises round-trip).
//   • history     — local `sets` (lift kind), grouped/aggregated to per-set rows
//                   with an Epley e1RM, exercise_name resolved via `exercise_names`.
//   • pbs         — local `exercise_prs`, exercise_name resolved via `exercise_names`.
//   • constraints — local `user_constraints` (injury flags).
//
// Every read is wrapped so a missing table / empty DB degrades to [] rather than
// throwing — generatePlan() still produces a sensible RPE-only plan with no
// history. Weight reads prefer exact weight_kg, falling back to legacy
// weight_raw/8 (kg×8) per the schema-v3 invariant.
// -----------------------------------------------------------------------------

import { localDb } from '../../db/localDb';
import { ENGINE_EXERCISE_CATALOG } from './exerciseCatalog';
import type {
  PlanCtx,
  PlanProfile,
} from './index';
import type { HistoryRow, PBRow, ConstraintRow } from './exerciseFill';

// ---------------------------------------------------------------------------
// Profile shape the screen passes in (a superset of the engine's PlanProfile).
// Only the fields the engine reads are picked out.
// ---------------------------------------------------------------------------
export interface LocalProfileInput {
  experience_level?: string | null;
  sex?: string | null;
  age_band?: string | null;
  weight_class_kg?: number | null;
  training_goal?: string | null;
  sessions_per_week?: number | null;
  session_minutes?: number | null;
  goal_weight_kg?: number | null;
  equipment_profile?: string[] | null;
  season_phase?: string | null;
  primary_discipline?: string | null;
  id?: string | number | null;
}

/**
 * Merge the in-session profile with the saved survey row. The saved survey is
 * authoritative: for each field we take the in-memory value only when it is
 * present (non-null/undefined), otherwise the saved value. This makes a fresh
 * cold-start (in-memory survey fields null) still reflect the user's last saved
 * answers instead of silently falling back to the 3-day beginner default.
 */
function pick<T>(memValue: T | null | undefined, savedValue: T | null | undefined): T | null {
  if (memValue !== null && memValue !== undefined) return memValue;
  if (savedValue !== null && savedValue !== undefined) return savedValue;
  return null;
}

function mergeProfile(
  mem: LocalProfileInput,
  saved: SavedSurvey,
): LocalProfileInput {
  return {
    experience_level: pick(mem.experience_level, saved.experience_level),
    sex: pick(mem.sex, saved.sex),
    age_band: pick(mem.age_band, ageBandFromBirthDate(saved.birth_date)),
    weight_class_kg: pick(mem.weight_class_kg, saved.weight_class_kg),
    training_goal: pick(mem.training_goal, saved.training_goal),
    sessions_per_week: pick(mem.sessions_per_week, saved.sessions_per_week),
    session_minutes: pick(mem.session_minutes, saved.session_minutes),
    goal_weight_kg: pick(mem.goal_weight_kg, saved.goal_weight_kg),
    equipment_profile: pick(mem.equipment_profile, saved.equipment_profile),
    season_phase: pick(mem.season_phase, saved.season_phase),
    primary_discipline: pick(mem.primary_discipline, saved.primary_discipline),
    id: mem.id ?? null,
  };
}

/** Derive a coarse age band from an ISO birth_date, for recovery defaults. */
function ageBandFromBirthDate(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  if (age < 18 || age > 100) return null; // implausible — ignore
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 45) return '35-44';
  if (age < 50) return '45-49';
  if (age < 55) return '50-54';
  if (age < 60) return '55-59';
  if (age < 65) return '60-64';
  if (age < 70) return '65-69';
  return '70+';
}

function epley(weightKg: number, reps: number): number {
  const r = Math.min(Math.max(reps, 1), 12);
  return weightKg * (1 + r / 30);
}

// ---------------------------------------------------------------------------
// Saved survey (local `user_profile` row, id='active')
// ---------------------------------------------------------------------------
// The survey screen (training-survey.tsx → saveProfile) persists the user's
// answers to the on-device `user_profile` table for free/local-first users.
// On a COLD start those values are NOT rehydrated into the in-session `user`
// object (AuthContext only restores the cached server user from SecureStore),
// so `user.sessions_per_week` etc. read back as null and the engine fell back
// to its 3-day beginner default — the "plan based on nothing" bug. We therefore
// read the saved row here and treat it as authoritative, merging it OVER the
// passed-in profile (the saved survey wins whenever the in-memory value is
// missing). Best-effort: a missing table / empty install yields {} and the
// in-memory profile is used unchanged.

/** The subset of `user_profile` columns the engine consumes. */
interface SavedProfileRow {
  experience_level: string | null;
  sex: string | null;
  weight_class_kg: number | null;
  training_goal: string | null;
  sessions_per_week: number | null;
  session_minutes: number | null;
  goal_weight_kg: number | null;
  equipment_profile: string | null; // JSON-encoded string[]
  season_phase: string | null;
  birth_date: string | null;
  primary_focus: string | null;
  injuries: string | null; // JSON-encoded string[]
  muscle_priorities: string | null; // JSON-encoded string[]
  bodyweight_kg: number | null;
  training_days: string | null; // JSON-encoded number[] (0=Sun … 6=Sat)
}

/** Parsed survey values, normalised to the engine's expected shapes. */
export interface SavedSurvey {
  experience_level?: string | null;
  sex?: string | null;
  weight_class_kg?: number | null;
  training_goal?: string | null;
  sessions_per_week?: number | null;
  session_minutes?: number | null;
  goal_weight_kg?: number | null;
  equipment_profile?: string[] | null;
  season_phase?: string | null;
  primary_discipline?: string | null;
  injuries?: string[] | null;
  muscle_priorities?: string[] | null;
  bodyweight_kg?: number | null;
  training_days?: number[] | null;
  birth_date?: string | null;
}

/** Parse a JSON-encoded array column; tolerate nulls / malformed values. */
function parseJsonArray<T>(raw: string | null | undefined): T[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

/**
 * Read the saved survey row (id='active') from the local `user_profile` table.
 * Returns {} when the table/row/columns are absent so callers can spread it
 * safely. Newer survey columns (primary_focus/injuries/muscle_priorities/
 * bodyweight_kg/training_days) are selected defensively: if the migration that
 * adds them has not yet run, the SELECT throws and we fall back to the legacy
 * column set so older installs still benefit from the core wiring fix.
 */
async function loadSavedSurvey(): Promise<SavedSurvey> {
  const legacyCols =
    'experience_level, sex, weight_class_kg, training_goal, sessions_per_week, ' +
    'session_minutes, goal_weight_kg, equipment_profile, season_phase, birth_date';
  const extendedCols =
    legacyCols +
    ', primary_focus, injuries, muscle_priorities, bodyweight_kg, training_days';

  let row: Partial<SavedProfileRow> | null = null;
  try {
    row = await localDb.getFirst<Partial<SavedProfileRow>>(
      `SELECT ${extendedCols} FROM user_profile WHERE id = 'active'`,
    );
  } catch {
    // Extended columns not present yet (pre-v8 install) — retry legacy set.
    try {
      row = await localDb.getFirst<Partial<SavedProfileRow>>(
        `SELECT ${legacyCols} FROM user_profile WHERE id = 'active'`,
      );
    } catch {
      row = null; // missing table / empty DB
    }
  }
  if (!row) return {};

  return {
    experience_level: row.experience_level ?? null,
    sex: row.sex ?? null,
    weight_class_kg: row.weight_class_kg ?? null,
    training_goal: row.training_goal ?? null,
    sessions_per_week: row.sessions_per_week ?? null,
    session_minutes: row.session_minutes ?? null,
    goal_weight_kg: row.goal_weight_kg ?? null,
    equipment_profile: parseJsonArray<string>(row.equipment_profile),
    season_phase: row.season_phase ?? null,
    primary_discipline: row.primary_focus ?? null,
    injuries: parseJsonArray<string>(row.injuries),
    muscle_priorities: parseJsonArray<string>(row.muscle_priorities),
    bodyweight_kg: row.bodyweight_kg ?? null,
    training_days: parseJsonArray<number>(row.training_days),
    birth_date: row.birth_date ?? null,
  };
}

/** Resolve exercise_id → display name from the local `exercise_names` cache. */
async function loadNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await localDb.getAll<{ exercise_id: string; name: string }>(
      'SELECT exercise_id, name FROM exercise_names',
    );
    for (const r of rows) {
      if (r?.exercise_id && typeof r.name === 'string' && r.name.length > 0) {
        map.set(r.exercise_id, r.name);
      }
    }
  } catch {
    // missing table / empty — best-effort
  }
  return map;
}

/** Local lift history → HistoryRow[] with a resolved name + Epley e1RM. */
async function loadHistory(nameMap: Map<string, string>): Promise<HistoryRow[]> {
  try {
    const rows = await localDb.getAll<{
      exercise_id: string | null;
      weight_kg: number | null;
      weight_raw: number | null;
      reps: number | null;
      logged_at: string | null;
    }>(
      `SELECT exercise_id, weight_kg, weight_raw, reps, logged_at
         FROM sets
        WHERE kind = 'lift' AND exercise_id IS NOT NULL
        ORDER BY logged_at DESC
        LIMIT 500`,
    );
    const out: HistoryRow[] = [];
    for (const s of rows) {
      const exId = s.exercise_id ?? '';
      const name = nameMap.get(exId);
      if (!name) continue; // unresolved UUID — skip (engine matches by name)
      const weight =
        s.weight_kg != null
          ? s.weight_kg
          : s.weight_raw != null
            ? s.weight_raw / 8
            : 0;
      const reps = s.reps ?? 0;
      out.push({
        exercise_name: name,
        weight_kg: weight,
        reps,
        e1rm_kg: weight > 0 && reps > 0 ? epley(weight, reps) : undefined,
        day_key: s.logged_at ? s.logged_at.slice(0, 10) : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Local PRs → PBRow[] (one per exercise/rep_count) with a resolved name. */
async function loadPBs(nameMap: Map<string, string>): Promise<PBRow[]> {
  try {
    const rows = await localDb.getAll<{
      exercise_id: string;
      rep_count: number | null;
      weight_kg: number | null;
    }>(
      `SELECT exercise_id, rep_count, weight_kg
         FROM exercise_prs`,
    );
    const out: PBRow[] = [];
    for (const r of rows) {
      const name = nameMap.get(r.exercise_id);
      if (!name) continue;
      if (r.weight_kg == null) continue;
      out.push({
        exercise_name: name,
        weight_kg: r.weight_kg,
        reps: r.rep_count ?? 1,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Local injury flags → ConstraintRow[]. */
async function loadConstraints(): Promise<ConstraintRow[]> {
  try {
    const rows = await localDb.getAll<{
      constraint_type: string | null;
      custom_note: string | null;
    }>(
      `SELECT constraint_type, custom_note FROM user_constraints`,
    );
    const out: ConstraintRow[] = [];
    for (const r of rows) {
      if (r?.constraint_type) {
        out.push({ constraint_type: r.constraint_type, custom_note: r.custom_note ?? null });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function toPlanProfile(p: LocalProfileInput): PlanProfile {
  return {
    experience_level: p.experience_level ?? null,
    sex: p.sex ?? null,
    age_band: p.age_band ?? null,
    weight_class_kg: p.weight_class_kg ?? null,
    training_goal: p.training_goal ?? null,
    sessions_per_week: p.sessions_per_week ?? null,
    session_minutes: p.session_minutes ?? null,
    goal_weight_kg: p.goal_weight_kg ?? null,
    equipment_profile: p.equipment_profile ?? null,
    season_phase: p.season_phase ?? null,
    primary_discipline: p.primary_discipline ?? null,
  };
}

/**
 * Merge survey-declared injuries (free-text region tokens) into the constraint
 * list, de-duplicating against rows already in `user_constraints`. Survey
 * injuries use the same closed token set as PRESET constraints (lower_back,
 * knees, shoulders, …) so they slot straight into the engine's contraindication
 * filter (exerciseFill.isContraindicated).
 */
function mergeInjuryConstraints(
  base: ConstraintRow[],
  injuries: string[] | null | undefined,
): ConstraintRow[] {
  if (!injuries || injuries.length === 0) return base;
  const seen = new Set(base.map((c) => c.constraint_type));
  const out = [...base];
  for (const inj of injuries) {
    if (typeof inj === 'string' && inj.length > 0 && !seen.has(inj)) {
      seen.add(inj);
      out.push({ constraint_type: inj, custom_note: null });
    }
  }
  return out;
}

/**
 * Build a complete on-device PlanCtx from the in-session profile + local SQLite.
 *
 * The passed-in `profile` (from the in-session `user`) is MERGED with the saved
 * survey row (mergeProfile): the saved survey wins for any field the in-memory
 * user is missing, so a cold start still reflects the user's real answers
 * (goal / days-per-week / session length / equipment / experience / discipline)
 * instead of the engine's default. This is the fix for the "plan based on
 * nothing" bug.
 *
 * Safe to call for any tier: every DB read is best-effort and degrades to []
 * on a missing table or empty install. The returned ctx always carries the
 * bundled exercise catalogue so generatePlan() can fill slots offline.
 */
export async function buildLocalPlanContext(
  profile: LocalProfileInput,
): Promise<PlanCtx> {
  // init is idempotent; guard so a DB-open failure still yields a usable ctx
  // (engine runs with empty history → RPE-only plan).
  try {
    await localDb.init();
  } catch {
    // continue with empty local data
  }

  // Read the saved survey FIRST so it can backfill any field the in-session
  // user is missing (the central wiring fix).
  const saved = await loadSavedSurvey().catch(() => ({}) as SavedSurvey);
  const merged = mergeProfile(profile, saved);

  const nameMap = await loadNameMap();
  const [history, pbs, baseConstraints] = await Promise.all([
    loadHistory(nameMap),
    loadPBs(nameMap),
    loadConstraints(),
  ]);

  // Survey-declared injuries become constraints alongside the user_constraints
  // table so the engine excludes contraindicated movement patterns.
  const constraints = mergeInjuryConstraints(baseConstraints, saved.injuries);

  return {
    profile: toPlanProfile(merged),
    exercises: ENGINE_EXERCISE_CATALOG,
    history,
    pbs,
    metrics: [],
    constraints,
    musclePriorities: saved.muscle_priorities ?? null,
    trainingDays: saved.training_days ?? null,
    bodyweightKg: saved.bodyweight_kg ?? merged.weight_class_kg ?? null,
    userId: merged.id != null ? merged.id : 'anon',
    today: new Date(),
  };
}
