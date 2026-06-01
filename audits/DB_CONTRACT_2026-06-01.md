# DB Contract Reconciliation — 2026-06-01

**Scope:** verify the consolidated [`db/schema.sql`](../db/schema.sql) is a faithful superset of
everything the server + mobile code references. Partially satisfies **TICKET-068** acceptance
#1 (reconciliation report) and #4 (no undeployed function/column referenced). The exhaustive
per-column sweep of all 53 INSERT/RETURNING sites remains TICKET-068's open work — but it is
now cheap because there is a single schema file to diff against.

**Method:** static analysis only (no live Postgres available this session). `db/schema.sql`
must still pass the live-execution gate in **TICKET-073** before it is trusted in production.

---

## ✅ Table coverage — PASS

Every table the server references (`FROM`/`JOIN`/`INTO`/`UPDATE`) is created in `db/schema.sql`:

`users, exercises, workouts, sets, plans, groups, group_memberships, streaks, streak_overrides,
routines, notification_queue, cosmetic_items, user_cosmetics, user_equipped_cosmetics,
user_constraints, user_weekly_goals, user_percentile_rankings, refresh_tokens,
user_confirmed_1rm, orphaned_auth_records, group_week_evaluations, exercise_aliases,
workout_templates, template_sessions, template_exercises, daily_health_metrics, daily_health_log,
habits, credit_ledger, lift_vectors, percentile_vectors, exercise_prs`

`workout_templates / template_sessions / template_exercises` are created twice (benign — see
Drift §1).

## ✅ Function + view coverage — PASS

Every DB function the code **calls** is defined in `db/schema.sql`:

| function | called by | defined |
|---|---|---|
| `compute_percentile_batch` | cron/percentile.js, routes/percentile.js | ✓ (4 defs, last wins) |
| `compute_percentile` | routes/percentile.js | ✓ (3 defs, last wins) |
| `compute_undisclosed_percentile` | routes/percentile.js | ✓ (2 defs, last wins) |
| `compute_wilks_score` | routes/percentile.js, routes/user.js | ✓ |

Views `v_user_lift_inputs` and `v_lift_vector_summary` are present (final definition wins after
the `weight_raw` CASCADE recreate + `arch_1_6` recreate — order preserved from the proven
`all_migrations.sql` sequence).

Functions defined but **not** called by app code (so not on the critical path):
`compute_percentile_simple`, `compute_dots_score`, `resolve_lift_vector`, `norm_cdf`,
`recompute_exercise_pr_*`, `prune_expired_refresh_tokens`, `set_updated_at`,
`set_daily_health_log_updated_at`. The standalone root `compute_percentile.sql` additionally
defines `overall_strength_percentile`, `overall_strength_percentile_detail`,
`compute_percentile_sex_only` — **not** applied, **not** called → TICKET-066.

## ✅ `sets` column-level deep check — 1 P0 FOUND + FIXED

`routes/sets.js` columns vs final `sets` shape in `db/schema.sql`:

| column | status |
|---|---|
| workout_id, user_id, exercise_id, kind, set_index, reps, rir, duration_sec, distance_m, avg_pace_sec_per_km, logged_at | ✓ present |
| weight_raw | ✓ added by `20260505_sets_weight_raw` (`weight_kg` dropped CASCADE, dependent CHECK rebuilt via `pg_constraint` lookup — correctly handled) |
| **`is_pr`** | **❌ NOT IN ANY MIGRATION** |

### P0 — `is_pr` does not exist; `POST /sets` 500'd on every set log

`routes/sets.js` did `INSERT INTO sets ... RETURNING ... is_pr, logged_at`. There is **no
`is_pr` column** on `sets` in any migration. Postgres rejects `RETURNING` of a nonexistent
column → **every set-logging request returned 500**. This is the L-017 failure mode (a
`RETURNING` referencing an unapplied column) and is a prime suspect for the founder's report
that "set addition is not functional."

`is_pr` is in fact a **client-derived** field: `mobile/src/hooks/useWorkoutHistory.ts:143`
computes `is_pr: prIds.has(set.id)` from the `exercise_prs` table; it is **not** on the base
`LiftSet` type (callers cast `as LiftSet & { is_pr }`) and the client never reads `is_pr` from
the `POST /sets` response.

**Fix applied (2026-06-01):** removed `is_pr` from the `RETURNING` clause in `routes/sets.js`.
Logging a set now succeeds. (`node --check` passes.)

---

## ⚠️ Remaining TICKET-068 work (open)

A full column-level sweep of the other **52** INSERT/RETURNING/SELECT sites was **not** done
this session. The newest server migrations (`session_type`, `comp_pro`, `exercises_alt_fields`,
`workouts_cardio_columns`, `routines.exercises` JSONB) are the highest-risk for the same
class of mismatch and should be swept next. Recommended mechanical check (now trivial): parse
each query's identifier list, diff against the column set in `db/schema.sql`, fail on any
identifier absent from the schema.

---

## Drift preserved as-is (intentional — see db/README.md)

1. **template_library defined twice.** Root `20260517_template_library` (with `form_cue` +
   public-read RLS) wins by order; server `20260530_template_library` only adds seed rows and a
   `sets BETWEEN 1 AND 20` CHECK that the `IF NOT EXISTS` skips. Columns are otherwise identical.
   No missing column for `routes/templates.js`. Owner: TICKET-068 cleanup.
2. **Percentile engine = full applied chain** (v1→v2→arch_1_6→20260515 hotfix). Reproduces
   deployed behavior exactly. Reconciling against the standalone root `compute_percentile.sql`
   is TICKET-066.
