# SRV-FIX-PLANS — SRV-PLANS-01 (P0)

**File:** `peak-fettle-agents/server/routes/plans.js`
**Branch:** `fix/full-review-2026-06-19`
**Finding:** SRV-PLANS-01 (P0) — training-engine input query read set weight as `s.weight_raw / 8.0` only. For schema-v3 sets, `weight_kg` is the canonical NOT NULL column and `weight_raw` is 0/NULL, so plan generation saw 0 kg → corrupted plans.

## Change
Wrapped every weight read in the history (step 4) and personal-bests (step 4b) subqueries with `COALESCE(s.weight_kg, s.weight_raw / 8.0)`, so v3 (`weight_kg`) sets read correctly while legacy (`weight_raw` = kg×8) sets still fall back.

7 occurrences changed (lines 316, 320, 322, 323, 343, 350, 352):
- 5× value reads: `s.weight_raw / 8.0` → `COALESCE(s.weight_kg, s.weight_raw / 8.0)`
- 2× guards: `s.weight_raw > 0` → `COALESCE(s.weight_kg, s.weight_raw / 8.0) > 0`

## Scope
Weight reads ONLY. SRV-PLANS-03 (regenerate gate), SRV-PLANS-05 (throttle scope), SRV-PLANS-09 (inline tier check) left untouched — out of scope. No other lines in the file changed.

## Verification
- `wc -l`: 507 before, 507 after (not truncated)
- `node --check peak-fettle-agents/server/routes/plans.js`: exit 0
- `diff` vs backup: exactly the 7 weight reads, nothing else
