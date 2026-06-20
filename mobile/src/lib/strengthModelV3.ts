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
 * Agent N additions (2026-06-12, SPEC-094A):
 *   (1) Per-lift α — biomechanical priors from Jaric 2002, bounded [0.62,0.72];
 *       to be re-fit on first-party OPL data when cohorts are large.
 *       squat=0.670  bench=0.643  deadlift=0.671  ohp=0.640
 *   (2) Heteroscedastic σ(t) = σ_nov+(σ_adv−σ_nov)·(1−e^{−t/τ_σ})
 *       σ_nov=0.20  τ_σ=4yr  σ_adv=pop_sigma (lift×sex fitted value above).
 *       Falls back to pop_sigma when training_years is unknown.
 *   (3) Age adjustment (McCulloch/Foster-style): multiplicative on user e1RM
 *       before percentile lookup; OFF when age_band is null.
 *       Multipliers (divide user load to normalise to prime-age cohort):
 *       under-18=0.96  18-24=0.98  25-34=1.00  35-44=0.97  45-54=0.93  55+=0.86
 *   All three feed computePercentile (Lens 1, experience-adjusted).
 */

export const MODEL_VERSION = 3;

export type Sex = 'M' | 'F';
export type LiftId = 'squat' | 'bench' | 'deadlift' | 'ohp';

/**
 * Robustness (SRV-FIX-SEX-DOTS, 2026-06-19): a value supplied for `sex` may be
 * undisclosed/unknown/garbage at runtime (the profile field is nullable and the
 * server has historically sent free-text). The sex-keyed tables (DOTS_COEF,
 * REF_BW, STANDARDS_XBW) would throw a TypeError on an unrecognised key. Every
 * percentile/score entry point therefore widens its `sex` parameter to this
 * loose type and, when the value is not a recognised 'M'/'F', returns the MEAN
 * of the male and female results — the same 50/50-mixture policy the existing
 * undisclosed-sex handler already used (D5). No entry point may throw on an
 * unknown sex.
 */
export type SexInput = Sex | string | null | undefined;

/** True only for the two recognised, table-keyed sex values. */
export function isKnownSex(sex: SexInput): sex is Sex {
  return sex === 'M' || sex === 'F';
}

/**
 * Sentinel returned by dotsScore when the DOTS multiplier is non-positive or
 * non-finite (extreme-but-finite bodyweight can drive the quartic polynomial
 * ≤ 0). Callers MUST treat a non-finite DOTS as "no estimate" and fall back to
 * their own provisional/no-estimate sentinel — NOT feed it into Math.log, which
 * would yield NaN that clampPct silently masks as a confident 0th percentile.
 */

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

export function dotsScore(totalKg: number, bwKg: number, sex: SexInput): number {
  // Unknown/undisclosed sex → mean of the male and female DOTS scores.
  if (!isKnownSex(sex)) {
    const m = dotsScore(totalKg, bwKg, 'M');
    const f = dotsScore(totalKg, bwKg, 'F');
    // Propagate the no-estimate sentinel if either branch is unusable.
    if (!Number.isFinite(m) || !Number.isFinite(f)) return NaN;
    return 0.5 * m + 0.5 * f;
  }
  const dots = totalKg * dotsCoefficient(bwKg, sex);
  // DOTS poly guard: for extreme-but-finite bodyweights the quartic denominator
  // can go ≤ 0 (or non-finite), making dots ≤ 0. A later Math.log(dots) would be
  // NaN and clampPct would mask it as a confident 0th percentile. Return NaN as
  // the "no estimate" sentinel (mirrors the bwKg <= 0 guard in the overall lens)
  // so callers degrade to provisional/no-estimate instead of a false 0th.
  if (!(dots > 0) || !Number.isFinite(dots)) return NaN;
  return dots;
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

const ALPHA_DEFAULT = 0.667; // fallback when lift not in ALPHA_PER_LIFT

/**
 * Per-lift allometric exponents α — Jaric 2002 empirical range [0.64–0.71] for
 * compound lifts; press-pattern lifts (bench, ohp) sit at the low end of the range
 * since upper-extremity strength scales less steeply with body mass than lower-body.
 * Bounded to [0.62, 0.72] per spec. To be re-fit on first-party OPL data (v4).
 */
export const ALPHA_PER_LIFT: Record<LiftId, number> = {
  squat:    0.670,
  bench:    0.643,
  deadlift: 0.671,
  ohp:      0.640,
};

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
  sex: SexInput,
  e1rmKg: number,
  bwKg: number,
  alpha: number = ALPHA_PER_LIFT[lift] ?? ALPHA_DEFAULT,
): number {
  if (e1rmKg <= 0 || bwKg <= 0) return 0;
  // Unknown/undisclosed sex → mean of the male and female ranked percentiles
  // (same 50/50 mixture as computeRankedPercentileUndisclosed; never throws).
  if (!isKnownSex(sex)) {
    const m = computeRankedPercentile(lift, 'M', e1rmKg, bwKg, alpha);
    const f = computeRankedPercentile(lift, 'F', e1rmKg, bwKg, alpha);
    return clampPct(0.5 * m + 0.5 * f);
  }
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
  sex: SexInput,
): OverallResult {
  const total = squatE1rm + benchE1rm + deadliftE1rm;
  // LIB-01: guard a missing/zero/non-finite bodyweight (or a non-positive total).
  // Without it, dotsScore drives the DOTS denominator negative, so dots < 0 and
  // Math.log(dots) is NaN, which clampPct silently reports as the 0th percentile.
  // Return the same no-estimate result the sibling lenses use for bwKg <= 0
  // (computeRankedPercentile / computePercentile both return 0). Callers read
  // .pct / .provisional off this object, so it must stay non-null.
  if (!(total > 0) || !(bwKg > 0) || !Number.isFinite(bwKg)) {
    return { pct: 0, provisional: false, dots: 0 };
  }
  // Unknown/undisclosed sex → mean of the male and female overall results.
  if (!isKnownSex(sex)) {
    const m = overallStrengthPercentile(squatE1rm, benchE1rm, deadliftE1rm, bwKg, 'M');
    const f = overallStrengthPercentile(squatE1rm, benchE1rm, deadliftE1rm, bwKg, 'F');
    const dots = sanitizeDots(0.5 * m.dots + 0.5 * f.dots);
    return { pct: clampPct(0.5 * m.pct + 0.5 * f.pct), provisional: m.provisional || f.provisional, dots };
  }
  const dots = dotsScore(total, bwKg, sex);
  // dotsScore returns NaN when its polynomial guard trips (extreme BW). Degrade
  // to the no-estimate result rather than logging NaN into a false 0th percentile.
  if (!Number.isFinite(dots)) {
    return { pct: 0, provisional: false, dots: 0 };
  }
  const { mu, sigma } = dotsPopParams(sex);
  const pct = clampPct(100 * normCdf((Math.log(dots) - mu) / sigma));
  return { pct, provisional: false, dots: sanitizeDots(dots) };
}

/**
 * Partial total (D4): when squat/bench/deadlift aren't all present, fit the
 * provisional distribution on the subset the user has and mark it provisional.
 */
export function overallStrengthPercentilePartial(
  lifts: Partial<Record<'squat' | 'bench' | 'deadlift', number>>,
  bwKg: number,
  sex: SexInput,
): OverallResult | null {
  const present = (['squat', 'bench', 'deadlift'] as const).filter((l) => (lifts[l] ?? 0) > 0);
  if (present.length === 0) return null;
  // LIB-01: same bodyweight guard as overallStrengthPercentile. A missing/zero/
  // non-finite bwKg would make dotsScore yield NaN, which clampPct masks as the
  // 0th percentile. This function already uses null as its no-estimate sentinel
  // (TierLadderCard null-checks the result), so reuse it here.
  if (!(bwKg > 0) || !Number.isFinite(bwKg)) return null;
  // Unknown/undisclosed sex → mean of the male and female partial results.
  if (!isKnownSex(sex)) {
    const m = overallStrengthPercentilePartial(lifts, bwKg, 'M');
    const f = overallStrengthPercentilePartial(lifts, bwKg, 'F');
    if (!m || !f) return m ?? f ?? null;
    const dots = sanitizeDots(0.5 * m.dots + 0.5 * f.dots);
    return { pct: clampPct(0.5 * m.pct + 0.5 * f.pct), provisional: m.provisional || f.provisional, dots };
  }
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
  // dotsScore NaN sentinel (poly guard / extreme BW) → no estimate (null).
  if (!Number.isFinite(dots)) return null;
  const pct = clampPct(100 * normCdf((Math.log(dots) - mu) / sigma));
  return { pct, provisional: true, dots: sanitizeDots(dots) };
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
// Lens 1 — Experience-adjusted (memo §3, Agent N 2026-06-12)
// ---------------------------------------------------------------------------

/**
 * ExperienceLevel maps the profile string to an approximate training age in
 * years, used by the heteroscedastic σ function.
 */
const EXPERIENCE_TO_YEARS: Record<string, number> = {
  beginner:     1,
  novice:       2,
  intermediate: 4,
  advanced:     6,
  elite:        9,
};

/**
 * Heteroscedastic σ(t) — within-cohort spread grows with training age.
 *
 * Form (memo §3): σ(t) = σ_nov + (σ_adv − σ_nov)·(1 − e^{−t/τ_σ})
 *   σ_nov  = 0.20  (tighter cluster at novice level)
 *   σ_adv  = pop_sigma (population σ fitted from the 6-anchor table)
 *   τ_σ    = 4 years (half-life ≈ 2.8 yr)
 *
 * Falls back to pop_sigma when t is null.
 */
export const SIGMA_NOV = 0.20;
export const TAU_SIGMA = 4; // years

export function heteroscedasticSigma(popSigma: number, trainingYears: number | null): number {
  if (trainingYears == null) return popSigma;
  const t = Math.max(0, trainingYears);
  return SIGMA_NOV + (popSigma - SIGMA_NOV) * (1 - Math.exp(-t / TAU_SIGMA));
}

/**
 * McCulloch/Foster-style age multiplier table (multiplicative on e1RM).
 *
 * Interpretation: adjusted_e1rm = actual_e1rm * ageMult(age_band).
 * For masters bands (45+/55+) the multiplier > 1 — it inflates the load to
 * reflect the physiological deficit, so the percentile lookup against the
 * prime-age population is fair. Youth (under-18) multiplier < 1 reflects
 * that adolescent strength hasn't peaked yet.
 *
 * OFF (returns 1.0) when age_band is null or unrecognised.
 * Reference: McCulloch 1994 / Foster 2011 masters factor tables (adapted).
 */
export type AgeBand =
  | 'under-18'
  | '18-24'
  | '25-34'
  | '35-44'
  | '45-49'
  | '50-54'
  | '55-59'
  | '60-64'
  | '65-69'
  | '70+'
  | '45-54' // legacy coarse band (server-provided) — retained
  | '55+';  // legacy coarse band (server-provided) — retained

// McCulloch masters age coefficients: expected strength relative to the 25-40
// prime reference. Finer masters bands added; coarse server-sent keys retained.
export const AGE_MULT: Record<AgeBand, number> = {
  'under-18': 0.96,
  '18-24':    0.98,
  '25-34':    1.00, // prime reference
  '35-44':    0.97,
  '45-49':    0.91,
  '50-54':    0.84,
  '55-59':    0.77,
  '60-64':    0.70,
  '65-69':    0.62,
  '70+':      0.54,
  '45-54':    0.88, // legacy coarse band (server-provided) — retained
  '55+':      0.72, // legacy coarse band (server-provided) — retained
};

/**
 * Canonical age-band tokens (youngest to oldest), the exact key set of AGE_MULT
 * above. These are the ONLY tokens ageMultiplier recognises.
 *
 * LIB-02: any producer of an age_band value MUST emit one of these exact dash
 * tokens. The birth-date deriver ageBandFromBirthDate in
 * mobile/src/lib/trainingEngine/localContext.ts historically emitted underscore
 * tokens (under_30, 30_39, and so on) that match nothing here, so age adjustment
 * was silently disabled on that path. That producer lives in a separate file
 * (outside this module's edit scope) and should import the AgeBand type and
 * conform, with its return annotated as AgeBand or null so tsc enforces the
 * contract. Exported here so there is a single source of truth.
 */
export const AGE_BANDS: readonly AgeBand[] = [
  'under-18', '18-24', '25-34', '35-44',
  '45-49', '50-54', '55-59', '60-64', '65-69', '70+',
  '45-54', '55+', // legacy coarse bands (server-provided) — retained
];

export function ageMultiplier(ageBand: string | null | undefined): number {
  if (!ageBand) return 1.0;
  return (AGE_MULT as Record<string, number>)[ageBand] ?? 1.0;
}

/**
 * Lens 1 — Experience-adjusted percentile (memo §3).
 *
 * Model: L₅₀ = exp(μ)·(BW/BW₀)^α·A(age_band)
 * pct  = 100·Φ((ln L_adj − ln L₅₀) / σ(trainingYears))
 *
 * where:
 *   L_adj        = e1rmKg / ageMult(age_band)  — age-normalised load
 *   α            = ALPHA_PER_LIFT[lift]          — per-lift allometric exponent
 *   σ(t)         = heteroscedasticSigma(popSigma, trainingYears)
 *   μ, popSigma  = liftPopParams(lift, sex) — same 6-anchor fit as Lens 2a
 *
 * @param lift           Lift identifier
 * @param sex            'M' | 'F'
 * @param e1rmKg         User's estimated 1-rep max in kg
 * @param bwKg           User's bodyweight in kg
 * @param experienceLevel Profile experience_level string (beginner/intermediate/…)
 * @param ageBand        Profile age_band string ('25-34' etc.) or null
 */
export function computePercentile(
  lift: LiftId,
  sex: SexInput,
  e1rmKg: number,
  bwKg: number,
  experienceLevel: string | null | undefined,
  ageBand: string | null | undefined,
): number {
  if (e1rmKg <= 0 || bwKg <= 0) return 0;
  // Unknown/undisclosed sex → mean of the male and female experience-adjusted
  // percentiles (same 50/50 mixture policy; never throws on an unknown key).
  if (!isKnownSex(sex)) {
    const m = computePercentile(lift, 'M', e1rmKg, bwKg, experienceLevel, ageBand);
    const f = computePercentile(lift, 'F', e1rmKg, bwKg, experienceLevel, ageBand);
    return clampPct(0.5 * m + 0.5 * f);
  }
  const { mu, sigma: popSigma } = liftPopParams(lift, sex);
  const alpha = ALPHA_PER_LIFT[lift] ?? ALPHA_DEFAULT;
  const trainingYears = experienceLevel ? (EXPERIENCE_TO_YEARS[experienceLevel] ?? null) : null;
  const sigma = heteroscedasticSigma(popSigma, trainingYears);
  // Age-adjusted load: normalise to prime-age cohort
  const mult = ageMultiplier(ageBand);
  const lAdj = e1rmKg * (mult > 0 ? 1 / mult : 1);
  const expected = mu + alpha * Math.log(bwKg / REF_BW[sex]);
  const z = (Math.log(lAdj) - expected) / sigma;
  return clampPct(100 * normCdf(z));
}

// ---------------------------------------------------------------------------
function clampPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p));
}

/**
 * Ensure a returned `dots` field is always finite. NaN/Infinity (e.g. from the
 * DOTS poly guard or an unknown-sex average where one branch was unusable) is
 * coerced to 0 so consumers never render NaN. (SRV-FIX-SEX-DOTS, 2026-06-19)
 */
function sanitizeDots(d: number): number {
  return Number.isFinite(d) ? d : 0;
}
