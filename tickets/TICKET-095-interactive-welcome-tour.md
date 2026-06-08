# TICKET-095 — Interactive Welcome Tour

**Owner:** dev-frontend (mobile)
**Date opened:** 2026-06-06
**Phase:** 2 — Onboarding / activation
**Source:** Founder request 2026-06-06 (chosen format: interactive guided tour).

## Goal
A first-run, coach-mark guided tour that walks a new user through every core feature on the real screens: routine setup, where to see rankings, how to log/track weights, and how to view progress graphs. Skippable and replayable.

## Scope — in
- A lightweight coach-mark overlay (spotlight on an anchor element + tooltip + Next/Back/Skip + step dots). Prefer a small existing RN tour lib or a thin custom overlay; respect theme tokens, no heavy dependency.
- An ordered tour script tied to anchors on the real screens: (1) Home as the logging hub, (2) start a routine / "Create schedule", (3) the stepper — log a set, (4) Rankings tab, (5) Trends/progress graph, (6) Routines tab — create a routine.
- Trigger automatically on first launch after `onboarding.tsx`; persist "tour seen" in async-storage.
- "Replay tour" entry in Profile/Settings.

## Scope — out
Video production; per-feature deep tutorials; A/B copy testing.

## Acceptance criteria
1. Tour runs once on first launch (after onboarding), is skippable at any step, and is replayable from settings.
2. Each step highlights the correct element; a missing anchor is skipped gracefully (never blocks or crashes).
3. "Tour seen" persists across restarts.
4. Works in both themes; no layout breakage on small screens.

## Test plan
Fresh install → tour shows; skip mid-way → dismissed and marked seen; replay from settings; rotate through all tabs and confirm each anchor resolves; toggle theme.

## Notes
Anchors should be registered by the target screens (ref/measure) so the tour stays correct as layouts evolve. Tie step 2/6 to the new "Create schedule" button from TICKET-097 once it lands.
