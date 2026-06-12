'use strict';

/**
 * directionModel.v1 — determinism, time-budget, banned-class, and persona
 * invariant tests (LIFEOS TICKET-106 DoD). Run: node __tests__/direction-model.test.js
 */

const path = require('path');
const assert = require('assert');
const { loadTs } = require('./tsLoader');

const model = loadTs(path.join(__dirname, '..', 'src', 'engine', 'directionModel.v1.ts'));
const templates = loadTs(path.join(__dirname, '..', 'src', 'content', 'protocols', 'templates.ts'));
const { generateProtocols, estimateWeeklyCostMin, reviewAdjustments, MODEL_VERSION } = model;

let n = 0;
function ok(name, cond, detail) {
  n += 1;
  assert.ok(cond, `case ${n} (${name})${detail ? ': ' + detail : ''}`);
  console.log(`  ok ${n} — ${name}`);
}

function survey(overrides = {}) {
  return {
    surveyVersion: 1,
    kind: 'onboarding',
    domains: ['professional', 'mind'],
    selfAssessment: {
      professional: { current: 4, blocker: 'meetings everywhere' },
      mind: { current: 6, blocker: '' },
    },
    hoursPerWeek: 6,
    chronotype: 'morning',
    values: ['mastery', 'health', 'autonomy'],
    painApps: ['Instagram'],
    ...overrides,
  };
}

// --- 12 personas --------------------------------------------------------------
const ALL = ['health', 'professional', 'growth', 'interpersonal', 'financial', 'mind'];
const PERSONAS = [
  survey(),
  survey({ domains: ALL, selfAssessment: Object.fromEntries(ALL.map((d, i) => [d, { current: (i % 9) + 1, blocker: '' }])), hoursPerWeek: 16 }),
  survey({ domains: ['growth'], selfAssessment: { growth: { current: 2, blocker: 'no plan' } }, hoursPerWeek: 2, chronotype: 'evening' }),
  survey({ domains: ['financial'], selfAssessment: { financial: { current: 3, blocker: 'no overview' } }, hoursPerWeek: 4, painApps: [] }),
  survey({ domains: ['health', 'mind'], selfAssessment: { health: { current: 5, blocker: '' }, mind: { current: 3, blocker: 'doom-scrolling' } }, hoursPerWeek: 8, chronotype: 'mixed' }),
  survey({ domains: ['interpersonal'], selfAssessment: { interpersonal: { current: 4, blocker: 'travel' } }, hoursPerWeek: 2, painApps: [] }),
  survey({ domains: ALL, selfAssessment: Object.fromEntries(ALL.map((d) => [d, { current: 9, blocker: '' }])), hoursPerWeek: 2 }), // tiny budget, many domains
  survey({ domains: ['professional', 'growth'], selfAssessment: { professional: { current: 8, blocker: '' }, growth: { current: 2, blocker: '' } }, hoursPerWeek: 12 }),
  survey({ domains: ['mind'], selfAssessment: { mind: { current: 2, blocker: 'phone in bed' } }, hoursPerWeek: 3, chronotype: 'evening' }),
  survey({ domains: ['health'], selfAssessment: { health: { current: 7, blocker: '' } }, hoursPerWeek: 6, painApps: [] }),
  survey({ domains: ['professional'], selfAssessment: { professional: { current: 1, blocker: 'burnout' } }, hoursPerWeek: 4 }),
  survey({ domains: ['growth', 'financial', 'mind'], selfAssessment: { growth: { current: 5, blocker: '' }, financial: { current: 5, blocker: '' }, mind: { current: 5, blocker: '' } }, hoursPerWeek: 0 }), // zero budget
];

// --- determinism -----------------------------------------------------------------
for (const [i, p] of PERSONAS.entries()) {
  const a = JSON.stringify(generateProtocols(p));
  const b = JSON.stringify(generateProtocols(p));
  ok(`persona ${i + 1} deterministic`, a === b);
}

// --- structural + budget invariants -------------------------------------------------
const BANNED = /\b(invest(?:ing|ment)?|stocks?|crypto|etf|portfolio|supplements?|calories?|diet|macros?|therap\w*|diagnos\w*|disorder|depression|anxiety)\b/i;

for (const [i, p] of PERSONAS.entries()) {
  const out = generateProtocols(p);
  ok(`persona ${i + 1} plans ≥1 domain`, out.length >= 1, `got ${out.length}`);
  ok(
    `persona ${i + 1} plans only selected domains`,
    out.every((pr) => p.domains.includes(pr.domain))
  );
  for (const pr of out) {
    ok(
      `persona ${i + 1} ${pr.domain} fits budget`,
      estimateWeeklyCostMin(pr.stacks) <= Math.max(pr.weeklyTimeBudgetMin, 28),
      `${estimateWeeklyCostMin(pr.stacks)} > ${pr.weeklyTimeBudgetMin}`
    );
    ok(
      `persona ${i + 1} ${pr.domain} every stack anchored (R1)`,
      pr.stacks.every((s) => (s.anchorType === 'time' && /^\d{2}:\d{2}$/.test(s.anchorValue)) || s.anchorType === 'event')
    );
    ok(`persona ${i + 1} ${pr.domain} has milestones`, pr.milestoneLadder.length >= 3);
    ok(`persona ${i + 1} ${pr.domain} no unfilled {n}`, pr.milestoneLadder.every((m) => !m.includes('{n}')));
    ok(`persona ${i + 1} ${pr.domain} model version`, pr.modelVersion === MODEL_VERSION);

    const allText = JSON.stringify(pr);
    ok(`persona ${i + 1} ${pr.domain} no banned classes`, !BANNED.test(allText), allText.match(BANNED)?.[0]);

    ok(
      `persona ${i + 1} ${pr.domain} rationale exists in registry`,
      templates.PROTOCOL_RATIONALES[pr.rationaleKey] != null
    );
  }
}

// --- specific behaviors ----------------------------------------------------------------
{
  const out = generateProtocols(survey({ painApps: [] }));
  ok('no pain apps → no blocker suggestions', out.every((p) => p.blockerSuggestion == null));
}
{
  const out = generateProtocols(survey());
  const prof = out.find((p) => p.domain === 'professional');
  ok('pain apps → professional gets focus session', prof?.blockerSuggestion?.kind === 'session');
  const mind = out.find((p) => p.domain === 'mind');
  ok('pain apps → mind gets daily limit', mind?.blockerSuggestion?.kind === 'limit');
}
{
  const morning = generateProtocols(survey({ chronotype: 'morning' }));
  const evening = generateProtocols(survey({ chronotype: 'evening' }));
  const mStart = morning.find((p) => p.domain === 'professional')?.blockerSuggestion?.schedule.startHHMM;
  const eStart = evening.find((p) => p.domain === 'professional')?.blockerSuggestion?.schedule.startHHMM;
  ok('chronotype shifts focus window', mStart === '08:00' && eStart === '19:00', `${mStart} / ${eStart}`);
}
{
  // tiny budget + many domains → plans fewer domains rather than thinner
  // everything (R2). 120 min across 6 selected domains → exactly 4 fit the
  // 30-min floor; the floors of the planned set never exceed the budget.
  const out = generateProtocols(PERSONAS[6]);
  ok('tiny budget drops domains to fit the floor', out.length === 4, `planned ${out.length}`);
  const totalPlanned = out.reduce((a, p) => a + p.weeklyTimeBudgetMin, 0);
  ok('planned budgets sum within total budget', totalPlanned <= 120, `${totalPlanned} > 120`);
}
{
  ok('review: <40% → reduce', reviewAdjustments(0.3) === 'reduce');
  ok('review: mid → hold', reviewAdjustments(0.6) === 'hold');
  ok('review: >85% → advance', reviewAdjustments(0.9) === 'advance');
}
{
  ok('empty domains → empty output', generateProtocols(survey({ domains: [] })).length === 0);
}

console.log(`\ndirection-model.test.js — all ${n} cases passed`);
