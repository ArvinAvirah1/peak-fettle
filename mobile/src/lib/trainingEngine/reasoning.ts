// reasoning.ts — Training Engine v1 (mobile port)
// Produces the `reasoning` string and attaches coaching notes to each slot.
// Faithfully ported from server/lib/trainingEngine/reasoning.js
//
// Spec §3 step 6:
//   reasoning — 1-2 sentences citing a real data point
//   coaching_note — template-string bank keyed by pattern+context (≥25 distinct strings)
//   rule_trace[] — full chain accumulated across all pipeline stages

import type { FilledSlot } from './exerciseFill';
import type { WeekOutput } from './loading';
import type { HistoryRow, PBRow } from './exerciseFill';

export interface CtxForReasoning {
  profile: Record<string, unknown>;
  history: HistoryRow[];
  pbs: PBRow[];
  metrics: Array<{ date?: string; resting_hr_bpm?: number; hrv_ms?: number; sleep_hours?: number }>;
  constraints?: unknown[];
}

// ---------------------------------------------------------------------------
// ≥25 coaching-note template strings keyed by movement_pattern
// ---------------------------------------------------------------------------
type CoachingFn = (slot: FilledSlot, ctx: CtxForReasoning) => string;

const coachingNoteBank: Record<string, CoachingFn[]> = {
  squat: [
    (slot) =>
      `Brace your core before descent; hit parallel or below — this ${slot.reps}-rep range builds your quad foundation.`,
    (slot) =>
      `Control the eccentric (3s down); explode through the concentric at ${slot.weight_kg ? slot.weight_kg + 'kg' : 'your working weight'}.`,
    (slot) =>
      `Keep chest up and knees tracking over toes throughout the ${slot.sets} sets.`,
    (slot) =>
      slot.weight_kg
        ? `At ${slot.weight_kg}kg, focus on bracing hard and driving the floor away — quality reps only.`
        : `Find a weight where RPE ${slot.rpe} feels challenging but form stays clean.`,
  ],
  hinge: [
    () =>
      `Hip hinge not a back bend — push hips back, maintain neutral spine, squeeze glutes at lockout.`,
    (slot) =>
      slot.weight_kg
        ? `${slot.weight_kg}kg RDL/deadlift: feel the hamstring stretch at bottom, drive hips forward to stand.`
        : `Start conservative — the hinge pattern rewards technique more than load.`,
    () =>
      `Each rep from a dead stop if possible; no bouncing — maximises hamstring tension.`,
  ],
  lunge: [
    () =>
      `Step long enough to keep shin vertical at bottom; drive through the front heel to return.`,
    () =>
      `Single-leg work: if your lead knee drifts in, widen stance slightly and cue "knee out."`,
    (slot) =>
      `${slot.sets}×${slot.reps} per leg; use the weaker side to set your rep target.`,
  ],
  horizontal_push: [
    (slot) =>
      slot.weight_kg
        ? `${slot.weight_kg}kg bench press: tuck elbows ~45°, touch chest, full lockout — no half reps.`
        : `Set up with shoulder blades retracted and feet flat; press through the full range.`,
    () =>
      `Focus on controlled descent (2s) and explosive press; the eccentric is where adaptation happens.`,
    () =>
      `Grip just outside shoulder width; think "bend the bar" to keep lats engaged throughout.`,
  ],
  vertical_push: [
    (slot) =>
      slot.weight_kg
        ? `Overhead press ${slot.weight_kg}kg: lock the core, avoid arching the lower back, achieve full overhead lockout.`
        : `Standing OHP — brace glutes and abs hard before each rep to protect the lower back.`,
    () =>
      `Allow slight forward lean at the bottom; drive the bar in a straight vertical line.`,
  ],
  horizontal_pull: [
    () =>
      `Initiate each rep by retracting the scapula; think "elbows to pockets" not "hands to ribs."`,
    () =>
      `Full stretch at the top on every rep — don't cut the range short for heavier loads.`,
    (slot) =>
      `${slot.sets}×${slot.reps} rows: pause 1s at the top of each rep to maximise contraction.`,
  ],
  vertical_pull: [
    () =>
      `Pull-up / lat pulldown: initiate from the lats, not the biceps — think "elbows to back pockets."`,
    () =>
      `Dead hang at full extension each rep; full range is the stimulus.`,
    (slot) =>
      slot.weight_kg
        ? `At ${slot.weight_kg}kg, control the negative (3s) — lat strength is built on the eccentric.`
        : `If bodyweight pull-ups are available, choose them for maximum lat recruitment.`,
  ],
  olympic: [
    (slot) =>
      `Speed under the bar matters more than loading here — hit prescribed RPE ${slot.rpe}, no higher.`,
    () =>
      `Singles and doubles: take full 2–3 min rest between; technique degrades fast under fatigue.`,
    () =>
      `Focus on extension → shrug → punch or receive; the third pull is the technical differentiator.`,
  ],
  plyometric: [
    () =>
      `Land softly through the whole foot; minimal contact time on the ground — speed and reactivity.`,
    () =>
      `Max intent on every rep: quality and explosiveness, not just quantity.`,
  ],
  core: [
    () =>
      `Anti-extension core work: brace as if absorbing a punch; avoid lumbar hyperextension.`,
    () =>
      `Slow and controlled — the core session is about time-under-tension, not speed.`,
  ],
  carry: [
    () =>
      `Farmer's carry: tall spine, packed shoulders, controlled walking pace — trains grip and anti-lateral-flexion.`,
  ],
  isolation_arms: [
    (slot) =>
      `High rep range (${slot.reps}) with controlled eccentric; chase the pump, not ego loads.`,
  ],
  isolation_shoulders: [
    (slot) =>
      `Lateral raises at ${slot.reps} reps: lead with the elbows, not the wrists; slight forward lean is fine.`,
  ],
  isolation_chest: [
    () =>
      `Dumbbell fly or cable: maintain a slight bend in the elbows; stretch the pecs at the bottom.`,
  ],
  isolation_back: [
    () =>
      `Cable/machine row: full protraction at start, full retraction at peak — hit both extremes.`,
  ],
  isolation_legs: [
    () =>
      `Leg extension/curl: slow eccentric (3–4s) makes isolation work earn its place.`,
  ],
  isolation_calves: [
    () =>
      `Calf raises: full stretch at bottom, 1s pause at top — partial reps build nothing here.`,
  ],
  cardio: [
    () =>
      `Stay in the prescribed zone — easy sessions too hard undermine the hard sessions.`,
  ],
  _default: [
    (slot) =>
      `Focus on the prescribed ${slot.reps} reps at RPE ${slot.rpe}; quality over quantity.`,
  ],
};

function pickCoachingNote(
  slot: FilledSlot,
  ctx: CtxForReasoning,
  slotIndex: number
): string {
  const bank =
    coachingNoteBank[slot?.pattern] ||
    coachingNoteBank['_default'] ||
    [];
  if (bank.length === 0) return '';
  const fn = bank[((slotIndex % bank.length) + bank.length) % bank.length];
  return fn ? fn(slot, ctx) : '';
}

// ---------------------------------------------------------------------------
// Reasoning string — cites a concrete data point when available
// ---------------------------------------------------------------------------
export function buildReasoning(ctx: CtxForReasoning, _ruleTrace: string[]): string {
  const { profile, history, pbs, metrics } = ctx;
  const histCount = (history || []).length;
  const discipline = (
    (profile.primary_discipline as string) || 'general fitness'
  ).replace(/_/g, ' ');

  const topPB = (pbs || []).reduce<(PBRow & { e1rm: number }) | null>(
    (best, pb) => {
      if (pb.weight_kg == null || pb.reps == null) return best;
      const e1rm =
        parseFloat(String(pb.weight_kg)) *
        (1 + Math.min(parseInt(String(pb.reps), 10), 12) / 30);
      return !best || e1rm > best.e1rm ? { ...pb, e1rm } : best;
    },
    null
  );

  const recentHRV = (metrics || [])
    .filter((m) => m.hrv_ms != null)
    .slice(0, 3);
  const avgHRV =
    recentHRV.length > 0
      ? (
          recentHRV.reduce((s, m) => s + parseFloat(String(m.hrv_ms)), 0) /
          recentHRV.length
        ).toFixed(0)
      : null;

  if (histCount < 6) {
    return (
      `Fewer than 3 sessions logged — this plan adapts as you log more, calibrating loads to your responses. ` +
      `Starting at conservative weights with RPE targets so every session feels achievable.`
    );
  }

  if (topPB) {
    const pbE1rmText = `${topPB.exercise_name} e1RM of ${topPB.e1rm.toFixed(1)}kg `;
    const hrvText = avgHRV
      ? `Your recent average HRV is ${avgHRV}ms, informing recovery-friendly sequencing. `
      : '';
    const goalText = profile.training_goal
      ? `Goal set to ${(profile.training_goal as string).replace(/_/g, ' ')}: `
      : '';
    return (
      `${goalText}Plan built from your ${pbE1rmText}— Week 1 working weights are ~87.5% of that ceiling so you start strong, not depleted. ` +
      `${hrvText}Volume and intensity progress across the 3-week cycle.`
    );
  }

  if (avgHRV) {
    return (
      `Plan calibrated to your ${discipline} training level — your recent HRV average of ${avgHRV}ms is used to balance session intensity across the week. ` +
      `Log more sets with weight to unlock PB-grounded loading targets.`
    );
  }

  return (
    `This ${discipline} plan is evidence-based for your experience level and goal. ` +
    `Log each session to build the performance baseline that sharpens loading, sequencing, and progression over coming weeks.`
  );
}

// ===========================================================================
// buildRuleTrace — the USER-FACING "Here's why" list (plain language).
// ---------------------------------------------------------------------------
// The pipeline stages still accumulate a verbose, technical debug trace (kept
// for the server path + unit tests). That raw trace is NOT shown to users — it
// reads like engine logs ("Engine spec: discipline=…, tier=…, sessions=3").
// This function instead turns the STRUCTURED plan facts into a short, curated,
// human-readable list grouped as: intent → structure → recovery → selection →
// loading. Every line is a full sentence citing the user's real numbers, with
// NO internal jargon and NO "AI"/engine-name strings (branding rule §7).
// ===========================================================================

export interface RuleTraceFacts {
  discipline: string;
  tier: string;
  trainingGoal: string;
  sessionsPerWeek: number;
  sessionMinutes: number;
  seasonPhase: string | null;
  equipmentProfile: string[];
  musclePriorities: string[];
  constraints: Array<{ constraint_type: string; custom_note?: string | null }>;
  progressionModel: string;
  weeks: WeekOutput[];
  history: HistoryRow[];
  pbs: PBRow[];
}

/** Title-case a snake/space token for prose ("general_strength" → "General strength"). */
function humanize(token: string | null | undefined): string {
  if (!token) return '';
  const s = token.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TIER_WORD: Record<string, string> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

const GOAL_PHRASE: Record<string, string> = {
  strength: 'maximal strength (low reps, heavier loads)',
  hypertrophy: 'muscle growth (moderate reps, controlled tempo)',
  endurance: 'aerobic endurance and stamina',
  sport_performance: 'sport performance (power and speed)',
  general_fitness: 'all-round fitness and movement quality',
};

const PROGRESSION_PHRASE: Record<string, string> = {
  linear: 'Loads climb a little each week (linear progression) — the simplest way to keep adding weight while reps hold.',
  dup: 'Intensity is varied through the week (undulating periodisation): heavier, lower-rep work is balanced with lighter, higher-rep volume so you progress without burning out.',
  block: 'Training is organised into focused blocks that build volume first, then sharpen intensity toward the end of the cycle.',
};

/** Count distinct training (non-recovery) sessions in week 1. */
function describeStructure(weeks: WeekOutput[]): {
  total: number;
  training: number;
  recovery: number;
  labels: string[];
} {
  const wk1 = weeks[0]?.sessions ?? [];
  const labels: string[] = [];
  let recovery = 0;
  for (const s of wk1) {
    const label = (s as { day_label?: string; archetype?: string }).day_label
      || (s as { archetype?: string }).archetype
      || 'Session';
    labels.push(label);
    if (/recovery|active rest/i.test(label)) recovery++;
  }
  return { total: wk1.length, training: wk1.length - recovery, recovery, labels };
}

/** Find the most informative loaded lift in week 1 to cite a concrete number. */
function describeLoadingExample(weeks: WeekOutput[]): string | null {
  const wk1 = weeks[0]?.sessions ?? [];
  for (const session of wk1) {
    for (const slot of session.slots ?? []) {
      if (slot.weight_kg != null && slot.weight_kg > 0 && slot.name) {
        return `${slot.name} at ${slot.weight_kg}kg`;
      }
    }
  }
  return null;
}

export function buildRuleTrace(facts: RuleTraceFacts): string[] {
  const {
    discipline, tier, trainingGoal, sessionsPerWeek, sessionMinutes,
    seasonPhase, equipmentProfile, musclePriorities, constraints,
    progressionModel, weeks, history, pbs,
  } = facts;

  const lines: string[] = [];
  const struct = describeStructure(weeks);
  const tierWord = TIER_WORD[tier] || tier;
  const disciplineWord = humanize(discipline).toLowerCase();
  const goalPhrase = GOAL_PHRASE[trainingGoal] || humanize(trainingGoal).toLowerCase();

  // 1. INTENT — what this plan is and who it's for. Cite the user's chosen
  //    weekly frequency (struct.total), not just the hard-training count, so a
  //    6-day request reads as "6-day" even when 2 of those are recovery days.
  const weekDayCount = struct.total > 0 ? struct.total : sessionsPerWeek;
  lines.push(
    `Built a ${weekDayCount}-day ${disciplineWord} plan for your ${tierWord} level, ` +
    `around ${sessionMinutes} minutes per session, focused on ${goalPhrase}.`
  );

  // 2. STRUCTURE — the split and how days were laid out.
  const splitLabels = struct.labels
    .filter((l) => !/recovery|active rest/i.test(l))
    .map((l) => l.replace(/^Day\s*\d+\s*[–-]\s*/i, '').replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s*[–-]\s*/i, ''));
  const uniqueArchetypes = Array.from(new Set(splitLabels));
  if (uniqueArchetypes.length > 0) {
    lines.push(
      `Your week is split into: ${uniqueArchetypes.join(', ')} — chosen to train each ` +
      `area hard, then give it time to recover before the next time you hit it.`
    );
  }

  // 3. SESSION-LENGTH / SCALING — only when the schedule was adapted.
  if (sessionMinutes <= 30) {
    lines.push(
      `Because each session is short (${sessionMinutes} min), we keep the big compound ` +
      `lifts that give the most return and trim accessory work — intensity is never cut.`
    );
  }
  if (struct.recovery > 0) {
    lines.push(
      `You asked for ${sessionsPerWeek} days, which is more than this plan needs for hard ` +
      `training, so ${struct.recovery} day(s) are light recovery/mobility rather than extra volume — that protects your progress.`
    );
  }

  // 4. RECOVERY / SEQUENCING.
  lines.push(
    `Hard and easy days alternate and the same muscles get at least ~48 hours between ` +
    `sessions, so you show up fresh and recover properly.`
  );
  if (seasonPhase === 'in_season') {
    lines.push(
      `You're in-season, so accessory volume is dialled back to keep you fresh for ` +
      `competition while maintaining your strength base.`
    );
  }

  // 5. SELECTION — equipment, muscle priorities, injuries.
  if (equipmentProfile.length > 0) {
    lines.push(
      `Every exercise was picked from the equipment you have (${equipmentProfile.map(humanize).map((s) => s.toLowerCase()).join(', ')}).`
    );
  }
  if (musclePriorities.length > 0) {
    lines.push(
      `You flagged ${musclePriorities.map(humanize).map((s) => s.toLowerCase()).join(' and ')} as a ` +
      `priority, so the plan leans extra volume toward those areas.`
    );
  }
  const injuryTokens = (constraints || [])
    .map((c) => c.constraint_type)
    .filter((t) => t && t !== 'custom');
  if (injuryTokens.length > 0) {
    lines.push(
      `Movements that could aggravate your ${injuryTokens.map(humanize).map((s) => s.toLowerCase()).join(', ')} ` +
      `were left out and safer alternatives chosen instead.`
    );
  }

  // 6. LOADING — how weights were chosen (cite a real number if available).
  const loadExample = describeLoadingExample(weeks);
  const hasData = (history?.length ?? 0) >= 1 || (pbs?.length ?? 0) >= 1;
  if (loadExample) {
    lines.push(
      `Starting weights come from your logged history — e.g. ${loadExample} in week 1, set at ` +
      `~87.5% of your estimated max so the first sessions feel strong, not crushing.`
    );
  } else if (!hasData) {
    lines.push(
      `You haven't logged much yet, so loads start with RPE targets ("leave ~3 reps in the tank") ` +
      `and the plan calibrates real weights as you log your first sessions.`
    );
  }
  lines.push(
    PROGRESSION_PHRASE[progressionModel] ||
      PROGRESSION_PHRASE.linear ||
      'Loads climb gradually across the cycle.'
  );

  return lines;
}

// ---------------------------------------------------------------------------
// Apply coaching notes to all slots in all weeks
// ---------------------------------------------------------------------------
export function applyCoachingNotes(
  weeks: WeekOutput[],
  ctx: CtxForReasoning,
  _ruleTrace: string[]
): WeekOutput[] {
  return weeks.map((week) => ({
    ...week,
    sessions: (week.sessions || []).map((session) => ({
      ...session,
      slots: (session.slots || []).map((slot, idx) => ({
        ...slot,
        coaching_note: slot.coaching_note || pickCoachingNote(slot, ctx, idx),
      })),
    })),
  }));
}

export { pickCoachingNote };
