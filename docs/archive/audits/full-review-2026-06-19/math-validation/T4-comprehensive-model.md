# T4 — "Comprehensive multi-factor strength model" validation

Date: 2026-06-19 · Tester pass (read-only on app code; harness in /tmp)

## TL;DR — the premise does not hold

The task brief assumed an **earlier, more comprehensive "initial" strength model**
that **ESTIMATES expected strength FROM** age + sex + **HEIGHT** + bodyweight +
**years of training**. **No such model exists in this repo.**

- There is exactly **one** strength model file: `mobile/src/lib/strengthModelV3.ts`
  (the server has NO strength-model port; `peak-fettle-agents/server/routes/percentile.js`
  is deprecated per CLAUDE.md and computes nothing anthropometric).
- **HEIGHT is used nowhere** in any strength math, profile field, or DB column.
  Every `height` hit in the repo (mobile/src, server, db/*.sql) is a UI/SVG layout
  dimension (`PercentileBar.height`, `BodyweightChart.height`, `behavior:'height'`, …).
  There is no height input on the survey and no `height_cm`/`height_in` column anywhere.
- **Nothing predicts/estimates a 1RM from profile factors.** Every "estimate 1RM"
  in the codebase (`mobile/src/lib/oneRm.ts`, `trainingEngine/loading.ts`,
  server `loading.js`) is **Epley off a MEASURED set** (weight×reps the user logged).
  The training engine seeds working weights from the user's **own logged history /
  PBs** (`loading.ts`), never from anthropometrics — for a lift with no history it
  prescribes "RPE-only, start light," it does not compute an expected load.

So model (2) as described is a **misremembering**. The closest real thing — and the
only multi-factor function in the app — is **Lens 1**, `computePercentile(...)` in
`strengthModelV3.ts`. It is a **percentile SCORER**, not a strength ESTIMATOR: it
takes the user's measured e1RM and returns where it ranks. I validated that.

## WHERE IT LIVES
- **File:** `mobile/src/lib/strengthModelV3.ts`
- **Primary multi-factor fn:** `computePercentile(lift, sex, e1rmKg, bwKg, experienceLevel, ageBand)` (≈L479)
- Supporting: `liftPopParams` (L210, 6-anchor lognormal fit), `heteroscedasticSigma` (L387),
  `ageMultiplier`/`AGE_MULT` (L421/L455), `computeRankedPercentile` (L240),
  `overallStrengthPercentile` (DOTS composite, L267).
- Standards provenance: `mobile/scripts/deriveStrengthModelV3.py` (also has NO height/training-year input).

## FACTORS IT USES + HOW (ported faithfully into /tmp/t4harness.js; harness reproduces
the documented squat-M params mu=4.5674 sigma=0.3588 exactly)

Lens 1 model:  L50 = exp(mu) · (BW/BW0)^alpha · A(age);  pct = 100·Phi((ln(e1rm/ageMult) − ln L50)/sigma(t))

| Factor | How it enters | Key lines/coeffs |
|---|---|---|
| **sex (M/F)** | Selects the entire per-lift standards table + DOTS coeffs + REF_BW (M75/F60). | `STANDARDS_XBW`, `DOTS_COEF`, `REF_BW` |
| **bodyweight** | **Allometric**, sub-linear: expected median load scales as `(BW/REF_BW)^alpha`, alpha≈0.64–0.67 per lift (Jaric 2002). | `expected = mu + alpha·ln(bw/REF_BW)` (L495) |
| **experience_level** | Mapped to "training years" {beginner1, novice2, intermediate4, advanced6, elite9} then fed ONLY to sigma — it sets within-cohort **spread**, not the center. `sigma(t)=0.20+(pop−0.20)(1−e^{−t/4})`. | `EXPERIENCE_TO_YEARS` (L366), `heteroscedasticSigma` (L387) |
| **age_band** | **Multiplicative handicap** on e1RM: `lAdj = e1rm / AGE_MULT(band)`; older band → mult<1 → load inflated → higher pct. | `AGE_MULT` (L421), L493–494 |
| **e1RM (measured)** | The lift itself; compared against the distribution. NOT estimated from the above. | param `e1rmKg` |
| height | **NOT USED — absent from the entire codebase.** | — |

## PER-FACTOR VERDICT

| Factor | Verdict | Notes |
|---|---|---|
| sex | **REASONABLE** | Separate fitted tables; M/F medians (squat 1.28x/0.86x, bench 0.82x/0.55x, DL 1.55x/1.06x) track the well-known ~0.6–0.7 F:M ratio for lower body / lower for upper. |
| bodyweight | **REASONABLE** | Allometric exponent verified sub-linear: eml(150)/eml(75)=1.5911 = 2^0.670 exactly. Heavier lifter needs more absolute load for the same rank — correct direction & defensible magnitude (Jaric-range alpha). |
| age | **SKEWED (magnitude)** | Direction & monotonicity correct (older → handicap up). But the implied handicap 1/AGE_MULT runs **hotter than published McCulloch**: age50 1.19 vs 1.13, age60 1.43 vs 1.345, **age70 1.85 vs 1.645** (~13% over). Over-credits the oldest masters. youth `under-18=0.96` is mild/plausible. |
| experience / training-years | **SKEWED (only a spread knob; can invert)** | Does NOT shift expected strength — only narrows/widens sigma. Consequence: for a STRONG lift the model ranks a self-labeled **beginner HIGHER than an elite** (180kg squat: beginner 99.6 vs elite 96.6), and for a WEAK lift the beginner ranks slightly LOWER. Statistically that's "tighter novice distribution," but it is not "expected strength rises with experience," and it is self-report-gameable (claim beginner to inflate a big lift). |
| height | **N/A — HOLE / absent** | No height factor exists. If the product intends leverage/allometric height correction, it is entirely unimplemented. |
| edge handling | **MOSTLY ROBUST, one hole** | `e1rm<=0`, `bw<=0`, negative, NaN all → 0 (guarded, L487). DOTS composite guards bw/total (LIB-01). BUT no **lower bound** on bw: `bw=1kg, 140kg lift → 100.0` with no sanity floor; unknown experience string silently falls back to pop sigma (acceptable); bogus age token → mult 1.0 (silently off — the LIB-02 underscore-token bug class). |

## ANCHOR CALIBRATION CHECK (fit vs the standards it was built from)
Feeding the male-squat xBW anchors back in (exp=null) returns pcts that **miss their
target quantiles** because the 6-point lognormal fit has residuals (R²≈0.97, documented):
0.75xBW→6.7 (target 12), 1.25xBW→47 (target 40), 1.5xBW→66.8 (target 60),
2.0xBW→89.2 (target 85), 2.5xBW→96.8 (target 97), 3.0xBW→99.1 (target 99.5).
So a user lifting the **intermediate** standard is told ~67th, the **beginner**
standard ~7th not 12th. Not a bug per se (lognormal can't pass through all 6 anchors),
but the bottom anchor is the worst-fit and the model reads a couple points low mid-range.

## TOP 3 ISSUES
1. **Premise gap (highest):** there is **no comprehensive height/training-year strength
   ESTIMATOR**. `strengthModelV3.ts` is a sex+BW+age+experience **percentile scorer** off a
   measured lift; **height is absent from the whole repo** and experience only tunes sigma.
   Any roadmap/feature assuming a height-aware expected-1RM model is referencing code that
   does not exist.
2. **Experience is a spread-only knob that can invert rankings** (beginner > elite at the
   same big lift; gameable by self-report). Defensible as heteroscedasticity, but it does
   NOT make "expected strength rise with training years," and the inversion is a UX/fairness risk.
3. **Age handicaps run ~5–13% hotter than published McCulloch** (worst at 70+: 1.85 vs 1.645),
   and the path is silently disabled on any non-canonical age_band token (LIB-02 class) —
   so masters either get over-credited or, if the token is wrong, get no credit at all.

Harness: /tmp/t4harness.js (+ t4run.js / t4prog.js). Constants copied verbatim from the .ts;
fit reproduced (squat-M mu=4.567438, sigma=0.358788 == PROVENANCE comment).
