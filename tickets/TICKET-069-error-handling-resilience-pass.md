# TICKET-069 — Error-Handling & Resilience Pass (whole app)
**Owner:** Sonnet + dev-frontend + dev-backend
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening
**Source:** TICKET-064 findings; `dev_learnings.md` L-004, L-008, L-011, L-012, L-018, L-019.

---

## Goal
Make failures visible and survivable across the app. Past incidents: a global `isLoading` unmounted the login screen on error (L-004), `return next('route')` silently disabled a handler (L-008), unguarded string methods crashed on null (L-011), API 400 messages were swallowed (L-012), silent catch blocks turned server errors into phantom UI resets (L-018), and a tab crash with no error boundary showed a blank screen (L-019).

## Acceptance criteria
1. Every tab/route is wrapped in an **error boundary** that renders a real fallback with a retry — no blank screens (L-019).
2. **No silent catches**: every `catch` either handles meaningfully or surfaces the error; a lint rule flags empty/log-only catches in app code (L-018).
3. API error bodies (esp. 400s) are surfaced to the user, not swallowed (L-012).
4. Loading state is **scoped per screen/request**, never a global that can unmount an active screen (L-004).
5. Utility functions that call string/array methods guard against null/undefined (L-011).
6. No `return next('route')` (or equivalent) silently disabling a handler (L-008); audited and removed/justified.

## Implementation plan
- Sweep with `WarpGrep`/`morph`; `superpowers` to plan the error-boundary rollout so it's consistent (one shared boundary component).
- Pair each fix with a reproduction test where feasible.
- `/review` per change; `peak-fettle-verify` after.

## Test plan
1. Force a throw in each tab → fallback + retry renders (no blank screen).
2. Trigger a 400 from the API → message visible to user.
3. Error during login → login screen stays mounted and shows the error (L-004 regression test).
4. Lint: no empty catches, no unguarded string calls in flagged utils.

## Notes
- Resilience work must not hide real errors behind friendly fallbacks — log them and keep them diagnosable.
