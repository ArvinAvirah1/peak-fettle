/**
 * strength-model-v3.test.js — TICKET-093 verification (pure model).
 * Transpiles the real src/lib/strengthModelV3.ts and checks the memo's
 * acceptance criteria. Plain node: node __tests__/strength-model-v3.test.js
 *
 * Updated for D8 (beginner anchor 20th→12th) and D9 (9-band ladder):
 *   - §5.2 target constants updated to new fits
 *   - Band boundary tests cover all 9 tiers
 *   - Fit-sanity test: male squat implied median within ±3 kg of derivation
 *   - Monotonicity test: percentile strictly increases with load at fixed BW
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
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (${a.toFixed(4)} vs ${b} ±${tol})`);

console.log('TICKET-093 strength model v3 (D8+D9):');

// ── 1. DOTS test vectors (memo §4) to ±0.1 ──────────────────────────────────
console.log('\n  -- DOTS test vectors --');
near(M.dotsScore(600, 93, 'M'), 381.75, 0.1, 'DOTS M 93kg/600');
near(M.dotsScore(500, 75, 'M'), 358.71, 0.1, 'DOTS M 75kg/500');
near(M.dotsScore(700, 120, 'M'), 402.01, 0.1, 'DOTS M 120kg/700');
near(M.dotsScore(400, 63, 'F'), 430.21, 0.1, 'DOTS F 63kg/400');
near(M.dotsScore(300, 57, 'F'), 343.71, 0.1, 'DOTS F 57kg/300');

// ── 2. Lognormal fit reproduces D8 constants (from deriveStrengthModelV3.py) ─
// QUANTILE_MAP = [0.12, 0.40, 0.60, 0.85, 0.97, 0.995]  (was [0.20,...])
// Targets (mu, sigma) from derivation script:
//   squat M:    mu=4.56744  sigma=0.35879
//   bench M:    mu=4.11910  sigma=0.35462
//   deadlift M: mu=4.75745  sigma=0.30719
console.log('\n  -- Lognormal fit constants (D8: beg=12th, was 20th) --');
const sq = M.liftPopParams('squat', 'M');
near(sq.mu, 4.567, 0.003, 'squat M mu (D8)');
near(sq.sigma, 0.359, 0.003, 'squat M sigma (D8)');
const bp = M.liftPopParams('bench', 'M');
near(bp.mu, 4.119, 0.003, 'bench M mu (D8)');
near(bp.sigma, 0.355, 0.003, 'bench M sigma (D8)');
const dl = M.liftPopParams('deadlift', 'M');
near(dl.mu, 4.757, 0.003, 'deadlift M mu (D8)');
near(dl.sigma, 0.307, 0.003, 'deadlift M sigma (D8)');
ok(sq.r2 > 0.96 && bp.r2 > 0.96 && dl.r2 > 0.96, `fits have R2 > 0.96 (sq=${sq.r2.toFixed(4)} bp=${bp.r2.toFixed(4)} dl=${dl.r2.toFixed(4)})`);

// ── 2b. Fit sanity: male squat implied median ≈ 96.3 kg (derivation output) ─
console.log('\n  -- Fit sanity: male squat implied median --');
const sqMedian = Math.exp(sq.mu);
// Derivation script output: 96.297 kg
near(sqMedian, 96.3, 3.0, 'male squat implied median within ±3 kg of derivation (96.3 kg)');

// ── 3. BW-monotonicity of ranked percentile ───────────────────────────────
console.log('\n  -- BW-monotonicity --');
const light = M.computeRankedPercentile('squat', 'M', 150, 70);
const heavy = M.computeRankedPercentile('squat', 'M', 150, 95);
ok(light > heavy, `lighter lifter ranks higher at equal load (${light.toFixed(1)} > ${heavy.toFixed(1)})`);
// Strict monotonicity in load at fixed BW (multiple steps)
const loads = [60, 80, 100, 120, 150, 180, 220];
let mono = true;
for (let i = 1; i < loads.length; i++) {
  const lo = M.computeRankedPercentile('squat', 'M', loads[i-1], 80);
  const hi = M.computeRankedPercentile('squat', 'M', loads[i], 80);
  if (hi <= lo) { mono = false; break; }
}
ok(mono, 'ranked percentile strictly increases with load at fixed BW (7 steps)');

// ── 4. Composite calibration (PIT) ────────────────────────────────────────
console.log('\n  -- Composite calibration (PIT) --');
function randn() { return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()); }
const { mu, sigma } = M.dotsPopParams('M');
const coef = M.dotsCoefficient(75, 'M');
const N = 300000;
const checkpoints = [25, 50, 75, 90, 95];
const counts = Object.fromEntries(checkpoints.map((p) => [p, 0]));
for (let i = 0; i < N; i++) {
  const dots = Math.exp(mu + sigma * randn());
  const total = dots / coef;
  const r = M.overallStrengthPercentile(total, 0, 0, 75, 'M');
  for (const p of checkpoints) if (r.pct <= p) counts[p]++;
}
for (const p of checkpoints) {
  const share = (100 * counts[p]) / N;
  ok(Math.abs(share - p) <= 2, `overall_pct <= ${p} covers ~${p}% (got ${share.toFixed(1)}%)`);
}

// ── 5. Undisclosed sex — 50/50 mixture ────────────────────────────────────
console.log('\n  -- Undisclosed sex mixture --');
const um = M.computeRankedPercentile('bench', 'M', 100, 80);
const uf = M.computeRankedPercentile('bench', 'F', 100, 80);
const ud = M.computeRankedPercentileUndisclosed('bench', 100, 80);
ok(ud >= Math.min(um, uf) - 1e-6 && ud <= Math.max(um, uf) + 1e-6, 'undisclosed mixture lies between M and F');
near(ud, 0.5 * um + 0.5 * uf, 1e-6, 'undisclosed = 0.5*M + 0.5*F');

// ── 6. Provisional flag ────────────────────────────────────────────────────
console.log('\n  -- Provisional flag --');
ok(M.overallStrengthPercentilePartial({ squat: 140, bench: 100 }, 80, 'M').provisional === true, 'partial total marked provisional');
ok(M.overallStrengthPercentile(140, 100, 180, 80, 'M').provisional === false, 'full total not provisional');

// ── 7. 9-band tier ladder boundary tests (D9) ─────────────────────────────
console.log('\n  -- Tier ladder (D9: 9 bands) --');
ok(M.TIER_LADDER.length === 9, 'TIER_LADDER has 9 entries');

// Band boundaries — each cutoff value
ok(M.tierForOverall(0).name === 'Iron',        'pct 0 -> Iron');
ok(M.tierForOverall(24.9).name === 'Iron',     'pct 24.9 -> Iron');
ok(M.tierForOverall(25.0).name === 'Stone',    'pct 25.0 -> Stone (D9 new band)');
ok(M.tierForOverall(25.1).name === 'Stone',    'pct 25.1 -> Stone');
ok(M.tierForOverall(39.9).name === 'Stone',    'pct 39.9 -> Stone');
ok(M.tierForOverall(40.0).name === 'Bronze',   'pct 40.0 -> Bronze');
ok(M.tierForOverall(50.0).name === 'Bronze',   'pct 50.0 -> Bronze');
ok(M.tierForOverall(60.0).name === 'Silver',   'pct 60.0 -> Silver');
ok(M.tierForOverall(75.0).name === 'Gold',     'pct 75.0 -> Gold');
ok(M.tierForOverall(88.0).name === 'Platinum', 'pct 88.0 -> Platinum');
ok(M.tierForOverall(95.0).name === 'Diamond',  'pct 95.0 -> Diamond');
ok(M.tierForOverall(99.0).name === 'Elite',    'pct 99.0 -> Elite');
ok(M.tierForOverall(99.7).name === 'World Class', 'pct 99.7 -> World Class');
ok(M.tierForOverall(99.8).name === 'World Class', 'pct 99.8 -> World Class');
ok(M.tierForOverall(100).name === 'World Class',  'pct 100 -> World Class');

// ── 8. QUANTILE_MAP constant ───────────────────────────────────────────────
console.log('\n  -- QUANTILE_MAP constant (D8) --');
ok(Array.isArray(M.QUANTILE_MAP), 'QUANTILE_MAP is exported');
ok(M.QUANTILE_MAP.length === 6, 'QUANTILE_MAP has 6 entries');
near(M.QUANTILE_MAP[0], 0.12, 1e-9, 'QUANTILE_MAP[0] = 0.12 (beginner=12th, D8)');
near(M.QUANTILE_MAP[5], 0.995, 1e-9, 'QUANTILE_MAP[5] = 0.995 (world-class)');

// ── 9. MODEL_VERSION ──────────────────────────────────────────────────────
ok(M.MODEL_VERSION === 3, 'MODEL_VERSION is 3');

// ── 10. Per-lift α (Agent N) ──────────────────────────────────────────────
console.log('\n  -- Per-lift α (Agent N) --');
ok(typeof M.ALPHA_PER_LIFT === 'object' && M.ALPHA_PER_LIFT !== null, 'ALPHA_PER_LIFT exported');
for (const lift of ['squat', 'bench', 'deadlift', 'ohp']) {
  const alpha = M.ALPHA_PER_LIFT[lift];
  ok(alpha >= 0.62 && alpha <= 0.72, `${lift} α=${alpha} within [0.62,0.72]`);
}
// squat and deadlift should be higher than bench and ohp (biomechanical prior)
ok(M.ALPHA_PER_LIFT.squat > M.ALPHA_PER_LIFT.bench, 'squat α > bench α');
ok(M.ALPHA_PER_LIFT.deadlift > M.ALPHA_PER_LIFT.ohp, 'deadlift α > ohp α');
// Ranked percentile uses per-lift α by default (different from global 0.667 for bench)
const rBenchGlobal = M.computeRankedPercentile('bench', 'M', 100, 80, 0.667);
const rBenchPerLift = M.computeRankedPercentile('bench', 'M', 100, 80);
ok(rBenchGlobal !== rBenchPerLift, 'bench ranked percentile differs when using per-lift α vs global 0.667');

// ── 11. Heteroscedastic σ (Agent N) ──────────────────────────────────────
console.log('\n  -- Heteroscedastic σ (Agent N) --');
ok(typeof M.heteroscedasticSigma === 'function', 'heteroscedasticSigma exported');
ok(M.SIGMA_NOV === 0.20, 'SIGMA_NOV = 0.20');
ok(M.TAU_SIGMA === 4, 'TAU_SIGMA = 4 yr');
// σ is monotonically non-decreasing with training years
const { sigma: popSigSq } = M.liftPopParams('squat', 'M');
const s0 = M.heteroscedasticSigma(popSigSq, 0);
const s2 = M.heteroscedasticSigma(popSigSq, 2);
const s6 = M.heteroscedasticSigma(popSigSq, 6);
const sInf = M.heteroscedasticSigma(popSigSq, 100);
ok(s0 <= s2 && s2 <= s6 && s6 <= sInf, `σ monotone: ${s0.toFixed(3)} ≤ ${s2.toFixed(3)} ≤ ${s6.toFixed(3)} ≤ ${sInf.toFixed(3)}`);
// At t=0: σ = σ_nov
near(s0, M.SIGMA_NOV, 1e-9, 'σ(0) = σ_nov');
// As t→∞: σ → pop_sigma (within 1%)
near(sInf, popSigSq, 0.01 * popSigSq, 'σ(100yr) ≈ pop_sigma (within 1%)');
// Null training years: falls back to pop_sigma
near(M.heteroscedasticSigma(popSigSq, null), popSigSq, 1e-9, 'heteroscedasticSigma(null) = pop_sigma');

// ── 12. Age multiplier (Agent N) ──────────────────────────────────────────
console.log('\n  -- Age multiplier (Agent N) --');
ok(typeof M.ageMultiplier === 'function', 'ageMultiplier exported');
ok(typeof M.AGE_MULT === 'object' && M.AGE_MULT !== null, 'AGE_MULT exported');
near(M.ageMultiplier('25-34'), 1.0, 1e-9, 'prime age (25-34) mult = 1.0');
ok(M.ageMultiplier('55+') < 1.0, '55+ mult < 1.0 (masters deficit)');
ok(M.ageMultiplier('under-18') < 1.0, 'under-18 mult < 1.0 (youth developing)');
ok(M.ageMultiplier(null) === 1.0, 'null age_band → mult = 1.0 (OFF)');
ok(M.ageMultiplier(undefined) === 1.0, 'undefined age_band → mult = 1.0 (OFF)');
ok(M.ageMultiplier('unknown-band') === 1.0, 'unknown band → mult = 1.0');
// Masters correction boosts effective percentile
const rawPct = M.computePercentile('squat', 'M', 100, 80, 'intermediate', '25-34');
const mastersPct = M.computePercentile('squat', 'M', 100, 80, 'intermediate', '55+');
ok(mastersPct > rawPct, `55+ age adjustment boosts percentile (${mastersPct.toFixed(1)} > ${rawPct.toFixed(1)})`);

// ── 13. computePercentile (Lens 1) (Agent N) ──────────────────────────────
console.log('\n  -- computePercentile / Lens 1 (Agent N) --');
ok(typeof M.computePercentile === 'function', 'computePercentile exported');
// Returns 0 for invalid inputs
ok(M.computePercentile('squat', 'M', 0, 80, 'intermediate', '25-34') === 0, 'e1rm=0 → 0');
ok(M.computePercentile('squat', 'M', 100, 0, 'intermediate', '25-34') === 0, 'bw=0 → 0');
// Age OFF when null → same as prime-age
near(
  M.computePercentile('deadlift', 'M', 150, 75, 'advanced', null),
  M.computePercentile('deadlift', 'M', 150, 75, 'advanced', '25-34'),
  1e-6, 'null age = 25-34 (prime reference)'
);
// Higher experience level → wider σ → different percentile distribution
const pBeg = M.computePercentile('bench', 'M', 80, 75, 'beginner', '25-34');
const pAdv = M.computePercentile('bench', 'M', 80, 75, 'advanced', '25-34');
// At the same load, higher experience widens σ → centile moves toward 50
ok(typeof pBeg === 'number' && typeof pAdv === 'number' && pBeg >= 0 && pAdv >= 0,
   `Lens 1 returns valid percentiles: beginner=${pBeg.toFixed(1)} advanced=${pAdv.toFixed(1)}`);
// Load monotonicity: higher load → higher percentile
const p_lo = M.computePercentile('squat', 'M', 80, 80, 'intermediate', '25-34');
const p_hi = M.computePercentile('squat', 'M', 120, 80, 'intermediate', '25-34');
ok(p_hi > p_lo, `Lens 1 monotone in load: ${p_lo.toFixed(1)} < ${p_hi.toFixed(1)}`);

console.log(fail === 0 ? '\nALL V3 MODEL TESTS PASS' : `\n${fail} TEST(S) FAILED`);
process.exit(fail === 0 ? 0 : 1);
