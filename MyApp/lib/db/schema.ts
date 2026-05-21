/**
 * Peak Fettle — PowerSync SQLite Schema
 *
 * Column names and types mirror the Supabase Postgres schema exactly so that
 * PowerSync can sync rows transparently.  Source of truth for column names:
 *   migrations/20260430_initial_schema.sql
 *   migrations/20260504_user_constraints.sql
 *
 * Install:
 *   npx expo install @powersync/react-native @powersync/common expo-sqlite
 */

import { Schema, Table, column } from '@powersync/react-native';

// ---------------------------------------------------------------------------
// workouts — one row per calendar day per user
// day_key is the canonical grouping key; UNIQUE(user_id, day_key) on server.
// ---------------------------------------------------------------------------
const Workouts = new Table(
  {
    user_id:    column.text,
    day_key:    column.text,   // ISO-8601 date string: "2026-05-14"
    notes:      column.text,
    created_at: column.text,
    updated_at: column.text,
  },
  { indexes: { by_user_day: ['user_id', 'day_key'] } }
);

// ---------------------------------------------------------------------------
// sets — individual sets (lift OR cardio) within a workout
// ---------------------------------------------------------------------------
const Sets = new Table(
  {
    workout_id:          column.text,
    user_id:             column.text,
    exercise_id:         column.text,   // FK → exercises.id (required)
    kind:                column.text,   // "lift" | "cardio"
    set_index:           column.integer, // ordering within the workout

    // Lift fields (NULL for cardio)
    reps:                column.integer,
    weight_kg:           column.real,
    rir:                 column.integer, // Reps In Reserve; -1 = not recorded
    rpe:                 column.integer, // legacy, read-only

    // Cardio fields (NULL for lift)
    duration_sec:        column.integer,
    distance_m:          column.real,
    avg_pace_sec_per_km: column.real,

    logged_at:           column.text,   // ISO-8601 datetime
  },
  {
    indexes: {
      by_workout:  ['workout_id', 'set_index'],
      by_exercise: ['exercise_id'],
      by_user:     ['user_id', 'logged_at'],
    },
  }
);

// ---------------------------------------------------------------------------
// exercises — global read-only library, synced to all devices
// muscle_groups and contraindications are TEXT[] on Postgres; stored here
// as JSON strings (e.g. '["chest","triceps"]') and parsed by the UI layer.
// ---------------------------------------------------------------------------
const Exercises = new Table(
  {
    name:             column.text,
    category:         column.text,   // "lift" | "cardio" | "sport" | "mobility"
    muscle_groups:    column.text,   // JSON array string
    is_compound:      column.integer, // boolean 0 | 1
    contraindications: column.text,  // JSON array string
    created_at:       column.text,
  },
  { indexes: { by_name: ['name'], by_category: ['category'] } }
);

// ---------------------------------------------------------------------------
// exercise_aliases — synonym search, synced globally
// ---------------------------------------------------------------------------
const ExerciseAliases = new Table(
  {
    exercise_id: column.text,
    alias:       column.text,
  },
  { indexes: { by_alias: ['alias'] } }
);

// ---------------------------------------------------------------------------
// plans — AI-generated + static free-tier template plans
// `structure` is a JSONB blob (serialised as a JSON string locally).
// `is_active` is a client-managed boolean (see migration 20260515_plans_active.sql).
// ---------------------------------------------------------------------------
const Plans = new Table(
  {
    user_id:        column.text,  // NULL for global templates
    name:           column.text,
    is_template:    column.integer, // boolean 0 | 1
    is_ai_generated: column.integer, // boolean 0 | 1
    is_active:      column.integer, // boolean 0 | 1 — which plan is currently followed
    structure:      column.text,  // JSON: { weeks: [...], goal, reasoning }
    created_at:     column.text,
    updated_at:     column.text,
  },
  { indexes: { by_user: ['user_id'], by_active: ['user_id', 'is_active'] } }
);

// ---------------------------------------------------------------------------
// user_constraints — injury / equipment limits for plan generation
// NOTE: server PK is `constraint_id` but PowerSync aliases it as `id`
// in the sync-rules.yaml so it arrives here as `id`.
// ---------------------------------------------------------------------------
const UserConstraints = new Table(
  {
    user_id:         column.text,
    constraint_type: column.text,
    custom_note:     column.text,
    created_at:      column.text,
  },
  { indexes: { by_user: ['user_id'] } }
);

// ---------------------------------------------------------------------------
// streaks — one row per user (aggregated)
// Server PK is user_id; PowerSync sync rule aliases it as `id`.
// ---------------------------------------------------------------------------
const Streaks = new Table(
  {
    // id = aliased user_id from sync rule
    current_streak_days: column.integer,
    longest_streak_days: column.integer,
    last_session_date:   column.text,
    pending_makeup:      column.integer, // boolean
    updated_at:          column.text,
  }
);

// ---------------------------------------------------------------------------
// streak_overrides — emergency streak protection events
// ---------------------------------------------------------------------------
const StreakOverrides = new Table(
  {
    user_id:       column.text,
    override_date: column.text,
    reason:        column.text,
    notes:         column.text,
    created_at:    column.text,
  },
  { indexes: { by_user: ['user_id'] } }
);

// ---------------------------------------------------------------------------
// percentile_vectors — weekly-batch rank data; read-only on client
// ---------------------------------------------------------------------------
const PercentileVectors = new Table(
  {
    exercise_id:    column.text,
    sex:            column.text,
    age_band:       column.text,
    weight_class_kg: column.real,
    years_band:     column.text,
    distribution:   column.text,   // JSON: array of { percentile, value } tuples
    sample_size:    column.integer,
    computed_at:    column.text,
  },
  {
    indexes: {
      by_cohort: ['exercise_id', 'sex', 'age_band', 'weight_class_kg', 'years_band'],
    },
  }
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const AppSchema = new Schema({
  workouts:           Workouts,
  sets:               Sets,
  exercises:          Exercises,
  exercise_aliases:   ExerciseAliases,
  plans:              Plans,
  user_constraints:   UserConstraints,
  streaks:            Streaks,
  streak_overrides:   StreakOverrides,
  percentile_vectors: PercentileVectors,
});

export type Database = (typeof AppSchema)['types'];
