---
name: strength_curve_model
description: Math doc + dev-team handoff for the Peak Fettle percentile ranking calculator. Encodes the multivariate strength-curve model (sex × bodyweight × age × training-years × lift) and the simple gender + bodyweight population comparison. Pairs with compute_percentile.sql and lift_vectors_seed.sql.
type: technical_doc
owner: Data Analyst Subteam
last_reviewed: 2026-05-27
model_version: 2
model_layer: 2.1 (sex-only univariate added; see §4.5)
---

# Peak Fettle Strength Curve Model — v2 (+ v2.1 sex-only layer)

This document specifies the equations behind Peak Fettle's percentile ranking system. It is the single source of truth for `compute_percentile.sql`. The dev team consumes (a) this doc, (b) the SQL functions, and (c) the `lift_vectors` seed table — nothing else.

---

## 1. What problem this solves

A Peak Fettle user logs a 1RM (or top set converted to 1RM-equivalent) for a given lift. The app must answer two questions:

**Q1 (experience-adjusted):** "What percentile does this lift place me in, relative to other lifters with the same sex, bodyweight, age, and training experience?"

**Q2 (population-level):** "Where does this lift place me among ALL strength trainees of my sex at my bodyweight, regardless of how long I have been training?"

**Q3 (sex-only, v2.1):** "How strong is this lift for someone of my sex — full stop, ignoring my bodyweight, age, and experience?" This is the casual-user intuition ("how strong am I for a guy/girl?") and is the score the **overall strength tier** (TICKET-053) sits on top of.

Q1 and Q2 are answered by the same log-normal framework with different parameter sets from `lift_vectors`. Q3 is answered by a third, deliberately simpler equation added in the **v2.1 additive layer** (§4.5) — same log-normal machinery, but with the bodyweight covariate *marginalised out* rather than conditioned on.

---

## 2. v1 → v2: What was wrong and what changed

### The v1 calibration bug

In v1, `μ` was set to `ln(intermediate_standard × BW₀)`, making the intermediate standard the *long-run ceiling* of the model. The training factor `T(years)` asymptotes to 1.0 at infinite training years, so the formula predicted:

```
L₅₀ (fully trained) = exp(μ) × 1.0 = intermediate_standard × BW₀
```

A four-year trainee had `T(4) ≈ 0.88`, giving a predicted median of only **88% of the intermediate standard** — far below real-world norms. Concretely:

| Input | v1 prediction | v2 prediction | Real-world norm |
|-------|--------------|--------------|----------------|
| 20yo male, 170 lb (77.1 kg), 4yr training, bench | ~139 lb | ~204 lb | ~195–215 lb |
| same profile, OHP | ~93 lb | ~127 lb | ~110–145 lb |

Additionally, v1's `training_floor = 0.55` (global default) was silently applied to inherited lifts even though the schema's `NOT NULL DEFAULT 0.55` prevented the COALESCE inheritance chain from reaching the parent row.

### v2 fixes

1. **`training_floor` (f₀) is now per-lift**, derived by solving for the value that simultaneously satisfies two calibration anchors:
   - `T(0) × exp(μ) = beginner_standard × BW₀`
   - `T(2yr) × exp(μ) = intermediate_standard × BW₀`

2. **`μ` is now the log of the training-curve asymptote**, which is substantially higher than the intermediate standard. It is derived as `ln(intermediate_standard × BW₀ / T(2yr))`.

3. **`σ` now represents within-experience-level variation only** (training-level differences are captured by `T(years)`). Derived as `ln(advanced/intermediate) / 1.282` so the 90th percentile within each training band equals the advanced standard.

4. **`pop_mu` and `pop_sigma` added** — population-level parameters for the simple gender + bodyweight comparison (Q2 above). `pop_mu` = `ln(intermediate × BW₀)` (the population median) — these are the old v1 `μ` values, now used for their correct purpose.

5. **Schema fix**: `bw_ref_kg` and `training_floor` are now nullable so inherited lifts correctly fall through to the parent's values via COALESCE.

---

## 3. Equation A — Experience-adjusted percentile

### 3.1 Inputs

| Symbol | Meaning |
|--------|---------|
| `L` | User's lift weight in kg (1RM or 1RM-equivalent) |
| `lift` | Categorical, e.g., `'bench_press'`, `'back_squat'` |
| `sex` | `'M'` or `'F'` |
| `BW` | User's bodyweight in kg |
| `age` | User's age in years (integer) |
| `years` | Years of consistent strength training (0.0 = never trained) |

### 3.2 Per-lift coefficient vector (from `lift_vectors`)

| Symbol | Meaning |
|--------|---------|
| μ | Log of the 50th-percentile lift at the training asymptote, reference profile |
| σ | Log-scale SD — within-experience-level variation |
| α | Bodyweight allometric exponent (0.667 default) |
| BW₀ | Reference bodyweight in kg (75 for M, 65 for F) |
| f₀ | Training floor: fraction of asymptote at t=0 (per-lift, calibrated) |
| τ | Time constant in years (3.0 for all lifts) |
| Aₚₗ / Aₚₕ | Lower / upper bound of peak-strength age band (23 / 35) |
| γ_y / γ_d | Youth deficit / senior decline rate per year (0.012 / 0.010) |

### 3.3 The four factors

**Factor 1 — Bodyweight (allometric):**
```
B(BW) = (BW / BW₀)^α
```

**Factor 2 — Age (piecewise linear, calibrated to McCulloch/Foster USAPL tables):**
```
            ⎧ 1 − γ_y · (Aₚₗ − age)         if age < Aₚₗ  (youth, still developing)
A(age)   =  ⎨ 1                             if Aₚₗ ≤ age ≤ Aₚₕ  (peak band 23–35)
            ⎩ max(0.40, 1 − γ_d · (age − Aₚₕ))  if age > Aₚₕ  (age-related decline)
```

**Factor 3 — Training experience (first-order kinetics):**
```
T(years) = f₀ + (1 − f₀) · (1 − exp(−years / τ))
```
where f₀ is per-lift (see §3.4). At t=0, `T = f₀`; at t=2yr, `T ≈ T(2yr)` (intermediate calibration anchor); at t=∞, `T → 1.0` (asymptote).

**Factor 4 — Lift baseline:**
```
M(lift, sex) = exp(μ)
```
The lift weight corresponding to the training asymptote at the reference profile.

### 3.4 f₀ derivation (the v2 fix)

f₀ is solved from two simultaneous calibration constraints:
- At `t=0`: `T(0) = f₀` → `exp(μ) · f₀ = beginner_standard · BW₀`
- At `t=2yr`: `T(2yr) = f₀ + (1−f₀)·β` where β = `1−e^{-2/3}` ≈ 0.4866 → `exp(μ) · T(2yr) = intermediate_standard · BW₀`

Dividing: `R = f₀ / T(2yr) = beginner / intermediate`

Solving for f₀:
```
f₀ = β · R / (1 − (1−β) · R)
```

| Lift | Sex | beg/int (R) | f₀ | T(2yr) |
|------|-----|------------|-----|--------|
| back_squat | M | 0.75/1.50 = 0.500 | 0.3273 | 0.6546 |
| back_squat | F | 0.50/1.00 = 0.500 | 0.3273 | 0.6546 |
| bench_press | M | 0.50/1.00 = 0.500 | 0.3273 | 0.6546 |
| bench_press | F | 0.30/0.70 = 0.429 | 0.2674 | 0.6237 |
| deadlift | M | 1.00/1.75 = 0.571 | 0.3935 | 0.6887 |
| deadlift | F | 0.65/1.25 = 0.520 | 0.3452 | 0.6638 |
| overhead_press | M | 0.40/0.65 = 0.615 | 0.4378 | 0.7113 |
| overhead_press | F | 0.20/0.45 = 0.444 | 0.2802 | 0.6304 |
| barbell_row | M/F | (inherits from bench) | — | — |

### 3.5 Expected median lift and percentile

```
L₅₀ = exp(μ) · B(BW) · A(age) · T(years)

z = (ln(L) − ln(L₅₀)) / σ

percentile_adjusted = 100 · Φ(z)
```

where Φ is the standard-normal CDF (Abramowitz & Stegun approximation in SQL, max error 7.5×10⁻⁸).

---

## 4. Equation B — Simple population percentile

```
z_pop = (ln(L) − (pop_mu + α · ln(BW / BW₀))) / pop_sigma

percentile_simple = 100 · Φ(z_pop)
```

No age factor, no training factor. The interpretation is: "Where does this lift place me among all strength trainees of my sex at this bodyweight, regardless of experience?"

**pop_mu derivation:**
```
pop_mu = ln(intermediate_standard × BW₀)
```
The intermediate standard is the empirical median of all trained lifters (across all experience levels). This is supported by weighted population modelling (40% beginners, 25% novice, 25% intermediate, 10% advanced) and cross-validated against Strength Level (n > 2,000,000 self-reported entries, all experience levels).

**pop_sigma derivation:**
```
pop_sigma = ln(elite_standard / beginner_standard) / (2 × 1.645)
```
This spans the 5th percentile (beginner) to 95th percentile (elite) of the full trained population. Cross-validation: Bielik 2024 competition 90th percentile maps to z ≈ 2.0 in this model, i.e., the 97.7th percentile of the general trained population — consistent with the self-selection bias of competition entrants.

---

## 4.5 Equation C — Sex-only univariate model (v2.1)

> **Added 2026-05-27 (TICKET-052).** This is an **additive layer**: it does not touch the v2 columns, equations, or the two-score card (TICKET-033). It introduces a *third* lens used by the overall strength tier (TICKET-053).

### 4.5.1 What it answers

Each lift is ranked **only against trainees of the same biological sex** — *no* bodyweight normalisation, *no* age, *no* experience adjustment. It is the unconditional distribution of the **absolute load lifted (kg)** within a sex. A user's **overall strength percentile = the arithmetic mean of their per-lift sex-only percentiles** (§4.5.4).

The equation has the same log-normal form as Equations A and B:

```
percentile_sex_only = 100 · Φ( (ln(L) − μ_sex) / σ_sex )
```

where `L` is the lifted load in kg (1RM-equivalent), and `(μ_sex, σ_sex)` is a **sex-keyed** parameter pair per lift (`mu_sex_m / sigma_sex_m`, `mu_sex_f / sigma_sex_f` in `lift_vectors`). Note there is **no bodyweight term** — that is the whole point of this lens.

### 4.5.2 Derivation — marginalising bodyweight out of Equation B

We do **not** need a new dataset. Equation B (§4) already gives the distribution of absolute load *conditional on bodyweight* for a sex:

```
ln(L) | BW  ~  Normal( pop_mu + α·ln(BW / BW₀),  pop_sigma² )
```

The sex-only lens wants the **unconditional** distribution of `ln(L)` — i.e. the same load distribution after integrating over the population's bodyweight spread for that sex. Model the population's log-bodyweight as `ln(BW) ~ Normal(ln G, s²)`, where `G` is the **geometric-mean bodyweight** of same-sex trainees and `s` is the SD of `ln(BW)`. Then, since the conditional mean is linear in `ln(BW)` and the conditional noise `ε ~ Normal(0, pop_sigma²)` is independent of `BW`:

```
ln(L) = pop_mu − α·ln(BW₀) + α·ln(BW) + ε
```

A normal (the noise) mixed over a normal location (`α·ln BW`) is itself normal, so the marginal is **closed-form log-normal**:

```
μ_sex   = pop_mu + α·ln(G / BW₀)
σ_sex   = sqrt( α²·s²  +  pop_sigma² )
```

Two intuitions fall out cleanly:
- **The marginal median `exp(μ_sex)` equals the conditional median of a lifter at the geometric-mean bodyweight `G`.** "The typical lift for a typical-sized member of that sex."
- **`σ_sex` is strictly wider than `pop_sigma`** — it absorbs the extra spread from people being different sizes (`α²·s²`). This is correct: ignoring bodyweight *should* make the population look more spread out.

This keeps the v2.1 layer fully analytical from the already-fitted v2 model + one population BW prior per sex — no re-fit, no external data, consistent with M3 (allometric) and M9 (vector + single function).

### 4.5.3 Population bodyweight priors (analyst decision)

Per M11, these are decisions made by the analyst, not estimated from Peak Fettle data (which is not yet large enough). They are grounded in the trained-adult bodyweight distributions behind the v2 source datasets (OpenPowerlifting weight-class spread, Strength Level self-reported demographics, NHANES adult anthropometry as an outer bound), chosen to be moderate and to be re-fit on first-party data later:

| Sex | Geometric-mean BW `G` | SD of ln(BW) `s` | Reference `BW₀` |
|-----|----------------------|------------------|-----------------|
| M   | 85.0 kg              | 0.17             | 75 kg           |
| F   | 68.0 kg              | 0.18             | 65 kg           |

`s = 0.17–0.18` corresponds to a bodyweight coefficient-of-variation of ≈17–18% — i.e. the middle ~68% of same-sex trainees fall within roughly ±18% of the geometric mean (M: ~72–101 kg; F: ~57–81 kg). The tails of the sex-only percentile are **sensitive to `s`** (it enters `σ_sex` quadratically); this is flagged in §7.

### 4.5.4 Resulting parameters (direct-fit base lifts)

Computed from the v2 `pop_mu / pop_sigma` (see `lift_vectors_seed.sql`) via §4.5.2, `α = 0.667`:

| Lift | Sex | μ_sex | exp(μ_sex) = median (kg) | σ_sex |
|------|-----|-------|--------------------------|-------|
| back_squat | M | 4.8063 | 122.3 | 0.3832 |
| back_squat | F | 4.2045 | 67.0 | 0.3822 |
| bench_press | M | 4.4010 | 81.5 | 0.3527 |
| bench_press | F | 3.8483 | 46.9 | 0.4128 |
| deadlift | M | 4.9606 | 142.7 | 0.3277 |
| deadlift | F | 4.4276 | 83.7 | 0.3549 |
| overhead_press | M | 3.9702 | 53.0 | 0.3145 |
| overhead_press | F | 3.4060 | 30.1 | 0.4194 |
| barbell_row | M | 4.2957 | 73.4 | 0.3527 |
| barbell_row | F | 3.7425 | 42.2 | 0.4128 |

**Accessory / inherited lifts** carry `NULL` sex-only params and resolve at query time exactly like `mu` / `pop_mu`: `μ_sex_child = μ_sex_parent + ln(inheritance_ratio)`, `σ_sex` inherited unchanged (a multiplicative ratio shifts the log-median but not the log-spread).

**Undisclosed sex** mirrors the existing `μ_mid / σ_mid` convention: average the two sex curves, `μ_mid = (μ_sex_m + μ_sex_f)/2`, `σ_mid = (σ_sex_m + σ_sex_f)/2`.

### 4.5.5 Worked example — one per sex

**Male, 100 kg bench press:**
```
z = (ln(100) − 4.4010) / 0.3527 = (4.6052 − 4.4010) / 0.3527 = 0.579
percentile_sex_only = 100·Φ(0.579) = 71.9
```
A 100 kg (≈225 lb) bench places a man in the **~72nd percentile of all male trainees**, regardless of his bodyweight.

**Female, 60 kg bench press:**
```
z = (ln(60) − 3.8483) / 0.4128 = (4.0943 − 3.8483) / 0.4128 = 0.596
percentile_sex_only = 100·Φ(0.596) = 72.4
```
A 60 kg (≈132 lb) bench places a woman in the **~72nd percentile of all female trainees**.

### 4.5.6 Overall strength percentile (aggregation)

```
overall_strength_percentile(user) = mean over the user's logged lifts of
                                     percentile_sex_only(lift, sex, best_e1RM_lift)
```

Input = the same **best e1RM per lift** the weekly batch already derives (`v_user_lift_inputs`). The mean is **unweighted** (founder said "mean"; squat/bench/deadlift weighting is a possible future refinement, not in scope).

**Minimum-lifts rule (stability).** A single PR on one lift should not crown someone — the mean of one number is volatile and easily gamed. The SQL function returns a value for **≥1 lift**, but the **tier (TICKET-053) should only be *shown* once the user has ≥ N distinct logged lifts**. Recommended **N = 3** (squat/bench/deadlift is the natural floor). This is a founder-tunable open decision (see §4.5.7); `overall_strength_percentile_detail()` returns `n_lifts` and a `min_lifts_met` boolean so TICKET-053 can gate the UI without re-deriving the threshold.

Worked overall example — a man logging squat 140 / bench 100 / deadlift 180 kg: per-lift sex-only percentiles 63.8 / 71.9 / 76.1 → **overall 70.6** (→ "Gold" on the proposed TICKET-053 ladder).

### 4.5.7 Open decisions for the founder (flagged, not blocking the math)

- **Min distinct lifts before a tier shows:** defaulting to **3**. Lower (1–2) makes early tiers noisy; higher (4–5) delays the reward.
- **Per-lift weighting:** unweighted mean as specified. A squat/bench/deadlift-weighted variant is a clean future extension.
- **Population BW priors (`G`, `s`):** the §4.5.3 values are analyst defaults; re-fit once Peak Fettle has a representative same-sex bodyweight sample.

---

## 5. Calibration anchors

### Strength standards table (calibration source)

| Lift | M Beg | M Nov | M Int | M Adv | M Eli | F Beg | F Nov | F Int | F Adv | F Eli |
|------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| Squat | 0.75 | 1.25 | 1.50 | 2.00 | 2.50 | 0.50 | 0.85 | 1.00 | 1.35 | 1.65 |
| Bench | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 | 0.30 | 0.50 | 0.70 | 0.90 | 1.10 |
| Deadlift | 1.00 | 1.50 | 1.75 | 2.25 | 2.75 | 0.65 | 1.00 | 1.25 | 1.65 | 1.95 |
| OHP | 0.40 | 0.55 | 0.65 | 0.85 | 1.05 | 0.20 | 0.30 | 0.45 | 0.60 | 0.75 |

*Sources: Strength Level (n>2M), Nuckols/SBS (n=1,800 survey + OPL analysis), ExRx, Lyle McDonald — converging consensus across all four.*

### Experience-curve calibration (male bench press, reference profile: 75 kg, age 25)

| Training years | T(years) | Predicted L₅₀ | Standard | Match |
|---------------|----------|--------------|---------|-------|
| 0 (never trained) | 0.3273 | 37.5 kg = 0.50×BW | Beginner = 0.50×BW | ✓ exact |
| 2 | 0.6546 | 75.0 kg = 1.00×BW | Intermediate = 1.00×BW | ✓ exact |
| 4 | 0.8227 | 94.2 kg = 1.256×BW | Advanced = 1.25×BW | ✓ +0.5% |
| 7 | 0.9328 | 106.9 kg = 1.425×BW | Elite = 1.50×BW | ✓ within tolerance† |
| ∞ | 1.000 | 114.6 kg = 1.528×BW | Asymptote (genetic ceiling) | ✓ |

†Elite standard reached by approximately 10–15 years of training for the 50th percentile within that experience band. Elite-level percentile is reached earlier by the top ~5% of 7-year trainees (σ = 0.174).

### User test case (the v1 failure case, now corrected)

| Metric | v1 | v2 | Expected range |
|--------|----|----|---------------|
| 20yo M, 170 lb, 4yr, bench L₅₀ | 139 lb | 204 lb | 195–215 lb ✓ |
| same, OHP L₅₀ | 93 lb | 127 lb | 110–140 lb ✓ |

### Bielik 2024 anchor (competition 90th percentile vs model 90th percentile, 7-year lifters)

| Lift | Bielik 2024 competition 90th | Model 90th at T(7yr) | Deviation |
|------|------------------------------|----------------------|-----------|
| Back squat M | 2.83×BW = 212 kg | 160.3 × exp(1.282×0.2245) = 213.8 kg = 2.851×BW | +0.7% ✓ |
| Bench press M | 1.95×BW = 146 kg | 106.9 × exp(1.282×0.1741) = 133.6 kg = 1.781×BW | −8.7%† |
| Deadlift M | 3.25×BW = 244 kg | 179.1 × exp(1.282×0.1961) = 230.1 kg = 3.068×BW | −5.6%† |

†Bench and deadlift deviations are expected: competition lifters use legal equipment aids (arched bench with leg drive, belt + chalk) and are a more self-selected group than the model's general trained population. Squat matches well because IPF raw squat technique is closer to general gym squat.

### McCulloch/Foster age-curve verification (male bench, reference BW)

| Age | Model A(age) | McCulloch implied (1/coef) | Deviation |
|-----|-------------|---------------------------|-----------|
| 23 | 1.000 | 1.000 | 0% ✓ |
| 40 | 0.950 | 1.000 | −5.0% |
| 50 | 0.850 | 0.885 | −3.5% |
| 60 | 0.750 | 0.777 | −2.7% |
| 70 | 0.650 | 0.608 | +4.2% |

The piecewise-linear approximation is a deliberate simplification. Maximum deviation 5.0pp (age 40). For a future "age-adjusted DOTS" feature, substitute the McCulloch table directly via lookup — the single-factor structure supports this without code changes.

### Population percentile validation (pop_mu / pop_sigma, bench press male)

| Percentile | From model | Expected standard |
|-----------|-----------|------------------|
| 5th | 75 × exp(−1.645 × 0.334) = 43.4 kg = 0.58×BW | Between beginner (0.50) and novice (0.75) ✓ |
| 50th | 75 kg = 1.00×BW | Intermediate ✓ (by construction) |
| 95th | 75 × exp(1.645 × 0.334) = 129.8 kg = 1.73×BW | Between elite and world-class ✓ |
| 97.7th (z=2.0) | 75 × exp(2.0 × 0.334) = 146.3 kg = 1.95×BW | Bielik 2024 competition 90th = 1.95×BW ✓ |

---

### Sex-only (v2.1) calibration sanity table

Load (kg) at each sex-only percentile, from the §4.5.4 parameters (`z₅₀=0`, `z₉₀=1.282`, `z₉₉=2.326`, `z₉₉․₉=3.090`). Smell-tested against known absolute-load standards (these are *not* bodyweight-normalised, so the upper tail includes heavyweights):

| Lift | Sex | P50 | P90 | P99 | P99.9 | Smell test |
|------|-----|-----|-----|-----|-------|-----------|
| back_squat | M | 122 | 200 | 298 | 400 | P50≈intermediate at mean BW; P99.9 ≈ elite raw squat (heavyweight) ✓ |
| back_squat | F | 67 | 109 | 163 | 218 | P90 ≈ strong female raw squat ✓ |
| bench_press | M | 82 | 128 | 185 | 243 | P50 ≈ 180 lb median trained male bench ✓; P99 ≈ 408 lb (elite) ✓ |
| bench_press | F | 47 | 80 | 123 | 168 | P99 ≈ 270 lb — near female raw records, top 1% ✓ |
| deadlift | M | 143 | 217 | 306 | 393 | P99.9 ≈ 866 lb — elite raw pull ✓ |
| deadlift | F | 84 | 132 | 191 | 251 | P90 ≈ 291 lb strong female pull ✓ |
| overhead_press | M | 53 | 79 | 110 | 140 | P50 ≈ 117 lb; P99 ≈ 243 lb strict press (elite) ✓ |
| overhead_press | F | 30 | 52 | 80 | 110 | P90 ≈ 114 lb strict press ✓ |

The medians land at roughly the v2 *intermediate* standard scaled to the population geometric-mean bodyweight (e.g. male squat 122 kg ≈ 1.5×BW evaluated allometrically at 85 kg) — which is exactly what an unconditional same-sex median should be. The 99.9th-percentile loads are deliberately extreme (top 1-in-1000 of *all* same-sex trainees, weight-class-blind) and are the basis for the "Grand Champ ≥ 99.9" tier band; they remain sensitive to the assumed BW spread `s` (§7).

## 6. Boundary cases and clamping

- **BW out of range:** clamp to [40, 210] for M and [40, 150] for F; return result with `extrapolated: true` flag.
- **Age < 14 or > 90:** return result with `extrapolated: true`.
- **years > 30:** clamp to 30. The asymptote is reached by ~10 years; further training adds negligible model-level gain.
- **L ≤ 0:** return null; log error.
- **|z| > 4:** clamp percentile to [0.003, 99.997]. Log-normal assumption degrades at the tails.

---

## 7. Known limitations

1. **Comparison cohort is "same-experience peers."** `percentile_adjusted` compares against same sex/BW/age/training-years users — not all lifters. A novice can score in the 80th percentile among novices but the 20th among all lifters. The UX should label it "vs. lifters at your level" and expose `percentile_simple` for the unconditional ranking. See §4.

2. **Population standards are calibrated, not directly estimated.** `pop_mu` and `pop_sigma` are derived from the strength standards table and cross-validated against Bielik 2024 (competition self-selection understood). Direct estimation from a large raw-lifter survey (e.g., a replication of the Nuckols/SBS n=1,800 survey at n=10,000+) would tighten `pop_sigma`. Flag for v3 once Peak Fettle's own dataset is large enough.

3. **σ (within-level variation) is anchored to strength standards, not empirical within-cohort data.** `σ = ln(advanced/intermediate) / 1.282` is a principled derivation but should be re-fit to Peak Fettle's own user data once ≥5,000 active users per lift are reached. The current σ may slightly underestimate genetic variation.

4. **Self-selection in source data.** Bielik 2024 and OpenPowerlifting are competition data — biased toward stronger lifters. The model corrects for this by anchoring μ to broader-population intermediate standards, but the upper-tail shape inherits some competition bias.

5. **Equipment assumption.** Raw, unequipped, free-weight execution. Belt-only is the default. Sleeves vs. wraps treated identically. Bench shirt and knee wraps not modelled.

6. **Olympic lifts deferred.** Snatch, clean & jerk, power clean, push press are not in v2. Their bodyweight-strength curve differs from powerlifting and requires USAW/IWF data. Targeted for v3.

7. **Accessory inheritance accuracy.** Lifts marked `inheritance_mode = TRUE` carry ≈10–15% accuracy hit vs. direct fits. Acceptable until Peak Fettle has ≥5,000 logged sets per accessory lift.

8. **1RM input assumption.** This model expects a true 1RM. For multi-rep entries, convert via Epley (`1RM ≈ w × (1 + reps/30)`) at the client layer; accuracy degrades above 5 reps (±5% noise).

9. **Sex-only layer (v2.1) tail sensitivity.** `σ_sex` depends on the assumed population bodyweight spread `s` (§4.5.3), which enters as `α²·s²`. The median and lower-middle percentiles are robust, but the 99th/99.9th loads — and therefore where the Diamond/Champ/Grand-Champ tier cutoffs land — shift if `s` is mis-specified. The §4.5.3 priors (`s = 0.17` M, `0.18` F) are deliberately moderate analyst defaults; re-fit on a representative same-sex bodyweight sample once Peak Fettle's dataset supports it. The marginal-normal assumption is exact only if `ln(BW)` is normal within sex; real bodyweight is mildly right-skewed, so the very top tail is approximate.

10. **Sex-only layer ignores bodyweight by design — not a bug.** A 60 kg woman and a 90 kg woman lifting the same absolute load score identically on the sex-only lens. This is intended (it is the "how strong for a girl/guy, full stop" question, Q3), but it means a light lifter who is elite *for their size* can score mid-pack on the sex-only lens. The experience-adjusted (Equation A) and BW-normalised population (Equation B) lenses remain available and should stay surfaced for that reason.

---

## 8. Versioning policy

The full triple `(lift_vectors row, model_version, calibration_anchor_set)` is the immutable identity of a percentile result.

When the data analyst re-fits any coefficient:
1. Increment `model_version` in `lift_vectors_seed.sql`.
2. Run both versions in parallel for one weekly-batch cycle; atomic-swap after validation.
3. Historical user percentile records keep their original `model_version` for audit-ability.

---

## 9. Sources

- **Bielik et al. (2024).** Normative data for the squat, bench press and deadlift exercises in powerlifting: Data from 809,986 competition entries. *Journal of Science and Medicine in Sport.* [PubMed](https://pubmed.ncbi.nlm.nih.gov/39060209/)
- **IPF (2020).** IPF GL Coefficients (official). [PDF](https://www.powerlifting.sport/fileadmin/ipf/data/ipf-formula/IPF_GL_Coefficients-2020.pdf)
- **IPF (2020).** Evaluation of Wilks, Wilks-2, DOTS, IPF and GoodLift Formulas. [PDF](https://www.powerlifting.sport/fileadmin/ipf/data/ipf-formula/Models_Evaluation-I-2020.pdf)
- **USAPL.** Foster and McCulloch Age Coefficients. [PDF](https://www.usapowerlifting.com/wp-content/uploads/2021/01/USAPL-Age-Coefficients.pdf)
- **OpenPowerlifting.** opl-csv public dataset (~1.3M entries, public domain). [Link](https://openpowerlifting.gitlab.io/opl-csv/)
- **Strength Level.** Self-reported strength database (n > 2,000,000, all experience levels). [Link](https://strengthlevel.com) — used for population standards, pop_sigma calibration, and accessory lift ratios. Disclosed as self-reported (tier 4 per M1); cross-validated against Bielik 2024.
- **Jaric, S. (2002).** Allometric scaling of strength measurements to body size. *European Journal of Applied Physiology.* [allometric exponent empirical range 0.64–0.71]
- **Nuckols, G.** What is Strong? (Stronger by Science). [Link](https://www.strongerbyscience.com/how-to-get-strong-what-is-strong/) — n=1,800 survey used for strength standards cross-validation.
- **Vanttinen, M. et al. (2024).** Efficiency of the Wilks and IPF Formulas through Analysis of the Open Powerlifting Database. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7523908/)
- **Plateau principle (first-order kinetics)** — applicable to training adaptation curves; consistent with motor-learning literature.
