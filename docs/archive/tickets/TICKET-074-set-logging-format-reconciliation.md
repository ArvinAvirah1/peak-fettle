# TICKET-074 — Set-Logging Stepper Format (BUILD-READY — founder spec confirmed 2026-06-01)
**Owner:** dev-frontend + Opus (review)
**Date opened:** 2026-06-01
**Phase:** R — Revision & Hardening
**Source:** Founder directive 2026-06-01 (answers + 5 annotated mockup screenshots); set-logging mockups; TICKET-059/060/062.

---

## Goal
Make the live set-logging UI match the founder's confirmed stepper design. **Vision is now
confirmed** (see "Founder decisions" below) — this is ready to build. Free-tier behavior ships
first; the pro-tier pieces are TICKET-077.

## Founder decisions (confirmed 2026-06-01 — do not re-litigate)
1. **Stepper is the format**, three variants (all already scaffolded in
   `mobile/src/components/StepperLogger.tsx` as `variant: 'routine' | 'free' | 'smart'`):
   - **`routine`** (default) — screenshot 1-left: header `Push A · wk 6` + progress dots +
     `N / M`, `EXERCISE n OF m`, exercise name, PB card (`PB 25kg × 12 · aim 10–15 reps`),
     logged-set chips (`Set 1 · 25×12`), WEIGHT + REPS inputs, `Log set N`,
     `Continue to <next> →`, `Select different exercise`.
   - **`free`** (no routine) — screenshot 4: `Free session · wk 6` · `N logged`,
     `EXERCISE n · NO ROUTINE`, `Log set N`, `＋ Add next exercise`, `Finish & save as routine`.
   - **`smart`** — **PRO tier**, see TICKET-077. Screenshot 5: `JUST LOGGED` + a
     `Suggested next` card with a reason (`balances push volume`) + `Continue to <suggestion> →`.
2. **Exercise switcher** (screenshot 1-right, `ExerciseSwitcherSheet`, TICKET-060): bottom sheet
   `IN THIS ROUTINE` with a checklist — each exercise shows its set count, a check when done,
   `current` on the active one, `—` for not-started, and `↪ Browse full library →` at the bottom.
3. **Off-routine placement** (screenshot 2): when an exercise NOT in the routine is logged
   (`NOT IN ROUTINE` / `free pick`), show `Add <name> to "<routine>"? Keep it for next time —
   where should it go?` with **three** placement options + actions:
   `End of routine` · `After current` (default) · **`Pick position…`** · then `Not now` /
   `Add to routine`. → **GAP: current component offers only `after_current` + `end`; add the
   `Pick position…` flow** (a position picker over the routine's exercise list).
4. **RIR**: **optional, shown by default** (not behind a disclosure, not required). → **GAP:
   the stepper has no RIR input and `log.tsx` drops `rir` entirely.** Add an optional RIR field
   to the input area and thread it through. Server already accepts `rir` (`routes/sets.js`,
   `-1` = not recorded). The mockups show only WEIGHT/REPS, so place RIR as a compact optional
   third field / sub-control — confirm placement against the mockup styling during build.
5. **Cardio**: **deferred** — founder is not sure of the format yet. Do **not** design cardio
   logging in this ticket; keep the existing cardio path working but unchanged.
6. **Routines screen** (screenshot 3): `Routines` + `＋ New`; `YOURS` list (each: name, exercise
   count, `▶ Start` / `✎ Edit`); `STARTER SPLITS · tap to duplicate`: `PPL · Push`, `PPL · Pull`,
   `Upper A`, `Lower A` (seed templates → `workout_templates`).

## Concrete gaps to close (free tier)
- [ ] Add optional **RIR** input to `StepperLogger`; change `onLogSet(exerciseId, weight, reps)`
      → include `rir`; update `log.tsx` handler (~L617–644) to pass `rir` to `logSet`.
- [ ] **Converge the two `logSet` paths** in `log.tsx` (~L630 stepper handler and ~L744
      payload path) onto one canonical payload shape so no field is silently dropped.
- [ ] Off-routine prompt: add the **`Pick position…`** option (3-way placement).
- [ ] Routines screen: starter-split duplicate flow wired to `workout_templates` seed.
- [ ] Match the confirmed **layout / theme / typography** to the **5 screenshots** (dark theme +
      teal accent). **CONFIRMED FINAL 2026-06-01** — the screenshots ARE the design; the older
      `set-logging-*.html` variant files are superseded. Verify visually with the app running
      (`/run`) — do not ship blind.

## Acceptance criteria
1. Logging a lift set from the stepper persists weight, reps, and (if entered) rir; the value
   round-trips into history + PB. RIR field is visible and optional.
2. Single canonical `logSet` payload across all entry points; no field dropped UI→API.
3. Off-routine exercise → 3-way placement (incl. `Pick position…`) writes the routine correctly.
4. `routine` and `free` variants match the mockups (spot-checked via `/run` + screenshots).
5. `peak-fettle-verify` parse-sweep clean.

## Test plan
1. Build the schema first (TICKET-073) so set logging actually persists.
2. Log lift set w/ RIR → GET /sets returns same rir → history label (`RIR n` / `to failure`).
3. Off-routine `Pick position…` → routine order updates as chosen.
4. Visual diff vs screenshots for `routine` + `free`.

## Notes
- `is_pr` (server `RETURNING` of a nonexistent column that 500'd every set log) was a separate
  **functional** bug — already fixed 2026-06-01 in `routes/sets.js`. This ticket is the UI format.
- Pro-tier pieces (`smart` variant gating + machine-busy "choose alternative exercise") → TICKET-077.
