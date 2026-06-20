# DB findings
## Summary
Files reviewed: 7 (`localDb.ts`, `localSchema.ts`, `migrations.ts`, `connector.ts`, `powerSyncClient.ts`, `syncEngine.ts`, `__tests__/migrations.test.js`). Counts — P0: 0  P1: 2  P2: 2  P3: 2. The DB layer is architecturally sound — local-first invariant is correctly isolated, weight storage schema is correctly designed — but two real correctness gaps exist: a missing `limit` arg in the PowerSync connector, and the `rawDb` shim silently dropping `opts` from `MigrationDb.execute`, plus two test-coverage gaps and one misleading file name.

---

### [P1] DB-01 — `connector.ts`: `getCrudBatch()` called with zero args, API requires `limit`

- **File:** `mobile/src/db/connector.ts:96`
- **Problem:** `AbstractPowerSyncDatabase.getCrudBatch(limit: number)` declares `limit` as a required argument in `@powersync/common`. The connector calls it with zero arguments. TypeScript confirms this: `00-tsc.txt` line 106 — `TS2554: Expected 1 arguments, but got 0`. At runtime, `SqliteBucketStorage.getCrudBatch` has `limit = 100` as a JS default, so it works today, but if PowerSync ever removes that default the upload loop silently returns `null` and no sets sync to the server for Pro users.
- **Evidence:**
  ```ts
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const batch: CrudBatch | null = await database.getCrudBatch();  // line 96
    if (!batch) return;
  ```
- **Invariant/Rubric:** Rubric P1 — TS2554 type error confirmed in tsc output; silent failure risk if default is ever removed.
- **Suggested direction:** Pass an explicit limit: `await database.getCrudBatch(100)` (the same default `SqliteBucketStorage` uses internally). Confirm the value against PowerSync docs.
- **Confidence:** HIGH

---

### [P1] DB-02 — `localDb.ts`: `rawDb` shim's `execute` drops the `opts` parameter silently

- **File:** `mobile/src/db/localDb.ts:133`
- **Problem:** The `MigrationDb` interface in `migrations.ts` declares `execute(sql, params?, opts?)`. The `rawDb` shim passed to `runMigrations` only accepts two parameters — the third (`opts: { tables?: string[] }`) is silently ignored. This means DDL statements during migration that include `{ tables: ['sets'] }` in `opts` never trigger a `localDb.notify()` call. For migrations this is harmless (no subscribers during init), but the type contract is violated. Because `opts` is declared optional in the interface, TypeScript does not flag this file — the mismatch is invisible to the compiler. If migration statements are ever refactored to rely on opts-driven notifications, the shim will silently suppress them.
- **Evidence:**
  ```ts
  // localDb.ts:133 — rawDb shim, only 2 params:
  execute: async (sql: string, params: unknown[] = []): Promise<void> => {
    await handle.runAsync(sql, params as SQLite.SQLiteBindValue[]);
  },
  // migrations.ts:36 — MigrationDb interface, 3 params:
  execute(sql: string, params?: unknown[], opts?: { tables?: string[] }): Promise<void>;
  ```
- **Invariant/Rubric:** Rubric P1 — interface contract violated silently; not caught by tsc because `opts` is optional.
- **Suggested direction:** Add the `opts` parameter to the `rawDb.execute` shim signature even if it does nothing: `async (sql, params = [], _opts?) => { ... }`. This closes the gap if migrations ever need notification during init, and keeps the types honest.
- **Confidence:** HIGH

---

### [P2] DB-03 — `migrations.test.js`: no test verifies `sets.weight_kg` column added by v3, nor the backfill UPDATE

- **File:** `mobile/src/db/__tests__/migrations.test.js`
- **Problem:** Test 3b verifies v6 guarded ALTERs (`sets.metrics_json`, `user_profile.display_name`) and test 3c verifies v8 survey columns on `user_profile`. But there is no equivalent test for v3: `sets.weight_kg` (the central Invariant 2 column) is never asserted to exist in `db._tableColumns['sets']`, and the backfill `UPDATE sets SET weight_kg = CAST(weight_raw AS REAL) / 8.0 WHERE weight_kg IS NULL ...` is never exercised. If the v3 guarded ALTER is accidentally skipped (e.g., a typo in the column name check), the migration would silently proceed and all weight reads would COALESCE-fallback to `weight_raw/8.0` — which is exactly the lossy behavior v3 was designed to eliminate.
- **Evidence:**
  ```js
  // test 3b covers metrics_json + display_name (v6); test 3c covers v8 survey cols
  // but NO test asserts:
  //   db._tableColumns['sets'].has('weight_kg')    ← not present
  //   backfill UPDATE ran (no rows checked)         ← not present
  ```
- **Invariant/Rubric:** Rubric P2 — test gap against Invariant 2 (weight = exact kg); the most safety-critical column has the least test coverage.
- **Suggested direction:** Add a test case `'fresh install adds sets.weight_kg (v3)'` mirroring the test 3b pattern: assert `db._tableColumns['sets'].has('weight_kg')`. Additionally, extend `makeStubDb` to track UPDATE statements so the backfill can be verified executed with the correct WHERE clause.
- **Confidence:** HIGH

---

### [P2] DB-04 — `localSchema.ts`: v3 backfill runs on every migration retry for that version if killed between ALTER and COMMIT

- **File:** `mobile/src/db/localSchema.ts:487-489`, `migrations.ts:204-228`
- **Problem:** The v3 migration sequence is: (1) guarded ALTER TABLE ADD COLUMN weight_kg — skipped if column exists; (2) UPDATE backfill — always executes as a plain string (no guard). Inside a single transaction, if the app is killed after the ALTER is committed to the journal but before COMMIT sets `user_version = 3`, the next launch re-enters v3, skips the ALTER (column now exists), but re-runs the backfill UPDATE. The `WHERE weight_kg IS NULL` guard makes the re-run a safe no-op for existing rows — so there is no data corruption. However, the test suite's `makeStubDb` does not execute UPDATE statements (it only tracks CREATE and ALTER patterns), so this re-run safety is untested and depends entirely on the WHERE clause being correct. If the WHERE is ever edited incorrectly (e.g., removing the NULL check), all rows could be clobbered on retry.
- **Evidence:**
  ```ts
  export const SCHEMA_V3_STATEMENTS: MigrationStatement[] = [
    { type: 'alter_add_column', table: 'sets', column: 'weight_kg', definition: 'REAL' },
    `UPDATE sets
        SET weight_kg = CAST(weight_raw AS REAL) / 8.0
      WHERE weight_kg IS NULL AND weight_raw IS NOT NULL`,  // re-run safety relies on this clause
  ];
  ```
- **Invariant/Rubric:** Rubric P2 — not a current bug (WHERE clause is correct) but the test suite does not verify this invariant, creating a latent data-loss risk if the UPDATE is ever edited without understanding the retry semantics.
- **Suggested direction:** Make `makeStubDb.execute` track UPDATE statements (at minimum log the SQL) so tests can assert the backfill WHERE clause is present. Alternatively, add a comment directly above the UPDATE in `localSchema.ts` flagging it as "safe to re-run ONLY because of WHERE weight_kg IS NULL — do not remove."
- **Confidence:** MED

---

### [P3] DB-05 — `migrations.ts`: snapshot file named `pf_premigration_v<N>` but is taken POST-migration

- **File:** `mobile/src/db/migrations.ts:12,71`
- **Problem:** The file header says the snapshot is called `pf_premigration_v<N>.json` and is a "pre-migration safety snapshot." But lines 14-16 of the same comment clarify: "the snapshot is taken immediately AFTER the migrations commit." The file is therefore a post-migration snapshot of the new schema state, not a backup of the old data that could be used to roll back. The name `pf_premigration_v8.json` on a user's device stores the state after the v8 migration ran — which is misleading if a developer tries to use it for rollback diagnostics.
- **Evidence:**
  ```ts
  // line 12 (header):  documentDirectory as pf_premigration_v<N>.json
  // line 15-16 (same header): "the snapshot is taken immediately AFTER the migrations commit"
  const uri = `${FS.documentDirectory}pf_premigration_v${version}.json`;  // line 71
  ```
- **Invariant/Rubric:** Rubric P3 — misleading name/comment; not a correctness bug.
- **Suggested direction:** Rename to `pf_postmigration_v${version}.json` (or `pf_snapshot_v${version}.json`) and update the header comment to accurately describe it as a post-migration state snapshot for diagnostic purposes, not a pre-migration backup.
- **Confidence:** HIGH

---

### [P3] DB-06 — `localSchema.ts`: stale file-header comment says schema v2 but file now defines v8

- **File:** `mobile/src/db/localSchema.ts:22`
- **Problem:** The file header comment at line 22 says `Schema v2 (SPEC-094A, 2026-06-12)` but the file now contains v3 through v8 statement arrays. This is harmless but would mislead a new developer scanning the file header for the current schema version.
- **Evidence:**
  ```ts
  // line 22:
  * Schema v2 (SPEC-094A, 2026-06-12): adds personal-data tables for local-first
  * free tier. All v2 tables use TEXT pk id, snake_case cols mirroring server,
  ```
- **Invariant/Rubric:** Rubric P3 — dead/stale comment.
- **Suggested direction:** Update the header comment to note the current schema version (v8 as of 2026-06-19) and reference each version's SPEC tag.
- **Confidence:** HIGH
