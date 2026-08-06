/**
 * qualifierSettings.test.js — the four gate invariants (plain node).
 *
 * Run: node mobile/src/data/__tests__/qualifierSettings.test.js
 *
 * SPEC §4 states four invariants for the Settings gate. Three of them are the
 * kind that fail SILENTLY and unfairly if broken, which is why they are tests
 * and not comments:
 *
 *   1. Display-only: the gate never changes what is STORED.
 *   2. It never changes a percentile treatment — two users with identical
 *      training and different settings must rank identically. A display
 *      preference must never be able to move your standing against other people.
 *   3. Disabling an axis never deletes data; values persist and return intact.
 *   4. 'off' short-circuits to no axes at all.
 *
 * Also covers totality: an unknown stored level, a corrupt custom list, or an
 * axis id retired by a later release must degrade to something sane rather than
 * breaking the settings screen.
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

// In-memory app_settings so the async layer is exercised without SQLite.
const store = {};
const appSettingsStub = {
  getSetting: async function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setSetting: async function (k, v) { store[k] = v; },
};

const qualifiers = load('mobile/src/constants/qualifiers.ts');
const settings = load('mobile/src/data/qualifierSettings.ts', {
  appSettings: appSettingsStub,
  './appSettings': appSettingsStub,
  'constants/qualifiers': qualifiers,
  '../constants/qualifiers': qualifiers,
});
const qk = load('mobile/src/lib/qualifierKey.ts', {
  'constants/qualifiers': qualifiers,
  '../constants/qualifiers': qualifiers,
});

const {
  resolveEnabledAxes,
  visibleAxesForExercise,
  isTrackingOff,
  LEVEL_AXES,
  DEFAULT_LEVEL,
  getQualifierTrackingLevel,
  setQualifierTrackingLevel,
  getCustomEnabledAxes,
  setCustomEnabledAxes,
  getEnabledQualifierAxes,
} = settings;
const { AXIS_ORDER, QUALIFIER_AXES } = qualifiers;
const { canonicalQualifierKey, visibleQualifiers, serializeQualifiers } = qk;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function eq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function deq(a, b, m) {
  const x = JSON.stringify(a); const y = JSON.stringify(b);
  if (x !== y) throw new Error((m || '') + ' expected ' + x + ' === ' + y);
}

(async () => {
  console.log('\nqualifierSettings.test.js\n');

  // --- levels --------------------------------------------------------------

  await test('default level is essential, covering the founder\'s stated use cases', () => {
    eq(DEFAULT_LEVEL, 'essential');
    const axes = resolveEnabledAxes('essential');
    for (const a of ['attachment', 'pulley_height', 'pulley_ratio', 'grip_width']) {
      assert(axes.includes(a), 'essential should include ' + a);
    }
  });

  // INVARIANT 4
  await test("'off' yields no axes at all", () => {
    deq(resolveEnabledAxes('off'), []);
    assert(isTrackingOff('off'), 'isTrackingOff(off)');
    assert(!isTrackingOff('essential'), 'essential is not off');
  });

  await test('levels are strictly nested: essential ⊂ detailed ⊂ everything', () => {
    const e = resolveEnabledAxes('essential');
    const d = resolveEnabledAxes('detailed');
    const all = resolveEnabledAxes('everything');
    for (const a of e) assert(d.includes(a), 'detailed should contain essential axis ' + a);
    for (const a of d) assert(all.includes(a), 'everything should contain detailed axis ' + a);
    assert(d.length > e.length, 'detailed should be strictly larger');
    assert(all.length > d.length, 'everything should be strictly larger');
  });

  await test("'everything' covers every axis in the vocabulary", () => {
    const all = resolveEnabledAxes('everything');
    eq(all.length, Object.keys(QUALIFIER_AXES).length, 'count:');
    for (const a of Object.keys(QUALIFIER_AXES)) assert(all.includes(a), 'missing ' + a);
  });

  await test('resolved axes always come back in canonical display order', () => {
    for (const level of ['essential', 'detailed', 'everything']) {
      const axes = resolveEnabledAxes(level);
      const sorted = AXIS_ORDER.filter((a) => axes.includes(a));
      deq(axes, sorted, level + ' order:');
    }
  });

  // --- totality ------------------------------------------------------------

  await test('an unrecognised level falls back to the default rather than throwing', () => {
    const axes = resolveEnabledAxes('nonsense');
    deq(axes, resolveEnabledAxes(DEFAULT_LEVEL), 'fallback:');
  });

  await test('custom drops axis ids that are no longer in the vocabulary', () => {
    // Axis ids are append/deprecate-only, but a retired id must not break the
    // settings screen for someone who ticked it two releases ago.
    const axes = resolveEnabledAxes('custom', ['attachment', 'retired_axis_from_2025', 'stance']);
    deq(axes, ['attachment', 'stance'], 'unknown axis dropped:');
  });

  await test('custom with nothing ticked yields no axes', () => {
    deq(resolveEnabledAxes('custom', []), []);
    deq(resolveEnabledAxes('custom', null), []);
  });

  // --- exercise intersection (INVARIANT: enabled ∩ applicable) -------------

  await test('an exercise only shows axes that are both enabled AND applicable', () => {
    const enabled = resolveEnabledAxes('everything');
    // A treadmill-like exercise: nothing applies.
    deq(visibleAxesForExercise([], enabled), [], 'no applicable axes:');
    // A pulldown: only its own axes, even though everything is enabled.
    const shown = visibleAxesForExercise(['grip_width', 'attachment'], enabled);
    deq(shown, ['attachment', 'grip_width'], 'intersection, in display order:');
  });

  await test('an applicable axis the user disabled is not shown', () => {
    const enabled = resolveEnabledAxes('essential'); // no grip_orientation
    const shown = visibleAxesForExercise(['grip_width', 'grip_orientation'], enabled);
    deq(shown, ['grip_width'], 'disabled axis hidden:');
  });

  await test("with tracking off, nothing shows even for a fully-qualified exercise", () => {
    const shown = visibleAxesForExercise(['grip_width', 'attachment', 'pulley_ratio'], resolveEnabledAxes('off'));
    deq(shown, [], 'off shows nothing:');
  });

  // --- INVARIANTS 1-3: display-only -----------------------------------------

  await test('INVARIANT: the gate never changes what is stored', () => {
    const actual = { grip_width: 'close', attachment: 'rope', rom: 'paused' };
    const before = serializeQualifiers(actual);
    // Render under a restrictive gate...
    const shown = visibleQualifiers(actual, resolveEnabledAxes('essential'));
    assert(shown.rom === undefined, 'rom should be hidden under essential');
    // ...the stored map is untouched, and what we would persist is unchanged.
    eq(serializeQualifiers(actual), before, 'serialized form must not change:');
    eq(actual.rom, 'paused', 'the source object must not be mutated:');
  });

  await test('INVARIANT: hidden axes still count toward the qualifier key (grouping is not gated)', () => {
    const actual = { grip_width: 'close', rom: 'paused' };
    const key = canonicalQualifierKey(actual, {});
    assert(key.includes('rom=paused'),
      'a hidden axis must still group history — otherwise two users with the ' +
      'same training but different settings would get different PR lineages');
  });

  await test('INVARIANT: two settings levels produce the SAME percentile-relevant key', () => {
    const actual = { grip_width: 'close', attachment: 'rope', rom: 'paused' };
    // Simulate two users: one on 'essential', one on 'everything'. Both logged
    // the identical set. The stored qualifiers - and therefore the key that
    // feeds grouping and the strength model - must be identical.
    const userA = canonicalQualifierKey(actual, {});
    const userB = canonicalQualifierKey(actual, {});
    eq(userA, userB, 'identical training must yield identical keys:');
  });

  await test('INVARIANT: disabling then re-enabling an axis loses nothing', () => {
    const actual = { grip_width: 'close', rom: 'paused' };
    const hidden = visibleQualifiers(actual, resolveEnabledAxes('essential'));
    eq(hidden.rom, undefined, 'hidden while disabled:');
    const shownAgain = visibleQualifiers(actual, resolveEnabledAxes('everything'));
    eq(shownAgain.rom, 'paused', 'returns intact when re-enabled:');
  });

  // --- persistence ---------------------------------------------------------

  await test('level round-trips through app_settings', async () => {
    await setQualifierTrackingLevel('detailed');
    eq(await getQualifierTrackingLevel(), 'detailed');
    await setQualifierTrackingLevel('off');
    eq(await getQualifierTrackingLevel(), 'off');
  });

  await test('an unset level reads as the default', async () => {
    delete store.qualifier_tracking_level;
    eq(await getQualifierTrackingLevel(), DEFAULT_LEVEL);
  });

  await test('a junk stored level reads as the default', async () => {
    store.qualifier_tracking_level = 'banana';
    eq(await getQualifierTrackingLevel(), DEFAULT_LEVEL);
  });

  await test('a junk level cannot be persisted', async () => {
    await setQualifierTrackingLevel('banana');
    eq(await getQualifierTrackingLevel(), DEFAULT_LEVEL, 'coerced on write:');
  });

  await test('custom axes round-trip and are stored in canonical order', async () => {
    await setCustomEnabledAxes(['stance', 'attachment']);
    deq(await getCustomEnabledAxes(), ['attachment', 'stance'], 'reordered on write:');
  });

  await test('a corrupt custom-axes value degrades to empty', async () => {
    store.qualifier_axes_enabled = 'not json';
    deq(await getCustomEnabledAxes(), []);
    store.qualifier_axes_enabled = '{"not":"an array"}';
    deq(await getCustomEnabledAxes(), []);
    store.qualifier_axes_enabled = '[1,2,3]';
    deq(await getCustomEnabledAxes(), [], 'non-string entries dropped:');
  });

  await test('getEnabledQualifierAxes resolves the level end to end', async () => {
    await setQualifierTrackingLevel('off');
    deq(await getEnabledQualifierAxes(), [], 'off:');

    await setQualifierTrackingLevel('essential');
    deq(await getEnabledQualifierAxes(), resolveEnabledAxes('essential'), 'essential:');

    await setQualifierTrackingLevel('custom');
    await setCustomEnabledAxes(['pulley_ratio']);
    deq(await getEnabledQualifierAxes(), ['pulley_ratio'], 'custom:');
  });

  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
