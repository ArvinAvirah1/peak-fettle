/**
 * importEngine.test.js — Strong/Hevy → local-first write path tests.
 *
 * Mirrors the stubbing pattern in mobile/src/db/__tests__/migrations.test.js:
 * require('typescript').transpileModule → eval, with an explicit `deps` map so
 * importEngine.ts's real dependencies (localDb/genId, exerciseNames, units) can
 * be swapped for in-memory fakes / the REAL pure modules as appropriate:
 *   - '../../db/localDb'        → an in-memory fake SQLite-ish store (below),
 *                                 covering exactly the query shapes
 *                                 importEngine.ts issues (this file authored
 *                                 both, so the shapes are known).
 *   - '../../data/exerciseNames' → a no-op remember() (real module needs RN's
 *                                 AsyncStorage + localDb; a no-op is enough
 *                                 since these tests assert on `sets`/`workouts`
 *                                 rows, not the name cache).
 *   - '../../constants/units'    → the REAL module (pure, no RN import) so the
 *                                 185 lb → 83.91 kg conversion is genuinely
 *                                 exercised, not mocked.
 *   - './nameMapping'            → the REAL module (pure).
 *
 * Run:  node mobile/src/lib/importers/__tests__/importEngine.test.js
 *
 * Coverage (TICKET-135 acceptance criteria):
 *   3. Units: a 185 lb Strong row stores weight_kg = 83.91 (displayToKg),
 *      never 185; a Hevy kg row stores its value unchanged.
 *   4. Dedupe by (exercise_id, set_index, logged_at) — re-running the SAME
 *      parsed file a second time imports 0 additional sets (idempotent).
 *   5. Import summary counts (workouts/sets imported, skipped, unmatched).
 *
 * All test bodies are async and AWAITED sequentially by the runner at the
 * bottom (no timeout-based hacks) so a rejection inside an `await` is caught
 * by the same try/catch as a synchronous throw.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, deps) {
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireStub = function (id) {
    const key = id.replace(/^\.\//, '').replace(/^(\.\.\/)+/, '');
    if (deps[id]) return deps[id];
    if (deps[key]) return deps[key];
    try { return require(id); } catch (_) { return {}; }
  };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
    mod, mod.exports, requireStub,
    path.dirname(path.join(REPO, relPath)),
    path.join(REPO, relPath)
  );
  return mod.exports;
}

// ---------------------------------------------------------------------------
// In-memory fake localDb — covers exactly the query shapes importEngine.ts
// issues (INSERT..SELECT..WHERE NOT EXISTS on workouts, SELECT on
// workouts/sets, INSERT on sets). Not a real SQL engine.
// ---------------------------------------------------------------------------
function makeFakeLocalDb() {
  const workouts = []; // { id, user_id, day_key, notes, session_type, routine_name, created_at, updated_at, synced }
  const sets = [];     // { id, server_id, workout_id, user_id, exercise_id, kind, set_index, reps, weight_raw, weight_kg, rir, duration_sec, distance_m, avg_pace_sec_per_km, logged_at, synced }

  let idCounter = 0;
  function genId() {
    idCounter += 1;
    return `fake-id-${idCounter}`;
  }

  const db = {
    async init() {},
    async execute(sql, params) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      if (norm.startsWith('INSERT INTO workouts')) {
        const [id, userId, dayKey, routineName, createdAt, updatedAt, existsDayKey] = params;
        const exists = workouts.some((w) => w.day_key === existsDayKey);
        if (!exists) {
          workouts.push({
            id, user_id: userId, day_key: dayKey, notes: null, session_type: null,
            routine_name: routineName, created_at: createdAt, updated_at: updatedAt, synced: 0,
          });
        }
        return;
      }
      if (norm.startsWith('INSERT INTO sets')) {
        // v18: two fixed-point exact-entry params (weight_centi, weight_unit)
        // sit between weight_kg and rir — mirror insertSetRow's param order.
        const [id, workoutId, userId, exerciseId, setIndex, reps, weightRaw, weightKg, weightCenti, weightUnit, rir, loggedAt] = params;
        sets.push({
          id, server_id: null, workout_id: workoutId, user_id: userId, exercise_id: exerciseId,
          kind: 'lift', set_index: setIndex, reps, weight_raw: weightRaw, weight_kg: weightKg,
          weight_centi: weightCenti, weight_unit: weightUnit,
          rir, duration_sec: null, distance_m: null, avg_pace_sec_per_km: null,
          logged_at: loggedAt, synced: 0,
        });
        return;
      }
      throw new Error('fake localDb: unhandled execute() SQL: ' + norm);
    },
    async getFirst(sql, params) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      if (norm.startsWith('SELECT id FROM workouts WHERE day_key')) {
        const [dayKey] = params;
        const rows = workouts.filter((w) => w.day_key === dayKey).sort((a, b) => a.created_at < b.created_at ? -1 : 1);
        return rows[0] ? { id: rows[0].id } : null;
      }
      throw new Error('fake localDb: unhandled getFirst() SQL: ' + norm);
    },
    async getAll(sql) {
      const norm = sql.replace(/\s+/g, ' ').trim();
      if (norm.startsWith("SELECT exercise_id, set_index, logged_at FROM sets WHERE kind = 'lift'")) {
        return sets.map((s) => ({ exercise_id: s.exercise_id, set_index: s.set_index, logged_at: s.logged_at }));
      }
      throw new Error('fake localDb: unhandled getAll() SQL: ' + norm);
    },
    _dump() { return { workouts, sets }; },
  };

  return { localDb: db, genId };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + (err && err.message ? err.message : String(err)));
    failed++;
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function close(a, b, eps, msg) {
  if (Math.abs(a - b) > eps) throw new Error((msg || `expected ${a} ~= ${b}`));
}

const units = load('mobile/src/constants/units.ts');
const nameMapping = load('mobile/src/lib/importers/nameMapping.ts');

function freshEngine() {
  const dbModule = makeFakeLocalDb(); // { localDb, genId }
  const exerciseNamesStub = { rememberExerciseName: async () => {} };
  const engine = load('mobile/src/lib/importers/importEngine.ts', {
    '../../db/localDb': dbModule,
    '../../data/exerciseNames': exerciseNamesStub,
    '../../constants/units': units,
    './nameMapping': nameMapping,
  });
  // Expose the underlying fake db (with _dump()) directly for assertions.
  return { engine, fakeDb: dbModule.localDb };
}

const CANDIDATES = [
  { id: 'bench-id', name: 'Bench Press' },
  { id: 'squat-id', name: 'Back Squat' },
];

async function main() {
  console.log('\nimporters — importEngine.test.js\n');

  // ── Unit conversion (spec point 3) ────────────────────────────────────────

  await test('resolveWeightKg: Strong 185 lb → 83.91 kg (never stored as 185)', () => {
    const { engine } = freshEngine();
    const kg = engine.resolveWeightKg('strong', 185, 'lbs');
    close(kg, 83.91, 0.01, '185 lb in kg:');
    assert(kg !== 185, 'must not store the raw lbs number as kg');
  });

  await test('resolveWeightKg: Strong in kg unit_pref passes through unchanged', () => {
    const { engine } = freshEngine();
    eq(engine.resolveWeightKg('strong', 100, 'kg'), 100);
  });

  await test('resolveWeightKg: Hevy weight_kg passes through unchanged regardless of unitPref', () => {
    const { engine } = freshEngine();
    eq(engine.resolveWeightKg('hevy', 80, 'lbs'), 80, 'hevy is always kg, ignore unitPref');
  });

  // ── Full import — Strong, lbs user ────────────────────────────────────────

  await test('importParsedFile: Strong file (lbs unit_pref) imports sets with correct kg + summary counts', async () => {
    const { engine } = freshEngine();
    const parsed = {
      source: 'strong',
      rows: [
        { timestampRaw: '2026-06-01 08:00:00', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 1, weightRaw: 185, reps: 5, rpe: 8, isWarmup: false, isFailure: false, isDrop: false },
        { timestampRaw: '2026-06-01 08:00:00', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 2, weightRaw: 185, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
        { timestampRaw: '2026-06-01 08:00:00', workoutName: 'Push Day', exerciseNameRaw: 'Some Weird Machine', setOrderRaw: 1, weightRaw: 50, reps: 12, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    };

    const summary = await engine.importParsedFile(parsed, {
      userId: 'u1',
      unitPref: 'lbs',
      nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES,
      onUnmatched: async () => null, // skip unmatched
    });

    eq(summary.setsImported, 2, 'setsImported:');
    eq(summary.setsUnmatched, 1, 'setsUnmatched:');
    eq(summary.workoutsImported, 1, 'workoutsImported:');
    eq(summary.unmatchedNames.length, 1);
    eq(summary.unmatchedNames[0], 'Some Weird Machine');
  });

  await test('importParsedFile: stored weight_kg is the converted value, not the raw lbs', async () => {
    const { engine, fakeDb } = freshEngine();
    const parsed = {
      source: 'strong',
      rows: [
        { timestampRaw: '2026-06-01 08:00:00', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 1, weightRaw: 185, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    };
    await engine.importParsedFile(parsed, {
      userId: 'u1', unitPref: 'lbs', nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES, onUnmatched: async () => null,
    });
    const { sets } = fakeDb._dump();
    eq(sets.length, 1);
    close(sets[0].weight_kg, 83.91, 0.01, 'stored weight_kg:');
    assert(sets[0].weight_kg !== 185, 'must never equal the raw lbs value');
  });

  // ── RPE → RIR wired through the full pipeline ─────────────────────────────

  await test('importParsedFile: RPE 8 on a stored set becomes RIR 2', async () => {
    const { engine, fakeDb } = freshEngine();
    const parsed = {
      source: 'hevy',
      rows: [
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 0, weightRaw: 80, reps: 5, rpe: 8, isWarmup: false, isFailure: false, isDrop: false },
      ],
    };
    await engine.importParsedFile(parsed, {
      userId: 'u1', unitPref: 'kg', nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES, onUnmatched: async () => null,
    });
    const { sets } = fakeDb._dump();
    eq(sets[0].rir, 2);
  });

  // ── Dedupe / idempotent re-import (spec point 4) ──────────────────────────

  await test('importParsedFile: re-importing the SAME file a second time imports zero new sets', async () => {
    const { engine, fakeDb } = freshEngine();
    const parsed = {
      source: 'hevy',
      rows: [
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 0, weightRaw: 80, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 1, weightRaw: 80, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    };
    const opts = {
      userId: 'u1', unitPref: 'kg', nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES, onUnmatched: async () => null,
    };

    const first = await engine.importParsedFile(parsed, opts);
    eq(first.setsImported, 2, 'first import:');

    const second = await engine.importParsedFile(parsed, opts);
    eq(second.setsImported, 0, 'second (re-)import must import nothing new:');
    eq(second.setsSkipped, 2, 'second import should report both as skipped (dedupe):');

    const { sets } = fakeDb._dump();
    eq(sets.length, 2, 'total stored sets must still be exactly 2, not 4:');
  });

  await test('importParsedFile: different set_index on a re-import (new set appended) is NOT deduped away', async () => {
    const { engine, fakeDb } = freshEngine();
    const opts = {
      userId: 'u1', unitPref: 'kg', nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES, onUnmatched: async () => null,
    };

    await engine.importParsedFile({
      source: 'hevy',
      rows: [
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 0, weightRaw: 80, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    }, opts);

    // Same file plus one extra set for the same exercise/workout — the extra
    // (new set_index) row should import; the original should still dedupe.
    const second = await engine.importParsedFile({
      source: 'hevy',
      rows: [
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 0, weightRaw: 80, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 1, weightRaw: 82.5, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    }, opts);

    eq(second.setsImported, 1, 'only the new set should import:');
    eq(second.setsSkipped, 1, 'the original set should dedupe:');
    const { sets } = fakeDb._dump();
    eq(sets.length, 2);
  });

  // ── Skips malformed rows (missing weight/reps) ────────────────────────────

  await test('importParsedFile: a row missing weight or reps is skipped, not stored', async () => {
    const { engine, fakeDb } = freshEngine();
    const parsed = {
      source: 'hevy',
      rows: [
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Bench Press', setOrderRaw: 0, weightRaw: null, reps: 5, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    };
    const summary = await engine.importParsedFile(parsed, {
      userId: 'u1', unitPref: 'kg', nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES, onUnmatched: async () => null,
    });
    eq(summary.setsImported, 0);
    eq(summary.setsSkipped, 1);
    eq(fakeDb._dump().sets.length, 0);
  });

  // ── Manual-match resolution + per-file caching ────────────────────────────

  await test('importParsedFile: onUnmatched is called ONCE per distinct raw name, reused for later rows', async () => {
    const { engine, fakeDb } = freshEngine();
    let calls = 0;
    const parsed = {
      source: 'hevy',
      rows: [
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Custom Machine X', setOrderRaw: 0, weightRaw: 40, reps: 10, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
        { timestampRaw: '2026-06-02T08:00:00Z', workoutName: 'Push Day', exerciseNameRaw: 'Custom Machine X', setOrderRaw: 1, weightRaw: 42.5, reps: 8, rpe: null, isWarmup: false, isFailure: false, isDrop: false },
      ],
    };
    const summary = await engine.importParsedFile(parsed, {
      userId: 'u1', unitPref: 'kg', nowIso: '2026-07-03T00:00:00.000Z',
      candidates: CANDIDATES,
      onUnmatched: async (rawName) => {
        calls++;
        return { exerciseId: 'custom-1', exerciseName: rawName };
      },
    });
    eq(calls, 1, 'onUnmatched should be called exactly once for the same raw name:');
    eq(summary.setsImported, 2);
    const { sets } = fakeDb._dump();
    assert(sets.every((s) => s.exercise_id === 'custom-1'), 'both rows resolve to the created custom exercise');
  });

  // ── dayKeyFromIso / parseSourceTimestamp helpers ──────────────────────────

  await test('dayKeyFromIso: derives YYYY-MM-DD', () => {
    const { engine } = freshEngine();
    const key = engine.dayKeyFromIso('2026-06-01T08:00:00.000Z');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(key), 'day key format: ' + key);
  });

  await test('parseSourceTimestamp: falls back to fallbackIso on unparseable input', () => {
    const { engine } = freshEngine();
    const fallback = '2026-07-03T00:00:00.000Z';
    eq(engine.parseSourceTimestamp('not a date', fallback), fallback);
    eq(engine.parseSourceTimestamp('', fallback), fallback);
  });

  await test('parseSourceTimestamp: parses a well-formed timestamp to ISO', () => {
    const { engine } = freshEngine();
    const iso = engine.parseSourceTimestamp('2026-06-01 08:00:00', '2026-07-03T00:00:00.000Z');
    assert(iso.startsWith('2026-06-01'), 'parsed date: ' + iso);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
