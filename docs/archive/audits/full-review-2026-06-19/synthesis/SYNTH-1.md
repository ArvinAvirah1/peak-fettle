# SYNTH-1 — Data integrity · DB · math · local-first / weight-kg invariants
_Opus Synthesizer 1 · full-review-2026-06-19 · lane: S-DATA, S-DB, S-LIB, A4, A6_

## (a) Lane summary

I verified every P0/P1 across the five findings files by opening the cited source and tracing the data flow, and the lane holds up well: the data layer's tier-branching, the local-first SQLite reads, and the percentile math are fundamentally sound. The most important result is that the **server `GET /sets` contract is stronger than two finders assumed** — `normalizeSet` (`server/routes/sets.js:35-36`) *strips* `weight_raw` and returns only a derived `weight_kg`, which **escalates** the Pro-path weight bugs (A4-02, A4-04): they don't read a "lossy" value, they read `undefined`, so Pro volume/PR analytics are silently `NaN`/0, not merely imprecise. The genuinely dangerous, broadly-reachable bugs are the SQL-injection-via-backup-JSON (DATA-01, reachable by any user through manual import with no key), the lbs-stored-as-kg goal write (A4-03, `SYSTEMIC:weight-kg`), the free-user tier breach in the exercise-library set-history modal (A4-01, `SYSTEMIC:tier-breach`), and the `NaN`/silent-zero math gaps (LIB-01, LIB-02). I dropped/downgraded 4 findings (A6-01 is UI-flow-guarded, A6-05 is a confirmed non-bug, A4-11 is explicitly "no bug today", DATA-05 is a documentation nit), and corrected the mechanism (not the existence) of A4-02 and A4-04.

## (b) Verified findings — severity-ranked

| ID | Sev | file:line | Systemic | One-line problem |
|----|-----|-----------|----------|------------------|
| DATA-01 | **P0** | `src/data/backup/exportEngine.ts:226-231` | — | Column names from user-supplied backup JSON interpolated into `INSERT` SQL; reachable by any user via keyless manual import |
| A4-03 | **P0** | `app/exercise-library.tsx:563,851,950` | `SYSTEMIC:weight-kg` | Exercise-goal weight stored as raw display value — lbs users save 225 lb as 225 kg (both write and prefill skip conversion) |
| A4-01 | **P0** | `app/exercise-library.tsx:594-611` | `SYSTEMIC:tier-breach` | Set-history modal always hits `GET /sets`; free users permanently see "Could not load history" |
| A4-02 | **P0** | `app/progress.tsx:191,219,238` | `SYSTEMIC:weight-kg` | Pro path reads `s.weight_raw` but server strips it → every 8-week volume bucket & PR is `NaN`/0 |
| LIB-01 | **P0** | `src/lib/strengthModelV3.ts:273-278` | `SYSTEMIC:null-safety-ui` | `overallStrengthPercentile` has no `bwKg<=0` guard (siblings do) → `Math.log(neg)`→NaN→silently shows 0th percentile |
| LIB-02 | **P0→P1** | `src/lib/trainingEngine/localContext.ts:92-96` vs `strengthModelV3.ts:391-393` | — | Producer emits `under_30`/`30_39`; consumer keys are `under-18`/`25-34` → age multiplier silently always 1.0 on the birth_date path |
| DATA-02 | **P1** | `src/data/setEditing.ts:60-68` | — | Pro set-edit = delete-then-re-log, no rollback; failure between calls permanently loses the set silently |
| A4-04 | **P1** | `app/workout-day.tsx:122-123,661-662` | `SYSTEMIC:weight-kg` | `setVolumeKg`/`bestSetIds` gate on `s.weight_raw`; server omits it → Pro day view shows 0 volume, no PR highlight |
| A6-02 | **P1** | `app/data-export.tsx:82` + `recovery-code.tsx` | `SYSTEMIC:null-safety-ui` | `staggerStyle(anim)` not null-guarded (training-survey's copy is) → `anim.interpolate` throws if stagger array shorter than index |
| DB-01 | **P1** | `src/db/connector.ts:96` | — | `getCrudBatch()` called with 0 args (TS2554); works only on a JS default — if removed, Pro sync silently uploads nothing |
| DB-02 | **P1** | `src/db/localDb.ts:133` | — | `rawDb.execute` shim drops the `opts` param the `MigrationDb` interface declares; invisible to tsc because `opts` is optional |
| DATA-03 | **P1** | `src/data/profile.ts:293,298` | — | `loadLocalProfile` builds `WHERE id = '${ROW_ID}'` string-interpolated instead of `?` (constant today, pattern hazard) |
| LIB-04 | **P1** | `src/lib/insightsLocal.ts:380` | — | `computeDeload` reads `new Date()` internally → impure, nondeterministic, untestable (sibling `computeRecovery` takes `now`) |
| A4-06 | **P1** | `app/workout-day.tsx:919` | `SYSTEMIC:null-safety-ui` | `sections[sections.length-1].exerciseId` — TS2532; crash if `sections` empties between renders |
| A4-07 | **P1** | `app/workout-history.tsx:69-70`, `app/workout-day.tsx:137-138` | `SYSTEMIC:null-safety-ui` | `dateStr.split('-').map(Number)` → `month` possibly undefined (TS18048); malformed date → Invalid Date |
| LIB-05 | **P1** | `src/lib/insightsLocal.ts:250,272` | `SYSTEMIC:null-safety-ui` | TS2532 on runtime-safe array tail access; needs `!` to clear the error noise |
| A6-03 | **P1** | `app/recovery-code.tsx:179` | `SYSTEMIC:null-safety-ui` | `styles.card` referenced but absent from StyleSheet (TS2339) → card renders unstyled |
| A6-04 | **P1** | `app/csv-import.tsx:144` | — | `handleImport` reads `localFirst` but deps are `[file]`; stale closure shows wrong tier message after in-session upgrade |
| A6-07 | **P1** | `app/templates.tsx:338-342` | `SYSTEMIC:null-safety-ui` | `selected.sessions[0]` possibly undefined (TS18048) despite length guard |
| DATA-04 | **P1→P2** | `src/data/routineHistory.ts:70,130` | — | Two unbounded `GET /workouts` per screen load; no shape guard beyond `Array.isArray` |
| LIB-03 | **P1→P2** | `src/lib/strengthModelV3.ts:196` | — | `fitLognormal` `sigma = szy/szz` div-by-zero when all loads identical → Infinity/NaN (edge of partial-total path) |
| A6-06 | **P1→P2** | `app/templates.tsx:414` | — | `string | undefined` into a `string` prop (TS2322); empty-state text may silently vanish |
| A6-01 | **P0→P1** | `app/templates.tsx:339` | `SYSTEMIC:tier-breach` | `handleStartWorkout` POSTs `/workouts` with no tier guard — but unreachable on the normal free path (UI-flow-guarded) |

(P2/P3 findings DATA-06/07/08, DB-03/04/05/06, LIB-06/07/08, A4-08/09/10, A6-08/09/10/11 are accepted as written in the source files; fixes summarized briefly in §(c) where they share a systemic tag, otherwise left to the finders' direction.)

---

## (c) Per-finding detail + concrete fix

### [P0] DATA-01 — Backup-JSON column names interpolated into INSERT SQL
**Verified.** `restoreBackupToDb` (`exportEngine.ts:226-231`) does `cols = Object.keys(row)` then `INSERT INTO ${t} (${cols.join(', ')}) ...`. Table names are allowlisted to `BACKUP_TABLES`, but column names are not. The manual-import path in `app/data-export.tsx:343-368` reads an arbitrary user file → `JSON.parse` → `parseImport` → `restoreBackupToDb` with **no crypto/key gate**, so any user can craft `{"sets":[{"weight_kg, x":1}]}`. expo-sqlite's `prepare_v2` blocks stacked statements, but malformed identifiers still cause errors/partial writes inside the (otherwise atomic) restore transaction.

**Fix:** Add a per-table column allowlist derived once from the local schema and enforce it inside `parseImport` (so `restoreBackupToDb` can never receive a bad column). Concretely, add a `const BACKUP_COLUMNS: Record<string, Set<string>>` constant beside `BACKUP_TABLES`, and in `parseImport`'s normalization loop (lines 171-174) map each row through a filter that drops any key not in `BACKUP_COLUMNS[t]` (and, defensively, reject rows whose keys fail `/^[a-z_][a-z0-9_]*$/`). This keeps `restoreBackupToDb` unchanged and closes the hole at the trust boundary.

### [P0] A4-03 — Exercise-goal weight stored without unit conversion · `SYSTEMIC:weight-kg`
**Verified.** `handleSaveGoal` (`exercise-library.tsx:563`) computes `w = parseFloat(goalWeight)` and passes it straight to `setExerciseGoal(exercise.id, w, r, ...)`, which stores it verbatim as `target_weight_kg` (`exerciseGoals.ts:71`; the module comment line 11 says weights are kg). `unitPref` is already in scope (line 537) and even passed to a child (1035), the input placeholder is hardcoded `"Weight (kg)"` (851), and the edit prefill uses raw `String(goal.target_weight_kg)` (950). Both directions skip conversion — exactly the lbs-as-kg class the repo documented before.

**Fix:** Import `displayToKg`, `kgToInputValue`, `parseWeightInput` from `src/constants/units.ts`. In `handleSaveGoal`: `const w = displayToKg(parseWeightInput(goalWeight), unitPref);` before `setExerciseGoal`. Change the placeholder to the active unit (`Weight (${unitPref})`). In the prefill at line 950 use `setGoalWeight(kgToInputValue(goal.target_weight_kg, unitPref))`. Also update the display at line 935 to `formatWeight(goal.target_weight_kg, unitPref)` so lbs users read their goal in lbs.

### [P0] A4-01 — Set-history modal breaks free users · `SYSTEMIC:tier-breach`
**Verified.** `ExerciseDetailModal`'s effect (`exercise-library.tsx:586-611`) unconditionally calls `apiClient.get('/sets', { params:{ exercise_id, limit } })`. `/sets?exercise_id=` is personal data; for free users it fails → `setSetsError('Could not load history.')` permanently. No `isLocalFirst` branch.

**Fix:** Add an `isLocalFirst(user)` branch at the top of the effect (`useAuth` is already imported; add `isLocalFirst` import). For local-first users, `await localDb.init()` then `localDb.getAll<SetRecord>("SELECT id, exercise_id, weight_kg, weight_raw, reps, logged_at FROM sets WHERE exercise_id = ? AND kind = 'lift' ORDER BY logged_at DESC LIMIT ?", [exercise.id, SET_HISTORY_LIMIT])`, mapping `weight_kg ?? weight_raw/8` into the existing `SetRecord` shape so `computePersonalBest`/`computeSessionVolumes` work unchanged. Keep the REST path for Pro.

### [P0] A4-02 — Pro progress analytics read stripped `weight_raw` → NaN · `SYSTEMIC:weight-kg`
**Verified and ESCALATED.** `fetchProgressData` calls `GET /sets?limit=500` (`progress.tsx:191`). The server handler returns `rows.map(normalizeSet)` (`sets.js:158/171/194`), and `normalizeSet` (`sets.js:35-36`) does `const { weight_raw, ...rest } = row; return { ...rest, weight_kg: decodeWeight(weight_raw) }` — i.e. it **deletes `weight_raw` and emits `weight_kg`**. So `ApiSet.weight_raw` (`progress.tsx:85`) is `undefined` for every server set: line 219 `(undefined/8)*reps = NaN` (all volume buckets), line 238 `epley(undefined, reps) = NaN` (all PRs). This is worse than "lossy" — Pro progress is entirely broken. (The local path at 296-297 is already correct.)

**Fix:** Replace `weight_raw: number` in `ApiSet` (line 85) with `weight_kg: number; weight_raw?: number`. Add `const setKgPro = (s: ApiSet) => s.weight_kg ?? (s.weight_raw != null ? s.weight_raw/8 : 0);`. Use it at line 219 (`setKgPro(s) * s.reps`) and rewrite `epley` to take kg directly (`epley(setKgPro(s), s.reps)`), matching the local path's `kgOf()`.

### [P0] LIB-01 — `overallStrengthPercentile` unguarded `bwKg<=0` → NaN→silent 0th pct · `SYSTEMIC:null-safety-ui`
**Verified.** `overallStrengthPercentile` (`strengthModelV3.ts:273-278`) and `overallStrengthPercentilePartial` (285+) compute `dotsScore(total, bwKg, sex)` with no guard; at `bwKg<=0` the DOTS denominator is strongly negative → `dots < 0` → `Math.log(dots)=NaN` → `clampPct(NaN)` returns 0 with no diagnostic. The siblings `computeRankedPercentile:247` and `computePercentile:434` both have `if (e1rmKg<=0 || bwKg<=0) return 0`.

**Fix:** Add at the top of both functions: `if (total <= 0 || bwKg <= 0) return { pct: 0, provisional: false, dots: 0 };` (for the partial variant, compute the subtotal first and guard `subtotal<=0 || bwKg<=0`). Matches the established sibling pattern.

### [P0→P1] LIB-02 — Age-band token vocab mismatch disables age adjustment
**Verified — downgraded P0→P1.** Producer `ageBandFromBirthDate` (`localContext.ts:92-96`) returns `under_30`/`30_39`/`40_49`/`50_59`/`60_plus`; consumer `AgeBand`/`AGE_MULT` (`strengthModelV3.ts:391-400`) keys are `under-18`/`18-24`/`25-34`/`35-44`/`45-54`/`55+`. No overlap, and `ageMultiplier` (402-405) falls back to `1.0` on a miss → age adjustment is silently off for this path. **Blast-radius correction:** I traced every consumer — the produced `age_band` flows only into `PlanCtx.profile.age_band`, and the plan engine (`trainingEngine/index.ts`) never calls `computePercentile`/`ageMultiplier`. The live rankings/percentile screens read `user.age_band` from the server object (`hooks/usePlans.ts:153`), which is already in the correct dash format. So **no percentile shown to a user is wrong today** — this is a dormant feature-disable + a producer/consumer contract break waiting to bite the next caller. Hence P1, not P0. Confidence HIGH on the mismatch, HIGH on the no-current-corruption blast radius.

**Fix:** Make `ageBandFromBirthDate` output `strengthModelV3`'s exact `AgeBand` tokens and adopt its 5-year bands: `<18`→`'under-18'` (currently returns null), `18-24`→`'18-24'`, `25-34`→`'25-34'`, `35-44`→`'35-44'`, `45-54`→`'45-54'`, `55+`→`'55+'`. Import the `AgeBand` type and annotate the return as `AgeBand | null` so the compiler enforces the contract going forward (this also resolves LIB-08).

### [P1] DATA-02 — Non-atomic Pro set-edit loses the set on partial failure
**Verified.** `updateLiftSet` Pro branch (`setEditing.ts:60-68`) calls `apiDeleteSet(edit.id)` then `apiLogSet(...)` with no rollback. If the delete succeeds and the re-log fails, the set is gone server-side with no local copy and no surfaced error.

**Fix:** Reorder to re-log first, delete second: `const newSet = await apiLogSet({...}); await apiDeleteSet(edit.id);`. A failure between the two now leaves a *duplicate* (recoverable) instead of a *gap* (data loss). Have the `workout-day.tsx` caller wrap the call in try/catch and show a failure toast rather than the unconditional "Saved". (Preferred longer-term: add `PATCH /sets/:id` server-side and call it directly.)

### [P1] A4-04 — Pro day-view volume/PR gate on absent `weight_raw` · `SYSTEMIC:weight-kg`
**Verified, mechanism corrected.** `ApiSet` here declares both `weight_raw?` and `weight_kg?` (`workout-day.tsx:81-82`). `fetchDayData` hits `GET /sets?workoutId=` (line 191) → `normalizeSet` → `weight_raw` undefined. `setVolumeKg` (122) early-returns 0 on `!s.weight_raw`; `bestSetIds` (661) skips on `!s.weight_raw`. So the failure mode is **silent 0 volume + no PR highlight** for Pro (not NaN, because the guards swallow it). The local path already synthesizes `weight_raw = weight_kg*8` at line 322.

**Fix:** Add `function resolvedWeightRaw(s: ApiSet): number { return s.weight_kg != null ? s.weight_kg * 8 : (s.weight_raw ?? 0); }` and use it in `setVolumeKg` (122-123) and the `bestSetIds` `computeE1rm` call (662), plus any `SetRow` display. This makes both transport shapes correct with one helper.

### [P1] A6-02 — `staggerStyle` missing null guard → crash on short stagger array · `SYSTEMIC:null-safety-ui`
**Verified.** `data-export.tsx:82` declares `staggerStyle(anim: Animated.Value)` and calls `anim.interpolate(...)` unconditionally; `recovery-code.tsx` has the same. `staggerAnims[N]` is `Animated.Value | undefined` under strict indexing (TS2345 in tsc), so a smaller-than-expected count throws at runtime. The correct version already exists at `training-survey.tsx:288-291`: `staggerStyle(anim: Animated.Value | undefined)` with `if (!anim) return {};`.

**Fix:** Copy the training-survey signature + `if (!anim) return {};` guard into both `data-export.tsx:82` and the `recovery-code.tsx` copy. Clears the TS2345s and the crash.

### [P1] DB-01 — `getCrudBatch()` missing required `limit`
**Verified** (TS2554, `00-tsc.txt`). `connector.ts:96` calls `database.getCrudBatch()`; the `@powersync/common` signature requires `limit`. Works today only via `SqliteBucketStorage`'s internal `limit = 100` default.

**Fix:** `const batch = await database.getCrudBatch(100);` — pin the same value the storage layer defaults to, so removal of the default can't silently zero out Pro uploads.

### [P1] DB-02 — `rawDb.execute` shim drops `opts`
**Verified.** `localDb.ts:133` shim is `(sql, params=[]) => ...`; `MigrationDb.execute` (`migrations.ts`, and the mirrored `MinimalDb` at `exportEngine.ts:192`) declares `(sql, params?, opts?)`. tsc misses it because `opts` is optional. Harmless now (no subscribers during init) but a silent contract break.

**Fix:** Widen the shim to `async (sql: string, params: unknown[] = [], _opts?: { tables?: string[] }): Promise<void> => { await handle.runAsync(sql, params as SQLite.SQLiteBindValue[]); }`. Zero behavior change, honest types, future-proof against opts-driven notifications.

### [P1] DATA-03 — String-interpolated `WHERE id = '${ROW_ID}'`
**Verified.** `profile.ts:293` and `:298` build `... WHERE id = '${ROW_ID}'`. `ROW_ID` is the constant `'active'`, so no injection today, but it's the lone non-parameterized local query and a landmine if `ROW_ID` ever becomes dynamic.

**Fix:** Replace both with `... WHERE id = ?` and pass `[ROW_ID]` as params, matching every other `localDb` call.

### [P1] LIB-04 — `computeDeload` impure (`new Date()` internal)
**Verified.** `insightsLocal.ts:380` `const now = new Date();` inside the function; the 42-day rule depends on it. Sibling `computeRecovery` takes `now: Date`. Violates the deterministic-engine requirement (CLAUDE.md §7) and blocks unit testing.

**Fix:** Add `now: Date = new Date()` as the third parameter and use it; defaulting keeps every existing caller working while letting tests inject a fixed clock.

### [P1] A4-06 — `sections[sections.length-1]` possibly undefined
**Verified** (TS2532). `workout-day.tsx:919` in `renderSectionFooter`. Crash if `sections` empties mid-render.

**Fix:** `const isLast = sections.at(-1)?.exerciseId === section.exerciseId;` (optional chaining; `undefined === id` is a safe `false`).

### [P1] A4-07 — Unchecked `dateStr.split('-').map(Number)`
**Verified** (TS18048). `workout-history.tsx:69-70` (`parseLocalDate`) and `workout-day.tsx:137-138` (`friendlyDate`) both index the split result without a guard; a malformed/empty `dateStr` yields `undefined - 1 = NaN` → Invalid Date.

**Fix:** In both, `const [y, m, d] = dateStr.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);`.

### [P1] LIB-05 — TS2532 on runtime-safe array tails
**Verified.** `insightsLocal.ts:250` (`recent7[recent7.length-1]`, guarded by `hrRows.length>=7` + `slice(-7)`) and `:272` (`sleepRows[sleepRows.length-1]`, guarded by `length>=1`). Safe at runtime, but the errors mask real ones.

**Fix:** Add `!`: `recent7[recent7.length-1]!.resting_hr_bpm` and `sleepRows[sleepRows.length-1]!.sleep_hours`. (Or `recent7.at(-1)!`.)

### [P1] A6-03 — `styles.card` not in StyleSheet
**Verified** (TS2339). `recovery-code.tsx:179` uses `styles.card`; the StyleSheet has `codeCard` but no `card`, so the container renders with only the inline dynamic styles (loses nothing critical here because the inline block supplies bg/radius/border, but the type error is real and the intent was a shared style).

**Fix:** Rename the usage to `styles.codeCard` (which exists and matches intent), or add `card: {}` to the StyleSheet. Renaming is cleaner.

### [P1] A6-04 — Stale `localFirst` in `useCallback` deps
**Verified.** `csv-import.tsx:107-144`: `handleImport` reads `localFirst` (line 109) but deps are `[file]` (line 144). `localFirst` is recomputed each render from `user`, so after an in-session Free→Pro upgrade the memoized callback keeps `localFirst=true` and wrongly blocks the import.

**Fix:** `}, [file, localFirst]);`

### [P1] A6-07 — `selected.sessions[0]` possibly undefined
**Verified** (TS18048). `templates.tsx:338` after the `!(selected.sessions?.length)` guard; strict indexing still types it as `| undefined`.

**Fix:** `const firstSession = selected.sessions[0]!;` (the length guard makes index 0 safe).

### [P1→P2] DATA-04 — Duplicate unbounded `GET /workouts`
**Verified, downgraded P1→P2.** `routineHistory.ts:70` and `:130` each fetch the full `/workouts` list; the routine-history screen calls both → two identical large payloads per visit. The `Array.isArray(res.data)` guard already prevents a hard crash on a shape change (it degrades to empty), so the "silently hides a broken feature" P1 framing is weaker than stated — it's a performance/duplication issue → P2.

**Fix:** Extract `fetchProWorkouts()` with a short-TTL module cache or a `useRef`-held promise so both callers share one request; keep the `Array.isArray` guard and add a `console.warn` when it trips.

### [P1→P2] LIB-03 — `fitLognormal` div-by-zero on identical loads
**Verified, downgraded P1→P2.** `strengthModelV3.ts:196` `sigma = szy/szz`; `szz=0` when all `z`-deviations cancel (all loads identical) → Infinity/NaN. The 6-anchor calibration data is strictly monotone so the live caches never hit it; only a degenerate `subsetDots` in the partial path could, and `clampPct` masks the display. Real but edge → P2.

**Fix:** Guard before the division: `if (!(szz > 0)) return { mu: ybar, sigma: 0, r2: 1 };` (a zero-variance fit), and skip/clamp non-positive `loads[i]` before `Math.log`.

### [P1→P2] A6-06 — `string | undefined` into a `string` prop
**Verified via tsc** (TS2322 at `templates.tsx:414`; exact line content shifted but the error is authoritative). Won't crash — RN renders nothing — so a missing empty-state message is the worst case → P2.

**Fix:** Add a `?? ''` fallback (or tighten the source type) at the flagged prop.

### [P0→P1] A6-01 — `handleStartWorkout` POSTs `/workouts` without a tier guard · `SYSTEMIC:tier-breach`
**Verified, downgraded P0→P1.** `templates.tsx:339` posts `/workouts` with no `isLocalFirst` branch. But I confirmed the finder's own reachability analysis: `fetchTemplates` already gates the server "All templates" section behind `isLocalFirst` (275-279), the bundled-program flow routes through a separate `bundledSelected` handler that never calls `handleStartWorkout`, and the catch swallows failures. So on the normal free path this POST is **not reachable** — it's a defense-in-depth gap (deep-link / future-refactor risk), not an active free-user breach. P1.

**Fix:** Add at the top of `handleStartWorkout`: `if (isLocalFirst(user)) { setSelected(null); router.push('/(tabs)/log' as any); return; }` (write to `localDb` if/when bundled-start is wired to this path). Belt-and-suspenders against the guard ever being bypassed.

---

## (d) Dropped / downgraded

**Downgraded (kept, severity lowered — rationale in §(c)):**
- **LIB-02** P0→P1 — real producer/consumer token-contract break, but I traced all consumers: the bad `age_band` never reaches a live percentile (rankings use the server's correctly-formatted `user.age_band`), so nothing displayed is wrong today; it's a dormant feature-disable.
- **A6-01** P0→P1 — tier-breach POST is UI-flow-unreachable on the free path per its own analysis; defense-in-depth, not an active breach.
- **DATA-04** P1→P2 — `Array.isArray` guard already prevents the "silent broken feature" crash; remaining issue is duplicate/unbounded fetches (perf).
- **LIB-03** P1→P2 — div-by-zero is unreachable from the monotone calibration data; only a degenerate partial-subset could hit it, and `clampPct` masks it.
- **A6-06** P1→P2 — cannot crash (RN renders nothing); worst case is a missing empty-state string.

**Dropped (not a bug, or pure documentation — not carried as actionable defects):**
- **A6-05** (`_layout.tsx` isLoading spinner / Invariant 5) — DROPPED as a bug. I confirmed `AuthContext` sets `isLoading=false` *before* the background `Promise.race`, so the cached user renders immediately and the spinner does not gate on the network refresh. The finder itself concludes "No clear bug … overall pattern is correct." At most a one-line clarifying comment; not a defect.
- **A4-11** (`one-rm.tsx` unit label) — DROPPED. The finder explicitly states "no bug today" — it's a standalone calculator with no storage write, internally unit-consistent (display-in → display-out). Note for future storage paths only.
- **DATA-05** (`exerciseNames.ts` calls `getExercises()` on the free path) — DROPPED as a defect, retained as a docs note. `GET /exercises` is a global, no-auth, non-personal catalogue endpoint (confirmed `server/routes/exercises.js`), so it does not violate Invariant 1. Action item is a one-line code comment + a CLAUDE.md line listing the two allowed free-path calls (group weekly-signal + exercise catalogue) — not a code fix.

_Not re-listed: the genuine P2/P3 findings (DATA-06/07/08, DB-03/04/05/06, LIB-06/07/08, A4-08/09/10, A6-08/09/10/11) are accepted as written in their findings files; they are correct and their suggested directions stand._
