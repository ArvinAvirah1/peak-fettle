/**
 * Protocol content registry (TICKET-106 #3) — every string the direction
 * engine can emit lives HERE, as reviewable fixed templates.
 *
 * CONTENT_SAFETY.md §4 rule 5: no free string assembly. The only permitted
 * substitution is the numeric `{n}` placeholder, filled by fillN() with an
 * integer the model computed. Unit tests assert the engine's entire output
 * vocabulary is drawn from this file.
 *
 * Evidence notes reference lifeos/DIRECTION_MODEL_DERIVATION.md (R-numbers).
 * ⚠️ PENDING FOUNDER REVIEW — see CONTENT_SAFETY.md §7 review log.
 */

import type { Domain } from '../../data/goals';
import type { ProtocolStack } from '../../engine/directionTypes';

/** Whitelisted numeric substitution. */
export function fillN(template: string, n: number): string {
  return template.replace(/\{n\}/g, String(Math.round(n)));
}

// ---------------------------------------------------------------------------
// Rationales — plain-English "why", shown on proposal cards with the evidence
// note expandable. rationaleKey → copy.
// ---------------------------------------------------------------------------

export const PROTOCOL_RATIONALES: Record<string, { headline: string; evidence: string }> = {
  'professional.deepwork': {
    headline:
      'Protected, distraction-free blocks are the most reliable lever for meaningful work output. This plan reserves your best hours and adds a clean shutdown so work stops bleeding into the evening.',
    evidence:
      'Built on implementation-intention research (R1: planning when/where roughly doubles follow-through), attention-residue findings on task switching (R5), and time-blocking practice (R5). Specific, scheduled goals outperform vague intentions (R2).',
  },
  'growth.practice': {
    headline:
      'Skills grow from short, focused practice repeated on a schedule — not marathon sessions. This plan sets a small daily practice block with a quick self-test at the end.',
    evidence:
      'Spaced practice beats massed practice (R6), retrieval/self-testing beats re-reading (R7), and structured, effortful practice with feedback drives skill gains (R8).',
  },
  'health.foundation': {
    headline:
      'Daily movement and a consistent sleep window are the two highest-leverage health behaviors this app can support. Training programming itself stays in the Peak Fettle fitness app.',
    evidence:
      'Consistent wake/wind-down routines improve sleep quality (R9). Habit formation research favors small actions tied to a stable cue (R3, R4).',
  },
  'interpersonal.connection': {
    headline:
      'Strong relationships are built from small, repeated bids for connection — not grand gestures. This plan schedules tiny connection rituals you control.',
    evidence:
      'Responding actively and constructively to others’ good news strengthens bonds (R10); regular small interactions out-predict intensity (R11). These are behavioral rituals, not therapy.',
  },
  'financial.behaviour': {
    headline:
      'Money outcomes follow from automated systems plus a short regular review — not willpower. This plan sets up the review ritual and milestone checklist. It never tells you what to buy or invest in.',
    evidence:
      'Automating saving dramatically raises saving rates (R12); regular low-friction reviews keep plans on track (R2). No investment advice — behavioral structure only.',
  },
  'mind.activation': {
    headline:
      'Doing one small valued activity per day, plus a brief gratitude note, reliably supports wellbeing. This plan schedules both and keeps each under five minutes.',
    evidence:
      'Scheduling valued activities (behavioral activation) has strong evidence as a wellbeing practice (R13); gratitude journaling shows consistent small positive effects (R14). A skills practice, not treatment.',
  },
};

// ---------------------------------------------------------------------------
// Stack templates per domain. Anchor values may be adjusted by chronotype
// (the engine picks from CHRONO_SLOTS — also fixed here).
// ---------------------------------------------------------------------------

export const CHRONO_SLOTS = {
  morning: { focusStart: '08:00', focusEnd: '11:00', ritual: '06:45', windDown: '21:00' },
  evening: { focusStart: '19:00', focusEnd: '22:00', ritual: '09:30', windDown: '23:00' },
  mixed: { focusStart: '09:00', focusEnd: '12:00', ritual: '07:30', windDown: '22:00' },
} as const;

type StackBuilder = (slots: (typeof CHRONO_SLOTS)[keyof typeof CHRONO_SLOTS]) => ProtocolStack[];

export const DOMAIN_STACKS: Record<Domain, StackBuilder> = {
  professional: (slots) => [
    {
      name: 'Deep Work Block',
      anchorType: 'time',
      anchorValue: slots.focusStart,
      steps: [
        { name: 'Phone out of reach', icon: 'phone-portrait-outline' },
        { name: 'One target written down', icon: 'create-outline', estDurationSec: 120 },
        { name: 'Focused block — no inbox', icon: 'timer-outline', estDurationSec: 5400 },
      ],
    },
    {
      name: 'Work Shutdown',
      anchorType: 'time',
      anchorValue: '17:30',
      steps: [
        { name: 'Write tomorrow’s top 3', icon: 'list-outline', estDurationSec: 300 },
        { name: 'Close the loop — say "done"', icon: 'checkmark-circle-outline' },
      ],
    },
  ],
  growth: (slots) => [
    {
      name: 'Daily Practice Block',
      anchorType: 'time',
      anchorValue: slots.ritual,
      steps: [
        { name: 'Practice the hard part first', icon: 'school-outline', estDurationSec: 1500 },
        { name: 'Self-test: recall 3 things', icon: 'help-circle-outline', estDurationSec: 300 },
      ],
    },
  ],
  health: (slots) => [
    {
      name: 'Daily Movement',
      anchorType: 'time',
      anchorValue: slots.ritual,
      steps: [{ name: 'Walk — outside if possible', icon: 'walk-outline', estDurationSec: 1200 }],
    },
    {
      name: 'Wind-Down',
      anchorType: 'time',
      anchorValue: slots.windDown,
      steps: [
        { name: 'Phone on charger — outside bedroom', icon: 'battery-charging-outline' },
        { name: 'Lights low, read', icon: 'moon-outline', estDurationSec: 900 },
      ],
    },
  ],
  interpersonal: () => [
    {
      name: 'Connection Ritual',
      anchorType: 'time',
      anchorValue: '12:30',
      steps: [
        { name: 'Message someone you value', icon: 'chatbubble-outline', estDurationSec: 180 },
        { name: 'Respond to good news with real interest', icon: 'happy-outline' },
      ],
    },
    {
      name: 'Phones-Down Dinner',
      anchorType: 'time',
      anchorValue: '19:00',
      steps: [{ name: 'Meal with phone in another room', icon: 'restaurant-outline', estDurationSec: 1800 }],
    },
  ],
  financial: () => [
    {
      name: 'Weekly Money Check-In',
      anchorType: 'time',
      anchorValue: '10:00',
      steps: [
        { name: 'Review last week’s spending', icon: 'wallet-outline', estDurationSec: 600 },
        { name: 'Confirm automations ran', icon: 'sync-outline', estDurationSec: 180 },
      ],
    },
  ],
  mind: (slots) => [
    {
      name: 'Daily Reset',
      anchorType: 'time',
      anchorValue: slots.windDown,
      steps: [
        { name: 'One small valued activity', icon: 'leaf-outline', estDurationSec: 600 },
        { name: 'One line of gratitude', icon: 'heart-outline', estDurationSec: 120 },
        { name: 'Two-minute breath', icon: 'cloud-outline', estDurationSec: 120 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Milestone ladders & goal titles. `{n}` = weeks horizon (engine-computed).
// ---------------------------------------------------------------------------

export const DOMAIN_GOAL_TITLES: Record<Domain, string> = {
  professional: 'Ship meaningful work, consistently',
  growth: 'Build a real skill with daily practice',
  health: 'Move daily, sleep on schedule',
  interpersonal: 'Show up for the people who matter',
  financial: 'Run money on a system, not stress',
  mind: 'Protect energy and attention',
};

export const DOMAIN_MILESTONES: Record<Domain, string[]> = {
  professional: [
    'Complete 5 deep-work blocks',
    'Hold the shutdown ritual for {n} weekdays in a row (forgiving)',
    'Finish one piece of work you’re proud to show',
    'Review and re-set the target at week {n}',
  ],
  growth: [
    'Define the skill and the first sub-skill to drill',
    'Practice {n} days in two weeks',
    'Pass your own self-test on the first sub-skill',
    'Demonstrate the skill once in the real world',
  ],
  health: [
    'Walk every day for one week (rest days count)',
    'Keep the wind-down {n} nights in two weeks',
    'Hold a consistent wake time for two weeks',
    'Review energy levels at week {n}',
  ],
  interpersonal: [
    'Reach out to {n} different people this month',
    'Hold phones-down dinner 3× in one week',
    'Plan one real meet-up',
    'Reflect: which ritual felt most genuine?',
  ],
  financial: [
    'List every recurring charge you pay',
    'Set up (or verify) one automation with your bank',
    'Complete {n} weekly money check-ins in a row',
    'Write down your 3-month money intention',
  ],
  mind: [
    'Complete the daily reset {n} days in two weeks',
    'Try 3 different exercises from the library',
    'Notice one situation you reframed',
    'Review: which practice actually helps?',
  ],
};

// ---------------------------------------------------------------------------
// Exercise matches per domain (slugs from src/content/exercises.ts).
// ---------------------------------------------------------------------------

export const DOMAIN_EXERCISES: Record<Domain, string[]> = {
  professional: ['breathing-box', 'reframing-perspective'],
  growth: ['values-reflection', 'breathing-box'],
  health: ['body-scan', 'breathing-4-7-8'],
  interpersonal: ['gratitude-three-good', 'values-reflection'],
  financial: ['reframing-perspective', 'breathing-calming'],
  mind: ['breathing-4-7-8', 'grounding-54321', 'reframing-thought-record', 'gratitude-three-good'],
};

/** Blocker suggestion names (fixed copy). */
export const BLOCKER_NAMES = {
  focusSession: 'Deep Focus Hours',
  painAppLimit: 'Daily limit — time-sink apps',
} as const;
