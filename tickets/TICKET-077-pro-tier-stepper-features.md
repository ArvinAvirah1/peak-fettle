# TICKET-077 — Pro-Tier Stepper Features: Smart-Suggest + Machine-Busy Alternative Swap
**Owner:** dev-frontend + dev-backend (verify gating) + Opus (review)
**Date opened:** 2026-06-01
**Phase:** R — Revision & Hardening
**Source:** Founder directive 2026-06-01 ("smart suggest is on the pro tier"; "a pro feature to click choose alternative exercise when the current exercise has too many people at it at the gym").

---

## Goal
Wire the two **pro-tier** set-logging features to their (already-built) backends, behind the
paywall. Free-tier logging is TICKET-074; this ticket adds the paid upgrades on top of it.

## Feature A — Smart-Suggest (`variant: 'smart'`)
Screenshot 5: after logging, show a `Suggested next` card (exercise + PB + rep target + a reason
like `balances push volume`) and `Continue to <suggestion> →`.

- Client util already exists: `mobile/src/utils/smartSuggest.ts` (`suggestNextExercise`).
- `StepperLogger` already renders the `smart` variant suggestion card.
- **Work:** gate `variant='smart'` behind pro entitlement (use the same paywall signal the
  workout-session-limit paywall uses — `log.tsx` already handles `paywall_trigger` from
  `POST /workouts`). Free users get `routine`/`free`; pro users get `smart`. No suggestion
  logic for free users.

## Feature B — Machine-Busy "Choose Alternative Exercise"
When the machine/equipment for the current exercise is occupied at the gym, a pro user taps
**"Choose alternative exercise"** and gets ranked swaps on different equipment.

- Backend **already exists + pro-gated**: `GET /exercises/:id/alternatives` (exercises.js:205,
  `requireAuth, requirePaid`). Supports `?avoid=<equipment>` to down-rank the busy equipment and
  reward alternatives on other equipment. Returns `{ source, tagged, alternatives: [{ id, name,
  equipment, … }] }`.
- **Work:** add the UI entry point in the stepper. This is **distinct** from `Select different
  exercise` (which opens the full switcher / library). "Choose alternative" calls `/alternatives`
  for the *current* exercise (optionally with `?avoid=machine`) and presents the ranked swaps;
  picking one substitutes the current exercise in-session (and respects the off-routine
  placement flow from TICKET-074 if it's not already in the routine).

## Acceptance criteria
1. `smart` variant is shown **only** to entitled (pro) users; free users never see suggestions.
   Verified by toggling entitlement.
2. A free user attempting the pro path hits the existing paywall sheet, not a 403 dead-end.
3. Pro user: "Choose alternative exercise" → calls `GET /exercises/:id/alternatives`, shows
   ranked options, selecting one swaps the current exercise and logging continues seamlessly.
4. `requirePaid` returns the right status and the client shows the paywall (not a silent fail)
   for an unentitled call (cross-check TICKET-069 error handling, TICKET-067 no-silent-mock).
5. `peak-fettle-verify` parse-sweep clean.

## Test plan
1. Entitlement OFF → no `smart` card; "Choose alternative" gated to paywall.
2. Entitlement ON → suggestion card appears; `/alternatives?avoid=machine` returns swaps on
   other equipment; selecting one continues the session.
3. Server: `GET /exercises/:id/alternatives` without paid entitlement → paywall status, not 500.

## Notes
- Depends on TICKET-074 (the free-tier stepper) landing first, and TICKET-073 (working DB).
- Entitlement source of truth: confirm whether `requirePaid` reads `users.comp_pro` / a
  subscription flag, and that the client entitlement check matches the server's (avoid the
  client showing a feature the server then 403s — TICKET-068 list/detail-shape lesson).
