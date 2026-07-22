# Fixes Applied + Checkpoint — 2026-06-19

**Branch:** `fix/full-review-2026-06-19` (10 commits incl. docs). NOT pushed — founder must `git push` (no SSH in sandbox); EAS/Railway build from `origin/main`, so nothing ships until merged + pushed + EAS rebuild.

## Mobile P0s — ALL 10 FIXED, reviewed (2 Opus reviewers: PASS), committed
| Commit | Fix | Findings / Invariant |
|---|---|---|
| ea25e49 | Auth: clear session only on definitive 401, not transient failures | API-01/SCORE-01 · Inv 5 |
| 53ef2aa | Backup: column allowlist blocks backup-JSON SQL injection | DATA-01 |
| 4b85061 | Analytics: resolve weight_kg for Pro REST sets (no more NaN) | A4-02/A4-04 · Inv 2 |
| 5e8c284 | Exercise-library: local-first set history + kg goal conversion | A4-01/A4-03 · Inv 1&2 |
| a6e5a91 | Hooks: tier/userId in initWorkout deps (stale closure) | HOOKS-01 · Inv 1 |
| b3a7792 | Cosmetics: namespace ids + enforce unlock gating | cosmetic-gating |
| 10d6f3b | Strength: guard bw<=0 NaN + align age-band tokens | LIB-01/LIB-02 |
| 1d60f41 | Lifecycle: guard setState-after-unmount | S3-01/S3-02 |

Verification: parse-sweep **0/167** failures; `tsc --noEmit` **57** (down from 59 baseline — duplicate-key errors removed, zero new).

## Server — audited (11 P0 / 13 P1), 3 safe P0s applied + committed (b335094)
- SRV-PLANS-01 `routes/plans.js` — weight_kg COALESCE in plan-gen (was 0kg for v3 sets).
- SRV-PLANS-02 `routes/percentile.js` — weight_kg COALESCE in Epley estimate.
- SRV-ENGINE-02 `cron/push-dispatcher.js` — clear push token ONLY on DeviceNotRegistered (kills PUSH-001 silent-erasure).
`node --check`: 0 failures across the whole server.

## Server — DEFERRED (need a founder decision and/or the mandated /ultra-review + 2nd-model gate)
Full per-file plan (groups G1–G14): `synthesis/SERVER-SYNTH.md`.
- **SRV-USER-01** `/user/upgrade` tier self-promotion — PRODUCT/BILLING vision: how should upgrade actually work (payment webhook / receipt verify)? Do not guess.
- **SRV-AUTH-02** OAuth ignores `emailVerified` → account takeover by email match — security-arch; gate.
- **SRV-AUTH-01** `/refresh` swallows DB errors → 401 → forced re-login — auth; gate.
- **SRV-SOCIAL-01** `routes/cosmetics.js` no `requirePaid` (server side of the mobile cosmetic bypass) — needs *entitlement-aware* gating, not blanket requirePaid (free users earn some cosmetics via streak).
- **SRV-SOCIAL-02** groups admin-leave TOCTOU race — needs a transaction redesign.
- **SRV-USER-02** account-delete crashes on deprecated `user_percentile_rankings` (GDPR delete broken) — schema/migration; gate.
- **SRV-DATA-01/02** `csvImport` broken (missing NOT NULL day_key; dedup on wrong column) — needs care.
- Plus the P1s in SERVER-SYNTH.md (UUID-validation guards, error-handler leakage, etc.).

## ⚠️ Mount corruption RECURRED this session
The Write/Edit file tools silently truncated **7 of 13** mobile files (despite the repo being out of OneDrive). Every write was redone via bash and re-verified by the parse-sweep before commit. **Rule for future runs on this mount:** agents must write via bash (patch-to-/tmp then `cat > target`; never `perl -i`/`sed -i` — they empty files here) and verify with the parse-sweep; commit via the temp-index + `commit-tree` + hand-written-ref plumbing (`git add`/`git commit` fail on this mount's locks). Harmless untracked temp files remain in `mobile/` (`.pc2.js`, etc.) — `rm` is blocked on this mount; they are untracked and were never committed.

## How to continue (clean handoff)
1. `git log fix/full-review-2026-06-19` — 9 fix commits + 1 docs commit on top of `95e6116`.
2. Founder: push the branch; run `/ultra-review` + `/codex:review` on the auth, math, and server commits before merging (CLAUDE.md hard gate).
3. Decide the upgrade/billing flow, then apply the deferred server P0s per `SERVER-SYNTH.md`.
4. Merge to `main` → push → `eas build` (nothing reaches the device otherwise).
