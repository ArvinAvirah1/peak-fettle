# Tester Feedback Request - TICKET-002 (RIR Field UX + Opt-Out)
**Date:** 2026-05-01
**From:** Dev Team (automated run)
**To:** Beta Testers -> Exec Team
**Priority:** Please review and report findings to exec-ceo, exec-cto, exec-product-manager before the next dev cycle

---

## What was just shipped

**TICKET-002 - RIR field UX with opt-out preference.**

The data model for effort tracking is unchanged (RIR is canonical, `rir == -1`
means "not recorded", legacy `rpe` values remain read-only). The UI was the
problem: 5 of 6 testers reported confusion or anxiety, and Linda explicitly
said skipping the field made her feel she was "doing the app wrong."

This iteration adds a discoverable opt-out plus consistent labeling:

- **New `Settings -> Effort tracking` card.** Two-state toggle: `RIR` (default,
  matches existing behavior) or `Off` (the field disappears from both the log
  card and the edit dialog).
- **Log card RIR column** is now wrapped in `visible: EffortPreference.showRir`
  with a `Layout.preferredHeight: 0` reflow rule, so on phone widths the
  GridLayout collapses cleanly when the field is hidden.
- **Edit Set dialog** now matches the log card: same `(optional)` label, same
  Reps-in-Reserve explanation tooltip, same opt-out behavior. Editing a
  legacy set with a stored RIR value while the field is hidden round-trips
  the existing value untouched.
- **Persistence** is via QSettings under `effortPreference/mode`. This will
  be replaced by `users.effort_pref` once the Phase B backend lands.
- **No RPE option.** Per CTO guardrail #7, RPE is deprecated. If a user wants
  RPE-style "1-10" effort tracking, that's an exec product decision, not a
  silent dev addition.

## Files modified

- `src/EffortPreference.h` *(new)* - QML singleton, mirrors UnitPreference
- `src/EffortPreference.cpp` *(new)*
- `CMakeLists.txt` - registers the new singleton
- `qml/SettingsPage.qml` - new Effort tracking card; body wrapped in Flickable
- `qml/SetTrackerPage.qml` - RIR column gated on EffortPreference.showRir
- `qml/EditSetDialog.qml` - same gating + matching `(optional)` label and tooltip
- `workflow-optimization/context-slices/dev-context.md` - TICKET-002 marked complete; previous-iteration error log appended

---

## What we need from testers

Please test on the Qt prototype and report pass/fail + notes back to the
exec team. The critical behaviors:

1. **Default behavior (RIR on).** Open the app fresh. Log a set with reps,
   weight, and a RIR value of `2`. Confirm: the field is labeled
   `RIR (optional)` with the helper text "Reps in Reserve - how many more
   reps could you have done? Skip if unsure." underneath.

2. **Skip without anxiety.** Log a set with weight + reps but leave RIR
   empty. Confirm the set logs cleanly (no validation error) and appears
   in Recent sets without an RIR annotation in the row text.

3. **Toggle to Off.** Open Settings (gear icon) -> Effort tracking ->
   tap `Off`. Return to the tracker. Confirm: the RIR column is gone,
   the Weight + Reps fields fill the row width.

4. **Edit with Off.** Tap a previously-logged set (one that has an RIR
   value). The Edit dialog should also hide the RIR field. Save with
   no other changes. Confirm: the row's `· N RIR` annotation in
   Recent sets is preserved (we round-trip the stored value).

5. **Toggle back to RIR.** The field reappears in both the log and edit
   dialogs. Confirm there is no "ghost" empty cell on phone-narrow widths.

6. **Restart.** Quit and relaunch. Your `RIR` / `Off` choice should
   persist across app restarts.

---

## Specific feedback to relay to execs

The brief (`workflow-optimization/briefs/beta-round1-roadmap-update-2026-05-01.md`)
asked for three Phase A scope additions: TICKET-002, -003, -004. TICKET-002
just shipped. Please tell exec-ceo, exec-cto, exec-product-manager:

- Whether the opt-out solves the "doing it wrong" anxiety the round 1
  testers reported (Linda, Tyler especially - 5/6 testers were affected).
- Whether you'd want a third option `RPE` exposed (we deliberately did
  not add it - RPE is deprecated per CTO guardrail #7 - flag if you
  disagree with that call).
- Whether the `Off` mode should also strip the `· N RIR` annotation from
  Recent sets, or whether retaining the annotation for legacy sets is
  the right call (current behavior: retain).

---

## Exec decisions still pending (blocking remaining Phase A tickets)

The Phase A gate cannot close until:

1. Exec sign-off on adding TICKET-003 (My Routines home-screen prominence)
   and TICKET-004 (Start Workout CTA) to Phase A scope. Brief recommends
   yes; both are unblocked behind TICKET-002 now.
2. Resolution of the carry-over Health-Suite items (habit frequency,
   meditation logging mode, Wellbeing vs. Recovery tab name) before
   Phase D UI work begins.

---

**Next in dev queue:** TICKET-003 (My Routines on home screen) is the
recommended next pickup - the brief flagged it as the highest D7 retention
fix in the unstarted backlog.
