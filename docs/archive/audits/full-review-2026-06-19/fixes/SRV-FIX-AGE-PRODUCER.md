# SRV-FIX-AGE-PRODUCER — finer age bands in localContext producer

**Branch:** `fix/full-review-2026-06-19`
**File edited:** `mobile/src/lib/trainingEngine/localContext.ts` (function `ageBandFromBirthDate`)
**Date:** 2026-06-19

## Why
The masters age bands emitted by `ageBandFromBirthDate` must EXACTLY match the new
`AGE_MULT` keys being introduced in `strengthModelV3.ts`. The old producer collapsed
masters lifters into two coarse buckets (`'45-54'`, `'55+'`), which no longer line up
with the finer per-decade keys in the strength model. A mismatched key would fall
through the age-multiplier lookup and silently mis-rank older lifters.

## Change
Widened the masters portion of the band ladder from 2 coarse bands to 6 finer bands.
The existing `< 18` guard (here written `if (age < 18 || age > 100) return null;`,
which also keeps the implausible-age upper bound) and the `18-24 / 25-34 / 35-44`
youth/prime bands are unchanged. Return type stays `string | null` (not a named
union in this file).

### New band ladder
| age range | token   |
|-----------|---------|
| < 18      | `null`  (unchanged; upper bound > 100 also → null) |
| 18–24     | `'18-24'` |
| 25–34     | `'25-34'` |
| 35–44     | `'35-44'` |
| 45–49     | `'45-49'`  ← new |
| 50–54     | `'50-54'`  ← new |
| 55–59     | `'55-59'`  ← new |
| 60–64     | `'60-64'`  ← new |
| 65–69     | `'65-69'`  ← new |
| 70+       | `'70+'`    ← new |

Removed tokens: `'45-54'`, `'55+'`.

## Verification
- `parse-sweep.js app src` → `ENGINE=babel  FILES=167  FAILURES=0`; `localContext.ts`
  not present in any PARSE FAIL line.
- `grep -nE "'45-49'|'50-54'|'55-59'|'60-64'|'65-69'|'70\+'"` → all 6 new tokens
  present (lines 95–100).
- `grep -nE "'45-54'|'55\+'"` → no matches (old tokens fully removed from this producer).
- Byte/line counts of patched file match the staged tmp copy (no truncation).

## Notes / follow-up
- This is the PRODUCER side only. The CONSUMER `AGE_MULT` map in
  `strengthModelV3.ts` must add the matching `'45-49' … '70+'` keys (and widen the
  `AgeBand` union if one is exported there). If the consumer keys are not added in the
  same change, these new tokens will not resolve a multiplier. Confirm both land together.
