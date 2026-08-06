/**
 * qualifierStrings.test.js — every qualifier has a translation (plain node).
 *
 * Run: node mobile/src/i18n/__tests__/qualifierStrings.test.js
 *
 * The qualifier catalog stores i18n KEYS, not English. That is the right call
 * (it keeps the feature translatable), but it moves a whole class of bug from
 * compile time to runtime: a missing key doesn't crash, it renders the literal
 * string "qualifiers:value.attachment.rope.label" into the UI where a label
 * should be. Nobody notices until a user sees it mid-workout.
 *
 * So: every axis and every value in the closed vocabulary must resolve to a real
 * string in the en bundle, and the bundle must not carry entries for things that
 * no longer exist.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath) {
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports;
}

const { QUALIFIER_AXES } = load('mobile/src/constants/qualifiers.ts');
const bundle = JSON.parse(
  fs.readFileSync(path.join(REPO, 'mobile/src/i18n/locales/en/qualifiers.json'), 'utf8'),
);

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

console.log('\nqualifierStrings.test.js\n');

const axisIds = Object.keys(QUALIFIER_AXES);

test('every axis has a label and a description', () => {
  const missing = [];
  for (const id of axisIds) {
    const entry = bundle.axis && bundle.axis[id];
    if (!entry || typeof entry.label !== 'string' || entry.label.length === 0) missing.push(id + '.label');
    if (!entry || typeof entry.desc !== 'string' || entry.desc.length === 0) missing.push(id + '.desc');
  }
  eq(missing.length, 0, 'missing axis strings: ' + missing.join(', '));
});

test('every value has a label and a description', () => {
  const missing = [];
  for (const id of axisIds) {
    const values = QUALIFIER_AXES[id].values;
    const entry = (bundle.value && bundle.value[id]) || {};
    for (const v of values) {
      const ve = entry[v];
      if (!ve || typeof ve.label !== 'string' || ve.label.length === 0) missing.push(id + '.' + v + '.label');
      if (!ve || typeof ve.desc !== 'string' || ve.desc.length === 0) missing.push(id + '.' + v + '.desc');
    }
  }
  eq(missing.length, 0, 'missing value strings: ' + missing.join(', '));
});

test('every axis that allows custom options has a placeholder hint', () => {
  const missing = [];
  for (const id of axisIds) {
    if (!QUALIFIER_AXES[id].allowsCustom) continue;
    const entry = bundle.axis && bundle.axis[id];
    if (!entry || typeof entry.customHint !== 'string' || entry.customHint.length === 0) {
      missing.push(id + '.customHint');
    }
  }
  eq(missing.length, 0, 'missing custom hints: ' + missing.join(', '));
});

test('the bundle carries no axis that left the vocabulary', () => {
  const extra = Object.keys(bundle.axis || {}).filter((id) => !axisIds.includes(id));
  eq(extra.length, 0, 'stale axis strings: ' + extra.join(', '));
});

test('the bundle carries no value that left its axis', () => {
  const extra = [];
  for (const id of Object.keys(bundle.value || {})) {
    if (!axisIds.includes(id)) { extra.push(id + ' (whole axis)'); continue; }
    const vocab = new Set(QUALIFIER_AXES[id].values);
    for (const v of Object.keys(bundle.value[id])) {
      if (!vocab.has(v)) extra.push(id + '.' + v);
    }
  }
  eq(extra.length, 0, 'stale value strings: ' + extra.join(', '));
});

test('no label is accidentally the key itself', () => {
  // A copy-paste slip that renders as a key in the UI.
  const bad = [];
  for (const id of axisIds) {
    const a = bundle.axis[id];
    if (a.label.startsWith('qualifiers:')) bad.push(id);
    for (const v of QUALIFIER_AXES[id].values) {
      if (bundle.value[id][v].label.startsWith('qualifiers:')) bad.push(id + '.' + v);
    }
  }
  eq(bad.length, 0, 'labels that are keys: ' + bad.join(', '));
});

test('the namespace is registered so the strings actually load', () => {
  const idx = fs.readFileSync(path.join(REPO, 'mobile/src/i18n/index.ts'), 'utf8');
  assert(/import qualifiers from '\.\/locales\/en\/qualifiers\.json'/.test(idx),
    'qualifiers.json must be imported in i18n/index.ts');
  // I18N_NAMESPACES is derived from Object.keys(EN_RESOURCES), so membership in
  // that object is what actually registers the namespace.
  const res = idx.slice(idx.indexOf('export const EN_RESOURCES'), idx.indexOf('export const I18N_NAMESPACES'));
  assert(/\bqualifiers\b/.test(res), 'qualifiers must be a member of EN_RESOURCES');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
