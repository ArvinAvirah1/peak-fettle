/**
 * migrateToPro — one-time local→server uploader for the Free→Pro transition.
 *
 * Phase 6: Free users keep ALL personal data in on-device SQLite (localDb); Pro
 * users live on the server (Postgres via REST, re-read through PowerSync). These
 * are two physically separate databases, so upgrading a user means COPYING their
 * local rows up to the server over the EXISTING REST endpoints. This module is
 * that copy.
 *
 * It is the ONE sanctioned place a former-free user's personal data goes over
 * REST — it runs DURING an explicit, user-initiated upgrade (gated by
 * AuthContext.upgradeToPro, while the server tier is still 'free'), never on a
 * free-tier mount. The local-first invariant is intact.
 *
 * RESUMABLE + IDEMPOTENT via the local `migration_state` ledger (schema v7):
 * every uploaded (or permanently-skipped) row is recorded keyed by
 * (entity, local_id). Before POSTing any row we consult the ledger; an already
 * handled row is never re-POSTed. So a crash at any point is safe — re-running
 * skips everything already done and only finishes the remainder, with no
 * duplicates (workouts also collapse on day_key server-side, and the ledger PK
 * guards every entity).
 *
 * Ordering (FK-safe): routines → constraints → profile → workouts → sets.
 *   • sets reference workout_id, so workouts MUST upload first; we capture each
 *     server workout id and re-point sets to it.
 *   • routines/constraints/profile are independent and ordered first so the
 *     longest, riskiest part (sets) is last and resumable.
 *
 * Weight: read EXACT kg via COALESCE(weight_kg, weight_raw/8.0) and send it as
 * `weightKg`; the server re-encodes to its lossy weight_raw (kg×8) — acceptable,
 * the local copy stays exact.
 *
 * The server `sets.exercise_id` is UUID NOT NULL + FK to the global `exercises`
 * catalogue, and the Zod schema rejects non-UUIDs. Bundled / starter-split /
 * free-typed sets have a null, slug, or name there — they are UN-uploadable and
 * are SKIPPED-and-stashed (kept on device), never coerced into a fake UUID.
 *
 * Pure module — NO React/UI. Reads via localDb; uploads via the authed apiClient
 * (the caller guarantees the user is Pro/authenticated for the upload window).
 */

import { localDb } from '../db/localDb';
import { createWorkout } from '../api/workouts';
import { logSet } from '../api/sets';
import { createRoutine, getRoutines, RoutineExercise } from '../api/routines';
import { addConstraint } from '../api/constraints';
import { patchProfile, PatchProfilePayload } from '../api/user';
import { LogSetPayload } from '../types/api';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Public result / progress shapes
// ---------------------------------------------------------------------------

/**
 * Per-run tally. `uploaded` and `skipped` and `failed` count INDIVIDUAL rows
 * across every entity (routines + constraints + profile + workouts + sets);
 * `errors` collects a human-readable line per failed/skipped-on-error row for
 * the summary UI.
 */
export interface MigrationOutcome {
  uploaded: number;
  skipped: number;
  failed: number;
  errors: string[];
}

type ProgressFn = (done: number, total: number) => void;

// ---------------------------------------------------------------------------
// Local row shapes (mirror localSchema.ts)
// ---------------------------------------------------------------------------

interface RoutineRow {
  id: string;
  name: string;
  exercises: string | null; // JSON TEXT
}

interface ConstraintRow {
  constraint_id: string;
  constraint_type: string;
  custom_note: string | null;
}

interface ProfileRow {
  unit_pref: string | null;
  experience_level: string | null;
  weight_class_kg: number | null;
  sex: string | null;
  show_wilks: number | null;
  theme_preference: string | null;
  training_goal: string | null;
  sessions_per_week: number | null;
  session_minutes: number | null;
  goal_weight_kg: number | null;
  equipment_profile: string | null; // JSON TEXT
  season_phase: string | null;
}

interface WorkoutRow {
  id: string;
  day_key: string | null;
  notes: string | null;
  routine_name: string | null;
}

interface SetRow {
  id: string;
  workout_id: string | null;
  exercise_id: string | null;
  kind: string | null;
  set_index: number | null;
  reps: number | null;
  weight_kg: number | null; // exact kg (COALESCE'd in the SELECT)
  rir: number | null;
  duration_sec: number | null;
  distance_m: number | null;
  avg_pace_sec_per_km: number | null;
  metrics_json: string | null;
}

interface LedgerRow {
  server_id: string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Constants / small helpers
// ---------------------------------------------------------------------------

/** Canonical RFC-4122 UUID shape. The server exercise_id must be one of these. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True only for a UUID-shaped id (the server rejects everything else with 400). */
function isCatalogueUuid(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * A 4xx (other than 401) is a PERMANENT validation/constraint rejection — the
 * row can never upload as-is (bad/unknown exercise_id → 400 Zod or 23503 FK,
 * etc.), so we mark it skipped and move on rather than aborting the whole run or
 * retrying forever. 401/5xx/network are TRANSIENT — those re-throw so the run
 * aborts and a later resume retries (the ledger keeps everything already done).
 */
function isPermanentValidationError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  if (status == null) return false; // no response = network/transient
  return status >= 400 && status < 500 && status !== 401;
}

function errLabel(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const body = err.response?.data as { error?: string } | undefined;
    const code = body?.error;
    return code ? `${status} ${code}` : `${status ?? 'network'}`;
  }
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// migration_state ledger access (schema v7; created by the schema migration).
//
// All reads/writes are defensive: the ledger table is owned by the schema layer,
// so we never assume a particular column beyond the documented contract. A
// missing-table error would surface from the very first SELECT — callers run
// localDb.init() (which migrates to v7) before invoking this module.
// ---------------------------------------------------------------------------

/** Look up an already-handled row. Returns null if not yet processed. */
async function ledgerGet(
  entity: string,
  localId: string,
): Promise<LedgerRow | null> {
  return localDb.getFirst<LedgerRow>(
    'SELECT server_id, status FROM migration_state WHERE entity = ? AND local_id = ?',
    [entity, localId],
  );
}

/** Record a row as handled (idempotent via the (entity, local_id) PK). */
async function ledgerPut(
  entity: string,
  localId: string,
  serverId: string | null,
  status: 'done' | 'skipped',
  reason: string | null,
): Promise<void> {
  await localDb.execute(
    `INSERT OR REPLACE INTO migration_state
       (entity, local_id, server_id, status, reason, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entity, localId, serverId, status, reason, nowIso()],
    { tables: ['migration_state'] },
  );
}

// ---------------------------------------------------------------------------
// Exercises JSON parse (routines)
// ---------------------------------------------------------------------------

function parseRoutineExercises(raw: string | null | undefined): RoutineExercise[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({
        exercise_id: e.exercise_id ?? null,
        name: typeof e.name === 'string' ? e.name : '',
        target_sets: typeof e.target_sets === 'number' ? e.target_sets : undefined,
        target_reps: typeof e.target_reps === 'string' ? e.target_reps : undefined,
      }));
  } catch {
    return [];
  }
}

/**
 * Canonical identity key for a routine: name + normalized exercise list.
 * (VERIFY 2026-07-01, Bug 2 refinement): the original dedup keyed on NAME ONLY,
 * but local routine names are NOT unique (no constraint in localSchema, no UI
 * guard) — two distinct local routines named "Push Day" would have collapsed
 * onto one server id and the second one's exercises would silently never reach
 * the server. Keying on name + content keeps the idempotent-replay guarantee
 * (a ledger-lost re-upload of the SAME routine still adopts the server copy)
 * while distinct same-named routines still POST separately.
 *
 * Normalization must survive the server round-trip: the route Zod-parses the
 * payload (unknown keys stripped, optional keys stay absent) and stores jsonb
 * (key order not preserved), so we rebuild each entry with a fixed key order
 * and fold absent/undefined to null. Exercise ORDER is meaningful (an ordered
 * list) and is preserved. If normalization ever misses a server transform the
 * failure mode is a duplicate routine (the pre-fix behaviour) — never data loss.
 */
function canonicalRoutineKey(name: string, exercises: RoutineExercise[]): string {
  const normalized = exercises.map((e) => ({
    exercise_id: e.exercise_id ?? null,
    name: e.name,
    target_sets: typeof e.target_sets === 'number' ? e.target_sets : null,
    target_reps: typeof e.target_reps === 'string' ? e.target_reps : null,
  }));
  // Stringify name + list as one tuple - unambiguous for any name content.
  return JSON.stringify([name, normalized]);
}

/** Parse the JSON-TEXT equipment_profile into the string[] the server expects. */
function parseEquipmentProfile(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string');
    }
  } catch {
    // fall through
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Phase 1 — routines  (POST /routines)
// ---------------------------------------------------------------------------

async function uploadRoutines(out: MigrationOutcome): Promise<void> {
  const rows = await localDb.getAll<RoutineRow>(
    'SELECT id, name, exercises FROM routines ORDER BY created_at ASC',
  );

  // BUGFIX 2026-06-30 (Bug 2): the local `migration_state` ledger is the ONLY
  // thing preventing duplicate routines on a re-run — the server's POST /routines
  // has NO ON CONFLICT / unique constraint, so every POST mints a NEW routine.
  // The ledger normally makes replay a no-op, but it can be lost between the POST
  // succeeding and its ledgerPut committing (app killed mid-run), and a Pro→Free→
  // Pro toggle-back re-enters this path. To make re-upload IDEMPOTENT even without
  // a ledger hit, fetch the routines already on the server ONCE and skip any local
  // routine that already exists there IDENTICALLY — same name AND same exercises
  // (recording the existing server id in the ledger so the set/re-point logic and
  // future runs see it as done). This is
  // a single authed GET during an explicit upgrade — the local-first invariant
  // still holds (former-free user, upgrade window). Best-effort: if the GET fails
  // we fall back to the prior create-guarded-by-ledger behaviour.
  // (VERIFY 2026-07-01 refinement): key on canonicalRoutineKey (name + content),
  // NOT name alone — local names are not unique, and name-only adoption silently
  // dropped the second of two distinct same-named routines. See the helper doc.
  const serverRoutineIdByKey = new Map<string, string>();
  try {
    const existing = await getRoutines();
    for (const r of existing) {
      const key = canonicalRoutineKey(r.name, r.exercises ?? []);
      // First occurrence wins; an exact-duplicate server routine is pre-existing
      // and not something this migration created.
      if (!serverRoutineIdByKey.has(key)) serverRoutineIdByKey.set(key, r.id);
    }
  } catch {
    // Non-fatal: proceed without the dedup map (ledger still guards same-run).
  }

  for (const row of rows) {
    const prior = await ledgerGet('routine', row.id);
    if (prior) {
      // Already handled on a previous run — skip silently (not re-counted).
      continue;
    }

    const exercises = parseRoutineExercises(row.exercises);
    const key = canonicalRoutineKey(row.name, exercises);

    // Idempotency guard: if an IDENTICAL routine (same name + same exercises) is
    // already on the server (from a prior, ledger-lost upload run), adopt its id
    // instead of POSTing a duplicate. Record it as done so this run + future runs
    // treat it as synced. A same-named routine with DIFFERENT content falls
    // through and POSTs — the server allows duplicate names, and preserving both
    // is always safer than collapsing them.
    const existingId = serverRoutineIdByKey.get(key);
    if (existingId) {
      await ledgerPut('routine', row.id, existingId, 'done', null);
      continue;
    }

    try {
      const created = await createRoutine({
        name: row.name,
        exercises,
      });
      await ledgerPut('routine', row.id, created.id, 'done', null);
      // Track the just-created key (built from the LOCAL payload, so same-run
      // dedup is independent of server echo fidelity): two identical local
      // routines in one run don't both POST — the 2nd adopts the 1st's server id.
      serverRoutineIdByKey.set(key, created.id);
      out.uploaded++;
    } catch (err) {
      if (isPermanentValidationError(err)) {
        await ledgerPut('routine', row.id, null, 'skipped', errLabel(err));
        out.skipped++;
        out.errors.push(`routine ${row.id}: ${errLabel(err)}`);
      } else {
        out.failed++;
        out.errors.push(`routine ${row.id}: ${errLabel(err)}`);
        throw err; // transient — abort; resume later picks up from the ledger
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — constraints  (POST /constraints)
// ---------------------------------------------------------------------------

async function uploadConstraints(out: MigrationOutcome): Promise<void> {
  const rows = await localDb.getAll<ConstraintRow>(
    'SELECT constraint_id, constraint_type, custom_note FROM user_constraints ORDER BY created_at ASC',
  );
  for (const row of rows) {
    const prior = await ledgerGet('constraint', row.constraint_id);
    if (prior) continue;
    try {
      const created = await addConstraint({
        constraintType: row.constraint_type,
        ...(row.custom_note != null ? { customNote: row.custom_note } : {}),
      });
      // Server is UNIQUE(user_id, constraint_type) so re-runs are safe; record
      // the server id when present (the route returns the row).
      await ledgerPut('constraint', row.constraint_id, created?.id ?? null, 'done', null);
      out.uploaded++;
    } catch (err) {
      if (isPermanentValidationError(err)) {
        await ledgerPut('constraint', row.constraint_id, null, 'skipped', errLabel(err));
        out.skipped++;
        out.errors.push(`constraint ${row.constraint_id}: ${errLabel(err)}`);
      } else {
        out.failed++;
        out.errors.push(`constraint ${row.constraint_id}: ${errLabel(err)}`);
        throw err;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — profile  (PATCH /user/profile) — single upsert
// ---------------------------------------------------------------------------

/** Build the server PATCH payload from the local single-row profile. */
function profilePatchFor(row: ProfileRow): PatchProfilePayload {
  const payload: PatchProfilePayload = {};
  if (row.unit_pref === 'kg' || row.unit_pref === 'lbs') payload.unit_pref = row.unit_pref;
  if (row.experience_level != null) payload.experience_level = row.experience_level;
  if (row.weight_class_kg != null) payload.weight_class_kg = row.weight_class_kg;
  if (row.sex === 'MALE' || row.sex === 'FEMALE' || row.sex === 'UNDISCLOSED') {
    payload.sex = row.sex;
  }
  if (row.show_wilks != null) payload.show_wilks = row.show_wilks === 1;
  if (
    row.theme_preference === 'deepOcean' ||
    row.theme_preference === 'ember' ||
    row.theme_preference === 'forest' ||
    row.theme_preference === 'midnight' ||
    row.theme_preference === 'monochrome'
  ) {
    payload.theme_preference = row.theme_preference;
  }
  if (row.training_goal != null) {
    payload.training_goal = row.training_goal as PatchProfilePayload['training_goal'];
  }
  if (row.sessions_per_week != null) payload.sessions_per_week = row.sessions_per_week;
  if (row.session_minutes != null) {
    payload.session_minutes = row.session_minutes as PatchProfilePayload['session_minutes'];
  }
  if (row.goal_weight_kg != null) payload.goal_weight_kg = row.goal_weight_kg;
  const equipment = parseEquipmentProfile(row.equipment_profile);
  if (equipment) {
    payload.equipment_profile = equipment as PatchProfilePayload['equipment_profile'];
  }
  if (row.season_phase != null) {
    payload.season_phase = row.season_phase as PatchProfilePayload['season_phase'];
  }
  return payload;
}

async function uploadProfile(out: MigrationOutcome): Promise<void> {
  const prior = await ledgerGet('profile', 'profile');
  if (prior) return; // already synced on a previous run

  const row = await localDb.getFirst<ProfileRow>(
    `SELECT unit_pref, experience_level, weight_class_kg, sex, show_wilks,
            theme_preference, training_goal, sessions_per_week, session_minutes,
            goal_weight_kg, equipment_profile, season_phase
       FROM user_profile WHERE id = 'active'`,
  );
  if (!row) {
    // No local profile to migrate — nothing to do (don't ledger; a profile may
    // be created later, though in practice it's seeded at signup).
    return;
  }

  const payload = profilePatchFor(row);
  if (Object.keys(payload).length === 0) {
    // Profile exists but carries no server-accepted field — mark done so we
    // don't re-check every resume.
    await ledgerPut('profile', 'profile', null, 'done', 'no_server_fields');
    return;
  }

  try {
    await patchProfile(payload);
    await ledgerPut('profile', 'profile', null, 'done', null);
    out.uploaded++;
  } catch (err) {
    if (isPermanentValidationError(err)) {
      await ledgerPut('profile', 'profile', null, 'skipped', errLabel(err));
      out.skipped++;
      out.errors.push(`profile: ${errLabel(err)}`);
    } else {
      out.failed++;
      out.errors.push(`profile: ${errLabel(err)}`);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — workouts  (POST /workouts) — N local rows per day_key collapse to 1
// ---------------------------------------------------------------------------

/**
 * Upload workouts grouped by day_key (the server is idempotent on
 * (user_id, day_key), so N same-day local rows collapse into ONE server row).
 * Returns a map localWorkoutId → serverWorkoutId covering EVERY local id in
 * every group, so the set phase can re-point any set to its server workout.
 */
async function uploadWorkouts(
  out: MigrationOutcome,
): Promise<Map<string, string>> {
  const rows = await localDb.getAll<WorkoutRow>(
    'SELECT id, day_key, notes, routine_name FROM workouts ORDER BY created_at ASC',
  );

  // Group by day_key. Rows with no day_key cannot be uploaded (the server keys
  // on it) — skip-and-stash them so their child sets are skipped too.
  const groups = new Map<string, WorkoutRow[]>();
  const workoutMap = new Map<string, string>();

  for (const row of rows) {
    if (!row.day_key) {
      const prior = await ledgerGet('workout', row.id);
      if (!prior) {
        await ledgerPut('workout', row.id, null, 'skipped', 'no_day_key');
        out.skipped++;
        out.errors.push(`workout ${row.id}: no_day_key`);
      }
      continue;
    }
    const list = groups.get(row.day_key);
    if (list) list.push(row);
    else groups.set(row.day_key, [row]);
  }

  for (const [dayKey, group] of groups) {
    // Resume: has ANY local row in this group already been mapped to a server id?
    let serverWorkoutId: string | null = null;
    for (const w of group) {
      const prior = await ledgerGet('workout', w.id);
      if (prior?.server_id) {
        serverWorkoutId = prior.server_id;
        break;
      }
    }

    if (!serverWorkoutId) {
      // Pick a representative row's notes / routine_name (first non-null).
      const repNotes = group.find((w) => w.notes != null)?.notes ?? undefined;
      const repRoutineName =
        group.find((w) => w.routine_name != null)?.routine_name ?? undefined;
      try {
        const created = await createWorkout(dayKey, repNotes, {
          ...(repRoutineName ? { routineName: repRoutineName } : {}),
        });
        serverWorkoutId = created.id;
        out.uploaded++;
      } catch (err) {
        if (isPermanentValidationError(err)) {
          // The whole day is un-uploadable — stash each local id so its sets skip.
          for (const w of group) {
            const prior = await ledgerGet('workout', w.id);
            if (!prior) await ledgerPut('workout', w.id, null, 'skipped', errLabel(err));
          }
          out.skipped++;
          out.errors.push(`workout ${dayKey}: ${errLabel(err)}`);
          continue;
        }
        out.failed++;
        out.errors.push(`workout ${dayKey}: ${errLabel(err)}`);
        throw err; // transient — abort; resume later
      }
    }

    // Map EVERY local id in the group to the one server id (set re-pointing needs
    // all of them) and record each in the ledger as done.
    for (const w of group) {
      const prior = await ledgerGet('workout', w.id);
      if (!prior || prior.server_id !== serverWorkoutId) {
        await ledgerPut('workout', w.id, serverWorkoutId, 'done', null);
      }
      workoutMap.set(w.id, serverWorkoutId);
    }
  }

  return workoutMap;
}

// ---------------------------------------------------------------------------
// Phase 5 — sets  (POST /sets) — re-pointed to server workout ids
// ---------------------------------------------------------------------------

/** Build the LogSetPayload for a lift/cardio set, or null if its kind is unknown. */
function setPayloadFor(
  row: SetRow,
  serverWorkoutId: string,
): LogSetPayload | null {
  const weightKg =
    row.weight_kg != null ? row.weight_kg : 0; // SELECT already COALESCE'd weight_raw/8

  if (row.kind === 'cardio') {
    return {
      kind: 'cardio',
      workoutId: serverWorkoutId,
      exerciseId: row.exercise_id as string, // guarded by isCatalogueUuid before call
      setIndex: row.set_index ?? 0,
      durationSec: row.duration_sec ?? 0,
      ...(row.distance_m != null ? { distanceM: row.distance_m } : {}),
      ...(row.avg_pace_sec_per_km != null
        ? { avgPaceSecPerKm: row.avg_pace_sec_per_km }
        : {}),
    };
  }

  // Default to lift for 'lift' or any non-cardio kind.
  return {
    kind: 'lift',
    workoutId: serverWorkoutId,
    exerciseId: row.exercise_id as string,
    setIndex: row.set_index ?? 0,
    reps: row.reps ?? 0,
    weightKg,
    // rir: -1 means "not recorded" locally; only send a real value.
    ...(row.rir != null && row.rir !== -1 ? { rir: row.rir } : {}),
  };
}

async function uploadSets(
  out: MigrationOutcome,
  workoutMap: Map<string, string>,
): Promise<void> {
  const rows = await localDb.getAll<SetRow>(
    `SELECT id, workout_id, exercise_id, kind, set_index, reps,
            COALESCE(weight_kg, weight_raw / 8.0) AS weight_kg,
            rir, duration_sec, distance_m, avg_pace_sec_per_km, metrics_json
       FROM sets
      ORDER BY workout_id ASC, set_index ASC`,
  );

  for (const row of rows) {
    const prior = await ledgerGet('set', row.id);
    if (prior) continue; // uploaded or permanently skipped already

    const serverWorkoutId = row.workout_id ? workoutMap.get(row.workout_id) : undefined;
    if (!serverWorkoutId) {
      // The parent workout was skipped (no day_key / un-uploadable) or is absent.
      await ledgerPut('set', row.id, null, 'skipped', 'no_server_workout');
      out.skipped++;
      out.errors.push(`set ${row.id}: no_server_workout`);
      continue;
    }

    // HARD CONSTRAINT: server exercise_id is UUID NOT NULL + FK. A null/slug/name
    // (bundled or free-typed) is un-uploadable — stash it on device, never coerce.
    if (!isCatalogueUuid(row.exercise_id)) {
      await ledgerPut('set', row.id, null, 'skipped', 'non_catalogue_exercise_id');
      out.skipped++;
      continue;
    }

    const payload = setPayloadFor(row, serverWorkoutId);
    if (!payload) {
      await ledgerPut('set', row.id, null, 'skipped', 'unknown_kind');
      out.skipped++;
      out.errors.push(`set ${row.id}: unknown_kind`);
      continue;
    }

    try {
      const created = await logSet(payload);
      await ledgerPut('set', row.id, created.id, 'done', null);
      out.uploaded++;
    } catch (err) {
      if (isPermanentValidationError(err)) {
        // e.g. a UUID-shaped id that is NOT in the catalogue → 400/23503 FK.
        await ledgerPut('set', row.id, null, 'skipped', errLabel(err));
        out.skipped++;
        out.errors.push(`set ${row.id}: ${errLabel(err)}`);
      } else {
        out.failed++;
        out.errors.push(`set ${row.id}: ${errLabel(err)}`);
        throw err; // transient — abort; resume later via the ledger
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Count the total rows to be processed (for the determinate progress bar).
 * Cheap COUNT(*) per table; failures degrade to 0 so progress never blocks.
 */
async function countTotal(): Promise<number> {
  const tables = ['routines', 'user_constraints', 'workouts', 'sets'];
  let total = 0;
  for (const t of tables) {
    try {
      const r = await localDb.getFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`);
      total += r?.n ?? 0;
    } catch {
      // table missing in a stub — ignore
    }
  }
  // +1 for the single profile upsert phase.
  total += 1;
  return total;
}

/**
 * Upload the current user's on-device personal data to the server in FK-safe
 * order, idempotently and resumably (see module header). Best-effort per row:
 * a permanent (4xx) rejection skips that row; a transient (401/5xx/network)
 * failure re-throws so the caller can surface a "tap to resume" and a later
 * re-run finishes the remainder (the ledger guarantees no duplicates).
 *
 * The caller MUST guarantee the user is authenticated for the upload window and
 * MUST run this BEFORE flipping the server tier to 'paid' (so a mid-upload crash
 * leaves the user safely still-free). See AuthContext.upgradeToPro.
 *
 * @param onProgress optional (done, total) callback fired as each row/phase
 *                   completes, for a determinate progress UI.
 * @returns a tally of uploaded / skipped / failed rows plus collected errors.
 */
export async function migrateLocalDataToServer(
  onProgress?: ProgressFn,
): Promise<MigrationOutcome> {
  const out: MigrationOutcome = { uploaded: 0, skipped: 0, failed: 0, errors: [] };

  // Ensure the local schema is at v7 so the migration_state ledger exists.
  await localDb.init();

  const total = await countTotal();
  let done = 0;
  const tick = (n: number): void => {
    done += n;
    onProgress?.(Math.min(done, total), total);
  };

  // Snapshot pre-phase counters so we can advance `done` by the number of rows
  // each phase actually handled (uploaded + skipped + failed), keeping the bar
  // monotonic across resumes (already-ledgered rows aren't re-counted, so the
  // bar simply starts further along on a resume).
  const handled = (): number => out.uploaded + out.skipped + out.failed;

  // Fire an initial progress so the UI shows a determinate bar immediately.
  onProgress?.(0, total);

  let before = handled();
  await uploadRoutines(out);
  tick(handled() - before);

  before = handled();
  await uploadConstraints(out);
  tick(handled() - before);

  before = handled();
  await uploadProfile(out);
  tick(handled() - before);

  before = handled();
  const workoutMap = await uploadWorkouts(out);
  tick(handled() - before);

  before = handled();
  await uploadSets(out, workoutMap);
  tick(handled() - before);

  // Ensure the bar reads complete even if some rows were already ledgered on a
  // prior run (so this run handled fewer than `total`).
  onProgress?.(total, total);

  return out;
}
