# Tester Feedback Request — TICKET-001 (kg/lbs Toggle)
**Date:** 2026-05-01
**From:** Dev Team (automated run)
**To:** Beta Testers → Exec Team
**Priority:** Please review before next dev cycle

---

## What was just shipped

**TICKET-001 — Weight unit display toggle** has been implemented. Here's what changed:

- A **⚙ gear icon** has been added to the Set Tracker header. Tapping it opens a new **Settings page** with a kg / lbs toggle.
- All weight values in the app (set list, input field label, progress graph PR and Est. 1RM tiles, graph axis titles) now **instantly switch units** when you toggle.
- **Input behavior:** when you're in lbs mode and type "155" in the weight field, the app converts to kg (70.3 kg) before saving. If you toggle back to kg, you'll see 70.3 — not a re-rounded value.
- **Persistence:** your unit preference is saved and survives app restarts.

---

## What we need from testers

Please test the following and report back to the exec team with a pass/fail + any notes:

1. **Toggle to lbs.** Log a set: 155 × 5. Does the chart show 155 on the axis? Does the axis label say "lb"?
2. **Toggle back to kg.** Does the same set now read approximately 70.3 kg?
3. **Restart the app.** Is your unit preference still saved?
4. **Edit same set:** change reps to 6 while in lbs mode. Toggle to kg. Is the weight unchanged at 70.3?
5. **PR badge and Est. 1RM tile** in the progress graph — do they show the correct unit?
6. **Named-routine summary** — does it reflect the active unit?

---

## Exec decisions still pending (blocking future Phase A tickets)

Before the Phase A gate can close, execs need to confirm the Phase A scope addition (TICKET-002, -003, -004) requested in `workflow-optimization/briefs/beta-round1-roadmap-update-2026-05-01.md`. Please review and approve or defer these three tickets.

---

**Next in queue (dev team):** TICKET-002 (RIR label UX), TICKET-003 (My Routines), TICKET-004 (Start Workout CTA).
