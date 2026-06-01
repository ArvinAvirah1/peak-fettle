# TICKET-074 — Set-Logging Format Reconciliation (founder's "recent format" intent)
**Owner:** dev-frontend + Opus (review); **founder sign-off required on the chosen variant**
**Date opened:** 2026-06-01
**Phase:** R — Revision & Hardening
**Source:** Founder directive 2026-06-01 ("the set addition has not implemented the recent changes in format that i had wanted"); set-logging mockups; TICKET-059/060/062; TICKET-071 (don't guess vision).

---

## Goal
Make the live set-logging UI match the **format the founder designed in the mockups**. The
founder has explicitly said the current set-addition does not reflect the format they want.
The mockups are the authoritative spec — but they contain **multiple variants**, so the
founder must confirm which one is "the one" before build (TICKET-071).

## Authoritative spec (the founder's expressed intent — do NOT invent beyond these)
- `set-logging-stepper-flow.html` — the one-exercise-at-a-time Focus Stepper flow.
- `set-logging-layout-options.html` — layout variants.
- `set-logging-theme-mockups.html` — theme/color variants.
- `set-logging-font-options.html` — typography variants.

## Concrete gaps found 2026-06-01 (the build deviates from the design)
1. **RIR is dropped on the stepper path.** `StepperLogger.onLogSet(exerciseId, weight, reps)`
   captures only weight + reps; `app/(tabs)/log.tsx` (~L617–644) calls `logSet({ … reps })`
   with **no `rir`**, even though the server accepts `rir` and the history row renders an
   "RIR n / to failure" label (`log.tsx` ~L161). The stepper has no RIR input at all.
2. **Two divergent logging paths.** `log.tsx` has one `logSet` call at ~L630 (stepper handler)
   and another at ~L744 (`payload`-based). They must converge on one payload shape so every
   entry point stores the same fields.
3. **Variant not pinned.** `StepperLogger` supports `variant: 'routine' | 'free' | 'smart'`,
   and the mockups offer layout/theme/font variants — none is confirmed as the shipping choice.
4. The set-logging surface is entangled with the **in-progress mobile refactor** (many
   uncommitted `MM`/`D` files as of 2026-06-01) — reconcile against a stabilized tree
   (TICKET-075) so this isn't built on shifting sand.

## Blocking questions for the founder (add to OPEN_QUESTIONS_FOR_FOUNDER.md)
- Which **layout / theme / font** variant from the mockups is final?
- Which stepper **variant** (`routine` / `free` / `smart`) is the default logging experience?
- Is **RIR** a required field, optional, or hidden by default with a disclosure? Same question
  for any per-set notes / tempo the mockups imply.
- Cardio sets: confirm the duration/distance/pace input format matches the mockups.

## Acceptance criteria
1. Founder has confirmed the variant set (recorded in OPEN_QUESTIONS_FOR_FOUNDER.md / a SPEC).
2. Live set-logging UI matches the confirmed mockup pixel-intent (spot-checked via
   `/gsd:ui-review` or `frontend-design` against the HTML mockups).
3. A single canonical `logSet` payload shape across all entry points; RIR handled per the
   founder's answer; no field silently dropped between UI and API.
4. End-to-end: logging a set from the stepper persists weight, reps, and rir (if enabled), and
   the value round-trips into history + PB correctly.

## Test plan
1. UI diff vs mockups (the confirmed variant).
2. Log lift set with RIR → GET /sets returns the same rir → history label correct.
3. Log cardio set → duration/distance/pace persist and render.
4. `peak-fettle-verify` parse-sweep clean.

## Notes
- `is_pr` was a separate bug (server `RETURNING` of a nonexistent column, 500'd all set logs)
  — **already fixed** 2026-06-01 in `routes/sets.js`. That was a functional break, not a
  format issue; this ticket is purely about the UI/UX format.
- Do not pick a variant to "unblock" — that is the exact anti-pattern TICKET-071 forbids.
