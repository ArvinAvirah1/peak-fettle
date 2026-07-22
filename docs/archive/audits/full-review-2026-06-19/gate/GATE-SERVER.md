# GATE-SERVER — adversarial hard-gate of commit b335094
# Reviewer: Opus | Branch: fix/full-review-2026-06-19 | HEAD: 2870363

## VERDICT: PASS-WITH-NITS

The push-dispatcher token fix is correct and ships in HEAD. The weight (COALESCE)
half of b335094 was BROKEN (referenced a non-existent `sets.weight_kg` column ->
42703 -> 500) and has ALREADY been correctly reverted by HEAD commit 2870363.
Net shipping state (HEAD) is safe and internally consistent. No action required;
do NOT re-apply the COALESCE change to the server.

## Commit topology
- b335094  fix(server): use weight_kg in plan-gen + percentile; clear push token only on DeviceNotRegistered
- e383948  docs(review)
- 2870363  (HEAD) fix(server): REVERT sets.weight_kg refs to weight_raw/8.0 — column dropped, 500'd Rankings + plan-gen

## P0 (resolved-in-HEAD, do not reintroduce)
- b335094 plans.js:316,320,322-323,343,350,352 + percentile.js:120-121,134,209-210,223:
  COALESCE(s.weight_kg, s.weight_raw/8.0) reads a `sets.weight_kg` column that does NOT
  exist in prod (schema drift, CLAUDE.md #4). Throws 42703 -> 500 on every GET /percentile
  and POST /plans/generate. The mobile-local SQLite v3 `weight_kg` column was wrongly applied
  to the SERVER `sets` table (server sets has weight_raw only; all other routes read
  weight_raw/8.0). CORRECTLY REVERTED by 2870363; HEAD blobs grep-clean of sets.weight_kg
  and pass node --check. No live defect remains on this branch.

## PASS (push-dispatcher.js — shipped in HEAD, NOT reverted)
- isDeviceGone = {DeviceNotRegistered, NotRegistered} is the ONLY token-clear gate
  (markFailed L188-199). InvalidRegistration / HTTP / 5xx / network / rate-limit ->
  failed_permanently only, token LEFT INTACT (L82-87, L200-209). PUSH-001 regression
  closed. Dead device still cleaned (DeviceNotRegistered -> fcm_token=NULL). MAX_RETRIES=5,
  EXPO_CHUNK_SIZE=100, BATCH_SIZE=500, module.exports + CLI block all intact. node --check: OK.

## NITS (P2)
- push-dispatcher: a transient HTTP/5xx chunk failure still increments retry_count and
  flips failed_permanently after 5 attempts for a possibly-healthy device. Per-notification
  only (token preserved, later notifications retried) -> acceptable, not a regression.
- WORKING-TREE ARTIFACT (not a commit defect): on-disk plans.js (494 ln) & percentile.js
  (327 ln) are MOUNT-TRUNCATED -> node --check fails at plans.js:495 / percentile.js:328.
  The committed HEAD blobs are complete and pass node --check (PLANS_HEAD_OK / PERCENTILE_HEAD_OK).
  EAS/Railway deploy from git, so this does not affect prod — but a fresh checkout is advised
  before any further edit on this mount.

## node --check
- HEAD blobs: plans.js OK, percentile.js OK, push-dispatcher.js OK.
- On-disk: push-dispatcher OK; plans.js + percentile.js fail (mount truncation only).
