# Resume / Handoff — 2026-06-19 (session limit reached)

Branch `fix/full-review-2026-06-19`, NOT pushed. EAS/Railway build from origin/main → nothing ships until merged+pushed+rebuilt.

## DONE + committed (16 commits)
- 10 mobile P0s (auth-clear Inv5, backup-SQLi, Pro weight_kg NaN, exercise-library local-first+kg, powersync stale closure, cosmetic gating, strength bw-guard, unmount guards) — reviewed PASS, parse-sweep 0/167, tsc 57.
- Server: weight_kg-in-plan-gen was WRONG (server has no populated weight_kg col) → REVERTED to weight_raw/8.0 (2870363); push-dispatcher token-clear-only-on-DeviceNotRegistered kept; /auth/refresh now 500-on-unexpected-error (976c86a).
- Strength model (14ad67b): McCulloch finer age bands; unknown-sex → M/F average (no crash, 111-case harness PASS); DOTS poly guards (no false 0th percentile).
- Ranking (0faa4cc): tier ladder tightened — Gold=top 15%, Platinum 93 / Diamond 97 / Elite 99.3 / World Class 99.9.
- Height: confirmed NOT collected or used anywhere (only KeyboardAvoidingView UI refs) — nothing to remove.
- Data verdict (cited, DATA-HUNT-*.md): height adds ~0-4% R² (sex confound, redundant w/ bodyweight); training-years weak + no combined dataset exists → a height+training-years model is NOT meaningfully more accurate than sex+bodyweight.

## NOT done — resume here
1. **experienceLevel redesign (BLOCKED, top priority):** the inversion bug is STILL live — experience only widens σ (spread), so a beginner can out-rank an elite, and it's self-report-gameable. Redesign = saturating expectation factor `expFactor(years)` that shifts the expected center (training-age-aware percentile). BLOCKED on:
2. **All-out training-age research (FAILED on session limit):** find the dose-response curve from ANY strength-progression measure (not just 1RM). First data-hunt gave a rough shape: saturating, ~+7-25% yr1, asymptote ~3yr, ~20-40% over a decade; model `A·(1−e^−k·t)` or `A·ln(1+t)`. Re-run, then implement #1 with the refined curve.
3. **Rigorous testing of the redesigned model (hundreds of cases):** couldn't run (limit). Existing sex+bw+age model IS already stress-tested (T1-T4 personas + 111-case sex/DOTS harness). Re-test after #1 lands.
4. **Cosmetics DB migration (founder, data-loss risk):** b3a7792 renamed accent IDs to `accent*`; existing `user_equipped_cosmetics` rows with old IDs need a one-shot UPDATE or users lose equipped accents.
5. **Deferred server P0s (founder decision + /ultra-review; SERVER-SYNTH.md):** tier self-promotion `/user/upgrade`, OAuth email-verify bypass, cosmetics server-side gating (no requirePaid), groups admin-leave TOCTOU, account-delete crash on deprecated table, csvImport broken.
6. **Mandated hard gate:** run `/ultra-review` + `/codex:review` on the auth/math/server commits before merge (I ran an adversarial Opus gate; the project tooling hasn't).
7. **Backlog:** 38 mobile P1s + server P1s (REVIEW_REPORT.md); the undisclosed-sex comparison-picker UI (only for users who didn't declare sex).
8. **Ship:** on-device smoke test → merge → `git push origin main` (Railway auto-deploys server) → `eas build`.

## Mount note
Write/Edit tools corrupt files on this mount; all edits done via bash; commits via temp-index + commit-tree + hand-written ref. git add/commit fail on mount locks.
