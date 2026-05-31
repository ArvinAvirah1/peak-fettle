# Base-schema backfill — runbook

## Why this exists

The `migrations/` folder is **incomplete**. Routes/cron query ~31 tables, but only a
handful (`routines`, `workout_templates` + sessions/exercises, `notification_queue`,
`orphaned_auth_records`) have a `CREATE TABLE` in this repo. The core tables — `users`,
`workouts`, `sets`, `exercises`, `plans`, `groups`, `streaks`, `cosmetic_items`,
`user_percentile_rankings`, `lift_vectors`, the views, etc. — exist **only in the live
Supabase database**; they were created directly in the console (or in a setup script
that was never committed / lost in the OneDrive corruption incident).

Consequence: there is **no source of truth** for the schema. You cannot rebuild the DB
from the repo, can't stand up staging/local DBs, and every feature risks a "column does
not exist" 500 when code outruns the deployed schema (which is exactly what broke
Templates / Log / CSV import in the 2026-05-30/31 debugging session).

The fix: capture the current prod schema as a committed, idempotent base migration so
`migrations/` once again fully describes the database.

## Step 1 — generate a schema-only dump of prod

You need the Postgres connection string. Supabase dashboard → Project → **Settings →
Database → Connection string → URI** (use the **session/direct** connection, not the
pooler, for `pg_dump`). It looks like `postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres`.

### Option A — pg_dump (best fidelity; needs Postgres client tools installed)
```bash
pg_dump "postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres" \
  --schema-only --no-owner --no-privileges --schema=public \
  > 00000000_base_schema.raw.sql
```
On Windows without `pg_dump`: install it via `winget install PostgreSQL.PostgreSQL` (or
use the Postgres.app / EDB installer), or run the command from the Railway shell which
already has Postgres client tools.

### Option B — Supabase dashboard (no local tooling)
Supabase has limited built-in schema export. If pg_dump isn't available, run this in the
**SQL Editor** and export the result, OR just paste the result back to the agent, which
will reconstruct the CREATE statements:
```sql
-- tables + columns + types + nullability + defaults
select table_name, column_name, data_type, is_nullable, column_default,
       character_maximum_length
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- constraints (PK / UNIQUE / FK / CHECK)
select tc.table_name, tc.constraint_type, tc.constraint_name,
       pg_get_constraintdef(pgc.oid) as definition
from information_schema.table_constraints tc
join pg_constraint pgc on pgc.conname = tc.constraint_name
where tc.table_schema = 'public'
order by tc.table_name, tc.constraint_type;

-- indexes
select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public'
order by tablename, indexname;

-- views
select table_name, view_definition
from information_schema.views where table_schema = 'public';
```

## Step 2 — hand it back to the agent

Save the dump as `00000000_base_schema.raw.sql` in this folder (or paste the Option-B
query results into chat). The agent will then:
- rename/normalise it to `00000000_base_schema.sql`
- convert `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`, guard policies with
  `DROP POLICY IF EXISTS`, make indexes `IF NOT EXISTS` — so it's a **safe no-op against
  prod** and **fully rebuilds an empty DB**
- verify it parses and ordering is correct (tables before FKs/views)
- commit it via the `peak-fettle-commit` skill

## Step 3 — the rule going forward

**Every schema change is a committed migration file first, then applied** — never edited
directly in the Supabase console. That permanently ends schema drift. Consider adding a
tiny migration runner (a `npm run migrate` that applies un-applied files in order and
records them in a `schema_migrations` table) so this can't rot again.

## Cleanup also pending
- `migrations/migrations/` is a stray nested duplicate of `20260504_orphaned_auth_records.sql`
  (plus malformed `-- ` directories). Nothing reads it; safe to delete once filesystem
  permits (rm is blocked on the OneDrive mount — do it from a normal shell).
- `20260517_notification_queue.sql` is corrupted (duplicated column blocks); a separate
  task tracks rewriting it. Prod is already fixed via APPLY_ALL_pending.sql.
