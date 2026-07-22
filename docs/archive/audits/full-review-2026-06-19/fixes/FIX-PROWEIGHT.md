# FIX-PROWEIGHT — Pro REST analytics weight resolution

**Branch:** `fix/full-review-2026-06-19`
**Findings:** A4-02 (P0), A4-04 (P1) — CLAUDE.md Invariant 2 (weight is exact kg, not kg×8)
**Rationale:** audits/full-review-2026-06-19/synthesis/SYNTH-1.md

## Root cause
The server's `normalizeSet` (server/routes/sets.js) returns `weight_kg` and **strips** `weight_raw`,
so on the Pro REST path every set arrives with `weight_raw === undefined`. Both screens declared a
local `interface ApiSet { weight_raw: number }` and computed volume / e1RM from `s.weight_raw / 8`,
which is `undefined / 8 = NaN` → all Pro strength analytics (weekly volume, top PRs, per-set e1RM,
per-exercise volume, best-set highlight) rendered as NaN/0. Free/local-first paths were already
correct (they resolve kg via their own helpers), so this was Pro-only.

## Fix (additive resilience — kg-first resolution, identical behavior when a value was already present)
A single resolver per file: `const kg = s.weight_kg ?? (s.weight_raw != null ? s.weight_raw / 8 : 0);`

### mobile/app/progress.tsx
- `interface ApiSet`: `weight_raw: number` → `weight_kg: number; weight_raw?: number`.
- Added `setKg(s)` resolver; changed `epley(weightRaw,…)` to `epley(kg,…)` (takes exact kg).
- Weekly-volume loop in `fetchProgressData`: `(s.weight_raw / 8) * s.reps` → `setKg(s) * s.reps`.
- Top-PR loop: `epley(s.weight_raw, s.reps)` → `epley(setKg(s), s.reps)`.
- `fetchLocalProgressData` (free path) left untouched — already resolves kg via its own `kgOf`.

### mobile/app/workout-day.tsx
- `interface ApiSet` already had `weight_raw?` + `weight_kg?` (both optional) — left as-is; the
  resolver's `??` handles the optional/undefined cases, and the local mapping legitimately yields
  `weight_kg: undefined`, so a required `weight_kg` would be a type lie.
- Added `setKg(s)` resolver; rewrote `computeE1rm(weightRaw,…)` → `computeE1rm(kg,…)` (exact kg).
- Removed now-redundant `rawToKg`; `setVolumeKg` now resolves kg first
  (`if (!kg) return 0; return kg * s.reps`) instead of gating on `weight_raw`.
- `SetRow`: weight/e1RM display now from `setKg(set)`.
- `bestSetIds` PR-highlight gate: resolves `const kg = setKg(s)` and gates/computes on `kg`.
- `buildHistoryExercises` edit-prefill and the local SQLite→ApiSet mapping were already kg-correct —
  left untouched.

## Verification
- @babel/parser sweep (`jsx`+`typescript`) over both files: **OK / OK** (sweep exit 0).
- Confirmed no stale `weight_raw / 8` server-path math and no `rawToKg` references remain.
- git diffstat: progress.tsx +10/-5, workout-day.tsx +12/-6 — surgical, no other files.

## Concern (process, not code)
The harness **Edit tool's writes did not flush to the Linux git mount** — after the in-tool edits,
`git`/bash saw both files **truncated mid-token** at their trailing `StyleSheet.create` block
(progress.tsx ended at `alignItem`), while the host-side Read tool showed them complete. The
@babel sweep run via bash is what caught it (HEAD blob parsed; working tree did not). I recovered by
rebuilding each file from the clean HEAD blob and re-applying the edits via bash (`perl` exact-match),
then re-parsing the **in-repo** file — both now 936 / 973 lines, full StyleSheet, PARSE-OK on the mount.
**Implication for the gate:** trust the bash/@babel sweep over the in-repo bytes, not Edit-tool success
or the host Read view — they diverged here exactly as the CLAUDE.md mount-truncation memory warns.

Leftover untracked temp helpers from verification (`mobile/.pc2.js`, `mobile/.pcheck.js`,
`mobile/.sweep_tmp.js`) could not be `rm`'d (known mount restriction) so were emptied in place;
they are untracked `??` and must NOT be committed.
