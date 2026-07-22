# TICKET-065 — Targeted Rewrite: Push / Notification Pipeline
**Owner:** Opus (correctness-critical) + dev-backend + dev-frontend
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening
**Source:** TICKET-064 findings; `dev_learnings.md` L-013; CLAUDE.md PUSH-001, PUSH-002.

---

## Goal
Rebuild the push pipeline end-to-end as one coherent, verified unit. Push delivery has broken **twice** for different root causes (PUSH-001 transport mismatch, PUSH-002 truncated dispatcher), and is "unproven until verified on-device post-EAS-build." Stop patching; rewrite the path from token acquisition → DB storage → dispatcher → on-device receipt with tests at each seam.

## Scope (entire path)
- Client: `Notifications.getExpoPushTokenAsync()` registration + the notification handler/router in `mobile/app/_layout.tsx`.
- DB: the `fcm_token` column (stores an **Expo** token despite the name — L-013) and `notification_queue`.
- Server: `peak-fettle-agents/cron/push-dispatcher.js` and any send helpers (`sendExpoChunk`, `markSent`, `markFailed`).
- All notification *types* in flight: `cohort_promotion` (TICKET-050), `plan_ready` (TICKET-058), streak reminders.

## Acceptance criteria
1. Token format and send transport provably agree: Expo token ⇒ **Expo Push API** (`https://exp.host/--/api/v2/push/send`). A test asserts the dispatcher never posts an Expo token to an FCM legacy endpoint (L-013).
2. Tokens are **only** nulled on a genuine `DeviceNotRegistered`/`NotRegistered` receipt — never on a blanket/format rejection (the PUSH-001 footgun that wiped every registration).
3. `push-dispatcher.js` passes `node --check` and the `peak-fettle-verify` sweep; the full `run()` loop, summary log, `module.exports`, and CLI block are all present (PUSH-002 was a truncated commit).
4. Each notification type has an integration test that enqueues a row and asserts a well-formed Expo payload is produced.
5. **On-device verification** is a required exit criterion: after the founder's EAS build + push, a real device receives a test push of each type. Until then the pipeline is marked UNPROVEN in the roadmap.
6. The DB column name vs. transport mismatch is documented in-code (a comment that `fcm_token` holds an Expo token).

## Implementation plan
- `superpowers` plan-first; write the tests before the rewrite. Gate the merge with `/ultra-review` **and** `/codex:adversarial-review` (this is exactly the kind of path Codex should challenge).
- Reconstruct on top of the intact helpers where they survive; otherwise rewrite cleanly.
- Commit via `peak-fettle-commit`. Flag for founder push (EAS won't see it until pushed).

## Test plan
1. Unit: token-type/transport agreement assertion.
2. Unit: error-classification — only `DeviceNotRegistered` clears a token.
3. Integration: enqueue → payload for `cohort_promotion`, `plan_ready`, streak reminder.
4. Manual on-device (post-EAS): receive each type; tapping routes to the correct screen.

## Notes
- Do not consider this done on a green parse-sweep alone — on-device receipt is the real proof (the symptom of both past failures was "silent success" server-side).
