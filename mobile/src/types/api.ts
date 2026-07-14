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
  /** Opt-out of streak milestone push notifications. Default: true (opted in). */
  streak_notifications_enabled?: boolean;
  /** Opt-out of plan-ready push notifications. Default: true (opted in). */
  plan_notifications_enabled?: boolean;
  /** ROADMAP 1.6 — primary sport/discipline for cohort routing. */
  primary_discipline?: string | null;
  /** TICKET-066: user opted in to seeing their Wilks2 score in the rankings tab. Default: false. */
  show_wilks?: boolean;
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
  /**
   * TICKET-054: session_type is now returned by GET /workouts and GET /workouts/:id.
   * 'lift' (or null) = regular strength session counted by streaks.
   * 'rest_day' = intentional rest; streak cron counts it as an active week.
   * 'cardio_import' = Strava/imported cardio; excluded from strength set counts.
   */
  // DB CHECK (migrations 20260517): 'workout' is the default training day; 'lift' was never a valid value.
  session_type?: 'workout' | 'rest_day' | 'emergency_override' | 'cardio_import' | null;
  /**
   * Routine link (migration 20260604). Set when the session was started from a
   * routine/template. routine_name is a display snapshot used by Recent Activity
   * to label the session (e.g. "Leg Day 6/4/26"); both null for ad-hoc sessions.
   */
  routine_id?: string | null;
  routine_name?: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Phase 1.5: set to true on the session that first crosses the free-tier
   * session limit (currently 5). Never true for paid users.
   * Only present on the POST /workouts response — not on GET responses.
   */
  paywall_trigger?: boolean;
}

export interface CreateWorkoutPayload {
  dayKey: string; // YYYY-MM-DD
  notes?: string;
  routineId?: string;
  routineName?: string;
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
  /** TICKET-129: free-text note attached to this set. Null if none. */
  note?: string | null;
  /** TICKET-129: quick-tap flag bitmask (1=paused,2=tempo,4=belt,8=pin/rack,16=discomfort). */
  flags?: number | null;
  // TYPE-001 fix (2026-05-16): `e1rm_kg: number | null` was removed because the
  // server-side column was dropped in `20260505_sets_weight_raw.sql`. The server's
  // `normalizeSet()` no longer emits the field, so any client read returned
  // `undefined` not `null`, and any `set.e1rm_kg != null` branch silently
  // evaluated false for all sets. When an Epley estimate is needed, compute it
  // inline from `weight_kg` and `reps` (the same pattern used in
  // `routes/percentile.js` and `lib/scoring.ts`).
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
  /** TICKET-129: free-text note attached to this set. Null if none. */
  note?: string | null;
  /** TICKET-129: quick-tap flag bitmask (1=paused,2=tempo,4=belt,8=pin/rack,16=discomfort). */
  flags?: number | null;
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
  /** TICKET-129: optional free-text note (max 500 chars server-side). */
  note?: string;
  /** TICKET-129: quick-tap flag bitmask (0-31). */
  flags?: number;
  /**
   * Backdated logging (2026-07-14): ISO datetime the set actually happened.
   * Omit for live logging — the server stamps now(). Server rejects future
   * datetimes and anything older than 5 years.
   */
  loggedAt?: string;
}

export interface LogCardioSetPayload {
  kind: 'cardio';
  workoutId: string;
  exerciseId: string;
  setIndex: number;
  durationSec: number;
  distanceM?: number;
  avgPaceSecPerKm?: number;
  /** TICKET-129: optional free-text note (max 500 chars server-side). */
  note?: string;
  /** TICKET-129: quick-tap flag bitmask (0-31). */
  flags?: number;
  /** Backdated logging (2026-07-14): ISO datetime the set actually happened. */
  loggedAt?: string;
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
   * The best Epley estimate (computed inline server-side via MAX of
   * `weight_raw/8 × (1 + reps/30)` across logged lift sets) for this lift.
   * Pre-fills the confirmation input in Option C. Null if no sets logged.
   * Added in TICKET-041; comment updated for TYPE-001 (2026-05-16).
   */
  epley_estimate_kg?: number | null;
  /**
   * The user's confirmed 1RM for this lift. Null if the user has not
   * confirmed (or is still on Option B default). Added in TICKET-041.
   */
  confirmed_1rm_kg?: number | null;
  /** Wilks2 (2020) score — null until compute_wilks_score() is available server-side */
  wilks_score?: number | null;
  wilks_note?: string;
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
  /** Wilks2 (2020) explanation for display in the transparency modal. */
  wilks_note?: string;
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
  /** Per-exercise coaching note from Haiku — technique focus or loading intent (spec §6.3). */
  coaching_note?: string;
}

export interface PlanSession {
  exercises: PlanExercise[];
}

/** Single day within a multi-week program (TICKET-058) */
export interface PlanWeekSession {
  day_label: string;       // e.g. "Day 1 – Push"
  exercises: PlanExercise[];
}

/** One week block in a multi-week program (TICKET-058) */
export interface PlanWeek {
  week_number: number;
  sessions: PlanWeekSession[];
}

/** Opaque JSONB structure stored on the server. Shape depends on how the plan was created. */
export interface PlanStructure {
  session?: PlanSession;
  /** Multi-week program structure (TICKET-058); present for plans generated after v058 */
  weeks?: PlanWeek[];
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
  /**
   * PLANS-001 (2026-05-19): currently-followed program flag.
   * At most one user-owned plan may be active at a time — enforced by the
   * partial unique index `idx_plans_one_active_per_user`. Always false for
   * global templates (user_id IS NULL).
   */
  is_active: boolean;
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
  session: PlanSession;         // backward compat: first session of week 1
  weeks?: PlanWeek[];           // multi-week structure (TICKET-058)
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
  /** UUID of the group admin. Server field name: admin_user_id. */
  admin_user_id: string;
  created_at: string;
  current_streak_weeks: number;
  last_evaluated_week: string | null;
  /** Hard cap on membership (2–12). */
  size_cap: number;
  /** Current active member count (returned as active_count in list response). */
  active_count: number;
  /** Opaque UUID token used to generate the invite share-link. Only returned to the admin. */
  invite_token: string | null;
}

export interface GroupMember {
  user_id: string;
  display_name: string | null;
  joined_at: string;
  /** 'active' | 'left' | 'kicked' */
  status: string;
  left_at: string | null;
  kick_cooldown_until: string | null;
}

/** Result of a single ISO-week evaluation for a group. Mirrors group_week_evaluations table. */
export interface GroupWeekEvaluation {
  /** ISO date string for Monday of the evaluated week (UTC). */
  week_start: string;
  /** Number of members eligible in the evaluated week. */
  eligible_members: number;
  members_hit_goal: number;
  /** Credits awarded per qualifying member for that week (base × multiplier). */
  credits_per_member: number;
  streak_weeks_after: number;
  evaluated_at: string;
}

/**
 * TICKET-139 — one member's row in the opt-in group leaderboard.
 * `total_volume_kg` / `session_count` / `streak_weeks` are null for members
 * who have NOT opted in for THIS group (or who have no signal yet for the
 * week) — the UI must render "—" for null, never coerce to 0 (a non-
 * participant is not the same as a participant with zero volume).
 */
export interface GroupLeaderboardEntry {
  user_id: string;
  display_name: string | null;
  opted_in: boolean;
  total_volume_kg: number | null;
  session_count: number | null;
  streak_weeks: number | null;
}

/** One week's leaderboard board (current or last week). */
export interface GroupLeaderboardWeek {
  /** ISO Monday (YYYY-MM-DD) this board covers. */
  week_start: string;
  entries: GroupLeaderboardEntry[];
}

/**
 * TICKET-139 — group-scoped leaderboard, current + last week only. No
 * cross-group or global rollups; volume is NOT a strength comparison (copy
 * in group-detail.tsx makes this explicit). Additive/optional: absent on a
 * drift-guarded server that hasn't run the migration yet (degrades to
 * undefined, the screen simply hides the board section).
 */
export interface GroupLeaderboard {
  current_week: GroupLeaderboardWeek;
  last_week: GroupLeaderboardWeek | null;
}

export interface GroupDetail extends Omit<Group, 'active_count'> {
  members: GroupMember[];
  /** TICKET-139: present only when the server has the leaderboard columns deployed. */
  leaderboard?: GroupLeaderboard | null;
}

export interface CreditBalance {
  balance: number;
  /** All-time gross credits earned (sum of positive ledger entries). */
  total_earned: number;
}

// -- Payloads ----------------------------------------------------------------

export interface CreateGroupPayload {
  name: string;
  /** Hard cap on membership (2–12). */
  sizeCap: number;
}

export interface JoinGroupPayload {
  /** The group's invite token UUID (from the share-link). */
  token: string;
}

export interface UpdateMemberGoalPayload {
  /** Must match server field: workoutsPerWeek. Min 1, max 14. */
  workoutsPerWeek: number;
}

export interface GroupsResponse {
  groups: Group[];
}

export interface EvaluationsResponse {
  history: GroupWeekEvaluation[];
}
