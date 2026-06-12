// reasoning.js — Training Engine v1
// Produces the `reasoning` string and attaches coaching notes to each slot.
//
// Spec §3 step 6 and §3 output schema:
//   reasoning — 1-2 sentences citing a real data point (PB, e1RM, HRV, or new-user note)
//   coaching_note — template-string bank, keyed by pattern+context (≥25 distinct strings)
//   rule_trace[] — full chain accumulated across all pipeline stages

'use strict';

// ---------------------------------------------------------------------------
// ≥25 coaching-note template strings keyed by movement_pattern
// Each entry is a function(slot, ctx) → string, filled with user numbers.
// ---------------------------------------------------------------------------
const coachingNoteBank = {
  squat: [
    (slot, ctx) => `Brace your core before descent; hit parallel or below — this ${slot.reps}-rep range builds your quad foundation.`,
    (slot, ctx) => `Control the eccentric (3s down); explode through the concentric at ${slot.weight_kg ? slot.weight_kg + 'kg' : 'your working weight'}.`,
    (slot, ctx) => `Keep chest up and knees tracking over toes throughout the ${slot.sets} sets.`,
    (slot, ctx) => slot.weight_kg
      ? `At ${slot.weight_kg}kg, focus on bracing hard and driving the floor away — quality reps only.`
      : `Find a weight where RPE ${slot.rpe} feels challenging but form stays clean.`,
  ],
  hinge: [
    (slot, ctx) => `Hip hinge not a back bend — push hips back, maintain neutral spine, squeeze glutes at lockout.`,
    (slot, ctx) => slot.weight_kg
      ? `${slot.weight_kg}kg RDL/deadlift: feel the hamstring stretch at bottom, drive hips forward to stand.`
      : `Start conservative — the hinge pattern rewards technique more than load.`,
    (slot, ctx) => `Each rep from a dead stop if possible; no bouncing — maximises hamstring tension.`,
  ],
  lunge: [
    (slot, ctx) => `Step long enough to keep shin vertical at bottom; drive through the front heel to return.`,
    (slot, ctx) => `Single-leg work: if your lead knee drifts in, widen stance slightly and cue "knee out."`,
    (slot, ctx) => `${slot.sets}×${slot.reps} per leg; use the weaker side to set your rep target.`,
  ],
  horizontal_push: [
    (slot, ctx) => slot.weight_kg
      ? `${slot.weight_kg}kg bench press: tuck elbows ~45°, touch chest, full lockout — no half reps.`
      : `Set up with shoulder blades retracted and feet flat; press through the full range.`,
    (slot, ctx) => `Focus on controlled descent (2s) and explosive press; the eccentric is where adaptation happens.`,
    (slot, ctx) => `Grip just outside shoulder width; think "bend the bar" to keep lats engaged throughout.`,
  ],
  vertical_push: [
    (slot, ctx) => slot.weight_kg
      ? `Overhead press ${slot.weight_kg}kg: lock the core, avoid arching the lower back, achieve full overhead lockout.`
      : `Standing OHP — brace glutes and abs hard before each rep to protect the lower back.`,
    (slot, ctx) => `Allow slight forward lean at the bottom; drive the bar in a straight vertical line.`,
  ],
  horizontal_pull: [
    (slot, ctx) => `Initiate each rep by retracting the scapula; think "elbows to pockets" not "hands to ribs."`,
    (slot, ctx) => `Full stretch at the top on every rep — don't cut the range short for heavier loads.`,
    (slot, ctx) => `${slot.sets}×${slot.reps} rows: pause 1s at the top of each rep to maximise contraction.`,
  ],
  vertical_pull: [
    (slot, ctx) => `Pull-up / lat pulldown: initiate from the lats, not the biceps — think "elbows to back pockets."`,
    (slot, ctx) => `Dead hang at full extension each rep; full range is the stimulus.`,
    (slot, ctx) => slot.weight_kg
      ? `At ${slot.weight_kg}kg, control the negative (3s) — lat strength is built on the eccentric.`
      : `If bodyweight pull-ups are available, choose them for maximum lat recruitment.`,
  ],
  olympic: [
    (slot, ctx) => `Speed under the bar matters more than loading here — hit prescribed RPE ${slot.rpe}, no higher.`,
    (slot, ctx) => `Singles and doubles: take full 2–3 min rest between; technique degrades fast under fatigue.`,
    (slot, ctx) => `Focus on extension → shrug → punch or receive; the third pull is the technical differentiator.`,
  ],
  plyometric: [
    (slot, ctx) => `Land softly through the whole foot; minimal contact time on the ground — speed and reactivity.`,
    (slot, ctx) => `Max intent on every rep: quality and explosiveness, not just quantity.`,
  ],
  core: [
    (slot, ctx) => `Anti-extension core work: brace as if absorbing a punch; avoid lumbar hyperextension.`,
    (slot, ctx) => `Slow and controlled — the core session is about time-under-tension, not speed.`,
  ],
  carry: [
    (slot, ctx) => `Farmer's carry: tall spine, packed shoulders, controlled walking pace — trains grip and anti-lateral-flexion.`,
  ],
  isolation_arms: [
    (slot, ctx) => `High rep range (${slot.reps}) with controlled eccentric; chase the pump, not ego loads.`,
  ],
  isolation_shoulders: [
    (slot, ctx) => `Lateral raises at ${slot.reps} reps: lead with the elbows, not the wrists; slight forward lean is fine.`,
  ],
  isolation_chest: [
    (slot, ctx) => `Dumbbell fly or cable: maintain a slight bend in the elbows; stretch the pecs at the bottom.`,
  ],
  isolation_back: [
    (slot, ctx) => `Cable/machine row: full protraction at start, full retraction at peak — hit both extremes.`,
  ],
  isolation_legs: [
    (slot, ctx) => `Leg extension/curl: slow eccentric (3–4s) makes isolation work earn its place.`,
  ],
  isolation_calves: [
    (slot, ctx) => `Calf raises: full stretch at bottom, 1s pause at top — partial reps build nothing here.`,
  ],
  cardio: [
    (slot, ctx) => `Stay in the prescribed zone — easy sessions too hard undermine the hard sessions.`,
  ],
  _default: [
    (slot, ctx) => `Focus on the prescribed ${slot.reps} reps at RPE ${slot.rpe}; quality over quantity.`,
  ],
};

/**
 * Pick a coaching note for the given slot.
 * Uses slot index to cycle through bank entries so multiple same-pattern slots
 * in a session get different notes.
 */
function pickCoachingNote(slot, ctx, slotIndex) {
  const bank = coachingNoteBank[slot.pattern] || coachingNoteBank['_default'];
  const fn   = bank[slotIndex % bank.length];
  return fn(slot, ctx);
}

// ---------------------------------------------------------------------------
// Reasoning string — cites a concrete data point when available
// ---------------------------------------------------------------------------
/**
 * buildReasoning(ctx, ruleTrace)
 *
 * @param {object}   ctx        – the full context object passed to generatePlan
 * @param {string[]} ruleTrace  – accumulated rule trace
 * @returns {string} 1-2 sentence reasoning string
 */
function buildReasoning(ctx, ruleTrace) {
  const { profile, history, pbs, metrics } = ctx;
  const histCount  = (history  || []).length;
  const pbCount    = (pbs      || []).length;
  const discipline = (profile.primary_discipline || 'general fitness').replace(/_/g, ' ');

  // Data-point candidate 1: top PB.
  const topPB = (pbs || []).reduce((best, pb) => {
    if (!pb.weight_kg || !pb.reps) return best;
    const e1rm = parseFloat(pb.weight_kg) * (1 + Math.min(parseInt(pb.reps, 10), 12) / 30);
    return (!best || e1rm > best.e1rm) ? { ...pb, e1rm } : best;
  }, null);

  // Data-point candidate 2: HRV trend.
  const recentHRV = (metrics || []).filter(m => m.hrv_ms != null).slice(0, 3);
  const avgHRV    = recentHRV.length > 0
    ? (recentHRV.reduce((s, m) => s + parseFloat(m.hrv_ms), 0) / recentHRV.length).toFixed(0)
    : null;

  // Build the reasoning sentence.
  if (histCount < 6) {
    return `Fewer than 3 sessions logged — this plan adapts as you log more, calibrating loads to your responses. ` +
           `Starting at conservative weights with RPE targets so every session feels achievable.`;
  }

  if (topPB) {
    const pbE1rmText = `${topPB.exercise_name} e1RM of ${topPB.e1rm.toFixed(1)}kg `;
    const hrvText    = avgHRV
      ? `Your recent average HRV is ${avgHRV}ms, informing recovery-friendly sequencing. `
      : '';
    const goalText   = profile.training_goal
      ? `Goal set to ${profile.training_goal.replace(/_/g, ' ')}: `
      : '';
    return `${goalText}Plan built from your ${pbE1rmText}— Week 1 working weights are ~87.5% of that ceiling so you start strong, not depleted. ` +
           `${hrvText}Volume and intensity progress across the 3-week cycle.`;
  }

  if (avgHRV) {
    return `Plan calibrated to your ${discipline} training level — your recent HRV average of ${avgHRV}ms is used to balance session intensity across the week. ` +
           `Log more sets with weight to unlock PB-grounded loading targets.`;
  }

  return `This ${discipline} plan is evidence-based for your experience level and goal. ` +
         `Log each session to build the performance baseline that sharpens loading, sequencing, and progression over coming weeks.`;
}

// ---------------------------------------------------------------------------
// Apply coaching notes to all slots in all weeks
// ---------------------------------------------------------------------------
/**
 * applyCoachingNotes(weeks, ctx, ruleTrace) → weeks with coaching_note on every slot
 */
function applyCoachingNotes(weeks, ctx, ruleTrace) {
  return weeks.map(week => ({
    ...week,
    sessions: (week.sessions || []).map(session => ({
      ...session,
      slots: (session.slots || []).map((slot, idx) => ({
        ...slot,
        coaching_note: slot.coaching_note || pickCoachingNote(slot, ctx, idx),
      })),
    })),
  }));
}

module.exports = { buildReasoning, applyCoachingNotes, pickCoachingNote };
