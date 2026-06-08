# TICKET-097 — Lock/Home-Screen Widgets + Split Scheduling

**Owner:** dev-frontend (mobile) + native (widgets)
**Date opened:** 2026-06-06
**Phase:** 2 — Scheduling / retention
**Source:** Founder request 2026-06-06.

## Goal
1. Let users build a training split as either a **repeating cycle** or a **day-of-week** assignment, created from the **Routines tab** ("Create schedule" button at the top).
2. Show the **next-up day** on a **lock-screen and home-screen widget**.

The founder's own split is a cycle where same-type days differ: e.g. `Push A → Pull A → Push B → Legs → Pull B → Push C → Legs B …` — each push/pull slot maps to a *different* routine.

## Scope — in
**Data model (local-first, per TICKET-094):**
- `schedule`: `mode = 'cycle' | 'weekly'`.
  - `cycle`: an ordered list of slots, each slot → a `routineId` (or a rest slot). Same-type days map to distinct routines (Push A vs Push B).
  - `weekly`: a map of weekday → `routineId` (or rest).
- A current-position pointer + a shared **"next up" resolver** used by both the app and the widgets.
- **Advancement rule supports both modes; the exact cycle-advancement semantics (advance on workout completion vs by calendar day) is decided during implementation** (founder: support both, decide in build). Handle rest days.

**Routines tab:**
- "Create schedule" button at top → schedule editor: pick mode, build the sequence/week, map each slot to a routine (including distinct A/B/C variants).

**Widgets:**
- iOS WidgetKit (lock-screen accessory + home-screen) and Android App Widget, via Expo config plugin / dev build (custom native target).
- Widget reads "next up" from a shared store the app writes (App Group on iOS / SharedPreferences on Android) on each completion / day rollover.

## Scope — out
Rich complications beyond "next up"; Apple Watch app; calendar integration.

## Acceptance criteria
1. User can create both a cycle schedule and a weekday schedule from the Routines tab.
2. Distinct same-type days (Push A/B/C) map to different routines.
3. The widget shows the correct next-up and updates after a workout is completed / at day rollover.
4. Schedule persists locally and is included in backup/restore (TICKET-094).

## Test plan
Build the founder's cycle (push pull push legs, pull push pull legs) with each push/pull mapped to a different routine → verify next-up advances correctly through the loop; build a weekday schedule → verify it routes by date; complete a workout → widget updates; backup → restore → schedule intact.

## Risks / call-outs
- Widgets are a **sizable native workstream**: WidgetKit/App Widget targets, App Group / shared-store wiring, background-refresh limits, a dev/EAS build (EAS pulls origin/main — push config first, per CLAUDE.md). **Phase it: ship the schedule UI + resolver first, widgets second.**

## Open
Cycle advancement semantics (completion vs calendar) — decide in build; rest-day representation.
