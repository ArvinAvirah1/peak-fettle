# T3 — Strength-math edge / degenerate-input validation

Date: 2026-06-19 · Target: `mobile/src/lib/strengthModelV3.ts` (+ `mobile/src/lib/oneRm.ts`)
Method: standalone node harness — verbatim ports of `erf/normCdf/normInv`, `dotsCoefficient/dotsScore`,
`fitLognormal/liftPopParams/dotsPopParams`, `computeRankedPercentile`, `overallStrengthPercentile`,
`overallStrengthPercentilePartial`, `computePercentile`, `clampPct`, `epley1Rm/brzycki1Rm`.

## VERDICT: HOLES (the specific LIB-01 `bw<=0` guard HOLDS; three other paths leak)

The just-added guard works for what it targets. But finite-positive extreme inputs and a missing `sex`
still produce a silently-wrong 0th percentile, an Infinity leak, and a hard crash respectively.

## ✅ LIB-01 `bw <= 0` / non-finite guard — CONFIRMED HOLDS

`overallStrengthPercentile`: `if (!(total>0) || !(bwKg>0) || !Number.isFinite(bwKg)) return {pct:0,...}`.
All of these returned a clean sentinel with **no NaN**:

| input | result |
|---|---|
| overall bw=0 / -5 / NaN / undefined / Infinity | `{pct:0, provisional:false, dots:0}` |
| ranked bw=0 / -5 / NaN / undefined / Infinity | `0` |
| computePercentile bw=0 / -5 / NaN / undefined | `0` |
| partial bw=0 / -5 / NaN / undefined | `null` |

Confirmed the intended failure mode is blocked: a missing bw no longer feeds `dotsScore` a NaN that
`clampPct` would mask as the 0th percentile. Good.

## ❌ HOLE 1 (the real one) — extreme but FINITE+POSITIVE bodyweight → silently-wrong 0th percentile

The DOTS denominator is a 4th-order polynomial that goes **negative** outside its fitted bodyweight band.
`bwKg` is then finite and > 0, so the LIB-01 guard passes it through; `dots = total * (500/negativeDenom)`
is negative; `Math.log(dots) = NaN`; `clampPct(NaN) = 0`. Output is `{pct:0, dots:<negative>}` — a wrong
0th percentile presented as if real, NOT a sentinel.

Denominator sign-change bodyweights (where it crosses through zero / goes negative):
- **Male:** negative for **bw < 14.5 kg**.
- **Female:** negative for **bw < 4.5 kg** AND for **bw > 262.75 kg**.

Reproduced (silently-wrong 0th, dots leaks negative):
- overall bw=1 kg  → `{pct:0, dots:-792.67}`
- overall bw=10 kg → `{pct:0, dots:-2637.46}`
- overall bw=500 kg → `{pct:0, dots:-18.51}`  (female-coef path the same; male coef recovers by 300)

Severity: realistic bodyweights (≥30 kg M, ≥25 kg F) are **safe** — dots stays positive there, so a normal
user cannot trigger it. But a fat-fingered entry (e.g. 1, or lb-as-kg making 500), or a units bug upstream,
yields a confidently-wrong "0th percentile / Iron tier" with no provisional/null flag. The `Number.isFinite`
half of the guard does NOT catch this because the bad value is the *polynomial output*, not the input.

Fix: after computing `dots`, guard `if (!(dots > 0) || !Number.isFinite(dots)) return {pct:0,...}` (or clamp
bw into the DOTS-valid band). Same applies inside `overallStrengthPercentilePartial`.

## ❌ HOLE 2 — `dots` field leaks Infinity/NaN; only `pct` is clamped

`clampPct` sanitises the percentile but never touches the `dots` field on the result object.
- partial `{squat: Infinity}` → `{pct:100, provisional:true, dots:Infinity}` — **dots=Infinity leaks**.
- (any caller reading `.dots` for display/PR logic gets Infinity / could get NaN.)

`pct` itself stayed clamped (100), so the headline number is safe; the un-sanitised `dots` is the leak.
Fix: sanitise `dots` too before returning (e.g. `Number.isFinite(dots) ? dots : 0`), or reject non-finite
inputs at the top of partial/overall.

## ❌ HOLE 3 — missing / unknown `sex` → hard CRASH (TypeError)

No `sex` validation anywhere. An undefined or unexpected sex string throws (not a sentinel, a crash):
- `computePercentile(..., sex=undefined)` → THREW `Cannot read properties of undefined (reading 'map')` (via `liftPopParams`)
- `computePercentile(..., sex='X')` → same throw
- `overallStrengthPercentile(..., sex=undefined | 'X')` → THREW `... (reading 'A')` (via `dotsCoefficient`)
- `computeRankedPercentile(..., sex=undefined)` → THREW `... (reading 'map')`
- `dotsScore(450, 80, undefined)` → THREW `... (reading 'A')`

Note the lib exports `computeRankedPercentileUndisclosed` for the disclosed-vs-undisclosed case, but the
core entry points don't fall back to it / don't validate — an unknown sex token reaching these crashes.

## Minor / acceptable (NOT bugs)

- **Age:** missing(null)/0/-5/130/wrong-token("under_30") all → multiplier 1.0, clean number (matches the
  documented LIB-02 "OFF when unrecognised"). No NaN. ✓  (Side effect: the known underscore-token bug just
  silently disables age adjustment rather than crashing — consistent with the code comment.)
- **Epley/1RM (`oneRm.ts`):** fully guarded. reps=0 / weight≤0 / NaN → `0`; reps=1 → weight; reps=30 → 2×;
  reps=1000 → 3433 (no cap, but finite and harmless — it's an input to a guarded lens); brzycki reps≥37 → 0. ✓
- **High lifts:** lift=1000 kg → ~99.9th (clamped, sane); lift=Infinity (ranked) → 100; lift=1e9 → 100. ✓
- **Net-negative totals:** `overall(-500,100,200)` and all-negative → caught by `!(total>0)` → `{pct:0}`. ✓
- **Empty / all-zero / single-lift history:** partial `{}` / all-zero → `null`; single `{squat:150}` →
  `{pct:~87, provisional:true}` (correctly provisional). `{squat:NaN}` → `null` (filtered by `>0`). ✓
- **ranked/computePercentile bw=Infinity → 0** is *correct by collapse* (expected=+Inf, z=−Inf, Φ=0), not by
  a finiteness guard — so it's safe today but unguarded; a huge finite bw also trends to 0 (under-rates, but
  no NaN). Worth a defensive finite check for symmetry with `overall`, but not a leak.

## Inputs that produced NaN / Infinity / crash / absurd output (summary list)

1. overall/partial, **bw 1–14.5 kg (M)** or **bw <4.5 / >262.75 kg (F)** → dots NEGATIVE → `Math.log`=NaN →
   **silently-wrong pct:0** (e.g. bw=1 → dots=-792.67, pct=0; bw=500 → dots=-18.51, pct=0).
2. partial **`{squat: Infinity}`** → **dots:Infinity** leaks in result object (pct clamped to 100).
3. **sex = undefined / 'X'** (any unknown) → **CRASH / TypeError** in all five entry points
   (`computePercentile`, `overallStrengthPercentile`, `computeRankedPercentile`, `dotsScore`, partial).
