/**
 * fatigue.test.js — TICKET-142 trigger-rule tests (table-driven).
 *
 * Same dependency-free transpile-and-eval harness as autoregulation.test.js.
 * Run: node mobile/src/lib/trainingEngine/v2/__tests__/fatigue.test.js
 *
 * The cases below are the documentation of record for the FT-D1/FT-V1
 * thresholds and the dismissal-backoff arithmetic (worked examples per the
 * ticket's acceptance criteria; founder sign-off tracked in TICKET-142).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, cache) {
  cache = cache || {};
  const norm = path.normalize(relPath);
  if (cache[norm]) return cache[norm];
  const abs = path.join(REPO, norm);
  let file = abs;
  if (!fs.existsSync(file)) file = abs + '.ts';
  if (!fs.existsSync(file)) file = abs + '.tsx';
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache[norm] = mod.exports;
  const dir = path.dirname(file);
  const localRequire = (spec) => {
    if (spec.startsWith('.')) {
      const rel = path.relative(REPO, path.resolve(dir, spec));
      return load(rel, cache);
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

const FT = load('mobile/src/lib/trainingEngine/v2/fatigue.ts');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ', name); }
  else { failed++; console.log('  FAIL ', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Fixed "now" — determinism (no clock reads in the rule or in test inputs).
const NOW = '2026-07-03T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const DAY = 24 * 60 * 60 * 1000;

/** Readiness entry `off` days before NOW (off may be negative for future). */
function day(off, score) {
  return { date: new Date(NOW_MS - off * DAY).toISOString(), score };
}

const DELOAD_6W = new Date(NOW_MS - 44 * DAY).toISOString(); // 6 whole weeks ago
const DELOAD_2W = new Date(NOW_MS - 14 * DAY).toISOString(); // 2 weeks ago (recent)

const lowWeek = [6, 5, 4, 3, 2, 1, 0].map((o) => day(o, 50)); // 7 scored days @ 50

// ---------------------------------------------------------------------------
// Rule table cases (worked examples)
// ---------------------------------------------------------------------------
const CASES = [
  {
    name: 'FT-D1 fires: week mean 50 (7 scored days), deload 6 wks ago',
    series: lowWeek, cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: { rule_id: 'FT-D1', action: 'pull_deload_forward' },
  },
  {
    name: 'FT-D1 outranks FT-V1 (same series also has 3 low recent sessions)',
    series: lowWeek, cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: { rule_id: 'FT-D1' },
  },
  {
    name: 'FT-V1 fires: only 3 scored days (below the 4-day D1 gate), all under 60',
    series: [day(4, 52), day(2, 55), day(0, 58)], cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: { rule_id: 'FT-V1', action: 'trim_accessory_volume', trim_pct: 20 },
  },
  {
    name: 'recent deload (2 wks) blocks FT-D1; falls through to FT-V1',
    series: lowWeek, cfg: { now: NOW, lastDeloadAt: DELOAD_2W },
    expect: { rule_id: 'FT-V1' },
  },
  {
    name: 'no deload on record + short history span (<35 d) + V1 not met -> null',
    series: [day(6, 50), day(5, 50), day(4, 50), day(3, 50), day(2, 45), day(1, 80), day(0, 45)],
    cfg: { now: NOW, lastDeloadAt: null },
    expect: null,
  },
  {
    name: 'no deload on record + 40-day span -> FT-D1 eligible ("no deload is on record")',
    series: [day(40, 70)].concat([day(6, 50), day(5, 50), day(4, 50), day(3, 50), day(2, 45), day(1, 80), day(0, 45)]),
    cfg: { now: NOW, lastDeloadAt: null },
    expect: { rule_id: 'FT-D1' },
  },
  {
    name: 'healthy scores -> null',
    series: [6, 5, 4, 3, 2, 1, 0].map((o) => day(o, 75)), cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'boundary: week mean exactly 55 does NOT fire D1 (and V1 pattern not met) -> null',
    series: [day(3, 50), day(2, 50), day(1, 60), day(0, 60)], cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'boundary: three scores exactly 60 do NOT fire V1 -> null',
    series: [day(4, 60), day(2, 60), day(0, 60)], cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'unknown (null-score) days are ignored, scored days still trigger D1',
    series: [day(6, 50), day(5, null), day(4, 50), day(3, null), day(2, 50), day(1, 50), day(0, null)],
    cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: { rule_id: 'FT-D1' },
  },
  {
    name: 'empty series -> null',
    series: [], cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'all-null scores -> null',
    series: [day(2, null), day(1, null), day(0, null)], cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'malformed rows (bad date, NaN, out-of-range) are filtered -> null',
    series: [{ date: 'garbage', score: 50 }, day(1, NaN), day(0, 150)],
    cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'future-dated rows are ignored (low future scores cannot trigger)',
    series: [6, 5, 4, 3, 2, 1, 0].map((o) => day(o, 75)).concat([day(-1, 10), day(-2, 10), day(-3, 10)]),
    cfg: { now: NOW, lastDeloadAt: DELOAD_6W },
    expect: null,
  },
  {
    name: 'dismissed yesterday (count 1, 3-day backoff) suppresses -> null',
    series: [day(4, 52), day(2, 55), day(0, 58)],
    cfg: { now: NOW, lastDeloadAt: DELOAD_6W, dismissal: { lastDismissedAt: new Date(NOW_MS - 1 * DAY).toISOString(), consecutiveDismissals: 1 } },
    expect: null,
  },
  {
    name: 'dismissal expired (4 days ago, count 1) -> fires again',
    series: [day(4, 52), day(2, 55), day(0, 58)],
    cfg: { now: NOW, lastDeloadAt: DELOAD_6W, dismissal: { lastDismissedAt: new Date(NOW_MS - 4 * DAY).toISOString(), consecutiveDismissals: 1 } },
    expect: { rule_id: 'FT-V1' },
  },
  {
    name: 'post-deload reset: 28-day backoff voided by a deload AFTER the dismissal -> FT-V1',
    series: [day(2, 50), day(1, 50), day(0, 50)],
    cfg: { now: NOW, lastDeloadAt: new Date(NOW_MS - 5 * DAY).toISOString(), dismissal: { lastDismissedAt: new Date(NOW_MS - 10 * DAY).toISOString(), consecutiveDismissals: 5 } },
    expect: { rule_id: 'FT-V1' },
  },
];

console.log('suggestPlanAdjustment rule table:');
const outputs = [];
for (const c of CASES) {
  const out = FT.suggestPlanAdjustment(c.series, c.cfg);
  outputs.push(out);
  if (c.expect === null) {
    check(c.name, out === null, out);
  } else {
    const ok = out !== null && Object.keys(c.expect).every((k) => out[k] === c.expect[k]);
    check(c.name, ok, out);
  }
}

// ---------------------------------------------------------------------------
// Backoff arithmetic
// ---------------------------------------------------------------------------
console.log('dismissal backoff arithmetic:');
check('backoff(0) = 0', FT.dismissalBackoffDays(0) === 0);
check('backoff(1) = 3', FT.dismissalBackoffDays(1) === 3);
check('backoff(2) = 6', FT.dismissalBackoffDays(2) === 6);
check('backoff(3) = 12', FT.dismissalBackoffDays(3) === 12);
check('backoff(4) = 24', FT.dismissalBackoffDays(4) === 24);
check('backoff(5) caps at 28', FT.dismissalBackoffDays(5) === 28);
check('backoff(10) caps at 28', FT.dismissalBackoffDays(10) === 28);

check('nextDismissalState from null -> count 1',
  FT.nextDismissalState(null, NOW).consecutiveDismissals === 1 &&
  FT.nextDismissalState(null, NOW).lastDismissedAt === NOW);
check('nextDismissalState increments an existing count',
  FT.nextDismissalState({ lastDismissedAt: NOW, consecutiveDismissals: 2 }, NOW).consecutiveDismissals === 3);
check('acceptedDismissalState resets',
  FT.acceptedDismissalState().consecutiveDismissals === 0 &&
  FT.acceptedDismissalState().lastDismissedAt === null);

// ---------------------------------------------------------------------------
// Cross-cutting invariants
// ---------------------------------------------------------------------------
console.log('invariants:');
const fired = outputs.filter((o) => o !== null);
check('founder rule: the word "AI" never appears in any because-line',
  fired.every((o) => !/\bAI\b/i.test(o.because)));
check('every proposal names its rule id in the because-line',
  fired.every((o) => o.because.includes(o.rule_id)));
check('every proposal maps to an EXISTING plan mechanism action',
  fired.every((o) => o.action === 'pull_deload_forward' || o.action === 'trim_accessory_volume'));
check('determinism: identical inputs -> identical output',
  JSON.stringify(FT.suggestPlanAdjustment(lowWeek, { now: NOW, lastDeloadAt: DELOAD_6W })) ===
  JSON.stringify(FT.suggestPlanAdjustment(lowWeek, { now: NOW, lastDeloadAt: DELOAD_6W })));

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
