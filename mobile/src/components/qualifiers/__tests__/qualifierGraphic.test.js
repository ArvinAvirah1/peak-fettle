/**
 * qualifierGraphic.test.js — graphic coverage vs the vocabulary (plain node).
 *
 * Run: node mobile/src/components/qualifiers/__tests__/qualifierGraphic.test.js
 *
 * This suite does NOT render React (no jest, no renderer in this repo). It
 * guards the one failure mode that static review reliably misses:
 *
 *   A value is added to constants/qualifiers.ts, nobody draws it, and the
 *   renderer's `default:` case silently shows the WRONG picture. A new cable
 *   attachment would render as a straight bar — confidently incorrect, which is
 *   worse than blank, and invisible until a user acts on it in a gym.
 *
 * So: GRAPHIC_COVERAGE (what the switches actually draw) must equal the
 * vocabulary exactly, in both directions.
 *
 * The pulley geometry is also asserted to be genuinely SHARED, because the
 * founder rejected the first attempt for exactly that: the ratios had different
 * start points and the stack sat outside the frame, so they couldn't be compared.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function loadTs(relPath, deps) {
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true, jsx: 'react' },
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

// react-native-svg / RN / the theme are all stubbed: we only need the module's
// plain-data exports, not its rendering.
const stubs = {
  react: { default: { createElement: function () { return null; } }, createElement: function () { return null; } },
  'react-native-svg': new Proxy({}, { get: function () { return function () { return null; }; } }),
  'theme/ThemeContext': { useTheme: function () { return { theme: { colors: {} } }; } },
  '../../theme/ThemeContext': { useTheme: function () { return { theme: { colors: {} } }; } },
};

const qualifiers = loadTs('mobile/src/constants/qualifiers.ts');
const graphic = loadTs('mobile/src/components/qualifiers/QualifierGraphic.tsx', stubs);

const { QUALIFIER_AXES } = qualifiers;
const { GRAPHIC_COVERAGE, hasGraphic } = graphic;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function eq(a, b, m) {
  if (a !== b) throw new Error((m || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

console.log('\nqualifierGraphic.test.js\n');

test('hasGraphic() agrees with GRAPHIC_COVERAGE', () => {
  for (const axisId of Object.keys(GRAPHIC_COVERAGE)) {
    assert(hasGraphic(axisId), axisId + ' is drawn but hasGraphic() says no');
  }
  for (const axisId of Object.keys(QUALIFIER_AXES)) {
    if (hasGraphic(axisId)) {
      assert(GRAPHIC_COVERAGE[axisId], axisId + ' claims a graphic but nothing draws it');
    }
  }
});

// The core guard, in both directions.
test('every drawn axis covers EVERY value in its vocabulary', () => {
  const missing = [];
  for (const axisId of Object.keys(GRAPHIC_COVERAGE)) {
    const vocab = QUALIFIER_AXES[axisId].values;
    const drawn = new Set(GRAPHIC_COVERAGE[axisId]);
    for (const v of vocab) {
      if (!drawn.has(v)) missing.push(axisId + ':' + v);
    }
  }
  eq(missing.length, 0,
    'values in the vocabulary with NO artwork (they would silently render the ' +
    'default picture): ' + missing.join(', '));
});

test('no axis draws a value that is not in its vocabulary', () => {
  const extra = [];
  for (const axisId of Object.keys(GRAPHIC_COVERAGE)) {
    const vocab = new Set(QUALIFIER_AXES[axisId].values);
    for (const v of GRAPHIC_COVERAGE[axisId]) {
      if (!vocab.has(v)) extra.push(axisId + ':' + v);
    }
  }
  eq(extra.length, 0, 'artwork for values that no longer exist: ' + extra.join(', '));
});

test('coverage lists have no duplicates', () => {
  for (const axisId of Object.keys(GRAPHIC_COVERAGE)) {
    const list = GRAPHIC_COVERAGE[axisId];
    eq(new Set(list).size, list.length, axisId + ' has duplicate entries:');
  }
});

// Axes deliberately WITHOUT artwork — drawing them would be decoration.
test('label-only axes are explicitly excluded, not forgotten', () => {
  for (const axisId of ['bar_type', 'body_position', 'load_mode', 'rom', 'laterality']) {
    assert(QUALIFIER_AXES[axisId], axisId + ' should exist in the vocabulary');
    assert(!hasGraphic(axisId), axisId + ' should render as a plain chip, not artwork');
  }
});

// The founder rejected v1 of these graphics because the ratios did not share a
// start point and the stack was drawn off the frame. Assert the shared anatomy
// is actually shared, by reading the source.
test('all pulley ratios share one frame/stack/handle anatomy', () => {
  const src = fs.readFileSync(
    path.join(REPO, 'mobile/src/components/qualifiers/QualifierGraphic.tsx'), 'utf8');

  // Every ratio branch must draw the SAME three shared components.
  for (const comp of ['<Frame ink={ink} />', '<Stack ink={ink} />', '<UpArrow ink={ink} />']) {
    const count = src.split(comp).length - 1;
    assert(count >= 6,
      comp + ' should appear in every pulley branch (5 ratios + height), found ' + count);
  }

  // The stack must be positioned from the shared frame constants, never from
  // ad-hoc numbers — that is what put it outside the frame the first time.
  assert(/x=\{F\.SX\}/.test(src), 'stack x must come from the shared F.SX constant');
  assert(/width=\{F\.SW\}/.test(src), 'stack width must come from the shared F.SW constant');
});

test('the 1:2 branch puts the movable pulley on the HANDLE, not the stack', () => {
  const src = fs.readFileSync(
    path.join(REPO, 'mobile/src/components/qualifiers/QualifierGraphic.tsx'), 'utf8');
  const start = src.indexOf("if (valueId === '1_2')");
  const end = src.indexOf("if (valueId === '2_1')");
  assert(start > 0 && end > start, 'could not locate the 1_2 branch');
  const branch = src.slice(start, end);
  // The movable pulley (r=5.2) must be anchored at the handle x, not the stack.
  assert(/const mpx = F\.HX/.test(branch), '1:2 movable pulley must sit at the handle (F.HX)');
  assert(/on the handle/.test(branch), '1:2 must be labelled as strands on the handle');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
