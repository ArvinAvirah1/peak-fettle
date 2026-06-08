# TICKET-067 — Eradicate All Mock / Stub Fallbacks Repo-Wide
**Owner:** Sonnet (sweep) + dev-backend + dev-frontend
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening
**Source:** TICKET-064 findings; `dev_learnings.md` L-003, L-010, L-016, L-021, L-022, L-024.

---

## Goal
Mock/stub fallbacks have repeatedly caused silent, hard-to-trace failures: mock auth bypassed the auth model (L-003), mock exercise IDs failed UUID validation and blocked set logging (L-016), mock names collided with real DB rows under different UUIDs (L-021), and a `searchExercises` mock fallback silently disabled free-text entry (L-022). Find and remove **every** such fallback across the codebase; replace with real calls + honest error states.

## Acceptance criteria
1. A repo-wide inventory of all mock/stub/`__mock`/hardcoded-fallback code paths (client and server), with a disposition for each: remove / gate behind a test-only flag / keep with justification.
2. **Zero** mock data paths reachable in a production build. A build-time/lint check fails if a known mock module is imported by app code.
3. Auth has no mock bypass; all protected routes hit the real JWT path (L-003).
4. Exercise lookup uses only real DB rows with valid UUIDs; free-text entry works end-to-end (L-016, L-021, L-022).
5. Any place a mock was masking a missing feature becomes either a real implementation or an explicit, surfaced "not available" state — never a silent fake.

## Implementation plan
- `WarpGrep`/`morph` to find fallback patterns fast; `superpowers` to plan removals so we don't pull a mock that's load-bearing without a real replacement.
- For each removal, confirm the real path returns the shape the client expects (L-010, L-025 — array vs object mismatches).
- Gate the merge with `/review`; run `peak-fettle-verify` after.

## Test plan
1. Production build contains no mock module imports (automated check).
2. Login, set-logging with a real exercise, and free-text exercise entry all succeed against the real backend.
3. Each removed mock has a corresponding passing real-path test.

## Notes
- Where removing a mock reveals an unbuilt feature, **do not re-stub it** — open a ticket or an OPEN_QUESTIONS entry (TICKET-071). Honest breakage beats silent fakery.
