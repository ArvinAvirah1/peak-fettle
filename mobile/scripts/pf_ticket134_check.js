// pf_ticket134_check.js -- TICKET-134 self-check (run from mobile/):
//   node scripts/pf_ticket134_check.js
//
// Verifies, for every RAW catalog entry in exerciseCatalog.ts:
//   1. primary_muscles is non-empty
//   2. secondary_muscles.length <= 4 (sane upper bound)
//   3. cues is an array of exactly 3 non-empty strings
//   4. every muscle referenced (primary + secondary) is a MEMBER of the
//      MuscleHeatmap region taxonomy (the 16 REGIONS/MIRRORED keys)
//
// Implementation: parses exerciseCatalog.ts with @babel/parser (same approach
// as pf_sweep.js) and walks the RAW array's object literals directly.

const fs = require('fs');
const path = require('path');
const parser = require(path.join(process.cwd(), 'node_modules', '@babel', 'parser'));

const projectRoot = process.cwd();
const catalogPath = path.join(projectRoot, 'src/lib/trainingEngine/exerciseCatalog.ts');
const heatmapPath = path.join(projectRoot, 'src/components/MuscleHeatmap.tsx');

const source = fs.readFileSync(catalogPath, 'utf8');
const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });

const heatmapSource = fs.readFileSync(heatmapPath, 'utf8');
const regionSet = new Set();
const keyRe = /key:\s*'([a-z_]+)'/g;
let km;
while ((km = keyRe.exec(heatmapSource))) regionSet.add(km[1]);

if (regionSet.size === 0) {
  console.error('FAIL: could not extract any region keys from MuscleHeatmap.tsx');
  process.exit(1);
}

function literalToJs(node) {
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'BooleanLiteral') return node.value;
  if (node.type === 'NumericLiteral') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(function (el) { return el ? literalToJs(el) : null; });
  if (node.type === 'ObjectExpression') {
    const obj = {};
    for (const prop of node.properties) {
      if (prop.type !== 'ObjectProperty') continue;
      const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
      obj[key] = literalToJs(prop.value);
    }
    return obj;
  }
  return undefined;
}

let rawEntries = null;
for (const node of ast.program.body) {
  if (node.type !== 'VariableDeclaration') continue;
  for (const decl of node.declarations) {
    if (decl.id.type === 'Identifier' && decl.id.name === 'RAW' && decl.init && decl.init.type === 'ArrayExpression') {
      rawEntries = decl.init.elements.map(function (el) { return literalToJs(el); });
    }
  }
}

if (!rawEntries || rawEntries.length === 0) {
  console.error('FAIL: could not find/parse the RAW catalog array in exerciseCatalog.ts');
  process.exit(1);
}

let failures = 0;
const MAX_SECONDARY = 4;

for (const ex of rawEntries) {
  const label = ex.name || '(unnamed)';

  if (!Array.isArray(ex.primary_muscles) || ex.primary_muscles.length === 0) {
    console.log('FAIL [' + label + '] primary_muscles is empty');
    failures++;
  }
  if (!Array.isArray(ex.secondary_muscles)) {
    console.log('FAIL [' + label + '] secondary_muscles is not an array');
    failures++;
  } else if (ex.secondary_muscles.length > MAX_SECONDARY) {
    console.log('FAIL [' + label + '] secondary_muscles has ' + ex.secondary_muscles.length + ' entries (> ' + MAX_SECONDARY + ')');
    failures++;
  }
  if (!Array.isArray(ex.cues) || ex.cues.length !== 3) {
    console.log('FAIL [' + label + '] cues does not have exactly 3 entries (has ' + (Array.isArray(ex.cues) ? ex.cues.length : typeof ex.cues) + ')');
    failures++;
  } else {
    for (let i = 0; i < ex.cues.length; i++) {
      const c = ex.cues[i];
      if (typeof c !== 'string' || c.trim().length === 0) {
        console.log('FAIL [' + label + '] cue index ' + i + ' is empty/non-string');
        failures++;
      }
    }
  }

  const allMuscles = (ex.primary_muscles || []).concat(ex.secondary_muscles || []);
  for (const muscle of allMuscles) {
    if (!regionSet.has(muscle)) {
      console.log('FAIL [' + label + '] muscle "' + muscle + '" is not in the MuscleHeatmap region taxonomy');
      failures++;
    }
  }
}

console.log('\n' + rawEntries.length + ' catalog entries checked against ' + regionSet.size + ' MuscleHeatmap regions, ' + failures + ' failures');
process.exit(failures > 0 ? 1 : 0);
