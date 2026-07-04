/**
 * autoregHistory.test.js - TICKET-141 data-assembly layer tests (plain node,
 * no jest/expo). Mirrors the transpile-and-eval harness used by
 * shareLinks.test.js / routineFields.test.js.
 *
 * Covers the pure helpers (parseRepsBand, buildAutoregTargets,
 * resolveAutoregEquipment) directly, plus the DB-reading functions
 * (getAutoregHistory, getAutoregContext) against a fake in-memory `localDb`
 * so no expo-sqlite/native module is required.
 *
 * Does NOT touch lib/trainingEngine/v2/autoregulation.ts's own test file
 * (autoregulation.test.js, FROZEN, owned by the rule-module author) - this
 * suite is scoped to autoregHistory.ts only.
 *
 * Run: node mobile/src/data/__tests__/autoregHistory.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/data/__tests__ -> up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

// ---------------------------------------------------------------------------
// Fake localDb - records the last query and returns a scripted row set.
// ---------------------------------------------------------------------------
let fakeRows = [];
let lastSql = null;
let lastParams = null;
let throwOnGetAll = false;

const fakeLocalDb = {
  async init() {},
  async getAll(sql, params) {
    lastSql = sql;
    lastParams = params;
    if (throwOnGetAll) throw new Error('simulated SQLite failure');
    return fakeRows;
  },
  async getFirst() { return null; },
  async execute() {},
};

// ---------------------------------------------------------------------------
// TS loader - transpiles a .ts file and evals it in a module context,
// resolving relative imports for real EXCEPT the localDb stub.
// ---------------------------------------------------------------------------
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
      // Intercept the localDb import for BOTH autoregHistory.ts's own import
      // and any transitive import (defensive - none expected today).
      if (id === '../db/localDb' || id.endsWith('/db/localDb')) {
        return { localDb: fakeLocalDb };
      }
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

const load = makeLoader();
const AH = load('mobile/src/data/autoregHistory.ts');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' - ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { assert(a === b, (msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }

(async () => {
  console.log('TICKET-141 autoregHistory tests:');

  await test('parseRepsBand: "8-12" -> 8..12', () => {
    const b = AH.parseRepsBand('8-12');
    eq(b.low, 8); eq(b.high, 12);
  });
  await test('parseRepsBand: single "5" -> 5..5 (fixed target)', () => {
    const b = AH.parseRepsBand('5');
    eq(b.low, 5); eq(b.high, 5);
  });
  await test('parseRepsBand: en-dash range -> 8..12', () => {
    const b = AH.parseRepsBand('8–12');
    eq(b.low, 8); eq(b.high, 12);
  });
  await test('parseRepsBand: null/undefined -> default 8..12', () => {
    const a = AH.parseRepsBand(null);
    const b = AH.parseRepsBand(undefined);
    eq(a.low, 8); eq(a.high, 12);
    eq(b.low, 8); eq(b.high, 12);
  });
  await test('parseRepsBand: garbage string -> default 8..12', () => {
    const b = AH.parseRepsBand('AMRAP');
    eq(b.low, 8); eq(b.high, 12);
  });
  await test('parseRepsBand: reversed range "12-8" is invalid as a range -> single-number fallback picks the first number (12..12)', () => {
    const b = AH.parseRepsBand('12-8');
    eq(b.low, 12); eq(b.high, 12);
  });

  await test('buildAutoregTargets: no prescriptionRir -> default RIR band 1..3', () => {
    const t = AH.buildAutoregTargets('8-12');
    eq(t.targetRepsLow, 8); eq(t.targetRepsHigh, 12);
    eq(t.targetRirLow, 1); eq(t.targetRirHigh, 3);
  });
  await test('buildAutoregTargets: prescriptionRir present -> fixed band at that value', () => {
    const t = AH.buildAutoregTargets('5', 2);
    eq(t.targetRepsLow, 5); eq(t.targetRepsHigh, 5);
    eq(t.targetRirLow, 2); eq(t.targetRirHigh, 2);
  });
  await test('buildAutoregTargets: prescriptionRir null -> falls back to default band', () => {
    const t = AH.buildAutoregTargets('8-12', null);
    eq(t.targetRirLow, 1); eq(t.targetRirHigh, 3);
  });

  await test('resolveAutoregEquipment: catalog match "Back Squat" -> barbell', () => {
    eq(AH.resolveAutoregEquipment(null, 'Back Squat'), 'barbell');
  });
  await test('resolveAutoregEquipment: catalog match "Leg Press" -> machine', () => {
    eq(AH.resolveAutoregEquipment(null, 'Leg Press'), 'machine');
  });
  await test('resolveAutoregEquipment: catalog match "Dumbbell Row" -> dumbbell', () => {
    eq(AH.resolveAutoregEquipment(null, 'Dumbbell Row'), 'dumbbell');
  });
  await test('resolveAutoregEquipment: catalog match "Seated Cable Row" -> cable', () => {
    eq(AH.resolveAutoregEquipment(null, 'Seated Cable Row'), 'cable');
  });
  await test('resolveAutoregEquipment: catalog bodyweight match "Push-Up" -> bodyweight', () => {
    eq(AH.resolveAutoregEquipment(null, 'Push-Up'), 'bodyweight');
  });
  await test('resolveAutoregEquipment: off-catalog name heuristic "Weighted Pull-ups" -> bodyweight', () => {
    eq(AH.resolveAutoregEquipment(null, 'Weighted Pull-ups'), 'bodyweight');
  });
  await test('resolveAutoregEquipment: off-catalog unknown name -> other', () => {
    eq(AH.resolveAutoregEquipment(null, 'Some Custom Machine Nobody Has Heard Of'), 'other');
  });

  await test('getAutoregHistory: empty exerciseId -> [] without querying', async () => {
    lastSql = null;
    const out = await AH.getAutoregHistory('');
    eq(out.length, 0);
    eq(lastSql, null, 'should not have queried for an empty id: ');
  });

  await test('getAutoregHistory: maps rows, marks drop.index>=1 as isDrop, index 0 is NOT a drop', async () => {
    fakeRows = [
      { weight_kg: 80, weight_raw: null, reps: 8, rir: 2, logged_at: '2026-07-01T10:00:00.000Z', metrics_json: null },
      { weight_kg: 80, weight_raw: null, reps: 8, rir: 1, logged_at: '2026-07-01T10:05:00.000Z', metrics_json: JSON.stringify({ drop: { chainId: 'c1', index: 0 } }) },
      { weight_kg: 60, weight_raw: null, reps: 6, rir: 0, logged_at: '2026-07-01T10:06:00.000Z', metrics_json: JSON.stringify({ drop: { chainId: 'c1', index: 1 } }) },
    ];
    const out = await AH.getAutoregHistory('ex-1');
    eq(out.length, 3);
    eq(out[0].isDrop, false, 'plain row: ');
    eq(out[1].isDrop, false, 'chain top set (index 0) is not a drop: ');
    eq(out[2].isDrop, true, 'chain drop row (index 1) is a drop: ');
    eq(out[2].weightKg, 60);
    eq(out[2].reps, 6);
    eq(out[2].rir, 0);
    assert(Array.isArray(lastParams) && lastParams[0] === 'ex-1', 'query params carry the exercise id: ');
  });

  await test('getAutoregHistory: falls back weight_kg via COALESCE contract even if null (defensive)', async () => {
    fakeRows = [
      { weight_kg: null, weight_raw: null, reps: 5, rir: null, logged_at: '2026-07-01T10:00:00.000Z', metrics_json: null },
    ];
    const out = await AH.getAutoregHistory('ex-1');
    eq(out.length, 1);
    eq(out[0].weightKg, 0, 'null weight_kg from a malformed row degrades to 0, never throws: ');
  });

  await test('getAutoregHistory: malformed metrics_json never throws, treated as not-a-drop', async () => {
    fakeRows = [
      { weight_kg: 80, weight_raw: null, reps: 8, rir: 2, logged_at: '2026-07-01T10:00:00.000Z', metrics_json: '{not json' },
    ];
    const out = await AH.getAutoregHistory('ex-1');
    eq(out[0].isDrop, false);
  });

  await test('getAutoregHistory: SQLite failure -> [] (never throws)', async () => {
    throwOnGetAll = true;
    let threw = false;
    let out = null;
    try { out = await AH.getAutoregHistory('ex-1'); } catch (_) { threw = true; }
    throwOnGetAll = false;
    assert(!threw, 'getAutoregHistory must never throw');
    eq(out.length, 0);
  });

  await test('getAutoregContext: assembles history + targets + equipment together', async () => {
    fakeRows = [
      { weight_kg: 100, weight_raw: null, reps: 10, rir: 3, logged_at: '2026-07-01T10:00:00.000Z', metrics_json: null },
    ];
    const ctx = await AH.getAutoregContext('ex-1', 'Back Squat', '8-10');
    eq(ctx.history.length, 1);
    eq(ctx.targets.targetRepsLow, 8);
    eq(ctx.targets.targetRepsHigh, 10);
    eq(ctx.targets.targetRirLow, 1);
    eq(ctx.equipment, 'barbell');
  });

  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
