/**
 * qualifierKey.test.js — the canonical-key rules (plain node, no jest).
 *
 * Same transpile-and-eval harness as routineFields.test.js / loggerLogic.test.js.
 * Run: node mobile/src/lib/__tests__/qualifierKey.test.js
 *
 * WHY THESE TESTS EXIST. canonicalQualifierKey decides which sets share a PR
 * lineage. Every failure mode here is SILENT — no error, no crash, just a user's
 * personal records quietly splitting in two. In particular:
 *
 *   • If defaults were NOT omitted, every lift's history would split into a
 *     pre-feature bucket (qualifier_key NULL) and a post-feature bucket
 *     ("grip_width=medium|...") written by the chip UI even when the user
 *     touched nothing. PRs would appear to reset the day the feature shipped.
 *   • If key order were not sorted, {a,b} and {b,a} would be different groups.
 *
 * Coverage:
 *   1. NULL / empty / all-defaults all collapse to the SAME group ('').
 *   2. Non-default values are kept, sorted, joined with '|'.
 *   3. Defaults are omitted even when mixed with non-defaults.
 *   4. Key order is insensitive to insertion order.
 *   5. serializeQualifiers KEEPS defaults (the JSON records what the set was).
 *   6. parseQualifiers is total — garbage in, {} out, never a throw.
 *   7. effectiveLoadKg applies the pulley factor, incl. the 1:2 disadvantage.
 *   8. effectiveLoadKg returns null rather than duplicating weight_kg.
 *   9. mergeQualifiers: later (more specific) sources win.
 *  10. visibleQualifiers (the Settings gate) filters DISPLAY only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/lib/__tests__  → up 4 = <repo>
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
  'constants/qualifiers': qualifiers,
  '../constants/qualifiers': qualifiers,
});

const {
  canonicalQualifierKey,
  serializeQualifiers,
  parseQualifiers,
  effectiveLoadKg,
  mergeQualifiers,
  visibleQualifiers,
  isCustomValue,
} = qk;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

console.log('\nqualifierKey.test.js\n');

// Stand-in for a Lat Pulldown: wide grip is its default, rope is not.
const DEFAULTS = { grip_width: 'wide', attachment: 'lat_bar_wide' };

// 1. The grouping identity that protects existing PR history.
test('NULL, empty and all-defaults are ONE group', () => {
  eq(canonicalQualifierKey(null, DEFAULTS), '', 'null:');
  eq(canonicalQualifierKey(undefined, DEFAULTS), '', 'undefined:');
  eq(canonicalQualifierKey({}, DEFAULTS), '', 'empty:');
  eq(
    canonicalQualifierKey({ grip_width: 'wide', attachment: 'lat_bar_wide' }, DEFAULTS),
    '',
    'all-defaults must equal the legacy NULL group:',
  );
});

// 2/3/4. Non-defaults kept, sorted, defaults dropped, order-insensitive.
test('non-default values are kept, sorted and joined with |', () => {
  eq(
    canonicalQualifierKey({ grip_width: 'close', attachment: 'rope' }, DEFAULTS),
    'attachment=rope|grip_width=close',
  );
});

test('defaults are omitted even when mixed with non-defaults', () => {
  eq(
    canonicalQualifierKey({ grip_width: 'close', attachment: 'lat_bar_wide' }, DEFAULTS),
    'grip_width=close',
    'the default attachment must not appear:',
  );
});

test('key is insensitive to insertion order', () => {
  const a = canonicalQualifierKey({ attachment: 'rope', grip_width: 'close' }, DEFAULTS);
  const b = canonicalQualifierKey({ grip_width: 'close', attachment: 'rope' }, DEFAULTS);
  eq(a, b, 'insertion order must not change the group:');
});

test('with no defaults supplied, nothing is omitted', () => {
  eq(
    canonicalQualifierKey({ grip_width: 'wide' }, null),
    'grip_width=wide',
    'absent defaults must not silently drop values:',
  );
});

test('empty-string values never produce a dangling "axis="', () => {
  eq(canonicalQualifierKey({ grip_width: '', attachment: 'rope' }, DEFAULTS), 'attachment=rope');
});

// 5. The JSON keeps defaults — it records what the set actually was, so a later
//    change to an exercise's default cannot rewrite history's claims.
test('serializeQualifiers KEEPS defaults (unlike the key)', () => {
  const json = serializeQualifiers({ grip_width: 'wide', attachment: 'lat_bar_wide' });
  eq(json, '{"attachment":"lat_bar_wide","grip_width":"wide"}', 'defaults must persist in JSON:');
});

test('serializeQualifiers returns null for empty (column stays NULL, not "{}")', () => {
  eq(serializeQualifiers({}), null, 'empty:');
  eq(serializeQualifiers(null), null, 'null:');
});

test('serializeQualifiers output is deterministic (sorted keys)', () => {
  const a = serializeQualifiers({ b: '2', a: '1' });
  const b = serializeQualifiers({ a: '1', b: '2' });
  eq(a, b, 'byte-identical for the same data:');
});

// 6. Totality — a corrupt column must never break a history screen.
test('parseQualifiers is total: garbage yields {}', () => {
  eq(Object.keys(parseQualifiers(null)).length, 0, 'null:');
  eq(Object.keys(parseQualifiers('not json')).length, 0, 'bad json:');
  eq(Object.keys(parseQualifiers('[1,2,3]')).length, 0, 'array:');
  eq(Object.keys(parseQualifiers('"str"')).length, 0, 'scalar:');
  eq(Object.keys(parseQualifiers('{"a":1,"b":null}')).length, 0, 'non-string values dropped:');
});

test('parseQualifiers round-trips serializeQualifiers', () => {
  const orig = { attachment: 'rope', grip_width: 'close' };
  const back = parseQualifiers(serializeQualifiers(orig));
  eq(back.attachment, 'rope');
  eq(back.grip_width, 'close');
});

// 7/8. Pulley load math, including the founder-corrected 1:2 disadvantage.
test('effectiveLoadKg applies the pulley factor', () => {
  eq(effectiveLoadKg(100, { pulley_ratio: '1_1' }), 100, '1:1:');
  eq(effectiveLoadKg(100, { pulley_ratio: '2_1' }), 50, '2:1 feels half:');
  eq(effectiveLoadKg(100, { pulley_ratio: '4_1' }), 25, '4:1 feels a quarter:');
  eq(effectiveLoadKg(100, { pulley_ratio: '1_2' }), 200, '1:2 feels DOUBLE:');
});

test('effectiveLoadKg is null when there is nothing to add', () => {
  eq(effectiveLoadKg(100, {}), null, 'no ratio selected:');
  eq(effectiveLoadKg(100, null), null, 'no qualifiers:');
  eq(effectiveLoadKg(null, { pulley_ratio: '2_1' }), null, 'no weight:');
  eq(effectiveLoadKg(0, { pulley_ratio: '2_1' }), null, 'zero weight:');
  eq(effectiveLoadKg(100, { pulley_ratio: 'nonsense' }), null, 'unknown ratio id:');
});

test("effectiveLoadKg treats 'unknown' as as-typed (no claim made)", () => {
  eq(effectiveLoadKg(100, { pulley_ratio: 'unknown' }), 100);
});

// 9. Prefill precedence.
test('mergeQualifiers: later sources win', () => {
  const merged = mergeQualifiers(
    { grip_width: 'wide', attachment: 'rope' }, // routine prescription
    { grip_width: 'close' },                    // what they actually did today
  );
  eq(merged.grip_width, 'close', 'actual overrides prescription:');
  eq(merged.attachment, 'rope', 'unspecified keys survive:');
});

test('mergeQualifiers ignores null sources and empty values', () => {
  const merged = mergeQualifiers(null, { a: 'x' }, undefined, { a: '' });
  eq(merged.a, 'x', 'an empty value must not clobber a real one:');
});

// 10. The Settings gate is DISPLAY-only.
test('visibleQualifiers filters display without touching the data', () => {
  const stored = { grip_width: 'close', attachment: 'rope', rom: 'paused' };
  const shown = visibleQualifiers(stored, ['grip_width', 'attachment']);
  eq(Object.keys(shown).length, 2, 'only enabled axes shown:');
  eq(shown.rom, undefined, 'disabled axis hidden:');
  eq(stored.rom, 'paused', 'the STORED map must be unmodified:');
  // The stored value still reaches the key — the gate never changes grouping.
  eq(
    canonicalQualifierKey(stored, {}).includes('rom=paused'),
    true,
    'a hidden axis must still count toward the qualifier key:',
  );
});

test('visibleQualifiers with no gate configured shows everything', () => {
  const shown = visibleQualifiers({ a: '1', b: '2' }, null);
  eq(Object.keys(shown).length, 2);
});

test('custom values are recognised by prefix', () => {
  assert(isCustomValue('custom:abc123'), 'custom: prefix');
  assert(!isCustomValue('rope'), 'shipped value is not custom');
  assert(!isCustomValue(null), 'null is not custom');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
