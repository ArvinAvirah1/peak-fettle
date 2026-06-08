/**
 * strength-model-v3.test.js — TICKET-093 verification (pure model).
 * Transpiles the real src/lib/strengthModelV3.ts and checks the memo's
 * acceptance criteria. Plain node: node __tests__/strength-model-v3.test.js
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'commonjs', target: 'es2019' } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, require);
  return mod.exports;
}
const M = load('src/lib/strengthModelV3.ts');

let fail = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fail++; };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a.toFixed(2)} vs ${b} ±${tol})`);

console.log('TICKET-093 strength model v3:');

// 1. DOTS test vectors (memo §4) to ±0.1
near(M.dotsScore(600, 93, 'M'), 381.75, 0.1, 'DOTS M 93kg/600');
near(M.dotsScore(500, 75, 'M'), 358.71, 0.1, 'DOTS M 75kg/500');
near(M.dotsScore(700, 120, 'M'), 402.01, 0.1, 'DOTS M 120kg/700');
near(M.dotsScore(400, 63, 'F'), 430.21, 0.1, 'DOTS F 63kg/400');
near(M.dotsScore(300, 57, 'F'), 343.71, 0.1, 'DOTS F 57kg/300');

// 2. Lognormal fit reproduces memo §5.2 (male SBD)
const sq = M.liftPopParams('squat', 'M');
near(sq.mu, 4.53, 0.03, 'squat M μ'); near(sq.sigma, 0.377, 0.02, 'squat M σ');
const bp = M.liftPopParams('bench', 'M');
near(bp.mu, 4.08, 0.03, 'bench M μ'); near(bp.sigma, 0.374, 0.02, 'bench M σ');
const dl = M.liftPopParams('deadlift', 'M');
near(dl.mu, 4.73, 0.03, 'deadlift M μ'); near(dl.sigma, 0.324, 0.02, 'deadlift M σ');
ok(sq.r2 > 0.9 && bp.r2 > 0.9 && dl.r2 > 0.9, 'fits have R² > 0.9');

// 3. Ranked percentile strictly DECREASES with bodyweight at fixed load (BW-normalized)
const light = M.computeRankedPercentile('squat', 'M', 150, 70);
const heavy = M.computeRankedPercentile('squat', 'M', 150, 95);
ok(light > heavy, `lighter lifter ranks higher at equal load (${light.toFixed(1)} > ${heavy.toFixed(1)})`);
// ...and INCREASES with load at fixed bodyweight
ok(M.computeRankedPercentile('squat', 'M', 100, 80) < M.computeRankedPercentile('squat', 'M', 180, 80), 'ranked increases with load');

// 4. Composite is CALIBRATED (PIT): sample the fitted DOTS population, overall_pct must be ~uniform
function randn() { return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()); }
const { mu, sigma } = M.dotsPopParams('M');
const coef = M.dotsCoefficient(75, 'M');
const N = 300000;
const checkpoints = [25, 50, 75, 90, 95];
const counts = Object.fromEntries(checkpoints.map((p) => [p, 0]));
for (let i = 0; i < N; i++) {
  const dots = Math.exp(mu + sigma * randn());
  const total = dots / coef;            // a lifter whose DOTS total == sampled value
  const r = M.overallStrengthPercentile(total, 0, 0, 75, 'M'); // uses the sum only
  for (const p of checkpoints) if (r.pct <= p) counts[p]++;
}
for (const p of checkpoints) {
  const share = (100 * counts[p]) / N;
  ok(Math.abs(share - p) <= 2, `overall_pct ≤ ${p} covers ~${p}% (got ${share.toFixed(1)}%)`);
}

// 5. Undisclosed = 50/50 mixture, between M and F
const um = M.computeRankedPercentile('bench', 'M', 100, 80);
const uf = M.computeRankedPercentile('bench', 'F', 100, 80);
const ud = M.computeRankedPercentileUndisclosed('bench', 100, 80);
ok(ud >= Math.min(um, uf) - 1e-6 && ud <= Math.max(um, uf) + 1e-6, 'undisclosed mixture lies between M and F');
near(ud, 0.5 * um + 0.5 * uf, 1e-6, 'undisclosed = 0.5·M + 0.5·F');

// 6. Partial total is flagged provisional; full total is not
ok(M.overallStrengthPercentilePartial({ squat: 140, bench: 100 }, 80, 'M').provisional === true, 'partial total marked provisional');
ok(M.overallStrengthPercentile(140, 100, 180, 80, 'M').provisional === false, 'full total not provisional');

// 7. Tier ladder incl. World Class
ok(M.tierForOverall(99.8).name === 'World Class', 'pct 99.8 → World Class');
ok(M.tierForOverall(50).name === 'Bronze', 'pct 50 → Bronze');
ok(M.tierForOverall(10).name === 'Iron', 'pct 10 → Iron');
ok(M.MODEL_VERSION === 3, 'MODEL_VERSION is 3');

console.log(fail === 0 ? '\nALL V3 MODEL TESTS PASS' : `\n${fail} TEST(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
