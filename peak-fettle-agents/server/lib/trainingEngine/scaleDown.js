// scaleDown.js — Training Engine v1
// Implements scheduling_guidelines.md §7 scale-down hierarchy.
//
// Pure function: (template, sessions_per_week, session_minutes) → scaledTemplate
// Appends human-readable strings to ruleTrace[].

'use strict';

// ---------------------------------------------------------------------------
// Session-length recipes (scheduling_guidelines.md §5)
// Returns the maximum priority-level slots to include per session
// ---------------------------------------------------------------------------
function maxSlotsForDuration(minutes) {
  if (minutes <= 15) {
    // One thing only — single quality slot. No accessories, no secondary.
    return { maxPriority: 1, maxSlots: 1, trimSets: true };
  }
  if (minutes <= 30) {
    // One quality done well + warmup.  Priority-1 slots; 1 secondary allowed.
    return { maxPriority: 2, maxSlots: 4, trimSets: false };
  }
  if (minutes <= 45) {
    // Quality + secondary component — priority 1 and 2 slots.
    return { maxPriority: 2, maxSlots: 5, trimSets: false };
  }
  if (minutes <= 60) {
    // Full single-discipline session — all slots.
    return { maxPriority: 3, maxSlots: 6, trimSets: false };
  }
  // 90+ min — full sport-specific; all slots, can carry extra accessory work.
  return { maxPriority: 3, maxSlots: 8, trimSets: false };
}

// ---------------------------------------------------------------------------
// Apply length recipe to one session archetype
// Mutates a deep copy of the session (caller clones the template first).
// ---------------------------------------------------------------------------
function applyLengthRecipe(session, minutes, ruleTrace) {
  const { maxPriority, maxSlots, trimSets } = maxSlotsForDuration(minutes);
  const origCount = (session.slots || []).length;

  // §7 rule 2: cut accessory/isolation first (priority 3), then secondary (2),
  // then sets before frequency — never cut intensity.
  const kept = (session.slots || [])
    .filter(s => s.priority <= maxPriority)
    .slice(0, maxSlots);

  if (kept.length < origCount) {
    const dropped = origCount - kept.length;
    ruleTrace.push(
      `Session-length recipe (${minutes} min): dropped ${dropped} lower-priority slot(s) ` +
      `(priority > ${maxPriority}) from "${session.archetype}".`
    );
  }

  // §7 rule 4: reduce sets before reducing frequency — floor 2 sets.
  if (trimSets) {
    kept.forEach(slot => {
      if (slot.sets > 2) {
        ruleTrace.push(
          `15-min recipe: reduced sets from ${slot.sets} → 2 for pattern "${slot.pattern}" in "${session.archetype}".`
        );
        slot.sets = 2;
      }
    });
  }

  session.slots = kept;
  return session;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
/**
 * scaleDown(template, sessionsPerWeek, sessionMinutes, ruleTrace)
 *
 * @param {object}   template        – raw template from templates.js
 * @param {number}   sessionsPerWeek – user's available days (default 3)
 * @param {number}   sessionMinutes  – session length in minutes (default 60)
 * @param {string[]} ruleTrace       – mutable array; strings appended here
 * @returns {object}  scaled template (deep-cloned; original untouched)
 */
function scaleDown(template, sessionsPerWeek, sessionMinutes, ruleTrace) {
  if (!template) throw new Error('scaleDown: template is null/undefined');

  const days    = Math.max(1, Math.min(7, sessionsPerWeek ?? 3));
  const minutes = sessionMinutes ?? 60;

  // Deep clone so we never mutate the imported template data.
  const tpl = JSON.parse(JSON.stringify(template));

  const idealDays = tpl.idealDays || 3;

  // ── Step 1: session count ────────────────────────────────────────────────
  if (days >= idealDays) {
    // User has at least as many days as the ideal plan.
    // If they have *more*, add recovery sessions rather than inventing volume.
    if (days > idealDays) {
      const extra = days - idealDays;
      ruleTrace.push(
        `User has ${days} days vs ideal ${idealDays}: adding ${extra} recovery/easy session(s). ` +
        `Not adding volume — recovery only.`
      );
      for (let i = 0; i < extra; i++) {
        tpl.sessions.push({
          archetype: 'Recovery / Active Rest',
          isRecovery: true,
          slots: [
            { pattern: 'core', sets: 2, reps: '10-15', rpe: 5, rest_seconds: 60, priority: 3 },
          ],
          cardio: [
            { zone: 'Easy (Zone 1 / Active Recovery)', minutes: 20, description: 'Light aerobic activity or mobility/foam-rolling session. 60–65% HRmax maximum.' },
          ],
        });
      }
    } else {
      ruleTrace.push(`Session count: using all ${idealDays} ideal sessions (user days = ${days}).`);
    }
  } else {
    // §7 hierarchy: cut priority-3 slots first across all sessions, then
    // easy volume, then reduce sets, then reduce frequency last.
    ruleTrace.push(
      `User has ${days} days vs ideal ${idealDays}: applying §7 scale-down hierarchy.`
    );

    // Trim sessions to what fits.
    // Prioritise sessions that contain priority-1 slots (the core stimulus).
    const sorted = [...tpl.sessions].sort((a, b) => {
      const aHasCore = (a.slots || []).some(s => s.priority === 1) ? 0 : 1;
      const bHasCore = (b.slots || []).some(s => s.priority === 1) ? 0 : 1;
      return aHasCore - bHasCore;
    });

    const kept = sorted.slice(0, days);
    const dropped = sorted.slice(days);
    if (dropped.length > 0) {
      ruleTrace.push(
        `Dropped ${dropped.length} session(s) to fit ${days} days: ` +
        dropped.map(s => `"${s.archetype}"`).join(', ') + '.'
      );
    }
    tpl.sessions = kept;
  }

  // ── Step 2: Apply session-length recipe to every kept session ────────────
  tpl.sessions = tpl.sessions.map(session => {
    // Recovery sessions only have cardio — no slot trimming needed.
    if (session.isRecovery) return session;
    return applyLengthRecipe(session, minutes, ruleTrace);
  });

  return tpl;
}

module.exports = { scaleDown };
