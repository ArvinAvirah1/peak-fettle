# TICKET-081 — Stepper visual + interaction fidelity to the founder mock

**Owner:** dev-frontend
**Date opened:** 2026-06-03
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Authoritative design:** `set-logging-stepper-flow.html` (the founder's mock). The `stepperPalette`
tokens in `mobile/src/theme/tokens.ts:315-326` are already derived 1:1 from that file's `:root` CSS
variables — use them; do NOT introduce new hex values.
**Implemented by:** the "Stepper UI" agent (Agent 4), together with TICKET-080 + TICKET-082 Part B
(same files — one agent owns them to avoid collisions).
**File-ownership boundary:** `mobile/src/components/StepperLogger.tsx`,
`mobile/src/components/ExerciseSwitcherSheet.tsx`. (Shared with TICKET-080/082-UI under Agent 4.)

---

## Goal
Bring the running stepper to pixel/interaction parity with the mock. The structure already exists;
these are the **specific deltas** between current code and the mock. Fix each. Where current already
matches, verify and leave it.

## Frame-by-frame deltas

### 1a — Routine stepper (StepperLogger 'routine' variant)
Mock header: `Push A · wk 6`  •  progress dots `●●●○○`  •  `3 / 5`.
- DELTA: current header (`StepperLogger.tsx:305-317`) shows the routine name with NO `· wk N`. Add a
  `· wk N` suffix after the routine name on the routine + free variants.
  - Definition of `wk N`: ISO weeks since the routine was created (`routine.created_at`), `+1`, floored,
    min 1. For free sessions, weeks since the user's first workout. **If the source date is unknown,
    OMIT the "· wk N" suffix entirely — never render "· wk undefined" or "· wk NaN".**
  - The created-at date is not currently threaded into the session; add an optional
    `RoutineSession.weekNumber?: number` (computed by the parent in `log.tsx`) and render it only when present.
    (Adding the optional field to the type is additive.)
  - > Note: the exact business meaning of "wk N" is mildly ambiguous; the omit-if-unknown rule guarantees
    > nothing wrong is shown. Flag for founder confirmation in the Opus review.
- Kicker `EXERCISE 3 OF 5`, exname, PB pill `PB 25kg × 12 · aim 10–15 reps`, set chips
  `Set 1 · 25×12` (teal `.setchip.done`), WEIGHT/REPS fields, `Log set 3`,
  `Continue to Shoulder Press →` (primary) + `Select different exercise` (`.cta2`): VERIFY these match
  (they currently do) and keep.

### 1b — "Select different exercise" sheet (ExerciseSwitcherSheet)
Mock: section label `IN THIS ROUTINE`; rows = tick + name + right-aligned status (`3 sets` / `current`
/ `—`); current row accent-highlighted; footer `⌕ Browse full library →` rendered as a **dashed accent
border box** (`.browse { border: 1px dashed var(--acl) }`).
- DELTA: the footer in `ExerciseSwitcherSheet.tsx:120-131` is a plain text row. Make it a **dashed
  accent-bordered box** to match `.browse` (border `1px dashed stepperPalette.accentLine`, centered,
  accent text, radius `radius.md`, padding ~`spacing.s3`).
- VERIFY the rest matches the mock (it largely does): done rows show a filled tick + `N sets`; the
  current row shows `current` in accent; not-yet rows show `—`.

### 1c — Off-routine "Add to routine?" prompt (StepperLogger off-routine prompt)
Mock prompt: title `Add Pec Deck to "Push A"?`, sub `Keep it for next time — where should it go?`,
a 2-col option grid: `End of routine` | `After current` (**selected**), then `Pick position…`
(full width), then `Not now` (ghost) + `Add to routine` (primary).
- DELTA: current option order (`StepperLogger.tsx:584-602`) is `[after_current, end, pick]` → renders
  "After current, End of routine, Pick position…". Re-order to match the mock:
  **row 1: `End of routine` | `After current`; row 2 (full width): `Pick position…`.** Keep
  `after_current` as the DEFAULT selected option.
- VERIFY `Not now` (ghost) + `Add to routine` (primary accent) action row matches.

### 3a — Free session (StepperLogger 'free' variant)
Mock header: `Free session · wk 6` (right: `2 logged`); kicker `EXERCISE 2 · NO ROUTINE`.
- DELTA: current free header (`StepperLogger.tsx:298-304`) shows `Free session` + `N logged` with NO
  `· wk N`. Add the `· wk N` suffix (same omit-if-unknown rule as 1a).
- VERIFY bottom actions `＋ Add next exercise` (primary) + `Finish & save as routine` (`.cta2`) match.

### 3c — Smart-suggest "JUST LOGGED" interstitial (pro)
Mock: kicker `JUST LOGGED`; exname; summary chip `3 sets · top 100×6`; a selected suggestion card
(`.cd.sel`) with pill `Suggested next` + reason (`balances push volume`) on the right; suggestion name;
PB line **`PB 45kg × 8 · aim 6–10`** (PB **and** rep target); then `Continue to <name> →` +
`Select different exercise`.
- DELTA: current suggestion PB line (`StepperLogger.tsx:351-353`) renders `PB {pbLabel}` only — **no rep
  target**. Append the rep target so it reads `PB 45kg × 8 · aim 6–10`. The rep target comes from the new
  `SuggestCandidate.repTarget` field (added by TICKET-082 Part A / Agent 3). If `repTarget` is null, show
  just `PB {pbLabel}`; if `pbLabel` is null too, omit the line.
- VERIFY the ranked "OR TRY" alternatives list renders (TICKET-082 Part B handles its data + gating).

## Global rules
- Use `stepperPalette`, `spacing`, `radius`, `fontSize`, `fontFamily` from
  `mobile/src/theme/tokens.ts`. Zero hardcoded hex. Zero hardcoded font sizes.
- Fonts: the stepper uses the `fontFamily` (Outfit) constants — keep them.
- Touch targets ≥ 44–48 pt for all buttons/rows.
- Numeric displays (weights, reps, set counts) use `fontVariant: ['tabular-nums']`.

## Acceptance criteria
1. Side-by-side with `set-logging-stepper-flow.html`, frames 1a/1b/1c/3a/3c match in layout, copy,
   spacing, and color (allowing for native vs HTML rendering).
2. `· wk N` appears on routine + free headers when a date is available, and is cleanly absent otherwise.
3. The switcher "Browse full library" is a dashed accent box; the off-routine option grid order matches
   the mock; the smart suggestion card shows `PB … · aim …`.
4. No hardcoded hex/font-size literals added. `peak-fettle-verify` parse-sweep clean.

## Definition of done
- Parse-sweep clean; **do not commit** — the orchestrator commits after the Opus design-spec review,
  which uses this ticket's frame-by-frame list as its checklist.
