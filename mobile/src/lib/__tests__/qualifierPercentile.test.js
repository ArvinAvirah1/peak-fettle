/**
 * qualifierPercentile.test.js — the "never penalised" guarantee (plain node).
 *
 * Run: node mobile/src/lib/__tests__/qualifierPercentile.test.js
 *
 * This encodes founder decision D2, which is the single most important rule in
 * the qualifier feature: qualifiers split PR and history tracking, but a user
 * must NEVER be penalised in their strength percentile for training a harder
 * variant. Someone who only close-grip benches must not rank as a weak bencher.
 *
 * Every failure here is silent and unfair — a wrong number on a screen the user
 * has no way to audit. Hence tests, not comments.
 *
 * Covers the four hard rules from SPEC §3 plus the inflation guard that review
 * found missing from the original design (v1 protected only against penalising,
 * leaving normalized estimates able to beat a real PR through an uncapped MAX).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, deps) {
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireStub = function (id) {
    const key = id.replace(/^\.\//, '').replace(/^\.\.\//, '');
    if (deps[key]) return deps[key];
    if (deps[id]) return deps[id];
    try { return require(id); } catch (_) { return {}; }
  };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', js)(mod, mod.exports, requireStub);
  return mod.exports;
}

const qualifiers = load('mobile/src/constants/qualifiers.ts');
const qk = load('mobile/src/lib/qualifierKey.ts', {
  'constants/qualifiers': qualifiers, '../constants/qualifiers': qualifiers,
});

// A controlled catalog so the rules are tested, not the researched data.
const FAKE_MAP = {
  normalizeExerciseName: (s) => (s || '').trim().toLowerCase(),
  qualifierSpecForExercise: (name) => {
    const key = (name || '').trim().toLowerCase();
    return key === 'bench press' ? FAKE_MAP._bench : key === 'lat pulldown' ? FAKE_MAP._pulldown : null;
  },
  _bench: {
    name: 'Bench Press',
    axes: [],
    coeffs: [
      { a: 'grip_width', v: 'close', t: 'n', r: 0.95 },   // harder -> normalize up
      { a: 'grip_width', v: 'wide', t: 'p' },             // no real difference
      { a: 'bar_type', v: 'smith', t: 'x' },              // explicitly excluded
      { a: 'bench_angle', v: 'incline_30', t: 'n' },      // normalize with NO ratio
      { a: 'rom', v: 'paused', t: 'n', r: 0.85 },         // a second ratio
    ],
  },
  _pulldown: { name: 'Lat Pulldown', axes: [], coeffs: [] },
};

const qp = load('mobile/src/lib/qualifierPercentile.ts', {
  'qualifierKey': qk, './qualifierKey': qk,
  'constants/exerciseQualifierMap': FAKE_MAP, '../constants/exerciseQualifierMap': FAKE_MAP,
});

const { qualifierVerdict, qualifiedLoadForSet, bestQualifiedE1rm } = qp;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function eq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function near(a, b, m) {
  if (Math.abs(a - b) > 0.01) throw new Error((m || '') + ' expected ~' + b + ', got ' + a);
}

console.log('\nqualifierPercentile.test.js\n');

// ── RULE 4: absence is passthrough (every pre-v21 set) ──────────────────────
test('RULE 4: no qualifiers => passthrough (every pre-v21 set)', () => {
  eq(qualifierVerdict('Bench Press', null).kind, 'passthrough', 'null:');
  eq(qualifierVerdict('Bench Press', {}).kind, 'passthrough', 'empty:');
  eq(qualifiedLoadForSet('Bench Press', null, 100).kg, 100, 'load unchanged:');
});

test('RULE 4: a set whose axis the user switched off still passes through', () => {
  // The gate records nothing for a hidden axis, so the set looks like a legacy
  // one. Excluding it instead would silently empty the model.
  eq(qualifiedLoadForSet('Bench Press', null, 120).kg, 120);
});

// ── The headline guarantee ──────────────────────────────────────────────────
test('GUARANTEE: a close-grip bencher is credited UP, never penalised', () => {
  const r = qualifiedLoadForSet('Bench Press', '{"grip_width":"close"}', 100);
  assert(r.kg !== null, 'must not be dropped');
  near(r.kg, 105.26, '100kg close-grip at ratio 0.95 should credit ~105.3kg:');
  assert(r.kg > 100, 'a HARDER variant must never enter the model at face value');
  assert(r.estimated, 'and it must be flagged as an estimate, not an actual lift');
});

test('a passthrough variant enters unchanged', () => {
  const r = qualifiedLoadForSet('Bench Press', '{"grip_width":"wide"}', 100);
  eq(r.kg, 100);
  eq(r.estimated, false);
});

// ── RULE 1: missing / unusable coefficient => exclude ───────────────────────
test('RULE 1: normalize with NO ratio excludes rather than passing through', () => {
  const v = qualifierVerdict('Bench Press', { bench_angle: 'incline_30' });
  eq(v.kind, 'exclude', 'must exclude:');
  eq(v.reason, 'no-coefficient');
  eq(qualifiedLoadForSet('Bench Press', '{"bench_angle":"incline_30"}', 100).kg, null);
});

test('an explicit exclude is honoured', () => {
  const v = qualifierVerdict('Bench Press', { bar_type: 'smith' });
  eq(v.kind, 'exclude');
  eq(v.reason, 'explicit');
});

test('an unknown exercise passes through (ignorance is not evidence)', () => {
  eq(qualifiedLoadForSet('Some Unknown Lift', '{"grip_width":"close"}', 100).kg, 100);
});

test('a value with no catalog entry passes through', () => {
  // Not every axis affects achievable load; the dataset records an explicit
  // `exclude` wherever a variant is materially harder but unquantified.
  eq(qualifiedLoadForSet('Lat Pulldown', '{"attachment":"rope"}', 60).kg, 60);
});

// ── RULE 2: custom values always excluded ──────────────────────────────────
test('RULE 2: a custom value is ALWAYS excluded', () => {
  const v = qualifierVerdict('Bench Press', { attachment: 'custom:abc123' });
  eq(v.kind, 'exclude');
  eq(v.reason, 'custom');
  eq(qualifiedLoadForSet('Bench Press', '{"attachment":"custom:abc123"}', 100).kg, null);
});

test('RULE 2: a custom value excludes even alongside a valid normalize', () => {
  const v = qualifierVerdict('Bench Press', { grip_width: 'close', attachment: 'custom:x' });
  eq(v.kind, 'exclude', 'the most conservative outcome wins:');
});

// ── RULE 3: never multiply coefficients ────────────────────────────────────
test('RULE 3: two ratios exclude rather than multiplying', () => {
  const v = qualifierVerdict('Bench Press', { grip_width: 'close', rom: 'paused' });
  eq(v.kind, 'exclude', 'must not compound:');
  eq(v.reason, 'multiple-ratios');
  // Multiplying would have credited 100 / (0.95*0.85) = ~123.8kg off two
  // independent estimates. Review found real data where that double-counted a
  // single small study finding.
  eq(qualifiedLoadForSet('Bench Press', '{"grip_width":"close","rom":"paused"}', 100).kg, null);
});

test('RULE 3: one ratio plus a passthrough is fine', () => {
  const v = qualifierVerdict('Bench Press', { grip_width: 'close' });
  eq(v.kind, 'normalize');
  eq(v.ratio, 0.95);
});

// ── The inflation guard (SPEC §3 rule 4, added after review) ───────────────
test('INFLATION GUARD: a normalized estimate never beats a real lift', () => {
  const chosen = bestQualifiedE1rm([
    { e1rm: 140, estimated: false },  // actual competition bench
    { e1rm: 160, estimated: true },   // normalized close-grip estimate
  ]);
  eq(chosen.e1rm, 140, 'the ACTUAL must win even when lower:');
  eq(chosen.estimated, false);
});

test('INFLATION GUARD: an estimate fills in when there is no actual', () => {
  const chosen = bestQualifiedE1rm([{ e1rm: 160, estimated: true }]);
  eq(chosen.e1rm, 160, 'the close-grip-only lifter still gets ranked:');
  eq(chosen.estimated, true);
});

test('the best ACTUAL is chosen among several', () => {
  const chosen = bestQualifiedE1rm([
    { e1rm: 120, estimated: false },
    { e1rm: 145, estimated: false },
    { e1rm: 200, estimated: true },
  ]);
  eq(chosen.e1rm, 145);
});

// ── THE GUARANTEE: all-excluded contributes NOTHING, not a low number ──────
test('GUARANTEE: a lift with only excluded sets contributes NOTHING', () => {
  eq(bestQualifiedE1rm([]), null, 'no candidates => null, never 0 or a depressed value');
});

test('GUARANTEE: end-to-end, an all-Smith-machine bencher is unranked not weak', () => {
  const sets = [
    { kg: 100, q: '{"bar_type":"smith"}' },
    { kg: 110, q: '{"bar_type":"smith"}' },
  ];
  const candidates = [];
  for (const s of sets) {
    const r = qualifiedLoadForSet('Bench Press', s.q, s.kg);
    if (r.kg != null) candidates.push({ e1rm: r.kg, estimated: r.estimated });
  }
  eq(candidates.length, 0, 'every set excluded:');
  eq(bestQualifiedE1rm(candidates), null,
    'the lift must be ABSENT from rankings — showing a depressed bench percentile ' +
    'for someone who only Smith-benches is exactly the penalty D2 forbids');
});

test('GUARANTEE: mixing an excluded variant in never LOWERS the ranking', () => {
  const withoutVariant = bestQualifiedE1rm([{ e1rm: 140, estimated: false }]);
  const withVariant = bestQualifiedE1rm([
    { e1rm: 140, estimated: false },
    // an excluded set never even reaches here, but a weak actual set must not
    // drag the max down either
    { e1rm: 90, estimated: false },
  ]);
  eq(withVariant.e1rm, withoutVariant.e1rm, 'adding training must never reduce your number:');
});

// ── totality ───────────────────────────────────────────────────────────────
test('malformed qualifiers_json degrades to passthrough, never a crash', () => {
  eq(qualifiedLoadForSet('Bench Press', 'not json', 100).kg, 100);
  eq(qualifiedLoadForSet('Bench Press', '[1,2]', 100).kg, 100);
  eq(qualifiedLoadForSet('Bench Press', '', 100).kg, 100);
});

test('bestQualifiedE1rm ignores non-finite and non-positive candidates', () => {
  const chosen = bestQualifiedE1rm([
    { e1rm: NaN, estimated: false },
    { e1rm: 0, estimated: false },
    { e1rm: -5, estimated: false },
    { e1rm: 100, estimated: false },
  ]);
  eq(chosen.e1rm, 100);
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
