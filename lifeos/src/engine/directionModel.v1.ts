/**
 * directionModel.v1 — deterministic, on-device protocol generation
 * (TICKET-106, Q25: NO runtime AI).
 *
 * generateProtocols(survey) → DomainProtocol[] is a pure function:
 *   - same input ⇒ byte-identical output (determinism test enforces this)
 *   - every emitted string comes from src/content/protocols/templates.ts
 *     (CONTENT_SAFETY.md §4 rule 5; banned-class test enforces this)
 *   - proposals must fit the user's stated time budget — the engine never
 *     prescribes 10 h into a 3 h week (time-budget test enforces this)
 *
 * Derivation & evidence grades: lifeos/DIRECTION_MODEL_DERIVATION.md.
 * Rule provenance is cited inline as R-numbers from that document.
 */

import type { Domain } from '../data/goals';
import {
  BLOCKER_NAMES,
  CHRONO_SLOTS,
  DOMAIN_EXERCISES,
  DOMAIN_GOAL_TITLES,
  DOMAIN_MILESTONES,
  DOMAIN_STACKS,
  fillN,
} from '../content/protocols/templates';
import type { BlockerSuggestion, DomainProtocol, ProtocolStack, SurveyAnswers } from './directionTypes';

export const MODEL_VERSION = 'direction-v1.0.0';

/** Stable domain ordering for deterministic output. */
const DOMAIN_ORDER: Domain[] = ['health', 'professional', 'growth', 'interpersonal', 'financial', 'mind'];

/** Minutes/week a domain must receive to be planned at all (R3: small > zero). */
const MIN_DOMAIN_BUDGET_MIN = 30;

/**
 * Estimate the weekly minute cost of a protocol's stacks.
 * Steps without duration count 1 minute. Weekly stacks (financial check-in)
 * are detected by name — the registry is fixed, so this stays deterministic.
 */
export function estimateWeeklyCostMin(stacks: ProtocolStack[]): number {
  let weekly = 0;
  for (const stack of stacks) {
    const perRun = stack.steps.reduce((acc, s) => acc + (s.estDurationSec ?? 60), 0) / 60;
    const runsPerWeek = stack.name === 'Weekly Money Check-In' ? 1 : 7;
    weekly += perRun * runsPerWeek;
  }
  return Math.round(weekly);
}

/** Drop optional steps until the stack set fits the budget (R2: realistic > ambitious). */
function fitToBudget(stacks: ProtocolStack[], budgetMin: number): ProtocolStack[] {
  let current = stacks.map((s) => ({ ...s, steps: [...s.steps] }));
  while (estimateWeeklyCostMin(current) > budgetMin) {
    // Trim the single longest step in the costliest stack; drop empty stacks;
    // if only one single-step stack remains, halve its duration to a floor of 5 min.
    let costliest = 0;
    for (let i = 1; i < current.length; i++) {
      if (estimateWeeklyCostMin([current[i]]) > estimateWeeklyCostMin([current[costliest]])) costliest = i;
    }
    const stack = current[costliest];
    if (stack.steps.length > 1) {
      let longest = 0;
      for (let i = 1; i < stack.steps.length; i++) {
        if ((stack.steps[i].estDurationSec ?? 60) > (stack.steps[longest].estDurationSec ?? 60)) longest = i;
      }
      stack.steps.splice(longest, 1);
    } else {
      const dur = stack.steps[0].estDurationSec ?? 60;
      if (dur > 240) {
        // Halve toward a 4-min floor: 4 min × 7 days = 28 min/week, which
        // always fits the 30-min domain floor (budget-fit invariant, tested).
        stack.steps[0] = { ...stack.steps[0], estDurationSec: Math.max(240, Math.floor(dur / 2)) };
      } else if (current.length > 1) {
        current.splice(costliest, 1);
      } else {
        break; // floor reached — a single ≤4-minute daily habit always fits
      }
    }
  }
  return current;
}

/** Need weight: lower self-assessment ⇒ more of the budget (R2/R13). */
function needWeight(current: number): number {
  return Math.max(1, 10 - current);
}

/** Weeks horizon for milestone ladders, scaled by budget intensity (R3/R4). */
function weeksHorizon(budgetMin: number): number {
  if (budgetMin < 60) return 6; // light touch — longer, gentler horizon
  if (budgetMin < 150) return 4;
  return 3;
}

function blockerFor(domain: Domain, survey: SurveyAnswers): BlockerSuggestion | null {
  if (survey.painApps.length === 0) return null;
  const slots = CHRONO_SLOTS[survey.chronotype];
  if (domain === 'professional' || domain === 'growth') {
    // R5: protect peak-attention hours on weekdays.
    return {
      name: BLOCKER_NAMES.focusSession,
      kind: 'session',
      schedule: { days: [1, 2, 3, 4, 5], startHHMM: slots.focusStart, endHHMM: slots.focusEnd },
    };
  }
  if (domain === 'mind') {
    // R15: cap the self-reported time-sink apps rather than schedule windows.
    return {
      name: BLOCKER_NAMES.painAppLimit,
      kind: 'limit',
      schedule: { dailyLimitMin: 45 },
    };
  }
  return null;
}

const RATIONALE_KEYS: Record<Domain, string> = {
  professional: 'professional.deepwork',
  growth: 'growth.practice',
  health: 'health.foundation',
  interpersonal: 'interpersonal.connection',
  financial: 'financial.behaviour',
  mind: 'mind.activation',
};

/**
 * Generate per-domain protocols from survey answers. Pure + deterministic.
 */
export function generateProtocols(survey: SurveyAnswers): DomainProtocol[] {
  const selected = DOMAIN_ORDER.filter((d) => survey.domains.includes(d));
  if (selected.length === 0) return [];

  const totalBudgetMin = Math.max(0, Math.round(survey.hoursPerWeek * 60));

  // --- allocate the weekly budget by need weight, floor 30 min/domain -------
  const weights = selected.map((d) => needWeight(survey.selfAssessment[d]?.current ?? 5));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // If the user can't give every chosen domain its 30-minute floor, plan only
  // the neediest domains that fit (never over-prescribe — R2).
  let planned = [...selected];
  while (planned.length > 1 && totalBudgetMin < planned.length * MIN_DOMAIN_BUDGET_MIN) {
    // Drop the domain with the HIGHEST self-assessment (least need); ties
    // break by reverse DOMAIN_ORDER for determinism.
    let dropIdx = 0;
    for (let i = 1; i < planned.length; i++) {
      const a = survey.selfAssessment[planned[i]]?.current ?? 5;
      const b = survey.selfAssessment[planned[dropIdx]]?.current ?? 5;
      if (a > b || (a === b && DOMAIN_ORDER.indexOf(planned[i]) > DOMAIN_ORDER.indexOf(planned[dropIdx]))) {
        dropIdx = i;
      }
    }
    planned.splice(dropIdx, 1);
  }

  const slots = CHRONO_SLOTS[survey.chronotype];

  return planned.map((domain) => {
    const w = needWeight(survey.selfAssessment[domain]?.current ?? 5);
    const rawBudget = planned.length === selected.length ? (totalBudgetMin * w) / weightSum : totalBudgetMin / planned.length;
    const budget = Math.max(MIN_DOMAIN_BUDGET_MIN, Math.round(rawBudget));

    const stacks = fitToBudget(DOMAIN_STACKS[domain](slots), budget);
    const weeks = weeksHorizon(budget);

    return {
      domain,
      rationaleKey: RATIONALE_KEYS[domain],
      stacks,
      goalTitle: DOMAIN_GOAL_TITLES[domain],
      milestoneLadder: DOMAIN_MILESTONES[domain].map((m) => fillN(m, weeks)),
      blockerSuggestion: blockerFor(domain, survey),
      exercises: [...DOMAIN_EXERCISES[domain]],
      weeklyTimeBudgetMin: budget,
      modelVersion: MODEL_VERSION,
    };
  });
}

/**
 * Weekly-review tweak rules (TICKET-107): completion-rate driven, fixed copy.
 * Returns template keys the UI maps to one-tap adjustments — never auto-applies.
 */
export function reviewAdjustments(completionRatio: number): 'reduce' | 'hold' | 'advance' {
  if (completionRatio < 0.4) return 'reduce'; // R3: shrink the habit, keep the cue
  if (completionRatio > 0.85) return 'advance';
  return 'hold';
}
