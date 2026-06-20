# LIB findings

## Summary
Files reviewed: 14 (`mobile/src/lib/` — `insightsLocal.ts`, `oneRm.ts`, `plateMath.ts`, `strengthModelV3.ts`, `warmup.ts`, `trainingEngine/exerciseCatalog.ts`, `exerciseFill.ts`, `index.ts`, `loading.ts`, `localContext.ts`, `reasoning.ts`, `scaleDown.ts`, `sequence.ts`, `templates.ts`). Counts — P0: 2 P1: 3 P2: 2 P3: 1. Overall health is good; the deterministic training engine and percentile math are well-structured, but two correctness bugs exist — one silently nullifies the age-adjustment feature, and `overallStrengthPercentile` can return `NaN` (safely clamped to 0 but with no guard or diagnostic) for zero/tiny bodyweights.

---

### [P0] LIB-01 — DOTS formula produces `NaN` percentile when `bwKg <= 0` in `overallStrengthPercentile`

- **File:** `mobile/src/lib/strengthModelV3.ts:267–278`
- **Problem:** `overallStrengthPercentile` and `overallStrengthPercentilePartial` have no guard on `bwKg <= 0`. The DOTS polynomial denominator (evaluated at `bwKg = 0`) is strongly negative for both sexes (M ≈ -307, F ≈ -57), so `dotsScore` returns a large negative DOTS value, and `Math.log(negative)` produces `NaN`. `clampPct` catches the `NaN` and returns `0`, so the visual result is silently wrong (0th percentile) with no diagnostic. Companion functions `computePercentile` (line 434) and `computeRankedPercentile` (line 247) both guard `e1rmKg <= 0 || bwKg <= 0 → return 0` explicitly; `overallStrengthPercentile` is inconsistent. Additionally, the polynomial itself yields a negative denominator for extreme bodyweights (M > ~340 kg, F > ~260 kg) — academic in practice but the same silent-zero failure mode applies.
- **Evidence:**
```ts
export function overallStrengthPercentile(
  squatE1rm: number,
  benchE1rm: number,
  deadliftE1rm: number,
  bwKg: number,  // ← no guard: bwKg <= 0 silently returns 0
  sex: Sex,
): OverallResult {
  const total = squatE1rm + benchE1rm + deadliftE1rm;
  const dots = dotsScore(total, bwKg, sex);            // NaN at bwKg=0
  const pct = clampPct(100 * normCdf((Math.log(dots) - mu) / sigma)); // log(NaN)→NaN→clamp to 0
```
- **Invariant/Rubric:** P0 Correctness — silent NaN propagation; inconsistency with sibling functions that do guard `bwKg <= 0`.
- **Suggested direction:** Add `if (total <= 0 || bwKg <= 0) return { pct: 0, provisional: false, dots: 0 };` at the top of both `overallStrengthPercentile` and `overallStrengthPercentilePartial`, matching the pattern already used in `computePercentile`/`computeRankedPercentile`.
- **Confidence:** HIGH

---

### [P0] LIB-02 — Age-band tokens from `ageBandFromBirthDate` do not match `AGE_MULT` keys; age adjustment silently disabled

- **File:** `mobile/src/lib/trainingEngine/localContext.ts:83–96` (producer) vs `mobile/src/lib/strengthModelV3.ts:391–404` (consumer)
- **Problem:** `ageBandFromBirthDate` derives age-band tokens from a stored `birth_date` column and returns strings in underscore format: `'under_30'`, `'30_39'`, `'40_49'`, `'50_59'`, `'60_plus'`. But `strengthModelV3.ts`'s `AGE_MULT` table (and `AgeBand` type) uses dash format: `'under-18'`, `'18-24'`, `'25-34'`, `'35-44'`, `'45-54'`, `'55+'`. The two vocabularies are completely different — no token produced by `ageBandFromBirthDate` ever matches any key in `AGE_MULT`. `ageMultiplier()` gracefully falls back to `1.0` on a miss, so the age adjustment is silently disabled for all users whose `age_band` is computed from `birth_date` rather than stored directly on the server profile. Note: the token format mismatch is in the plan-engine path (`localContext.ts` → `PlanCtx.profile.age_band`), not in the rankings screen which reads `user.age_band` directly from the server-delivered user object. However, any future screen that calls `computePercentile` with the plan-context profile will also silently skip age adjustment.
- **Evidence:**
```ts
// localContext.ts:92–96 (producer)
if (age < 30) return 'under_30';   // ← underscore format
if (age < 40) return '30_39';
...
// strengthModelV3.ts:391 (consumer)
export type AgeBand = 'under-18' | '18-24' | '25-34' | '35-44' | '45-54' | '55+';
//                      ^^^^^^^^ dash format — none of the above will ever match
export const AGE_MULT: Record<AgeBand, number> = { 'under-18': 0.96, '18-24': 0.98, ...};
```
- **Invariant/Rubric:** P0 Correctness — feature silently disabled; also a token-contract mismatch between producer and consumer.
- **Suggested direction:** Either (a) align `ageBandFromBirthDate` to output `strengthModelV3`'s exact `AgeBand` tokens (`'under-18'`, `'25-34'`, etc.), or (b) add a mapping layer at the call site. Option (a) is cleaner. The coarser age buckets in `localContext.ts` (`under_30`, `30_39`) also don't align with the model's 5-year bands (e.g., a 22-year-old and a 28-year-old both get `'under_30'` but should get `'18-24'` and `'25-34'` respectively).
- **Confidence:** HIGH

---

### [P1] LIB-03 — `fitLognormal` produces `Infinity`/`NaN` when all input loads are identical (szz = 0)

- **File:** `mobile/src/lib/strengthModelV3.ts:179–206`
- **Problem:** `fitLognormal` computes `sigma = szy / szz`. If all loads are identical (e.g. a degenerate one-lift partial set where the single lift is always the same value), `szz = 0` and `sigma = Infinity`. Then `normCdf((Math.log(dots) - mu) / sigma)` produces 0.5 (or `NaN`) rather than a meaningful percentile. `clampPct` saves the display but the memoized `_liftCache` / `_dotsCache` would not cache `NaN`/`Infinity` parameters. This is an edge case for the 6-anchor fit (all 6 standards values are distinct and chosen to be monotone) but `overallStrengthPercentilePartial` can call `fitLognormal` with a custom `subsetDots` array where, if the subtotal is zero for all standards (e.g. a degenerate pattern), all inputs to `fitLognormal` are 0 → `Math.log(0) = -Infinity` for every `y[i]`, making `ybar = -Infinity`, `szy = NaN`, `sigma = NaN`.
- **Evidence:**
```ts
const sigma = szy / szz;  // ← div-by-zero when all loads identical; NaN when szz=0
const mu = ybar - sigma * zbar;
// line 304: Math.log(dots) with NaN sigma → NaN pct → clampPct → 0
```
- **Invariant/Rubric:** P1 — NaN propagation in math library; not guarded. Edge case but real for the partial-total path with zero subsets.
- **Suggested direction:** Add `if (szz === 0) return { mu: ybar, sigma: popSigma_fallback_or_constant, r2: 1 }` or guard `szz` before division. Also guard `loads` for zeros before calling `Math.log`.
- **Confidence:** MED

---

### [P1] LIB-04 — `computeDeload` uses `new Date()` inside the function body — nondeterministic, untestable

- **File:** `mobile/src/lib/insightsLocal.ts:380`
- **Problem:** `computeDeload(history, lastDeloadAt)` calls `const now = new Date()` internally on line 380. This makes the function impure and its output nondeterministic: the same inputs produce different results depending on when the function is called. `computeRecovery` correctly accepts `now: Date` as a parameter (line 82), which is the established pattern in this file. The deload 42-day rule depends critically on `now`, and this nondeterminism makes the function impossible to unit-test without mocking the system clock.
- **Evidence:**
```ts
export function computeDeload(
  history: unknown[],
  lastDeloadAt: string | null
): DeloadResponse {
  const ruleTrace: string[] = [];
  const rows = (history as WorkoutHistoryRow[]);
  const now = new Date();   // ← internal clock read; breaks determinism
```
- **Invariant/Rubric:** P1 — determinism requirement (CLAUDE.md §7: "the training engine must be deterministic"); pure-function purity violated.
- **Suggested direction:** Add `now: Date = new Date()` as a parameter (defaulting to `new Date()` for backward-compat) so callers and tests can inject a fixed timestamp. Same pattern as `computeRecovery`.
- **Confidence:** HIGH

---

### [P1] LIB-05 — TSC TS2532 in `insightsLocal.ts:250,272` — "object possibly undefined" at runtime-safe array accesses

- **File:** `mobile/src/lib/insightsLocal.ts:250`, `mobile/src/lib/insightsLocal.ts:272`
- **Problem:** Two accesses flagged in `00-tsc.txt` as TS2532 "Object is possibly 'undefined'":
  - Line 250: `recent7[recent7.length - 1].resting_hr_bpm` — `recent7` is sliced from `hrRows` inside `if (hrRows.length >= 7)`, so it has exactly 7 elements. The access is runtime-safe but TypeScript can't prove it.
  - Line 272: `sleepRows[sleepRows.length - 1].sleep_hours` — guarded by `if (sleepRows.length >= 1)`, also runtime-safe.
  Both should be fixed with non-null assertions or explicit null checks to eliminate the TSC errors cleanly.
- **Evidence:**
```ts
if (hrRows.length >= 7) {
  const recent7 = hrRows.slice(-7);
  const today = recent7[recent7.length - 1].resting_hr_bpm ?? 0; // line 250: TS2532
...
if (sleepRows.length >= 1) {
  const lastNight = sleepRows[sleepRows.length - 1].sleep_hours ?? 0; // line 272: TS2532
```
- **Invariant/Rubric:** P1 — TSC null-safety error; runtime-safe but noisy and hides real errors.
- **Suggested direction:** Add `!` non-null assertion: `recent7[recent7.length - 1]!.resting_hr_bpm` and `sleepRows[sleepRows.length - 1]!.sleep_hours`.
- **Confidence:** HIGH

---

### [P2] LIB-06 — `epley1Rm` in `loading.ts` duplicates `oneRm.ts` implementation with a reps-cap difference

- **File:** `mobile/src/lib/trainingEngine/loading.ts:18–21` vs `mobile/src/lib/oneRm.ts:9–13`
- **Problem:** Two separate Epley implementations exist in the same codebase. `loading.ts` caps reps at 12 (`const cappedReps = Math.min(reps, 12)`) whereas `oneRm.ts:epley1Rm` has no cap (any rep count, though it guards `reps === 1` for identity). The cap in `loading.ts` was intentional (noted in the spec comment "same cap as plans.js pbMap"), but the divergence is undocumented and a future maintainer editing `oneRm.ts` wouldn't know about the cap difference. Also, `loading.ts:epley1RM` exports under a different name (`epley1RM` vs `epley1Rm` in `oneRm.ts`) creating API surface duplication.
- **Evidence:**
```ts
// loading.ts:18–21
export function epley1RM(weightKg: number, reps: number): number {
  const cappedReps = Math.min(reps, 12);  // 12-rep cap
  if (cappedReps <= 1) return weightKg;
  return weightKg * (1 + cappedReps / 30);
}
// oneRm.ts:9–12 — no cap
export function epley1Rm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
```
- **Invariant/Rubric:** P2 — duplicated logic with subtle behavioral divergence; maintenance hazard.
- **Suggested direction:** Have `loading.ts` import and call `epley1Rm` from `oneRm.ts` with an explicit reps-cap applied at the call site, or add a `cappedReps` parameter to `oneRm.ts`. Document the intentional cap.
- **Confidence:** HIGH

---

### [P2] LIB-07 — `warmupLadder` in `loading.ts` uses a hardcoded `barWeight + 20` threshold that appears inverted

- **File:** `mobile/src/lib/trainingEngine/loading.ts:49–60`
- **Problem:** `warmupLadder` filters out warm-up rungs where `weight_kg <= barWeight + 20`. `barWeight` is 20 kg (standard bar). So the filter threshold is `> 40 kg`. This means a rung is only included when it exceeds 40 kg. For a working weight of 60 kg: rungs at 40%, 55%, 70%, 85% = 24 kg, 33 kg, 42 kg, 51 kg. Only 42 kg (70%) and 51 kg (85%) survive (24 and 33 ≤ 40). This skips the low-percentage ramps, which is the spec intent ("skip rungs ≤ bar+20kg"). However the threshold name `barWeight + 20` reads as "bar weight plus 20", which is fine for a 20 kg bar. But the comment says "skip rungs ≤ bar+20kg (20kg)" suggesting the threshold is `barWeight + 20 = 40`. For very light working weights (e.g., 45 kg), all rungs (18, 24.75, 31.5, 38.25 kg) would be ≤ 40 kg and the function returns an empty array. No warm-up is prescribed even though the working weight is heavier than the bar. This is a logic cliff at low working weights.
- **Evidence:**
```ts
const barWeight = 20;
const rungs = [0.4, 0.55, 0.7, 0.85];
return rungs
  .map((pct) => ({
    weight_kg: roundTo2_5(workingWeightKg * pct),
    reps: pct <= 0.55 ? 5 : pct <= 0.7 ? 3 : 1,
  }))
  .filter((r) => r.weight_kg > barWeight + 20); // clips ALL rungs when workingWeightKg <= ~47.5kg
```
- **Invariant/Rubric:** P2 — edge case: users with e1RM < ~55 kg get no warm-up rungs prescribed even though they should at least get an empty-bar warm-up.
- **Suggested direction:** Change the threshold to `r.weight_kg > barWeight` (just the bar, 20 kg) so that any rung above an empty bar is prescribed, matching the intent of "skip ramps that are essentially just the bar."
- **Confidence:** MED

---

### [P3] LIB-08 — `ageBandFromBirthDate` ignores the under-18 boundary (18-year-olds lumped with under-30)

- **File:** `mobile/src/lib/trainingEngine/localContext.ts:91–92`
- **Problem:** The function returns `null` for `age < 18` (considered implausible) and `'under_30'` for `18 <= age < 30`. There is no distinction between, say, a 17-year-old (who the model treats as `'under-18'` with multiplier 0.96) and a 22-year-old (who should be `'18-24'` with multiplier 0.98). Since the token vocab mismatch (LIB-02) already means age adjustment is disabled from this path, this is a P3 secondary concern to be fixed after LIB-02.
- **Evidence:**
```ts
if (age < 18 || age > 100) return null; // implausible — ignore
if (age < 30) return 'under_30';        // lumps 18-29 together
```
- **Invariant/Rubric:** P3 — maintainability; secondary to LIB-02.
- **Suggested direction:** Align the age-band buckets with `AgeBand` in `strengthModelV3.ts` when fixing LIB-02.
- **Confidence:** HIGH
