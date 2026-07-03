// sequence.js — Training Engine v1
// Implements scheduling_guidelines.md §4 sequencing rules.
//
// sequence(sessions, availableDays, ruleTrace) → sessions with day_label attached
// Pure function; no DB access.

'use strict';

// ---------------------------------------------------------------------------
// Day-label assignment (§4: alternate hard/easy; priority sessions earliest)
// ---------------------------------------------------------------------------

/**
 * Score a session's "hardness": pure cardio-easy sessions score low,
 * sessions with many priority-1 heavy slots score high.
 */
function hardnessScore(session) {
  if (session.isRecovery) return 0;
  const slotScore = (session.slots || []).reduce((acc, s) => {
    return acc + (s.priority === 1 ? s.sets * s.rpe : s.priority === 2 ? s.sets * 0.5 : 0);
  }, 0);
  const cardioScore = (session.cardio || []).some(c =>
    /hiit|threshold|vo2|interval|sprint|high.intens/i.test(c.zone || c.description || '')
  ) ? 20 : 0;
  return slotScore + cardioScore;
}

/**
 * sequence(sessions, availableDays, ruleTrace)
 *
 * @param {object[]} sessions     – scaled session archetypes
 * @param {number}   availableDays – how many days/week the user trains
 * @param {string[]} ruleTrace    – mutable array; strings appended here
 * @returns {object[]} sessions each with day_label added, e.g. "Day 2 – Push"
 */
function sequence(sessions, availableDays, ruleTrace) {
  if (!sessions || sessions.length === 0) return [];

  const days = Math.max(1, Math.min(7, availableDays ?? sessions.length));

  // Sort sessions: highest-priority (hardest) first — they go on freshest days.
  const sorted = [...sessions].sort((a, b) => hardnessScore(b) - hardnessScore(a));

  // Build a simple alternating hard/easy week layout.
  // Available day slots 1..days; we assign sessions to day numbers.
  // Strategy:
  //   • Even distribution across the week.
  //   • Hardest session on Day 1 (after rest).
  //   • Alternate hard/easy as much as possible.
  //   • ≥48h same-muscle-group gap (enforced structurally by split, noted in trace).

  const daySlots = Array.from({ length: days }, (_, i) => i + 1); // [1, 2, ..., days]

  // Interleave hard sessions and easier sessions into alternate slots.
  const hard  = sorted.filter(s => hardnessScore(s) >= 15);
  const easy  = sorted.filter(s => hardnessScore(s) <  15);

  // Rebuild ordered array by alternating hard/easy.
  const ordered = [];
  let hi = 0, ei = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0 && hi < hard.length) {
      ordered.push(hard[hi++]);
    } else if (ei < easy.length) {
      ordered.push(easy[ei++]);
    } else if (hi < hard.length) {
      ordered.push(hard[hi++]);
    }
  }

  // Assign day labels.
  const result = ordered.map((session, idx) => {
    const dayNum = daySlots[idx] ?? (idx + 1);
    const label  = `Day ${dayNum} – ${session.archetype}`;
    return { ...session, day_label: label };
  });

  ruleTrace.push(
    `Sequencing: ${result.length} session(s) placed across ${days} day(s). ` +
    `Priority sessions scheduled first (freshest days); hard/easy alternation applied.`
  );

  // Note the 48h rule structurally.
  ruleTrace.push(
    `Recovery note: same-muscle-group pairs are separated by the split structure (≥48h). ` +
    `Adjust day labels if your schedule compresses sessions.`
  );

  return result;
}

module.exports = { sequence };
