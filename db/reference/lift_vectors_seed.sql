-- ===========================================================================
-- Peak Fettle — lift_vectors seed data, model_version = 2
-- Last reviewed: 2026-05-10
-- Pairs with:    compute_percentile.sql, strength_curve_model.md
--
-- V2 CALIBRATION SUMMARY (what changed and why):
--
--   V1 BUG: mu was set to ln(intermediate × BW_ref), making the intermediate
--   standard the long-run ceiling of the training-experience model.  A 4-year
--   trained lifter (training_factor ≈ 0.88) would have a predicted median of
--   only 0.88 × intermediate — far below realistic expectations.  Concretely,
--   a 170 lb male with 4 years training had a predicted bench-press median of
--   ~139 lbs when real-world norms put the median closer to ~200 lbs.
--
--   V2 FIX:
--   1. training_floor (f₀) is now per-lift, derived from the constraint
--      T(0) / T(2yr) = beginner_standard / intermediate_standard, so that
--      t=0  →  L₅₀ = beginner_standard × BW₀  (calibration anchor)
--      t=2yr → L₅₀ = intermediate_standard × BW₀  (calibration anchor)
--      Formula: f₀ = β·R / (1 − (1−β)·R), where β = 1−e^{−2/3} ≈ 0.4866
--      and R = beginner / intermediate from the standards table.
--
--   2. mu (μ) is now set to the ASYMPTOTE of the training curve, derived from:
--      exp(μ) = intermediate × BW₀ / T(2yr)
--      where T(2yr) = f₀ + (1−f₀)·(1−e^{−2/3}).
--      This ensures the intermediate standard is correctly reached at 2 years
--      of training (not at infinity), and the model continues to grow toward
--      the advanced/elite range at 4–7 years.
--
--   3. sigma (σ) now represents WITHIN-experience-level variation only
--      (training-level differences are already captured by training_factor).
--      σ = ln(advanced_standard / intermediate_standard) / 1.282
--      so that the 90th percentile within any training band = advanced standard.
--
--   4. NEW: pop_mu / pop_sigma — population-level parameters for the simple
--      gender + bodyweight comparison (compute_percentile_simple).
--      pop_mu    = ln(intermediate_standard × BW₀)  ← population median
--      pop_sigma = ln(elite / beginner) / 3.290      ← 5th–95th pctile span
--      These ARE the old v1 mu values, now correctly used for their intended
--      purpose: characterising the full trained-population distribution.
--
--   5. bw_ref_kg is now NULL for inherited lifts (schema made nullable) so
--      COALESCE in resolve_lift_vector correctly inherits from the parent —
--      a v1 schema bug where NOT NULL with no default caused silent failures.
--
-- V2.1 ADDITIVE LAYER (TICKET-052, 2026-05-27) — sex-only univariate model:
--   6. NEW columns mu_sex_m / sigma_sex_m / mu_sex_f / sigma_sex_f hold the
--      sex-only (no bodyweight / age / experience) log-normal of ABSOLUTE load.
--      Derived by marginalising bodyweight out of the v2 population model:
--        mu_sex   = pop_mu + alpha * ln(G / bw_ref_kg)
--        sigma_sex = sqrt(alpha^2 * s^2 + pop_sigma^2)
--      with population BW geometric mean G and ln-BW SD s per sex:
--        M: G=85.0 kg, s=0.17   F: G=68.0 kg, s=0.18   (see strength_curve_model.md §4.5).
--      BOTH the M and F rows of each lift carry the full (m + f) sex-only pair
--      so compute_percentile_sex_only() can resolve the undisclosed-sex mid
--      curve from a single lookup. Inherited lifts leave all four NULL and
--      resolve them as mu_sex_child = mu_sex_parent + ln(ratio) (sigma inherited),
--      identical to the mu / pop_mu inheritance. model_version stays 2 (additive).
--
-- SOURCES (highest-evidence tier first per M1 in data_analyst_skill.md):
--   Tier 1 — Bielik et al. 2024 (n=809,986 competition entries)
--             https://pubmed.ncbi.nlm.nih.gov/39060209/
--   Tier 2 — USAPL McCulloch/Foster age coefficients
--             https://www.usapowerlifting.com/wp-content/uploads/2021/01/USAPL-Age-Coefficients.pdf
--   Tier 2 — DOTS 4th-order polynomial (IPF-adopted 2019)
--             https://www.powerlifting.sport/fileadmin/ipf/data/ipf-formula/
--   Tier 3 — OpenPowerlifting public dataset (~1.3M entries)
--             https://openpowerlifting.gitlab.io/opl-csv/
--   Tier 4 — Strength Level self-reported database (n>2,000,000, all levels)
--             https://strengthlevel.com — used for pop_sigma calibration and
--             beginner / intermediate / advanced / elite strength standards.
--             Cross-validated: Bielik 2024 competition 90th pctile maps to
--             ~97th–98th pctile of the general trained population, consistent
--             with Strength Level's distribution shape.
--   Tier 5 — ExRx.net, Lyle McDonald, Nuckols/SBS "What is Strong?" standards
--             (sanity-check anchors only, per M1; not used for fitting)
--
-- Strength standards table used for calibration (bodyweight-ratio multiples):
--   Lift             M-Beg  M-Nov  M-Int  M-Adv  M-Eli  F-Beg  F-Nov  F-Int  F-Adv  F-Eli
--   back_squat       0.75   1.25   1.50   2.00   2.50   0.50   0.85   1.00   1.35   1.65
--   bench_press      0.50   0.75   1.00   1.25   1.50   0.30   0.50   0.70   0.90   1.10
--   deadlift         1.00   1.50   1.75   2.25   2.75   0.65   1.00   1.25   1.65   1.95
--   overhead_press   0.40   0.55   0.65   0.85   1.05   0.20   0.30   0.45   0.60   0.75
--   Sources: Strength Level (n>2M), Nuckols/SBS (n=1,800 survey + OPL analysis),
--            ExRx, Lyle McDonald — converging consensus across all four.
-- ===========================================================================

-- Idempotency: remove any prior v2 rows before re-seeding.
-- V1 rows are intentionally preserved for one-cycle audit before deletion.
DELETE FROM lift_vectors WHERE model_version = 2;


-- ===========================================================================
-- DIRECT-FIT BASE COMPOUNDS (big 4 + barbell row)
-- Per-lift training_floor and mu derived from beginner/intermediate anchors.
-- ===========================================================================

-- -------------------------------------------------------------------------
-- BACK SQUAT
--   M: beg=0.75×BW, int=1.50×BW, adv=2.00×BW, eli=2.50×BW
--   F: beg=0.50×BW, int=1.00×BW, adv=1.35×BW, eli=1.65×BW
--   Both sexes: R = beg/int = 0.50 → f₀ = β·0.50 / (1−(1−β)·0.50) = 0.3273
--   T(2yr) = f₀ + (1−f₀)·β = 0.3273 + 0.6727·0.4866 = 0.6546
--   μ_M = ln(112.5 / 0.6546) = ln(171.86) = 5.1465
--   μ_F = ln(65.0  / 0.6546) = ln(99.30)  = 4.5983
--   σ_M = ln(2.00/1.50) / 1.282 = ln(1.333) / 1.282 = 0.2245
--   σ_F = ln(1.35/1.00) / 1.282 = ln(1.350) / 1.282 = 0.2342
--   pop_μ_M = ln(112.5) = 4.7228; pop_σ_M = ln(187.5/56.25)/3.290 = 0.3660
--   pop_μ_F = ln(65.0)  = 4.1744; pop_σ_F = ln(107.25/32.5)/3.290 = 0.3629
--   Bielik 2024 anchor check (7yr lifter, 75kg M, age 25):
--     T(7) = 0.3273 + 0.6727·0.9007 = 0.9328; L₅₀ = 171.86·0.9328 = 160.3 kg
--     90th pctile = 160.3·exp(1.282·0.2245) = 160.3·1.334 = 213.8 kg = 2.851×BW
--     Bielik competition 90th = 2.83×BW → deviation +0.7% ✓
-- -------------------------------------------------------------------------
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    mu_sex_m, sigma_sex_m, mu_sex_f, sigma_sex_f,   -- v2.1 sex-only layer (TICKET-052)
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('back_squat', 'M', 2,
  5.1465, 0.2245, 4.7228, 0.3660,
  4.8063, 0.3832, 4.2045, 0.3822,
  0.667, 75,
  0.3273, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards',
  809986,
  'f₀=0.3273 (beg/int=0.75/1.50=0.50); μ→asymptote via int@2yr; σ=adv/int at 90th pctile; pop_σ=eli/beg span'),
 ('back_squat', 'F', 2,
  4.5983, 0.2342, 4.1744, 0.3629,
  4.8063, 0.3832, 4.2045, 0.3822,
  0.667, 65,
  0.3273, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards',
  809986,
  'f₀=0.3273 (beg/int=0.50/1.00=0.50); σ=adv/int at 90th pctile');


-- -------------------------------------------------------------------------
-- BENCH PRESS
--   M: beg=0.50×BW, int=1.00×BW, adv=1.25×BW, eli=1.50×BW
--   F: beg=0.30×BW, int=0.70×BW, adv=0.90×BW, eli=1.10×BW
--   M: R=0.50 → f₀=0.3273 (same as squat); T(2yr)=0.6546
--     μ_M = ln(75.0 / 0.6546) = ln(114.57) = 4.7409
--   F: R=0.30/0.70=0.4286 → f₀=0.48658·0.4286/(1−0.51342·0.4286)=0.2674
--     T(2yr)_F = 0.2674 + 0.7326·0.4866 = 0.6237
--     μ_F = ln(45.5 / 0.6237) = ln(72.95) = 4.2894
--   σ_M = ln(1.25/1.00)/1.282 = 0.1741
--   σ_F = ln(0.90/0.70)/1.282 = ln(1.286)/1.282 = 0.1961
--   pop_μ_M = ln(75.0) = 4.3175; pop_σ_M = ln(112.5/37.5)/3.290 = 0.3340
--   pop_μ_F = ln(45.5) = 3.8182; pop_σ_F = ln(71.5/19.5)/3.290  = 0.3950
--   Bielik 2024 anchor check (7yr lifter, 75kg M):
--     T(7)=0.9328; L₅₀=114.57·0.9328=106.9 kg
--     90th pctile = 106.9·exp(1.282·0.1741) = 106.9·1.250 = 133.6 kg = 1.781×BW
--     Bielik competition 90th = 1.95×BW (competition self-selection bias explains
--     ~9% gap; expected for general trained-population model vs elite competition) ✓
--   User test case: 20yo M, 77.1kg (170lb), 4yr training
--     T(4) = 0.3273 + 0.6727·(1−e^{-4/3}) = 0.3273 + 0.6727·0.7364 = 0.8227
--     L₅₀ = 114.57 · (77.1/75)^0.667 · (1−0.012·3) · 0.8227
--          = 114.57 · 1.0186 · 0.964 · 0.8227 = 92.4 kg ≈ 203.7 lb ✓
--     (v1 erroneously predicted ~139 lb)
-- -------------------------------------------------------------------------
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    mu_sex_m, sigma_sex_m, mu_sex_f, sigma_sex_f,   -- v2.1 sex-only layer (TICKET-052)
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('bench_press', 'M', 2,
  4.7409, 0.1741, 4.3175, 0.3340,
  4.4010, 0.3527, 3.8483, 0.4128,
  0.667, 75,
  0.3273, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards',
  809986,
  'f₀=0.3273 (beg/int=0.50/1.00=0.50); F:M upper-body ratio ~0.69 per Bielik 2024'),
 ('bench_press', 'F', 2,
  4.2894, 0.1961, 3.8182, 0.3950,
  4.4010, 0.3527, 3.8483, 0.4128,
  0.667, 65,
  0.2674, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards',
  809986,
  'f₀=0.2674 (beg/int=0.30/0.70=0.4286); lower F:M ratio for upper body vs lower body');


-- -------------------------------------------------------------------------
-- DEADLIFT
--   M: beg=1.00×BW, int=1.75×BW, adv=2.25×BW, eli=2.75×BW
--   F: beg=0.65×BW, int=1.25×BW, adv=1.65×BW, eli=1.95×BW
--   M: R=1.00/1.75=0.5714 → f₀=0.48658·0.5714/(1−0.51342·0.5714)=0.3935
--     T(2yr)_M = 0.3935 + 0.6065·0.4866 = 0.6887
--     μ_M = ln(131.25 / 0.6887) = ln(190.58) = 5.2501
--   F: R=0.65/1.25=0.5200 → f₀=0.48658·0.5200/(1−0.51342·0.5200)=0.3452
--     T(2yr)_F = 0.3452 + 0.6548·0.4866 = 0.6638
--     μ_F = ln(81.25 / 0.6638) = ln(122.39) = 4.8072
--   σ_M = ln(2.25/1.75)/1.282 = ln(1.286)/1.282 = 0.1961
--   σ_F = ln(1.65/1.25)/1.282 = ln(1.320)/1.282 = 0.2166
--   pop_μ_M = ln(131.25) = 4.8771; pop_σ_M = ln(206.25/75)/3.290  = 0.3075
--   pop_μ_F = ln(81.25)  = 4.3975; pop_σ_F = ln(126.75/42.25)/3.290 = 0.3340
--   Bielik 2024 anchor check (7yr lifter, 75kg M):
--     T(7)_M = 0.3935 + 0.6065·0.9007 = 0.9399
--     L₅₀ = 190.58 · 0.9399 = 179.1 kg
--     90th pctile = 179.1·exp(1.282·0.1961) = 179.1·1.285 = 230.1 kg = 3.068×BW
--     Bielik competition 90th = 3.25×BW; gap ~5.6% (competition self-selection) ✓
-- -------------------------------------------------------------------------
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    mu_sex_m, sigma_sex_m, mu_sex_f, sigma_sex_f,   -- v2.1 sex-only layer (TICKET-052)
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('deadlift', 'M', 2,
  5.2501, 0.1961, 4.8771, 0.3075,
  4.9606, 0.3277, 4.4276, 0.3549,
  0.667, 75,
  0.3935, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards',
  809986,
  'f₀=0.3935 (beg/int=1.00/1.75=0.5714); higher f₀ than bench — deadlift easier for novices'),
 ('deadlift', 'F', 2,
  4.8072, 0.2166, 4.3975, 0.3340,
  4.9606, 0.3277, 4.4276, 0.3549,
  0.667, 65,
  0.3452, 3.0,
  'Bielik 2024 (n=809,986) + Strength Level (n>2M) + USAPL standards',
  809986,
  'f₀=0.3452 (beg/int=0.65/1.25=0.5200); F:M deadlift ratio ~0.82 per Bielik 2024');


-- -------------------------------------------------------------------------
-- OVERHEAD PRESS (strict barbell, standing)
--   M: beg=0.40×BW, int=0.65×BW, adv=0.85×BW, eli=1.05×BW
--   F: beg=0.20×BW, int=0.45×BW, adv=0.60×BW, eli=0.75×BW
--   M: R=0.40/0.65=0.6154 → f₀=0.48658·0.6154/(1−0.51342·0.6154)=0.4378
--     T(2yr)_M = 0.4378 + 0.5622·0.4866 = 0.7113
--     μ_M = ln(48.75 / 0.7113) = ln(68.54) = 4.2280
--   F: R=0.20/0.45=0.4444 → f₀=0.48658·0.4444/(1−0.51342·0.4444)=0.2802
--     T(2yr)_F = 0.2802 + 0.7198·0.4866 = 0.6304
--     μ_F = ln(29.25 / 0.6304) = ln(46.40) = 3.8369
--   σ_M = ln(0.85/0.65)/1.282 = ln(1.308)/1.282 = 0.2094
--   σ_F = ln(0.60/0.45)/1.282 = ln(1.333)/1.282 = 0.2245
--   pop_μ_M = ln(48.75) = 3.8867; pop_σ_M = ln(78.75/30)/3.290  = 0.2934
--   pop_μ_F = ln(29.25) = 3.3759; pop_σ_F = ln(48.75/13)/3.290  = 0.4018
--   fit_source: Strength Level (n~50,000 for OHP) + industry standards.
--   No competition federation data for OHP; standards consistent with
--   Nuckols/SBS survey and Symmetric Strength aggregation.
--   User test case (20yo M, 77.1kg, 4yr):
--     T(4)_M = 0.4378 + 0.5622·0.7364 = 0.8516
--     L₅₀ = 68.54 · 1.0186 · 0.964 · 0.8516 = 57.4 kg ≈ 126.5 lb ✓
--     (v1 erroneously predicted ~93 lb)
-- -------------------------------------------------------------------------
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    mu_sex_m, sigma_sex_m, mu_sex_f, sigma_sex_f,   -- v2.1 sex-only layer (TICKET-052)
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('overhead_press', 'M', 2,
  4.2280, 0.2094, 3.8867, 0.2934,
  3.9702, 0.3145, 3.4060, 0.4194,
  0.667, 75,
  0.4378, 3.0,
  'Strength Level (n~50,000) + Nuckols/SBS + industry standards',
  50000,
  'f₀=0.4378 (beg/int=0.40/0.65=0.6154); no federation competition data for OHP; cross-validated vs Symmetric Strength'),
 ('overhead_press', 'F', 2,
  3.8369, 0.2245, 3.3759, 0.4018,
  3.9702, 0.3145, 3.4060, 0.4194,
  0.667, 65,
  0.2802, 3.0,
  'Strength Level (n~25,000) + Nuckols/SBS + industry standards',
  25000,
  'f₀=0.2802 (beg/int=0.20/0.45=0.4444); wider pop_sigma reflects large F spread in OHP');


-- -------------------------------------------------------------------------
-- BARBELL ROW (bent-over / Pendlay — canonical row parent for inheritance)
--   Calibrated to 90% of bench press distribution (both levels and spread).
--   M: int=0.90×bench_int=0.90×75=67.5; μ_M = ln(67.5/T(2yr)_bench_M)
--     = ln(67.5/0.6546) = ln(103.12) = 4.6358
--   F: int=0.90×45.5=40.95; μ_F = ln(40.95/0.6237) = ln(65.66) = 4.1843
--   σ inherits from bench (same proportional spread within experience level)
--   f₀ inherits from bench (same beginner/intermediate ratio structure)
--   pop_μ_M = ln(67.5) = 4.2122; pop_σ_M = ln(101.25/33.75)/3.290 = 0.3340
--   pop_μ_F = ln(40.95)= 3.7124; pop_σ_F = ln(64.35/17.55)/3.290  = 0.3950
-- -------------------------------------------------------------------------
INSERT INTO lift_vectors (
    lift_id, sex, model_version,
    mu, sigma, pop_mu, pop_sigma,
    mu_sex_m, sigma_sex_m, mu_sex_f, sigma_sex_f,   -- v2.1 sex-only layer (TICKET-052)
    alpha, bw_ref_kg,
    training_floor, training_tau_years,
    fit_source, fit_sample_size, notes
) VALUES
 ('barbell_row', 'M', 2,
  4.6358, 0.1741, 4.2122, 0.3340,
  4.2957, 0.3527, 3.7425, 0.4128,
  0.667, 75,
  0.3273, 3.0,
  'Strength Level (n~80,000) + 0.90 × bench press distribution',
  80000,
  'Calibrated to 90% of bench press distribution at all levels; serves as canonical row parent'),
 ('barbell_row', 'F', 2,
  4.1843, 0.1961, 3.7124, 0.3950,
  4.2957, 0.3527, 3.7425, 0.4128,
  0.667, 65,
  0.2674, 3.0,
  'Strength Level (n~40,000) + 0.90 × bench press distribution',
  40000,
  'Calibrated to 90% of bench press distribution at all levels');


-- ===========================================================================
-- INHERITED LIFTS
-- For inherited rows: mu, sigma, pop_mu, pop_sigma are NULL; resolved at
-- query time by resolve_lift_vector() as: mu_child = mu_parent + ln(ratio).
-- bw_ref_kg and training_floor are also NULL (inherit from parent via COALESCE).
-- This is the v2 schema fix — v1 had these NOT NULL which broke inheritance.
-- ===========================================================================

INSERT INTO lift_vectors (lift_id, sex, model_version, parent_lift_id, inheritance_ratio, fit_source, notes)
VALUES
 -- ---- Squat family ----
 ('front_squat',           'M', 2, 'back_squat',     0.85, 'Strength Level + Symmetric Strength', 'FS ~85% of BS'),
 ('front_squat',           'F', 2, 'back_squat',     0.85, 'Strength Level + Symmetric Strength', 'FS ~85% of BS'),
 ('low_bar_squat',         'M', 2, 'back_squat',     1.05, 'Industry aggregator', 'LB typically ~5% heavier than HB'),
 ('low_bar_squat',         'F', 2, 'back_squat',     1.05, 'Industry aggregator', 'LB typically ~5% heavier than HB'),
 ('high_bar_squat',        'M', 2, 'back_squat',     0.95, 'Industry aggregator', 'HB ~5% lighter than LB'),
 ('high_bar_squat',        'F', 2, 'back_squat',     0.95, 'Industry aggregator', 'HB ~5% lighter than LB'),
 ('paused_squat',          'M', 2, 'back_squat',     0.92, 'Strength Level',      'Paused ~92% of competition squat'),
 ('paused_squat',          'F', 2, 'back_squat',     0.92, 'Strength Level',      'Paused ~92% of competition squat'),
 ('box_squat',             'M', 2, 'back_squat',     0.90, 'Industry aggregator', 'Box ~90% of free squat'),
 ('box_squat',             'F', 2, 'back_squat',     0.90, 'Industry aggregator', 'Box ~90% of free squat'),
 ('zercher_squat',         'M', 2, 'back_squat',     0.78, 'Symmetric Strength',  'Zercher ~78% of BS'),
 ('zercher_squat',         'F', 2, 'back_squat',     0.78, 'Symmetric Strength',  'Zercher ~78% of BS'),
 ('safety_bar_squat',      'M', 2, 'back_squat',     0.92, 'Strength Level',      'SSB ~92% of BS'),
 ('safety_bar_squat',      'F', 2, 'back_squat',     0.92, 'Strength Level',      'SSB ~92% of BS'),
 ('hack_squat_machine',    'M', 2, 'back_squat',     0.90, 'Industry aggregator', 'Machine leverage adjustment applied'),
 ('hack_squat_machine',    'F', 2, 'back_squat',     0.90, 'Industry aggregator', 'Machine leverage adjustment applied'),
 ('leg_press_machine',     'M', 2, 'back_squat',     2.50, 'Strength Level',      'Leg press ~2.5× BS; leverage-corrected'),
 ('leg_press_machine',     'F', 2, 'back_squat',     2.50, 'Strength Level',      'Leg press ~2.5× BS; leverage-corrected'),
 ('bulgarian_split_squat', 'M', 2, 'back_squat',     0.40, 'Strength Level',      'Per-leg load ~40% of BS'),
 ('bulgarian_split_squat', 'F', 2, 'back_squat',     0.40, 'Strength Level',      'Per-leg load ~40% of BS'),
 ('goblet_squat',          'M', 2, 'back_squat',     0.45, 'Industry aggregator', 'Limited by anterior chain / grip'),
 ('goblet_squat',          'F', 2, 'back_squat',     0.45, 'Industry aggregator', 'Limited by anterior chain / grip'),

 -- ---- Bench press family ----
 ('incline_bench_press',   'M', 2, 'bench_press',    0.78, 'Strength Level',      'Incline ~78% of flat'),
 ('incline_bench_press',   'F', 2, 'bench_press',    0.78, 'Strength Level',      'Incline ~78% of flat'),
 ('decline_bench_press',   'M', 2, 'bench_press',    1.05, 'Strength Level',      'Decline slightly heavier than flat'),
 ('decline_bench_press',   'F', 2, 'bench_press',    1.05, 'Strength Level',      'Decline slightly heavier than flat'),
 ('close_grip_bench',      'M', 2, 'bench_press',    0.90, 'Strength Level',      'CGB ~90% of flat bench'),
 ('close_grip_bench',      'F', 2, 'bench_press',    0.90, 'Strength Level',      'CGB ~90% of flat bench'),
 ('paused_bench_press',    'M', 2, 'bench_press',    0.92, 'OpenPowerlifting',    'Paused ~92% of competition bench'),
 ('paused_bench_press',    'F', 2, 'bench_press',    0.92, 'OpenPowerlifting',    'Paused ~92% of competition bench'),
 ('floor_press',           'M', 2, 'bench_press',    0.88, 'Strength Level',      'Floor press ~88% of flat'),
 ('floor_press',           'F', 2, 'bench_press',    0.88, 'Strength Level',      'Floor press ~88% of flat'),
 ('chest_press_machine',   'M', 2, 'bench_press',    0.95, 'Industry aggregator', 'Machine ~95% of free; no stabilisation demand'),
 ('chest_press_machine',   'F', 2, 'bench_press',    0.95, 'Industry aggregator', 'Machine ~95% of free; no stabilisation demand'),
 ('dumbbell_bench_press',  'M', 2, 'bench_press',    0.42, 'Strength Level',      'PER-DUMBBELL load ~42% of barbell total'),
 ('dumbbell_bench_press',  'F', 2, 'bench_press',    0.42, 'Strength Level',      'PER-DUMBBELL load ~42% of barbell total'),
 ('dumbbell_incline_press','M', 2, 'bench_press',    0.33, 'Strength Level',      'PER-DUMBBELL ~33% of barbell flat'),
 ('dumbbell_incline_press','F', 2, 'bench_press',    0.33, 'Strength Level',      'PER-DUMBBELL ~33% of barbell flat'),

 -- ---- Deadlift family ----
 ('sumo_deadlift',         'M', 2, 'deadlift',       1.00, 'OpenPowerlifting',    'Comparable to conventional at competition level'),
 ('sumo_deadlift',         'F', 2, 'deadlift',       1.00, 'OpenPowerlifting',    'Often higher for women due to leverage'),
 ('romanian_deadlift',     'M', 2, 'deadlift',       0.82, 'Strength Level',      'RDL ~82% of conventional'),
 ('romanian_deadlift',     'F', 2, 'deadlift',       0.82, 'Strength Level',      'RDL ~82% of conventional'),
 ('stiff_leg_deadlift',    'M', 2, 'deadlift',       0.78, 'Industry aggregator', 'SLDL ~78% of conventional'),
 ('stiff_leg_deadlift',    'F', 2, 'deadlift',       0.78, 'Industry aggregator', 'SLDL ~78% of conventional'),
 ('deficit_deadlift',      'M', 2, 'deadlift',       0.85, 'Strength Level',      'Deficit ~85%'),
 ('deficit_deadlift',      'F', 2, 'deadlift',       0.85, 'Strength Level',      'Deficit ~85%'),
 ('rack_pull',             'M', 2, 'deadlift',       1.30, 'Strength Level',      'Mid-shin rack pull ~130%'),
 ('rack_pull',             'F', 2, 'deadlift',       1.30, 'Strength Level',      'Mid-shin rack pull ~130%'),
 ('trap_bar_deadlift',     'M', 2, 'deadlift',       1.05, 'Strength Level',      'Trap bar ~105% conventional'),
 ('trap_bar_deadlift',     'F', 2, 'deadlift',       1.05, 'Strength Level',      'Trap bar ~105% conventional'),

 -- ---- Overhead press family ----
 ('push_press',            'M', 2, 'overhead_press', 1.30, 'Strength Level',      'Push press ~130% of strict OHP'),
 ('push_press',            'F', 2, 'overhead_press', 1.30, 'Strength Level',      'Push press ~130% of strict OHP'),
 ('seated_overhead_press', 'M', 2, 'overhead_press', 0.92, 'Strength Level',      'Seated ~92% of standing'),
 ('seated_overhead_press', 'F', 2, 'overhead_press', 0.92, 'Strength Level',      'Seated ~92% of standing'),
 ('arnold_press',          'M', 2, 'overhead_press', 0.55, 'Industry aggregator', 'PER-DUMBBELL ~55% of barbell strict'),
 ('arnold_press',          'F', 2, 'overhead_press', 0.55, 'Industry aggregator', 'PER-DUMBBELL ~55% of barbell strict'),
 ('dumbbell_shoulder_press','M', 2, 'overhead_press', 0.42, 'Strength Level',      'PER-DUMBBELL ~42% of barbell strict'),
 ('dumbbell_shoulder_press','F', 2, 'overhead_press', 0.42, 'Strength Level',      'PER-DUMBBELL ~42% of barbell strict'),
 ('lateral_raise',         'M', 2, 'overhead_press', 0.18, 'Strength Level',      'PER-DUMBBELL; isolation, much lower than press'),
 ('lateral_raise',         'F', 2, 'overhead_press', 0.18, 'Strength Level',      'PER-DUMBBELL; isolation, much lower than press'),

 -- ---- Row family ----
 ('pendlay_row',           'M', 2, 'barbell_row',    0.92, 'Strength Level',      'Strict pause ~92% of bent row'),
 ('pendlay_row',           'F', 2, 'barbell_row',    0.92, 'Strength Level',      'Strict pause ~92% of bent row'),
 ('t_bar_row',             'M', 2, 'barbell_row',    1.05, 'Strength Level',      'T-bar slightly heavier — fixed plane advantage'),
 ('t_bar_row',             'F', 2, 'barbell_row',    1.05, 'Strength Level',      'T-bar slightly heavier — fixed plane advantage'),
 ('seated_cable_row',      'M', 2, 'barbell_row',    0.85, 'Strength Level',      'Cable ~85% of barbell row'),
 ('seated_cable_row',      'F', 2, 'barbell_row',    0.85, 'Strength Level',      'Cable ~85% of barbell row'),
 ('chest_supported_row',   'M', 2, 'barbell_row',    0.90, 'Strength Level',      'CSR ~90%'),
 ('chest_supported_row',   'F', 2, 'barbell_row',    0.90, 'Strength Level',      'CSR ~90%'),
 ('lat_pulldown',          'M', 2, 'barbell_row',    0.95, 'Strength Level',      'Pulldown ~95% of row'),
 ('lat_pulldown',          'F', 2, 'barbell_row',    0.95, 'Strength Level',      'Pulldown ~95% of row'),
 ('dumbbell_row',          'M', 2, 'barbell_row',    0.40, 'Strength Level',      'PER-DUMBBELL ~40% of barbell row'),
 ('dumbbell_row',          'F', 2, 'barbell_row',    0.40, 'Strength Level',      'PER-DUMBBELL ~40% of barbell row'),

 -- ---- Pull-up / dip / arm isolation ----
 ('weighted_pull_up',      'M', 2, 'bench_press',    0.55, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('weighted_pull_up',      'F', 2, 'bench_press',    0.55, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('weighted_chin_up',      'M', 2, 'bench_press',    0.60, 'Strength Level',      'Chins ~5% stronger than pulls for added load'),
 ('weighted_chin_up',      'F', 2, 'bench_press',    0.60, 'Strength Level',      'Chins ~5% stronger than pulls for added load'),
 ('weighted_dip',          'M', 2, 'bench_press',    0.65, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('weighted_dip',          'F', 2, 'bench_press',    0.65, 'Strength Level',      'Added load only; bodyweight summed at app layer'),
 ('barbell_curl',          'M', 2, 'bench_press',    0.40, 'Strength Level',      'Barbell curl ~40% of bench'),
 ('barbell_curl',          'F', 2, 'bench_press',    0.40, 'Strength Level',      'Barbell curl ~40% of bench'),
 ('ez_bar_curl',           'M', 2, 'bench_press',    0.42, 'Strength Level',      'EZ bar slightly stronger than straight bar'),
 ('ez_bar_curl',           'F', 2, 'bench_press',    0.42, 'Strength Level',      'EZ bar slightly stronger than straight bar'),
 ('dumbbell_curl',         'M', 2, 'bench_press',    0.18, 'Strength Level',      'PER-DUMBBELL'),
 ('dumbbell_curl',         'F', 2, 'bench_press',    0.18, 'Strength Level',      'PER-DUMBBELL'),
 ('preacher_curl',         'M', 2, 'bench_press',    0.35, 'Strength Level',      'Slightly weaker than standing barbell curl'),
 ('preacher_curl',         'F', 2, 'bench_press',    0.35, 'Strength Level',      'Slightly weaker than standing barbell curl'),
 ('skullcrusher',          'M', 2, 'bench_press',    0.45, 'Strength Level',      'Tricep extension ~45% of bench'),
 ('skullcrusher',          'F', 2, 'bench_press',    0.45, 'Strength Level',      'Tricep extension ~45% of bench'),
 ('tricep_pushdown',       'M', 2, 'bench_press',    0.50, 'Strength Level',      'Cable pushdown ~50% of bench'),
 ('tricep_pushdown',       'F', 2, 'bench_press',    0.50, 'Strength Level',      'Cable pushdown ~50% of bench'),

 -- ---- Hip / posterior chain ----
 ('hip_thrust',            'M', 2, 'back_squat',     1.50, 'Strength Level',      'Hip thrust ~150% of BS at advanced level'),
 ('hip_thrust',            'F', 2, 'back_squat',     1.60, 'Strength Level',      'F often higher: ~160% of BS'),
 ('glute_bridge',          'M', 2, 'back_squat',     1.30, 'Strength Level',      'Glute bridge ~130% of BS'),
 ('glute_bridge',          'F', 2, 'back_squat',     1.40, 'Strength Level',      'F: ~140% of BS'),
 ('good_morning',          'M', 2, 'back_squat',     0.50, 'Strength Level',      'Good morning ~50% of BS'),
 ('good_morning',          'F', 2, 'back_squat',     0.50, 'Strength Level',      'Good morning ~50% of BS'),

 -- ---- Lunge / single-leg / isolation ----
 ('walking_lunge',         'M', 2, 'back_squat',     0.45, 'Strength Level',      'Loaded total per side; varies with stride'),
 ('walking_lunge',         'F', 2, 'back_squat',     0.45, 'Strength Level',      'Loaded total per side; varies with stride'),
 ('leg_curl_machine',      'M', 2, 'deadlift',       0.30, 'Strength Level',      'Hamstring isolation — much lower than hip hinge'),
 ('leg_curl_machine',      'F', 2, 'deadlift',       0.30, 'Strength Level',      'Hamstring isolation — much lower than hip hinge'),
 ('leg_extension_machine', 'M', 2, 'back_squat',     0.55, 'Strength Level',      'Quad isolation'),
 ('leg_extension_machine', 'F', 2, 'back_squat',     0.55, 'Strength Level',      'Quad isolation'),
 ('calf_raise_machine',    'M', 2, 'back_squat',     1.20, 'Strength Level',      'Short lever — calf raises typically heavy'),
 ('calf_raise_machine',    'F', 2, 'back_squat',     1.20, 'Strength Level',      'Short lever — calf raises typically heavy');


-- ===========================================================================
-- Verification view (for dev team inspection)
-- ===========================================================================
CREATE OR REPLACE VIEW v_lift_vector_summary AS
SELECT
    lift_id,
    sex,
    model_version,
    CASE
        WHEN mu IS NOT NULL THEN 'direct_fit'
        ELSE 'inherited_from_' || parent_lift_id || ' (×' || inheritance_ratio || ')'
    END AS fit_type,
    round(mu::numeric,      4) AS mu,
    round(sigma::numeric,   4) AS sigma,
    round(pop_mu::numeric,  4) AS pop_mu,
    round(pop_sigma::numeric,4) AS pop_sigma,
    round(mu_sex_m::numeric, 4) AS mu_sex_m,
    round(sigma_sex_m::numeric,4) AS sigma_sex_m,
    round(mu_sex_f::numeric, 4) AS mu_sex_f,
    round(sigma_sex_f::numeric,4) AS sigma_sex_f,
    training_floor,
    fit_sample_size,
    notes
FROM lift_vectors
WHERE model_version = 2
ORDER BY sex, lift_id;

-- ===========================================================================
-- END of lift_vectors_seed.sql (model_version = 2)
-- V1 rows are intentionally preserved for one audit cycle before deletion.
-- To switch the batch job to v2, update compute_percentile_batch() default arg.
-- ===========================================================================
