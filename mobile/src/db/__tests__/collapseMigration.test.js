/**
 * collapseMigration.test.js — the v22 variant collapse (plain node, real SQL-ish stub).
 *
 * Run: node mobile/src/db/__tests__/collapseMigration.test.js
 *
 * The collapse is the first migration in this app's history that REWRITES rows.
 * Everything it can get wrong is silent: a merged PR that quietly downgrades, a
 * set that loses the qualifiers describing it, an id rewritten to something the
 * server has never heard of. So the cases below are the failure modes, not the
 * happy path.
 *
 * Covered:
 *   1. CASE A - both ids cached: sets move onto the base id.
 *   2. CASE B - only the variant cached: nothing moves; the NAME is rewritten.
 *      (This is what makes the migration runnable at all - see the module header.)
 *   3. Reconstructing qualifiers are stamped onto the moved sets.
 *   4. A user's OWN recorded qualifier beats the collapse's.
 *   5. exercise_prs MAX-merge: the heavier lift survives the PK collision.
 *   6. No exercise_id is ever invented (the FK/outbox blocker, designed out).
 *   7. Idempotent: running twice changes nothing the second time.
 *   8. A variant this device never used is skipped.
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
const exMap = load('mobile/src/constants/exerciseQualifierMap.ts', { qualifiers, './qualifiers': qualifiers });

// A small fixed collapse plan, so we test the ENGINE not the researched data.
const FAKE_MAP = {
  COLLAPSE_CREATE_BASES: [],
  COLLAPSE_ENTRIES: [
    { from: 'Close-Grip Lat Pulldown', to: 'Lat Pulldown', q: { grip_width: 'close' } },
    { from: 'Chin-Up', to: 'Pull-Up', q: { grip_orientation: 'supinated' } },
    { from: 'Never Used Variant', to: 'Lat Pulldown', q: { grip_width: 'wide' } },
  ],
  COLLAPSE_ALIASES: {},
};

const collapse = load('mobile/src/db/collapseMigration.ts', {
  'constants/collapseMap': FAKE_MAP, '../constants/collapseMap': FAKE_MAP,
  'lib/qualifierKey': qk, '../lib/qualifierKey': qk,
  'constants/exerciseQualifierMap': exMap, '../constants/exerciseQualifierMap': exMap,
  'localSchema': {}, './localSchema': {},
});
const { runCollapse } = collapse;

// ---------------------------------------------------------------------------
// Tiny in-memory table store with just enough SQL to drive the migration.
// ---------------------------------------------------------------------------
function makeDb(seed) {
  const t = JSON.parse(JSON.stringify(seed));
  const db = {
    _t: t,
    async getAll(sql, params) {
      params = params || [];
      if (/FROM exercise_names/i.test(sql)) return t.exercise_names.map((r) => ({ ...r }));
      if (/SELECT id, qualifiers_json FROM sets WHERE exercise_id/i.test(sql)) {
        return t.sets.filter((s) => s.exercise_id === params[0])
          .map((s) => ({ id: s.id, qualifiers_json: s.qualifiers_json ?? null }));
      }
      return [];
    },
    async getFirst(sql, params) {
      params = params || [];
      if (/COUNT\(\*\) AS n FROM exercise_prs WHERE exercise_id IN/i.test(sql)) {
        return { n: t.exercise_prs.filter((p) => p.exercise_id === params[0] || p.exercise_id === params[1]).length };
      }
      if (/COUNT\(\*\) AS n FROM exercise_prs WHERE exercise_id = \?/i.test(sql)) {
        return { n: t.exercise_prs.filter((p) => p.exercise_id === params[0]).length };
      }
      return null;
    },
    async execute(sql, params) {
      params = params || [];
      if (/UPDATE sets SET qualifiers_json/i.test(sql)) {
        const s = t.sets.find((x) => x.id === params[2]);
        if (s) { s.qualifiers_json = params[0]; s.qualifier_key = params[1]; }
        return;
      }
      if (/UPDATE sets SET exercise_id/i.test(sql)) {
        t.sets.forEach((s) => { if (s.exercise_id === params[1]) s.exercise_id = params[0]; });
        return;
      }
      if (/UPDATE exercise_names SET name/i.test(sql)) {
        const r = t.exercise_names.find((x) => x.exercise_id === params[2]);
        if (r) { r.name = params[0]; r.updated_at = params[1]; }
        return;
      }
      if (/DELETE FROM exercise_names/i.test(sql)) {
        t.exercise_names = t.exercise_names.filter((x) => x.exercise_id !== params[0]);
        return;
      }
      // exercise_prs MAX-merge
      if (/DELETE FROM exercise_prs[\s\S]*b\.weight_kg >= exercise_prs\.weight_kg/i.test(sql)) {
        const [variant, base] = params;
        t.exercise_prs = t.exercise_prs.filter((p) => !(p.exercise_id === variant &&
          t.exercise_prs.some((b) => b.exercise_id === base && b.user_id === p.user_id &&
            b.rep_count === p.rep_count && b.weight_kg >= p.weight_kg)));
        return;
      }
      if (/DELETE FROM exercise_prs[\s\S]*v\.weight_kg > exercise_prs\.weight_kg/i.test(sql)) {
        const [base, variant] = params;
        t.exercise_prs = t.exercise_prs.filter((p) => !(p.exercise_id === base &&
          t.exercise_prs.some((v) => v.exercise_id === variant && v.user_id === p.user_id &&
            v.rep_count === p.rep_count && v.weight_kg > p.weight_kg)));
        return;
      }
      if (/UPDATE exercise_prs SET exercise_id/i.test(sql)) {
        t.exercise_prs.forEach((p) => { if (p.exercise_id === params[1]) p.exercise_id = params[0]; });
        return;
      }
      const del = sql.match(/DELETE FROM (exercise_goals|exercise_prefs)/i);
      if (del) {
        const tbl = del[1];
        const [variant, base] = params;
        if (t[tbl].some((r) => r.exercise_id === base)) {
          t[tbl] = t[tbl].filter((r) => r.exercise_id !== variant);
        }
        return;
      }
      const upd = sql.match(/UPDATE (exercise_goals|exercise_prefs) SET exercise_id/i);
      if (upd) {
        t[upd[1]].forEach((r) => { if (r.exercise_id === params[1]) r.exercise_id = params[0]; });
        return;
      }
      if (/UPDATE exercise_substitutes SET (source|sub)_exercise_id/i.test(sql)) {
        const col = /source_exercise_id/.test(sql) ? 'source_exercise_id' : 'sub_exercise_id';
        t.exercise_substitutes.forEach((r) => { if (r[col] === params[1]) r[col] = params[0]; });
        return;
      }
    },
  };
  return db;
}

const SEED = {
  exercise_names: [
    { exercise_id: 'uuid-cglp', name: 'Close-Grip Lat Pulldown', updated_at: null },
    { exercise_id: 'uuid-lp', name: 'Lat Pulldown', updated_at: null },
    { exercise_id: 'uuid-chin', name: 'Chin-Up', updated_at: null }, // no Pull-Up cached
  ],
  sets: [
    { id: 's1', exercise_id: 'uuid-cglp', qualifiers_json: null, qualifier_key: null },
    { id: 's2', exercise_id: 'uuid-cglp', qualifiers_json: '{"attachment":"rope"}', qualifier_key: null },
    { id: 's3', exercise_id: 'uuid-lp', qualifiers_json: null, qualifier_key: null },
    { id: 's4', exercise_id: 'uuid-chin', qualifiers_json: null, qualifier_key: null },
  ],
  exercise_prs: [
    { user_id: 'u1', exercise_id: 'uuid-cglp', rep_count: 5, weight_kg: 80 },
    { user_id: 'u1', exercise_id: 'uuid-lp', rep_count: 5, weight_kg: 70 },  // collision, lighter
    { user_id: 'u1', exercise_id: 'uuid-lp', rep_count: 3, weight_kg: 90 },  // no collision
  ],
  exercise_goals: [{ exercise_id: 'uuid-cglp', target_weight_kg: 100 }],
  exercise_prefs: [{ exercise_id: 'uuid-cglp' }, { exercise_id: 'uuid-lp' }],
  exercise_substitutes: [{ id: 'x1', source_exercise_id: 'uuid-cglp', sub_exercise_id: 'uuid-lp' }],
};

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (e) { console.log('  FAIL  ' + name + ' — ' + e.message); failed++; }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b)); }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

(async () => {
  console.log('\ncollapseMigration.test.js\n');

  await test('CASE A: both ids cached - sets move onto the base id', async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    eq(db._t.sets.filter((s) => s.exercise_id === 'uuid-cglp').length, 0, 'no sets left on the variant:');
    eq(db._t.sets.filter((s) => s.exercise_id === 'uuid-lp').length, 3, 'all three now on the base:');
    eq(db._t.exercise_names.some((n) => n.exercise_id === 'uuid-cglp'), false, 'variant cache row removed:');
  });

  await test('CASE B: only the variant cached - the NAME is rewritten, sets stay put', async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    const chin = db._t.exercise_names.find((n) => n.exercise_id === 'uuid-chin');
    eq(chin.name, 'Pull-Up', 'cache entry renamed to the base:');
    eq(db._t.sets.find((s) => s.id === 's4').exercise_id, 'uuid-chin',
      'the set keeps its own REAL server id - this is what makes the migration FK-safe');
  });

  await test('reconstructing qualifiers are stamped onto the sets', async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    const s1 = db._t.sets.find((s) => s.id === 's1');
    assert(/grip_width/.test(s1.qualifiers_json), 'collapse qualifier written: ' + s1.qualifiers_json);
    assert(/close/.test(s1.qualifiers_json), 'with the right value');
    const s4 = db._t.sets.find((s) => s.id === 's4');
    assert(/supinated/.test(s4.qualifiers_json), 'case B sets are tagged too: ' + s4.qualifiers_json);
  });

  await test("a user's OWN recorded qualifier beats the collapse's", async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    const s2 = db._t.sets.find((s) => s.id === 's2');
    const q = JSON.parse(s2.qualifiers_json);
    eq(q.attachment, 'rope', 'the user-recorded value survives:');
    eq(q.grip_width, 'close', 'and the collapse value is added alongside:');
  });

  await test('exercise_prs MAX-merge: the heavier lift survives the PK collision', async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    const at5 = db._t.exercise_prs.filter((p) => p.exercise_id === 'uuid-lp' && p.rep_count === 5);
    eq(at5.length, 1, 'exactly one row survives the collision:');
    eq(at5[0].weight_kg, 80, 'and it is the HEAVIER lift - a PR must never silently downgrade:');
    const at3 = db._t.exercise_prs.filter((p) => p.exercise_id === 'uuid-lp' && p.rep_count === 3);
    eq(at3.length, 1, 'the non-colliding PR is untouched:');
    eq(at3[0].weight_kg, 90);
  });

  await test('no exercise_id is ever invented (the FK / outbox blocker)', async () => {
    const db = makeDb(SEED);
    const before = new Set(SEED.exercise_names.map((n) => n.exercise_id));
    await runCollapse(db);
    for (const s of db._t.sets) {
      assert(before.has(s.exercise_id),
        'set ' + s.id + ' points at ' + s.exercise_id + ' which was never a real cached id - ' +
        'that is exactly the FK violation that would wedge the Pro outbox');
    }
  });

  await test('single-row tables merge without a PK conflict', async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    eq(db._t.exercise_prefs.filter((r) => r.exercise_id === 'uuid-lp').length, 1,
      'the base pref wins; the variant row is dropped rather than colliding:');
    eq(db._t.exercise_goals.filter((r) => r.exercise_id === 'uuid-lp').length, 1,
      'the goal is re-pointed (no base row existed to collide with):');
    const sub = db._t.exercise_substitutes[0];
    eq(sub.source_exercise_id, 'uuid-lp', 'substitute chains follow the merge:');
  });

  await test('idempotent: a second run changes nothing', async () => {
    const db = makeDb(SEED);
    await runCollapse(db);
    const after1 = JSON.stringify(db._t);
    await runCollapse(db);
    eq(JSON.stringify(db._t), after1, 're-running must be a no-op (crash mid-migration is safe):');
  });

  await test('a variant this device never used is skipped', async () => {
    const db = makeDb(SEED);
    const stats = await runCollapse(db);
    assert(stats.skipped >= 1, 'expected at least one skip, got ' + stats.skipped);
  });

  await test('stats report what actually happened', async () => {
    const db = makeDb(SEED);
    const s = await runCollapse(db);
    eq(s.moved, 1, 'one case-A merge:');
    eq(s.renamed, 1, 'one case-B rename:');
    assert(s.setsTagged >= 3, 'sets tagged: ' + s.setsTagged);
  });

  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
