/**
 * API type contracts for Peak Fettle.
 *
 * These interfaces mirror the server-side Postgres schemas and Zod validators
 * in peak-fettle-agents/server/routes/. Keep them in sync whenever the server
 * schema changes.
 *
 * Naming convention: PascalCase for domain objects, snake_case for raw DB
 * fields that arrive directly from the API (we do NOT camel-case the API
 * layer yet — add a transform in client.ts if that ever changes).
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type UnitPref = 'kg' | 'lbs';
export type ScorePref = 'e1rm' | 'volume';
export type UserTier = 'free' | 'paid';

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  tier: UserTier;
  /** Whether the user has an active paid subscription. AI plans are gated on this. */
  is_paid: boolean;
  unit_pref: UnitPref;
  score_pref: ScorePref;
  experience_level: string | null;
  weight_class_kg: number | null;
  sex: string | null;
  age_band: string | null;
  /**
   * Option C opt-in (TICKET-041). When true, the rankings screen shows an
   * inline "Confirm your max" card for estimated lifts instead of the default
   * Option B silent-banner behaviour. Default: false (Option B).
   */
  use_1rm_confirmation?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export interface Workout {
  id: string;
  user_id: string;
  day_key: string; // YYYY-MM-DD
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkoutPayload {
  dayKey: string; // YYYY-MM-DD
  notes?: string;
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

export interface LiftSet {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  kind: 'lift';
  set_index: number;
  reps: number;
  weight_kg: number;
  /** Reps-in-Reserve. -1 = not recorded, 0 = to failure. */
  rir: number | null;
  e1rm_kg: number | null;
  logged_at: string;
}

export interface CardioSet {
  id: string;
  workout_id: string;
  user_id: string;
  exercise_id: string;
  kind: 'cardio';
  set_index: number;
  duration_sec: number;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  logged_at: string;
}

export type WorkoutSet = LiftSet | CardioSet;

export interface LogLiftSetPayload {
  kind: 'lift';
  workoutId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  rir?: number;
}

export interface LogCardioSetPayload {
  kind: 'cardio';
  workoutId: string;
  exerciseId: string;
  setIndex: number;
  durationSec: number;
  distanceM?: number;
  avgPaceSecPerKm?: number;
}

export type LogSetPayload = LogLiftSetPayload | LogCardioSetPayload;

export interface SetsPage {
  sets: WorkoutSet[];
  /** ISO timestamp — pass as `cursor` param to fetch the next page. Null if no more pages. */
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export type ExerciseCategory = 'lift' | 'cardio' | 'sport' | 'mobility';

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  muscle_groups: string[];
  is_compound: boolean;
}

export interface ExerciseSearchResult {
  query: string;
  results: Exercise[];
}

export interface ExerciseLibrary {
  exercises: Record<ExerciseCategory, Exercise[]>;
}

// ---------------------------------------------------------------------------
// Percentile rankings
// ---------------------------------------------------------------------------

export interface PercentileRanking {
  lift_id: string;
  /**
   * Experience-adjusted percentile (sex × BW × age × training years).
   * Interpretation: "vs. lifters at your level"
   * Null if the batch job has not yet run for this lift, or the user's
   * profile is incomplete (missing birth_date or years_in_sport).
   */
  percentile: number | null; // 0–100
  /**
   * Population percentile (gender + bodyweight only; no age or experience factor).
   * Interpretation: "vs. all strength trainees"
   * Null if the batch job has not yet run, or bodyweight is missing.
   * Added in TICKET-032 / model_version 2.
   */
  percentile_simple: number | null; // 0–100
  /**
   * Number of internal Peak Fettle users in this user's cohort
   * (age band × sex × discipline × experience band).
   * Drives the confidence ring UI. Excludes external reference data rows
   * (Open Powerlifting, race results) — those exist only as a Day-1 bootstrap.
   * Null until the v3 batch job runs.
   * Added in TICKET-036 / ROADMAP 1.6.
   */
  cohort_size_internal: number | null;
  /**
   * True when the ranking was computed from an Epley-estimated 1RM
   * (no user confirmation). False when the user confirmed or overrode
   * the estimate via the inline confirm flow (Option C).
   * Added in TICKET-041.
   */
  is_estimated?: boolean;
  /**
   * The best Epley estimate (MAX e1rm_kg across logged sets) for this lift.
   * Pre-fills the confirmation input in Option C. Null if no sets logged.
   * Added in TICKET-041.
   */
  epley_estimate_kg?: number | null;
  /**
   * The user's confirmed 1RM for this lift. Null if the user has not
   * confirmed (or is still on Option B default). Added in TICKET-041.
   */
  confirmed_1rm_kg?: number | null;
  computed_at: string;
  model_version: number;
}

/** Payload for POST /percentile/confirm-1rm (TICKET-041). */
export interface Confirm1rmPayload {
  lift_id: string;
  /** User-confirmed or user-adjusted 1RM in kg. Must be > 0. */
  confirmed_kg: number;
}

export interface PercentileResponse {
  rankings: PercentileRanking[];
  cohort_note: string;
  /** Standalone DOTS attribution for the 2.3 transparency modal. */
  dots_note?: string;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface PlanExercise {
  name: string;
  exercise_id: string | null; // null if AI couldn't resolve to a known exercise
  sets: number;
  reps: string; // range string e.g. "8-10"
  rpe_target: number;
  rest_seconds: number;
}

export interface PlanSession {
  exercises: PlanExercise[];
}

/** Opaque JSONB structure stored on the server. Shape depends on how the plan was created. */
export interface PlanStructure {
  session?: PlanSession;
  reasoning?: string;
  generated_at?: string;
  model?: string;
  [key: string]: unknown;
}

export interface Plan {
  id: string;
  user_id: string | null;
  name: string;
  is_template: boolean;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanWithStructure extends Plan {
  structure: PlanStructure;
}

export interface PlansResponse {
  plans: Plan[];
}

export interface GeneratePlanResponse {
  plan_id: string;
  session: PlanSession;
  reasoning: string;
}

// ---------------------------------------------------------------------------
// API error shape
// ---------------------------------------------------------------------------

/** Standard error body returned by the Peak Fettle API. */
export interface ApiError {
  error: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Groups / streak credits
// ---------------------------------------------------------------------------

/** A user's personal weekly workout goal within a group (workouts per week). */
export type WeeklyGoal = 1 | 2 | 3;

/** Goal-difficulty credit modifier per spec §6. */
export const GOAL_MODIFIER: Record<WeeklyGoal, number> = {
  1: 0.5,
  2: 0.75,
  3: 1.0,
};

export interface Group {
  id: string;
  name: string;
  admin_id: string;
  created_at: string;
  current_streak_weeks: number;
  /** False if active_member_count < 2 (dormancy). */
  is_active: boolean;
  member_count: number;
  /** Invite code used by others to join. */
  invite_code: string;
}

export interface GroupMember {
  user_id: string;
  display_name: string | null;
  /** Member's personal weekly goal for this group. */
  weekly_goal: WeeklyGoal;
  joined_at: string;
  /**
   * True if this member will be counted in the current week's evaluation.
   * False for mid-week joiners (excluded from current week per §7).
   */
  eligible_this_week: boolean;
  /**
   * True if the member has hit their weekly goal this week so far.
   * Null when the week's evaluation has not yet run.
   */
  hit_goal_this_week: boolean | null;
}

/** Result of a single ISO-week evaluation for a group. */
export interface GroupWeekEvaluation {
  group_id: string;
  /** ISO date string for Monday of the evaluated week (UTC). */
  week_start: string;
  success: boolean;
  members_eligible: number;
  members_hit_goal: number;
  /** Credits earned per member at the 3+/week goal tier (base × multiplier). */
  credits_per_member_base: number;
  streak_weeks_after: number;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
  /** Most recent completed evaluation, or null if no evaluations yet. */
  last_evaluation: GroupWeekEvaluation | null;
}

export interface CreditBalance {
  balance: number;
  total_earned: number;
}

// -- Payloads ----------------------------------------------------------------

export interface CreateGroupPayload {
  name: string;
  /** Creator's own weekly goal for this group. */
  weekly_goal: WeeklyGoal;
}

export interface JoinGroupPayload {
  invite_code: string;
  weekly_goal: WeeklyGoal;
}

export interface UpdateMemberGoalPayload {
  weekly_goal: WeeklyGoal;
}

export interface GroupsResponse {
  groups: Group[];
}

export interface EvaluationsResponse {
  evaluations: GroupWeekEvaluation[];
}
