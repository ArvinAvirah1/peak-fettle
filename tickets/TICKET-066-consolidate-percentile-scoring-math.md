# TICKET-066 — Targeted Rewrite: Percentile / Scoring Math Consolidation
**Owner:** Opus + data-analyst
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening
**Source:** TICKET-064 findings; ROADMAP.md §1.2/§1.4; TICKET-031–033, 035–036, 052–053; `dev_learnings.md` L-014, L-024.

---

## Goal
Unify the scoring stack into one audited, documented module. The app now carries **four overlapping notions of "score"**: DOTS (TICKET-035/036), Wilks (specified, **never confirmed shipped** — ROADMAP §1.2), `percentile_simple` experience-adjusted (TICKET-031–033), and the new sex-only univariate percentile + tier ladder (TICKET-052/053). This is a correctness and trust surface; it must be consistent, batch-computed, and transparent.

## Acceptance criteria
1. A single source-of-truth doc `docs/SCORING_MODEL.md` defines each score, its formula, its inputs, and exactly where each is computed and surfaced. No score exists in code without an entry here.
2. **Wilks is resolved**: either implemented and verified against published coefficient tables, or formally removed from the product with the ROADMAP updated. No "specified but unconfirmed" limbo.
3. All percentile/tier math is **batch-only** (no live per-request math — CTO guardrail from TICKET-053); a test asserts request handlers do no scoring computation.
4. Each formula has a unit test with **known-answer fixtures** (e.g. a published DOTS example) so a regression in the math is caught mechanically.
5. Every `RETURNING`/`SELECT` feeding a score is reconciled against applied migrations (L-024) — no reference to an undeployed column.
6. User-facing transparency copy (ROADMAP §1.2 / §2.3) documents the PF score in help text.

## Implementation plan
- data-analyst owns the math docs + SQL (mirrors TICKET-052 deliverable shape); Opus owns the consolidation + tests.
- Independent check: run `/codex:review` on the formulas for a cross-model second opinion before merge; gate with `/ultra-review`.
- If the right *number* of scores to expose to users is unclear (do we show all four?), that is a **vision question → TICKET-071**, not a dev guess.

## Test plan
1. Known-answer fixtures for DOTS, Wilks (if kept), sex-only percentile, tier mapping.
2. Assert no scoring runs in request path (grep + a runtime guard test).
3. Migration reconciliation check via `peak-fettle-verify` step 5.

## Notes
- Keep existing surfaced scores intact where they're correct — this is consolidation + verification, not gratuitous change (echoes TICKET-052 "additive" guidance).
