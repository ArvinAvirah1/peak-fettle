#!/usr/bin/env python3
"""
deriveStrengthModelV3.py — provenance script for mobile/src/lib/strengthModelV3.ts

Reproduces every (mu, sigma) constant from the published strength standards
tables (strength_curve_model.md §5 + strength_model_v3_revision_2026-06-06.md §5.1).

Quantile map (D8, 2026-06-12): q = [0.12, 0.40, 0.60, 0.85, 0.97, 0.995]
  anchors  =  [beginner, novice, intermediate, advanced, elite, world-class]
  (beginner tightened 20th → 12th per D8; all other anchors unchanged)

Procedure (memo §5.3):
  1. Convert each ×BW standard to absolute load at reference BW.
  2. Apply the quantile map to get (ln_load, Φ⁻¹(q)) pairs.
  3. Least-squares lognormal fit: ln(load) = μ + σ·Φ⁻¹(q).
  4. For DOTS total: sum SBD loads → DOTS score at reference BW → fit.

Run:  python3 mobile/scripts/deriveStrengthModelV3.py
Output is pasted into the PROVENANCE comment block in strengthModelV3.ts.
"""
import math

# ── Numerical utilities ──────────────────────────────────────────────────────

def norm_inv(p):
    """Acklam rational approximation to Φ⁻¹(p), |error| < 1.2e-9."""
    a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
          1.38357751867269e2, -3.066479806614716e1, 2.506628277459239]
    b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
          6.680131188771972e1, -1.328068155288572e1]
    c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
         -2.549732539343734, 4.374664141464968, 2.938163982698783]
    d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
               ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)
    if p <= phigh:
        q = p - 0.5; r = q*q
        return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / \
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)
    q = math.sqrt(-2 * math.log(1 - p))
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / \
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)

def fit_lognormal(loads, quantiles):
    """Ordinary least squares fit of ln(load) on Φ⁻¹(q). Returns (mu, sigma, R²)."""
    n = min(len(loads), len(quantiles))
    y = [math.log(loads[i]) for i in range(n)]
    z = [norm_inv(quantiles[i]) for i in range(n)]
    zbar = sum(z) / n
    ybar = sum(y) / n
    szy = sum((z[i]-zbar)*(y[i]-ybar) for i in range(n))
    szz = sum((z[i]-zbar)**2 for i in range(n))
    sst = sum((y[i]-ybar)**2 for i in range(n))
    sigma = szy / szz
    mu = ybar - sigma * zbar
    ssr = sum((y[i] - (mu + sigma*z[i]))**2 for i in range(n))
    r2 = 1 - ssr/sst if sst > 0 else 1.0
    return mu, sigma, r2

def dots_score(total_kg, bw_kg, sex):
    """DOTS formula (memo §4)."""
    coef = {
        'M': {'A': -307.75076, 'B': 24.0900756, 'C': -0.1918759221,
              'D': 0.0007391293, 'E': -0.0000010930},
        'F': {'A': -57.96288, 'B': 13.6175032, 'C': -0.1126655495,
              'D': 0.0005158568, 'E': -0.0000010706659},
    }[sex]
    denom = (coef['A'] + coef['B']*bw_kg + coef['C']*bw_kg**2
             + coef['D']*bw_kg**3 + coef['E']*bw_kg**4)
    return total_kg * 500 / denom

# ── Standards (×BW) — strength_curve_model.md §5 + v3 revision §5.1 ─────────
# Columns: [beginner, novice, intermediate, advanced, elite, world-class]

STANDARDS_XBW = {
    'squat':    {'M': [0.75, 1.25, 1.50, 2.00, 2.50, 3.00],
                 'F': [0.50, 0.85, 1.00, 1.35, 1.65, 2.00]},
    'bench':    {'M': [0.50, 0.75, 1.00, 1.25, 1.50, 2.00],
                 'F': [0.30, 0.50, 0.70, 0.90, 1.10, 1.40]},
    'deadlift': {'M': [1.00, 1.50, 1.75, 2.25, 2.75, 3.25],
                 'F': [0.65, 1.00, 1.25, 1.65, 1.95, 2.40]},
    'ohp':      {'M': [0.40, 0.55, 0.65, 0.85, 1.05, 1.30],
                 'F': [0.20, 0.30, 0.45, 0.60, 0.75, 0.95]},
}
REF_BW = {'M': 75, 'F': 60}

# D8 quantile map (tightened beginner anchor 20th → 12th, 2026-06-12)
QUANTILE_MAP_NEW = [0.12, 0.40, 0.60, 0.85, 0.97, 0.995]
QUANTILE_MAP_OLD = [0.20, 0.40, 0.60, 0.85, 0.97, 0.995]

# ── Run derivation ────────────────────────────────────────────────────────────

print("=" * 72)
print("Peak Fettle strengthModelV3 — constant derivation (D8, 2026-06-12)")
print("quantile map NEW: [0.12, 0.40, 0.60, 0.85, 0.97, 0.995]")
print("quantile map OLD: [0.20, 0.40, 0.60, 0.85, 0.97, 0.995]")
print("=" * 72)

print("\n── Per-lift lognormal parameters (pop_mu, pop_sigma) ──────────────────")
print(f"  {'lift+sex':<16} {'mu_old':>8} {'sig_old':>8} {'R2_old':>7}  {'mu_new':>8} {'sig_new':>8} {'R2_new':>7}  {'med_new(kg)':>11}  dR2")

fit_results = {}
for lift in ['squat', 'bench', 'deadlift', 'ohp']:
    fit_results[lift] = {}
    for sex in ['M', 'F']:
        bw0 = REF_BW[sex]
        loads = [v * bw0 for v in STANDARDS_XBW[lift][sex]]
        mu_o, sig_o, r2_o = fit_lognormal(loads, QUANTILE_MAP_OLD)
        mu_n, sig_n, r2_n = fit_lognormal(loads, QUANTILE_MAP_NEW)
        fit_results[lift][sex] = (mu_n, sig_n, r2_n)
        print(f"  {lift+' '+sex:<16} {mu_o:>8.5f} {sig_o:>8.5f} {r2_o:>7.5f}  "
              f"{mu_n:>8.5f} {sig_n:>8.5f} {r2_n:>7.5f}  "
              f"{math.exp(mu_n):>11.2f}  {r2_n-r2_o:>+.5f}")

print("\n── DOTS total parameters (mu_D, sigma_D) ──────────────────────────────")
dots_results = {}
for sex in ['M', 'F']:
    bw0 = REF_BW[sex]
    sq = STANDARDS_XBW['squat'][sex]
    bp = STANDARDS_XBW['bench'][sex]
    dl = STANDARDS_XBW['deadlift'][sex]
    dots_vals = [dots_score((sq[i]+bp[i]+dl[i])*bw0, bw0, sex) for i in range(6)]
    mu_d, sig_d, r2_d = fit_lognormal(dots_vals, QUANTILE_MAP_NEW)
    dots_results[sex] = (mu_d, sig_d, r2_d)
    print(f"  DOTS {sex}: mu_D={mu_d:.5f}  sigma_D={sig_d:.5f}  R2={r2_d:.5f}  "
          f"median_DOTS={math.exp(mu_d):.2f}")

print("\n── Summary for TypeScript constant block ───────────────────────────────")
print("QUANTILE_MAP = [0.12, 0.40, 0.60, 0.85, 0.97, 0.995]  // D8: beg=12th (was 20th)")
print()
for lift in ['squat', 'bench', 'deadlift', 'ohp']:
    for sex in ['M', 'F']:
        mu, sig, r2 = fit_results[lift][sex]
        bw0 = REF_BW[sex]
        print(f"  {lift} {sex}: mu={mu:.5f}  sigma={sig:.5f}  R2={r2:.5f}  "
              f"median={math.exp(mu):.2f}kg ({math.exp(mu)/bw0:.3f}xBW)")
print()
for sex in ['M', 'F']:
    mu, sig, r2 = dots_results[sex]
    print(f"  DOTS {sex}: mu_D={mu:.5f}  sigma_D={sig:.5f}  R2={r2:.5f}  "
          f"median_DOTS={math.exp(mu):.2f}")

# Exact male squat median for test assertion
sq_mu_new = fit_results['squat']['M'][0]
print(f"\n── Test assertion value: male squat implied median = {math.exp(sq_mu_new):.3f} kg ──")
print("   (test asserts within ±3 kg of this value)")

# ── Per-lift α derivation (Agent N, 2026-06-12) ──────────────────────────────
print("\n── Per-lift allometric exponents α (Lens 1 + Lens 2a) ─────────────────")
print("   Source: Jaric 2002 (Int J Sports Med) empirical range [0.64–0.71] for")
print("   compound lifts; press-pattern (bench/ohp) sit at the lower end because")
print("   upper-extremity strength scales less steeply with BM than lower-body.")
print("   All values bounded to [0.62, 0.72] per spec.  Re-fit on OPL data (v4).")
print()
ALPHA_PER_LIFT = {'squat': 0.670, 'bench': 0.643, 'deadlift': 0.671, 'ohp': 0.640}
for lift, alpha in ALPHA_PER_LIFT.items():
    assert 0.62 <= alpha <= 0.72, f"α={alpha} out of [0.62,0.72] for {lift}"
    print(f"  {lift:<12} α = {alpha:.3f}")

# ── Heteroscedastic σ anchors ─────────────────────────────────────────────────
print("\n── Heteroscedastic σ(t) anchors (Lens 1) ──────────────────────────────")
SIGMA_NOV = 0.20
TAU_SIGMA = 4
print(f"  σ_nov={SIGMA_NOV}  τ_σ={TAU_SIGMA} yr")
print(f"  σ_adv = pop_sigma per lift×sex (see table above)")
print(f"  Form: σ(t) = σ_nov + (σ_adv − σ_nov)·(1 − exp(−t/τ_σ))")
# Spot-check: squat M at t=4 yr (intermediate)
pop_sigma_sq_m = fit_results['squat']['M'][1]
sigma_t4 = SIGMA_NOV + (pop_sigma_sq_m - SIGMA_NOV) * (1 - math.exp(-4/TAU_SIGMA))
print(f"  Spot-check squat M at t=4yr: σ(4) = {sigma_t4:.4f}  (pop_sigma={pop_sigma_sq_m:.5f})")

# ── Age multiplier table ──────────────────────────────────────────────────────
print("\n── Age multipliers (McCulloch/Foster-style, Lens 1) ───────────────────")
AGE_MULT = {
    'under-18': 0.96,
    '18-24':    0.98,
    '25-34':    1.00,  # prime reference
    '35-44':    0.97,
    '45-54':    0.93,
    '55+':      0.86,
}
print("   band        mult   C (=1/mult)  interpretation")
for band, mult in AGE_MULT.items():
    C = 1/mult
    print(f"   {band:<12} {mult:.2f}   {C:.4f}       age-coefficient applied to e1RM")

print("\n[deriveStrengthModelV3.py complete]")
