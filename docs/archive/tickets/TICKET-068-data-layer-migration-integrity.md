# TICKET-068 — Data-Layer & Migration Integrity Audit
**Owner:** Opus + data-analyst + dev-backend
**Date opened:** 2026-05-29
**Phase:** R — Revision & Hardening
**Source:** TICKET-064 findings; `dev_learnings.md` L-009, L-017, L-024, L-025.

---

## Goal
Guarantee the database contract is internally consistent: every column a query references is actually deployed, list vs detail endpoints return the documented shapes, and undeployed DB functions can't produce always-500 tabs. Past incidents: a `RETURNING` referenced an unapplied column (L-017), calling an undeployed function 500'd a whole tab (L-024), and server-returns-array vs client-expects-object broke a screen (L-025).

## Acceptance criteria
1. A reconciliation report `audits/DB_CONTRACT_2026-05-29.md`: for every SQL query in the server, list referenced columns/functions and confirm each exists in an **applied** migration. Flag every mismatch.
2. `all_migrations.sql` and `migrations/` are reconciled — a single canonical, ordered migration history with no drift between them.
3. Every list endpoint returns summaries and every detail endpoint returns the full resource, matching the client's expected shape (L-009, L-025); mismatches fixed.
4. No DB function is called by app code unless it is present in the migration history and deployed (L-024); a check enforces this.
5. The companion app's future tables (TICKET-072) are NOT created here — but the audit notes where shared-backend additions will land.

## Implementation plan
- data-analyst maps query→column/function dependencies; dev-backend fixes mismatches; Opus reviews.
- Use the `peak-fettle-verify` migration cross-check (step 5) as the mechanical gate.
- `/ultra-review` before merge (touches data correctness).

## Test plan
1. Automated: parse server SQL, diff referenced identifiers against applied-migration DDL; report must be empty of P0/P1 mismatches.
2. Hit each list + detail endpoint; assert response shape matches client types.
3. Confirm no app code references an undeployed function.

## Notes
- If migration drift is severe, propose a consolidation migration — but **ask the founder before squashing history** (TICKET-071).
