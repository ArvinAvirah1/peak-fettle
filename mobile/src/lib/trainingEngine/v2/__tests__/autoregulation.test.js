/**
 * autoregulation.test.js — TICKET-141 rule-module tests (table-driven).
 *
 * Same dependency-free transpile-and-eval harness as engineV2.test.js.
 * Run: node mobile/src/lib/trainingEngine/v2/__tests__/autoregulation.test.js
 *
 * The CASES table below is the documentation of record for the thresholds
 * (worked examples per the ticket's "engine docs" acceptance criterion).
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

const AR = load('mobile/src/lib/trainingEngine/v2/autoregulation.ts');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ', name); }
  else { failed++; console.log('  FAIL ', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Fixed "now" — determinism (no clock reads in the rule or the tests' inputs).
const NOW = '2026-07-03T12:00:00.000Z';
const RECENT = '2026-07-01T10:00:00.000Z'; // 2 days before NOW
const STALE = '2026-06-01T10:00:00.000Z';  // 32 days before NOW

const band = { targetRepsLow: 8, targetRepsHigh: 10, targetRirLow: 1, targetRirHigh: 3 };
const cfgKg = { unitPref: 'kg', equipment: 'barbell', effortDisplay: 'rir', now: NOW };

function set(weightKg, reps, rir, loggedAt, isDrop) {
  return { weightKg, reps, rir, loggedAt: loggedAt || RECENT, isDrop: !!isDrop };
}

// ---------------------------------------------------------------------------
// Rule table cases (worked examples)
// ---------------------------------------------------------------------------
const CASES = [
  {
    name: 'AR-P1 progression: 80x10 @ RIR 3 (band top, room) -> 82.5 kg',
    history: [set(80, 10, 3)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-P1', suggested_kg: 82.5 },
  },
  {
    name: 'AR-H1 hold: 80x9 @ RIR 2 (inside band) -> 80 kg',
    history: [set(80, 9, 2)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-H1', suggested_kg: 80 },
  },
  {
    name: 'AR-R1 effort miss: 80x8 @ RIR 0 (reps hit, too close to failure) -> hold 80 kg',
    history: [set(80, 8, 0)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-R1', suggested_kg: 80 },
  },
  {
    name: 'AR-D1 missed reps: 80x6 @ RIR 1 -> ~-2.5% => 77.5 kg (barbell rounding)',
    history: [set(80, 6, 1)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-D1', suggested_kg: 77.5 },
  },
  {
    name: 'AR-D1 guarantees at least one increment down (60x6: 58.5 rounds back to 60 -> force 57.5)',
    history: [set(60, 6, 1)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-D1', suggested_kg: 57.5 },
  },
  {
    name: 'AR-S1 stale (>21 d): 100x8 32 days ago -> 90 kg restart',
    history: [set(100, 8, 2, STALE)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-S1', suggested_kg: 90 },
  },
  {
    name: 'null RIR + reps at band top -> AR-P1 (reps-only signal)',
    history: [set(80, 10, null)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-P1', suggested_kg: 82.5 },
  },
  {
    name: 'null RIR + reps mid-band -> AR-H1 hold',
    history: [set(80, 9, null)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-H1', suggested_kg: 80 },
  },
  {
    name: 'lbs mode progression rounds to 5 lb steps: 102.06 kg (225 lb) x10 @3 -> 230 lb = 104.33 kg',
    history: [set(102.06, 10, 3)], targets: band,
    cfg: { unitPref: 'lbs', equipment: 'barbell', effortDisplay: 'rir', now: NOW },
    expect: { rule_id: 'AR-P1', suggested_kg: 104.33 },
  },
  {
    name: 'lbs dumbbell: 22.68 kg (50 lb) x10 @3 -> 55 lb = 24.95 kg',
    history: [set(22.68, 10, 3)], targets: band,
    cfg: { unitPref: 'lbs', equipment: 'dumbbell', effortDisplay: 'rir', now: NOW },
    expect: { rule_id: 'AR-P1', suggested_kg: 24.95 },
  },
  {
    name: 'kg dumbbell increment is 2 kg: 24x10 @3 -> 26 kg',
    history: [set(24, 10, 3)], targets: band,
    cfg: { unitPref: 'kg', equipment: 'dumbbell', effortDisplay: 'rir', now: NOW },
    expect: { rule_id: 'AR-P1', suggested_kg: 26 },
  },
  {
    name: 'bodyweight equipment -> AR-H1 with rep-focused copy, load unchanged',
    history: [set(70, 12, 2)], targets: band,
    cfg: { unitPref: 'kg', equipment: 'bodyweight', effortDisplay: 'rir', now: NOW },
    expect: { rule_id: 'AR-H1', suggested_kg: 70 },
  },
  {
    name: 'drop rows are excluded: heavy drop set does not become the reference',
    history: [set(80, 9, 2), set(120, 3, 0, RECENT, true)], targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-H1', suggested_kg: 80 },
  },
  {
    name: 'reference = best set of the NEWEST day (older heavier day ignored)',
    history: [set(100, 10, 3, '2026-06-25T10:00:00.000Z'), set(80, 9, 2, RECENT)],
    targets: band, cfg: cfgKg,
    expect: { rule_id: 'AR-H1', suggested_kg: 80 },
  },
];

console.log('TICKET-141 autoregulation rule table:');
for (const c of CASES) {
  const out = AR.suggestNextLoad(c.history, c.targets, c.cfg);
  const ok =
    out &&
    out.rule_id === c.expect.rule_id &&
    Math.abs(out.suggested_kg - c.expect.suggested_kg) < 0.01 &&
    typeof out.because === 'string' &&
    out.because.length > 10;
  check(c.name, ok, out);
}

// ---------------------------------------------------------------------------
// Behavioural invariants
// ---------------------------------------------------------------------------
console.log('Invariants:');

check('empty history -> null', AR.suggestNextLoad([], band, cfgKg) === null);
check('all-drop history -> null', AR.suggestNextLoad([set(80, 8, 1, RECENT, true)], band, cfgKg) === null);

const a = AR.suggestNextLoad([set(80, 10, 3)], band, cfgKg);
const b = AR.suggestNextLoad([set(80, 10, 3)], band, cfgKg);
check('determinism: identical inputs -> identical output', JSON.stringify(a) === JSON.stringify(b));

const rpeCfg = { unitPref: 'kg', equipment: 'barbell', effortDisplay: 'rpe', now: NOW };
const rpeOut = AR.suggestNextLoad([set(80, 9, 2)], band, rpeCfg);
check('TICKET-128: because-copy respects RPE display mode', /RPE 8/.test(rpeOut.because), rpeOut.because);
const rirOut = AR.suggestNextLoad([set(80, 9, 2)], band, cfgKg);
check('TICKET-128: because-copy respects RIR display mode', /RIR 2/.test(rirOut.because), rirOut.because);

const all = CASES.map((c) => AR.suggestNextLoad(c.history, c.targets, c.cfg));
check('founder rule: the word "AI" never appears in any because-line',
  all.every((o) => o && !/\bAI\b/i.test(o.because)));
check('every suggestion names its rule id in the because-line',
  all.every((o) => o && o.because.includes(o.rule_id)));

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
