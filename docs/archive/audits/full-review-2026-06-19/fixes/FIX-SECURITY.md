# FIX-SECURITY — DATA-01 (P0): backup-JSON column-name SQL injection

Branch: fix/full-review-2026-06-19
Finding: DATA-01 (SYNTH-1.md) — the restore/import path interpolated `Object.keys(row)`
(column names from an imported backup JSON) directly into `INSERT ... (cols)` SQL. The
manual-import path (`mobile/app/data-export.tsx`) has NO crypto/signature barrier, so a
hand-crafted backup file could inject arbitrary SQL via a malicious column name.

## Files changed
- `mobile/src/data/backup/exportEngine.ts`  (+127 / -4)
- `mobile/src/data/backup/backupManager.ts`  — NOT changed (see note below)

## Fixes
- Added a per-table column allowlist `COLUMN_ALLOWLIST` derived from the on-device schema
  (`mobile/src/db/localSchema.ts`: every CREATE TABLE column + the guarded ALTER ADD COLUMN
  columns from SCHEMA_V3..V8 — sets.weight_kg/metrics_json, workouts.routine_name, the
  user_profile v6/v8 cols) and a `sanitizeRowColumns(table,row)` helper that keeps only
  allowlisted keys (unknown/injection keys dropped; unknown table -> {} fail-safe).
- `parseImport` now strips every non-allowlisted column (and drops non-object rows) BEFORE
  any DB write — this is the entrypoint the manual-import path uses, so the crafted-file
  vector is closed before SQL is ever composed. Values stay parameterized as before.
- `restoreBackupToDb` re-sanitizes column names at the SQL-composition site (defense in
  depth) so the INSERT is injection-safe even if a caller bypasses parseImport.

## Why backupManager.ts was not edited
Both restore entrypoints route through the now-hardened functions: the manual import
(`data-export.tsx` -> parseImport -> restoreBackupToDb) and the cloud restore
(`backupManager.restoreFromCloud` -> parseImport -> restoreBackupToDb). Neither composes
SQL itself, so the single-site fix in exportEngine.ts covers every caller. Export format
and schema version are unchanged (import-path hardening only).

## Verification (run in-sandbox)
- `node mobile/__tests__/backup-export.test.js` -> ALL EXPORT-ENGINE TESTS PASS (10/10).
- `@babel/parser` parse of exportEngine.ts -> OK; full transpile+eval exposes all 8 exports
  (the original file was truncated mid-`MIGRATIONS` on disk by a mount write-corruption and
  was reconstructed from the pristine `git show HEAD:` blob with the 4 edits re-applied via
  bash, then re-verified — Edit/Write tool truncation, see CLAUDE.md / MEMORY).
- Added injection test (11/11 PASS): a `"id) VALUES (1); DROP TABLE sets; --"` column is
  dropped by both parseImport and restoreBackupToDb; the composed SQL is
  `INSERT INTO sets (id, reps) VALUES (?, ?)` with no payload; legit columns preserved;
  unknown table -> {}.

## Concern
- The allowlist is a hand-maintained mirror of localSchema.ts (importing the DDL strings
  broke the test harness's bespoke TS loader, and a stricter reviewed list is preferable for
  a security boundary). If a backed-up column is later added to localSchema.ts it must be
  added to COLUMN_ALLOWLIST too, or legitimate data for that column will be silently dropped
  on restore. Comment in-file flags this; consider a unit test that diffs the two.
