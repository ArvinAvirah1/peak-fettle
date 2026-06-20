# FIX-MATH — strength-model percentile null-safety + age-band contract

Branch: `fix/full-review-2026-06-19` · Agent: FIX-MATH (Opus) · Findings: LIB-01 (P0), LIB-02 (P1)

## Files changed
- `mobile/src/lib/strengthModelV3.ts` (+29 lines, 0 deletions)

## Fixes

### LIB-01 (P0) — unguarded `bwKg <= 0` → NaN silently clamped to 0th percentile
`overallStrengthPercentile` and `overallStrengthPercentilePartial` divided by bodyweight
(via `dotsScore`) with no guard, so a missing/zero/non-finite `bwKg` drove the DOTS
denominator negative → `dots < 0` → `Math.log(dots) = NaN` → `clampPct(NaN)` returned 0
with no diagnostic. Added an early guard to each, matching the established sibling pattern
(`computeRankedPercentile` / `computePercentile` already return 0 for `bwKg <= 0`):

- `overallStrengthPercentile` returns its non-null sentinel `{ pct: 0, provisional: false, dots: 0 }`
  when `total <= 0 || bwKg <= 0 || !isFinite(bwKg)`. It is consumed by callers that read
  `.pct` / `.provisional` directly (the calibration test, the 3-lift internal call, and
  `TierLadderCard`'s undisclosed-sex mixture), so it must stay non-null. Sentinel chosen by
  tracing those callers.
- `overallStrengthPercentilePartial` returns `null` — its existing "no estimate" sentinel
  (it already returns `null` when no lifts are present), which `TierLadderCard.tsx:152,167`
  already null-checks. The guard sits before the 3-lift delegation, so a bad `bwKg` on the
  3-lift path also yields `null` (consistent "no estimate"), never NaN.

### LIB-02 (P1) — age-band token vocabulary mismatch disables age adjustment
The producer `ageBandFromBirthDate` emits underscore tokens (`under_30`, `30_39`, …) while
`AGE_MULT` is keyed with dash tokens (`25-34`, …), so `ageMultiplier` always fell back to
`1.0` on the birth-date path (age adjustment silently off).

**Scope note:** `ageBandFromBirthDate` lives in
`mobile/src/lib/trainingEngine/localContext.ts`, which is **outside this agent's single
editable file**. The producer-side token rewrite belongs to whoever owns `localContext.ts`.
What I did in-scope (per the ticket's "align to the `AGE_MULT` key set in this same file"):
exported a canonical `AGE_BANDS: readonly AgeBand[]` constant (the exact `AGE_MULT` key set)
plus a doc-comment that names the offending producer and instructs it to import the `AgeBand`
type and annotate its return as `AgeBand | null` so tsc enforces the contract going forward.
This establishes the single source of truth so the producer fix is a mechanical conform-to-type.

## Determinism
No `new Date()` / `Date.now()` introduced (verified by grep — file has none). Guards are pure.

## Verification (run against the on-disk file)
- `@babel/parser` parse-sweep of the file: **PARSE_OK**; comment balance 15 `/*` / 15 `*/`.
- `node mobile/__tests__/strength-model-v3.test.js`: **ALL V3 MODEL TESTS PASS** (incl. the
  composite-calibration PIT test that calls `overallStrengthPercentile(total, 0, 0, 75, 'M')`
  — bench=0/deadlift=0, total>0/bw>0 — confirming the guard does not perturb the valid path).
- Behavioral check (ts.transpileModule → assert): valid inputs give finite positive pct;
  `bwKg` ∈ {0, -5, NaN} and `total=0` give the sentinel with **no NaN**; partial-path bad
  `bwKg` returns `null`; `AGE_BANDS` deep-equals `Object.keys(AGE_MULT)`; underscore token
  misses (1.0) while dash token hits.

## Concern / follow-up (not in my scope)
- **LIB-02 is only half-closed by this change.** The actual behavior fix requires editing
  `mobile/src/lib/trainingEngine/localContext.ts` so `ageBandFromBirthDate` returns the
  canonical dash tokens (`AgeBand | null`, importing the type / `AGE_BANDS` exported here) and
  adopts the 5-year bands (incl. `< 18 → 'under-18'`, currently `null`). Assign that to the
  agent that owns `localContext.ts`. Per SYNTH-1 §(c), no live percentile is wrong today
  (rankings use the server's correctly-formatted `user.age_band`), so this is a dormant
  feature-disable, but the contract is only fully enforced once the producer conforms.
- **Process note:** mid-edit, a tool write truncated the file's tail (lost `computePercentile`
  + `clampPct`) — the corruption class CLAUDE.md documents. I detected it via the parse-sweep
  (`Unterminated comment`, `/* `=15 vs `*/`=14), rebuilt the file from the HEAD blob + the
  three intended edits with ASCII-only comments, and re-verified parse + tests. Final
  `git diff` is +29/-0 (no existing code altered). Worth keeping the parse-sweep as the DoD.
