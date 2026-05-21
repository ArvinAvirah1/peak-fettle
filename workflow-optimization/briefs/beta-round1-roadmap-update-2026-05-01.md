# Beta Round 1 → Roadmap Update
**Date:** 2026-05-01
**From:** Workflow Coordinator
**To:** exec-ceo, exec-cto, exec-product-manager → dev-lead
**Source:** `testing-team/beta-feedback-round1.md`, `testing-team/dev-tickets-round1.md`, `DEV_ROADMAP_2026-04-30.md`
**Action required:** Exec sign-off on Phase A scope additions before dev-lead picks up next sprint

---

## Executive Summary

Beta Round 1 produced 11 tickets across 6 personas. **Three P1 tickets (TICKET-002, -003, -004) are not in the current Phase A sprint** — all three are churn risks for new users and should be closed before any new user arrives. Five tickets already in Phase A are correctly prioritized. Three P2 tickets are routed to Phase D.

One P0 item (TICKET-001, kg/lbs toggle) is already in Phase A. The RIR data model is already canonical per the CTO guardrails; the remaining gap is UI labeling only (TICKET-002).

---

## Coverage Gap: Phase A Is Missing Three P1 Tickets

The relay doc (`dev-roadmap-relay-2026-04-30.md`) assigned Phase A tickets as: TICKET-001, -005, -007, -008, -010. The beta team's Sprint 1 recommendation was TICKET-001, **-002, -003, -004**. The three below must be added to Phase A before the Qt sprint closes.

---

### GAP 1 — TICKET-002: Effort Field UX (RIR Labels + Explanations)
**Priority:** P1 | **Raised by:** 6/6 testers
**Roadmap status:** Data model ✅ done (RIR canonical, RPE read-only). UI ❌ not assigned.

The backend correctly stores RIR. The problem is the field still displays poorly in the UI — no explanation, no "optional" label, causing anxiety and skip behavior across all user segments including experienced lifters. This is a pure frontend task, low effort, highest reach.

**Request to Phase A:** Add TICKET-002 UI work to dev-frontend's Phase A scope. The data contract is already settled.

---

### GAP 2 — TICKET-003: Save as Routine / My Routines
**Priority:** P1 | **Raised by:** 4/6 testers | **D7 retention impact: high**
**Roadmap status:** ❌ Not in Phase A. Mentioned in state-of-program as "named-routine save flow on the tracker page" but 4 testers could not find or use it — the existing implementation is not discoverable enough to count.

Users who cannot save and re-open their workout rebuild from scratch on session 2. This is likely the single highest-leverage fix for D7 retention. A "My Routines" section accessible from the home screen is the minimum bar.

**Request to Phase A:** Add TICKET-003 to dev-frontend Phase A scope. This is the highest-impact unassigned ticket.

---

### GAP 3 — TICKET-004: "Start Workout" CTA Prominence
**Priority:** P1 | **Raised by:** 3/6 testers (Linda: 4 minutes to find it; Tyler: nearly churned)
**Roadmap status:** ❌ Not in Phase A.

The core product loop is "open app → log workout." Three testers had material friction finding where to start. This is a one-component change and one of the cheapest high-impact fixes in the entire backlog.

**Request to Phase A:** Add TICKET-004 to dev-frontend Phase A scope alongside TICKET-003 (same file surface, trivial to combine).

---

## Already In Phase A — Status Confirmed

| Ticket | Issue | Status |
|--------|-------|--------|
| TICKET-001 | kg/lbs toggle (P0 — wrong data for kg users) | ✅ In Phase A |
| TICKET-005 | Guided onboarding first-session flow | ✅ In Phase A |
| TICKET-007 | Exercise search abbreviations (RDL, OHP, etc.) | ✅ In Phase A |
| TICKET-008 | PR detection + badge | ✅ In Phase A |
| TICKET-010 | Mixed lift + cardio session | ✅ In Phase A |

---

## P2 Tickets — Route to Phase D

These do not block launch but should be scheduled as Phase D acceptance criteria alongside the INSTRUCTIONS.md completion items.

| Ticket | Issue | Raised By | Phase D Slot |
|--------|-------|-----------|-------------|
| TICKET-006 | Android transition lag / animation stutter | Jasmine, Priya | React Native port milestone (Phase C/D boundary) |
| TICKET-009 | "Progress vs. Self" view for beginners low on percentile | Derek, Linda | Phase D — percentile UI build |
| TICKET-011 | Exercise swap without history loss | Priya | Phase D — plan/routine editing tools |

Note on TICKET-006: Android performance should be measured and targeted during Phase C (React Native migration), not deferred to Phase D post-build.

---

## Updated Phase A Scope (Recommended)

| Ticket | Owner | Notes |
|--------|-------|-------|
| TICKET-001 | dev-frontend + dev-backend | Carry forward — in progress |
| TICKET-002 | dev-frontend | UI-only — data model done. Low effort, maximum reach (6/6 testers affected) |
| TICKET-003 | dev-frontend | Home-screen routines section. Highest D7 retention impact |
| TICKET-004 | dev-frontend | Promote Start Workout CTA. Same file surface as TICKET-003 |
| TICKET-005 | dev-frontend | Carry forward |
| TICKET-007 | dev-database + dev-frontend | Carry forward |
| TICKET-008 | dev-frontend + dev-backend | Carry forward |
| TICKET-010 | dev-frontend + dev-backend | Carry forward — requires TICKET-010 contract (already written) |

**Phase A gate (revised):** All 8 tickets merged + a casual-gym-goer beta tester can complete a full session end-to-end on the desktop prototype — open app, find "Start Workout," log a session, save it as a routine, return to it — without reading docs.

---

## Exec Decisions Needed

1. **Approve the three Phase A additions** (TICKET-002, -003, -004) or explicitly defer them with rationale.
2. **Confirm TICKET-006 Android performance** is a Phase C acceptance criterion, not Phase D — this affects how RN migration is scoped.
3. **Open items still pending from Health-Suite brief** (habit frequency, meditation logging mode, Wellbeing vs. Recovery tab naming) — dev-database is not blocked for first Phase B task, but these must be resolved before Phase D UI work begins.

---

## Files Referenced

- `testing-team/beta-feedback-round1.md` — Full persona feedback
- `testing-team/dev-tickets-round1.md` — All 11 tickets with acceptance criteria
- `DEV_ROADMAP_2026-04-30.md` — Current exec-approved roadmap
- `workflow-optimization/briefs/dev-roadmap-relay-2026-04-30.md` — Current dev directive

## Change Log Entry

> `2026-05-01` — Workflow Coordinator issued Beta Round 1 roadmap update brief. Identified three P1 tickets (TICKET-002, -003, -004) absent from Phase A sprint. Recommended adding all three to Phase A scope. Routed TICKET-006, -009, -011 to Phase D. Flagged exec decisions needed before Phase A gate closes.
