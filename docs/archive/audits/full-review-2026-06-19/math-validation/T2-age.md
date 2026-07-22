# T2 — AGE adjustment validation (post LIB-02 fix)

Scope: `mobile/src/lib/strengthModelV3.ts` (`AGE_MULT`, `ageMultiplier`, `computePercentile`)
+ producer `ageBandFromBirthDate` in `mobile/src/lib/trainingEngine/localContext.ts`.
Method: standalone node port of the pure age path (no app import). Harness: `/tmp/t2_age_harness.js`.

## VERDICT
- **Producer/AGE_MULT alignment: PASS.** Post-LIB-02, `ageBandFromBirthDate` emits exactly
  `18-24 / 25-34 / 35-44 / 45-54 / 55+` — all five are real `AGE_MULT` keys. **No silent 1.0
  fallthrough on any in-range age.** (`under-18` exists in AGE_MULT but is unreachable from this
  producer, which returns `null` for age<18 and age>100.)
- **Age now genuinely moves the percentile: YES.** Multiplier is applied as `lAdj = e1rm / mult`
  in `computePercentile` (Lens 1, per-lift). Lower mult ⇒ larger adjusted load ⇒ higher pct.
- **Bands are sane / no cliffs: mostly PASS, one soft step.** Boundaries are coarse (5/10-yr bands)
  but monotonic and small; worst single-birthday jump is the 54→55 edge.
- **vs McCulloch literature: app UNDER-CORRECTS masters — confirmed.** The deficit it assumes
  is too shallow, and it's **flat above 55**, so real masters are scored **weaker than reality**,
  worsening with age.

## PRODUCER ↔ AGE_MULT KEYS
```
Producer emits: 18-24, 25-34, 35-44, 45-54, 55+   (all -> real AGE_MULT band)
AGE_MULT keys : under-18, 18-24, 25-34, 35-44, 45-54, 55+
  18-24->0.98  25-34->1.00  35-44->0.97  45-54->0.93  55+->0.86
ALL PRODUCER TOKENS MAP TO A REAL AGE_MULT BAND: true
```
Boundaries (`<25, <35, <45, <55, else`) line up with the band labels — no off-by-one (24=18-24, 25=25-34, etc.).

## PERSONA SWEEP — Male, 85kg, bench=100kg, squat=140kg (experienceLevel=null)
```
age | band   | AGE_MULT | bench_pct | squat_pct
 20 | 18-24  |   0.98   |   88.5    |   80.7
 24 | 18-24  |   0.98   |   88.5    |   80.7
 25 | 25-34  |   1.00   |   87.4    |   79.1   <- prime reference (lowest pct)
 30 | 25-34  |   1.00   |   87.4    |   79.1
 34 | 25-34  |   1.00   |   87.4    |   79.1
 35 | 35-44  |   0.97   |   89.1    |   81.4
 44 | 35-44  |   0.97   |   89.1    |   81.4
 45 | 45-54  |   0.93   |   91.1    |   84.4
 54 | 45-54  |   0.93   |   91.1    |   84.4
 55 | 55+    |   0.86   |   94.2    |   89.1
 60 | 55+    |   0.86   |   94.2    |   89.1
 65 | 55+    |   0.86   |   94.2    |   89.1   <- flat: 65 == 55 (no further credit)
 70 | 55+    |   0.86   |   94.2    |   89.1
```
Direction is correct (older ⇒ same lift scores a higher percentile). Every swept age maps to a
real band — no undefined→1.0.

## BOUNDARY CLIFFS (single-birthday jump)
```
24->25 (0.98->1.00): bench -1.1pp, squat -1.6pp   (cross into prime: pct DROPS slightly)
34->35 (1.00->0.97): bench +1.7pp, squat +2.4pp
44->45 (0.97->0.93): bench +2.1pp, squat +3.0pp
54->55 (0.93->0.86): bench +3.0pp, squat +4.6pp   <- largest step
```
A 0.86 band that then runs from 55 to 100 is the real defect: one 55th birthday grants ~3-5pp,
then a 75-year-old gets the **same** credit as a 56-year-old. Not a NaN/undefined cliff — a
modelling coarseness + missing upper bands.

## APP vs McCULLOCH (expected strength as fraction of prime)
```
McCulloch:  40=1.00  45=0.94  50=0.87  55=0.80  60=0.73  65=0.65
App bands:  18-24=0.98  25-34=1.00  35-44=0.97  45-54=0.93  55+=0.86  (flat >55)

age 54: app 0.93 vs McCulloch ~0.83  -> app +0.10  (app/McC 1.11)
age 60: app 0.86 vs McCulloch  0.73  -> app +0.13  (app/McC 1.18)
age 65: app 0.86 vs McCulloch  0.65  -> app +0.21  (app/McC 1.32)
```
App's assumed retained strength is too HIGH at every masters age, and the gap widens with age.

## DIRECTION OF BIAS — reasoned from the code
`computePercentile` does `lAdj = e1rm / AGE_MULT`; the **user's own lift** is divided by the
multiplier (the population standard is NOT scaled). The multiplier IS the app's belief about how
much strength an age-prime lifter retains. Because the app sets that denominator-shrink too small
(mult too close to 1 / too high), the older lifter's `lAdj` is inflated by too little, so the
percentile lands too LOW vs what McCulloch's deeper deficit would award:
```
                  bench (100kg)            squat (140kg)
age 54:  app 91.1 vs McCulloch 95.1  (-4.0pp)   |  84.4 vs 90.5  (-6.1pp)
age 60:  app 94.2 vs McCulloch 97.9  (-3.7pp)   |  89.1 vs 95.4  (-6.4pp)
age 65:  app 94.2 vs McCulloch 99.1  (-4.9pp)   |  89.1 vs 97.8  (-8.7pp)
```
**Bias = the app UNDER-credits masters (scores them WEAKER than reality).** Worst at the oldest
ages on the heavier compound lift: **squat at 65 ≈ -8.7pp**, and it only grows past 65 because
55+ is flat. Younger bands (18-44) are within ~1-2pp of neutral — fine.

## RECOMMENDATION (advisory)
Deepen the masters multipliers toward McCulloch and split 55+ into 55-64 / 65-74 / 75+
(e.g. ~0.80 / 0.72 / 0.65) so a 70-year-old isn't scored like a 56-year-old.
