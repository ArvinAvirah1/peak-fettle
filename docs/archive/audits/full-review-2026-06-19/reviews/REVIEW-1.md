# REVIEW-1 — Opus semantic/regression review (read-only)

Branch: `fix/full-review-2026-06-19`. Scope: 5 just-applied fixes. Parse-sweep + tsc already verified by the gate; this review is semantic correctness only.

---

## mobile/src/api/client.ts + mobile/src/context/AuthContext.tsx — API-01 / SCORE-01 (Invariant 5) — **PASS**

`isDefinitiveAuthFailure` (client.ts:82) is correct:
- No-response (network error / timeout / offline): `err.response` is `undefined` → `status` is not a number → returns `false`. Correct — token kept. (client.ts:86-91)
- Exactly `401`: returns `true`. (client.ts:93-95)
- Other `4xx` (400-499): returns `true` only if the body string matches `/invalid|revoked|expired/i`, after coalescing `data` as string → `data.error` → `data.message` → `JSON.stringify`. Correct and reasonably defensive. (client.ts:99-118)
- `5xx` and everything else: returns `false`. Correct — transient, token kept. (client.ts:120-121)

Both sites use the shared predicate:
- 401 interceptor `catch(err)` only calls `_authHandlers.onLogout()` when `isDefinitiveAuthFailure(err)` (client.ts:214-216). The error reaching this catch is the raw axios error from `_doRefresh` → `axios.post('/auth/refresh')` (client.ts:226-240), which is unwrapped and carries `.response`, so the predicate sees the real status. Correct.
- Bootstrap `catch` computes `definitiveAuthFailure = isDefinitiveAuthFailure(err)` and only clears on `true` (AuthContext.tsx:407, 418). The bootstrap error source is `AuthApi.refreshTokens` → `axios.post` (auth.ts:84-90), also unwrapped, so a genuine 401 there carries `.response.status === 401`. A `refresh_timeout` is a plain `Error` with no `.response` → `false` → token kept. Correct.

Genuine-401 path still refreshes-once-then-logs-out: interceptor gates on `error.response?.status !== 401 || originalRequest._retried` (client.ts:172) and sets `_retried = true` before the refresh (client.ts:189). So a 401 triggers exactly one refresh; if that refresh itself 401s, `isDefinitiveAuthFailure` is true → logout. A second 401 on the retried request short-circuits on `_retried`. Correct.

Refresh single-flight intact: `_refreshPromise` dedup (client.ts:198-203) is unchanged by this diff; the `.finally(() => _refreshPromise = null)` still resets it. No regression.

`axios` import removed from AuthContext (replaced by the shared helper) — no remaining `axios.*` references in that file's changed region; the dead `axios.isAxiosError` local classifier was fully deleted. Good.

Note (not a defect): the `onLogout` bootstrap-suppression guard (`bootstrappingRef`, AuthContext.tsx:318) still protects a racing Pro 401 during cold start, which is the complementary half of Invariant 5 and remains in place.

---

## mobile/src/data/backup/exportEngine.ts — DATA-01 — **PASS**

Column-name allowlist blocks injection BEFORE any SQL, on the manual-import path:
- `sanitizeRowColumns(table, row)` (exportEngine.ts) returns `{}` for an unknown table and otherwise keeps only keys present in `COLUMN_ALLOWLIST[table]`. An injected column key (e.g. `"id) ; DROP TABLE …"`) is not in any allowlist Set → dropped. Returns a fresh object (no mutation of the imported doc). Correct.
- `parseImport` now filters non-object rows and maps every row through `sanitizeRowColumns` per table (pre-write validation). (exportEngine.ts parseImport block)
- `restoreBackupToDb` re-sanitizes at the SQL-composition site: `safeRow = sanitizeRowColumns(t, row)`, then `cols`/`values` derive from `safeRow`, so the interpolated `${cols.join(', ')}` can only contain allowlisted identifiers — defense in depth even if a caller bypasses `parseImport`. Values remain parameterized via `?` placeholders + `values` array (unchanged). Correct.

Legit columns not dropped: the allowlist mirrors the local schema including versioned ALTER-added columns (`weight_kg` v3, `metrics_json` v6, `routine_name` v4, the v8 profile columns, etc.). Table set matches `BACKUP_TABLES` iteration. No legitimate column is excluded that I can see.

Minor residual risk (NOT P0/P1, no action required this pass): the table name `t` itself is still interpolated into `DELETE FROM ${t}` / `INSERT INTO ${t}`, but `t` only ever comes from the hardcoded `BACKUP_TABLES` loop (never from the imported doc), so it is not attacker-controlled — safe. The one maintenance hazard is the comment's own caveat: the allowlist is hand-duplicated rather than imported from `localSchema.ts`, so a future column added to the schema but not here would be silently dropped from restores. Acceptable for a security boundary; worth a lint/test later but not blocking.

---

## mobile/app/progress.tsx + mobile/app/workout-day.tsx — A4-02 / A4-04 (Invariant 2) — **PASS**

Every weight read resolves `weight_kg ?? (weight_raw != null ? weight_raw/8 : 0)`:
- progress.tsx: `setKg` helper (175) implements the COALESCE; `epley` now takes kg directly; volume and e1RM both route through `setKg` (fetchProgressData). The local-aggregation path (302) uses the same `weight_kg != null ? … : weight_raw/8` form. `ApiSet` type updated to `weight_kg: number` + optional `weight_raw?`. No bare `weight_raw/8` without fallback remains (grep confirms only the two guarded sites + a doc comment).
- workout-day.tsx: `rawToKg` replaced by `setKg` (119) with the same COALESCE; `computeE1rm` takes kg; `setVolumeKg` (123) now gates on `kind/reps` then `setKg`; `SetRow` lift path (415) uses `setKg(set)`; best-set loop (582) uses `setKg`. Local-row mapper (329) preserves `weight_kg` and falls back to `weight_raw/8`. No bare `weight_raw/8` without fallback remains.

Local-SQLite paths that legitimately carry `weight_kg` still work: `setKg` prefers `weight_kg` first in both files, so a local row with exact kg is read exactly (no lossy /8). A `null`/absent both-fields row yields `0`, matching the documented COALESCE semantics. Correct.

Behavior note (benign): `setVolumeKg` previously early-returned on falsy `weight_raw`; it now early-returns on falsy resolved `kg`. A set with `weight_kg === 0` still yields 0 volume — same outcome. No regression.

---

## mobile/app/exercise-library.tsx — A4-01 (Invariant 1) + A4-03 (Invariant 2) — **PASS**

A4-01 — free path makes NO personal REST call:
- `loadSets()` branches on `isLocalFirst(user)` (610). `user` comes from `useAuth()` (544); `isLocalFirst` returns true for `!is_paid`. Free users read from on-device SQLite via `localDb.init()` → `localDb.getAll(SELECT … FROM sets WHERE exercise_id = ? AND kind = 'lift' ORDER BY logged_at DESC LIMIT ?)` with parameterized binds — no `apiClient.get('/sets')`. Pro users keep the server fetch. The effect deps now include `user` (665) so the branch re-resolves if tier loads in. Correct.
- Mapping to `SetRecord` keeps `weight_kg` (→ `undefined` when null) and `weight_raw ?? 0`, so the existing `setKg`/`decodeKg` consumers resolve exact kg first. The `SetRecord.weight_raw: number` required field is satisfied by the `?? 0` fallback. No type hole.

A4-03 — goal weight via displayToKg / kgToInputValue on BOTH write and prefill:
- Write: `handleSaveGoal` uses `parseWeightInput(goalWeight)` (returns `null` on invalid → guarded), then `displayToKg(displayW, unitPref)` and stores `kg` (572-578). `unitPref` added to deps. Correct — lbs entry is converted to kg before storage (fixes the 185 lb → 185 kg class of bug).
- Prefill: edit button sets `setGoalWeight(kgToInputValue(goal.target_weight_kg, unitPref))` (1004) — stored kg → display unit string. Correct round-trip.
- Display: `formatWeight(goal.target_weight_kg, unitPref, 0)` (989) replaces the hardcoded `… kg`. Placeholder/accessibility label now reflect `unitPref`. Correct.

All `units.ts` signatures verified `(value, unitPref[, decimals])` and used positionally-correctly.

---

## Summary

| File | Verdict |
|---|---|
| client.ts + AuthContext.tsx (API-01/SCORE-01) | **PASS** |
| exportEngine.ts (DATA-01) | **PASS** |
| progress.tsx + workout-day.tsx (A4-02/A4-04) | **PASS** |
| exercise-library.tsx (A4-01/A4-03) | **PASS** |

No P0 or P1 concerns. One non-blocking maintenance note: the DATA-01 allowlist is hand-duplicated from `localSchema.ts` and could silently drop a future schema column from restores — worth a guard test, not a blocker.
