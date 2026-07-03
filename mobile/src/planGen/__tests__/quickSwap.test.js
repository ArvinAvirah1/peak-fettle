/**
 * quickSwap.test.js — engine-v2 Stage-3 quick-swap tests (plain node).
 *
 * Mirrors the transpile-and-eval harness used by
 * mobile/src/planGen/__tests__/planLifecycle.test.js and the v2 engine suite
 * (no jest / no expo / no Babel): require('typescript').transpileModule → eval in
 * a module context, resolving relative ./x imports. quickSwap.ts is PURE (imports
 * only the on-device catalog + types), so the plain loader needs no stubs.
 * Run:  node mobile/src/planGen/__tests__/quickSwap.test.js
 *
 * Coverage (task section B):
 *   1. Region-aware ranking — incline (upper_chest) swap → chest PRESSES first,
 *      never a generic isolation "chest" downgrade while pressing options exist.
 *   2. Same-region same-pattern beats everything (Bench Press → other flat presses).
 *   3. Equipment filter (dumbbell-only) restricts the pool; absent profile = no filter.
 *   4. Injury exclusion drops contraindicated lifts (shoulders).
 *   5. Determinism — identical inputs → identical order.
 *   6. Name-only resolution (mid-workout exercises may lack an id).
 *   7. Exclusion of the source + today's-session ids/names.
 *   8. Empty / unresolvable behaviour carries a reason.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/planGen/__tests__  → up 4 = <repo>
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

const load = makeLoader();
const q = load('mobile/src/planGen/quickSwap.ts');
const cat = load('mobile/src/lib/trainingEngine/v2/catalog.ts');
const CATALOG = cat.CATALOG_V2;
const byName = (n) => CATALOG.find((e) => e.name === n);

const FULL_GYM = ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack', 'pullup_bar', 'bands', 'bodyweight', 'kettlebell'];
const CHEST_REGIONS = new Set(['upper_chest', 'mid_chest', 'lower_chest']);

console.log('\nengine-v2 Stage 3 — quickSwap.test.js\n');

// ── 1. catalog is region-tagged (taxonomy prerequisite) ──────────────────────
test('every catalog exercise carries a region tag (taxonomy maturation §5)', () => {
  const missing = CATALOG.filter((e) => !e.region);
  eq(missing.length, 0, 'exercises missing region: ' + missing.map((e) => e.name).join(','));
  // sub-region granularity actually present
  const regions = new Set(CATALOG.map((e) => e.region));
  assert(regions.has('mid_chest') && regions.has('lats') && regions.has('mid_back') &&
         regions.has('side_delt') && regions.has('rear_delt'), 'region granularity too coarse: ' + [...regions].join(','));
});

// ── 2. Bench Press → same-region same-pattern presses first ──────────────────
test('Bench Press (mid_chest) swap → other flat presses ranked first (tier 0)', () => {
  const r = q.alternativesForDetailed({ name: 'Bench Press' }, { equipment: FULL_GYM });
  eq(r.resolvedRegion, 'mid_chest', 'resolved region:');
  eq(r.resolvedPattern, 'horizontal_push', 'resolved pattern:');
  assert(r.candidates.length > 0, 'no candidates');
  // top few are all same-region same-pattern (tier 0)
  const top = r.candidates.slice(0, 4);
  for (const c of top) {
    eq(c.tier, 0, c.name + ' should be tier 0:');
    eq(c.region, 'mid_chest', c.name + ' region:');
    eq(c.movementPattern, 'horizontal_push', c.name + ' pattern:');
  }
  // the source itself is never offered
  assert(!r.candidates.some((c) => c.name === 'Bench Press'), 'source leaked into candidates');
});

// ── 3. Region-aware: incline (upper_chest) → chest PRESSES, not a generic downgrade ──
test('incline barbell press → upper-chest-region PRESSES first, never a generic chest-isolation downgrade', () => {
  // "Incline Barbell Press" is NOT in the catalog → name heuristic → upper_chest / horizontal_push.
  const r = q.alternativesForDetailed({ name: 'Incline Barbell Press' }, { equipment: FULL_GYM });
  eq(r.resolvedRegion, 'upper_chest', 'incline resolves to upper_chest:');
  eq(r.resolvedPattern, 'horizontal_push', 'incline pattern:');
  assert(r.candidates.length > 0, 'no candidates for incline');
  // No true upper_chest lift exists in the catalog, so the best available are the
  // ADJACENT chest region (mid/lower) under the SAME pressing pattern — all compound
  // presses. The key property: a compound chest PRESS must outrank a chest ISOLATION
  // fly (no generic downgrade while a pressing option exists).
  const firstIso = r.candidates.findIndex((c) => !c.isCompound);
  const lastCompoundPress = (() => {
    let idx = -1;
    r.candidates.forEach((c, i) => {
      if (c.isCompound && c.movementPattern === 'horizontal_push' && CHEST_REGIONS.has(c.region)) idx = i;
    });
    return idx;
  })();
  assert(firstIso === -1 || firstIso > lastCompoundPress,
    'a chest isolation ranked above a compound press (' + firstIso + ' vs ' + lastCompoundPress + ')');
  // the very top candidate is a compound chest press
  const top = r.candidates[0];
  assert(top.isCompound && top.movementPattern === 'horizontal_push' && CHEST_REGIONS.has(top.region),
    'top incline alternative is not a compound chest press: ' + top.name);
});

// ── 4. Equipment filter ──────────────────────────────────────────────────────
test('equipment filter (dumbbell-only) restricts candidates to dumbbell-capable lifts', () => {
  const r = q.alternativesFor({ name: 'Bench Press' }, { equipment: ['dumbbell'] });
  assert(r.length > 0, 'expected some dumbbell alternatives');
  for (const c of r) {
    assert(c.equipment.includes('dumbbell'), c.name + ' has no dumbbell option: ' + c.equipment.join(','));
  }
});

test('absent equipment profile applies NO filter (never hides every option)', () => {
  const none = q.alternativesFor({ name: 'Bench Press' }, {}); // no equipment key
  const empty = q.alternativesFor({ name: 'Bench Press' }, { equipment: [] });
  assert(none.length > 0 && empty.length > 0, 'missing/empty profile hid all options');
  eq(JSON.stringify(none), JSON.stringify(empty), 'missing vs empty equipment differ:');
});

// ── 5. Injury exclusion ──────────────────────────────────────────────────────
test('injury constraint (shoulders) excludes shoulder-contraindicated alternatives', () => {
  const r = q.alternativesFor({ name: 'Bench Press' }, { injuries: ['shoulders'], equipment: FULL_GYM });
  // Dumbbell Bench Press is contraindicated for shoulders in the catalog → must be gone.
  const shoulderContra = CATALOG.filter((e) => e.contraindications.includes('shoulders')).map((e) => e.name);
  const leaked = r.filter((c) => shoulderContra.includes(c.name)).map((c) => c.name);
  eq(leaked.length, 0, 'shoulder-contraindicated lifts leaked: ' + leaked.join(','));
  assert(r.length > 0, 'injury filter emptied the list unexpectedly');
});

// ── 6. Determinism ───────────────────────────────────────────────────────────
test('determinism — identical inputs produce identical ordering', () => {
  const mk = () => q.alternativesFor({ name: 'Barbell Row' }, { equipment: FULL_GYM, injuries: ['lower_back'] });
  eq(JSON.stringify(mk()), JSON.stringify(mk()), 'quick-swap output not deterministic:');
});

// ── 7. Name-only vs id resolution ────────────────────────────────────────────
test('name-only resolution matches id resolution (mid-workout refs may lack an id)', () => {
  const bench = byName('Bench Press');
  const byId = q.alternativesFor({ id: bench.id }, { equipment: FULL_GYM });
  const byNm = q.alternativesFor({ name: 'bench   press' }, { equipment: FULL_GYM }); // messy name
  assert(byId.length > 0 && byNm.length > 0, 'one path returned nothing');
  eq(JSON.stringify(byId.map((c) => c.id)), JSON.stringify(byNm.map((c) => c.id)), 'id vs name order differs:');
  // source excluded in both
  assert(!byId.some((c) => c.id === bench.id) && !byNm.some((c) => c.id === bench.id), 'source leaked');
});

// ── 8. Exclude today's-session ids/names ─────────────────────────────────────
test('excludeIds / excludeNames remove exercises already in today\'s session', () => {
  const full = q.alternativesFor({ name: 'Bench Press' }, { equipment: FULL_GYM });
  const drop = full[0];
  const filtered = q.alternativesFor(
    { name: 'Bench Press' },
    { equipment: FULL_GYM, excludeIds: [drop.id] },
  );
  assert(!filtered.some((c) => c.id === drop.id), 'excludeIds did not drop ' + drop.name);
  const filteredByName = q.alternativesFor(
    { name: 'Bench Press' },
    { equipment: FULL_GYM, excludeNames: [full[1].name] },
  );
  assert(!filteredByName.some((c) => c.name === full[1].name), 'excludeNames did not drop ' + full[1].name);
});

// ── 9. Empty / unresolvable ──────────────────────────────────────────────────
test('unresolvable exercise → empty list with an explicit reason', () => {
  const r = q.alternativesForDetailed({ name: 'Underwater Basket Weaving' }, {});
  eq(r.candidates.length, 0, 'unresolvable should yield no candidates:');
  eq(r.resolvedRegion, null, 'no region resolved:');
  eq(r.reason, 'unresolved-exercise', 'reason:');
});

test('over-filtered pool → empty list with a filter reason (not a crash)', () => {
  // A region that resolves, but an impossible equipment set leaves nothing.
  const r = q.alternativesForDetailed({ name: 'Bench Press' }, { equipment: ['nonexistent_equipment'] });
  eq(r.candidates.length, 0, 'impossible equipment should yield none:');
  eq(r.reason, 'no-match-after-filters', 'reason after filters:');
});

test('limit caps the number of candidates', () => {
  const r = q.alternativesFor({ name: 'Bench Press' }, { equipment: FULL_GYM, limit: 3 });
  assert(r.length <= 3, 'limit not respected: ' + r.length);
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
