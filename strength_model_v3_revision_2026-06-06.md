---
name: strength_model_v3_revision
description: Data-analyst revision of the Peak Fettle percentile/ranking math. Supersedes the v2.1 design in strength_curve_model.md for the ranked + overall components. Pairs with TICKET-093. Founder-signed direction (2026-06-06): bodyweight-normalized ranked ladder; calibrated composite for the overall tier.
type: technical_doc
owner: Data Analyst Subteam
date: 2026-06-06
status: DESIGN — not yet implemented (see TICKET-093)
supersedes: strength_curve_model.md §4.5 (sex-only ranking layer), §4.5.6 (mean-of-percentiles aggregation)
model_version_target: 3
---

# Peak Fettle Strength Model — v3 Revision (math design)

This memo is the data-analyst revision requested 2026-06-06. It (a) critiques the shipped v2/v2.1 math, (b) documents where the implementation silently drifted from the locked executive design, and (c) specifies the revised v3 equations for the dev team. **No production SQL or seed values change until TICKET-093 is executed** — this is the design of record that ticket implements.

## 0. Founder decisions — locked 2026-06-06

Direction:
1. **Ranked component is bodyweight-normalized**, not sex-only-absolute (returns to exec Decision 2; sex is the cohort, bodyweight handled *inside* the score).
2. **Overall strength score is a calibrated composite** — "top 10%" means top 10% of same-sex lifters.

Open items resolved this session (were §9):

- **D1 — currency:** DOTS as the engine; Wilks + IPF GL as display-only alternates (TICKET-046). *(IPF's current official is GoodLift, not DOTS — DOTS chosen deliberately for recognizability.)*
- **D2 — quantile map:** beg=20 / nov=40 / int=60 / adv=85 / elite=97 / **world-class=99.5** (new top anchor). Fit verified, caveat in §5.2.
- **D3 — per-lift normalization:** allometric per-lift; DOTS reserved for the aggregate total.
- **D4 — partial total:** the official tier requires squat+bench+deadlift; a *provisional* tier shows on whatever lifts the user has.
- **D5 — undisclosed sex:** 50/50 mixture of the male and female distributions.
- **D6 — consolidation:** the ranked lens and the sex+bodyweight population lens are the same math — merge them. All percentiles are computed against the **model-calibrated distribution, never the live user base** (a small base makes an empirical mapping meaningless; this is also why the math is portable on-device). Retires the live-user "confidence ring" part of exec Decision 4.

Genuinely remaining (data pass / TICKET-053): exact World Class standard values per lift, the beginner-anchor residual, and the tier-band cutoffs — see §9.

---

## 1. What's wrong with v2 / v2.1

The v2 experience-adjusted model is sound in structure (log-normal, allometric BW, first-order training curve). The defects are in calibration granularity and in the v2.1 ranking layer.

1. **Ranking layer ignores bodyweight by design (v2.1, §4.5/§4.10).** The sex-only lens ranks on absolute load, so at equal load a heavier lifter always outranks a lighter one — a bulk-to-rank incentive on what is meant to be a competitive ladder. This is the biggest issue and the founder has reversed it.
2. **Overall = unweighted mean of per-lift percentiles (§4.5.6) is statistically mis-calibrated.** The percentile of a sum is not the mean of the percentiles. Averaging compresses toward 50 and ignores inter-lift correlation, so tier bands defined as percentile cutoffs do not correspond to real population shares. Simulated (2M lifters, common-factor model):

   | Displayed "overall" | True percentile, independent lifts | True percentile, ρ≈0.7 (realistic SBD) |
   |---|---|---|
   | 60 | 71.6 | 62.3 |
   | 70 | 87.9 | 74.1 |
   | 80 | 96.4 | 84.9 |
   | 90 | 99.5 | 94.0 |

   The doc's worked "overall 70.6 → Gold" is really ~74th–88th percentile depending on correlation. Tiers are wrong where they matter most (the top).
3. **σ is a single constant per lift×sex** across all bodyweights, ages, and experience levels (homoscedastic). Real within-cohort spread widens with training age; novices are tighter than advanced lifters. `σ = ln(adv/int)/1.282` is anchored at exactly one band.
4. **Calibration uses only 2 of 5 standards for spread.** `pop_sigma = ln(elite/beginner)/3.29` is a two-point endpoint fit; novice/intermediate/advanced anchors are unused, so the noisiest extremes drive the spread. A 5-anchor least-squares lognormal fit is more robust.
5. **One global allometric exponent α = 0.667 for all lifts and both sexes.** Press-pattern lifts and pulls scale differently with bodyweight (Jaric 2002 empirical range 0.64–0.71). A per-lift (optionally per-sex) α is warranted.
6. **Age curve is crude piecewise-linear**, max 5.0pp error vs McCulloch/Foster at age 40, single shape for all lifts/sexes. Strength does not develop linearly in youth or decline linearly in masters.
7. **Undisclosed-sex σ deviates from the locked spec.** `compute_percentile_sex_only` averages sigmas arithmetically `(σ_M+σ_F)/2`; exec Decision 5 specified RMS pooling `√((σ_M²+σ_F²)/2)`. Different numbers; the implementation is the unintended one.
8. **e1RM input degrades for high-rep entries.** Epley above ~5 reps carries ±5% noise (limitation 8); ranked scores inherit it.

---

## 2. Drift from the locked executive design

`exec-percentile-decisions.md` (2026-05-10) is the signed design. The implementation diverged on three counts — the rework reconciles them:

| Exec decision | Implemented | v3 action |
|---|---|---|
| **D2:** DOTS is the ranking formula | No DOTS anywhere; custom allometric power law | Adopt DOTS as the normalized-score currency (§4) |
| **D1:** BW excluded from cohort *because DOTS handles it* | Ranked layer drops BW entirely (no normalization) | Ranked = percentile of DOTS score; BW handled in-score (§3 Lens 2/3) |
| **D5:** undisclosed σ = RMS pooled | Arithmetic mean of σ | RMS pooled, or 50/50 mixture (§6) |

The custom allometric model is *not discarded* — it remains the engine for Lens 1 (experience-adjusted). DOTS becomes the currency for the ranked lenses, exactly as D1/D2 intended.

---

## 3. v3 architecture — two lenses (consolidated per D6)

| Lens | Question | Cohort | BW handling | Drives |
|---|---|---|---|---|
| **1. Experience-adjusted** | "vs lifters at my level?" | sex × age × years (× discipline) | allometric covariate | personal dashboard |
| **2. Ranked (sex + bodyweight)** | "where do I rank, pound-for-pound?" | sex | allometric per-lift / DOTS total | per-lift ranked % **and** the overall tier |

Lens 2 **merges three things that were separate in v2/v2.1** — the sex+bodyweight population percentile (old `compute_percentile_simple`), the ranked per-lift score, and the overall composite — because once bodyweight is normalised *inside* the score, they are the same cohort and the same math, just per-lift vs aggregated. The v2.1 **sex-only absolute lens is retired entirely** (it may survive as a non-ranked "raw load" display stat, but it computes nothing for the ranking).

**Function consolidation:** `compute_percentile_simple` and `compute_percentile_sex_only` are both **removed**; a single `compute_ranked_percentile` (allometric, per-lift) replaces them, and `overall_strength_percentile` becomes the calibrated DOTS-total composite. `compute_percentile` (Lens 1) stays.

### Lens 1 — Experience-adjusted (revise, don't replace)

Keep the v2 form `L₅₀ = exp(μ)·B(BW)·A(age)·T(years)`, `pct = 100·Φ((ln L − ln L₅₀)/σ)`, with four fixes:

- **Per-lift (optionally per-sex) α**, bounded to [0.62, 0.72]; fit to OPL/source data, default 0.667 only where unfit.
- **Heteroscedastic σ(years):** let within-cohort spread grow with training age, `σ(t) = σ_nov + (σ_adv − σ_nov)·(1 − e^{−t/τ_σ})`, anchored so the novice band matches the beginner→novice spread and the advanced band matches int→elite. Falls back to constant σ if data is thin.
- **5-anchor calibration:** fit (μ, σ, f₀) by least squares over all five standards (beg/nov/int/adv/elite) on the log-quantile line, not 2-point endpoints.
- **Smooth age curve:** replace piecewise-linear with the McCulloch/Foster coefficients via table lookup + linear interpolation (the v2 doc itself flagged this as the upgrade path). Keep the multiplicative-on-median structure so it's a drop-in.

### Lens 2a — Ranked per-lift (allometric, bodyweight-normalized) — D3

The per-lift ranked number uses allometric normalization (not per-lift DOTS). This **is** the old Equation B — that is the point of the D6 merge:

```
ranked_pct_lift = 100 · Φ( (ln L − (pop_mu_lift,sex + α·ln(BW/BW₀))) / pop_sigma_lift,sex )
```

`(pop_mu, pop_sigma)` are the lognormal params of the same-sex, bodyweight-normalized population for that lift, calibrated from the standards (§5). The "sex+bodyweight population percentile" and the "ranked per-lift" number are now one function.

### Lens 2b — Overall composite (the calibrated tier) — D2/D4

```
DOTS_total = (best_e1RM_squat + best_e1RM_bench + best_e1RM_deadlift) · C(BW, sex)
overall_pct = 100 · Φ( (ln DOTS_total − μ_D,sex) / σ_D,sex )
```

This is the percentile of a **single combined quantity**, so it is calibrated by construction — `overall_pct = 80` means exactly the 80th percentile of same-sex lifters by DOTS total, regardless of lift correlation. Tier bands (TICKET-053) are set as true population-fraction cutoffs on `overall_pct` (§5.2 / §9), now including a **World Class** band above Elite per D2.

- **Partial total (D4):** the official tier requires squat+bench+deadlift. Users missing one or more get a **provisional tier** computed on a calibrated subset of the lifts they have (each subset total carries its own fitted `μ_D, σ_D`), shown with a "provisional" marker until the canonical three exist.
- **Why this beats mean-of-percentiles:** the §1.2 table — a sum's percentile and the mean of percentiles diverge by up to ~18pp.
- DOTS is used only for the aggregate total (D3); per-lift uses allometric (Lens 2a).

---

## 4. DOTS adoption

```
DOTS = W · 500 / (A + B·BW + C·BW² + D·BW³ + E·BW⁴)      W, BW in kg
```

| Coef | Male | Female |
|---|---|---|
| A | −307.75076 | −57.96288 |
| B | 24.0900756 | 13.6175032 |
| C | −0.1918759221 | −0.1126655495 |
| D | 0.0007391293 | 0.0005158568 |
| E | −0.0000010930 | −0.0000010706659 |

**Verification test vectors** (implementer must reproduce these to ±0.1 before shipping):

| Sex | BW (kg) | Total (kg) | DOTS |
|---|---|---|---|
| M | 93 | 600 | 381.75 |
| M | 75 | 500 | 358.71 |
| M | 120 | 700 | 402.01 |
| F | 63 | 400 | 430.21 |
| F | 57 | 300 | 343.71 |

Male coefficients verified against multiple public DOTS references; female coefficients are the standard published set — **re-confirm both against the IPF "Models Evaluation 2020" PDF** (already cited in `strength_curve_model.md` §9) and lock the test vectors into a unit test. **DOTS vs IPF GL:** the IPF's *current* official points system is GoodLift (IPF GL), not DOTS; exec D2 said "DOTS." DOTS is more widely recognized by general lifters and simpler; recommend DOTS, surface IPF GL + Wilks as display alternates per D2 and TICKET-046. Confirm in §9.

---

## 5. Calibration of the ranked/overall distribution

All percentiles are computed against this **model-calibrated distribution — never against the live Peak Fettle user base** (D6: a small base makes an empirical mapping meaningless, and the model is portable on-device precisely because it is not user-relative). This retires the live-user "confidence ring" portion of exec Decision 4; rankings are stable and meaningful from day one.

### 5.1 Standards extended with a World Class anchor (D2)

The `strength_curve_model.md` §5 table tops out at Elite. Add a sixth **World Class** column (provisional ×BW at reference BW — re-confirm against Bielik 2024 in the data pass):

| Lift | M Elite | M World Class | F Elite | F World Class |
|---|---|---|---|---|
| Squat | 2.50 | 3.00 | 1.65 | 2.00 |
| Bench | 1.50 | 2.00 | 1.10 | 1.40 |
| Deadlift | 2.75 | 3.25 | 1.95 | 2.40 |
| OHP | 1.05 | 1.30 | 0.75 | 0.95 |

These align with the Bielik 2024 raw-competition top end already cited in v2 (M squat ~2.83, deadlift ~3.25 ×BW), so World Class ≈ competition ~90th ≈ general-trained ~99.5th.

### 5.2 Quantile map + verified fit (D2)

| beg | nov | int | adv | elite | world-class |
|---|---|---|---|---|---|
| 20th | 40th | 60th | 85th | 97th | 99.5th |

Fit lognormal by least squares on `ln(load)` vs `Φ⁻¹(quantile)` across all **six** anchors (vs the 2-point endpoint fit in v2). Verified fit (male, reference BW):

| Lift | μ | σ | R² | implied median |
|---|---|---|---|---|
| Squat | 4.53 | 0.377 | 0.95 | 93 kg (1.24×BW) |
| Bench | 4.08 | 0.374 | 0.96 | 59 kg (0.79×BW) |
| Deadlift | 4.73 | 0.324 | 0.96 | 113 kg (1.51×BW) |

**Caveat (data-pass item):** the fit is clean (R²≈0.95) *except at the beginner anchor* — the standards place "beginner" nearer the ~10th percentile than the mapped 20th, so least squares splits the difference there. Either tighten the map (beginner≈10–12th) or keep the small residual; flag for the first-party re-fit. Novice and up sit on the line.

### 5.3 Procedure
1. Convert each standard to an absolute load at BW₀, then (for the overall tier) to a DOTS total.
2. Apply the §5.2 quantile map.
3. Least-squares lognormal fit over six anchors → `(pop_mu, pop_sigma)` per lift (Lens 2a) and `(μ_D, σ_D)` per sex (Lens 2b).
4. Cross-validate the upper tail vs Bielik 2024 (competition self-selection ≈ 97th–98th population percentile, as in v2).

Keeps the "calibrated, not yet estimated" posture; re-fit on first-party data once cohorts are large (v2 limitations 2–3).

---

## 6. Undisclosed sex — 50/50 mixture (D5, locked)

```
ranked_pct_undisclosed = 100 · ( 0.5·Φ(z_M) + 0.5·Φ(z_F) )
```

Compute the percentile under both the male and female distributions and average them (π = 0.5; a population male-share prior can replace 0.5 later). This replaces both the exec-D5 synthetic-normal and the current arithmetic-mean-σ implementation (the latter was an unintended deviation and is removed).

---

## 7. e1RM input quality

Ranked scores are only as good as the 1RM estimate. Recommend: (a) prefer logged near-maximal singles; (b) for multi-rep, use an RPE/RIR-aware e1RM where available (ties to TICKET-044 RPE field, TICKET-045 1RM-formula selection) and a blended Epley/Brzycki otherwise; (c) cap reps used for ranking (e.g. ignore sets > 10 reps for e1RM, or down-weight by reliability). This is an input-layer change, not a model change.

---

## 8. Why the composite is correct (one line of math)

For lifts with marginal percentiles `p_i = F_i(x_i)`, the mean `(1/k)Σp_i` is **not** itself uniform — its variance is far below 1/12, so it clusters around 0.5 (the §1.2 table). The percentile of the **combined DOTS total**, `F_total(Σ scaled lifts)`, *is* uniform by the probability integral transform — hence calibrated. Correlation between lifts is absorbed into `σ_D` at fit time rather than corrupting the score.

---

## 9. Decisions — status

**Resolved 2026-06-06** (see §0): D1 DOTS currency · D2 quantile map + World Class anchor · D3 allometric per-lift · D4 provisional partial-total tier · D5 mixture · D6 consolidate lenses + model-derived (no live users).

**Genuinely remaining** (data pass / TICKET-053):

1. **Exact World Class standard values** per lift — §5.1 are provisional; confirm against Bielik 2024.
2. **Beginner-anchor residual** (§5.2) — accept ~10–12th or keep the residual.
3. **Tier band cutoffs** on `overall_pct`, including the new World Class band (TICKET-053). Proposed starting ladder (population shares): Iron ≤40 · Bronze 40–60 · Silver 60–75 · Gold 75–88 · Platinum 88–95 · Diamond 95–99 · Elite 99–99.7 · **World Class ≥99.7**. Tunable; honest now that the scale is calibrated.

---

## 10. Versioning & rollout

Bump `model_version` 2 → 3 per `strength_curve_model.md` §8: run v2 and v3 in parallel for one weekly-batch cycle, validate distribution shifts, atomic-swap. Historical rankings retain their original `model_version`. Note: under the local-first migration (`LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md`) these functions are being ported to on-device TypeScript — v3 should be specified once and implemented in the TS port, not re-fit twice.
