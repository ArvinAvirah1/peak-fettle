# ⚠️ SUPERSEDED — do not apply or edit these files

As of **2026-06-01**, every `.sql` file in this directory **and** in
`peak-fettle-agents/server/migrations/` has been consolidated into a single canonical
bootstrap:

> **[`db/schema.sql`](../db/schema.sql)** — the one true schema. See [`db/README.md`](../db/README.md).

There is no user base, so no incremental migration history is maintained. The clean
from-scratch schema in `db/schema.sql` replaces this whole pile.

## Why these files are still here

They are the **verbatim provenance** of `db/schema.sql`. They will be physically deleted
once **TICKET-073** validates `db/schema.sql` by running it on a fresh Supabase project and
booting the server against it (see `db/README.md` → "Validation gate"). Until then they stay
as the recoverable audit trail.

## Do NOT

- Add new `.sql` migrations here. Schema changes now go into `db/schema.sql` directly
  (and, once we have users again, a real numbered migration tool — TICKET-074).
- Apply these to any database. `db/schema.sql` is the only thing to run.
