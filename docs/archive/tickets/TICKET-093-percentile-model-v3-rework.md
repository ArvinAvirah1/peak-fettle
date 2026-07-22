# TICKET-093 — Percentile & Ranking Model v3 Rework

**Owner:** Opus (math lane) + data-analyst + dev-backend
**Date opened:** 2026-06-06
**Phase:** R — Revision & Hardening
**Source:** Founder request 2026-06-06; data-analyst review in `strength_model_v3_revision_2026-06-06.md`; reconciles drift from `exec-percentile-decisions.md`; supersedes the ranked/overall math in `strength_curve_model.md` §4.5–§4.5.6.
**Model routing:** This is percentile-math + tier-ladder work → **Opus lane** (per CLAUDE.md routing, the TICKET-052/053 lineage). Sonnet may do the mechanical SQL/TS scaffolding and tests; Opus owns the math, calibration, and final verification.

---

## Goal

Replace the v2.1 ranking math with a v3 model that (1) makes the **ranked ladder bodyweight-normalized** (DOTS-based, per exec Decision 2), (2) makes the **overall strength score a calibrated composite** so percentile bands map to true population shares, and (3) reconciles the three documented divergences from the locked executive design. Full equations and rationale are in `strength_model_v3_revision_2026-06-06.md` (the design of record this ticket implements).

## Background — why

- The shipped ranked lens (sex-only absolute load) rewards bodyweight: at equal load a heavier lifter always outranks a lighter one. Founder reversed this 2026-06-06.
- The overall score is the mean of per-lift percentiles, which is statistically mis-calibrated. Simulation (2M lifters): a displayed "overall 70" is really the ~74th percentile at realistic lift correlation and ~88th at independence — tiers are wrong at the top.
- Implementation drifted from `exec-percentile-decisions.md`: DOTS was never built (D2), bodyweight was dropped from ranking instead of handled in-score (D1), and undisclosed-sex σ uses an arithmetic mean instead of the specified RMS pooling (D5).

## Scope

**In:**
- Lens 1 (experience-adjusted) calibration fixes: per-lift α, heteroscedastic σ(years), 6-anchor least-squares fit, McCulloch/Foster age lookup.
- **Consolidate to two lenses (D6):** merge the sex+bodyweight population percentile, the ranked per-lift score, and the overall composite. Remove `compute_percentile_simple` and `compute_percentile_sex_only`; add `compute_ranked_percentile` (allometric per-lift, D3); make `overall_strength_percentile` the calibrated DOTS-total composite.
- DOTS adoption (aggregate total only, D3) with verified coefficients + test vectors; Wilks/IPF GL as display-only (D1, TICKET-046).
- **World Class anchor (D2):** extend standards above Elite; six-anchor quantile map (beg20 / nov40 / int60 / adv85 / elite97 / wc99.5).
- **Partial-total provisional tier (D4)** when squat/bench/deadlift aren't all logged.
- Undisclosed-sex = 50/50 mixture (D5); remove the arithmetic-mean-σ path.
- **Percentiles computed against the model-calibrated distribution, never the live user base (D6)** — drop the live-user confidence-ring part of exec D4.
- e1RM input-quality improvements (ties TICKET-044, TICKET-045).
- `model_version` 2 → 3; parallel-run rollout.

**Out:**
- Production deploy of v3 values before the §9 sign-off items in the memo are answered.
- Re-fitting on first-party data (deferred until cohorts are large; carry v2 limitations 2–3).
- Olympic lifts (still v3+ deferred per v2 limitation 6).
- Tier band *cosmetics*/UI (TICKET-053 owns the bands; this ticket gives it a calibrated input).

## Acceptance criteria

1. `strength_curve_model.md` updated to v3 (or a v3 doc supersedes it), matching `strength_model_v3_revision_2026-06-06.md`; v2 record preserved for audit.
2. DOTS implemented; the five test vectors in the memo §4 reproduce to ±0.1 in a committed unit test; coefficients re-confirmed against the IPF Models-Evaluation-2020 source.
3. Ranked per-lift percentile is bodyweight-normalized: two lifters, same sex, same absolute load, different bodyweight → **different** ranked percentile (lighter ranks higher). Test asserts this.
4. Overall composite is calibrated: against a held-out/simulated population, `overall_pct = p` beats `p% ± 2pp` of same-sex lifters for p ∈ {25,50,75,90,95}. The mean-of-percentiles path is removed.
5. Undisclosed-sex computation matches the chosen spec (memo §6); the arithmetic-mean-σ deviation is gone.
6. Calibration uses all five standards (least-squares), not 2-point endpoints; fit residuals reported.
7. `model_version` is 3; v2 and v3 run in parallel for one batch cycle with a distribution-shift report before swap.
8. Parse-sweep + `node --check` clean per `peak-fettle-verify` (the real definition of done); math changes gated by `/ultra-review` + a `/codex:review` second opinion.
9. **Consolidation (D6):** `compute_percentile_simple` and `compute_percentile_sex_only` are removed; one `compute_ranked_percentile` remains; no caller references the deleted functions (grep clean).
10. **Model-derived only (D6):** no percentile path queries the live user table for its distribution; the tier ladder includes a World Class band (≥99.7, provisional).

## Implementation plan

1. **Data-analyst (Opus):** finalize §9 sign-off items with founder; produce the v3 coefficient/seed values (lift α's, σ(years) anchors, DOTS-population `(ν,ω)` and `(μ_D,σ_D)` per sex) with the 5-anchor fit and residual report.
2. **dev-backend (Sonnet under Opus review):** implement DOTS, the three lens functions, the calibrated composite, and undisclosed handling — in the **on-device TypeScript port** (see note below), with parity tests against the v2 SQL where behavior is unchanged (Lens 1) and against the memo's reference values where new.
3. **Opus:** final integration + verification pass; parallel-run distribution report; sign-off.

**Coordinate with the local-first migration** (`LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md`): percentiles are moving to on-device TS and `user_percentile_rankings` + the weekly cron are being deleted. Specify v3 **once** and implement it in the TS port — do not build v3 in SQL and again in TS. If the migration lands first, this ticket targets the TS module directly.

## Test plan

1. **Unit:** DOTS test vectors (memo §4); norm-CDF accuracy retained; per-lift inheritance still resolves.
2. **Property:** ranked percentile strictly decreasing in bodyweight at fixed load (BW-normalization sanity); monotonic in load at fixed BW.
3. **Calibration:** simulate ≥1M same-sex lifters from the fitted distributions; assert `overall_pct` is uniform to ±2pp at the listed checkpoints; assert mean-of-percentiles is NOT used.
4. **Regression:** Lens 1 outputs unchanged except for the four documented fixes (diff report).
5. **Cross-validation:** upper tail vs Bielik 2024 within documented tolerance.
6. **Gate:** `peak-fettle-verify` parse-sweep over `mobile/app`, `mobile/src`, `peak-fettle-agents/server`; `/ultra-review`; `/codex:review`.

## Dependencies / related

- `strength_model_v3_revision_2026-06-06.md` — design of record.
- `exec-percentile-decisions.md` — the locked design being reconciled to.
- TICKET-053 (tier ladder) — consumes the calibrated `overall_pct`; bands must be re-derived.
- TICKET-066 (consolidate percentile scoring math), TICKET-046 (Wilks/DOTS transparency), TICKET-045 (1RM formula), TICKET-044 (RPE field), TICKET-050 (cohort graduation), TICKET-015/016 (percentile architecture/cohort roadmap).
- `LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md` — percentiles move on-device; implement v3 in the TS port.

## Decisions

**Resolved 2026-06-06:** D1 DOTS currency · D2 quantile map + World Class anchor · D3 allometric per-lift · D4 provisional partial-total tier · D5 mixture · D6 consolidate lenses + model-derived (no live users). See memo §0.

**Remaining (data pass / TICKET-053):**
1. Exact World Class standard values per lift (provisional in memo §5.1; confirm vs Bielik 2024).
2. Beginner-anchor residual (memo §5.2): tighten map to ~10–12th or keep the residual.
3. Tier band cutoffs on the calibrated `overall_pct`, incl. World Class (TICKET-053). Proposed: Iron ≤40 · Bronze 40–60 · Silver 60–75 · Gold 75–88 · Platinum 88–95 · Diamond 95–99 · Elite 99–99.7 · World Class ≥99.7.

## Notes

- Founder-intent rule (TICKET-071): the six items above are product calls — do not guess; confirm before locking seed values.
- "Reviewed manually" is not verification (PUSH-002 lesson): the parse-sweep + calibration simulation are the gate.
