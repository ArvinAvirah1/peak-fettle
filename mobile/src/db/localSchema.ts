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
 */

// ---------------------------------------------------------------------------
// Table DDL
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

export const CREATE_SETS_WORKOUT_IDX = `
CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id)`;

export const CREATE_OUTBOX_ID_IDX = `
CREATE INDEX IF NOT EXISTS idx_outbox_id ON outbox(id)`;

// ---------------------------------------------------------------------------
// Ordered execution list — run by localDb.init().
// ---------------------------------------------------------------------------

export const SCHEMA_STATEMENTS: string[] = [
  CREATE_WORKOUTS,
  CREATE_SETS,
  CREATE_OUTBOX,
  CREATE_SCHEDULE,
  CREATE_AVATAR,
  CREATE_SETS_WORKOUT_IDX,
  CREATE_OUTBOX_ID_IDX,
];
