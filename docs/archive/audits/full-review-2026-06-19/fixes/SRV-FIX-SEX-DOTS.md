# SRV-FIX-SEX-DOTS — strengthModelV3 robustness (unknown sex + DOTS poly guard)

**Branch:** `fix/full-review-2026-06-19`
**File touched (only):** `mobile/src/lib/strengthModelV3.ts`
**Protected & untouched by this fix:** `AGE_MULT`, `AgeBand`, `AGE_BANDS`, `TIER_LADDER` (handled separately).
**Status:** verified present in working tree; parse-sweep clean; harness PASS (0 throw / 0 NaN). Not committed.

## Problem
The `Sex` type is `'M' | 'F'` (line 69), but the profile field is nullable and the server has
historically sent free-text, so `sex` can arrive undisclosed/unknown/garbage at runtime. Several
percentile entry points indexed the sex-keyed tables (`DOTS_COEF[sex]`, `REF_BW[sex]`,
`STANDARDS_XBW[...][sex]`) directly and threw a `TypeError` on an unrecognised key. Separately,
`dotsScore` computes `500/poly(BW)`; for extreme-but-finite bodyweights the quartic denominator can
go ≤ 0, so `dots ≤ 0`, and a later `Math.log(dots)` becomes `NaN` which `clampPct` silently masks as
a *confident 0th percentile* (a false, not a "no-estimate", result).

## Fix — per function

A loose input type was introduced and a single narrowing guard added at the top of every public
entry point:

- `export type SexInput = Sex | string | null | undefined;` (line 83)
- `export function isKnownSex(sex): sex is Sex` → true only for `'M'`/`'F'` (line 86)

**Unknown/undisclosed sex (Fix 1) — compute BOTH M and F, return the MEAN (50/50 mixture), never throw:**

- `dotsScore(total, bw, sex)` (line 160): if `!isKnownSex`, returns mean of the M/F DOTS scores;
  propagates the no-estimate sentinel (`NaN`) if either branch is unusable. Below the guard it keeps
  the strict-`Sex` `dotsCoefficient` call (now statically narrowed).
- `computeRankedPercentile(lift, sex, e1rm, bw, alpha)` (line 281): if `!isKnownSex`, returns
  `clampPct(0.5*M + 0.5*F)`.
- `computePercentile(lift, sex, e1rm, bw, exp, ageBand)` (line 549): if `!isKnownSex`, returns
  `clampPct(0.5*M + 0.5*F)` of the experience/age-adjusted percentiles.
- `overallStrengthPercentile(s, b, d, bw, sex)` (line 315): if `!isKnownSex`, averages the two
  `OverallResult`s — `pct = clampPct(mean)`, `provisional = m||f`, `dots = sanitizeDots(mean)`.
- `overallStrengthPercentilePartial(lifts, bw, sex)` (line 354): if `!isKnownSex`, averages the two
  partial results (handles a `null` branch by returning whichever side produced a result, else `null`).
- `computeRankedPercentileUndisclosed` (line 303): the pre-existing explicit-undisclosed helper —
  unchanged in policy (already a 50/50 M/F mean); now consistent with the generic guard.

The strict-`Sex` internals (`dotsCoefficient` @154, `liftPopParams` @251, `dotsPopParams` @263) keep
the narrow `Sex` type; **every** call site sits *after* its caller's `isKnownSex` guard, so the
TypeScript narrowing is sound and no unguarded table index is reachable at runtime.

**DOTS polynomial guard (Fix 2) — sentinel instead of a false 0th, and sanitized `dots` fields:**

- `dotsScore` (line 169–176): after computing `dots = total * dotsCoefficient(bw, sex)`, if
  `!(dots > 0) || !Number.isFinite(dots)` it returns `NaN` — the *same* "no estimate" sentinel the
  `bwKg <= 0` guard in the overall lens uses — so callers degrade to provisional/no-estimate rather
  than logging `NaN` into a clamped 0th percentile.
- `overallStrengthPercentile` (line 339–344): after `dotsScore`, `if (!Number.isFinite(dots)) return
  { pct: 0, provisional: false, dots: 0 }` — the explicit no-estimate result, not a NaN-derived 0.
- `overallStrengthPercentilePartial` (line 385–387): same `dotsScore` NaN check → returns `null`
  (this function's no-estimate sentinel, which `TierLadderCard` already null-checks).
- `sanitizeDots(d)` (line 588): `Number.isFinite(d) ? d : 0`. Applied to **every** returned `dots`
  field — both the per-sex paths (lines 347, 389) and the unknown-sex averaged paths (lines 336, 371)
  — so a consumer never receives `NaN`/`Infinity` in `OverallResult.dots`.

## Verification (bash)

**Parse-sweep (definition of done):**
```
cd mobile && NODE_PATH="$PWD/node_modules" node ../audits/full-review-2026-06-19/parse-sweep.js app src
=> ENGINE=babel  FILES=167  FAILURES=0
```

**Harness** (transpile the .ts via `@react-native/babel-preset`, require it, exercise every entry
point with `sex ∈ {undefined, null, 'unknown', 'other', '', 'X'}` × `bw ∈ {1, 500, 80}`):

```
cases=111  threw=0  contract-violations(non-finite pct/dots or bad sentinel)=0
RESULT: PASS
```

Representative outputs (NaN shown as the sentinel; JSON would otherwise hide it as `null`):

```
##### sex=undefined #####
dotsScore(400,1,sex=undefined)              -> NaN(sentinel)        # extreme bw -> no estimate
dotsScore(400,80,sex=undefined)             -> 326.36              # normal bw, M/F mean, finite
computeRankedPercentile('squat',undef,140,80)        -> 90.50      # M/F mean, no throw
computePercentile('bench',undef,100,80,'intermediate','25-34') -> 96.51
overallStrengthPercentile(140,100,160,1,undef)   -> {pct:0,  provisional:false, dots:0}   # sentinel-clean
overallStrengthPercentile(140,100,160,500,undef) -> {pct:0,  provisional:false, dots:0}
overallStrengthPercentile(140,100,160,80,undef)  -> {pct:91.59, provisional:false, dots:326.36}
overallPartial({squat,bench},1,undef)   -> null                    # no-estimate sentinel
overallPartial({squat,bench},80,undef)  -> {pct:92.36, provisional:true, dots:195.82}
```

**no-false-0th proof** (M, total=400) — the sentinel only trips at non-physiological bw and yields a
*clean* `pct:0, dots:0`, while a normal/large-but-valid bw still produces a real non-zero percentile:

```
  bw=   1  dots=NaN(sentinel)  -> overall.pct=0      overall.dots=0
  bw=   5  dots=NaN(sentinel)  -> overall.pct=0      overall.dots=0
  bw=  10  dots=NaN(sentinel)  -> overall.pct=0      overall.dots=0
  bw= 300  dots=265.38         -> overall.pct=81.27  overall.dots=265.38   # valid, NOT zeroed
  bw= 400  dots=NaN(sentinel)  -> overall.pct=0      overall.dots=0
  bw= 500  dots=NaN(sentinel)  -> overall.pct=0      overall.dots=0
  bw=1000  dots=NaN(sentinel)  -> overall.pct=0      overall.dots=0
```

No entry point throws on any unknown sex; every `OverallResult.pct`/`.dots` is finite; the DOTS
poly-guard produces an explicit no-estimate (`NaN` from `dotsScore` → clean `pct:0,dots:0` / `null`),
never a false 0th from a `NaN` slipping through `Math.log`.
