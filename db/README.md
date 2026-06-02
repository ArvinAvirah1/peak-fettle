# Peak Fettle — Database (single source of truth)

**Canonical schema:** [`db/schema.sql`](./schema.sql) — one ordered, fresh-run bootstrap that
reproduces the entire deployed Postgres/Supabase schema (DDL + functions + triggers +
RLS + seed data) in a single file.

Generated **2026-06-01** by consolidating the previous two migration directories plus the
loose root SQL into one file. Created because the project has **no user base yet**, so there
is no need to preserve an incremental migration history — a clean from-scratch schema is
both safe and far less error-prone to reason about. (Founder directive, 2026-06-01.)

---

## How to apply

### ✅ Recommended: reset the EXISTING project in place (no setup, no env changes)

Keeps the same project → same `SUPABASE_DB_URL`, API keys, and server `.env`. Nothing to
reconfigure. In the existing project's **SQL editor**, run two files in order:

1. [`db/reset_public_schema.sql`](./reset_public_schema.sql) — drops + recreates the `public`
   schema and restores Supabase's default grants. (Destructive — wipes app tables/data, which
   is fine: there's no data worth keeping. Does **not** touch `auth`/`storage`/`extensions`.)
2. [`db/schema.sql`](./schema.sql) — rebuilds the entire schema + seed data.

That's it. The server connects via the direct Postgres URL / service role (bypasses RLS), so
it works against the new schema immediately — no key or `.env` changes.

### Alternative: brand-new project

1. Create a fresh Supabase project.
2. Run [`db/schema.sql`](./schema.sql) top to bottom in the SQL editor (no reset needed — it's
   already empty).
3. Point `SUPABASE_DB_URL` (+ `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) in the server
   `.env` at the new project.
4. Smoke-test the API (TICKET-073).

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

It has **NOT** yet been executed against a live Postgres. **TICKET-073** is the recommended
smoke test: run it on a fresh Supabase project, boot the server against it, exercise every
route, and confirm zero `undefined column` / `function does not exist` errors.

**The old migration pile was nuked on 2026-06-01** (founder directive — no user base, and the
deployed DB was non-functional for everything but sign-in). The old `.sql` files were deleted
from the tree (recoverable from git history at commit `815fb47` and earlier). `db/schema.sql`
is now the only schema artifact.

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

## Removed on 2026-06-01 (recoverable from git history)

`db/schema.sql` is the source of truth. These were deleted from the tree:

- `migrations/*.sql` (30 dated files) — old path now holds a redirect `migrations/README.md`
- `peak-fettle-agents/server/migrations/*.sql` (12 dated files)
- `all_migrations.sql` — old through-2026-05-15 concatenation (incomplete + superseded)
- `APPLY_ALL_pending.sql` — old hand-rolled "pending" concatenation (superseded)

Kept (moved to [`db/reference/`](./reference/)):

- `compute_percentile.sql`, `lift_vectors_seed.sql` — percentile **model source** (kept as
  reference for TICKET-066; pairs with `strength_curve_model.md`)
