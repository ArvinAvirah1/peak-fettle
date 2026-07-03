/**
 * localSchema — DDL for the lightweight offline SQLite store.
 *
 * This is the on-device schema for the offline-logging foundation that replaces
 * the PowerSync stub (src/powerSyncClient.ts). It is plain expo-sqlite SQL, not
 * a PowerSync schema object — no native sync engine is involved.
 *
 * Tables:
 *   - workouts : today's session header (id == server UUID once synced).
 *   - sets     : individual logged sets. Columns mirror SetRow in
 *                src/hooks/usePowerSyncLog.ts EXACTLY, plus bookkeeping
 *                (`synced`, `server_id`) for the outbox sync path.
 *   - outbox   : pending mutations (op + payload) drained to the server when
 *                connectivity returns.
 *
 * Weight encoding mirrors Postgres: `weight_raw` is INTEGER = kg × 8.
 *
 * Statements run in order, all CREATE ... IF NOT EXISTS, so init() is idempotent.
 *
 * Schema v2 (SPEC-094A, 2026-06-12): adds personal-data tables for local-first
 * free tier. All v2 tables use TEXT pk id, snake_case cols mirroring server,
 * JSON-as-TEXT for jsonb, ISO TEXT dates.
 */

// ---------------------------------------------------------------------------
// Table DDL — v1 (unchanged)
// ---------------------------------------------------------------------------

export const CREATE_WORKOUTS = `
CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  day_key TEXT,
  notes TEXT,
  session_type TEXT,
  created_at TEXT,
  updated_at TEXT,
  synced INTEGER DEFAULT 0
)`;

export const CREATE_SETS = `
CREATE TABLE IF NOT EXISTS sets (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  workout_id TEXT,
  user_id TEXT,
  exercise_id TEXT,
  kind TEXT,
  set_index INTEGER,
  reps INTEGER,
  weight_raw INTEGER,
  rir INTEGER,
  duration_sec INTEGER,
  distance_m REAL,
  avg_pace_sec_per_km REAL,
  logged_at TEXT,
  synced INTEGER DEFAULT 0
)`;

export const CREATE_OUTBOX = `
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,
  local_id TEXT,
  server_id TEXT,
  payload TEXT,
  created_at TEXT,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
)`;

// TICKET-097: training split schedule (cycle | weekly). One row, id='active'.
// The full config is stored as JSON in `data` so it round-trips through the
// TICKET-094 schema-versioned backup unchanged.
export const CREATE_SCHEDULE = `
CREATE TABLE IF NOT EXISTS schedule (
  id TEXT PRIMARY KEY,
  mode TEXT,
  data TEXT,
  position INTEGER DEFAULT 0,
  updated_at TEXT
)`;

// TICKET-096 Phase 2: customizable avatar config (the option-set, not an image).
// One row, id='active'. JSON in `data` so it round-trips through TICKET-094 backup.
export const CREATE_AVATAR = `
CREATE TABLE IF NOT EXISTS avatar (
  id TEXT PRIMARY KEY,
  data TEXT,
  updated_at TEXT
)`;

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Weekly-median bodyweight log (founder 2026-06-10): prompted weekly; guides
// strength calculations; the tier ladder is GATED on a fresh entry because a
// significant bulk/cut between weigh-ins would make the tier inaccurate.
export const CREATE_BODYWEIGHT = `
CREATE TABLE IF NOT EXISTS bodyweight (
  id TEXT PRIMARY KEY,
  week_key TEXT UNIQUE,
  weight_kg REAL,
  logged_at TEXT
)`;

// Per-exercise training prefs (founder 2026-06-10): warm-up on/off + set count,
// last-used machine/bar base weight, pulley config for cable machines.
export const CREATE_EXERCISE_PREFS = `
CREATE TABLE IF NOT EXISTS exercise_prefs (
  exercise_id TEXT PRIMARY KEY,
  warmup_enabled INTEGER DEFAULT 0,
  warmup_sets INTEGER DEFAULT 3,
  base_weight_kg REAL,
  pulley_id TEXT,
  updated_at TEXT
)`;

// WIDGET-002 (founder 2026-06-11): per-exercise weight x rep goal. One active
// goal per exercise (PRIMARY KEY exercise_id). target_weight_kg uses the same
// kg convention as sets.weight_kg; achieved_* set when a logged set meets BOTH
// targets. Local-first; in the backup registry (exportEngine BACKUP_TABLES).
export const CREATE_EXERCISE_GOALS = `
CREATE TABLE IF NOT EXISTS exercise_goals (
  exercise_id TEXT PRIMARY KEY,
  exercise_name TEXT,
  target_weight_kg REAL NOT NULL,
  target_reps INTEGER NOT NULL,
  created_at TEXT,
  achieved_at TEXT,
  achieved_set_id TEXT
)`;

// Exercise name cache (local-first name resolution). The server `sets` row only
// stores `exercise_id` (a UUID); free users have no server library to resolve
// names from on Home/history. We remember id→name whenever an exercise is picked
// or a session is started, and best-effort backfill from GET /exercises (a
// global, non-personal catalogue) so Recent Activity / Recent PRs show real
// names instead of raw UUIDs. Re-derivable, so it is NOT in the backup registry.
export const CREATE_EXERCISE_NAMES = `
CREATE TABLE IF NOT EXISTS exercise_names (
  exercise_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT
)`;

export const CREATE_SETS_WORKOUT_IDX = `
CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id)`;

export const CREATE_WORKOUTS_DAY_IDX = `
CREATE INDEX IF NOT EXISTS idx_workouts_day_key ON workouts(day_key)`;

export const CREATE_OUTBOX_ID_IDX = `
CREATE INDEX IF NOT EXISTS idx_outbox_id ON outbox(id)`;

// ---------------------------------------------------------------------------
// Table DDL — v2 (SPEC-094A local-first tables)
// All TEXT pk id, snake_case, JSON-as-TEXT for jsonb, ISO TEXT dates.
// ---------------------------------------------------------------------------

// Plans: mirrors server plans table (structure as JSON TEXT).
export const CREATE_PLANS = `
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  is_template INTEGER NOT NULL DEFAULT 0,
  is_ai_generated INTEGER NOT NULL DEFAULT 0,
  structure TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
)`;

// Routines: user-defined exercise lists (exercises as JSON TEXT).
export const CREATE_ROUTINES = `
CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  exercises TEXT NOT NULL DEFAULT '[]',
  created_at TEXT,
  updated_at TEXT
)`;

// Workout templates: curated programs (global, no user_id).
export const CREATE_WORKOUT_TEMPLATES = `
CREATE TABLE IF NOT EXISTS workout_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  discipline TEXT NOT NULL,
  experience_level TEXT NOT NULL,
  days_per_week INTEGER NOT NULL,
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
)`;

// Template sessions: days within a workout template.
export const CREATE_TEMPLATE_SESSIONS = `
CREATE TABLE IF NOT EXISTS template_sessions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  day_number INTEGER NOT NULL,
  session_name TEXT NOT NULL,
  notes TEXT
)`;

// Template exercises: exercises within a template session.
export const CREATE_TEMPLATE_EXERCISES = `
CREATE TABLE IF NOT EXISTS template_exercises (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  exercise_name TEXT NOT NULL,
  sets INTEGER NOT NULL,
  reps TEXT NOT NULL,
  rest_seconds INTEGER,
  form_cue TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
)`;

// Streaks: one row per user tracking current/longest streak.
export const CREATE_STREAKS = `
CREATE TABLE IF NOT EXISTS streaks (
  user_id TEXT PRIMARY KEY,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  last_session_date TEXT,
  pending_makeup INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
)`;

// Streak overrides: illness/travel/exam excused days.
export const CREATE_STREAK_OVERRIDES = `
CREATE TABLE IF NOT EXISTS streak_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  override_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  created_at TEXT,
  UNIQUE (user_id, override_date)
)`;

// Daily health log: sleep, mood, stress, screen time, meditation.
export const CREATE_DAILY_HEALTH_LOG = `
CREATE TABLE IF NOT EXISTS daily_health_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  sleep_hours REAL,
  sleep_quality INTEGER,
  mood_score INTEGER,
  stress_score INTEGER,
  screen_time_minutes INTEGER,
  habits_completed TEXT DEFAULT '[]',
  meditation_minutes INTEGER,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE (user_id, log_date)
)`;

// Daily health metrics: wearable data (HRV, resting HR, etc.).
export const CREATE_DAILY_HEALTH_METRICS = `
CREATE TABLE IF NOT EXISTS daily_health_metrics (
  metric_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  resting_hr_bpm INTEGER,
  hrv_ms REAL,
  sleep_hours REAL,
  active_kcal INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT,
  UNIQUE (user_id, date, source)
)`;

// Habits: user-defined recurring habits.
export const CREATE_HABITS = `
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'daily',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
)`;

// User weekly goals: workouts-per-week target with pending-change queue.
export const CREATE_USER_WEEKLY_GOALS = `
CREATE TABLE IF NOT EXISTS user_weekly_goals (
  user_id TEXT PRIMARY KEY,
  workouts_per_week INTEGER NOT NULL DEFAULT 3,
  pending_workouts_per_week INTEGER,
  pending_applies_at TEXT,
  created_at TEXT,
  updated_at TEXT
)`;

// User constraints: physical limitation flags for plan generation.
export const CREATE_USER_CONSTRAINTS = `
CREATE TABLE IF NOT EXISTS user_constraints (
  constraint_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  constraint_type TEXT NOT NULL,
  custom_note TEXT,
  created_at TEXT,
  UNIQUE (user_id, constraint_type)
)`;

// Exercise PRs: best weight per rep count per exercise.
export const CREATE_EXERCISE_PRS = `
CREATE TABLE IF NOT EXISTS exercise_prs (
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  rep_count INTEGER NOT NULL,
  weight_kg REAL NOT NULL,
  set_id TEXT NOT NULL,
  achieved_at TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (user_id, exercise_id, rep_count)
)`;

// User confirmed 1RM: manually confirmed 1-rep maxes.
export const CREATE_USER_CONFIRMED_1RM = `
CREATE TABLE IF NOT EXISTS user_confirmed_1rm (
  user_id TEXT NOT NULL,
  lift_id TEXT NOT NULL,
  confirmed_kg REAL NOT NULL,
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lift_id)
)`;

// User cosmetics: owned cosmetic items ledger.
export const CREATE_USER_COSMETICS = `
CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  acquisition_source TEXT NOT NULL DEFAULT 'purchase',
  PRIMARY KEY (user_id, item_id)
)`;

// User equipped cosmetics: active loadout (one row per slot).
export const CREATE_USER_EQUIPPED_COSMETICS = `
CREATE TABLE IF NOT EXISTS user_equipped_cosmetics (
  user_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  item_id TEXT NOT NULL,
  equipped_at TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
)`;

// User profile: single-row profile including survey fields from 20260611.
// id='active' (one row per install / user session).
export const CREATE_USER_PROFILE = `
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  email TEXT,
  display_name TEXT,
  sex TEXT,
  birth_date TEXT,
  weight_class_kg REAL,
  years_in_sport INTEGER,
  experience_level TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  unit_pref TEXT NOT NULL DEFAULT 'kg',
  score_pref TEXT NOT NULL DEFAULT 'peak_fettle',
  theme_preference TEXT DEFAULT 'deepOcean',
  show_wilks INTEGER NOT NULL DEFAULT 0,
  training_goal TEXT,
  sessions_per_week INTEGER,
  session_minutes INTEGER,
  goal_weight_kg REAL,
  equipment_profile TEXT,
  season_phase TEXT,
  last_deload_at TEXT,
  -- v8 expanded-survey columns (also added by guarded ALTER for existing rows):
  primary_focus TEXT,
  injuries TEXT,
  muscle_priorities TEXT,
  bodyweight_kg REAL,
  training_days TEXT,
  created_at TEXT,
  updated_at TEXT
)`;

// ---------------------------------------------------------------------------
// v2 indexes
// ---------------------------------------------------------------------------

export const CREATE_DAILY_HEALTH_LOG_IDX = `
CREATE INDEX IF NOT EXISTS idx_daily_health_log_user_date ON daily_health_log(user_id, log_date)`;

export const CREATE_DAILY_HEALTH_METRICS_IDX = `
CREATE INDEX IF NOT EXISTS idx_daily_health_metrics_user_date ON daily_health_metrics(user_id, date)`;

export const CREATE_EXERCISE_PRS_IDX = `
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user ON exercise_prs(user_id)`;

export const CREATE_USER_CONSTRAINTS_IDX = `
CREATE INDEX IF NOT EXISTS idx_user_constraints_user ON user_constraints(user_id)`;

export const CREATE_ROUTINES_IDX = `
CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id)`;

// ---------------------------------------------------------------------------
// Ordered execution list — v1 statements (run by localDb.init())
// ---------------------------------------------------------------------------

export const SCHEMA_STATEMENTS: string[] = [
  CREATE_WORKOUTS,
  CREATE_SETS,
  CREATE_OUTBOX,
  CREATE_SCHEDULE,
  CREATE_AVATAR,
  CREATE_BODYWEIGHT,
  CREATE_EXERCISE_PREFS,
  CREATE_EXERCISE_GOALS,
  CREATE_EXERCISE_NAMES,
  CREATE_SETS_WORKOUT_IDX,
  CREATE_WORKOUTS_DAY_IDX,
  CREATE_OUTBOX_ID_IDX,
];

// ---------------------------------------------------------------------------
// v2 statements — applied by the migration runner (migrations.ts), NOT
// by localDb.init() directly. Exported so migrations.ts can reference them.
// ---------------------------------------------------------------------------

export const SCHEMA_V2_STATEMENTS: string[] = [
  CREATE_PLANS,
  CREATE_ROUTINES,
  CREATE_WORKOUT_TEMPLATES,
  CREATE_TEMPLATE_SESSIONS,
  CREATE_TEMPLATE_EXERCISES,
  CREATE_STREAKS,
  CREATE_STREAK_OVERRIDES,
  CREATE_DAILY_HEALTH_LOG,
  CREATE_DAILY_HEALTH_METRICS,
  CREATE_HABITS,
  CREATE_USER_WEEKLY_GOALS,
  CREATE_USER_CONSTRAINTS,
  CREATE_EXERCISE_PRS,
  CREATE_USER_CONFIRMED_1RM,
  CREATE_USER_COSMETICS,
  CREATE_USER_EQUIPPED_COSMETICS,
  CREATE_USER_PROFILE,
  CREATE_DAILY_HEALTH_LOG_IDX,
  CREATE_DAILY_HEALTH_METRICS_IDX,
  CREATE_EXERCISE_PRS_IDX,
  CREATE_USER_CONSTRAINTS_IDX,
  CREATE_ROUTINES_IDX,
];

// ---------------------------------------------------------------------------
// v3 statements — exact-precision weight storage.
//
// Until v3, local sets stored weight ONLY as `weight_raw` INTEGER = kg × 8
// (0.125 kg resolution). That silently rounded every entry: 82.3 kg → 658.4 →
// 658 → reads back 82.25 kg; and pounds drifted worse (185 lb → 184.92 lb on
// revisit). v3 adds a full-precision `weight_kg REAL` column that stores the
// exact kilograms entered. weight_raw is kept (derived) for backward compat and
// the on-device percentile path; all display/edit reads prefer weight_kg via
// COALESCE(weight_kg, weight_raw/8.0). Added 2026-06-13 (decimal-accuracy fix).
//
// ALTER ADD COLUMN is applied only here (not in CREATE_SETS) so it runs exactly
// once on both fresh installs (v1→v2→v3) and existing v2 installs.
//
// Idempotency: ALTER TABLE ADD COLUMN throws if the column already exists in
// SQLite (no IF NOT EXISTS syntax).  The migration runner (migrations.ts) guards
// each statement in SCHEMA_V3_STATEMENTS tagged as 'alter_guarded' by checking
// pragma_table_info before executing it.  The backfill UPDATE is inherently safe
// to re-run (the WHERE weight_kg IS NULL clause skips already-filled rows).
//
// Encoding: each entry is either a plain SQL string or an object describing a
// guarded ALTER so the runner can apply the existence check.
export type MigrationStatement =
  | string
  | { type: 'alter_add_column'; table: string; column: string; definition: string };

export const SCHEMA_V3_STATEMENTS: MigrationStatement[] = [
  { type: 'alter_add_column', table: 'sets', column: 'weight_kg', definition: 'REAL' },
  `UPDATE sets
      SET weight_kg = CAST(weight_raw AS REAL) / 8.0
    WHERE weight_kg IS NULL AND weight_raw IS NOT NULL`,
];

// ---------------------------------------------------------------------------
// v4 statements — descriptive session labels for local-first users.
//
// Free users start routine/template sessions entirely on-device, so the
// routine name had nowhere to live locally (the server `createWorkout` link is
// a no-op on the free path). Recent Activity therefore could only ever show the
// date ("Today"/"Yesterday"). v4 adds `workouts.routine_name` so a started
// routine stamps its name on today's local workout and the history list can
// label it "Leg Day 6/14/26" exactly like the Pro path. Added 2026-06-15.
//
// Guarded ALTER (same idempotency pattern as v3): SQLite has no
// "ADD COLUMN IF NOT EXISTS", so the runner checks pragma_table_info first.
export const SCHEMA_V4_STATEMENTS: MigrationStatement[] = [
  { type: 'alter_add_column', table: 'workouts', column: 'routine_name', definition: 'TEXT' },
];

// ---------------------------------------------------------------------------
// v5 statements — device-local key/value settings + workout query indexes.
//
// `app_settings` is a tiny on-device KV store for per-install configuration that
// is NOT user data and must NEVER sync (it is deliberately excluded from the
// backup registry / BACKUP_TABLES). First consumer: the rest-timer default
// (see mobile/src/data/appSettings.ts). One row per key.
//
// Plus two covering indexes on the local `workouts` table:
//   • idx_workouts_session_type — the history/streak reads filter by
//     session_type ('workout' vs 'rest_day' etc.).
//   • idx_workouts_created_at   — Recent Activity / history order by created_at.
// Both CREATE INDEX IF NOT EXISTS, so they are idempotent and need no ALTER
// guard. Added 2026-06-17.
export const CREATE_APP_SETTINGS = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
)`;

export const CREATE_WORKOUTS_SESSION_TYPE_IDX = `
CREATE INDEX IF NOT EXISTS idx_workouts_session_type ON workouts(session_type)`;

export const CREATE_WORKOUTS_CREATED_AT_IDX = `
CREATE INDEX IF NOT EXISTS idx_workouts_created_at ON workouts(created_at)`;

export const SCHEMA_V5_STATEMENTS: MigrationStatement[] = [
  CREATE_APP_SETTINGS,
  CREATE_WORKOUTS_SESSION_TYPE_IDX,
  CREATE_WORKOUTS_CREATED_AT_IDX,
];

// ---------------------------------------------------------------------------
// v6 statements — rich cardio/sport metrics + a persistable on-device username.
//
// (a) sets.metrics_json TEXT (nullable): a JSON blob for cardio/sport metrics
//     that don't fit the fixed lift/cardio columns (avg/max HR, calories,
//     cadence, elevation gain, RPE, per-unit splits, and an open `extras` bag).
//     Read/written via mobile/src/data/cardioMetrics.ts (JSON.stringify/parse,
//     best-effort). On-device storage for ALL tiers in this wave — server sync
//     of metrics_json is a later Phase-6 server task, so there is intentionally
//     no server `sets.metrics_json` column yet.
//
// (b) user_profile.display_name TEXT (nullable): so FREE (local-first) users can
//     persist an edited username on-device. Free users make no personal REST
//     call, so there is nowhere else for an edited name to live; the server
//     `users.display_name` (db/schema.sql) is the Pro-path equivalent.
//
// Both are guarded ALTERs (same idempotency pattern as v3/v4): SQLite has no
// "ADD COLUMN IF NOT EXISTS", so the migration runner checks pragma_table_info
// before executing each. Added 2026-06-17.
export const SCHEMA_V6_STATEMENTS: MigrationStatement[] = [
  { type: 'alter_add_column', table: 'sets', column: 'metrics_json', definition: 'TEXT' },
  { type: 'alter_add_column', table: 'user_profile', column: 'display_name', definition: 'TEXT' },
];

// ---------------------------------------------------------------------------
// v7 statements — Pro-upgrade migration ledger (idempotency / resume).
//
// migration_state maps each local row uploaded to the server (or permanently
// skipped) during the Free→Pro migration to its server-assigned id, keyed by
// (entity, local_id). It lets mobile/src/data/migrateToPro.ts run idempotently
// and resume safely after a partial failure — a re-run never re-POSTs an
// already-handled row. Device-local bookkeeping only: like `outbox` /
// `migration_snapshots` it is intentionally NOT in BACKUP_TABLES.
// Added 2026-06-17 (Phase 6).
export const CREATE_MIGRATION_STATE = `
CREATE TABLE IF NOT EXISTS migration_state (
  entity      TEXT NOT NULL,
  local_id    TEXT NOT NULL,
  server_id   TEXT,
  status      TEXT NOT NULL DEFAULT 'done',
  reason      TEXT,
  uploaded_at TEXT NOT NULL,
  PRIMARY KEY (entity, local_id)
)`;

export const SCHEMA_V7_STATEMENTS: MigrationStatement[] = [CREATE_MIGRATION_STATE];

// ---------------------------------------------------------------------------
// v8 statements — expanded Training-Engine survey fields on user_profile.
//
// The training survey (mobile/app/training-survey.tsx) now collects, in
// addition to the existing goal/experience/sessions/length/equipment/season:
//   • primary_focus    TEXT  — the chosen discipline (general_strength,
//                              powerlifting, …). Previously had no local column,
//                              so a free user's discipline was lost on cold start
//                              and the engine fell back to general_strength.
//   • injuries         TEXT  — JSON-encoded string[] of region tokens
//                              (lower_back, knees, …); fed into the engine's
//                              contraindication filter so unsafe patterns are
//                              excluded.
//   • muscle_priorities TEXT — JSON-encoded string[] of canonical muscle labels
//                              (chest, back, legs, …); biases exercise selection
//                              and accessory volume toward those groups.
//   • bodyweight_kg    REAL  — current body weight (canonical kg) for loading /
//                              recovery defaults.
//   • training_days    TEXT  — JSON-encoded number[] (0=Sun … 6=Sat) of the
//                              specific weekdays the user trains, so the schedule
//                              maps onto real days ("Mon – Push") not "Day 1".
//
// All guarded ALTER ADD COLUMN (SQLite has no IF NOT EXISTS for ADD COLUMN; the
// migration runner checks pragma_table_info first). All nullable — every survey
// step stays skippable and older rows simply read back null. Added 2026-06-19.
export const SCHEMA_V8_STATEMENTS: MigrationStatement[] = [
  { type: 'alter_add_column', table: 'user_profile', column: 'primary_focus', definition: 'TEXT' },
  { type: 'alter_add_column', table: 'user_profile', column: 'injuries', definition: 'TEXT' },
  { type: 'alter_add_column', table: 'user_profile', column: 'muscle_priorities', definition: 'TEXT' },
  { type: 'alter_add_column', table: 'user_profile', column: 'bodyweight_kg', definition: 'REAL' },
  { type: 'alter_add_column', table: 'user_profile', column: 'training_days', definition: 'TEXT' },
];

// ---------------------------------------------------------------------------
// v9 statements - engine-v2 generated-plan persistence (Stage 2).
//
// `generated_plans` holds the SINGLE active generated plan or trial sequence
// produced by the Pro deep plan-builder (mobile/app/plan-survey.tsx), TOGETHER
// with the SurveyAnswers that produced it (needed to regenerate on adoption /
// meta-change) and the trial-block lifecycle state. One active row per install
// (id='active', same single-row pattern as `schedule`/`avatar`), so the deep
// builder replaces its previous output rather than accumulating drafts.
//
// Design note (why a NEW table, not the existing `plans`): `plans` mirrors the
// SERVER plans shape (Pro server sync) and is consumed by the Pro server path;
// its columns cannot carry the SurveyAnswers blob or the trial lifecycle state,
// and conflating two different lifecycles in one table would be dishonest. A
// dedicated single-active-row table is cleaner and keeps the server `plans`
// contract untouched. Local SQLite is used for BOTH tiers in Stage 2
// (generation is on-device; additive server sync for Pro can come later) - no
// new REST endpoint, no free-tier network call (local-first invariant).
//
// Columns:
//   id           TEXT  pk, always 'active' (one row).
//   user_id      TEXT  owner (denormalized; the local DB is single-user).
//   kind         TEXT  'plan' | 'trial' - which payload column is authoritative.
//   status       TEXT  PlanLifecycleStatus (plan_saved | plan_adopted |
//                      trial_active | trial_complete | trial_adopted).
//   payload      TEXT  JSON of the PlanV2 (kind='plan') or TrialSequenceV2
//                      (kind='trial') AS GENERATED.
//   survey       TEXT  JSON of the SurveyAnswers that produced it.
//   split        TEXT  the split of the CURRENT/adopted plan (null while a trial
//                      sequence is mid-flight and no split is adopted yet).
//   active_block INTEGER  trial only: index (0..2) of the active block.
//   block_start_day_key TEXT  trial only: day-key the sequence started (block 1,
//                      day 1); the lifecycle derives progress from today vs this.
//   adopted_split TEXT  the split the user adopted out of the trial flow (null
//                      until adoption).
//   created_at   TEXT  ISO.
//   updated_at   TEXT  ISO.
export const CREATE_GENERATED_PLANS = `
CREATE TABLE IF NOT EXISTS generated_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  survey TEXT NOT NULL,
  split TEXT,
  active_block INTEGER,
  block_start_day_key TEXT,
  adopted_split TEXT,
  created_at TEXT,
  updated_at TEXT
)`;

export const SCHEMA_V9_STATEMENTS: MigrationStatement[] = [CREATE_GENERATED_PLANS];
