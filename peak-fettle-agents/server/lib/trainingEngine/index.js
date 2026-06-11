// index.js — Peak Fettle Training Engine v1
// Public surface: generatePlan(ctx) → { weeks, reasoning, rule_trace, engine }
//
// Pipeline (all pure functions; no DB access here):
//   1. selectTemplate  — templates.js
//   2. scaleDown       — scaleDown.js
//   3. sequence        — sequence.js
//   4. exerciseFill    — exerciseFill.js
//   5. loading         — loading.js
//   6. reasoning       — reasoning.js (coaching notes + reasoning string)

'use strict';

const templates    = require('./templates');
const { scaleDown }           = require('./scaleDown');
const { sequence }            = require('./sequence');
const { exerciseFill }        = require('./exerciseFill');
const { loading }             = require('./loading');
const { buildReasoning, applyCoachingNotes } = require('./reasoning');

// ---------------------------------------------------------------------------
// Defaults when survey fields are NULL (per spec §3)
// ---------------------------------------------------------------------------
const DEFAULTS = {
  sessions_per_week: 3,
  session_minutes:   60,
  training_goal:     'general_fitness',
  equipment_profile: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack'],
};

function tierFromExperience(level) {
  if (!level) return 'beginner';
  const l = level.toLowerCase();
  if (l === 'advanced')     return 'advanced';
  if (l === 'intermediate') return 'intermediate';
  return 'beginner';
}

/**
 * Return the ISO week string "YYYY-Www" for a given Date (or today).
 */
function isoWeek(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay() || 7; // Monday = 1
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum   = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// generatePlan(ctx) — main entry point
// ---------------------------------------------------------------------------
/**
 * @param {object} ctx
 *   profile     {experience_level, sex, age_band, weight_class_kg, training_goal,
 *                sessions_per_week, session_minutes, goal_weight_kg, equipment_profile,
 *                season_phase, primary_discipline}
 *   exercises[] {id, name, muscle_groups, is_compound, movement_pattern, equipment, contraindications}
 *   history[]   {exercise_name, weight_kg, reps, rir, e1rm_kg, day_key}
 *   pbs[]       {exercise_name, weight_kg, reps}
 *   metrics[]   {date, resting_hr_bpm, hrv_ms, sleep_hours}
 *   constraints[]  {constraint_type, custom_note}
 *   userId      string|number (for deterministic seed)
 *   today       Date|string   (for ISO week)
 *
 * @returns {object}
 *   { weeks, session, reasoning, rule_trace, engine }
 */
function generatePlan(ctx) {
  const ruleTrace = [];

  // ── Unpack context and apply defaults ────────────────────────────────────
  const profile     = ctx.profile     || {};
  const exercises   = ctx.exercises   || [];
  const history     = ctx.history     || [];
  const pbs         = ctx.pbs         || [];
  const metrics     = ctx.metrics     || [];
  const constraints = ctx.constraints || [];
  const userId      = ctx.userId      || 'anon';
  const today       = ctx.today       || new Date();

  const sessionsPerWeek  = profile.sessions_per_week  ?? DEFAULTS.sessions_per_week;
  const sessionMinutes   = profile.session_minutes    ?? DEFAULTS.session_minutes;
  const trainingGoal     = profile.training_goal      || DEFAULTS.training_goal;
  const equipmentProfile = profile.equipment_profile  || DEFAULTS.equipment_profile;
  const discipline       = profile.primary_discipline || 'general_strength';
  const tier             = tierFromExperience(profile.experience_level);
  const seasonPhase      = profile.season_phase       || null;
  const weekISO          = isoWeek(today);

  ruleTrace.push(
    `Engine start: discipline="${discipline}", tier="${tier}", goal="${trainingGoal}", ` +
    `sessions_per_week=${sessionsPerWeek}, session_minutes=${sessionMinutes}, ` +
    `week="${weekISO}", equipment=[${(equipmentProfile || []).join(',')}].`
  );

  // ── Step 1: Select template ───────────────────────────────────────────────
  const template = templates.getTemplate(discipline, tier, trainingGoal);
  if (!template) {
    throw new Error(`No template found for discipline="${discipline}", tier="${tier}"`);
  }
  ruleTrace.push(
    `Template selected: ${discipline}/${tier}` +
    (trainingGoal === 'hypertrophy' ? ' (hypertrophy variant)' : '') +
    `. idealDays=${template.idealDays}, deloadEvery=${template.deloadEvery}, ` +
    `progression.model=${template.progression?.model}.`
  );

  // Season-phase note.
  if (seasonPhase === 'in_season') {
    ruleTrace.push(
      `Season phase = in_season: reducing optional accessory volume in favour of ` +
      `sport-specific sessions and recovery.`
    );
  }

  // ── Step 2: Scale down to user's days/time ───────────────────────────────
  const scaledTemplate = scaleDown(template, sessionsPerWeek, sessionMinutes, ruleTrace);

  // ── Step 3: Sequence sessions across the week ────────────────────────────
  const sequenced = sequence(scaledTemplate.sessions, sessionsPerWeek, ruleTrace);

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
  const fullCtx = { profile, history, pbs, metrics, constraints };
  const weeks   = applyCoachingNotes(weeksRaw, fullCtx, ruleTrace);

  const reasoningText = buildReasoning(fullCtx, ruleTrace);
  ruleTrace.push(`Reasoning: "${reasoningText.slice(0, 80)}..."`);

  // ── Backward-compat session field (first session of week 1) ─────────────
  const firstSession = weeks[0]?.sessions?.[0] ?? null;
  const sessionCompat = firstSession
    ? {
        exercises: (firstSession.slots || []).map(s => ({
          exercise_id:  s.exercise_id,
          name:         s.name,
          sets:         s.sets,
          reps:         s.reps,
          rpe_target:   s.rpe,
          rest_seconds: s.rest_seconds,
          coaching_note: s.coaching_note,
          warmup:       s.warmup,
          weight_kg:    s.weight_kg,
        })),
        cardio: firstSession.cardio || [],
      }
    : null;

  return {
    weeks,
    session:    sessionCompat,
    reasoning:  reasoningText,
    rule_trace: ruleTrace,
    engine:     'pf-engine-v1',
  };
}

module.exports = { generatePlan };
