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

function epley(weightKg: number, reps: number): number {
  const r = Math.min(Math.max(reps, 1), 12);
  return weightKg * (1 + r / 30);
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
 * Build a complete on-device PlanCtx from the in-session profile + local SQLite.
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

  const nameMap = await loadNameMap();
  const [history, pbs, constraints] = await Promise.all([
    loadHistory(nameMap),
    loadPBs(nameMap),
    loadConstraints(),
  ]);

  return {
    profile: toPlanProfile(profile),
    exercises: ENGINE_EXERCISE_CATALOG,
    history,
    pbs,
    metrics: [],
    constraints,
    userId: profile.id != null ? profile.id : 'anon',
    today: new Date(),
  };
}
