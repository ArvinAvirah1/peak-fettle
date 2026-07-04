/**
 * routineFields.test.js — S2 supersets/dropsets choke-point tests (plain node).
 *
 * Mirrors the transpile-and-eval harness used by
 * mobile/src/planGen/__tests__/quickSwap.test.js and loggerLogic.test.js (no
 * jest / no expo / no Babel runtime): require('typescript').transpileModule →
 * eval in a module context, resolving relative ./x imports.
 *
 * We test the PURE routineExerciseFields.ts module — the single source of truth
 * behind BOTH silent-drop choke points:
 *   • parseExercises (src/data/routines.ts) → allowlistExercise
 *   • migrateToPro parse + canonicalRoutineKey → allowlistExercise + canonicalizeExercise
 * routineExerciseFields.ts imports only the RoutineExercise TYPE (elided at
 * transpile), so the loader needs no stubs.
 *
 * Run: node mobile/src/data/__tests__/routineFields.test.js
 *
 * Coverage:
 *   1. allowlistExercise KEEPS valid S2 fields (superset_group/rounds/dropset).
 *   2. allowlistExercise VALIDATES/DROPS garbage (out-of-bounds, wrong type).
 *   3. Base back-compat: absent S2 fields ⇒ no S2 keys added.
 *   4. canonicalRoutineKey (via canonicalizeExercise) DISTINGUISHES grouped vs
 *      ungrouped and different dropset configs; IDENTICAL routines collapse.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/data/__tests__  → up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
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
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
  }
}

const load = makeLoader();
const F = load('mobile/src/data/routineExerciseFields.ts');

// Build a canonicalRoutineKey exactly as migrateToPro does (name + normalized).
function key(name, exercises) {
  return JSON.stringify([name, exercises.map((e) => F.canonicalizeExercise(e))]);
}

console.log('\ndata — routineFields.test.js\n');

// ── 1. allowlistExercise KEEPS valid S2 fields ───────────────────────────────
test('allowlistExercise: keeps valid superset_group / superset_rounds', () => {
  const out = F.allowlistExercise({
    exercise_id: null, name: 'Bench', target_sets: 4, target_reps: '8-12',
    superset_group: 'g1', superset_rounds: 4,
  });
  eq(out.superset_group, 'g1', 'group kept:');
  eq(out.superset_rounds, 4, 'rounds kept:');
  eq(out.name, 'Bench', 'name kept:');
  eq(out.target_sets, 4, 'target_sets kept:');
});

test('allowlistExercise: keeps a valid dropset (with drops + drop_pct)', () => {
  const out = F.allowlistExercise({
    name: 'Curl', dropset: { last_n: 2, drops: 3, drop_pct: 25 },
  });
  deepEq(out.dropset, { last_n: 2, drops: 3, drop_pct: 25 }, 'full dropset kept:');
});

test("allowlistExercise: keeps dropset last_n 'all'; drops invalid drops/drop_pct", () => {
  const out = F.allowlistExercise({
    name: 'Fly', dropset: { last_n: 'all', drops: 9, drop_pct: 99 },
  });
  // last_n 'all' valid; drops 9 (>3) and drop_pct 99 (>40) dropped.
  deepEq(out.dropset, { last_n: 'all' }, "'all' kept, out-of-bounds drops/pct dropped:");
});

// ── 2. allowlistExercise VALIDATES / DROPS garbage ───────────────────────────
test('allowlistExercise: drops out-of-bounds / wrong-type S2 fields', () => {
  const out = F.allowlistExercise({
    name: 'X',
    superset_group: 123,                 // not a string → dropped
    superset_rounds: 99,                 // > 10 → dropped
    dropset: { last_n: 0 },              // last_n 0 (<1) → whole dropset dropped
  });
  eq('superset_group' in out, false, 'non-string group dropped:');
  eq('superset_rounds' in out, false, 'out-of-range rounds dropped:');
  eq('dropset' in out, false, 'invalid dropset dropped:');
});

test('allowlistExercise: dropset with a non-object / missing last_n → dropped', () => {
  eq('dropset' in F.allowlistExercise({ name: 'A', dropset: 'nope' }), false, 'string dropset dropped:');
  eq('dropset' in F.allowlistExercise({ name: 'A', dropset: {} }), false, 'empty dropset (no last_n) dropped:');
  eq('dropset' in F.allowlistExercise({ name: 'A', dropset: { last_n: 11 } }), false, 'last_n 11 (>10) dropped:');
});

test('allowlistExercise: superset_group length bound (>40 chars dropped)', () => {
  const long = 'x'.repeat(41);
  eq('superset_group' in F.allowlistExercise({ name: 'A', superset_group: long }), false, '41-char group dropped:');
  eq(F.allowlistExercise({ name: 'A', superset_group: 'x'.repeat(40) }).superset_group, 'x'.repeat(40), '40-char kept:');
});

// ── 3. Back-compat: absent S2 fields ⇒ no S2 keys ────────────────────────────
test('allowlistExercise: absent S2 fields ⇒ base shape only (no S2 keys)', () => {
  const out = F.allowlistExercise({ exercise_id: 'e1', name: 'Squat', target_sets: 5, target_reps: '5' });
  eq('superset_group' in out, false, 'no group key:');
  eq('superset_rounds' in out, false, 'no rounds key:');
  eq('dropset' in out, false, 'no dropset key:');
  eq(out.exercise_id, 'e1', 'exercise_id kept:');
});

// ── 4. canonicalRoutineKey distinguishes grouped vs ungrouped / dropset diffs ─
test('canonicalRoutineKey: grouped vs ungrouped are DISTINCT (not deduped)', () => {
  const ungrouped = [
    { exercise_id: 'a', name: 'Bench', target_sets: 4, target_reps: '8' },
    { exercise_id: 'b', name: 'Row', target_sets: 4, target_reps: '8' },
  ];
  const grouped = [
    { exercise_id: 'a', name: 'Bench', target_sets: 4, target_reps: '8', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'b', name: 'Row', target_sets: 4, target_reps: '8', superset_group: 'g1', superset_rounds: 4 },
  ];
  assert(key('Push', ungrouped) !== key('Push', grouped), 'grouping must change the key:');
});

test('canonicalRoutineKey: different dropset configs are DISTINCT', () => {
  const base = { exercise_id: 'a', name: 'Curl', target_sets: 3, target_reps: '12' };
  const noDrop = [{ ...base }];
  const withDrop = [{ ...base, dropset: { last_n: 1, drops: 2, drop_pct: 20 } }];
  const otherDrop = [{ ...base, dropset: { last_n: 'all', drops: 2, drop_pct: 20 } }];
  assert(key('Arms', noDrop) !== key('Arms', withDrop), 'dropset presence changes key:');
  assert(key('Arms', withDrop) !== key('Arms', otherDrop), 'different last_n changes key:');
});

test('canonicalRoutineKey: IDENTICAL routines (incl. S2 fields) collapse to same key', () => {
  const a = [
    { exercise_id: 'a', name: 'Bench', target_sets: 4, target_reps: '8', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'b', name: 'Row', target_sets: 4, target_reps: '8', superset_group: 'g1', superset_rounds: 4, dropset: { last_n: 2, drops: 2, drop_pct: 20 } },
  ];
  // Same content, freshly built (key order differs in source, canonicalize fixes it).
  const b = [
    { name: 'Bench', exercise_id: 'a', target_reps: '8', target_sets: 4, superset_rounds: 4, superset_group: 'g1' },
    { dropset: { drop_pct: 20, last_n: 2, drops: 2 }, name: 'Row', exercise_id: 'b', target_reps: '8', target_sets: 4, superset_group: 'g1', superset_rounds: 4 },
  ];
  eq(key('Pull', a), key('Pull', b), 'identical routines → identical key (key-order-independent):');
});

test('canonicalizeExercise: null-folds absent optional fields (server-echo match)', () => {
  const c = F.canonicalizeExercise({ name: 'X' });
  deepEq(c, {
    exercise_id: null, name: 'X', target_sets: null, target_reps: null,
    superset_group: null, superset_rounds: null, dropset: null,
  }, 'all optionals null-folded:');
});

// -- TICKET-144: N>2 (circuit) group round-trip through the allowlist choke ---
// point. The routine editor now links up to 5 exercises into ONE group
// (UI-bound at 4 extra + the anchor); the schema/allowlist itself has never
// capped group SIZE (only per-field bounds: group id length, rounds 1-10) —
// this test proves a 4-exercise circuit survives allowlistExercise unchanged,
// keeps a stable canonicalRoutineKey, and that mixed group/solo membership in
// the same routine still round-trips correctly (DATA-01 allowlist bounds
// unchanged by the N>2 UI unlock).
test('TICKET-144: 4-exercise circuit group round-trips through allowlistExercise unchanged', () => {
  const raw = [
    { exercise_id: 'a', name: 'Squat', target_sets: 4, target_reps: '10', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'b', name: 'Row', target_sets: 4, target_reps: '10', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'c', name: 'Push-up', target_sets: 4, target_reps: '12', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'd', name: 'Lunge', target_sets: 4, target_reps: '10', superset_group: 'g1', superset_rounds: 4 },
  ];
  const out = raw.map((e) => F.allowlistExercise(e));
  eq(out.length, 4, 'all 4 members survive the allowlist:');
  for (let i = 0; i < out.length; i++) {
    eq(out[i].superset_group, 'g1', `member ${i} keeps group id:`);
    eq(out[i].superset_rounds, 4, `member ${i} keeps shared rounds:`);
    eq(out[i].name, raw[i].name, `member ${i} keeps its own name:`);
  }
  // Round-trip stability: re-allowlisting the already-allowlisted output is a
  // no-op (idempotent), matching what a save->reload cycle in the editor does.
  const out2 = out.map((e) => F.allowlistExercise(e));
  deepEq(out2, out, 're-allowlisting the allowlisted output is idempotent:');
});

test('TICKET-144: 5-member group (anchor + 4 linked, the UI max) is NOT rejected by the allowlist', () => {
  // The allowlist itself imposes no group-SIZE cap (only per-field bounds) —
  // the 5-member ceiling is a UI decision (SupersetLinkSheet/SupersetPairSheet
  // MAX_EXTRA = 4). Prove the data layer tolerates the UI's max group size.
  const raw = ['A1', 'A2', 'A3', 'A4', 'A5'].map((name, i) => ({
    exercise_id: `e${i}`, name, target_sets: 3, target_reps: '8',
    superset_group: 'gFull', superset_rounds: 3,
  }));
  const out = raw.map((e) => F.allowlistExercise(e));
  eq(out.length, 5, 'all 5 members kept:');
  eq(out.every((e) => e.superset_group === 'gFull'), true, 'all share the group id:');
});

test('TICKET-144: canonicalRoutineKey distinguishes a 4-exercise circuit from the same exercises ungrouped', () => {
  const grouped4 = [
    { exercise_id: 'a', name: 'Squat', target_sets: 4, target_reps: '10', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'b', name: 'Row', target_sets: 4, target_reps: '10', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'c', name: 'Push-up', target_sets: 4, target_reps: '12', superset_group: 'g1', superset_rounds: 4 },
    { exercise_id: 'd', name: 'Lunge', target_sets: 4, target_reps: '10', superset_group: 'g1', superset_rounds: 4 },
  ];
  const ungrouped4 = grouped4.map(({ superset_group, superset_rounds, ...rest }) => rest);
  assert(
    key('CircuitDay', grouped4) !== key('CircuitDay', ungrouped4),
    '4-exercise circuit key differs from the same exercises ungrouped:',
  );
  // A freshly-rebuilt IDENTICAL 4-member circuit (key order shuffled, as a
  // save/reload would produce) still collapses to the SAME key.
  const grouped4Rebuilt = [
    { name: 'Squat', superset_rounds: 4, exercise_id: 'a', superset_group: 'g1', target_reps: '10', target_sets: 4 },
    { superset_group: 'g1', name: 'Row', exercise_id: 'b', target_sets: 4, target_reps: '10', superset_rounds: 4 },
    { exercise_id: 'c', superset_rounds: 4, name: 'Push-up', target_reps: '12', superset_group: 'g1', target_sets: 4 },
    { target_sets: 4, exercise_id: 'd', name: 'Lunge', superset_group: 'g1', target_reps: '10', superset_rounds: 4 },
  ];
  eq(
    key('CircuitDay', grouped4), key('CircuitDay', grouped4Rebuilt),
    'identical 4-member circuit round-trips to the same key regardless of source key order:',
  );
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
