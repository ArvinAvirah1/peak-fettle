# TICKET-071 — Founder Vision Reconciliation Protocol (ask, don't guess)
**Owner:** Every agent on every ticket (process ticket); maintained by the coordinator
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening (cross-cutting, never closes during the phase)
**Source:** Founder directive 2026-05-29 ("ensure the tickets outline that questions are asked to me regarding the vision of the app when it may be unclear").

---

## Goal
Stop agents from inventing product intent. Several past decisions were quietly assumed (e.g. `percentile_simple` "satisfies" the proprietary-score spec; Wilks status; whether multiple half-built clients are intentional). Establish a standing protocol: **when product vision is unclear, the agent stops and asks the founder** via `OPEN_QUESTIONS_FOR_FOUNDER.md`, rather than picking a plausible answer and coding it.

## Acceptance criteria
1. `OPEN_QUESTIONS_FOR_FOUNDER.md` exists at repo root, seeded with the open vision questions surfaced by the audit (see initial list there).
2. Process rule (documented here and referenced in `CLAUDE.md` / `AGENT_TOOLKIT.md`): any ticket that hits an ambiguous product decision must (a) **not guess**, (b) add a numbered question to `OPEN_QUESTIONS_FOR_FOUNDER.md` with context + options + the agent's recommendation, and (c) either block on it or proceed only on the explicitly-marked-safe default.
3. Each question has a status: `OPEN` / `ANSWERED (date)` / `SUPERSEDED`. Answered ones record the founder's decision verbatim and the ticket that acts on it.
4. Distinguish **vision questions** (founder-only) from **technical decisions** (agent may decide and document) — agents should not over-escalate trivia.
5. The coordinator reviews the doc at the start of every dev run and routes answered items into tickets.

## Implementation plan
- Create and maintain the doc; wire the rule into the agent context (done in `AGENT_TOOLKIT.md` "do not guess vision").
- Use `AskUserQuestion`-style framing in each entry: clear question, 2–4 options, a recommendation, and what changes based on the answer.

## Test plan
- Audit (TICKET-064) produces ≥1 entry; confirm it lands here, not as a code assumption.
- Spot-check that no Revision-phase ticket shipped a product decision that should have been a question.

## Notes
- This ticket stays OPEN for the duration of the Revision phase and the companion-app discovery (TICKET-072).
