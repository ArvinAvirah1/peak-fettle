// index.ts — Peak Fettle Training Engine v1 (mobile port)
// Public surface: generatePlan(ctx) → { weeks, reasoning, rule_trace, engine }
// Faithfully ported from server/lib/trainingEngine/index.js
//
// Pipeline (all pure functions; no DB access here):
//   1. selectTemplate  — templates.ts
//   2. scaleDown       — scaleDown.ts
//   3. sequence        — sequence.ts
//   4. exerciseFill    — exerciseFill.ts
//   5. loading         — loading.ts
//   6. reasoning       — reasoning.ts

import { getTemplate } from './templates';
import { scaleDown } from './scaleDown';
import { sequence } from './sequence';
import { exerciseFill } from './exerciseFill';
import { loading } from './loading';
import { buildReasoning, applyCoachingNotes } from './reasoning';
import type { Exercise, HistoryRow, PBRow, ConstraintRow } from './exerciseFill';
import type { WeekOutput } from './loading';

// ---------------------------------------------------------------------------
// Defaults when survey fields are NULL (per spec §3)
// ---------------------------------------------------------------------------
const DEFAULTS = {
  sessions_per_week: 3,
  session_minutes: 60,
  training_goal: 'general_fitness',
  equipment_profile: [
    'barbell',
    'dumbbell',
    'machine',
    'cable',
    'bodyweight',
    'bench',
    'rack',
  ],
};

function tierFromExperience(level: string | null | undefined): string {
  if (!level) return 'beginner';
  const l = level.toLowerCase();
  if (l === 'advanced') return 'advanced';
  if (l === 'intermediate') return 'intermediate';
  return 'beginner';
}

function isoWeek(date?: Date | string): string {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    (((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface PlanProfile {
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
}

export interface PlanCtx {
  profile?: PlanProfile;
  exercises?: Exercise[];
  history?: HistoryRow[];
  pbs?: PBRow[];
  metrics?: Array<{
    date?: string;
    resting_hr_bpm?: number;
    hrv_ms?: number;
    sleep_hours?: number;
  }>;
  constraints?: ConstraintRow[];
  userId?: string | number;
  today?: Date | string;
}

export interface SessionCompat {
  exercises: Array<{
    exercise_id?: string;
    name?: string;
    sets: number;
    reps: string;
    rpe_target: number;
    rest_seconds: number;
    coaching_note?: string;
    warmup?: Array<{ weight_kg: number; reps: number }>;
    weight_kg?: number | null;
  }>;
  cardio: unknown[];
}

export interface GeneratePlanResult {
  weeks: WeekOutput[];
  session: SessionCompat | null;
  reasoning: string;
  rule_trace: string[];
  engine: string;
}

// ---------------------------------------------------------------------------
// generatePlan(ctx) — main entry point
// ---------------------------------------------------------------------------
export function generatePlan(ctx: PlanCtx): GeneratePlanResult {
  const ruleTrace: string[] = [];

  const profile = ctx.profile || {};
  const exercises = ctx.exercises || [];
  const history = ctx.history || [];
  const pbs = ctx.pbs || [];
  const metrics = ctx.metrics || [];
  const constraints = ctx.constraints || [];
  const userId = ctx.userId || 'anon';
  const today = ctx.today || new Date();

  const sessionsPerWeek =
    profile.sessions_per_week ?? DEFAULTS.sessions_per_week;
  const sessionMinutes =
    profile.session_minutes ?? DEFAULTS.session_minutes;
  const trainingGoal =
    profile.training_goal || DEFAULTS.training_goal;
  const equipmentProfile =
    profile.equipment_profile || DEFAULTS.equipment_profile;
  const discipline =
    profile.primary_discipline || 'general_strength';
  const tier = tierFromExperience(profile.experience_level);
  const seasonPhase = profile.season_phase || null;
  const weekISO = isoWeek(today);

  ruleTrace.push(
    `Engine start: discipline="${discipline}", tier="${tier}", goal="${trainingGoal}", ` +
      `sessions_per_week=${sessionsPerWeek}, session_minutes=${sessionMinutes}, ` +
      `week="${weekISO}", equipment=[${(equipmentProfile || []).join(',')}].`
  );

  // ── Step 1: Select template ───────────────────────────────────────────────
  const template = getTemplate(discipline, tier, trainingGoal);
  if (!template) {
    throw new Error(
      `No template found for discipline="${discipline}", tier="${tier}"`
    );
  }
  ruleTrace.push(
    `Template selected: ${discipline}/${tier}` +
      (trainingGoal === 'hypertrophy' ? ' (hypertrophy variant)' : '') +
      `. idealDays=${template.idealDays}, deloadEvery=${template.deloadEvery}, ` +
      `progression.model=${template.progression?.model}.`
  );

  if (seasonPhase === 'in_season') {
    ruleTrace.push(
      `Season phase = in_season: reducing optional accessory volume in favour of ` +
        `sport-specific sessions and recovery.`
    );
  }

  // ── Step 2: Scale down to user's days/time ───────────────────────────────
  const scaledTemplate = scaleDown(
    template,
    sessionsPerWeek,
    sessionMinutes,
    ruleTrace
  );

  // ── Step 3: Sequence sessions across the week ────────────────────────────
  const sequenced = sequence(
    scaledTemplate.sessions,
    sessionsPerWeek,
    ruleTrace
  );

  // ── Step 4: Fill exercise slots ──────────────────────────────────────────
  const filled = exerciseFill(
    sequenced,
    exercises,
    history,
    pbs,
    equipmentProfile,
    constraints,
    userId,
    weekISO,
    ruleTrace
  );

  // ── Step 5: Apply loading (produces 3 weeks) ─────────────────────────────
  const progressionModel = template.progression?.model || 'linear';
  const weeksRaw = loading(filled, history, pbs, progressionModel, ruleTrace);

  // ── Step 6: Apply coaching notes + build reasoning ──────────────────────
  const fullCtx = { profile: profile as Record<string, unknown>, history, pbs, metrics, constraints };
  const weeks = applyCoachingNotes(weeksRaw, fullCtx, ruleTrace);

  const reasoningText = buildReasoning(fullCtx, ruleTrace);
  ruleTrace.push(`Reasoning: "${reasoningText.slice(0, 80)}..."`);

  // ── Backward-compat session field (first session of week 1) ─────────────
  const firstSession = weeks[0]?.sessions?.[0] ?? null;
  const sessionCompat: SessionCompat | null = firstSession
    ? {
        exercises: (firstSession.slots || []).map((s) => ({
          exercise_id: s.exercise_id,
          name: s.name,
          sets: s.sets,
          reps: s.reps,
          rpe_target: s.rpe,
          rest_seconds: s.rest_seconds,
          coaching_note: s.coaching_note,
          warmup: s.warmup,
          weight_kg: s.weight_kg,
        })),
        cardio: firstSession.cardio || [],
      }
    : null;

  return {
    weeks,
    session: sessionCompat,
    reasoning: reasoningText,
    rule_trace: ruleTrace,
    engine: 'pf-engine-v1',
  };
}
