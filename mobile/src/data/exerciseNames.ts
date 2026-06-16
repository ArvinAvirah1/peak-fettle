/**
 * exerciseNames — local-first exercise name resolution.
 *
 * The server `sets` row only stores `exercise_id` (a UUID). Free/local-first
 * users have no server library loaded on Home/history, so Recent Activity and
 * Recent PRs were rendering raw UUIDs (e.g. "2b8d9443-…") instead of names.
 *
 * This module keeps a small on-device `exercise_names` (id → name) cache:
 *   • rememberExerciseName / rememberExerciseNames — called the moment a name is
 *     known (picker select, routine/template start, logging) so EVERY future set
 *     resolves with zero network.
 *   • ensureExerciseCatalogCached — best-effort, throttled backfill from
 *     GET /exercises (a GLOBAL, non-personal catalogue — same category as the
 *     templates the RoutineStrip already fetches for free users) so sets logged
 *     BEFORE this cache existed also resolve. Never throws, never blocks.
 *   • getExerciseNameMap — read the cache as a Map for the history hooks.
 *
 * displayExerciseName() is the single fallback policy: a known name, else a
 * neutral "Exercise" — never a 36-char UUID.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { localDb } from '../db/localDb';
import { getExercises } from '../api/exercises';
import { Exercise } from '../types/api';

const CATALOG_CACHE_TS_KEY = '@peak_fettle/exercise_catalog_cached_at';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000; // refresh at most once/day

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `name` is a usable display name (non-empty, not just the id echoed). */
function isRealName(id: string, name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === id) return false; // legacy id→id map sentinel
  return true;
}

/** Remember a single id→name (idempotent upsert). No-ops on blank input. */
export async function rememberExerciseName(
  exerciseId: string | null | undefined,
  name: string | null | undefined,
): Promise<void> {
  if (!exerciseId || !isRealName(exerciseId, name)) return;
  try {
    await localDb.execute(
      `INSERT INTO exercise_names (exercise_id, name, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(exercise_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
      [exerciseId, name!.trim(), new Date().toISOString()],
      { tables: ['exercise_names'] },
    );
  } catch {
    // best-effort cache — never surface to the UI
  }
}

/** Remember many id→name pairs (e.g. all exercises in a started session). */
export async function rememberExerciseNames(
  pairs: Array<{ exerciseId: string | null | undefined; name: string | null | undefined }>,
): Promise<void> {
  for (const p of pairs) {
    // Sequential is fine — expo-sqlite serialises anyway and these are tiny.
    await rememberExerciseName(p.exerciseId, p.name);
  }
}

/** Read the full id → name cache as a Map. Empty map on any failure. */
export async function getExerciseNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    await localDb.init();
    const rows = await localDb.getAll<{ exercise_id: string; name: string }>(
      'SELECT exercise_id, name FROM exercise_names',
    );
    for (const r of rows) {
      if (isRealName(r.exercise_id, r.name)) map.set(r.exercise_id, r.name);
    }
  } catch {
    // best-effort
  }
  return map;
}

// Coalesce concurrent callers (Home mount + useWorkoutHistory + workout-day can
// all fire on the same frame) onto a single in-flight fetch/backfill.
let catalogInFlight: Promise<void> | null = null;

/**
 * Best-effort backfill of the name cache from the global exercise catalogue.
 * Throttled to once per CATALOG_TTL_MS via AsyncStorage so it costs at most one
 * network call per day. Fully swallowed — offline / server-down is a no-op and
 * the caller continues with whatever names are already cached.
 */
export async function ensureExerciseCatalogCached(): Promise<void> {
  if (catalogInFlight) return catalogInFlight;
  catalogInFlight = doEnsureExerciseCatalogCached().finally(() => {
    catalogInFlight = null;
  });
  return catalogInFlight;
}

async function doEnsureExerciseCatalogCached(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CATALOG_CACHE_TS_KEY);
    const last = raw ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(last) && last > 0 && Date.now() - last < CATALOG_TTL_MS) {
      return; // cached recently — skip the fetch
    }
  } catch {
    // ignore — fall through and try once
  }

  let library;
  try {
    // Short timeout so this background backfill never contributes to lag.
    library = await getExercises();
  } catch {
    return; // offline / server down — leave cache as-is
  }

  try {
    const pairs: Array<{ exerciseId: string; name: string }> = [];
    for (const category of Object.values(library.exercises ?? {})) {
      for (const ex of category as Exercise[]) {
        if (ex?.id && isRealName(ex.id, ex.name)) pairs.push({ exerciseId: ex.id, name: ex.name });
      }
    }
    // Chunked multi-row UPSERT — the catalogue can be hundreds of rows, so a
    // per-row loop would be hundreds of native round-trips. 200 rows × 3 params
    // = 600, comfortably under SQLite's host-parameter limit.
    const now = new Date().toISOString();
    const CHUNK = 200;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const chunk = pairs.slice(i, i + CHUNK);
      const valuesSql = chunk.map(() => '(?, ?, ?)').join(', ');
      const params: unknown[] = [];
      for (const p of chunk) params.push(p.exerciseId, p.name, now);
      await localDb.execute(
        `INSERT INTO exercise_names (exercise_id, name, updated_at) VALUES ${valuesSql}
         ON CONFLICT(exercise_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
        params,
        { tables: ['exercise_names'] }
      );
    }
    await AsyncStorage.setItem(CATALOG_CACHE_TS_KEY, String(Date.now()));
  } catch {
    // best-effort
  }
}

/**
 * Resolve an exercise_id to a display name using a prebuilt map, never returning
 * a raw UUID. Unknown ids → a neutral "Exercise" label.
 */
export function displayExerciseName(
  exerciseId: string,
  map: Map<string, string>,
): string {
  const name = map.get(exerciseId);
  if (isRealName(exerciseId, name)) return name!;
  // Don't surface a UUID; a short non-uuid id (rare) can pass through.
  if (exerciseId && !UUID_RE.test(exerciseId) && exerciseId.length <= 24) return exerciseId;
  return 'Exercise';
}
