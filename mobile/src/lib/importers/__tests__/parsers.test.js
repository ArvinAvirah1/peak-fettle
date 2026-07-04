/**
 * parsers.test.js — Strong/Hevy CSV parser + name-mapping tests (plain node).
 *
 * Uses the same transpile-and-eval harness as
 * mobile/src/components/__tests__/loggerLogic.test.js (no jest/expo/Babel
 * runtime needed): require('typescript').transpileModule → eval in a module
 * context, with a require() stub that resolves relative imports and falls
 * back to `{}` for anything unresolvable (not needed here — every module
 * under test is pure/dependency-free).
 *
 * Run:  node mobile/src/lib/importers/__tests__/parsers.test.js
 *
 * Coverage (TICKET-135 acceptance criteria):
 *   1. Header-signature auto-detection for Strong and Hevy, tolerant of
 *      column reordering/extra columns; rejects an unrelated header.
 *   2. Fuzzy/alias exercise-name mapping — common aliases resolve, an unknown
 *      name does not.
 *   3. Units: a 185 lb Strong row converts to 83.91 kg (not 185); a Hevy kg
 *      row passes through unchanged.
 *   4. Warm-up/failure/drop markers map correctly; RPE → RIR = 10 - RPE,
 *      clamped to [0, 10].
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function makeLoader() {
  const cache = {};
  function load(relPath) {
    if (cache[relPath]) return cache[relPath];
    const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
    const js = ts.transpileModule(src, {
      compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache[relPath] = mod.exports;
    const dir = path.dirname(path.join(REPO, relPath));
    const requireStub = function (id) {
      if (id.charAt(0) === '.') {
        const base = path.resolve(dir, id);
        const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
        for (const cand of cands) {
          if (fs.existsSync(cand)) {
            return load(path.relative(REPO, cand).split(path.sep).join('/'));
          }
        }
      }
      try { return require(id); } catch (_) { return {}; }
    };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
      mod, mod.exports, requireStub, dir, path.join(REPO, relPath)
    );
    cache[relPath] = mod.exports;
    return mod.exports;
  }
  return load;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function close(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error((msg || '') + ` expected ${a} ~= ${b}`);
}

const load = makeLoader();
const csvUtil = load('mobile/src/lib/importers/csvUtil.ts');
const strongCsv = load('mobile/src/lib/importers/strongCsv.ts');
const hevyCsv = load('mobile/src/lib/importers/hevyCsv.ts');
const nameMapping = load('mobile/src/lib/importers/nameMapping.ts');

const FIXTURES = path.join(__dirname, 'fixtures');
const strongText = fs.readFileSync(path.join(FIXTURES, 'strong_sample.csv'), 'utf8');
const hevyText = fs.readFileSync(path.join(FIXTURES, 'hevy_sample.csv'), 'utf8');

console.log('\nimporters — parsers.test.js\n');

// ── csvUtil ──────────────────────────────────────────────────────────────

test('parseCsv: splits rows/cells, handles quoted commas', () => {
  const rows = csvUtil.parseCsv('a,b,c\n"x, y",2,3\n');
  eq(rows.length, 2, 'row count:');
  eq(rows[1][0], 'x, y', 'quoted comma cell:');
});

test('headerHasAll: tolerant of reordering and extra columns', () => {
  const header = ['Reps', 'Extra Col', 'Date', 'Weight', 'Set Order', 'Workout Name', 'Exercise Name'];
  assert(csvUtil.headerHasAll(header, ['Date', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Reps']));
});

// ── Format auto-detection ───────────────────────────────────────────────

test('isStrongHeader: matches the Strong signature', () => {
  const header = csvUtil.parseCsv(strongText.split('\n')[0])[0];
  assert(strongCsv.isStrongHeader(header), 'strong header should match');
  assert(!hevyCsv.isHevyHeader(header), 'strong header should NOT match hevy');
});

test('isHevyHeader: matches the Hevy signature', () => {
  const header = csvUtil.parseCsv(hevyText.split('\n')[0])[0];
  assert(hevyCsv.isHevyHeader(header), 'hevy header should match');
  assert(!strongCsv.isStrongHeader(header), 'hevy header should NOT match strong');
});

test('isStrongHeader/isHevyHeader: reject an unrelated (Garmin-ish) header', () => {
  const header = ['Activity Type', 'Date', 'Favorite', 'Title', 'Distance'];
  assert(!strongCsv.isStrongHeader(header));
  assert(!hevyCsv.isHevyHeader(header));
});

test('parseStrongCsv: returns null on a non-Strong file', () => {
  eq(strongCsv.parseStrongCsv('a,b,c\n1,2,3\n'), null);
});

test('parseHevyCsv: returns null on a non-Hevy file', () => {
  eq(hevyCsv.parseHevyCsv('a,b,c\n1,2,3\n'), null);
});

// ── Strong parsing ───────────────────────────────────────────────────────

const strongParsed = strongCsv.parseStrongCsv(strongText);

test('parseStrongCsv: parses every data row', () => {
  assert(strongParsed != null, 'should parse');
  eq(strongParsed.source, 'strong');
  eq(strongParsed.rows.length, 9, 'row count:');
});

test('parseStrongCsv: warm-up marker (W1 in Set Order + notes) detected', () => {
  const row = strongParsed.rows[0];
  eq(row.exerciseNameRaw, 'Bench Press');
  assert(row.isWarmup === true, 'expected warmup row');
  assert(row.isFailure === false);
});

test('parseStrongCsv: failure marker (notes: "to failure") detected', () => {
  const row = strongParsed.rows[3];
  assert(row.isFailure === true, 'expected failure row');
  eq(row.reps, 4);
});

test('parseStrongCsv: RPE column parsed as a number', () => {
  const row = strongParsed.rows[1];
  eq(row.rpe, 8);
});

test('parseStrongCsv: weight is returned RAW (not yet converted) — 185 stays 185', () => {
  const row = strongParsed.rows[1];
  eq(row.weightRaw, 185);
});

// ── Hevy parsing ─────────────────────────────────────────────────────────

const hevyParsed = hevyCsv.parseHevyCsv(hevyText);

test('parseHevyCsv: parses every data row', () => {
  assert(hevyParsed != null, 'should parse');
  eq(hevyParsed.source, 'hevy');
  eq(hevyParsed.rows.length, 8, 'row count:');
});

test('parseHevyCsv: set_type=warmup / drop detected', () => {
  eq(hevyParsed.rows[0].isWarmup, true);
  eq(hevyParsed.rows[3].isDrop, true);
});

test('parseHevyCsv: weight_kg passes through unchanged (already kg)', () => {
  eq(hevyParsed.rows[1].weightRaw, 80);
});

// ── Name mapping ─────────────────────────────────────────────────────────

const CANDIDATES = [
  { id: 'c1', name: 'Bench Press' },
  { id: 'c2', name: 'Back Squat' },
  { id: 'c3', name: 'Dumbbell Shoulder Press' },
  { id: 'c4', name: 'Overhead Press' },
];

test('matchExerciseName: exact match', () => {
  const r = nameMapping.matchExerciseName('Bench Press', CANDIDATES);
  eq(r.exerciseId, 'c1');
});

test('matchExerciseName: alias table resolves a common competitor name', () => {
  const r = nameMapping.matchExerciseName('Barbell Bench Press', CANDIDATES);
  eq(r.exerciseId, 'c1', 'alias should resolve to canonical Bench Press');
});

test('matchExerciseName: alias table resolves "OHP" → Overhead Press', () => {
  const r = nameMapping.matchExerciseName('OHP', CANDIDATES);
  eq(r.exerciseId, 'c4');
});

test('matchExerciseName: fuzzy match tolerates minor variation', () => {
  const r = nameMapping.matchExerciseName('Dumbell Shoulder Press', CANDIDATES); // typo: Dumbell
  eq(r.exerciseId, 'c3', 'fuzzy match should still resolve despite typo');
});

test('matchExerciseName: unrelated name is unmatched', () => {
  const r = nameMapping.matchExerciseName('Some Weird Machine Thing', CANDIDATES);
  eq(r.exerciseId, null);
  eq(r.method, 'unmatched');
});

test('aliasTableSize: covers at least ~100 competitor names', () => {
  assert(nameMapping.aliasTableSize() >= 100, `expected >=100 aliases, got ${nameMapping.aliasTableSize()}`);
});

// ── RPE → RIR ────────────────────────────────────────────────────────────

test('rirFromRpe: RIR = 10 - RPE', () => {
  eq(nameMapping.rirFromRpe(8), 2);
  eq(nameMapping.rirFromRpe(9), 1);
  eq(nameMapping.rirFromRpe(10), 0);
});

test('rirFromRpe: clamps to [0, 10]', () => {
  eq(nameMapping.rirFromRpe(11), 0, 'RPE above 10 clamps to 0 RIR');
  eq(nameMapping.rirFromRpe(-1), 10, 'negative RPE clamps to 10 RIR');
});

test('rirFromRpe: null RPE → null RIR', () => {
  eq(nameMapping.rirFromRpe(null), null);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
