---
name: data_analyst_skill
description: Reference doc for the Peak Fettle data analyst agent. Encodes the methodological standards (sample size minimums, source hierarchy, allometric scaling, regression validation, peer-review preference) plus a living findings log for every quantitative deliverable produced for the project. The data analyst agent MUST read this file at the start of a session and append to the FINDINGS LOG at the end.
type: skill
owner: Arvin
last_reviewed: 2026-05-01
---

# Data Analyst Skill — Peak Fettle

This file is the operating manual for the data analyst agent. It has three halves:

1. **METHODS** — locked, evidence-grounded methodology. Update only when a stronger standard supersedes.
2. **DOMAIN PRIORS** — the load-bearing facts about strength, percentiles, and lift physiology that every Peak Fettle quantitative model relies on.
3. **FINDINGS LOG** — living section. Update at the end of every analysis with the dataset(s) used, the model produced, the calibration anchors, and the limitations.

Read all three sections before starting work. Apply METHODS to every analysis. Update FINDINGS LOG so future agents inherit the calibration history.

---

## PART 1 — METHODS (locked)

### M1. Source hierarchy (hardest evidence wins)
Rank sources by evidentiary strength before citing or modeling against them:
1. **Peer-reviewed meta-analyses** with disclosed methodology and sample sizes >10,000 (e.g., Bielik 2024, n=809,986 powerlifting entries).
2. **Federation-published formulas** with disclosed regression methodology (IPF GL 2020, DOTS, Wilks-2). These are the operational standards used for global ranking and have been audited against millions of competition entries.
3. **Open datasets** (OpenPowerlifting ~900K entries, public domain). Use for regression and calibration; recognize self-selection bias.
4. **Industry aggregators** (Strength Level, Symmetric Strength, Stronger By Science). Useful for accessory/non-competition lifts where federation data does not exist; disclose that these are self-reported.
5. **Single-author standards tables** (Lyle McDonald, Dan John, ExRx). Useful as sanity-check anchors only — not as primary sources.

Whenever multiple tiers are available, cite tier-1 first and use lower tiers only to fill gaps.

### M2. Minimum sample size
Do not publish a coefficient or percentile to the dev team that was fit on **fewer than 5,000 observations** unless the source dataset is explicitly disclosed and the limitation is annotated in the model output. For accessory/uncommon lifts where this threshold cannot be met, derive the lift from a parent compound using a documented ratio (e.g., OHP ≈ 0.60 × bench) rather than fit directly to a small sample.

### M3. Allometric scaling, not linear
Strength does not scale linearly with bodyweight. Force ∝ muscle cross-sectional area ∝ BW^(2/3) under isometric scaling assumptions; empirical exponents in trained adults fall in the 0.64–0.71 range (Jaric 2002; Folland 2008). Default to α = 0.667 for any lift without a federation-published polynomial. For squat/bench/deadlift/total, prefer the DOTS 4th-order polynomial — it is more accurate at the tails and is the de facto global standard since 2019.

### M4. Sex-specific coefficients always
Never apply a male-fit equation to female data with a flat scalar. The strength curve shape differs between sexes — particularly for upper body, where the F:M ratio (~0.69 at 90th percentile bench) is much lower than for lower body (~0.80 squat, ~0.82 deadlift). Every coefficient vector must be sex-tagged.

### M5. Age effect is non-monotonic and federation-validated
Strength rises through late adolescence, peaks 23–35, declines slowly to 50, then accelerates downward. Use the McCulloch (40+) and Foster (14–23) coefficients as the calibrated reference. They are supported by USAPL/IPF tournament data spanning decades. Do not invent age curves from cross-sectional general-population data — that data conflates "did not lift" with "could not lift" and underestimates trained-population capacity.

### M6. Training experience as exponential approach to asymptote
The strength-by-experience curve is well-modeled by L(t) = L_∞ × (f₀ + (1 − f₀) × (1 − e^(−t/τ))), where f₀ is the novice floor (≈0.55), τ is the time constant in years (≈3.0), and L_∞ is the asymptote (the genetic ceiling for that user's profile). This is the same first-order-kinetics form used in pharmacology and motor-learning literature; it captures both the rapid early gains and the diminishing returns plateau. Reject linear novice-→intermediate-→advanced step functions: they create discontinuities at category boundaries that break percentile interpolation.

### M7. Regression diagnostics on every fit
For any new regression-based coefficient, report: R², residual SE, Cook's distance for outliers, and whether residuals are heteroscedastic. A model with R² = 0.4 and unreported residuals is worse than no model — it gives the dev team false precision.

### M8. Calibrate against published anchors before shipping
Every equation must be sanity-checked against at least three published anchor points before handoff:
- A median-trained reference case (e.g., intermediate male squat ≈ 1.5×BW)
- An elite/competition-tail case (e.g., 90th-percentile competitor squat from Bielik 2024)
- An age-effect case (e.g., 60-year-old male should be ~1.19× the strength of a 40-year-old per McCulloch)

If the equation deviates >10% from any anchor, re-derive — do not ship.

### M9. Express output as a vector, not a function body
Dev-team handoffs must separate the *parameters* (a per-lift, per-sex vector) from the *function* (the same code for every lift). This makes adding lifts a data update, not a code change. Every equation must be deliverable as:
- A coefficient table (per lift × sex)
- A single closed-form scoring function that consumes the table

### M10. SQL-first for batch jobs
Peak Fettle's percentile rankings run as a weekly Postgres batch job (per `peak_fettle_project.md`). Equations destined for that batch must be expressible as a SQL function — not require Python at runtime. Test the SQL function on the actual `percentile_vectors` schema before declaring complete.

### M11. Disclose limitations in plain language
Every quantitative deliverable ends with a "Known Limitations" section written for a non-statistician. Include: which population the model represents, what it does NOT cover, the calibration tail behavior, and any decisions made by the analyst rather than by the data.

### M12. Versioning is non-negotiable
Each coefficient table is shipped with: dataset name + access date, methodology hash, calibration anchor list, and a `model_version` integer. The dev team consumes the version, not the bare numbers, so re-fits do not silently change historical user percentiles.

---

## PART 2 — DOMAIN PRIORS (locked, periodically re-checked)

These are the load-bearing empirical facts that every Peak Fettle quantitative model rests on. They are extracted from the most authoritative datasets available as of 2026-05-01.

### Bodyweight scaling (DOTS, validated on millions of IPF entries)
**Male coefficients** (BW range 40–210 kg):
a = −0.0000010930, b = 0.0007391293, c = −0.1918759221, d = 24.0900756, e = −307.75076

**Female coefficients** (BW range 40–150 kg):
A = −0.0000010706, B = 0.0005158568, C = −0.1126655495, D = 13.6175032, E = −57.96288

**DOTS denominator function:** D(BW) = a·BW⁴ + b·BW³ + c·BW² + d·BW + e

### Sex-specific 90th-percentile bodyweight ratios (Bielik 2024, n=809,986, ages 18–35)
| Lift     | Male | Female | F:M ratio |
|----------|------|--------|-----------|
| Squat    | 2.83 | 2.26   | 0.80      |
| Bench    | 1.95 | 1.35   | 0.69      |
| Deadlift | 3.25 | 2.66   | 0.82      |

### Population strength standards (intermediate ≈ 50th percentile of trained pop)
| Lift     | M Beg | M Nov | M Int | M Adv | M Eli | F Beg | F Nov | F Int | F Adv | F Eli |
|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| Squat    | 0.75  | 1.25  | 1.50  | 2.00  | 2.50  | 0.50  | 0.85  | 1.00  | 1.35  | 1.65  |
| Bench    | 0.50  | 0.75  | 1.00  | 1.25  | 1.50  | 0.30  | 0.50  | 0.70  | 0.90  | 1.10  |
| Deadlift | 1.00  | 1.50  | 1.75  | 2.25  | 2.75  | 0.65  | 1.00  | 1.25  | 1.65  | 1.95  |
| OHP      | 0.40  | 0.55  | 0.65  | 0.85  | 1.05  | 0.20  | 0.30  | 0.45  | 0.60  | 0.75  |

### McCulloch age coefficients (USAPL official, applied as multiplicative correction)
| Age | Coef  | Age | Coef  |
|-----|-------|-----|-------|
| 23  | 1.000 | 60  | 1.287 |
| 30  | 1.000 | 65  | 1.450 |
| 40  | 1.000 | 70  | 1.645 |
| 50  | 1.130 | 80  | 2.050 |

### Foster youth coefficients (USAPL, ages 14–23)
14: 1.23 | 15: 1.18 | 16: 1.13 | 17: 1.08 | 18: 1.06 | 19: 1.04 | 20: 1.03 | 21: 1.02 | 22: 1.01 | 23: 1.00

### Compound→accessory ratios (industry aggregator data, sample-size weighted)
- Overhead press / bench = 0.55–0.75 (use 0.65)
- Barbell row / bench = 0.85–0.95 (use 0.90)
- Front squat / back squat = 0.80–0.90 (use 0.85)
- Romanian deadlift / deadlift = 0.75–0.90 (use 0.82)
- Incline bench / flat bench = 0.70–0.85 (use 0.78)
- Close-grip bench / flat bench = 0.85–0.95 (use 0.90)
- Pendlay row / bent row = 0.92
- Dumbbell bench (each) / barbell bench = 0.40–0.45 (use 0.42)

### Training-progression model parameters (calibrated)
- Novice floor f₀ = 0.55 (raw novice can lift ~55% of their eventual asymptote at year 0 of consistent training)
- Time constant τ = 3.0 years
- Reaches 95% of asymptote ≈ 9 years of consistent training (matches Nuckols/SBS observation that >5–8 years is where most experienced lifters land)

---

## PART 3 — FINDINGS LOG (living)

> **Update protocol:** at the end of every analysis session, append a new row. Include date, deliverable, datasets used, anchor points checked, and any deviations from default parameters. If a prior finding is invalidated by new data, strike through with `~~text~~` and link to the correction.

### Session log
| Date       | Deliverable                                   | Datasets / sources                                                                                                                                                                                       | Calibration anchors used                                                                                          | Notes / limitations                                                                                                                                                                                                                                                  |
|------------|-----------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 2026-05-01 | ~~strength_curve_model.md v1 + compute_percentile.sql v1 + lift_vectors_seed.sql v1~~ | Bielik 2024 (n=809,986); DOTS 2019 (IPF-adopted); McCulloch/Foster (USAPL); industry aggregator ratios (Strength Level, ExRx, Symmetric Strength); Nuckols SBS reader survey n=1,800 | Male intermediate squat = 1.5×BW @ BW=75 → 50th %ile; Bielik 90th %ile male squat = 2.83×BW; McCulloch age 60 = 1.287× | **INVALIDATED by v2 (2026-05-10).** Root bug: μ was set to ln(intermediate × BW₀), making the intermediate standard the training asymptote instead of a 2-year calibration anchor. Resulted in severely under-predicted L₅₀ for experienced trainees. See v2 row. |
| 2026-05-10 | strength_curve_model.md v2 + compute_percentile.sql v2 + lift_vectors_seed.sql v2 | Bielik 2024 (n=809,986, tier 1); OpenPowerlifting ~1.3M entries (tier 3); Strength Level n>2,000,000 self-reported (tier 4, largest sample available for general trained population); McCulloch/Foster (USAPL, tier 2); Nuckols/SBS n=1,800 survey; ExRx + Lyle McDonald strength standards (tier 5 sanity-check) | (1) Beginner/intermediate dual-anchor: T(0)×exp(μ)=beg×BW₀ AND T(2yr)×exp(μ)=int×BW₀ — exact match by construction. (2) Advanced standard = 90th pctile within each experience band (via σ). (3) Bielik 2024 squat 90th pctile (2.83×BW) → model 90th at T(7yr) = 2.851×BW (+0.7% ✓). (4) Bench/deadlift Bielik gaps 5.6–8.7% — expected from competition self-selection vs. general trained population. (5) User test case 20yo M 77.1kg 4yr bench: v1 predicted 139 lb, v2 predicts 204 lb (~200 lb expected for this profile ✓). (6) McCulloch age 60 implied 0.777 vs model 0.750 (−2.7%, within ±5% tolerance ✓). (7) Population model (simple equation): Bielik competition 90th pctile maps to model z=2.0 (97.7th pctile general trained population ✓). | Two-equation architecture: (A) experience-adjusted percentile — compares vs. same sex/BW/age/training-years peers; (B) simple population percentile — compares vs. all strength trainees of same sex at same BW (no age/experience inputs). σ is within-experience-level variation only (v2 fix); pop_sigma captures full trained-population spread from beginner to elite. New schema: bw_ref_kg and training_floor now nullable for inherited lifts (v1 schema bug fixed). f₀ per-lift (range 0.267–0.438), τ=3.0 universal. Olympic lifts still deferred (v3). σ re-fit with internal data recommended at ≥5,000 users/lift. |

### Open questions / parked items
- Sport-specific lifts (clean & jerk, snatch, power clean) need a separate fit — Olympic weightlifting bodyweight curve differs from powerlifting; requires USAW/IWF data. Defer to v3.
- Machine lifts: ratios are inherited from compound parents; re-validate once Peak Fettle has ≥5,000 logged sets per machine lift.
- σ (within-experience-level variation) is currently anchored to strength standards (advanced/intermediate ratio). Should be re-fit to Peak Fettle's own user data at ≥5,000 active users per lift.
- pop_sigma (population spread) is derived from beginner→elite standard span. A direct large-n survey (replicating Nuckols/SBS at n≥10,000) would tighten this. Flag for v3.
- Epley 1RM conversion: Peak Fettle's set tracker captures multi-rep sets. Client-side conversion adds ±5% noise above 5 reps. Consider a user-confirmed 1RM option to improve model precision.
- The model assumes consistent strength training; users who trained, stopped, and resumed are misclassified by training_years. Consider a "consistent years" input field.

---

## How the data analyst agent uses this file

1. **At session start:** Read all three parts. Verify the DOMAIN PRIORS table is current (re-check sources only if a prior is more than 12 months stale or a new federation update has been announced).
2. **During analysis:** Apply M1–M12 in flow. For every coefficient produced, label the source tier and the sample size.
3. **At session end:** Append a new row to the FINDINGS LOG with deliverable, datasets, anchors, and notes. Flag any deviation from default parameters with the reason.
4. **For dev team handoff:** Always produce (a) a math doc explaining the equation, (b) a coefficient vector table, and (c) a SQL function that consumes the table — per M9 and M10.

---

## Sources (for the priors and methods)

- Bielik et al. (2024). [Normative data for the squat, bench press and deadlift exercises in powerlifting: Data from 809,986 competition entries.](https://pubmed.ncbi.nlm.nih.gov/39060209/) *Journal of Science and Medicine in Sport.*
- IPF (2020). [IPF GL Coefficients (official).](https://www.powerlifting.sport/fileadmin/ipf/data/ipf-formula/IPF_GL_Coefficients-2020.pdf)
- IPF (2020). [Evaluation of Wilks, Wilks-2, DOTS, IPF and GoodLift Formulas.](https://www.powerlifting.sport/fileadmin/ipf/data/ipf-formula/Models_Evaluation-I-2020.pdf)
- USAPL. [Foster and McCulloch Age Coefficients.](https://www.usapowerlifting.com/wp-content/uploads/2021/01/USAPL-Age-Coefficients.pdf)
- OpenPowerlifting. [opl-csv data service.](https://openpowerlifting.gitlab.io/opl-csv/) Public domain, ~900K entries.
- Jaric, S. (2002). Allometric scaling of strength measurements to body size. *European Journal of Applied Physiology.*
- Folland, J.P. & Williams, A.G. (2008). Allometric scaling exponents in adult males. — empirical 0.64–0.71 range.
- Nuckols, G. [What is Strong? (Stronger by Science).](https://www.strongerbyscience.com/how-to-get-strong-what-is-strong/) Survey n=1,800.
- Vanttinen, M. et al. (2024). [Efficiency of the Wilks and IPF Formulas through Analysis of the Open Powerlifting Database.](https://pmc.ncbi.nlm.nih.gov/articles/PMC7523908/)
- Plateau principle (first-order kinetics) — applicable to training adaptation curves.
