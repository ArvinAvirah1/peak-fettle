# SRV-FIX-PERCENTILE — fix SRV-PLANS-02 (P0)

**File:** `peak-fettle-agents/server/routes/percentile.js`
**Branch:** `fix/full-review-2026-06-19`
**Finding:** SRV-PLANS-02 (P0) — Epley sub-SELECTs computed estimated 1RM from `weight_raw / 8.0` only. For Pro / v3 sets that populate the exact `weight_kg` column (and may leave the legacy `weight_raw` kg×8 column NULL/0), `epley_estimate_kg` came back NULL/0, breaking the confirm-1RM pre-fill UI.

## Change (weight reads ONLY — nothing else touched)

Both Epley sub-SELECTs — the `GET /percentile` handler (block ~117–136) and the shared `percentileByLift` path (block ~207–225) — were patched. Each block had the same three weight reads, so 6 edits total (2 per pattern × 2 blocks):

| Before | After |
|---|---|
| `WHEN s.reps = 1 THEN s.weight_raw / 8.0` | `WHEN s.reps = 1 THEN COALESCE(s.weight_kg, s.weight_raw / 8.0)` |
| `ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)` | `ELSE COALESCE(s.weight_kg, s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)` |
| `AND s.weight_raw > 0` | `AND COALESCE(s.weight_kg, s.weight_raw / 8.0) > 0` |

This matches the canonical project rule (CLUME.md Invariant 2): read weight via `COALESCE(weight_kg, weight_raw/8.0)`; prefer exact kg, fall back to the legacy kg×8 column. The `> 0` guard was widened the same way so sets that have only `weight_kg` are no longer filtered out.

No JOINs, aliases, GROUP BY, response shape, comments-as-code, or other logic changed.

## Verification (bash)

- `wc -l peak-fettle-agents/server/routes/percentile.js` → **334** (unchanged; no truncation).
- `wc -c` → 16410 bytes (was 16264; +146 from the 6 COALESCE insertions — consistent).
- `node --check peak-fettle-agents/server/routes/percentile.js` → **exit 0**.
- `grep -n "COALESCE(s.weight_kg" …` → 6 lines: 120, 121, 134, 209, 210, 223.
- No bare `s.weight_raw / 8.0` or `s.weight_raw > 0` reads remain outside a COALESCE.

## Method

Bash-only (Write/Edit tools corrupt files on this mount). Backed up to `/tmp/percentile.js.bak`; patched with a Python literal-replace script that asserted an exact count of 2 per pattern before writing to `/tmp/percentile.js.new`; installed with `cat > target` (overwrite-in-place — `mv`/`sed -i`/`perl -i` not used).

## Notes / out of scope

- SRV-PLANS-04 (P1, `/confirm-1rm` 42P01 guard) and SRV-PLANS-08 (P2, deprecation signal) are in the same G6 file group but were **not** addressed here — this fix is scoped to the weight read only, per instruction.
- The `weight_raw` legacy path remains for the deprecated percentile vectors; only the Epley *display estimate* reads were changed.
