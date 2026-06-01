# This directory is retired

The per-file migration history that used to live here was **nuked on 2026-06-01** (no user
base; the deployed DB was non-functional for everything but sign-in, so there was nothing to
preserve). The entire schema now lives in one canonical bootstrap:

> **[`../db/schema.sql`](../db/schema.sql)** — run once on a fresh Supabase project. See
> [`../db/README.md`](../db/README.md).

The old `.sql` files are recoverable from git history (commit `815fb47` and earlier) if ever
needed. The percentile **model source** (`compute_percentile.sql`, `lift_vectors_seed.sql`)
was moved to [`../db/reference/`](../db/reference/) for TICKET-066.

**Do not add migrations here.** Schema changes go directly into `db/schema.sql` until a real
numbered-migration tool is introduced (TICKET-074-adjacent follow-up) once we have users again.
