// sequence.ts — Training Engine v1 (mobile port)
// Implements scheduling_guidelines.md §4 sequencing rules.
// Faithfully ported from server/lib/trainingEngine/sequence.js
//
// sequence(sessions, availableDays, ruleTrace) → sessions with day_label attached
// Pure function; no DB access.

import type { SessionTemplate, ExerciseSlot, CardioSlot } from './templates';

export interface SequencedSession extends SessionTemplate {
  day_label: string;
}

// ---------------------------------------------------------------------------
// Day-label assignment (§4: alternate hard/easy; priority sessions earliest)
// ---------------------------------------------------------------------------

function hardnessScore(session: SessionTemplate): number {
  if (!session || session.isRecovery) return 0;
  const slotScore = (session.slots || []).reduce((acc: number, s: ExerciseSlot) => {
    if (!s) return acc;
    return acc + (s.priority === 1 ? s.sets * s.rpe : s.priority === 2 ? s.sets * 0.5 : 0);
  }, 0);
  const cardioScore = (session.cardio || []).some((c: CardioSlot) =>
    /hiit|threshold|vo2|interval|sprint|high.intens/i.test(
      (c?.zone || c?.description || '') as string
    )
  )
    ? 20
    : 0;
  return slotScore + cardioScore;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Pick which calendar days to place sessions on. When the user gave explicit
 * training days (`trainingDays`, 0=Sun…6=Sat), honour them — but if they chose
 * more days than there are sessions, drop the most clustered days so sessions
 * stay spread out (≥48h goal). When they gave fewer days than sessions, fall
 * back to generic numbering so no session is lost.
 */
function resolveDayLabels(
  count: number,
  trainingDays: number[] | null | undefined,
): { labels: (string | null)[]; usedRealDays: boolean } {
  const valid = (trainingDays || []).filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6,
  );
  const uniqueSorted = Array.from(new Set(valid)).sort((a, b) => a - b);
  if (uniqueSorted.length < count) {
    // Not enough named days for every session — use generic Day N.
    return { labels: Array.from({ length: count }, () => null), usedRealDays: false };
  }
  // Spread sessions evenly across the chosen days when more days than sessions.
  const chosen: number[] = [];
  if (uniqueSorted.length === count) {
    chosen.push(...uniqueSorted);
  } else {
    const step = uniqueSorted.length / count;
    for (let i = 0; i < count; i++) {
      const day = uniqueSorted[Math.floor(i * step)];
      if (day != null) chosen.push(day);
    }
  }
  return {
    labels: chosen.map((d) => WEEKDAY_NAMES[d] ?? null),
    usedRealDays: true,
  };
}

export function sequence(
  sessions: SessionTemplate[],
  availableDays: number,
  ruleTrace: string[],
  trainingDays?: number[] | null
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
      const next = hard[hi++];
      if (next) ordered.push(next);
    } else if (ei < easy.length) {
      const next = easy[ei++];
      if (next) ordered.push(next);
    } else if (hi < hard.length) {
      const next = hard[hi++];
      if (next) ordered.push(next);
    }
  }

  // Map sessions onto the user's real training days when they provided them.
  const { labels: dayNameLabels, usedRealDays } = resolveDayLabels(
    ordered.length,
    trainingDays,
  );

  const result: SequencedSession[] = ordered.map(
    (session: SessionTemplate, idx: number) => {
      const archetype = session?.archetype ?? 'Session';
      const dayName = dayNameLabels[idx];
      const label = dayName
        ? `${dayName} – ${archetype}`
        : `Day ${daySlots[idx] ?? idx + 1} – ${archetype}`;
      return { ...session, day_label: label };
    }
  );

  ruleTrace.push(
    `Sequencing: ${result.length} session(s) placed across ${days} day(s)` +
      (usedRealDays ? ' on your chosen weekdays' : '') +
      `. Priority sessions scheduled first (freshest days); hard/easy alternation applied.`
  );

  ruleTrace.push(
    `Recovery note: same-muscle-group pairs are separated by the split structure (≥48h). ` +
      `Adjust day labels if your schedule compresses sessions.`
  );

  return result;
}
