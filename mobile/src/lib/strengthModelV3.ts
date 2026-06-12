/**
 * strengthModelV3 — TICKET-093 (percentile/ranking model v3)
 *
 * On-device TypeScript port of the v3 strength model defined in
 * strength_model_v3_revision_2026-06-06.md (founder-signed 2026-06-06).
 *
 * Implements the founder's two core decisions:
 *   1. Ranked component is BODYWEIGHT-NORMALIZED (allometric per-lift) — at equal
 *      load the lighter lifter ranks higher (Lens 2a).
 *   2. Overall score is a CALIBRATED COMPOSITE — the percentile of the single DOTS
 *      total, so "top 10%" really means top 10% of same-sex lifters (Lens 2b). The
 *      statistically broken mean-of-percentiles is NOT implemented.
 *
 * All percentiles are computed against the MODEL-CALIBRATED distribution (fit in
 * code from the published standards), never the live user base (D6) — which is
 * exactly why this is portable on-device.
 *
 * D8 (2026-06-12): beginner anchor tightened 20th → 12th percentile.
 *   QUANTILE_MAP updated from [0.20, 0.40, …] to [0.12, 0.40, …].
 *   R² improves +0.02–0.03 across all lifts (residual at bottom anchor eliminated).
 *   See mobile/scripts/deriveStrengthModelV3.py for full derivation.
 *
 * D9 (2026-06-12): 9-band tier ladder.
 *   Stone band added between Iron and Bronze (25–40).
 *   Final bands: Iron ≤25 · Stone 25–40 · Bronze 40–60 · Silver 60–75 ·
 *                Gold 75–88 · Platinum 88–95 · Diamond 95–99 ·
 *                Elite 99–99.7 · World Class ≥99.7
 *
 * PROVENANCE — output of mobile/scripts/deriveStrengthModelV3.py
 * (run: python3 mobile/scripts/deriveStrengthModelV3.py)
 *
 *   QUANTILE_MAP = [0.12, 0.40, 0.60, 0.85, 0.97, 0.995]  // D8: beg=12th (was 20th)
 *   Reference BW: M=75 kg, F=60 kg
 *
 *   Per-lift lognormal params (pop_mu, pop_sigma) — old → new:
 *   squat M:    mu 4.53336→4.56744  sigma 0.37704→0.35879  R² 0.94549→0.97441  median 96.30 kg (1.284×BW)
 *   squat F:    mu 3.91103→3.94454  sigma 0.37371→0.35599  R² 0.93942→0.97017  median 51.65 kg (0.861×BW)
 *   bench M:    mu 4.08430→4.11910  sigma 0.37409→0.35462  R² 0.95789→0.97961  median 61.50 kg (0.820×BW)
 *   bench F:    mu 3.45035→3.48788  sigma 0.41635→0.39633  R² 0.93509→0.96435  median 32.72 kg (0.545×BW)
 *   deadlift M: mu 4.72765→4.75745  sigma 0.32362→0.30719  R² 0.95888→0.98333  median 116.45 kg (1.553×BW)
 *   deadlift F: mu 4.12373→4.15640  sigma 0.35690→0.33906  R² 0.95013→0.97591  median  63.84 kg (1.064×BW)
 *   ohp M:      mu 3.76158→3.79352  sigma 0.33091→0.31207  R² 0.98495→0.99699  median  44.41 kg (0.592×BW)
 *   ohp F:      mu 3.01112→3.05218  sigma 0.43806→0.41483  R² 0.95357→0.97317  median  21.16 kg (0.353×BW)
 *
 *   DOTS composite (SBD total at ref BW):
 *   DOTS M: mu_D=5.28260  sigma_D=0.33623  R²=0.98124  median_DOTS=196.88
 *   DOTS F: mu_D=5.10233  sigma_D=0.35770  R²=0.97265  median_DOTS=164.40
 *
 * Verifiable in-sandbox: DOTS test vectors, the lognormal fit reproducing the
 * memo's male SBD params, BW-monotonicity of the ranked lens, and the composite's
 * uniform calibration (PIT). See __tests__/strength-model-v3.test.js.
 *
 * Remaining (Lens 1 experience-adjusted revisions — heteroscedastic σ(years),
 * McCulloch/Foster age, per-lift α fit) build on the v2 module and are tracked
 * separately; this file delivers the ranked + composite tiers (the founder change).
 */

export const MODEL_VERSION = 3;

export type Sex = 'M' | 'F';
export type LiftId = 'squat' | 'bench' | 'deadlift' | 'ohp';

// ---------------------------------------------------------------------------
// Normal CDF (Φ) and inverse CDF (Φ⁻¹)
// ---------------------------------------------------------------------------

/** erf via Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Inverse normal CDF — Acklam's rational approximation (|error| < 1.2e-9). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
}

// ---------------------------------------------------------------------------
// DOTS (memo §4) — aggregate-total currency
// ---------------------------------------------------------------------------

const DOTS_COEF: Record<Sex, { A: number; B: number; C: number; D: number; E: number }> = {
  M: { A: -307.75076, B: 24.0900756, C: -0.1918759221, D: 0.0007391293, E: -0.0000010930 },
  F: { A: -57.96288, B: 13.6175032, C: -0.1126655495, D: 0.0005158568, E: -0.0000010706659 },
};

/** DOTS multiplier 500/poly(BW). DOTS = total · this. */
export function dotsCoefficient(bwKg: number, sex: Sex): number {
  const k = DOTS_COEF[sex];
  const denom = k.A + k.B * bwKg + k.C * bwKg ** 2 + k.D * bwKg ** 3 + k.E * bwKg ** 4;
  return 500 / denom;
}

export function dotsScore(totalKg: number, bwKg: number, sex: Sex): number {
  return totalKg * dotsCoefficient(bwKg, sex);
}

// ---------------------------------------------------------------------------
// Standards (×BW) at reference bodyweight — strength_curve_model.md §5 +
// memo §5.1 World Class anchor. Order: beg, nov, int, adv, elite, world-class.
// ---------------------------------------------------------------------------

/**
 * Quantile map (D8, 2026-06-12): beginner anchor tightened 20th → 12th percentile.
 * q = [beg=12th, nov=40th, int=60th, adv=85th, elite=97th, wc=99.5th]
 * See PROVENANCE comment at top for old→new constant table and R² improvement.
 */
export const QUANTILE_MAP = [0.12, 0.4, 0.6, 0.85, 0.97, 0.995]; // D8: beg=12th (was 0.20)
const REF_BW: Record<Sex, number> = { M: 75, F: 60 };

const STANDARDS_XBW: Record<LiftId, Record<Sex, number[]>> = {
  squat:    { M: [0.75, 1.25, 1.5, 2.0, 2.5, 3.0],    F: [0.5, 0.85, 1.0, 1.35, 1.65, 2.0] },
  bench:    { M: [0.5,  0.75, 1.0, 1.25, 1.5, 2.0],   F: [0.3, 0.5,  0.7, 0.9,  1.1,  1.4] },
  deadlift: { M: [1.0,  1.5,  1.75, 2.25, 2.75, 3.25], F: [0.65, 1.0, 1.25, 1.65, 1.95, 2.4] },
  ohp:      { M: [0.4,  0.55, 0.65, 0.85, 1.05, 1.3],  F: [0.2, 0.3,  0.45, 0.6,  0.75, 0.95] },
};

const ALPHA_DEFAULT = 0.667; // per-lift α default (memo §3 Lens 1 fix; [0.62,0.72])

// ---------------------------------------------------------------------------
// Least-squares lognormal fit (memo §5.3): ln(L) = μ + σ·Φ⁻¹(q)
// ---------------------------------------------------------------------------

export interface LognormalFit { mu: number; sigma: number; r2: number; }

export function fitLognormal(loads: number[], quantiles: number[] = QUANTILE_MAP): LognormalFit {
  const n = Math.min(loads.length, quantiles.length);
  const y: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < n; i++) {
    y.push(Math.log(loads[i]!));
    z.push(normInv(quantiles[i]!));
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const zbar = mean(z);
  const ybar = mean(y);
  let szy = 0, szz = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    szy += (z[i]! - zbar) * (y[i]! - ybar);
    szz += (z[i]! - zbar) ** 2;
    sst += (y[i]! - ybar) ** 2;
  }
  const sigma = szy / szz;
  const mu = ybar - sigma * zbar;
  // R²
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const pred = mu + sigma * z[i]!;
    ssr += (y[i]! - pred) ** 2;
  }
  const r2 = sst > 0 ? 1 - ssr / sst : 1;
  return { mu, sigma, r2 };
}

// Memoized per-lift population params (calibrated at reference BW).
const _liftCache = new Map<string, LognormalFit>();
export function liftPopParams(lift: LiftId, sex: Sex): LognormalFit {
  const key = `${lift}:${sex}`;
  const cached = _liftCache.get(key);
  if (cached) return cached;
  const loads = STANDARDS_XBW[lift][sex].map((m) => m * REF_BW[sex]);
  const fit = fitLognormal(loads);
  _liftCache.set(key, fit);
  return fit;
}

// Memoized DOTS-total composite params per sex.
const _dotsCache = new Map<Sex, LognormalFit>();
export function dotsPopParams(sex: Sex): LognormalFit {
  const cached = _dotsCache.get(sex);
  if (cached) return cached;
  const bw0 = REF_BW[sex];
  const dotsByStandard = QUANTILE_MAP.map((_, i) => {
    const total =
      (STANDARDS_XBW.squat[sex][i]! + STANDARDS_XBW.bench[sex][i]! + STANDARDS_XBW.deadlift[sex][i]!) * bw0;
    return dotsScore(total, bw0, sex);
  });
  const fit = fitLognormal(dotsByStandard);
  _dotsCache.set(sex, fit);
  return fit;
}

// ---------------------------------------------------------------------------
// Lens 2a — ranked per-lift percentile (allometric, bodyweight-normalized)
// ---------------------------------------------------------------------------

export function computeRankedPercentile(
  lift: LiftId,
  sex: Sex,
  e1rmKg: number,
  bwKg: number,
  alpha: number = ALPHA_DEFAULT,
): number {
  if (e1rmKg <= 0 || bwKg <= 0) return 0;
  const { mu, sigma } = liftPopParams(lift, sex);
  const expected = mu + alpha * Math.log(bwKg / REF_BW[sex]);
  const z = (Math.log(e1rmKg) - expected) / sigma;
  return clampPct(100 * normCdf(z));
}

/** Undisclosed sex — 50/50 mixture of the male and female distributions (D5). */
export function computeRankedPercentileUndisclosed(lift: LiftId, e1rmKg: number, bwKg: number): number {
  const m = computeRankedPercentile(lift, 'M', e1rmKg, bwKg);
  const f = computeRankedPercentile(lift, 'F', e1rmKg, bwKg);
  return clampPct(0.5 * m + 0.5 * f);
}

// ---------------------------------------------------------------------------
// Lens 2b — overall composite (calibrated tier) via DOTS total
// ---------------------------------------------------------------------------

export interface OverallResult { pct: number; provisional: boolean; dots: number; }

export function overallStrengthPercentile(
  squatE1rm: number,
  benchE1rm: number,
  deadliftE1rm: number,
  bwKg: number,
  sex: Sex,
): OverallResult {
  const total = squatE1rm + benchE1rm + deadliftE1rm;
  const dots = dotsScore(total, bwKg, sex);
  const { mu, sigma } = dotsPopParams(sex);
  const pct = clampPct(100 * normCdf((Math.log(dots) - mu) / sigma));
  return { pct, provisional: false, dots };
}

/**
 * Partial total (D4): when squat/bench/deadlift aren't all present, fit the
 * provisional distribution on the subset the user has and mark it provisional.
 */
export function overallStrengthPercentilePartial(
  lifts: Partial<Record<'squat' | 'bench' | 'deadlift', number>>,
  bwKg: number,
  sex: Sex,
): OverallResult | null {
  const present = (['squat', 'bench', 'deadlift'] as const).filter((l) => (lifts[l] ?? 0) > 0);
  if (present.length === 0) return null;
  if (present.length === 3) {
    return overallStrengthPercentile(lifts.squat!, lifts.bench!, lifts.deadlift!, bwKg, sex);
  }
  // Fit a subset DOTS distribution from the standards for just the present lifts.
  const bw0 = REF_BW[sex];
  const subsetDots = QUANTILE_MAP.map((_, i) => {
    const subtotal = present.reduce((s, l) => s + STANDARDS_XBW[l][sex][i]! * bw0, 0);
    return dotsScore(subtotal, bw0, sex);
  });
  const { mu, sigma } = fitLognormal(subsetDots);
  const userSubtotal = present.reduce((s, l) => s + (lifts[l] ?? 0), 0);
  const dots = dotsScore(userSubtotal, bwKg, sex);
  const pct = clampPct(100 * normCdf((Math.log(dots) - mu) / sigma));
  return { pct, provisional: true, dots };
}

// ---------------------------------------------------------------------------
// Tier ladder on the calibrated overall percentile (D9, 2026-06-12)
//
// 9-band ladder (population shares on overall_pct):
//   Iron ≤25 · Stone 25–40 · Bronze 40–60 · Silver 60–75 · Gold 75–88 ·
//   Platinum 88–95 · Diamond 95–99 · Elite 99–99.7 · World Class ≥99.7
//
// Stone added between Iron and Bronze so newbie-gains arc (~15th→45th pct
// in months) yields 2–3 promotions in the first half-year (D9 rationale).
// ---------------------------------------------------------------------------

export interface Tier {
  name: string;
  /** Lower bound (inclusive) of overall_pct for this tier. */
  min: number;
}

/** 9-band ladder ordered from lowest to highest (D9, 2026-06-12). */
export const TIER_LADDER: Tier[] = [
  { name: 'Iron',        min: 0 },
  { name: 'Stone',       min: 25 },   // D9: new band between Iron and Bronze
  { name: 'Bronze',      min: 40 },
  { name: 'Silver',      min: 60 },
  { name: 'Gold',        min: 75 },
  { name: 'Platinum',    min: 88 },
  { name: 'Diamond',     min: 95 },
  { name: 'Elite',       min: 99 },
  { name: 'World Class', min: 99.7 },
];

export function tierForOverall(pct: number): Tier {
  let out = TIER_LADDER[0]!;
  for (const t of TIER_LADDER) if (pct >= t.min) out = t;
  return out;
}

// ---------------------------------------------------------------------------
function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}
