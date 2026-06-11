/**
 * training-tools.test.js — plateMath / warmup / oneRm verification.
 * Plain node: node __tests__/training-tools.test.js
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const cache = {};
function load(rel) {
  if (cache[rel]) return cache[rel];
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2019' } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, (name) => {
    if (name === './plateMath') return load('src/lib/plateMath.ts');
    return require(name);
  });
  cache[rel] = mod.exports;
  return mod.exports;
}

const P = load('src/lib/plateMath.ts');
const W = load('src/lib/warmup.ts');
const R = load('src/lib/oneRm.ts');

let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ok ' : '  FAIL ') + msg); if (!c) fail++; };
const eq = (a, b, msg) => ok(Math.abs(a - b) < 1e-9, `${msg} (${a} vs ${b})`);

console.log('plateMath:');
// 100kg on a 20kg bar = 40/side = 25+15
let b = P.plateBreakdown(100, 20, P.KG_PLATES);
eq(b.achievedTotal, 100, '100kg achievable exactly');
ok(b.perSide.length === 2 && b.perSide[0].plate === 25 && b.perSide[1].plate === 15, '100kg = 25+15 per side');
eq(b.residual, 0, '100kg residual 0');
// 102kg → 41/side: greedy loads 25+15=40/side (1 left, no 1.25 fits) → achieved 100, residual 2
b = P.plateBreakdown(102, 20, P.KG_PLATES);
eq(b.achievedTotal, 100, '102kg → closest loadable below = 100');
eq(b.residual, 2, '102kg residual 2');
b = P.plateBreakdown(60, 20, P.KG_PLATES);
ok(b.perSide.length === 1 && b.perSide[0].plate === 20 && b.perSide[0].count === 1, '60kg = one 20 per side');
// below bar
b = P.plateBreakdown(15, 20, P.KG_PLATES);
ok(b.belowBar === true, '15kg target below 20kg bar flagged');
// pulley
eq(P.effectiveLoad(80, 0.5), 40, '2:1 pulley: 80 stack feels 40');
eq(P.effectiveLoad(40, 2), 80, '1:2 pulley: 40 stack feels 80');
eq(P.pulleyById('2:1').factor, 0.5, 'pulleyById 2:1');
eq(P.pulleyById(null).factor, 1, 'pulleyById default 1:1');
eq(P.roundToIncrement(61.3, 2.5), 62.5, 'round 61.3 → 62.5');
eq(P.roundToIncrement(61.2, 2.5), 60, 'round 61.2 → 60');

console.log('warmup:');
let w = W.computeWarmupPlan(100, 3);
ok(w.length === 3, '3-set plan has 3 sets');
eq(w[0].weight, 40, '40% of 100 = 40');
eq(w[1].weight, 60, '60% of 100 = 60');
eq(w[2].weight, 80, '80% of 100 = 80');
ok(w[0].reps === 8 && w[1].reps === 5 && w[2].reps === 3, '3-set reps 8/5/3');
w = W.computeWarmupPlan(102.5, 3);
eq(w[2].weight, 82.5, '80% of 102.5 rounds to 82.5');
w = W.computeWarmupPlan(null, 3);
ok(w.length === 0, 'no history → empty plan');
w = W.computeWarmupPlan(100, 1);
ok(w.length === 1 && w[0].weight === 60 && w[0].reps === 5, '1-set plan 60%×5');
w = W.computeWarmupPlan(100, 9);
ok(w.length === 4, 'clamped to max 4 sets');

console.log('oneRm:');
eq(R.epley1Rm(100, 1), 100, 'epley 1 rep = weight');
eq(R.epley1Rm(100, 10), 100 * (1 + 10 / 30), 'epley 100×10');
eq(R.brzycki1Rm(100, 10), (100 * 36) / 27, 'brzycki 100×10');
eq(R.weightForReps(R.epley1Rm(100, 10), 10), 100, 'epley inverse round-trips');
eq(R.weightForReps(R.brzycki1Rm(100, 10), 10, 'brzycki'), 100, 'brzycki inverse round-trips');
ok(R.brzycki1Rm(100, 40) === 0, 'brzycki out of domain → 0');

console.log(fail === 0 ? 'ALL PASS' : `${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
