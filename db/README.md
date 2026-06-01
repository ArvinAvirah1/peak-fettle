# Peak Fettle — Database (single source of truth)

**Canonical schema:** [`db/schema.sql`](./schema.sql) — one ordered, fresh-run bootstrap that
reproduces the entire deployed Postgres/Supabase schema (DDL + functions + triggers +
RLS + seed data) in a single file.

Generated **2026-06-01** by consolidating the previous two migration directories plus the
loose root SQL into one file. Created because the project has **no user base yet**, so there
is no need to preserve an incremental migration history — a clean from-scratch schema is
both safe and far less error-prone to reason about. (Founder directive, 2026-06-01.)

---

## How to apply (fresh Supabase project)

1. Create a fresh Supabase project (or `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
   on a throwaway DB — **never** on anything with real data).
2. Open the **SQL editor** and paste/run [`db/schema.sql`](./schema.sql) top to bottom, once.
3. Set `SUPABASE_DB_URL` in the server `.env` to that project's Postgres connection string.
4. Smoke-test the API against it (see the validation gate below).

`db/schema.sql` is **self-contained** — it includes all seed data (exercise library + aliases,
`lift_vectors`, cosmetics, workout templates). No separate seed step is required.

### Idempotency / re-run

The file is designed for a **single run on a fresh project**. Most statements are idempotent
(`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`). A handful of
`CREATE POLICY` statements are **not** guarded and will error on a second run — that is
expected and harmless for a fresh-project bootstrap. Re-running on a populated DB is **not**
a supported path.

---

## ⚠️ Validation gate (before trusting this in production) — TICKET-073

`db/schema.sql` was assembled and **statically** verified:

- every `.sql` migration from both old directories is included exactly once (coverage check),
- balanced `$$` function bodies, clean tail, no truncation,
- every table, function, and view that the server code references is present
  (see [`audits/DB_CONTRACT_2026-06-01.md`](../audits/DB_CONTRACT_2026-06-01.md)).

It has **NOT** yet been executed against a live Postgres. Before it replaces the old files
for good, **TICKET-073** must: run it on a fresh Supabase project, boot the server against
it, exercise every route, and confirm zero `undefined column` / `function does not exist`
errors. Only **after** that passes should the superseded files (below) be physically deleted.

---

## Known drift preserved as-is (do **not** "clean" without the owning ticket)

These are faithfully reproduced from the deployed state on purpose. "Fixing" them blind would
change runtime behavior:

- **Percentile engine (TICKET-066).** `schema.sql` contains the *full applied chain*:
  v1 (`20260502_percentile_engine`) → v2 (`20260510_percentile_engine_v2` +
  `20260510_percentile_arch_1_6`) → the `20260515` hotfix consolidation. The last
  `CREATE OR REPLACE` wins, exactly reproducing deployed behavior. A **separate, more
  complete** standalone version lives in the root `compute_percentile.sql` /
  `lift_vectors_seed.sql` (it adds `overall_strength_percentile`,
  `overall_strength_percentile_detail`, `compute_percentile_sex_only` — none of which the
  app currently calls). Collapsing the chain and reconciling it against that standalone
  version is **TICKET-066**, not this consolidation.
- **`workout_templates` / `template_exercises` defined twice (TICKET-068).** The root
  `20260517_template_library` definition (with `form_cue` + public-read RLS) wins by order;
  the server `20260530_template_library` only adds more seed rows and a `sets` CHECK that the
  `IF NOT EXISTS` skips. Columns are otherwise identical — benign.

---

## Superseded files (kept in place until TICKET-073 validation passes)

Do not edit or apply these. `db/schema.sql` is the source of truth.

- `migrations/*.sql` (30 dated files) — see `migrations/SUPERSEDED.md`
- `peak-fettle-agents/server/migrations/*.sql` (12 dated files)
- `all_migrations.sql` — old through-2026-05-15 concatenation (now incomplete + superseded)
- `APPLY_ALL_pending.sql` — old hand-rolled "pending" concatenation (superseded)
- `compute_percentile.sql`, `lift_vectors_seed.sql` — percentile **model source** (kept as
  reference for TICKET-066; pairs with `strength_curve_model.md`)
