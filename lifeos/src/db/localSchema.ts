/**
 * Life OS local-first schema (SQLite, on-device source of truth).
 *
 * Mirrors the 094A pattern in mobile/src/db/localSchema.ts: idempotent
 * CREATE TABLE IF NOT EXISTS statements applied at open, then versioned
 * migrations (migrations.ts) for anything beyond v1.
 *
 * Spec: COMPANION_APP_V2_LIFEOS_SPEC_2026-06-11.md §3.
 * All tables ride the encrypted backup EXCEPT lo_focus_configs (the
 * FamilyActivitySelection token is device-scoped by OS design) and
 * lo_focus_events (device telemetry; not portable).
 */

export const SCHEMA_VERSION = 1;

export const CREATE_STACKS = `
CREATE TABLE IF NOT EXISTS lo_stacks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  anchor_type TEXT NOT NULL CHECK (anchor_type IN ('time','event')),
  anchor_value TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL
)`;

export const CREATE_HABITS = `
CREATE TABLE IF NOT EXISTS lo_habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'leaf-outline',
  cadence TEXT NOT NULL DEFAULT 'daily',
  stack_id TEXT,
  stack_position INTEGER,
  est_duration_sec INTEGER,
  forgiving_rules_json TEXT NOT NULL DEFAULT '{}',
  trigger_event TEXT,
  source_protocol_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL
)`;

export const CREATE_HABIT_LOGS = `
CREATE TABLE IF NOT EXISTS lo_habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done','rest','skip')),
  ts TEXT NOT NULL,
  UNIQUE (habit_id, date)
)`;

export const CREATE_GOALS = `
CREATE TABLE IF NOT EXISTS lo_goals (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL CHECK (domain IN ('health','professional','growth','interpersonal','financial','mind')),
  title TEXT NOT NULL,
  why TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','archived')),
  source_protocol_id TEXT,
  created_at TEXT NOT NULL
)`;

export const CREATE_MILESTONES = `
CREATE TABLE IF NOT EXISTS lo_milestones (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT
)`;

export const CREATE_GOAL_LINKS = `
CREATE TABLE IF NOT EXISTS lo_goal_links (
  goal_id TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  PRIMARY KEY (goal_id, habit_id)
)`;

export const CREATE_SURVEY_RESPONSES = `
CREATE TABLE IF NOT EXISTS lo_survey_responses (
  id TEXT PRIMARY KEY,
  survey_version INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('onboarding','micro','full')),
  ts TEXT NOT NULL,
  answers_json TEXT NOT NULL
)`;

export const CREATE_PROTOCOLS = `
CREATE TABLE IF NOT EXISTS lo_protocols (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  model_version TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','dismissed','superseded')),
  accepted_at TEXT,
  payload_json TEXT NOT NULL
)`;

export const CREATE_MOOD_CHECKINS = `
CREATE TABLE IF NOT EXISTS lo_mood_checkins (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  date TEXT NOT NULL,
  mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
  tags_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  UNIQUE (date)
)`;

export const CREATE_EXERCISES = `
CREATE TABLE IF NOT EXISTS lo_exercises (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  pack TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  duration_sec INTEGER NOT NULL
)`;

export const CREATE_EXERCISE_COMPLETIONS = `
CREATE TABLE IF NOT EXISTS lo_exercise_completions (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  ts TEXT NOT NULL
)`;

export const CREATE_FOCUS_CONFIGS = `
CREATE TABLE IF NOT EXISTS lo_focus_configs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('session','limit','focus_now')),
  name TEXT NOT NULL,
  schedule_json TEXT NOT NULL DEFAULT '{}',
  selection_token TEXT,
  friction_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
)`;

export const CREATE_FOCUS_EVENTS = `
CREATE TABLE IF NOT EXISTS lo_focus_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  kind TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}'
)`;

export const CREATE_WEEKLY_REVIEWS = `
CREATE TABLE IF NOT EXISTS lo_weekly_reviews (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  completed_at TEXT,
  reflections_json TEXT NOT NULL DEFAULT '{}'
)`;

export const CREATE_META = `
CREATE TABLE IF NOT EXISTS lo_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)`;

export const SCHEMA_STATEMENTS: string[] = [
  CREATE_STACKS,
  CREATE_HABITS,
  CREATE_HABIT_LOGS,
  CREATE_GOALS,
  CREATE_MILESTONES,
  CREATE_GOAL_LINKS,
  CREATE_SURVEY_RESPONSES,
  CREATE_PROTOCOLS,
  CREATE_MOOD_CHECKINS,
  CREATE_EXERCISES,
  CREATE_EXERCISE_COMPLETIONS,
  CREATE_FOCUS_CONFIGS,
  CREATE_FOCUS_EVENTS,
  CREATE_WEEKLY_REVIEWS,
  CREATE_META,
  `CREATE INDEX IF NOT EXISTS idx_lo_habit_logs_date ON lo_habit_logs (date)`,
  `CREATE INDEX IF NOT EXISTS idx_lo_habit_logs_habit ON lo_habit_logs (habit_id, date)`,
  `CREATE INDEX IF NOT EXISTS idx_lo_milestones_goal ON lo_milestones (goal_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_lo_focus_events_ts ON lo_focus_events (ts)`,
];

/** Tables included in the encrypted backup document (device-scoped tables excluded). */
export const BACKUP_TABLES: string[] = [
  'lo_stacks',
  'lo_habits',
  'lo_habit_logs',
  'lo_goals',
  'lo_milestones',
  'lo_goal_links',
  'lo_survey_responses',
  'lo_protocols',
  'lo_mood_checkins',
  'lo_exercise_completions',
  'lo_weekly_reviews',
  // schema v2 (TICKET-119) — additive feature tables that ARE portable.
  'lo_share_events',
  'lo_partner',
  'lo_affirmations',
  // NOTE: lo_app_ratings is deliberately excluded — it is keyed to device-scoped
  // FamilyActivity token labels (re-tag on restore, same rule as lo_focus_configs).
];
