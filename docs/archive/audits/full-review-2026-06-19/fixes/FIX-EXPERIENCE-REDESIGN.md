# FIX — Experience as an EXPECTATION shift, not a spread widening (strengthModelV3)

**Date:** 2026-06-20 · **Branch:** `fix/full-review-2026-06-19`
**File changed (only this one):** `mobile/src/lib/strengthModelV3.ts`
**Tickets:** TICKET-032 / full-review-2026-06-19 math-validation finding.
**Research:** `audits/full-review-2026-06-19/math-validation/TRAINING-AGE-RESEARCH.md`

## Problem

The Lens-1 "experience-adjusted" percentile used training experience to **widen the
population σ** (`heteroscedasticSigma`, σ growing from `SIGMA_NOV=0.20` toward
`pop_sigma` over `TAU_SIGMA=4yr`). Validation found this is wrong:

- Affecting only the SPREAD can **INVERT rankings** — at the SAME lift, a beginner
  (narrow σ) can out-rank an elite (wide σ). A z-score of e.g. +1.5 maps to a higher
  percentile under a narrow σ than the same absolute over-performance under a wide σ.
- It is **gameable**: claiming "beginner" tightened σ and pushed an above-median lift
  to a *higher* percentile than claiming "elite".

## Redesign — shift the EXPECTED CENTER, never the spread

A more-experienced lifter is **expected to be stronger**, so at the same lift they must
rank **same-or-lower** (never higher). Implemented as a research-derived training-age
**expectation factor** that raises the expected median; σ is now the FIXED population
`pop_sigma`.

```ts
// t = training years, clamped to [0,15]
gain(t)      = 28*(1 - Math.exp(-1.70*t)) + 35*(1 - Math.exp(-0.24*t));   // % gain vs untrained
expFactor(t) = (1 + gain(t)/100) / 1.4957;   // established 4-yr lifter = 1.00 (saturating)
```

Double-exponential (fast neural limb + slow hypertrophic limb), SSE 0.57 to pooled
Steele 2022 / Latella 2024 / Rhea 2003 anchors, asymptote ≈ 63%.
Reference values (verified in harness): expFactor(0)=0.669, (1)=0.872, (3)=0.975,
(4)=1.000, (5)=1.019, (10)=1.069, (15)=1.083.

## Exactly what changed (the ONLY path touched)

Path changed: **Lens 1 — `computePercentile`** (the dedicated experience-adjusted
per-lift lens). It is the only consumer of the experience mechanism; its sole call site
is `mobile/app/(tabs)/rankings.tsx` (`localPercentiles` → `localLens1`, the per-lift
"experience-adjusted" score).

1. **Removed** `SIGMA_NOV`, `TAU_SIGMA`, and `heteroscedasticSigma()`.
2. **Added** `EXP_REF`, `expStrengthGainPct(years)` (clamps t to [0,15]), and
   `expFactor(trainingYears)` (returns 1.0 — no shift — when years is null).
3. In `computePercentile`:
   - σ is now the FIXED `popSigma` from `liftPopParams` (no experience widening).
   - The expected median is raised by `expFactor`:
     `expected = mu + alpha*ln(BW/BW0) + ln(expFactor(trainingYears))`.
   - `experienceLevel` is still mapped to years via the **unchanged**
     `EXPERIENCE_TO_YEARS` map, then years → expFactor.

`expFactor` is non-decreasing in t, so subtracting `ln(expFactor)` from the user's
log-load makes the z-score (and the percentile) **monotonically NON-INCREASING** in
training years — inversion is structurally impossible.

## Headline tier stays ABSOLUTE (unchanged) — confirmed

The HEADLINE / overall tier (`overallStrengthPercentile` → `tierForOverall`, rendered by
`TierLadderCard`) is the pure absolute sex+bodyweight DOTS percentile and takes **no**
experience input. Its function bodies are **byte-identical** before/after this change
(md5 verified for `overallStrengthPercentile`, `overallStrengthPercentilePartial`,
`tierForOverall`). The experience factor is applied ONLY in the dedicated Lens-1 lens,
never the headline.

## Preserved exactly (not touched)

`AGE_MULT`, `AgeBand`, `AGE_BANDS`, `ageMultiplier`, `TIER_LADDER`, the DOTS guards
(`dotsScore`/`sanitizeDots`/`Number.isFinite` degrades), the unknown-sex 50/50 averaging,
`EXPERIENCE_TO_YEARS`, Lens 2a (`computeRankedPercentile`), Lens 2b. (md5-verified
identical for AGE_MULT, AgeBand, AGE_BANDS, TIER_LADDER, dotsScore, isKnownSex,
computeRankedPercentile.)

## Verification

**Parse-sweep** (`audits/full-review-2026-06-19/parse-sweep.js app src`):
`ENGINE=babel  FILES=167  FAILURES=0`.

**Monotonicity harness** — fixed lift=bench, sex=M, e1RM=100kg, BW=80kg, age=25-34,
sweeping the exact training-years the spec asks for:

```
years |  expFactor | exp-adj percentile | Δ vs prev
------+------------+--------------------+----------
  0.5 |   0.8022   |       96.961       |    —
    1 |   0.8715   |       94.965       |  -1.996
    2 |   0.9387   |       92.392       |  -2.573
    3 |   0.9747   |       90.755       |  -1.637
    5 |   1.0193   |       88.490       |  -2.265
   10 |   1.0686   |       85.694       |  -2.796
   15 |   1.0834   |       84.798       |  -0.896
```
- (a) monotonically NON-INCREASING in years: **PASS**
- (b) saturation 10yr vs 15yr |Δpct| = **0.896** (≤ 2 pts): **PASS**
- (c) no NaN / no throw: **PASS**

**End-to-end via the real exported `computePercentile`** (experienceLevel buckets):
beginner 94.97 → novice 92.39 → intermediate 89.50 → advanced 87.67 → elite 86.04
(monotonic non-increasing); `null`/unknown level → 89.50 (no shift, = intermediate/4yr).

**Inversion guard:** squat 150kg @80kg M — beginner=93.29 ≥ elite=82.77 (no inversion). **PASS**

All `expFactor` reference values matched to <0.001. `expFactor(null)=1.0`;
`expFactor(20)` clamps to the 15-yr value 1.083 (caps "trained 40 years" gaming).
