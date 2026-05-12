/**
 * PowerSync schema — defines the local SQLite tables that PowerSync manages.
 *
 * Rules applied here:
 *   - UUIDs and timestamps → ColumnType.TEXT  (PowerSync stores them as text strings)
 *   - Integer counts / indices → ColumnType.INTEGER
 *   - Decimals / numerics → ColumnType.REAL
 *   - Postgres arrays (e.g. muscle_groups TEXT[]) → ColumnType.TEXT, stored as JSON string
 *
 * Tables synced: workouts, sets, exercises.
 * Tables intentionally NOT synced: users, plans, percentile_vectors,
 *   daily_health_metrics, user_constraints (sensitive or not needed offline).
 *
 * Keep this file in sync with the Postgres schema and the TypeScript types in
 * src/types/api.ts whenever the server schema changes.
 */

import { Schema, Table, Column, ColumnType } from '@powersync/common';

// ---------------------------------------------------------------------------
// workouts
// ---------------------------------------------------------------------------

const workoutsTable = new Table({
  name: 'workouts',
  columns: [
    new Column({ name: 'user_id', type: ColumnType.TEXT }),
    new Column({ name: 'day_key', type: ColumnType.TEXT }),
    new Column({ name: 'notes', type: ColumnType.TEXT }),
    new Column({ name: 'created_at', type: ColumnType.TEXT }),
    new Column({ name: 'updated_at', type: ColumnType.TEXT }),
  ],
});

// ---------------------------------------------------------------------------
// sets
// ---------------------------------------------------------------------------

const setsTable = new Table({
  name: 'sets',
  columns: [
    new Column({ name: 'workout_id', type: ColumnType.TEXT }),
    new Column({ name: 'user_id', type: ColumnType.TEXT }),
    new Column({ name: 'exercise_id', type: ColumnType.TEXT }),
    new Column({ name: 'kind', type: ColumnType.TEXT }),           // 'lift' | 'cardio'
    new Column({ name: 'set_index', type: ColumnType.INTEGER }),
    // lift-specific
    new Column({ name: 'reps', type: ColumnType.INTEGER }),
    // TICKET-027: mirrors Postgres sets.weight_raw SMALLINT (kg × 8).
    // Decode on read: weight_raw / 8 → weight_kg.
    // Encode on write: Math.round(weight_kg * 8) → weight_raw.
    // API contract unchanged — LiftSet.weight_kg is always a float kg value.
    new Column({ name: 'weight_raw', type: ColumnType.INTEGER }),
    new Column({ name: 'rir', type: ColumnType.INTEGER }),
    new Column({ name: 'e1rm_kg', type: ColumnType.REAL }),
    // cardio-specific
    new Column({ name: 'duration_sec', type: ColumnType.INTEGER }),
    new Column({ name: 'distance_m', type: ColumnType.REAL }),
    new Column({ name: 'avg_pace_sec_per_km', type: ColumnType.REAL }),
    // shared
    new Column({ name: 'logged_at', type: ColumnType.TEXT }),
  ],
});

// ---------------------------------------------------------------------------
// exercises  (read-only — synced from server seed data, no local writes)
// ---------------------------------------------------------------------------

const exercisesTable = new Table({
  name: 'exercises',
  columns: [
    new Column({ name: 'name', type: ColumnType.TEXT }),
    new Column({ name: 'category', type: ColumnType.TEXT }),
    // Stored as a JSON-encoded string because SQLite has no native array type.
    // Parse with JSON.parse(row.muscle_groups) when consuming.
    new Column({ name: 'muscle_groups', type: ColumnType.TEXT }),
    new Column({ name: 'is_compound', type: ColumnType.INTEGER }), // SQLite boolean: 0 | 1
  ],
});

// ---------------------------------------------------------------------------
// App schema — register all synced tables
// ---------------------------------------------------------------------------

export const AppSchema = new Schema([workoutsTable, setsTable, exercisesTable]);
