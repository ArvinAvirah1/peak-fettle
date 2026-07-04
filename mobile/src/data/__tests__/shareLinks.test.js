/**
 * shareLinks.test.js — TICKET-138 round-trip test (plain node, no jest/expo).
 *
 * Mirrors the transpile-and-eval harness used by
 * mobile/src/data/__tests__/routineFields.test.js (no Babel/RN runtime):
 * require('typescript').transpileModule → eval in a module context, resolving
 * relative ./x imports.
 *
 * What this proves (spec acceptance criterion #5 for TICKET-138):
 *   "Round-trip test: routine with superset pair + dropset config survives
 *    share → import byte-equal on the allowlisted fields (canonicalRoutineKey
 *    stable)."
 *
 * The round trip simulated here:
 *   1. CLIENT routine (superset pair + a dropset exercise) is what the user
 *      taps "Share" on.
 *   2. SERVER validate+store step — mirrors routes/shareLinks.js'
 *      ShareRoutineBlobSchema/ExerciseEntrySchema (inlined below via the same
 *      `zod` package the server uses, from the server's node_modules — this
 *      is a deliberate, documented duplication of the schema, not a shared
 *      import, because requiring the real server route would pull in
 *      express/pg/pool for a DB connection this unit test must not open).
 *      Zod strips unknown keys and folds `.optional()` absence — the same
 *      transform the real POST /routines/:id/share performs before INSERTing
 *      the jsonb blob.
 *   3. CLIENT import step — mobile/src/data/shareLinks.ts's pure allowlist
 *      logic (routineExerciseFields.ts allowlistExercise), run over the
 *      "fetched" blob exactly as importSharedRoutine() does.
 *   4. Assert: canonicalizeExercise(imported) deep-equals
 *      canonicalizeExercise(original) for every exercise (byte-equal on the
 *      allowlisted fields), AND the canonicalRoutineKey-shaped tuple matches.
 *
 * Also covers parseRoutineShareUrl (deep-link + web-preview URL parsing).
 *
 * Run: node mobile/src/data/__tests__/shareLinks.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/data/__tests__  → up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));
// Server's zod — used ONLY to mirror the server-side validate+store step
// (see header comment). Not a dependency of the mobile app itself.
const { z } = require(path.join(REPO, 'peak-fettle-agents', 'server', 'node_modules', 'zod'));

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
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
  }
}

const load = makeLoader();
// Pure client modules under test — no apiClient/localDb calls are exercised
// (createShareLink/importSharedRoutine's network+DB glue are NOT invoked by
// this test; only the pure allowlist/parse core is), so the .js require stubs
// for axios/expo-* inside the loader (best-effort `try/catch` → `{}`) never
// come into play for the functions this test actually calls.
const RF = load('mobile/src/data/routineExerciseFields.ts');
const SL = load('mobile/src/data/shareLinks.ts');

// ---------------------------------------------------------------------------
// Server-side mirror of routes/shareLinks.js's Zod schemas (see header).
// ---------------------------------------------------------------------------
const ExerciseEntrySchema = z.object({
  exercise_id: z.string().uuid().nullable().optional(),
  name:        z.string().min(1).max(100),
  target_sets: z.number().int().min(1).max(20).optional(),
  target_reps: z.string().max(20).optional(),
  superset_group:  z.string().min(1).max(40).nullable().optional(),
  superset_rounds: z.number().int().min(1).max(10).nullable().optional(),
  dropset: z.object({
    last_n:   z.union([z.number().int().min(1).max(10), z.literal('all')]),
    drops:    z.number().int().min(1).max(3).optional(),
    drop_pct: z.number().int().min(5).max(40).optional(),
  }).nullable().optional(),
});
const ShareRoutineBlobSchema = z.object({
  name:      z.string().min(1).max(100),
  exercises: z.array(ExerciseEntrySchema).max(30).optional().default([]),
});

/** Simulates POST /routines/:id/share's validate step, then the GET echo (jsonb round-trip). */
function serverStoreAndEcho(routine) {
  const parsed = ShareRoutineBlobSchema.parse(routine);
  // jsonb round-trip: JSON.stringify/parse loses `undefined` keys exactly like
  // Postgres jsonb does — mirror that by going through JSON once.
  return JSON.parse(JSON.stringify(parsed));
}

/** Simulates the CLIENT import step (mobile/src/data/shareLinks.ts's core logic). */
function clientImport(blob) {
  const rawExercises = Array.isArray(blob.exercises) ? blob.exercises : [];
  const exercises = rawExercises
    .filter((e) => e && typeof e === 'object')
    .map((e) => RF.allowlistExercise(e))
    .slice(0, 30);
  return { name: blob.name, exercises };
}

console.log('\ndata — shareLinks.test.js\n');

// ── Round trip: superset pair + dropset config ──────────────────────────────
test('round trip: superset pair + dropset survive share → import byte-equal on allowlisted fields', () => {
  const original = {
    name: 'Push Day A',
    exercises: [
      {
        exercise_id: '11111111-1111-1111-1111-111111111111',
        name: 'Bench Press',
        target_sets: 4,
        target_reps: '6-8',
        superset_group: 'g1',
        superset_rounds: 3,
      },
      {
        exercise_id: '22222222-2222-2222-2222-222222222222',
        name: 'Cable Fly',
        target_sets: 4,
        target_reps: '10-12',
        superset_group: 'g1',
        superset_rounds: 3,
      },
      {
        exercise_id: '33333333-3333-3333-3333-333333333333',
        name: 'Triceps Pushdown',
        target_sets: 3,
        target_reps: '12-15',
        dropset: { last_n: 2, drops: 2, drop_pct: 20 },
      },
    ],
  };

  // 1. "Share" — server validate + jsonb store/echo.
  const stored = serverStoreAndEcho(original);
  // 2. "Import" — client allowlist step (the exact logic importSharedRoutine runs).
  const imported = clientImport(stored);

  assert(imported.exercises.length === original.exercises.length, 'exercise count preserved:');

  // 3. Byte-equal on the allowlisted fields — canonicalizeExercise per pair.
  for (let i = 0; i < original.exercises.length; i++) {
    const origCanon = RF.canonicalizeExercise(original.exercises[i]);
    const impCanon  = RF.canonicalizeExercise(imported.exercises[i]);
    deepEq(impCanon, origCanon, `exercise[${i}] canonical form matches:`);
  }

  // 4. canonicalRoutineKey-shaped tuple (name + normalized exercises) is stable.
  const keyOf = (r) => JSON.stringify([r.name, r.exercises.map((e) => RF.canonicalizeExercise(e))]);
  assert(keyOf(imported) === keyOf(original), 'canonicalRoutineKey-shaped tuple stable across share → import:');
});

test('round trip: dropset "all" last_n + no drops/drop_pct survives', () => {
  const original = {
    name: 'Legs',
    exercises: [
      { name: 'Leg Extension', target_sets: 3, target_reps: '15', dropset: { last_n: 'all' } },
    ],
  };
  const imported = clientImport(serverStoreAndEcho(original));
  deepEq(
    RF.canonicalizeExercise(imported.exercises[0]),
    RF.canonicalizeExercise(original.exercises[0]),
    "dropset last_n 'all' (no drops/drop_pct) round-trips:",
  );
});

test('round trip: garbage injected into the blob is dropped by the CLIENT allowlist (DATA-01)', () => {
  // Simulate a compromised/buggy server response that slipped extra keys past
  // the server's own Zod strip (defense in depth — the client must not trust
  // the network blindly even though the server already validates).
  const tampered = {
    name: 'Hacked',
    exercises: [
      {
        name: 'Squat',
        target_sets: 5,
        target_reps: '5',
        __proto__: { polluted: true },
        superset_rounds: 999, // out of bounds (>10) — must be dropped
        extra_field: 'should not survive',
      },
    ],
  };
  const imported = clientImport(tampered);
  const ex = imported.exercises[0];
  assert(!('extra_field' in ex), 'unknown field dropped by allowlist:');
  assert(!('superset_rounds' in ex), 'out-of-bounds superset_rounds dropped:');
  assert(!('polluted' in ex), 'no prototype pollution survives allowlisting:');
  // allowlistExercise always emits the base shape (exercise_id/name/target_sets/
  // target_reps) regardless of presence — only the OPTIONAL S2 fields are
  // conditionally added. So the surviving key set is exactly the base four.
  deepEq(
    Object.keys(ex).sort(),
    ['exercise_id', 'name', 'target_reps', 'target_sets'].sort(),
    'only allowlisted (base) keys present:',
  );
});

// ── parseRoutineShareUrl ─────────────────────────────────────────────────────
test('parseRoutineShareUrl: parses the peak-fettle:// deep link', () => {
  assert(
    SL.parseRoutineShareUrl('peak-fettle://routine/AbC123_-xyz789') === 'AbC123_-xyz789',
    'deep link parsed:',
  );
});

test('parseRoutineShareUrl: parses the https web-preview URL', () => {
  assert(
    SL.parseRoutineShareUrl('https://peakfettle.app/share/AbC123_-xyz789') === 'AbC123_-xyz789',
    'web url parsed:',
  );
});

test('parseRoutineShareUrl: ignores query/hash suffix', () => {
  assert(
    SL.parseRoutineShareUrl('peak-fettle://routine/AbC123_-xyz789?utm_source=sms') === 'AbC123_-xyz789',
    'query suffix stripped:',
  );
});

test('parseRoutineShareUrl: rejects unrelated deep links', () => {
  assert(SL.parseRoutineShareUrl('peak-fettle://group-detail/abc') === null, 'non-routine link rejected:');
  assert(SL.parseRoutineShareUrl('not a url at all') === null, 'garbage rejected:');
  assert(SL.parseRoutineShareUrl('') === null, 'empty string rejected:');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
