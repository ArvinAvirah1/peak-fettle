/**
 * modalNesting.test.js — sheets opened from the stepper must be NESTED in it.
 *
 * Run: node mobile/src/components/qualifiers/__tests__/modalNesting.test.js
 *
 * THIS IS THE MOST LOAD-BEARING TEST IN THE QUALIFIER FEATURE, because this
 * exact bug has shipped twice:
 *
 *   GL-1 (2026-08-04) — "Choose alternative" and "Superset with…" did nothing on
 *     a live routine: their sheets were siblings of the stepper's Modal.
 *   GL-2 (2026-08-05) — "Select from library" still did nothing, because
 *     SubstituteSwapSheet nested itself but rendered its OWN picker as a sibling.
 *
 * On iOS a <Modal> presented while another Modal is presented is silently
 * dropped. No crash, no warning, no log — the button just does nothing. Static
 * review misses it, and a code comment claiming the pattern is followed is not
 * evidence: GL-2's file header claimed exactly that while the JSX did the
 * opposite, which is probably why GL-1's fix stopped one level too shallow.
 *
 * So this walks the real AST and asserts nesting structurally. It cannot be
 * satisfied by a comment.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const { parse } = require(path.join(REPO, 'mobile', 'node_modules', '@babel', 'parser'));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

function jsxName(node) {
  const n = node.openingElement && node.openingElement.name;
  if (!n) return null;
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return n.property && n.property.name;
  return null;
}

/**
 * Names of components rendered while inside at least one <Modal>, and names
 * rendered outside any Modal, for one file.
 */
function analyze(relPath) {
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const insideModal = new Set();
  const outsideModal = new Set();

  (function walk(node, depth) {
    if (!node || typeof node !== 'object') return;
    let nextDepth = depth;
    if (node.type === 'JSXElement') {
      const name = jsxName(node);
      if (name) {
        if (depth > 0) insideModal.add(name);
        else outsideModal.add(name);
      }
      if (name === 'Modal') nextDepth = depth + 1;
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => walk(c, nextDepth));
      else if (v && typeof v === 'object' && v.type) walk(v, nextDepth);
    }
  })(ast, 0);

  return { insideModal, outsideModal };
}

console.log('\nmodalNesting.test.js\n');

// ── The qualifier picker, opened from a chip inside the live stepper ─────────
test('QualifierPickerSheet is nested inside a Modal in WorkoutLoggerHost', () => {
  const { insideModal, outsideModal } = analyze('mobile/src/components/WorkoutLoggerHost.tsx');
  assert(
    insideModal.has('QualifierPickerSheet'),
    'QualifierPickerSheet must be rendered INSIDE the stepper <Modal>. As a ' +
    'sibling, iOS silently drops it and tapping a qualifier chip does nothing.',
  );
  assert(
    !outsideModal.has('QualifierPickerSheet'),
    'QualifierPickerSheet must not ALSO be mounted outside a Modal',
  );
});

// ── Regression guards for the two bugs that already shipped ─────────────────
test('the GL-1 sheets are still nested (no regression)', () => {
  const { insideModal } = analyze('mobile/src/components/WorkoutLoggerHost.tsx');
  for (const comp of ['SubstituteSwapSheet', 'SupersetPairSheet', 'ExerciseDetailSheet', 'ExercisePicker']) {
    assert(insideModal.has(comp), comp + ' must stay nested inside the stepper Modal (GL-1)');
  }
});

test('the GL-2 fix holds: SubstituteSwapSheet nests its own ExercisePicker', () => {
  const { insideModal, outsideModal } = analyze('mobile/src/components/SubstituteSwapSheet.tsx');
  assert(
    insideModal.has('ExercisePicker'),
    'ExercisePicker must be a CHILD of this sheet\'s own <Modal>. It was a ' +
    'sibling until 2026-08-05, which is why "Select from library" did nothing.',
  );
  assert(
    !outsideModal.has('ExercisePicker'),
    'ExercisePicker must not be rendered outside the Modal as well',
  );
});

test('RoutineEditorSheet nests its pickers (the pattern the others copy)', () => {
  const { insideModal } = analyze('mobile/src/components/RoutineEditorSheet.tsx');
  assert(insideModal.has('ExercisePicker'), 'RoutineEditorSheet must nest ExercisePicker');
  assert(insideModal.has('SubstituteSwapSheet'), 'RoutineEditorSheet must nest SubstituteSwapSheet');
});

// ── The picker's own explainer is one level deeper again ────────────────────
test('the ? explainer is nested inside the picker sheet\'s Modal', () => {
  const { insideModal } = analyze('mobile/src/components/qualifiers/QualifierPickerSheet.tsx');
  assert(
    insideModal.has('QualifierExplainer'),
    'QualifierExplainer opens over the picker, so it must be nested inside the ' +
    'picker\'s Modal — the same trap, one level deeper. This is precisely where ' +
    'the GL-2 fix stopped short last time.',
  );
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
