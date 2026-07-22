# Lesson L16 — Offline-first architecture: PowerSync, SQLite, and conflict resolution

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Interactive app:** [`L16_offline_sync.html`](L16_offline_sync.html)
> **Estimated time:** ~50 min · **Prerequisite rungs:** L01–L15 (domain + routing + hooks + API)

## 0. Source of truth (read fresh before teaching — code drifts)
- `MyApp/lib/db/OFFLINE_ARCHITECTURE.md` — System overview, data flow, sync rules.
- `mobile/src/db/powerSyncClient.ts` — PowerSync singleton and schema definition.
- `mobile/src/db/connector.ts` — Bridge between PowerSync and Supabase; JWT auth, upload queue.
- `mobile/src/context/PowerSyncContext.tsx` — Provides `db` and sync status to the app.
- `mobile/src/hooks/usePowerSyncLog.ts` — Combines REST init (get workout ID) with PowerSync writes (log sets locally).
- `mobile/src/hooks/usePowerSyncWorkout.ts` — Watch-based live query on the sets table.
- `sync-rules.yaml` — Supabase RLS rules; defines which tables sync to which devices.
- Backend: Supabase database, RLS policies, sync service (PowerSync Cloud).

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Explain the three-tier architecture: React UI → local SQLite → PowerSync Cloud → Supabase Postgres.
- **(L2)** Trace a set logged offline: INSERT into local SQLite → detected by PowerSync → queued for upload → synced when online.
- **(L3)** Implement a conflict resolution rule for a simple case (last-write-wins for a workout name).
- **(L4)** Analyze Peak Fettle's append-only set log design: why last-write-wins is *wrong* for sets, and why an append-only strategy is *right*.
- **(L5)** Evaluate a scenario where two phones log sets offline for the same user, then both sync. Defend Peak Fettle's conflict strategy and identify what could go wrong.

## 2. Pre-lesson survey (M1) — ask LIVE
- "Experience with databases (SQL, transactions, constraints)?"
- "Have you built offline-first features before (e.g., in a mobile app)?"
- "Today: focus on the architectural pattern (local-first sync), or also get hands-on with PowerSync API?"
> Calibrate: SQL comfort level; clarify if the user has done offline work.

## 3. Spacing carry-over (M14)
From L15: "The API client sends requests to the server. For offline-first, we can't rely on the server being reachable. Instead, we write to a local database. Today we'll explore that pattern."

## 4. The difficulty ladder for THIS lesson
1. Local-first architecture: UI talks to SQLite, not the server.
2. The sync layer: PowerSync watches SQLite, uploads changes, downloads new data.
3. Conflict resolution: what happens when two devices write the same row offline?
4. Append-only data: sets, workouts, and records (immutable history).
5. Mutable data: user preferences, streaks, percentiles (last-write-wins conflicts).
6. The hybrid approach: REST for server-owned IDs (workout init), SQLite for client-owned writes (sets).
7. Race conditions and ordering: Lamport clocks, CRDTs, and why Peak Fettle uses a simpler strategy.

## 5. Concept sequence

### Concept 1: The offline-first architecture — three tiers
- **(M4) Generate first:** "You're logging sets in the gym with no Wi-Fi. The app works offline, but the server must eventually see the data. How?"
- **The idea:** Peak Fettle has three tiers:
  1. **React UI** — components, hooks, state (L13–L15). Always talks to tier 2, never to tier 3.
  2. **Local SQLite** — on-device database, owned by PowerSync. Stores a replica of the user's data (and globally-synced data like exercise libraries).
  3. **PowerSync Cloud + Supabase** — server-side; Supabase is Postgres + RLS, PowerSync is a sync service.
  ```
  UI ← watch/query/insert ─► SQLite (on device)
                              ↓ upload (when online)
                              PowerSync Cloud
                              ↓ transform
                              Supabase (Postgres + RLS)
                              ↓ download (when online)
                              SQLite (replicate changes + new data)
  ```
- **(M7) Concrete — logging a set:**
  1. User opens the Log tab offline. `usePowerSyncLog()` mounts.
  2. REST init: `createWorkout(getTodayKey())` — might fail (no network), or might succeed (cached/pre-fetched).
  3. Once workout ID is available, the hook subscribes to the local `sets` table: `db.watch('SELECT * FROM sets WHERE workout_id = ?', [workoutId])`.
  4. User fills in exercise, reps, weight, taps Log.
  5. `logSet()` calls `db.execute('INSERT INTO sets (...) VALUES (...)')` — instant, no network.
  6. PowerSync detects the new row in its write queue. UI re-renders with the new set (no spinner, no "pending" badge).
  7. User exits gym, connects to Wi-Fi.
  8. PowerSync uploads: POST to `connector.uploadData()` → Supabase `/rest/sets` endpoint.
  9. Server validates ownership (RLS), inserts the row into Postgres.
  10. PowerSync's sync stream sees the committed row and downloads it back to the device.
  11. SQLite merges the server's row with the local row (they're the same set, same ID, so it's a no-op).
- **(M6) Elaboration:** Why not write directly to the server? Because the network is unreliable. A SET endpoint call could hang, timeout, or fail silently. The user would see a spinner and get an error. Instead, write locally (instant), and let the sync service handle the network complexity asynchronously.
- **(M3) Retrieval check:** "If a user logs 10 sets offline and then the device runs out of battery before syncing, are the sets lost? Where are they stored?"

### Concept 2: PowerSync — the sync service and schema
- **(M4) Generate first:** "SQLite is local-only. PowerSync must know which tables exist and which columns to sync. How is that defined?"
- **The idea:** PowerSync needs a schema — a list of tables and columns. This schema mirrors the Supabase tables *exactly*. Every table has an `id` primary key (usually UUID), and PowerSync uses it to track which rows it's seen.
- **Real code** (`mobile/src/db/powerSyncClient.ts` — conceptual):
  ```tsx
  import { Table, Column } from '@powersync/common';

  export const schema = new Schema({
    tables: [
      new Table(
        {
          name: 'sets',
          columns: [
            new Column({ name: 'id', type: ColumnType.TEXT }),
            new Column({ name: 'workout_id', type: ColumnType.TEXT }),
            new Column({ name: 'exercise_id', type: ColumnType.TEXT }),
            new Column({ name: 'kind', type: ColumnType.TEXT }), // 'lift' or 'cardio'
            new Column({ name: 'reps', type: ColumnType.INTEGER }),
            new Column({ name: 'weight_raw', type: ColumnType.INTEGER }), // kg × 8
            new Column({ name: 'rir', type: ColumnType.INTEGER }),
            new Column({ name: 'user_id', type: ColumnType.TEXT }),
            new Column({ name: 'created_at', type: ColumnType.TEXT }),
            new Column({ name: 'updated_at', type: ColumnType.TEXT }),
          ],
        },
        { viewName: 'sets_view' } // Optional: for queries
      ),
      // More tables: workouts, exercises, exercise_aliases, streaks, plans, etc.
    ],
  });

  export const db = new PowerSyncDatabase({ schema, dbFilename: 'peakfettle.db' });
  ```
  **Key rule:** Column names in the schema must *exactly* match the Supabase column names. If Supabase has `weight_raw` but the schema says `weight_kg`, the sync will fail.
- **(M6) Elaboration:** Why `weight_raw` instead of `weight_kg`? Because the server stores weight as `INTEGER = kg × 8` (fixed-point arithmetic to avoid floating-point errors in SQL). The client decodes it to `weight_kg` (float) in the hook.
- **(M3) Retrieval check:** "Supabase has a column `created_at TIMESTAMP`. Should the schema column be TEXT, TIMESTAMP, or something else?"

### Concept 3: Sync rules — filtering data per user
- **(M4) Generate first:** "Alice and Bob both use Peak Fettle. When Alice's device syncs, should it download Bob's workouts?"
- **The idea:** Sync rules are SQL queries that define *which* rows a user can see. They're defined in `sync-rules.yaml` and enforce row-level security (RLS). PowerSync uses the rules to know which data to download to each device.
- **Real code** (`sync-rules.yaml` — conceptual):
  ```yaml
  # Sets belong to the user's workouts only
  sets:
    table: sets
    select:
      - id
      - workout_id
      - exercise_id
      - kind
      - reps
      - weight_raw
      - rir
      - user_id
      - created_at
      - updated_at
    where: user_id = {{user_id}}
    # user_id is substituted with the logged-in user's ID at runtime

  # Workouts belong to the user
  workouts:
    table: workouts
    select: [id, user_id, date_key, created_at, updated_at]
    where: user_id = {{user_id}}

  # Exercises are global (everyone sees them)
  exercises:
    table: exercises
    select: [id, name, muscle_group, equipment, difficulty]
    # No where clause — everyone gets all rows

  # Streaks are per-user
  streaks:
    table: streaks
    select: [id, user_id, discipline, streak_days, last_workout_date]
    where: user_id = {{user_id}}
  ```
- **How it works:** When Alice logs in, PowerSync receives her user ID (from the JWT). It substitutes `{{user_id}}` in each rule. Alice's device downloads all `sets WHERE user_id = alice`, all `workouts WHERE user_id = alice`, but *all* exercises (no restriction).
- **(M6) Elaboration:** Sync rules are *independent* of Supabase RLS policies. RLS policies protect the server (no client can fetch data they shouldn't see). Sync rules tell PowerSync what to download. Both should enforce the same access control (usually `WHERE user_id = current_user_id()`).
- **(M3) Retrieval check:** "Peak Fettle has a 'groups' feature where users can see other members' workouts. How would you write a sync rule for that?"

### Concept 4: Append-only data vs. mutable data — conflict resolution strategies
- **(M4) Generate first:** "Two users log the same set offline, then sync. They both have workout ID = `abc-123`, set index = 5. Now there are two rows with the same (workout_id, set_index). What's the conflict?"
- **The idea:** There are two patterns:
  1. **Append-only:** Once written, a row never changes. Conflicts are resolved by keeping all versions (merge). Example: set logs (a history of what was logged).
  2. **Mutable:** A row can be updated. Conflicts resolved by a rule (last-write-wins, CRDT, etc.). Example: workout name, user preferences.
- **Peak Fettle's design:**
  - **Append-only (sets, workouts):** Sets are immutable. Once logged, a set has an `id` (UUID, unique across all devices/users). If two phones log a set offline, they'll generate different IDs, so there's no conflict. When they sync, both sets appear in the database. This is correct — both sets happened.
  - **Mutable (user profile, streaks):** A user's name or streak count can be updated. If two devices update the streak offline, we use last-write-wins: whoever synced later wins. The server stores `updated_at` and uses it to break ties.
- **(M7) Concrete — why append-only is right for sets:**
  ```
  Phone A (offline):
    INSERT INTO sets (id='set-1', workout_id='w1', exercise='Bench', reps=5, weight_kg=80)
  
  Phone B (offline, same user):
    INSERT INTO sets (id='set-2', workout_id='w1', exercise='Squat', reps=3, weight_kg=100)
  
  Both sync:
    - Supabase now has set-1 and set-2 (both rows coexist, no conflict)
    - Both devices get both sets via the sync stream
    - The user sees all 7 sets logged (5 from before, 2 from offline)
  ```
  If we used last-write-wins (mutable semantics):
  ```
  Both rows have the same (workout_id, set_index, user_id) → conflict
  Last-write-wins: keep the set with the highest updated_at → lose data (one set is discarded)
  Wrong!
  ```
- **(M6) Elaboration:** Why are sets append-only? Because a user never *updates* a set (no "edit a logged set" feature). Once logged, it's done. New data is always a new row with a new ID.
- **(M7) Concrete — mutable example (streak count):**
  ```
  Phone A (offline): UPDATE streaks SET streak_days = 10, updated_at = 2026-05-21T18:00:00Z
  Phone B (offline): UPDATE streaks SET streak_days = 15, updated_at = 2026-05-21T18:30:00Z
  
  Both sync:
    - Supabase uses updated_at: 18:30:00 > 18:00:00, so streak_days = 15 wins
    - Both devices download the winning row (streak_days = 15)
  ```
- **(M3) Retrieval check:** "A user updates their profile name on two phones offline. Phone A says 'Alex', Phone B says 'Alexander'. Should the final name be one of these, both, or something else?"

### Concept 5: The connector — uploading writes to Supabase
- **(M4) Generate first:** "When PowerSync detects a new set in the local write queue, how does it get to Supabase? What API does it call?"
- **The idea:** The connector is a bridge that uploads changed rows to Supabase. It:
  1. Watches the local write queue (rows inserted/updated/deleted locally).
  2. Transforms them (e.g., decode `weight_raw` back to `weight_kg`).
  3. POSTs them to the server API (or directly to Supabase REST).
  4. Returns the committed rows to PowerSync (which merges them back into SQLite).
- **Real code** (`mobile/src/db/connector.ts` — conceptual):
  ```tsx
  class PowerSyncConnector extends AbstractPowerSyncConnector {
    async uploadData(database: PowerSyncDatabase): Promise<void> {
      const updates = await database.getNextBatch();

      for (const batch of updates.batches) {
        for (const set of batch.data?.sets ?? []) {
          if (set.op === 'PUT') {
            // Decode weight_raw back to weight_kg
            const weight_kg = (set.weight_raw ?? 0) / 8;

            // POST to server
            try {
              const response = await apiClient.post('/sets', {
                id: set.id,
                workout_id: set.workout_id,
                exercise_id: set.exercise_id,
                kind: set.kind,
                reps: set.reps,
                weight_kg,
                rir: set.rir,
                created_at: set.created_at,
              });

              // Mark as uploaded (send back to PowerSync)
              await database.markAssynced([
                { id: set.id, timestamp: response.data.updated_at }
              ]);
            } catch (err) {
              // Upload failed; leave in queue for retry
              throw err;
            }
          }
        }
      }
    }
  }
  ```
- **Key detail:** The server validates ownership (via RLS). If the user doesn't own the workout, the POST fails with 403, and the row is left in the queue (retry later).
- **(M6) Elaboration:** Why transform `weight_raw`? The server stores it as `INTEGER = kg × 8` to avoid floating-point errors. The client stores it the same way to match the schema, then decodes it when reading or uploading.
- **(M3) Retrieval check:** "If the POST to /sets fails with a 500 error, what happens to the set in the local queue?"

### Concept 6: Offline detection and UI feedback
- **(M4) Generate first:** "The user is offline. They log a set. The UI should show... what? A spinner? A 'pending' badge? No indication?"
- **The idea:** Peak Fettle uses optimistic UI: the set appears instantly, with no "pending" indicator. Once PowerSync syncs (when online), the row is confirmed. If sync fails, an error banner appears.
- **Real code** (from `mobile/src/hooks/useSyncStatus.ts` — conceptual):
  ```tsx
  export function useSyncStatus() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);

    const db = useDB(); // From PowerSyncContext

    useEffect(() => {
      const subscription = db.watchStatus((status) => {
        setIsSyncing(status.isConnecting || status.isSyncing);
        setSyncError(status.lastSyncError ? 'Sync failed, retrying...' : null);
      });

      return () => subscription.unsubscribe();
    }, [db]);

    return { isSyncing, syncError };
  }
  ```
  The Home tab can call `useSyncStatus()` and show a banner: "Syncing..." or "Sync failed (will retry)".
- **(M6) Elaboration:** Why not show "pending" on each set? Because sets are append-only and succeed locally. The upload is a background task. Showing "pending" would confuse the user — the set is already in the database, just not synced yet.
- **(M3) Retrieval check:** "If a set upload fails with a 403 (not owned), should the app retry forever, or show an error and delete the set?"

### Concept 7: Race conditions and Lamport clocks
- **(M4) Generate first:** "Two phones log different sets for the same workout offline, then sync simultaneously. The order they arrive at Supabase might not match the order they were logged. Does that matter?"
- **The idea:** Peak Fettle uses `id` (UUID, per-set) and `set_index` (sequence number per workout). If two sets are logged on different phones at the same moment offline, they get different UUIDs and different set indices. When they sync, there's no ambiguity about order — both sets coexist.
  - If they had the same `set_index`, a conflict would arise (two sets claiming to be "set #5"). Peak Fettle avoids this by making each set's ID unique (UUID, generated client-side) and by not using a global sequence number.
- **Lamport clocks (optional):** A Lamport clock is a counter that ticks on every write. Phone A logs sets with clock=1,2,3. Phone B logs sets with clock=1,2,3. When they sync, A's clock is higher, so A's writes win in conflicts. Peak Fettle doesn't use Lamport clocks because sets are append-only (no conflicts).
- **(M6) Elaboration:** What if Peak Fettle *did* use a global set index (set_index as the primary key)? Then two offline phones could both claim set_index=10. When they sync, a conflict arises: which set is really #10? You'd need a Lamport clock or CRDT to resolve it. Because Peak Fettle uses UUID (per-set), this problem doesn't exist.
- **(M3) Retrieval check:** "Two phones log sets offline. Both upload simultaneously. Could the sets arrive at Supabase in the wrong order? Should the app care?"

### Concept 8: The hybrid approach — REST init + PowerSync writes
- **(M4) Generate first:** "PowerSync syncs entire rows. But the server owns the workout ID. How does a phone know the ID to write sets with?"
- **The idea:** PowerSync syncs *read* data and *write* data separately. It can read data (exercises) without writing. It can write data (sets) without reading. But for sets, you need a workout ID (foreign key). The server owns that ID, so you must ask the server once, then you can write locally.
  - **REST for init:** `createWorkout(getTodayKey())` asks the server "give me today's workout" (or create it). Response: `{ id: 'w-123', ... }`.
  - **PowerSync for writes:** Once you have the ID, `db.execute('INSERT INTO sets ...')` writes locally. PowerSync uploads when online.
- **Why hybrid?** PowerSync is eventually consistent. It might take seconds for a new workout row to sync down. Meanwhile, the user wants to log a set. Solution: ask the server *once* (REST), cache the ID in React state, then write locally.
- **(M7) Concrete — without the REST init:**
  ```
  User opens Log tab offline.
  useWorkout() mounts.
  It tries to subscribe to the local workouts table for today.
  But today's workout hasn't been synced down yet (it's not in the device).
  So there's no row to read.
  User taps to create a set — but where does it go? (No workout_id!)
  ```
  **With REST init:**
  ```
  User opens Log tab offline.
  useWorkout() mounts.
  It calls createWorkout(getTodayKey()) — might fail (no network), might succeed (cached).
  If success: workoutId is set, the local subscribe works (or waits).
  User logs a set → db.execute() succeeds locally.
  When online, PowerSync syncs the set (with the correct workout_id) to the server.
  ```
- **(M3) Retrieval check:** "Why doesn't `usePowerSyncLog` just write a new row to the workouts table if today's workout doesn't exist?"

## 6. Teach-back (M10)
"Explain to a non-technical user: the app works offline by saving your data on your phone first, then sending it to our servers when you have Wi-Fi. If two phones save the same data, we use a fair rule to merge them."

## 7. Cumulative review (M13) — rapid-fire
1. What are the three tiers of Peak Fettle's architecture?
2. Why is `weight_raw` (integer) used instead of `weight_kg` (float)?
3. Explain why sets are append-only but user profiles are mutable.
4. What happens when two phones log sets offline for the same workout?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | In Peak Fettle's offline-first architecture, where is the primary source of truth for a workout's sets? | Identifies local SQLite | The local SQLite database on the device (PowerSync syncs from Supabase, but the device queries SQLite directly) | 8 |
| q2 | L2 | free | Trace the flow: user logs a set offline. Where does the INSERT happen, when does PowerSync upload it, and what happens if the upload fails? | Traces: INSERT → local SQLite, upload when online, failed upload remains in queue and retries | INSERT happens in local SQLite instantly (no network). PowerSync detects it and queues it for upload. When the device is online, connector.uploadData() POSTs to the server. If the POST fails, the row stays in the queue; PowerSync retries with backoff. The UI shows the set immediately (no spinner). | 12 |
| q3 | L3 | free | Write a sync rule for a `user_notes` table where each user can only see their own notes and notes shared by friends. The schema has columns: id, user_id, shared_with (array of user IDs), content. | Correct SQL with RLS logic; handles the array/shared_with column | `where: user_id = {{user_id}} OR shared_with @> ARRAY[{{user_id}}]` (Postgres array operator for "contains"). Sync rule filters to the user's own notes plus notes shared with them. | 12 |
| q4 | L4 | free | Peak Fettle stores sets as append-only (new row = new ID). A mutable data structure (like user preferences) uses last-write-wins. Analyze: why is append-only right for sets, and why would last-write-wins break? | Identifies immutability, no conflict semantics, and UUID uniqueness; contrasts with mutable data | Sets are never edited — once logged, they're final history. Each set gets a unique UUID (client-side). If two phones log sets offline, they generate different IDs, so no conflict (both sets coexist). Last-write-wins would mean: if two phones log a set for the same workout offline, the later-synced one wins, and the earlier one is discarded — losing data. Append-only preserves all logged data. | 18 |
| q5 | L5 | free | Two phones (Alice and Bob) are signed in as the same user offline. Alice logs 5 sets, Bob logs 3 sets. Both phones sync simultaneously. What's the final state: 5 sets, 3 sets, 8 sets, or something else? Why? | Identifies 8 sets as the correct outcome; explains why both devices' writes should succeed | 8 sets. Both devices write to the same SQLite replica (same user, same database). Alice's 5 sets and Bob's 3 sets all INSERT successfully (they have different IDs). When both sync, PowerSync uploads all 8 rows to Supabase. Supabase accepts all (different IDs, no conflict). Both devices' sync streams download all 8 rows. Final state: 8 sets visible on both phones. | 21 |
| q6 | L5 | free | A user's profile name is updated on phone A (to "Alex") and phone B (to "Alexander") while both are offline. Both sync. What's the final name seen on both phones, and why? | Identifies last-write-wins based on updated_at; explains server-side tie-breaking | The name that was updated last (based on `updated_at` timestamp) wins on the server. Let's say phone B updated at 18:30 and phone A at 18:00. Supabase keeps the 18:30 version ("Alexander"). Both devices' sync streams download the same winning row ("Alexander"), so both phones show "Alexander". But one user's edit was silently lost — a trade-off of eventual consistency. | 21 |
| q7 | L6 (opt) | free | Design a "conflict recovery" feature: if two devices edit the same user preference offline and disagree, show the user both versions and let them pick. How would you implement it (schema, sync, UI)? | Identifies need for conflict tracking; proposes schema changes; considers sync complexity | Add a `conflicts` table: `(id, table_name, row_id, version_a, version_b, user_choice)`. On sync, if updated_at is the same (tie), insert a conflict row instead of using last-write-wins. UI watches the conflicts table and shows a modal. User picks version_a or version_b; the app updates the actual row and marks the conflict as resolved. Complex; probably overkill for Peak Fettle. Better: encourage the user to avoid simultaneous edits (e.g., UX that makes it obvious when a setting is being edited). | 21 |

## 9. Custom interactive widget
**Offline sync animator** — a visual simulation of two phones syncing offline and online. User can toggle network, log sets on each phone, and watch the sync flow (local write → queue → upload → Supabase → download back). Shows conflicts and how they're resolved.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: offline-first architecture comprehension; conflict resolution understanding; append-only vs. mutable semantics clarity.
- Offer to schedule L17 (TBD — perhaps database schema + migrations, or testing) in 2–3 days; queue carry-over: "You've now seen the full stack — API client, hooks, local database, and sync. Next we'll explore how the schema is managed and evolved over time."
