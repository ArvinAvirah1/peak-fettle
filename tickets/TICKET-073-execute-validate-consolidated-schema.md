# TICKET-073 — Execute & Validate the Consolidated Schema, then Remove the Old Pile
**Owner:** Opus + data-analyst + dev-backend
**Date opened:** 2026-06-01
**Phase:** R — Revision & Hardening
**Source:** Founder directive 2026-06-01 ("nuke the entire migrations sql schema and produce it differently … there is no user base yet"); TICKET-068; `db/README.md`; `audits/DB_CONTRACT_2026-06-01.md`.

---

## Context (what already happened, 2026-06-01)
The drifted migration pile (two `migrations/` directories + `all_migrations.sql` +
`APPLY_ALL_pending.sql` + loose root SQL, with a 4-version percentile-function chain and a
double-defined `template_library`) was **consolidated into one canonical fresh-run bootstrap**:
[`db/schema.sql`](../db/schema.sql). It was assembled by ordering every dated migration in the
proven `all_migrations.sql` sequence + appending the post-2026-05-15 additive migrations, and
statically verified (coverage of all 42 files, balanced `$$`, all code-referenced
tables/functions/views present — see `audits/DB_CONTRACT_2026-06-01.md`).

It has **NOT** been executed against a live Postgres. **Update 2026-06-01:** the founder
confirmed the deployed DB was non-functional for everything but sign-in and authorized the
full nuke — so the old migration pile (`migrations/*.sql`, `peak-fettle-agents/server/
migrations/*.sql`, `all_migrations.sql`, `APPLY_ALL_pending.sql`) was **deleted** from the
tree (recoverable from git history at `815fb47`); the percentile model source was moved to
`db/reference/`. This ticket is now purely about **proving `db/schema.sql` on a real DB** and
the full route-contract sweep — not gating deletion.

## Goal
Prove `db/schema.sql` produces a working database, then physically retire the old migration
pile so there is exactly one source of truth.

## Acceptance criteria
1. `db/schema.sql` runs top-to-bottom on a **fresh** Supabase project with **zero errors**
   (capture the SQL editor output; note any non-idempotent `CREATE POLICY` that needs a
   `DROP POLICY IF EXISTS` guard and add the guards so a re-run is clean too).
2. The server boots against that DB (`SUPABASE_DB_URL` set) and a scripted pass hits **every**
   route + cron entrypoint with no `column … does not exist` / `function … does not exist` /
   relation-missing errors. (This also completes TICKET-068 acceptance #1's full 53-site
   column sweep — see `audits/DB_CONTRACT_2026-06-01.md` "Remaining work".)
3. Set logging works end-to-end against the new schema (regression guard for the `is_pr` P0
   fixed 2026-06-01 in `routes/sets.js`).
4. Seed data present and sane: exercise library + aliases, `lift_vectors` (v1 + v2 rows),
   cosmetics, workout templates. Spot-check counts vs the old seed files.
5. ✅ **DONE 2026-06-01** — old pile deleted from the tree; percentile model source moved to
   `db/reference/`; redirect left at `migrations/README.md`.
6. ✅ **DONE 2026-06-01** — `db/README.md` updated to reflect the completed nuke.
7. The column-contract audit (`audits/DB_CONTRACT_2026-06-01.md`) found `is_pr` as the only
   real INSERT/RETURNING break (fixed). Extend it to **SELECT/WHERE/JOIN** columns during the
   live route sweep — those weren't statically swept and a live run catches them definitively.

## Implementation plan
- Use a throwaway Supabase project (never a DB with data).
- Script the route sweep (extend `peak-fettle-agents/server/scripts/` or a Jest integration
  suite) so it is repeatable and becomes the TICKET-068 mechanical check.
- `/ultra-review` before the deletion commit (touches data correctness).

## Test plan
1. Fresh-project apply → 0 errors.
2. Automated route+cron sweep → 0 schema-contract errors.
3. Manual: sign up → start workout → **log a set** → see it in history; rankings tab loads.

## Notes
- Do **not** collapse the percentile chain here — that is TICKET-066. This ticket only proves
  and cleans up the consolidation.
- If a fresh-project run surfaces an ordering bug, fix it **in `db/schema.sql`** (the single
  source), not by resurrecting a dated migration.
