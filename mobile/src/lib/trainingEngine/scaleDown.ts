// scaleDown.ts — Training Engine v1 (mobile port)
// Implements scheduling_guidelines.md §7 scale-down hierarchy.
// Faithfully ported from server/lib/trainingEngine/scaleDown.js
//
// Pure function: (template, sessions_per_week, session_minutes) → scaledTemplate
// Appends human-readable strings to ruleTrace[].

import type { Template, SessionTemplate, ExerciseSlot } from './templates';

// ---------------------------------------------------------------------------
// Session-length recipes (scheduling_guidelines.md §5)
// ---------------------------------------------------------------------------
function maxSlotsForDuration(minutes: number): {
  maxPriority: number;
  maxSlots: number;
  trimSets: boolean;
} {
  if (minutes <= 15) {
    return { maxPriority: 1, maxSlots: 1, trimSets: true };
  }
  if (minutes <= 30) {
    return { maxPriority: 2, maxSlots: 4, trimSets: false };
  }
  if (minutes <= 45) {
    return { maxPriority: 2, maxSlots: 5, trimSets: false };
  }
  if (minutes <= 60) {
    return { maxPriority: 3, maxSlots: 6, trimSets: false };
  }
  return { maxPriority: 3, maxSlots: 8, trimSets: false };
}

// ---------------------------------------------------------------------------
// Apply length recipe to one session archetype (mutates a deep-cloned copy)
// ---------------------------------------------------------------------------
function applyLengthRecipe(
  session: SessionTemplate,
  minutes: number,
  ruleTrace: string[]
): SessionTemplate {
  const { maxPriority, maxSlots, trimSets } = maxSlotsForDuration(minutes);
  const origCount = (session.slots || []).length;

  const kept = (session.slots || [])
    .filter((s: ExerciseSlot) => s.priority <= maxPriority)
    .slice(0, maxSlots);

  if (kept.length < origCount) {
    const dropped = origCount - kept.length;
    ruleTrace.push(
      `Session-length recipe (${minutes} min): dropped ${dropped} lower-priority slot(s) ` +
      `(priority > ${maxPriority}) from "${session.archetype}".`
    );
  }

  if (trimSets) {
    kept.forEach((slot: ExerciseSlot) => {
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
function makeRecoverySession(): SessionTemplate {
  return {
    archetype: 'Recovery / Active Rest',
    isRecovery: true,
    slots: [
      { pattern: 'core', sets: 2, reps: '10-15', rpe: 5, rest_seconds: 60, priority: 3 },
    ],
    cardio: [
      {
        zone: 'Easy (Zone 1 / Active Recovery)',
        minutes: 20,
        description:
          'Light aerobic activity or mobility/foam-rolling session. 60–65% HRmax maximum.',
      },
    ],
  };
}

export function scaleDown(
  template: Template,
  sessionsPerWeek: number,
  sessionMinutes: number,
  ruleTrace: string[],
  isEndurance?: boolean
): Template {
  if (!template) throw new Error('scaleDown: template is null/undefined');

  const days    = Math.max(1, Math.min(7, sessionsPerWeek ?? 3));
  const minutes = sessionMinutes ?? 60;

  // Deep clone so we never mutate the imported template data.
  const tpl: Template = JSON.parse(JSON.stringify(template));

  const idealDays = tpl.idealDays || 3;

  // ── Step 1: session count ────────────────────────────────────────────────
  if (days >= idealDays) {
    if (days > idealDays) {
      const extra = days - idealDays;
      const baseSessions = [...tpl.sessions];

      if (isEndurance) {
        // Endurance: extra aerobic volume is appropriate — add easy sessions.
        ruleTrace.push(
          `User has ${days} days vs ideal ${idealDays}: adding ${extra} easy/recovery aerobic ` +
          `session(s) (endurance benefits from extra easy volume).`
        );
        for (let i = 0; i < extra; i++) tpl.sessions.push(makeRecoverySession());
      } else {
        // Strength / hypertrophy / power: a user who asked for MORE days than the
        // template's ideal wants to TRAIN those days, not pad with filler. Adding
        // 2+ "active rest" days made a 6-day request look like a 4-day plan (the
        // "based on nothing" complaint). Instead: keep ONE recovery day to honour
        // §3 (≥1 rest day/week) when the schedule is dense, then REPEAT the
        // existing training sessions — cycling the archetypes so the same muscle
        // group still gets ~48h between hits. This is standard high-frequency
        // practice (e.g. an Upper/Lower run 3× across 6 days). No NEW volume is
        // invented; we re-expose the template's own quality sessions.
        const recoveryDays = days >= 6 ? 1 : 0;
        const trainingToAdd = extra - recoveryDays;

        for (let i = 0; i < trainingToAdd; i++) {
          // Clone a base session in rotation so we don't share object refs.
          const src = baseSessions[i % baseSessions.length];
          if (src) tpl.sessions.push(JSON.parse(JSON.stringify(src)));
        }
        for (let i = 0; i < recoveryDays; i++) tpl.sessions.push(makeRecoverySession());

        ruleTrace.push(
          `User has ${days} days vs ideal ${idealDays}: repeating ${trainingToAdd} of the ` +
          `template's training session(s) across the extra day(s)` +
          (recoveryDays > 0 ? ` plus 1 recovery day` : '') +
          ` — same proven structure run at higher frequency, not invented volume.`
        );
      }
    } else {
      ruleTrace.push(
        `Session count: using all ${idealDays} ideal sessions (user days = ${days}).`
      );
    }
  } else {
    ruleTrace.push(
      `User has ${days} days vs ideal ${idealDays}: applying §7 scale-down hierarchy.`
    );

    const sorted = [...tpl.sessions].sort((a, b) => {
      const aHasCore = (a.slots || []).some((s: ExerciseSlot) => s.priority === 1) ? 0 : 1;
      const bHasCore = (b.slots || []).some((s: ExerciseSlot) => s.priority === 1) ? 0 : 1;
      return aHasCore - bHasCore;
    });

    const kept   = sorted.slice(0, days);
    const dropped = sorted.slice(days);
    if (dropped.length > 0) {
      ruleTrace.push(
        `Dropped ${dropped.length} session(s) to fit ${days} days: ` +
        dropped.map((s: SessionTemplate) => `"${s.archetype}"`).join(', ') + '.'
      );
    }
    tpl.sessions = kept;
  }

  // ── Step 2: Apply session-length recipe to every kept session ────────────
  tpl.sessions = tpl.sessions.map((session: SessionTemplate) => {
    if (session.isRecovery) return session;
    return applyLengthRecipe(session, minutes, ruleTrace);
  });

  return tpl;
}
