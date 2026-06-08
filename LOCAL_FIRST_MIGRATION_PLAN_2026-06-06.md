# Local-First Data Migration — Plan

**Date:** 2026-06-06
**Goal:** Move user data off the server onto the phone to cut server cost/overhead, keeping a thin server only for what is irreducibly shared.
**Founder decisions baked in (2026-06-06):**
1. Percentile vectors are **model-derived** (from the data-analyst's calculator), *not* aggregated from the live user base → percentiles can be computed entirely on-device.
2. Group streak credits stay **server-side but slim** (low-storage shared state only).
3. Backup is **manual** — user exports/imports a CSV.

---

## Verdict: yes, but it's not "just reformat the DBs"

The instinct is right and your three clarifications make it much cleaner than it first looked. Confirmed against the code:

- `compute_percentile()` / `_simple` / `_sex_only` (in `db/reference/compute_percentile.sql`) are **pure math** over the static `lift_vectors` coefficients + the user's own lift. They never read another user's row. The weekly cron (`peak-fettle-agents/server/cron/percentile.js`) exists only as a "don't re-rank on every set" performance guardrail — there is no cohort to aggregate. So percentiles port to the device with no loss.

What remains is real work in **6 pieces**, not a schema reformat: on-device schema, porting the percentile math, rewriting the personal-data access layer, slimming the group server contract, CSV backup, and accepting the device-local account model. Detail below.

---

## Table mapping (all 32 tables in `db/schema.sql`)

### A. Move to the phone — on-device SQLite, user owns read/write
The bulk of reads/writes. This is where the server savings come from.

- `workouts`, `sets` *(foundation already exists in `mobile/src/db/localSchema.ts` + outbox)*
- `plans` (user's own), `routines`
- `workout_templates`, `template_sessions`, `template_exercises` (user-created)
- `streaks`, `streak_overrides`
- `daily_health_log`, `daily_health_metrics`, `habits`
- `user_weekly_goals`, `user_constraints`
- `exercise_prs`, `user_confirmed_1rm`
- `user_cosmetics`, `user_equipped_cosmetics`
- `users` — **profile portion only** (sex, birth_date, weight_class_kg, years_in_sport, experience_level, tier, unit_pref, score_pref). Identity/credentials stay on the server (section C).

### B. Reference data — static, ship read-only (bundle with the app or fetch-once)
- `exercises`, `exercise_aliases`
- `lift_vectors` (**the percentile model coefficients — required on-device for section D**)
- `cosmetic_items` (catalog)
- global template plans (`is_template = true`) / global workout templates

### C. Stay on a thin server — irreducibly shared / multi-party (keep, slimmed)
- `users` — **auth identity + credentials only** (id, email, password_hash); needed so groups can reference a stable user
- `refresh_tokens`
- `groups`, `group_memberships`, `group_week_evaluations`, `credit_ledger` (slim — see "Slim group contract")
- `notification_queue` + the push dispatcher (server must reach devices)

### D. Delete entirely
- `user_percentile_rankings` — now computed on-device
- `percentile.js` cron, `v_user_lift_inputs`, `compute_percentile_batch()` — no longer needed
- `percentile_vectors` (v1 legacy; `lift_vectors` is the live model — confirm before dropping)
- `orphaned_auth_records` — auth-cleanup artifact; revisit during the auth slim-down

---

## Slim group contract (keeps groups working at low storage)

Today the server would need everyone's logs to evaluate a group week. Instead:

1. Each phone computes its own weekly result locally (did I hit `workouts_per_week`?).
2. Phone pushes a **tiny weekly signal** per member: `{group_id, user_id, week_start, hit_goal: bool}` (optionally `workouts_done: int`).
3. Server computes `group_week_evaluations` (`members_hit_goal`, `credits_per_member`, `streak_weeks_after`) and writes `credit_ledger` from those signals.

The server never stores a single set or workout — just one boolean per member per week. That is the "much lower storage" you wanted.

---

## Percentiles on-device

1. Bundle/ship `lift_vectors` (~few hundred coefficient rows) with the app.
2. Port the lognormal math from SQL → TypeScript: `compute_percentile`, `compute_percentile_simple`, `compute_percentile_sex_only`, and `overall_strength_percentile()` (the tier ladder consumes this).
3. Phone computes the user's percentile from their own lifts on demand — no batch, no caching table, instant freshness.

---

## Backup: manual CSV

- **Export:** dump the on-device tables (workouts, sets, health, PRs, goals, etc.) to one or more CSVs the user saves.
- **Import:** re-ingest those CSVs into the local SQLite store.
- This doubles as the **device-migration path** (new phone = import the CSV).

---

## The 6 real work items (the part that isn't "reformatting")

1. **On-device schema** — expand `mobile/src/db/localSchema.ts` (currently workouts/sets/outbox only) to cover every table in section A, with a versioned local-migration runner.
2. **Percentile port** — SQL → TS math + ship `lift_vectors`; delete `user_percentile_rankings`, the cron, the batch function/view.
3. **Data-access rewrite** — personal reads/writes hit local SQLite instead of PowerSync/server. PowerSync narrows to group buckets only (or is replaced by the small REST call for the weekly signal).
4. **Slim group endpoint** — define + implement the weekly `{hit_goal}` push and server-side evaluation; stop syncing logs.
5. **CSV export/import** — backup, restore, device migration.
6. **Account model** — with manual CSV backup, personal data is **device-local**: no multi-device live sync, and a lost phone without an export = lost history. Confirm acceptable (founder said yes). Accounts persist only for group membership + push.

---

## Risks / call-outs

- **No live multi-device sync** for personal data (acceptable per CSV-backup decision; worth stating in onboarding so users know to export).
- **Local migrations are now safety-critical** — a bad on-device schema migration can corrupt a user's only copy. Version it and test upgrades on real data before shipping.
- **Groups still need network** — but only for the tiny weekly signal, not logging.
- **Confirm `percentile_vectors` vs `lift_vectors`** — drop the legacy one only after confirming nothing live reads it.
