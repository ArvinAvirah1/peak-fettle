/**
 * bodyweightDaily.test.js — daily weight check-in tests (founder 2026-08-04).
 *
 * Plain node, no jest/expo — mirrors the transpile-and-eval harness used by
 * autoregHistory.test.js. Runs the REAL units.ts and dateHelpers.ts (the exact
 * conversion path production uses) against a fake in-memory `localDb`, so no
 * expo-sqlite native module is required.
 *
 * The rules under test are the ones that silently corrupt percentiles if wrong:
 *   • median() — even counts must average the two middle values
 *   • the DERIVED_MIN_SAMPLES threshold — BELOW it, recomputeWeekMedian must
 *     not write, so a hand-typed weekly median survives
 *   • exact-entry storage — a typed 186.7 lb must store 18670 centi + 'lbs' and
 *     a canonical kg, never a pre-rounded value (CLAUDE.md §2)
 *   • the median is computed from the EXACT entries, not the stored floats
 *
 * Run: node mobile/src/data/__tests__/bodyweightDaily.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/data/__tests__ -> up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

// ---------------------------------------------------------------------------
// Fake localDb — an in-memory stand-in that records writes and serves scripted
// reads. Only the three shapes bodyweightDaily.ts actually issues are handled.
// ---------------------------------------------------------------------------
let executed = []; // { sql, params }
let weekRows = []; // rows returned for the "SELECT ... WHERE week_key = ?" read

const fakeLocalDb = {
  async init() {},
  async getAll(sql, params) {
    executed.push({ sql, params });
    return weekRows;
  },
  async getFirst(sql, params) {
    executed.push({ sql, params });
    return null;
  },
  async execute(sql, params) {
    executed.push({ sql, params });
  },
};

function resetDb() {
  executed = [];
  weekRows = [];
}

/** The INSERTs issued against a given table, in order. */
function insertsInto(table) {
  const re = new RegExp('INSERT INTO\\s+' + table + '\\b', 'i');
  return executed.filter((e) => re.test(e.sql));
}

// ---------------------------------------------------------------------------
// TS loader — resolves relative imports for real EXCEPT the localDb stub.
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
      if (id === '../db/localDb' || id.endsWith('/db/localDb')) {
        return { localDb: fakeLocalDb, genId: () => 'test-id' };
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
const BW = load('mobile/src/data/bodyweightDaily.ts');
const units = load('mobile/src/constants/units.ts');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' - ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  assert(a === b, (msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a));
}
function close(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, (msg || '') + ' expected ~' + b + ' got ' + a);
}

(async () => {
  console.log('Daily weight check-in tests:');

  // ── median ────────────────────────────────────────────────────────────────
  await test('median: odd count returns the middle value', () => {
    eq(BW.median([82, 80, 81]), 81);
  });
  await test('median: even count averages the two middle values', () => {
    eq(BW.median([80, 81, 82, 85]), 81.5);
  });
  await test('median: unsorted input is sorted first', () => {
    eq(BW.median([85, 80, 82, 81]), 81.5);
  });
  await test('median: empty list returns null (not NaN)', () => {
    eq(BW.median([]), null);
  });
  await test('median: non-finite values are discarded', () => {
    eq(BW.median([80, NaN, 82, Infinity]), 81);
  });

  // ── threshold ─────────────────────────────────────────────────────────────
  await test('DERIVED_MIN_SAMPLES is 3 (founder rule)', () => {
    eq(BW.DERIVED_MIN_SAMPLES, 3);
  });

  await test('recomputeWeekMedian: below the threshold writes NOTHING', async () => {
    resetDb();
    weekRows = [
      { weight_kg: 80, weight_centi: 8000, weight_unit: 'kg' },
      { weight_kg: 82, weight_centi: 8200, weight_unit: 'kg' },
    ];
    const result = await BW.recomputeWeekMedian('2026-W32');
    eq(result, null, 'should not derive from 2 readings:');
    eq(insertsInto('bodyweight').length, 0, 'must not touch the weekly table:');
  });

  await test('recomputeWeekMedian: at the threshold writes the derived median', async () => {
    resetDb();
    weekRows = [
      { weight_kg: 80, weight_centi: 8000, weight_unit: 'kg' },
      { weight_kg: 82, weight_centi: 8200, weight_unit: 'kg' },
      { weight_kg: 81, weight_centi: 8100, weight_unit: 'kg' },
    ];
    const result = await BW.recomputeWeekMedian('2026-W32');
    eq(result, 81, 'derived median:');
    const writes = insertsInto('bodyweight');
    eq(writes.length, 1, 'exactly one weekly write:');
    assert(/'derived'/.test(writes[0].sql), "weekly row must be marked source='derived'");
    eq(writes[0].params[1], '2026-W32', 'week_key param:');
    eq(writes[0].params[2], 81, 'weight_kg param:');
    eq(writes[0].params[4], 3, 'sample_count param:');
  });

  await test('recomputeWeekMedian: legacy rows without an exact entry fall back to weight_kg', async () => {
    resetDb();
    weekRows = [
      { weight_kg: 80, weight_centi: null, weight_unit: null },
      { weight_kg: 84, weight_centi: null, weight_unit: null },
      { weight_kg: 82, weight_centi: null, weight_unit: null },
    ];
    eq(await BW.recomputeWeekMedian('2026-W32'), 82);
  });

  await test('recomputeWeekMedian: lbs entries are converted once, from the exact centi', async () => {
    resetDb();
    // Three pound entries; the median in POUNDS is 186.7, so the derived kg
    // must equal lbsToKg(186.7) exactly — not a re-conversion of a rounded kg.
    weekRows = [
      { weight_kg: 0, weight_centi: 18500, weight_unit: 'lbs' },
      { weight_kg: 0, weight_centi: 18670, weight_unit: 'lbs' },
      { weight_kg: 0, weight_centi: 18800, weight_unit: 'lbs' },
    ];
    const result = await BW.recomputeWeekMedian('2026-W32');
    close(result, units.lbsToKg(186.7), 1e-9, 'derived kg from lbs entries:');
  });

  // ── exact-entry storage (CLAUDE.md §2) ────────────────────────────────────
  await test('logDailyWeight: stores exact centi + unit + canonical kg (lbs)', async () => {
    resetDb();
    await BW.logDailyWeight(186.7, 'lbs', new Date('2026-08-04T10:00:00Z'));
    const writes = insertsInto('bodyweight_daily');
    eq(writes.length, 1, 'one daily write:');
    const p = writes[0].params;
    // [id, day, week_key, weight_kg, weight_centi, weight_unit, source, logged_at]
    eq(p[1], '2026-08-04', 'day key:');
    eq(p[4], 18670, 'weight_centi must be the EXACT typed value x100:');
    eq(p[5], 'lbs', 'weight_unit:');
    close(p[3], units.lbsToKg(186.7), 1e-9, 'canonical kg:');
    eq(p[6], 'manual', 'source:');
  });

  await test('logDailyWeight: kg entry stores centi in kg and kg unchanged', async () => {
    resetDb();
    await BW.logDailyWeight(82.5, 'kg', new Date('2026-08-04T10:00:00Z'));
    const p = insertsInto('bodyweight_daily')[0].params;
    eq(p[4], 8250, 'weight_centi:');
    eq(p[5], 'kg', 'weight_unit:');
    eq(p[3], 82.5, 'weight_kg is the typed value verbatim:');
  });

  await test('logDailyWeight: upserts on `day` (one row per calendar day)', async () => {
    resetDb();
    await BW.logDailyWeight(82.5, 'kg', new Date('2026-08-04T10:00:00Z'));
    const sql = insertsInto('bodyweight_daily')[0].sql;
    assert(/ON CONFLICT\(day\) DO UPDATE/i.test(sql), 'must upsert on day, not insert a duplicate');
  });

  await test('logDailyWeight: a non-positive value writes nothing', async () => {
    resetDb();
    await BW.logDailyWeight(0, 'kg');
    await BW.logDailyWeight(-5, 'kg');
    eq(insertsInto('bodyweight_daily').length, 0, 'must reject non-positive weights:');
  });

  await test('logDailyWeight: cascades into the weekly recompute', async () => {
    resetDb();
    // The week read that recomputeWeekMedian issues returns 3 rows, so the
    // cascade should produce a weekly write off the back of the daily one.
    weekRows = [
      { weight_kg: 80, weight_centi: 8000, weight_unit: 'kg' },
      { weight_kg: 81, weight_centi: 8100, weight_unit: 'kg' },
      { weight_kg: 82, weight_centi: 8200, weight_unit: 'kg' },
    ];
    await BW.logDailyWeight(81, 'kg', new Date('2026-08-04T10:00:00Z'));
    eq(insertsInto('bodyweight_daily').length, 1, 'daily write:');
    eq(insertsInto('bodyweight').length, 1, 'weekly derive write:');
  });

  // ---------------------------------------------------------------------------
  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
