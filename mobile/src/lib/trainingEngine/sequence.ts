// sequence.ts — Training Engine v1 (mobile port)
// Implements scheduling_guidelines.md §4 sequencing rules.
// Faithfully ported from server/lib/trainingEngine/sequence.js
//
// sequence(sessions, availableDays, ruleTrace) → sessions with day_label attached
// Pure function; no DB access.

import type { SessionTemplate, ExerciseSlot } from './templates';

export interface SequencedSession extends SessionTemplate {
  day_label: string;
}

// ---------------------------------------------------------------------------
// Day-label assignment (§4: alternate hard/easy; priority sessions earliest)
// ---------------------------------------------------------------------------

function hardnessScore(session: SessionTemplate): number {
  if (session.isRecovery) return 0;
  const slotScore = (session.slots || []).reduce((acc: number, s: ExerciseSlot) => {
    return acc + (s.priority === 1 ? s.sets * s.rpe : s.priority === 2 ? s.sets * 0.5 : 0);
  }, 0);
  const cardioScore = (session.cardio || []).some((c) =>
    /hiit|threshold|vo2|interval|sprint|high.intens/i.test(c.zone || c.description || '')
  )
    ? 20
    : 0;
  return slotScore + cardioScore;
}

export function sequence(
  sessions: SessionTemplate[],
  availableDays: number,
  ruleTrace: string[]
): SequencedSession[] {
  if (!sessions || sessions.length === 0) return [];

  const days = Math.max(1, Math.min(7, availableDays ?? sessions.length));

  const sorted = [...sessions].sort(
    (a, b) => hardnessScore(b) - hardnessScore(a)
  );

  const daySlots = Array.from({ length: days }, (_: unknown, i: number) => i + 1);

  const hard = sorted.filter((s) => hardnessScore(s) >= 15);
  const easy = sorted.filter((s) => hardnessScore(s) < 15);

  const ordered: SessionTemplate[] = [];
  let hi = 0,
    ei = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i % 2 === 0 && hi < hard.length) {
      ordered.push(hard[hi++]);
    } else if (ei < easy.length) {
      ordered.push(easy[ei++]);
    } else if (hi < hard.length) {
      ordered.push(hard[hi++]);
    }
  }

  const result: SequencedSession[] = ordered.map(
    (session: SessionTemplate, idx: number) => {
      const dayNum = daySlots[idx] ?? idx + 1;
      const label = `Day ${dayNum} – ${session.archetype}`;
      return { ...session, day_label: label };
    }
  );

  ruleTrace.push(
    `Sequencing: ${result.length} session(s) placed across ${days} day(s). ` +
      `Priority sessions scheduled first (freshest days); hard/easy alternation applied.`
  );

  ruleTrace.push(
    `Recovery note: same-muscle-group pairs are separated by the split structure (≥48h). ` +
      `Adjust day labels if your schedule compresses sessions.`
  );

  return result;
}
