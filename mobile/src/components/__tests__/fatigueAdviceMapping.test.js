/**
 * fatigueAdviceMapping.test.js — TICKET-142 UI-side mapping tests.
 *
 * Same dependency-free transpile-and-eval harness as
 * lib/trainingEngine/v2/__tests__/fatigue.test.js and autoregulation.test.js.
 * Run: node mobile/src/components/__tests__/fatigueAdviceMapping.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, cache) {
  cache = cache || {};
  const norm = path.normalize(relPath);
  if (cache[norm]) return cache[norm];
  const abs = path.join(REPO, norm);
  let file = abs;
  if (!fs.existsSync(file)) file = abs + '.ts';
  if (!fs.existsSync(file)) file = abs + '.tsx';
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache[norm] = mod.exports;
  const dir = path.dirname(file);
  const localRequire = (spec) => {
    if (spec.startsWith('.')) {
      const rel = path.relative(REPO, path.resolve(dir, spec));
      return load(rel, cache);
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

const MAP = load('mobile/src/components/fatigueAdviceMapping.ts');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ', name); }
  else { failed++; console.log('  FAIL ', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// ---------------------------------------------------------------------------
// mapAdviceToPatch
// ---------------------------------------------------------------------------
console.log('mapAdviceToPatch:');

const deloadAdvice = {
  rule_id: 'FT-D1',
  action: 'pull_deload_forward',
  because: 'engine rule FT-D1: readiness has averaged 50 over the last 7 days (7 scored days, threshold 55) and your last deload was 6 weeks ago — consider pulling your deload forward.',
};

const trimAdvice = {
  rule_id: 'FT-V1',
  action: 'trim_accessory_volume',
  trim_pct: 20,
  because: 'engine rule FT-V1: your last 3 readiness scores (52, 55, 58) are all under 60 — consider trimming accessory volume about 20% next session.',
};

check('pull_deload_forward maps to deloadFrequency=frequent',
  JSON.stringify(MAP.mapAdviceToPatch(deloadAdvice)) === JSON.stringify({ deloadFrequency: 'frequent' }));

check('trim_accessory_volume maps to an empty patch (no existing volume-trim mechanism)',
  JSON.stringify(MAP.mapAdviceToPatch(trimAdvice)) === JSON.stringify({}));

// ---------------------------------------------------------------------------
// buildPlanAdjustPrefillParams
// ---------------------------------------------------------------------------
console.log('buildPlanAdjustPrefillParams:');

const deloadParams = MAP.buildPlanAdjustPrefillParams(deloadAdvice);
check('deload params carry the rule id', deloadParams.fatigueRuleId === 'FT-D1');
check('deload params carry the verbatim because-line', deloadParams.fatigueBecause === deloadAdvice.because);
check('deload params JSON-encode the patch', deloadParams.fatiguePatch === JSON.stringify({ deloadFrequency: 'frequent' }));
check('every param value is a string (expo-router param contract)',
  Object.values(deloadParams).every((v) => typeof v === 'string'));

const trimParams = MAP.buildPlanAdjustPrefillParams(trimAdvice);
check('trim params carry the rule id', trimParams.fatigueRuleId === 'FT-V1');
check('trim params carry the verbatim because-line', trimParams.fatigueBecause === trimAdvice.because);
check('trim params JSON-encode an empty patch', trimParams.fatiguePatch === '{}');

// ---------------------------------------------------------------------------
// Invariants
// ---------------------------------------------------------------------------
console.log('invariants:');
check('founder rule: the word "AI" never appears in mapped params',
  !/\bAI\b/i.test(deloadParams.fatigueBecause) && !/\bAI\b/i.test(trimParams.fatigueBecause));
check('mapAdviceToPatch never invents fields outside MetaChangePatch (only deloadFrequency is ever set)',
  Object.keys(MAP.mapAdviceToPatch(deloadAdvice)).every((k) => k === 'deloadFrequency') &&
  Object.keys(MAP.mapAdviceToPatch(trimAdvice)).length === 0);
check('determinism: identical input -> identical output',
  JSON.stringify(MAP.buildPlanAdjustPrefillParams(deloadAdvice)) === JSON.stringify(MAP.buildPlanAdjustPrefillParams(deloadAdvice)));

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
