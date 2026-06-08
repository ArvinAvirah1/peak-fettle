# TICKET-064 — Full-Codebase Audit Pass + Findings Register
**Owner:** Opus (lead) + Sonnet (module sweeps)
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening (governs; runs ahead of new product work)
**Source:** Founder directive 2026-05-29 ("revise the whole codebase in its entirety; take the learnings of the inefficiencies and mistakes"); `dev_learnings.md` L-001…L-026 + CORRUPT-001.

---

## Goal

Produce a single, authoritative **audit of the entire repository** — every module, not just the active backlog — measured against `dev_learnings.md`. This is the entry point for the whole Revision phase (TICKET-065…070). Output is a **findings register** that the targeted-rewrite tickets draw from. **No fixes land in this ticket** — it only inventories and classifies. (Decision: founder chose "audit everything + targeted rewrites".)

## Scope — the whole tree, by module
Inventory and parse-sweep **all** of:
- `mobile/app`, `mobile/src` (RN/Expo client)
- `peak-fettle-agents/server`, `peak-fettle-agents/cron`, `peak-fettle-agents/orchestrator`, `peak-fettle-agents/agents`
- `migrations/`, `all_migrations.sql`, every `*.sql` at root
- `peak-fettle-app/`, `MyApp/`, `qml/`, `src/`, `build/` — classify each as **active / legacy / dead**. Multiple half-built clients exist (`MyApp`, `mobile`, `peak-fettle-app`, the C++/QML app); the audit must state which is canonical and recommend retiring the rest (ask founder — see TICKET-071).
- `marketing-site/`, `workflow-optimization/`, `ollama-agents/`, root HTML mockups.

## Acceptance criteria
1. `audits/AUDIT_2026-05-29_findings.md` exists, listing **every source module** with: path, role, active/legacy/dead classification, LOC, last-touched commit.
2. Each finding is tagged with the **`dev_learnings.md` L-### it relates to** and a severity (P0 feature-blocking / P1 correctness / P2 quality / P3 cosmetic).
3. The `peak-fettle-verify` parse-sweep is run over the full JS/TS surface and its raw result is pasted into the register (file-by-file pass/fail), per L-014 / CORRUPT-001 — a prose "looks clean" is not acceptable.
4. A **"previous tickets re-examination"** table: walk TICKET-001…063, mark each Verified / Unverified / Regressed against current HEAD, citing the file checked. (Directly answers "revise the app's creation through all previous dev tickets.")
5. Every place where the **product intent is ambiguous** is added to `OPEN_QUESTIONS_FOR_FOUNDER.md` (TICKET-071) rather than guessed.
6. A one-page **prioritized remediation plan** mapping findings → TICKET-065…070.

## Implementation plan
- Use `context-mode` (the full-repo sweep dumps a lot of raw output) and `claude-mem` so the register survives across sessions.
- Drive it with `superpowers` plan-first; for the multi-module sweep, fan out with `GSD` sub-agents (one module per agent) so no module is silently skipped (scope-reduction guard).
- Do **not** edit source in this ticket. Recovery of any already-broken file is logged as a finding for TICKET-065+.

## Test plan
- Re-run `peak-fettle-verify`; the register's pass/fail table must match a fresh run exactly.
- Spot-check 5 random TICKET-001…063 claims against HEAD blobs to confirm the re-examination table is accurate.

## Notes
- This ticket is the **prerequisite for all of TICKET-065…070.** Land it first.
- Treat any "reviewed manually / no defects remain" line in an old roadmap as **unverified** until the sweep confirms it (L-014).
