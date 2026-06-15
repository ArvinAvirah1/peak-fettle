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

export const CREATE_SETS_WORKOUT_IDX = `
CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id)`;

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
  CREATE_SETS_WORKOUT_IDX,
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
