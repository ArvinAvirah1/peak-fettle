# GATE-MATH — adversarial hard-gate of commit 10d6f3b (strengthModelV3.ts)

**VERDICT: FAIL** — LIB-01 is sound, but LIB-02 is only half-closed: the bug
this commit claims to address is still live because the token PRODUCER was never
fixed. The commit touches only `strengthModelV3.ts` (a doc comment + one exported
constant + two pure guards); it changes no behavior for LIB-02.

---

## LIB-01 — bodyweight guard: SOUND (one pre-existing P1 nit)

PASS on correctness:
- `overallStrengthPercentile` (strengthModelV3.ts:267) now returns the sentinel
  `{ pct: 0, provisional: false, dots: 0 }` for `!(total>0) || !(bwKg>0) ||
  !Number.isFinite(bwKg)` (lines 280-282). Shape matches the `OverallResult`
  interface (line 265). Its only non-test caller is `overallStrengthPercentilePartial`
  itself (line 307), which is already bw-guarded before that call.
- `overallStrengthPercentilePartial` (strengthModelV3.ts:296) returns its `null`
  sentinel for `!(bwKg>0) || !Number.isFinite(bwKg)` (line 304). Its only caller
  `TierLadderCard.tsx:154-157` null-checks the result at `TierLadderCard.tsx:167`
  (`if (!result) return null`) AND pre-guards bw at `TierLadderCard.tsx:124,127`
  (returns a hint card when `bw == null`). Belt-and-suspenders; no crash, no wrong value.
- Undisclosed-sex mixture branch (`TierLadderCard.tsx:156-166`) handles either
  `m`/`f` being null via `m && f ? ... : null`. OK.
- No other ungated bodyweight-divided percentile path remains in the file: the
  sibling lenses `computeRankedPercentile` (line 247) and `computePercentile`
  (line 463) were already guarded. File ends at line 481; no other consumer.

### P1 (pre-existing, NOT introduced here): siblings use `bwKg <= 0`, not finite-check
`computeRankedPercentile:247` and `computePercentile:463` guard with
`e1rmKg <= 0 || bwKg <= 0`, which does NOT catch `NaN`/`+Infinity`
(`NaN <= 0` === false). A non-finite bwKg into those two still flows through, but
`clampPct` (line 478: `if (!Number.isFinite(p)) return 0`) catches the NaN at the
end → silent 0th percentile, not a crash. So the commit's NEW guards are strictly
MORE robust than the "sibling lenses" its comment claims parity with — the comment
slightly overstates existing coverage. Low severity; result is still 0, not a throw.

---

## LIB-02 — age-band token alignment: PARTIALLY CLOSED (this is the FAIL)

The commit adds, in `strengthModelV3.ts`:
- a doc comment (lines 416-428) that itself ADMITS the producer "lives in a
  separate file (outside this module's edit scope)" and merely says it *"should"*
  conform, and
- `export const AGE_BANDS` (line 429), which has **zero consumers** (grep: only
  referenced in its own file). `ageMultiplier` (line 431) already did `?? 1.0`.

=> No executable change for LIB-02. The producer was never fixed.

### P0 — birth-date producer still emits non-existent tokens; age adjustment silently OFF
`mobile/src/lib/trainingEngine/localContext.ts:83-97` `ageBandFromBirthDate` still
returns underscore tokens:
  - localContext.ts:92  `return 'under_30';`
  - localContext.ts:93  `return '30_39';`
  - localContext.ts:94  `return '40_49';`
  - localContext.ts:95  `return '50_59';`
  - localContext.ts:96  `return '60_plus';`
NONE of these is a key of `AGE_MULT` (strengthModelV3.ts:407-414:
`under-18,18-24,25-34,35-44,45-54,55+`). The value flows
`localContext.ts:69 age_band` → profile → `computePercentile(ageBand)` →
`ageMultiplier(ageBand)` (strengthModelV3.ts:469) → `?? 1.0`. Net effect: for any
free/local-first user whose age_band is derived from birth_date, the masters/youth
age multiplier is STILL disabled — the exact bug LIB-02 was opened to fix.

Worse than a dash-vs-underscore typo: the producer's BUCKETS also differ from the
model's (producer splits at 30/40/50/60; model bands split at 18/24/34/44/54), so a
mechanical `_`→`-` swap would still not match (`under-30` is not a key either). The
producer must be rewritten to the 6 `AgeBand` buckets and annotated `: AgeBand | null`
so `tsc` enforces it — none of which this commit did.

---

## Nondeterminism: NONE introduced
The diff adds only a constant, a comment, and two pure early-return guards. No
`Date.now()` / `Math.random()` / `new Date()`. (The `Math.random()` at
strength-model-v3.test.js:80 and `new Date()` in localContext.ts are pre-existing
and not part of this commit.)

---

## Required to clear the gate
Fix the PRODUCER `ageBandFromBirthDate` in
`mobile/src/lib/trainingEngine/localContext.ts` to emit one of the 6 canonical
`AgeBand` dash tokens (re-bucketed to 18/24/34/44/54), import the `AgeBand` type,
and annotate the return `: AgeBand | null`. Until then LIB-02 is not closed.
