# S-DATA findings
## Summary
Files reviewed: 25 (`mobile/src/data/**/*.{ts,tsx}`). Counts — P0:2 P1:2 P2:3 P3:1. The data layer's tier-branching is fundamentally sound — `isLocalFirst`/`syncsToServer` are used consistently, weight reads always use `COALESCE(weight_kg, weight_raw/8.0)`, and no deprecated `user_percentile_rankings`/`percentile_vectors` tables are referenced. The two P0s are: (1) unsanitized column names from backup JSON interpolated into SQL in `restoreBackupToDb`, and (2) a non-atomic delete+re-log in the Pro set-edit path that can silently destroy a set on network failure between the two calls.

---

### [P0] DATA-01 — Unsanitized column names from backup JSON interpolated into SQL in `restoreBackupToDb`

- **File:** `mobile/src/data/backup/exportEngine.ts:226-231`
- **Problem:** `restoreBackupToDb` takes `Object.keys(row)` from each restored table's rows and concatenates them directly into a SQL `INSERT` statement column list without any allowlist validation. The table names are guarded (only `BACKUP_TABLES` members), but column names within rows are not. A crafted backup JSON file containing a key like `"weight_kg, (SELECT 1)"` or SQL-special characters in a column name would be interpolated verbatim. The manual JSON import path in `app/data-export.tsx` (lines 348-368) calls `parseImport` then `restoreBackupToDb` on a user-supplied file entirely outside the crypto layer — no key is required, so any user can trigger this with a hand-crafted file.
- **Evidence:**
```ts
const cols = Object.keys(row);
if (cols.length === 0) continue;
const placeholders = cols.map(() => '?').join(', ');
const values = cols.map((c) => row[c] as unknown);
await db.execute(
  `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`,
  values,
```
- **Invariant/Rubric:** P0 Security — string-interpolated SQL; the CLAUDE.md security grep baseline passed because it searched for `api/*` string-building, not local SQLite. expo-sqlite uses `sqlite3_prepare_v2` which blocks multi-statement injections, but malformed column names can still trigger unexpected SQLite behavior (errors, partial writes, crashes).
- **Suggested direction:** Add a column-name allowlist per table derived from the local schema (or at minimum a regex guard: `^[a-z_][a-z0-9_]*$`) in `parseImport` before returning, so `restoreBackupToDb` never receives unsanitized column names. The allowlist can be a `Record<tableName, Set<columnName>>` constant alongside `BACKUP_TABLES`.
- **Confidence:** HIGH

---

### [P0] DATA-02 — Non-atomic delete+re-log in Pro set-edit path causes silent data loss on network failure

- **File:** `mobile/src/data/setEditing.ts:60-68`
- **Problem:** The Pro path for `updateLiftSet` has no PATCH endpoint, so it deletes the old set then re-logs a new one. These are two independent REST calls with no rollback: if `apiDeleteSet` succeeds but `apiLogSet` fails (network drop, 5xx, timeout), the set is permanently gone from the server with no local record and no error surfaced to the user. The caller in `workout-day.tsx` shows "Saved" on success but the user would need to notice the set vanished and re-add it manually.
- **Evidence:**
```ts
// Pro: no PATCH route — replace the row (delete + re-log at same set_index).
await apiDeleteSet(edit.id);
await apiLogSet({
  kind: 'lift',
  workoutId: edit.workoutId,
  exerciseId: edit.exerciseId,
  setIndex: edit.setIndex,
  reps: edit.reps,
  weightKg: edit.weightKg,
  ...(edit.rir != null ? { rir: edit.rir } : {}),
});
```
- **Invariant/Rubric:** P0 Data integrity — destructive write without rollback/guard. The rubric explicitly flags "overwriting local edits" and "destructive writes without guards."
- **Suggested direction:** Either (a) add a `PATCH /sets/:id` server endpoint (preferred), or (b) re-log first and only delete the old set on success (`newSet = await apiLogSet(...)` then `await apiDeleteSet(edit.id)`) — this way, a failure between the two steps leaves a duplicate rather than a gap, which is far less harmful. The caller should catch the error and show a failure toast rather than swallowing it silently.
- **Confidence:** HIGH

---

### [P1] DATA-03 — `profile.ts:loadLocalProfile` uses string-interpolated `WHERE id = '${ROW_ID}'` instead of a parameterized query

- **File:** `mobile/src/data/profile.ts:292-299`
- **Problem:** `loadLocalProfile` builds two SQL strings with `WHERE id = '${ROW_ID}'` (literal string interpolation) rather than a parameterized `WHERE id = ?`. `ROW_ID` is the module-level constant `'active'` — not user-supplied — so there is no immediate injection risk, but it violates the parameterized-SQL invariant the CLAUDE.md security greps check for, and sets a pattern that breaks if `ROW_ID` is ever made dynamic. Every other local query in the codebase uses `?` bindings.
- **Evidence:**
```ts
row = await localDb.getFirst<Record<string, unknown>>(
  `SELECT ${extended} FROM user_profile WHERE id = '${ROW_ID}'`,
);
```
- **Invariant/Rubric:** P1 — inconsistency with parameterized-SQL invariant; the security-grep baseline likely missed this because it looks for `${}` with user-facing variables, not module constants.
- **Suggested direction:** Replace both template-literal `WHERE id = '${ROW_ID}'` calls with `WHERE id = ?` and pass `[ROW_ID]` as the params array, consistent with every other `localDb` call in the file.
- **Confidence:** HIGH

---

### [P1] DATA-04 — `routineHistory.ts` Pro path makes two unbounded `GET /workouts` calls (one per function) with no pagination or caching

- **File:** `mobile/src/data/routineHistory.ts:70, 130`
- **Problem:** Both `getRoutineFolders` and `getRoutineSessions` independently call `apiClient.get<ApiWorkoutRow[]>('/workouts')` for Pro users. These are two separate full-list fetches with no shared cache, so a single screen load that calls both (the routine-history screen does) issues two identical full-list requests. For a Pro user with years of data this is two large payloads on every visit. Additionally, neither result is typed defensively — `res.data` is cast as `ApiWorkoutRow[]` but no shape validation is performed; if the server returns a paginated object instead of a flat array, `Array.isArray(res.data)` on line 71 silently degrades to an empty list with no error surfaced.
- **Evidence:**
```ts
// getRoutineFolders Pro path
const res = await apiClient.get<ApiWorkoutRow[]>('/workouts');
const rows = Array.isArray(res.data) ? res.data : [];
// ...
// getRoutineSessions Pro path (separate call)
const res = await apiClient.get<ApiWorkoutRow[]>('/workouts');
```
- **Invariant/Rubric:** P1 — floating `any` / response typing gap; P2 — unnecessary duplicate network requests. Classified P1 because the silent empty-result on a shape mismatch can hide a broken feature.
- **Suggested direction:** Extract a `fetchProWorkouts()` helper that caches the result for the lifetime of a screen visit (a `useRef`-held promise or module-level cache with a short TTL), so both callers share one request. Add an `Array.isArray` guard with a logged warning before using the data.
- **Confidence:** HIGH

---

### [P2] DATA-05 — `exerciseNames.ts` calls `getExercises()` (a REST endpoint) for free users without checking the tier

- **File:** `mobile/src/data/exerciseNames.ts:97-151`
- **Problem:** `ensureExerciseCatalogCached` fetches the full exercise catalogue via `getExercises()` (which calls `GET /exercises`) for any user, including free/local-first users. The brief notes that the ONE allowed network call on the free path is the group weekly-signal, and that `GET /exercises` is a global catalogue endpoint with no auth requirement (confirmed in `server/routes/exercises.js:126` — "no auth required"). Since the endpoint is non-personal and truly global, this is technically allowed, but it violates the spirit of the documented rule and was likely the source of a past "allowed vs not allowed" confusion. Notably, the CLAUDE.md states "Group weekly-signal is the ONE network call allowed on the free path" — the exercise-catalogue fetch is a second allowed call that is not documented as such.
- **Evidence:**
```ts
// No tier check before the network call
let library;
try {
  library = await getExercises();
} catch {
  return; // offline / server down — leave cache as-is
}
```
- **Invariant/Rubric:** P2 — ambiguous with Invariant 1; technically safe (non-personal, no-auth endpoint) but undocumented exception to the stated rule.
- **Suggested direction:** Add a comment in `ensureExerciseCatalogCached` explicitly noting that `GET /exercises` is a global, non-auth, non-personal endpoint and is intentionally allowed on the free path (alongside the group weekly-signal). Update CLAUDE.md to list both allowed free-path calls.
- **Confidence:** MED (endpoint is confirmed non-personal; issue is documentation gap not a functional bug)

---

### [P2] DATA-06 — `backupManager.ts:getStatus` makes a REST call to `/user/backup-blob/status` unconditionally, but is called from the backup settings screen for all users

- **File:** `mobile/src/data/backup/backupManager.ts:229-253`
- **Problem:** `getStatus()` always calls `apiClient.get('/user/backup-blob/status')`. This is specifically a backup-subsystem endpoint (free-tier blob backup), so calling it is expected for free users. However, if `getStatus` is ever called for a Pro user (who uses server sync, not blob backup), this is a spurious personal REST call. No tier check is performed inside the function. The function is not gated by `usesBlobBackup` at the call site in `data-export.tsx`.
- **Evidence:**
```ts
export async function getStatus(): Promise<BackupStatus> {
  const lastLocalAt = await AsyncStorage.getItem(LAST_BACKUP_AT_KEY);
  let server: BackupStatus['server'] = null;
  try {
    const res = await apiClient.get<{ exists: boolean; updated_at: string | null; bytes: number }>(
      '/user/backup-blob/status',
    );
```
- **Invariant/Rubric:** P2 — minor tier-check gap; not a full Invariant 1 violation since the endpoint is blob-backup-specific (not general personal data), but the function should document its tier precondition or add a guard.
- **Suggested direction:** Add a `user: TierUser` parameter to `getStatus()` and return early when `!usesBlobBackup(user)`. Alternatively, document at the call site in `data-export.tsx` that the screen is only shown to free users.
- **Confidence:** MED

---

### [P2] DATA-07 — `routines.ts:rowToRoutine` calls `new Date().toISOString()` as a fallback for `created_at`/`updated_at` on rows that legitimately have null timestamps

- **File:** `mobile/src/data/routines.ts:68-77`
- **Problem:** `rowToRoutine` substitutes the current timestamp when `created_at` or `updated_at` is null. If a routine was inserted without timestamps (possible if the INSERT had a bug or the schema migration was partial), every read of that routine returns an ever-changing `created_at`/`updated_at` equal to "now." This means two reads of the same routine return different timestamps — the `getLastPerformedMap` comparison logic and any sort-by-updated_at could behave non-deterministically. It also means a routine with a missing timestamp appears "just updated" on every read.
- **Evidence:**
```ts
function rowToRoutine(row: RoutineRow): Routine {
  const now = new Date().toISOString();
  return {
    id: row.id,
    // ...
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}
```
- **Invariant/Rubric:** P2 — non-deterministic state; can cause incorrect sort order and misleading UI timestamps for any routine with a null timestamp.
- **Suggested direction:** Substitute a fixed sentinel like `'1970-01-01T00:00:00.000Z'` (epoch) for null `created_at` and `updated_at`, so the value is stable across reads. Alternatively, enforce NOT NULL in the local schema and fill with the genId timestamp on INSERT.
- **Confidence:** HIGH

---

### [P3] DATA-08 — `migrateToPro.ts` does not migrate the v8 expanded-survey fields (`primary_focus`, `injuries`, `muscle_priorities`, `bodyweight_kg`, `training_days`, `birth_date`) added to `profile.ts`

- **File:** `mobile/src/data/migrateToPro.ts:356-391` and `mobile/src/data/profile.ts:55-67`
- **Problem:** `uploadProfile` reads only the pre-v8 columns (`unit_pref`, `experience_level`, `weight_class_kg`, `sex`, `show_wilks`, `theme_preference`, `training_goal`, `sessions_per_week`, `session_minutes`, `goal_weight_kg`, `equipment_profile`, `season_phase`). The six v8 fields added by the training-engine survey (`primary_focus`, `injuries`, `muscle_priorities`, `bodyweight_kg`, `training_days`, `birth_date`) are present in `user_profile` (schema v8, persisted by `saveProfile`) but silently omitted when a free user upgrades to Pro. The server PATCH contract does include these fields (per `profile.ts:52-53`), so they would be accepted, but they are never sent.
- **Evidence:** `migrateToPro.ts:357-360` SELECT list vs. `profile.ts:55-67` ProfilePayload v8 fields — the migration SELECT and `profilePatchFor` never reference the six new columns.
- **Invariant/Rubric:** P3 — dead/incomplete code path; a user who fills out the full training survey as a free user and then upgrades loses their survey answers server-side (they exist on-device but never sync to Pro).
- **Suggested direction:** Extend the `ProfileRow` interface in `migrateToPro.ts` to include the v8 columns, add them to the SELECT in `uploadProfile`, and extend `profilePatchFor` to map them into the server payload (encoding arrays as their JS arrays, since the server PATCH accepts them). This is additive and safe.
- **Confidence:** HIGH
