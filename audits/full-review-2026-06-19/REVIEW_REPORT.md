# Peak Fettle — Full Mobile Codebase Review

**Date:** 2026-06-19
**Scope:** 167 TypeScript/TSX files, ~56.7K LOC — `mobile/app/` + `mobile/src/` only; server excluded.
**Methodology:** 14 Sonnet auditors (disjoint file ownership, 2 waves) → 3 Opus synthesizers (source-verified every P0/P1, proposed concrete fixes) → deterministic static gate.
**Status:** Static gate clean. Report covers verified findings only — every P0/P1 was re-opened at its cited `file:line` by an Opus synthesizer before inclusion.

---

## 1. Methodology

Fourteen Sonnet auditors partitioned the codebase into disjoint domains (8 auditors over `src/` layer in Wave 1; 6 auditors over `app/` screens in Wave 2). Each auditor owned a non-overlapping file set and was forbidden from reporting findings against files outside their scope, preventing duplicate findings and audit fatigue. This mirrors Anthropic's orchestrator-worker fan-out pattern: small, well-scoped agents beat a single large one.

Three Opus synthesizers then consumed the raw findings files, opened every cited `file:line` in source, traced the actual data flow, and either confirmed, corrected, escalated, or downgraded each finding before producing the three SYNTH files that are the ground truth for this report. The synthesizers were lane-partitioned (SYNTH-1: data integrity, DB, math, local-first/weight-kg; SYNTH-2: auth, API resilience, hooks, async lifecycle; SYNTH-3: UI components, modals/safe-area, cosmetics gating, charts, perf/a11y).

The mandatory static gate ran before any auditor touched a file: `@babel/parser` parse-sweep, `node --check` on server JS, `migrations.test.js`, and `tsc --noEmit`. Its outputs (`00-parse-sweep.txt`, `00-tsc.txt`, `00-migrations-test.txt`, `00-security-greps.txt`) anchored the review — auditors were told which tsc errors were already known so they did not re-report benign baseline noise. This gate is the project's own DoD per `CLAUDE.md §6`.

---

## 2. Executive Summary

**Verified finding counts:** P0: 10 · P1: 38 · P2: 21 · P3: 12 · Dropped/downgraded: 16

The codebase parses clean (0/167 Babel failures), all 12 migration tests pass, and the security posture is sound — no hardcoded secrets, no cleartext HTTP, no string-interpolated SQL in the live query paths, and authentication tokens correctly reside in SecureStore. The tsc error count (59) is under the ~85 baseline established at the project's last major pass, and the majority are known-benign expo-router typed-route string literals.

The real risk is concentrated in a handful of P0s and two recurring systemic patterns that the project's own invariants were designed to prevent but that have re-appeared:

- **Three P0s break Pro-user data integrity right now.** `progress.tsx` reads `weight_raw` on the Pro analytics path, but the server's `normalizeSet` strips it and returns only `weight_kg` — every Pro 8-week volume bucket and PR is `NaN`/0 (A4-02). `workout-day.tsx` gates its volume and PR-highlight logic on the same stripped field (A4-04). And the exercise-goal write path in `exercise-library.tsx` stores lbs users' goal weights verbatim in kg (A4-03).
- **One P0 is a security defect with no key gate.** Backup-JSON column names are interpolated into INSERT SQL in `exportEngine.ts`; the manual-import path accepts any user file with no crypto barrier (DATA-01).
- **One P0 in the auth interceptor directly contradicts Invariant 5.** The `client.ts` 401 retry loop calls `onLogout()` on network error, 5xx, and timeout — exactly the transient failures Invariant 5 forbids clearing the session on (API-01). The bootstrap was hardened against this; the interceptor one layer down was not.
- **`SYSTEMIC:safe-area-modal`** has 9 confirmed clip sites (5 top-clip under the Dynamic Island, 3 bottom-clip under the home indicator, 1 centered variant), despite Invariant 3 being documented and a correct reference implementation existing in the same codebase.
- **`SYSTEMIC:cosmetic-gating`** has a real tier bypass: duplicate keys in `peakAvatarOptions.ts` (tsc TS1117, two confirmed) silently demote the `violet` Pro hair color to a streak-100 earnable, and a wristband ID/key mismatch lets free users equip `neon` immediately.

**Fix these first (in order):**

1. `client.ts:143-146` — add `isDefinitiveAuthFailure` classification before `onLogout()` (P0, Invariant 5, Invariant-5 regression post-bootstrap hardening).
2. `exportEngine.ts:226-231` — add a column allowlist derived from local schema; enforce in `parseImport` before any SQL (P0, security, keyless path).
3. `progress.tsx:85,191,219,238` + `workout-day.tsx:122-123,661-662` — fix `ApiSet` type to use `weight_kg`, add `setKgPro`/`resolvedWeightRaw` helpers; all Pro volume/PR analytics are broken today (P0, Invariant 2).
4. `exercise-library.tsx:563,851,950` — apply `displayToKg`/`kgToInputValue` to goal write and prefill; free and Pro lbs users store wrong values today (P0, Invariant 2).
5. `peakAvatarOptions.ts:279-343` — namespace cross-category cosmetic IDs to eliminate TS1117 duplicates and wristband mismatches; add a migration for already-equipped items (P0, tier bypass).
6. `usePowerSyncLog.ts:305` + `client.ts:143-146` — fix stale closure deps `[localFirst, userId]` (P0, Invariant 1); this and the auth fix are the two items requiring `/ultra-review` before commit.

---

## 3. Static Verification Gate

| Check | Result |
|---|---|
| `@babel/parser` sweep — 167 files | **0 failures** |
| `migrations.test.js` | **12/12 passed** |
| `tsc --noEmit` | **59 errors** (baseline ~85; count did not increase) |
| Security greps: hardcoded secrets | **None found** |
| Security greps: cleartext `http://` | **None found** |
| Security greps: string-interpolated SQL | **None found** (one constant-only case in `profile.ts:293` — P1, not a live injection) |
| Tokens in SecureStore | **Confirmed** — refresh token and user profile in `SecureStore.setItemAsync`; non-sensitive flags/prefs in `AsyncStorage` |

**tsc error breakdown:** 33× TS2345 (mostly expo-router typed-route string literals — known benign baseline, P3); 8× TS2322; 12× null-safety (7× TS2532 + 5× TS18048, real defects — all are confirmed and tracked in the P1 findings below); 2× TS1117 duplicate object key (real defect — cosmetic tier bypass, tracked as P0/P1 in findings); 2× TS2769; 1× TS2554; 1× TS2339. The tsc count is under the ~85 prior baseline, confirming no net regression was introduced in recent work; the 59 errors contain no new systemic pattern.

---

## 4. Systemic Patterns

These cross-cutting themes account for the majority of P0/P1 findings. Each site is listed once under its canonical pattern; the per-finding tables in §5/§6 carry the full severity and fix reference.

### 4.1 `safe-area-modal` (Invariant 3)

**What it is:** `SafeAreaView` (from either `react-native` core or `react-native-safe-area-context`) used as the root view inside a React Native `<Modal>`. The component does not propagate insets inside a Modal — the result is a header that sits under the Dynamic Island on iPhone, or a footer that sits under the home indicator.

**The invariant it breaks:** CLAUDE.md Invariant 3: "Safe-area does NOT propagate inside a `<Modal>`. Correct fix: `paddingTop: Math.max(insets.top, 12)` applied directly to the modal's header row." A correct reference implementation already exists in the same codebase at `StepperLogger.tsx:1140,1148` and `LocalPlanModal` (`plans.tsx:664`).

**All 9 confirmed clip sites:**

| # | File:line | Anchor | Inset gap |
|---|-----------|--------|-----------|
| 1 | `src/components/SetEntryForm.tsx:26,404` | top (full-screen) | Header clips under island |
| 2 | `app/groups.tsx:277` (CreateGroupModal) | top (pageSheet) | Header clips under island |
| 3 | `app/groups.tsx:392` (JoinGroupModal) | top (pageSheet) | Header clips under island |
| 4 | `app/group-detail.tsx:541` (GoalChangeModal) | top (pageSheet) | Header clips under island |
| 5 | `app/(tabs)/profile.tsx:39,529` (AddConstraintModal) | top (pageSheet) | Header clips under island |
| 6 | `src/components/TemplateDetailSheet.tsx:25,82` | bottom (absolute) | "Start Workout" CTA clips under home indicator |
| 7 | `src/components/MuscleHeatmap.tsx:325-402` | bottom (transparent) | Dismiss button clips under home indicator |
| 8 | `src/components/WorkoutLoggerHost.tsx:1262` (alt-exercise sheet) | bottom (absolute) | Footer clips under home indicator |
| 9 | `src/components/WorkoutLoggerHost.tsx:104` (PIN sheet) | bottom (absolute) | Footer clips under home indicator |

Two further sites (`RoutineEditorSheet.tsx:163`, `ScheduleEditorSheet.tsx:380`) already apply `paddingTop: Math.max(insets.top, 12)` correctly — their outer `SafeAreaView` is redundant but not a clip bug (P3 cleanup).

**Canonical fix** (applies to all 9): remove the `SafeAreaView` root, import `useSafeAreaInsets`, and apply `paddingTop: Math.max(insets.top, 12)` to the header `<View>` for top-anchored sheets; apply `paddingBottom: Math.max(insets.bottom, spacing.s4)` to the footer for bottom-anchored sheets. For sites 2–5 which use `edges={['top','bottom']}`, replacing the `SafeAreaView` with a plain `<View>` also removes the bottom inset — restore it explicitly on the sticky footer. `ThemeSelector.tsx` (S3-19, P2) is a centered modal; the same pattern applies.

Additionally, two home bottom-sheet Modals at `app/(tabs)/index.tsx:777,845` (Streak, Forgot-something) and one tall sheet at `:892` (Today's lifts, `maxHeight:'80%'`) share the same pattern (HOME-02, P1 per SYNTH-2, tracked in §5).

And `plans.tsx:466-468` (PLANS-01, P1) and `rankings.tsx:211` (RANKINGS-01, P1) are two further top-anchor cases in the `app/(tabs)` screens confirmed by SYNTH-2. Including these, the `safe-area-modal` pattern touches **14 sites total** (9 confirmed clip + 2 redundant + 3 in-scope to SYNTH-2).

### 4.2 `weight-kg` (Invariant 2)

**What it is:** Weight values written or read without the conversion functions in `src/constants/units.ts` (`displayToKg` to store, `kgToInputValue` to prefill, `parseWeightInput`, `formatWeight`). The schema stores exact kg in `weight_kg REAL`; the legacy `weight_raw INTEGER` (kg×8) is secondary and is **stripped by the server's `normalizeSet` helper** — it does not survive the Pro REST path.

**The invariant it breaks:** CLAUDE.md Invariant 2. The project already documented a prior lbs-as-kg incident; it recurred on two new paths.

**Confirmed locations:**

- `app/exercise-library.tsx:563,851,950` — goal write stores raw display value; prefill shows raw kg (A4-03, P0).
- `app/progress.tsx:85,191,219,238` — `ApiSet` typed as `weight_raw: number` but server returns `weight_kg`; all Pro 8-week volume and PR computation is `NaN`/0 (A4-02, P0, mechanism escalated by SYNTH-1).
- `app/workout-day.tsx:122-123,661-662` — `setVolumeKg` and `bestSetIds` gate on `s.weight_raw` which server strips; Pro day view shows 0 volume and no PR highlight (A4-04, P1).

**Canonical fix:** Use `src/constants/units.ts` exclusively. Store: `displayToKg(parseWeightInput(input), unitPref)`. Prefill: `kgToInputValue(storedKg, unitPref)`. Display: `formatWeight(storedKg, unitPref)`. For the Pro REST path: add `weight_kg: number; weight_raw?: number` to `ApiSet` and resolve via `s.weight_kg ?? (s.weight_raw != null ? s.weight_raw / 8 : 0)`.

### 4.3 `tier-breach` (Invariant 1)

**What it is:** A screen, hook, or component that calls a personal-data REST endpoint on the free path (where free users must be strictly local-first) without an `isLocalFirst(user)` branch.

**The invariant it breaks:** CLAUDE.md Invariant 1. Free users hit a failing/slow round-trip → infinite spinner or "Could not load" error.

**Confirmed locations:**

- `app/exercise-library.tsx:586-611` — `ExerciseDetailModal` unconditionally calls `GET /sets?exercise_id=` with no tier branch; free users always see "Could not load history" (A4-01, P0).
- `src/hooks/usePowerSyncLog.ts:222-305` — `initWorkout` stale closure bakes in `localFirst`/`userId` at first render; if user resolves post-mount, a free user gets an anonymous local workout or a Pro user stays on the local-only path (HOOKS-01, P0 — also `SYSTEMIC:tier-breach`).
- `app/(tabs)/plans.tsx:413-422` — `loadPlan` calls `getPlan()` with no `isLocalFirst` guard; currently not reachable via normal UI wiring but a defense-in-depth gap (PLANS-02, P2).
- `app/templates.tsx:339` — `handleStartWorkout` POSTs `/workouts` with no tier guard; UI-flow-unreachable on the free path today but a latent breach (A6-01, P1 — downgraded from P0 by SYNTH-1 after reachability analysis).

### 4.4 `auth-clear` (Invariant 5)

**What it is:** A code path that clears the user's refresh token or forces logout on a transient failure (network error, 5xx, timeout) rather than only on a definitive 401.

**The invariant it breaks:** CLAUDE.md Invariant 5. The `AuthContext.bootstrap` was hardened against this; the `client.ts` interceptor was not.

**Confirmed locations:**

- `src/api/client.ts:143-146` — 401 interceptor's refresh `catch` calls `onLogout()` unconditionally; a network error or 5xx during `/auth/refresh` wipes SecureStore and redirects to login (API-01, P0).
- `src/context/AuthContext.tsx:408` — bootstrap token-clear lower bound is `status >= 200` instead of `>= 400`; a 2xx response with an "expired" body would trigger a clear (SCORE-01, P1 — lower probability but a real hole in the hardening).

**Canonical fix:** Extract a shared `isDefinitiveAuthFailure(err)` helper that returns true only for definitive 401 responses from `/auth/refresh` (or 4xx with an "invalid/revoked/expired" body). Call it from both sites. The two sites diverging is the root cause.

### 4.5 `unmount-guard`

**What it is:** An async `useEffect` or callback that calls `setState` after the component has unmounted, and has no cancel flag or cleanup.

**Confirmed locations (P0/P1 only):**

- `app/insights.tsx:162,173-192` — `load()` effect and `handleAckDeload` async `onPress` both set state after unmount; concurrent `load()` calls race (S3-01, P0).
- `src/components/WorkoutLoggerHost.tsx:450-481` — `startRoutine` stale-cancel flag is local to the method; React never calls the returned cleanup from `useImperativeHandle`; `getRoutine()` is uncancellable (S3-02, P0).
- `app/(tabs)/index.tsx:478-500` — `getPercentile`/`loadPlan` effects have no cancel flag (HOME-01, P1).
- `src/hooks/useWorkout.ts:132-167`, `useWorkoutHistory.ts`, `useHealthMetrics.ts`, `usePlans.ts` — four hooks set state after multi-second awaits with no effect cleanup (HOOKS-02, P1).
- `app/(tabs)/routines.tsx:220-228` — toast `setTimeout` not stored/cleared; fires `setState` after unmount (ROUTINES-01, P1).
- `src/components/ExercisePicker.tsx:95-111` — library fetch `.then(setLibrary)` has no cancel guard (S3-12, P1).

**Canonical fix:** Use a `cancelled` boolean flag (or `mountedRef`) per effect: set it in the cleanup return, guard every `setState` call after any `await` or `.then`. For fetch paths, pass an `AbortController` signal to axios. `useLocalStreak` already demonstrates the correct `mountedRef` variant — adopt one pattern across all hooks.

### 4.6 `cosmetic-gating`

**What it is:** Duplicate object keys in `peakAvatarOptions.ts`'s flat `COSMETIC_TIERS` object (TS1117, confirmed in `00-tsc.txt`) cause JavaScript to silently keep the last definition, overwriting the earlier one. A wristband ID/tier-key mismatch causes `isUnlocked` to fall through to the `'free'` default.

**Confirmed locations:**

- `src/components/avatar/peakAvatarOptions.ts:283` — `violet` first defined as `'pro'` (hair); overwritten at `:343` by `{streak:100}` (accent) → `violet` hair is no longer Pro-locked.
- `src/components/avatar/peakAvatarOptions.ts:247,317-319` — wristband IDs are `'teal','gold','neon'` but tier keys are `teal_wristband`/`gold_wristband`/`neon_wristband` → `isUnlocked('neon')` misses → defaults to `'free'`; `isUnlocked('teal')` and `isUnlocked('gold')` hit the hair/accent `teal`/`gold` entries instead (streak-7, not streak-30).

Net effect: free users can equip `violet` hair (real gate: Pro) at a streak of 100, `neon` wristband immediately (real gate: streak-30), and `gold`/`teal` wristbands at streak-7 (real gate: streak-30). `setEquipped` in `cosmeticUnlocks.ts:148` explicitly does no unlock validation — the mis-tiered chips render unlocked and are immediately equippable and persisted to `user_equipped_cosmetics`.

**Canonical fix:** Namespace all accent-theme and wristband IDs so every key in `COSMETIC_TIERS` is globally unique (e.g. `accentViolet`, `accentGold`, `teal_wristband`). Add a `__tests__` assertion that every ID in each `*_IDS` array resolves in `COSMETIC_TIERS`. Write a one-shot SQL migration for `user_equipped_cosmetics` rows with the old un-namespaced accent IDs.

### 4.7 `null-safety-ui`

**What it is:** TypeScript `noUncheckedIndexedAccess: true` (confirmed at `tsconfig.json:5`) makes array index access return `T | undefined`. Code that treats these as `T` produces real NaN or TypeError at runtime when the array is shorter than expected.

**Confirmed P1 locations with live runtime impact:**

- `app/(tabs)/index.tsx:468,626-627` — `plans[0].id` (TS2532) inside a length guard; `sortedKeys[i-1]`/`sortedKeys[i]` (TS2769) → `new Date(undefined)` → `NaN` diff → `longestStreak` silently returns 1 (HOME-03).
- `app/(tabs)/rankings.tsx:605-611` — median `values[mid-1]`/`values[mid]` (3× TS2532/TS2345) → `NaN%` display (RANKINGS-02).
- `src/components/RoutineStrip.tsx:78` + `src/components/WorkoutLoggerHost.tsx:467` — `exerciseId: ex.exercise_id` typed `string|null|undefined` → `string`; null can reach `logSet` as `''` (S3-10).
- `app/workout-history.tsx:70`, `app/workout-day.tsx:138` — `dateStr.split('-').map(Number)` with no undefined guard → Invalid Date (A4-07).
- `app/(tabs)/index.tsx:626-627` (covered above, HOME-03).

**Type-only (safe at runtime but mask real errors):**

- `src/lib/insightsLocal.ts:250,272` — array tail access guarded by length check; `!` assertion needed (LIB-05).
- `app/insights.tsx:259,314,322,337` — `staggerAnims[n]` (4× TS2345); array is always length-4 at runtime (S3-15).
- `app/templates.tsx:341-342` — `firstSession` (TS18048) after a length guard (A6-07).
- `app/group-detail.tsx:78` — `name.trim()[0]` (TS2532); caller guards against empty (S3-27).

---

## 5. P0 Findings

| ID | File:line | Problem | Fix direction | Systemic tag |
|----|-----------|---------|---------------|--------------|
| API-01 | `src/api/client.ts:143-146` | 401 interceptor `catch` calls `onLogout()` on network error/5xx/timeout — wipes refresh token on transient failure | Add `isDefinitiveAuthFailure` classification; only logout on confirmed 401 from `/auth/refresh` | `auth-clear` |
| HOOKS-01 | `src/hooks/usePowerSyncLog.ts:222-305` | `initWorkout` stale closure — `localFirst`/`userId` missing from deps `[todayKey]`; post-mount user resolution creates orphaned or mis-tiered workouts | Add `localFirst, userId` to the `useCallback` dep array | `tier-breach` |
| DATA-01 | `src/data/backup/exportEngine.ts:226-231` | Backup-JSON column names string-interpolated into INSERT SQL; no key gate on manual import path | Add `BACKUP_COLUMNS` allowlist in `parseImport`; filter/reject any key not matching `/^[a-z_][a-z0-9_]*$/` | — |
| A4-03 | `app/exercise-library.tsx:563,851,950` | Exercise-goal weight stored as raw display value; lbs users store 225 lb as 225 kg; prefill also skips conversion | `displayToKg(parseWeightInput(goalWeight), unitPref)` on save; `kgToInputValue(goal.target_weight_kg, unitPref)` on prefill | `weight-kg` |
| A4-01 | `app/exercise-library.tsx:586-611` | `ExerciseDetailModal` calls `GET /sets?exercise_id=` unconditionally; free users always see "Could not load history" | Add `isLocalFirst(user)` branch; use `localDb` for free, REST for Pro | `tier-breach` |
| A4-02 | `app/progress.tsx:85,191,219,238` | `ApiSet` typed `weight_raw: number` but `normalizeSet` strips it — Pro 8-week volume and all PRs are `NaN`/0 | Fix `ApiSet` to `weight_kg: number; weight_raw?: number`; add `setKgPro` helper using `weight_kg ?? weight_raw/8` | `weight-kg` |
| LIB-01 | `src/lib/strengthModelV3.ts:273-278` | `overallStrengthPercentile` has no `bwKg<=0` guard (siblings do); `Math.log(negative)` → NaN → silent 0th percentile | Add `if (total <= 0 \|\| bwKg <= 0) return { pct: 0, provisional: false, dots: 0 };` | `null-safety-ui` |
| S3-01 | `app/insights.tsx:162,173-192` | `load()` effect and `handleAckDeload` async `onPress` both setState after unmount; concurrent loads race | Add `mountedRef`; guard all setters; `ignore` flag on the load effect | `unmount-guard` |
| S3-02 | `src/components/WorkoutLoggerHost.tsx:450-481` | `startRoutine` stale cancel: flag is local to the method; React never calls the cleanup returned from `useImperativeHandle` | Promote cancel flag to component-level `startCancelledRef`; guard `.then` and `.catch` | `unmount-guard` |
| S3-03 | `src/components/avatar/peakAvatarOptions.ts:279-343` | Duplicate keys (`violet`, `silver`) + wristband ID mismatch; free users can equip Pro `violet` hair and `neon` wristband immediately | Namespace all cross-category IDs; add `__tests__` assertion; write SQL migration for equipped rows | `cosmetic-gating` |

### P0 Detail

**API-01 (`client.ts:143-146`)** — The 401 interceptor at line 109-112 only fires after an original request has already returned 401 and a `/auth/refresh` attempt is initiated. If that refresh call then fails on a network error, 5xx, or 10 s timeout, line 145 calls `_authHandlers.onLogout()` for all of them, wiping SecureStore and redirecting to login. The bootstrap hardening (`bootstrappingRef`) is cleared in its `finally` block (line 440) and provides no protection for the normal post-launch lifetime. The concrete fix is to mirror the bootstrap's error classifier — check `axios.isAxiosError(err)` and the response status before logging out; only a definitive 401 from `/auth/refresh` (or a 4xx with an "invalid/revoked/expired" body) justifies clearing the session. Extract this as a shared `isDefinitiveAuthFailure(err)` helper called by both sites.

**HOOKS-01 (`usePowerSyncLog.ts:222-305`)** — `initWorkout` is a `useCallback` whose dep array is `[todayKey]`. `todayKey` is a stable `useMemo(…, [])` string, so the callback is created exactly once with whatever `user` was at first render. If the user resolves post-mount (cold-start, or a tier flip), `localFirst` and `userId` are stale. A free user who logs in post-mount calls `ensureLocalWorkoutForDay(todayKey, '')` — an anonymous local workout keyed to an empty userId. A Pro user who resolves post-mount stays on the `localFirst===true` branch and writes a local-only workout that never enters the REST/sync path. Fix: add `localFirst, userId` to the dep array. The downstream `useEffect(() => { void initWorkout(); }, [initWorkout])` at line 307 already re-runs when `initWorkout` changes — no further change needed.

**DATA-01 (`exportEngine.ts:226-231`)** — `restoreBackupToDb` does `cols = Object.keys(row)` then `INSERT INTO ${t} (${cols.join(', ')}) ...`. Table names are allowlisted to `BACKUP_TABLES`, but column names are not. The manual-import path in `app/data-export.tsx:343-368` accepts any user file, parses it as JSON, and passes it to `restoreBackupToDb` with no cryptographic gate. expo-sqlite's `prepare_v2` blocks stacked statements, but malformed identifiers still cause errors or partial writes inside the restore transaction. Fix: add a `const BACKUP_COLUMNS: Record<string, Set<string>>` constant beside `BACKUP_TABLES`; filter every row in `parseImport` to drop any key not in `BACKUP_COLUMNS[t]` and reject keys that do not match `/^[a-z_][a-z0-9_]*$/`.

**A4-03 (`exercise-library.tsx:563,851,950`)** — `handleSaveGoal` computes `w = parseFloat(goalWeight)` and passes it straight to `setExerciseGoal(exercise.id, w, r, ...)`, which stores it verbatim as `target_weight_kg`. The `unitPref` is already in scope at line 537. The input placeholder is hardcoded `"Weight (kg)"`. The edit prefill at line 950 uses `String(goal.target_weight_kg)` — raw kg shown as if it were the user's preferred unit. Fix: `const w = displayToKg(parseWeightInput(goalWeight), unitPref);` in the save handler; `kgToInputValue(goal.target_weight_kg, unitPref)` in the prefill; `formatWeight(goal.target_weight_kg, unitPref)` in the display; dynamic placeholder `Weight (${unitPref})`.

**A4-01 (`exercise-library.tsx:586-611`)** — `ExerciseDetailModal`'s effect unconditionally calls `apiClient.get('/sets', { params: { exercise_id, limit } })`. `GET /sets?exercise_id=` is personal data. For free users it fails (no auth on personal endpoints) → `setSetsError('Could not load history.')` permanently. Fix: add `isLocalFirst(user)` branch. Local-first path: `await localDb.init(); localDb.getAll<SetRecord>("SELECT ... FROM sets WHERE exercise_id = ? ... LIMIT ?", [exercise.id, limit])`. Pro path: existing REST call. Both map into the same `SetRecord` shape.

**A4-02 (`progress.tsx:191,219,238`)** — SYNTH-1 escalated this finding: the original report described a "lossy" `weight_raw` read, but the server's `normalizeSet` (`sets.js:35-36`) strips `weight_raw` entirely and returns only `weight_kg`. The `ApiSet` interface at `progress.tsx:85` declares `weight_raw: number`, so `s.weight_raw` is `undefined` for every server set. Line 219 computes `(undefined/8)*reps = NaN` for every volume bucket; line 238 passes `undefined` to the `epley` function for every PR. The local path at 296-297 is correct. Fix: change `ApiSet` to `weight_kg: number; weight_raw?: number`; add `const setKgPro = (s: ApiSet) => s.weight_kg ?? (s.weight_raw != null ? s.weight_raw / 8 : 0);` and use it at lines 219 and 238.

**LIB-01 (`strengthModelV3.ts:273-278`)** — `overallStrengthPercentile` and `overallStrengthPercentilePartial` pass `bwKg` directly to `dotsScore` with no guard. At `bwKg <= 0` the DOTS polynomial denominator becomes strongly negative; `Math.log(negative) = NaN`; `clampPct(NaN)` returns 0 silently. The two sibling functions `computeRankedPercentile:247` and `computePercentile:434` both have `if (e1rmKg <= 0 || bwKg <= 0) return 0`. Fix: add the same guard at the top of both functions.

**S3-01 (`insights.tsx:162,173-192`)** — Two independent unmount paths: the `load()` `useEffect` at line 162 starts an async load with no cancel flag and no cleanup return; `handleAckDeload` at lines 173-192 is an async `onPress` that calls `setDeload`/`setDeloadAcking` after awaits. Both race on rapid unmount/remount (e.g. tab switch). Concurrent `load()` calls race to settle — last-to-settle overwrites. Fix: promote a `mountedRef` to component scope; guard all setters; add `let ignore = false; return () => { ignore = true; }` to the load effect; gate every setter in `handleAckDeload` on `if (mountedRef.current)`.

**S3-02 (`WorkoutLoggerHost.tsx:450-481`)** — `startRoutine` is a `useImperativeHandle` method that allocates a `let cancelled = false` local variable, issues `getRoutine(user, routineId)`, and returns `() => { cancelled = true; }` as a cleanup. React does not call a cleanup returned from a `useImperativeHandle` method — only effect cleanups are called. The `cancelled` flag is unreachable by the time unmount happens. `handleStartStepper` calls `setRoutineSession`, `setStepperSets`, and `setStepperVisible` inside the `.then`, after unmount. Fix: use a component-level `startCancelledRef = useRef(false)` set to `true` in a `useEffect` cleanup; reset to `false` at the start of each `startRoutine` call; check it in `.then` and `.catch`.

**S3-03 (`peakAvatarOptions.ts:279-343`)** — JavaScript object literal semantics: when two properties have the same key, the later one silently wins. `violet` at line 283 is `'pro'` (hair) and at line 343 is `{streak:100}` (accent); JS keeps `{streak:100}`. `isUnlocked('violet', proUser=false)` now returns true at streak 100, not Pro-only. The wristband IDs in `WRISTBANDS_IDS` are `'teal','gold','neon'` but the tier map keys them `teal_wristband`/`gold_wristband`/`neon_wristband`; `isUnlocked('neon')` misses the map → falls back to `'free'`. Fix: rename all accent-theme IDs to `accentGold`, `accentSilver`, `accentTeal`, `accentRose`, `accentSky`, `accentViolet` and ensure wristband IDs match their tier keys. Add a `__tests__` assertion. Write an SQL UPDATE migration for `user_equipped_cosmetics` rows with old accent IDs.

---

## 6. P1 Findings

| ID | File:line | Problem | Fix |
|----|-----------|---------|-----|
| LIB-02 | `src/lib/trainingEngine/localContext.ts:92-96` vs `strengthModelV3.ts:391-393` | `ageBandFromBirthDate` emits `under_30`/`30_39` tokens; consumer keys are `under-18`/`25-34`; age multiplier silently always 1.0 on this path | Rewrite producer to output `strengthModelV3`'s exact `AgeBand` tokens; annotate return as `AgeBand \| null` |
| DATA-02 | `src/data/setEditing.ts:60-68` | Pro set-edit: delete-then-re-log with no rollback; failure after delete permanently loses the set | Reorder: re-log first, delete second; wrap caller in try/catch with failure toast |
| A4-04 | `app/workout-day.tsx:122-123,661-662` | `setVolumeKg`/`bestSetIds` gate on `s.weight_raw`; server strips it; Pro day view shows 0 volume, no PR highlight | Add `resolvedWeightRaw(s)` helper (`weight_kg != null ? weight_kg*8 : weight_raw ?? 0`); use in both gates |
| A6-02 | `app/data-export.tsx:82`, `app/recovery-code.tsx` | `staggerStyle(anim: Animated.Value)` no null guard → `anim.interpolate` throws if stagger array shorter than index | Copy `training-survey.tsx:288-291` pattern: widen to `Animated.Value \| undefined`; add `if (!anim) return {}` |
| DB-01 | `src/db/connector.ts:96` | `getCrudBatch()` called with 0 args (TS2554); works only via JS default — removal would silently zero out Pro uploads | `database.getCrudBatch(100)` — pin the current internal default |
| DB-02 | `src/db/localDb.ts:133` | `rawDb.execute` shim drops `opts` param declared by `MigrationDb` interface; invisible to tsc (optional) | Widen shim signature to include `_opts?: { tables?: string[] }` |
| DATA-03 | `src/data/profile.ts:293,298` | `WHERE id = '${ROW_ID}'` string-interpolated (only constant today; pattern hazard) | Replace with parameterized `WHERE id = ?` + `[ROW_ID]` |
| LIB-04 | `src/lib/insightsLocal.ts:380` | `computeDeload` reads `new Date()` internally → impure, nondeterministic, untestable | Add `now: Date = new Date()` as third parameter; default keeps callers working |
| A4-06 | `app/workout-day.tsx:919` | `sections[sections.length-1].exerciseId` — TS2532; crash if `sections` empties between renders | `sections.at(-1)?.exerciseId === section.exerciseId` |
| A4-07 | `app/workout-history.tsx:69-70`, `app/workout-day.tsx:137-138` | `dateStr.split('-').map(Number)` with no undefined guard → Invalid Date on malformed input | `const [y, m, d] = ...; return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)` |
| LIB-05 | `src/lib/insightsLocal.ts:250,272` | TS2532 on runtime-safe array tail access; masks real errors | Add `!` non-null assertions; or use `.at(-1)!` |
| A6-03 | `app/recovery-code.tsx:179` | `styles.card` does not exist in StyleSheet (TS2339); container renders unstyled | Rename to `styles.codeCard` (which exists) |
| A6-04 | `app/csv-import.tsx:107-144` | `handleImport` reads `localFirst` but deps are `[file]`; stale closure shows wrong tier message after in-session upgrade | Add `localFirst` to `useCallback` deps |
| A6-07 | `app/templates.tsx:338-342` | `selected.sessions[0]` typed `\| undefined` despite length guard (TS18048) | `const firstSession = selected.sessions[0]!;` |
| A6-01 | `app/templates.tsx:339` | `handleStartWorkout` POSTs `/workouts` with no tier guard; UI-flow-unreachable today but defense-in-depth gap | Add `if (isLocalFirst(user)) { setSelected(null); router.push('/(tabs)/log'); return; }` at top |
| SCORE-01 | `src/context/AuthContext.tsx:408` | Bootstrap token-clear lower bound `>= 200` should be `>= 400`; admits 2xx/3xx-with-"expired"-body as clear trigger | Change `status >= 200` to `status >= 400` in the `isDefinitiveAuthFailure` branch |
| HOME-01 | `app/(tabs)/index.tsx:478-500` | `getPercentile` + `loadPlan` effects: no cancel flag → setState after unmount on rapid tab switch | Add `cancelled = false` flag per effect; guard all setters; return `() => { cancelled = true; }` |
| HOOKS-02 | `src/hooks/useWorkout.ts:132-167`, `useWorkoutHistory.ts`, `useHealthMetrics.ts`, `usePlans.ts` | Four async hooks set state after awaits with no effect cleanup | Standard cancel token per effect; guard every setter; `AbortController` for fetch paths |
| ROUTINES-01 | `app/(tabs)/routines.tsx:220-228` | Toast `setTimeout` never stored/cleared → `setState` after unmount | Store timer in `useRef`; clear in cleanup effect and on re-show |
| API-02 | `src/api/routines.ts:34`, `plans.ts:57`, `groups.ts:55,175`, `constraints.ts:40`, `sets.ts:21`, `templates.ts:51`, `exercises.ts:108` | 8 response-envelope accessors have no `?? []` fallback → `TypeError` when drifted server returns `{}` instead of degrading | Apply `res.data?.routines ?? []` pattern (already used at `progress.ts:75`) to all 8 sites |
| HOOKS-03 | `src/hooks/useBodyweight.ts:46-47` | `catch {}` swallows all errors; no `error` state in `UseBodyweightResult` interface | Add `error: string \| null` field; populate in catch; expose in return |
| HOOKS-04 | `src/hooks/useGroups.ts:51,199` | `refetch: () => void` typed but the assigned `load` is `async` → `await refetch()` resolves before data loads | Change type to `refetch: () => Promise<void>` in both interfaces |
| HOME-02 | `app/(tabs)/index.tsx:777,845,892` | Three bottom-sheet Modals missing `paddingTop` inset; the `maxHeight:'80%'` sheet can reach the Dynamic Island | Import `useSafeAreaInsets`; add `paddingTop: Math.max(insets.top, 12)` to each sheet's inner View |
| HOME-03 | `app/(tabs)/index.tsx:468,626-627` | `plans[0].id` TS2532; `sortedKeys[i]`/`sortedKeys[i-1]` TS2769 → `new Date(undefined)` → NaN diff → `longestStreak` silently returns 1 | Narrow via `const first = plans[0]; if (first) ...`; guard `sortedKeys` index reads |
| PLANS-01 | `app/(tabs)/plans.tsx:466-468` | `PlanDetailModal` uses `SafeAreaView` inside `<Modal>` without manual inset; header clips under island | `useSafeAreaInsets()` + `paddingTop: Math.max(insets.top, 12)` on header View; match `LocalPlanModal:664` |
| RANKINGS-01 | `app/(tabs)/rankings.tsx:211` | `ConfirmSheet` `SafeAreaView`-in-`<Modal>` inside `Animated.View`; no manual top inset | `useSafeAreaInsets()` + `paddingTop: Math.max(insets.top, 12)` on `KeyboardAvoidingView` or drag handle |
| RANKINGS-02 | `app/(tabs)/rankings.tsx:605-611` | Median `values[mid-1]`/`values[mid]` are `number \| undefined` → potential NaN% display (3× TS) | `const lo = values[mid-1] ?? 0, hi = values[mid] ?? 0;` |
| S3-04 | `src/components/SetEntryForm.tsx:26,404` | Core `SafeAreaView` as Modal root (top-anchor) — header clips under island | Remove `SafeAreaView`; add `paddingTop: Math.max(insets.top, 12)` to header |
| S3-05 | `app/groups.tsx:277,392` | Create + Join modal `SafeAreaView edges` inside `<Modal>` — headers not inset-padded | Remove `SafeAreaView`; add top inset to header, bottom inset to sticky footer |
| S3-06 | `app/group-detail.tsx:541` | `GoalChangeModal` `SafeAreaView` in `<Modal>` — header not inset-padded | Remove `SafeAreaView`; add `paddingTop: Math.max(insets.top, 12)` to header |
| S3-07 | `app/(tabs)/profile.tsx:39,529` | `AddConstraintModal` core `SafeAreaView` in `<Modal>` — header not inset-padded | Remove `SafeAreaView`; add top inset to header, bottom inset to footer |
| S3-09 | `app/group-detail.tsx:925` | `GoalChangeModal currentGoal={3}` hardcoded → picker pre-selects 3 for all users; "no change" logic wrong for any goal ≠ 3 | Source real goal from profile/goal hook and pass it |
| S3-10 | `src/components/RoutineStrip.tsx:78`, `WorkoutLoggerHost.tsx:467` | `exercise_id: string \| null \| undefined` → `string`; null can reach `logSet` as `''` | Coerce at both map sites: `exerciseId: ex.exercise_id ?? ''` |
| S3-11 | `src/components/LiftProgressChart.tsx:135-141` | `fetcher.then()` has no `.catch` → rejection leaves `loading=true` forever (permanent spinner) | Add `.catch(() => { if (!cancelled) { setSeries(null); setLoading(false); } })` |
| S3-12 | `src/components/ExercisePicker.tsx:95-111` | Library fetch `.then(setLibrary)` has no cancel guard → late-resolve overwrites fresh list | Add `let cancelled = false; return () => { cancelled = true; }` |
| S3-13 | `src/components/PRToast.tsx:73-87` | Auto-dismiss `setTimeout` closes over `reduceMotion`/`onDismiss` not in deps (eslint-disabled) → stale callback | Convert `dismiss` to `useCallback` with full deps; remove eslint-disable |
| S3-14 | `app/(tabs)/profile.tsx:695-699` | `loadConstraints` effect has empty deps `[]` → constraints never reload on login/tier switch | Depend on `loadConstraints` (which already deps on `[user]`) |
| S3-15 | `app/insights.tsx:259,314,322,337` | 4× TS2345: `staggerAnims[n]` is `Animated.Value \| undefined`; safe at runtime but masks real errors | Annotate `useStaggerFade` return as a fixed-length tuple |

---

## 7. P2 Findings

P2 findings are grouped by systemic tag and listed concisely. These do not block a ship but should be worked into the next sprint.

**Performance / render stability:**
- **API-05** — `useWorkoutHistory.ts:276-278`: up to 90 concurrent `getSetsForWorkout` GETs (N+1 waterfall). Add batched `GET /sets?workoutIds=…` or cap to 30-day window.
- **HOME-06** — `index.tsx:647-651`: `handleRefresh` not `useCallback` → new `RefreshControl.onRefresh` each render. Wrap in `useCallback([refetch, loadPlan])`.
- **ROUTINES-02** — `routines.tsx:511-512`: `GestureHandlerRootView` nested in `SafeAreaView`, not at app root (RNGH gesture-conflict risk). Move to `app/_layout.tsx`.
- **S3-20** — `StepperLogger.tsx:682-687`: rest-timer effect keyed on `restLeft`; rapid "+30s" taps restart the 1 s tick, stalling the countdown. Use an absolute `restEndTimeRef` instead.
- **S3-24** — `profile.tsx:637,660`: `THEME_DISPLAY_NAMES` and `REST_TIMER_PRESETS` re-allocated every render of a 1980-line screen. Move to module scope.

**Error handling / degrade:**
- **DATA-04** — `src/data/routineHistory.ts:70,130`: two unbounded `GET /workouts` calls per screen load (duplicate). Extract `fetchProWorkouts()` with short-TTL module cache.
- **API-04** — `src/api/progress.ts:90,125`: `date: ''` phantom chart point when `logged_at` and `created_at` are both null. Add `if (!earliestAt) continue;` guard.
- **API-06** — `src/api/alternatives.ts:75`: `(err as any).isPaywall = true` mutates the axios error object. Define `class PaywallError extends Error {}` and throw typed.
- **SCORE-02** — `AuthContext.tsx:502,539,571`: `persistUser()` fire-and-forget races `router.replace`. `await persistUser()` at all three call sites (sub-millisecond write).
- **HOOKS-03 / HOOKS-05** — `useBodyweight.ts:46-47`, `useHealthMetrics.ts:230-298`: errors swallowed silently; no error state; HealthKit sync path can setState after unmount.
- **SCORE-03** — `ThemeContext.tsx:77-91`: theme-load IIFE has no `cancelled` guard (unmount-guard).
- **PLANS-02** — `plans.tsx:413-422`: `loadPlan` has no `isLocalFirst` guard (soft gate, UI-wiring-dependent). Harden with explicit tier check.

**Safe-area (bottom-clip only — lower blast radius):**
- **S3-16** — `MuscleHeatmap.tsx:325-402`: dismiss button under home indicator. Add `paddingBottom: Math.max(insets.bottom, 16)`.
- **S3-17** — `TemplateDetailSheet.tsx:25,82`: "Start Workout" footer under home indicator.
- **S3-18** — `WorkoutLoggerHost.tsx:104,1262`: alt-exercise + PIN sheet footers under home indicator.
- **S3-19** — `ThemeSelector.tsx:140-211`: centered modal, mild bottom risk.

**Misc:**
- **LIB-03** — `strengthModelV3.ts:196`: `fitLognormal` div-by-zero on identical loads (`szz=0`). Guard `if (!(szz > 0)) return { mu: ybar, sigma: 0, r2: 1 }`. (Edge case; live calibration data is strictly monotone.)
- **A6-06** — `templates.tsx:414`: `string | undefined` into a `string` prop (TS2322); RN silently renders nothing. Add `?? ''` fallback.
- **HOME-05** — `index.tsx:618-639`: "PRs this week" label vs rolling-7-day window mismatch. Rename label or compute ISO-week cutoff. (Product call.)
- **S3-21** — `WelcomeTour.tsx:188-216`: `resolveStep` cleanup discarded; rapid Next accumulates stale `setRect` timeouts. Store cleanup in `useRef`.
- **S3-22** — `OAuthButtons.tsx:319`: `onPress={handleApple}` floating promise. Use `onPress={() => void handleApple()}`.
- **S3-23** — `health-metrics.tsx:49-50`: `formatDate` destructures `month`/`day` as `number | undefined` → "Invalid Date". Use `new Date(dateStr + 'T00:00:00')`.

---

## 8. P3 Findings

(12 total — fix opportunistically; never block a ship on P3 alone.)

- **HOOKS-06** — `usePowerSyncLog.ts:347-369`: watch-loop `setSets` already behind `if (!aborted)`; optional additional `if (aborted) return` at top.
- **HOOKS-07** — `useRestTimer.ts:64-76`: nested `setSecondsLeft` inside `setEndTs` updater (impure updater, double-fire risk in Strict Mode). Read `endTs` from ref.
- **API-07** — `auth.ts:60-68`: orphaned JSDoc comment.
- **SCORE-05** — `types/api.ts:231`: stale `weight_raw/8` Epley comment (now superseded by weight_kg path).
- **SCORE-06** — `AuthContext.tsx:13-16`: header comment understates the transient-keep path.
- **RANKINGS-03** — `rankings.tsx:66,75`: `useReducedMotion` vs `useReduceMotion` double import — pick the project hook.
- **LAYOUT-01** — `_layout.tsx:54-56`: add a comment that `scale` SharedValue is intentionally omitted from deps.
- **S3-25** — `glossary.tsx:119-125`: deep-link scroll `idx > 0` off-by-one (skips first term); empty deps stale closure.
- **S3-26** — `group-detail.tsx:860-915`: 5 hardcoded hex literals violate the file's own "zero hardcoded hex" theme contract.
- **S3-27** — `group-detail.tsx:78`: `name.trim()[0]` TS2532; use `charAt(0)` which never returns undefined.
- **S3-28** — `groups.tsx:488-512`: `GoalPicker` in Create/Join modals discards its value silently. Wire it or remove it (product call).
- **S3-29 / S3-30** — `RoutineStrip.tsx:126`: unused `useRouter()` in `StripHeader`; `PressableCard.tsx:86-97`: `accessibilityRole="button"` without `accessibilityLabel`.

---

## 9. Dropped / Downgraded (False Positives)

These findings appeared in raw auditor output but were rejected after Opus source-verification. Their inclusion here is a credibility record — every finding in §5/§6 was not on this list.

| ID | Original sev | Action | Reason |
|----|-------------|--------|--------|
| A6-05 | P0 | Dropped | `AuthContext` sets `isLoading=false` *before* the background `Promise.race`, not after. The cached user renders immediately and the spinner does not gate on the network refresh. The finder itself concluded "No clear bug … overall pattern is correct." |
| A4-11 | P0 | Dropped | Finder explicitly stated "no bug today" — `one-rm.tsx` is a standalone calculator with no storage write; internally unit-consistent (display-in → display-out). |
| DATA-05 | P1 | Dropped as defect | `GET /exercises` is a global, no-auth, non-personal catalogue endpoint (confirmed server-side) — does not violate Invariant 1. The two allowed free-path network calls are the group weekly-signal and the exercise catalogue. |
| C-LOG-01 | P0 | Downgraded P0 → P3 (doc-only) | PlateCalculator `onUseWeight` traced end-to-end: stored kg → display → warm-up ladder → `setWeight` string → `displayToKg` in `handleStepperLogSet`. The prop is correctly typed `(displayWeight: number)` and every current caller passes display units. No current data corruption. |
| C-LOG-04 | P1 | Downgraded P1 → P3 (doc-only) | `SetEntryForm` is log-only (no `onUpdateSet`, no prefill); `buildLiftPayload` correctly calls `displayToKg`. No edit path exists. The safe-area issue on this component is real (S3-04, kept). |
| C-LOG-06 | P1 | Downgraded P1 → P3 | `RoutineEditorSheet.tsx:171` already applies `paddingTop: Math.max(insets.top, 12)` to the header via the hook. The `SafeAreaView edges=['top']` wrapper is redundant but not a clip bug. |
| C-LOG-11 | P2 | Kept P3 | `ScheduleEditorSheet.tsx:382` applies the correct manual inset AND wraps in `SafeAreaView`; possible double-pad but not a clip bug. Cosmetic cleanup. |
| C-REST-08 | P2 | Dropped (false positive) | The auditor retracted this themselves: `circumference` is in the deps array at `ReadinessCard.tsx:158`; `animVal` is a stable ref; cleanup `removeListener` is correct. Not a bug. |
| LIB-02 | P0 | Downgraded P0 → P1 | Real producer/consumer token-contract break, but SYNTH-1 traced all consumers: the `age_band` produced by `localContext.ts` never reaches a live percentile display (rankings screens read `user.age_band` from the server object, which is already in the correct dash-format). Nothing shown to a user is wrong today. Dormant feature-disable. |
| A6-01 | P0 | Downgraded P0 → P1 | `handleStartWorkout` POST is UI-flow-unreachable on the free path: `fetchTemplates` already gates the "All templates" server section behind `isLocalFirst` (line 275-279). A belt-and-suspenders fix is still recommended (listed as P1). |
| DATA-04 | P1 | Downgraded P1 → P2 | `Array.isArray(res.data)` guard already prevents the "silent broken feature" crash. Remaining issue is duplicate unbounded fetches — a performance concern, not a correctness failure. |
| LIB-03 | P1 | Downgraded P1 → P2 | `fitLognormal` div-by-zero is unreachable from the strictly monotone calibration data; only a degenerate partial-subset could hit it, and `clampPct` masks the display. Edge case. |
| A6-06 | P1 | Downgraded P1 → P2 | `string | undefined` into a `string` prop — React Native renders nothing, not a crash. Worst case is a missing empty-state string. |
| SCORE-02 | P1 | Downgraded P1 → P2 | The "silently swallowed" `persistUser()` claim is inaccurate: the function already wraps `SecureStore.setItemAsync` in try/catch and `console.warn`s on failure. The write-vs-`router.replace` race is benign (the only reader is the next cold-start). |
| HOOKS-06 | P2 | Downgraded P2 → P3 | The watch-loop setState is already guarded by `if (!aborted)` at line 360. The finding conceded "already partially mitigated." |
| API-03 | P1 | Dropped (subsumed) | `usePlans.ts:105` TypeError is fully resolved by fixing API-02's envelope accessor. Not an independent defect. |

---

## 10. Recommended Remediation Order

The sequence below respects the project's hard-gate rules (`CLAUDE.md §6`): every change requires a parse-sweep + `tsc --noEmit` delta check + migrations test before commit. Auth/math/tier/migration items require `/ultra-review` and a second-model pass (per `.claude/AGENT_TOOLKIT.md`). Nothing reaches the device without push + EAS rebuild.

**Sprint 1 — Ship blockers (do these before the next EAS build)**

1. **API-01** (`client.ts:143-146`) — auth interceptor Invariant 5 regression. Requires `/ultra-review`. Affects every Pro user on a flaky connection.
2. **A4-02** (`progress.tsx`) + **A4-04** (`workout-day.tsx`) — Pro analytics broken. Fix `ApiSet` type; add `setKgPro`/`resolvedWeightRaw` helpers. Same PR as they share the `weight_kg` fix pattern.
3. **A4-03** (`exercise-library.tsx:563,851,950`) — lbs-as-kg goal storage. Unit-conversion-critical; requires `/ultra-review` before commit.
4. **DATA-01** (`exportEngine.ts:226-231`) — SQL injection via backup JSON. Security defect; no key gate.
5. **S3-03** (`peakAvatarOptions.ts`) — cosmetic tier bypass (TS1117 + wristband mismatch). Include the DB migration for already-equipped rows. Requires `/ultra-review` for the migration step.
6. **HOOKS-01** (`usePowerSyncLog.ts:305`) — stale closure bakes in `localFirst`/`userId`. Tier-breach risk; requires `/ultra-review`.

**Sprint 2 — High-priority correctness (before next user-facing release)**

7. **A4-01** (`exercise-library.tsx:586-611`) — set-history modal tier breach (free users locked out).
8. **LIB-01** (`strengthModelV3.ts:273-278`) — unguarded `bwKg<=0` in percentile math.
9. **S3-01** (`insights.tsx`) + **S3-02** (`WorkoutLoggerHost.tsx`) — unmount-guard P0s.
10. **SCORE-01** (`AuthContext.tsx:408`) — bootstrap token-clear lower bound; batch with API-01.
11. **DATA-02** (`setEditing.ts:60-68`) — non-atomic Pro set-edit (reorder to re-log first, delete second).
12. **LIB-02** (`localContext.ts:92-96`) — age-band token mismatch; dormant but contract break.
13. **API-02** (8 envelope accessors) — add `?? []` fallback; one-line each, low risk, high degrade value.
14. **HOME-01 / HOOKS-02 / ROUTINES-01 / S3-12** — unmount-guard cluster; adopt single cancel-token pattern across all async hooks.

**Sprint 3 — Safe-area (device-visible on iPhone with Dynamic Island)**

15. All 9 confirmed `safe-area-modal` top-clip sites (S3-04 through S3-07, PLANS-01, RANKINGS-01, HOME-02); batch them — the plumbing (`useSafeAreaInsets`, header paddingTop) is identical across all.
16. Bottom-clip P2 sites (S3-16 through S3-19) in the same PR since the fix is symmetric.

**Sprint 4 — Remaining P1s and P2 error handling**

17. DB-01, DB-02, DATA-03, LIB-04 — small, isolated, each one-liner.
18. A4-06, A4-07, LIB-05, A6-03, A6-04, A6-07 — tsc null-safety fixes; each one-liner.
19. HOOKS-03, HOOKS-04, S3-10, S3-11, S3-13, S3-14, S3-15 — component-level P1s.
20. S3-09 — `GoalChangeModal` hardcoded `currentGoal={3}`.
21. P2 perf/error-handling (API-04, API-05, API-06, SCORE-02, SCORE-03, HOME-05, HOME-06, ROUTINES-02, PLANS-02, S3-20 through S3-24).

**Sprint 5 — P3 (opportunistic)**

22. All P3s (HOOKS-06/07, API-07, SCORE-05/06, RANKINGS-03, LAYOUT-01, S3-25 through S3-30). Fix in passing when touching nearby code; never schedule a dedicated sprint for P3 alone.

**Before any commit on Sprints 1-2:** run `node audits/full-review-2026-06-19/parse-sweep.js`, confirm `tsc --noEmit` error count does not increase above 59, run `node mobile/src/db/__tests__/migrations.test.js`. Math/auth/tier items additionally require `/ultra-review` + a second-model pass. After commit: `git push origin main` (server deploy) → `eas build` → install → test on device. A local commit alone changes nothing the user can see.

---

## 11. Appendix — Source File Index

**Static gate outputs:**
- `audits/full-review-2026-06-19/00-parse-sweep.txt`
- `audits/full-review-2026-06-19/00-tsc.txt`
- `audits/full-review-2026-06-19/00-migrations-test.txt`
- `audits/full-review-2026-06-19/00-security-greps.txt`
- `audits/full-review-2026-06-19/AUDITOR_BRIEF.md`
- `audits/full-review-2026-06-19/inventory.txt`

**Wave 1 — `src/` layer findings (8 auditors):**
- `audits/full-review-2026-06-19/findings/S-DATA.md`
- `audits/full-review-2026-06-19/findings/S-DB.md`
- `audits/full-review-2026-06-19/findings/S-LIB.md`
- `audits/full-review-2026-06-19/findings/S-HOOKS.md`
- `audits/full-review-2026-06-19/findings/S-API.md`
- `audits/full-review-2026-06-19/findings/S-CORE.md`
- `audits/full-review-2026-06-19/findings/C-LOG.md`
- `audits/full-review-2026-06-19/findings/C-REST.md`

**Wave 2 — `app/` screens findings (6 auditors):**
- `audits/full-review-2026-06-19/findings/A1.md`
- `audits/full-review-2026-06-19/findings/A2.md`
- `audits/full-review-2026-06-19/findings/A3.md`
- `audits/full-review-2026-06-19/findings/A4.md`
- `audits/full-review-2026-06-19/findings/A5.md`
- `audits/full-review-2026-06-19/findings/A6.md`

**Wave 3 — Opus synthesis:**
- `audits/full-review-2026-06-19/synthesis/SYNTH-1.md` — Data integrity, DB, math, local-first/weight-kg (lanes: S-DATA, S-DB, S-LIB, A4, A6)
- `audits/full-review-2026-06-19/synthesis/SYNTH-2.md` — Auth, API resilience, hooks, async lifecycle (lanes: S-API, S-CORE, S-HOOKS, A1, A3)
- `audits/full-review-2026-06-19/synthesis/SYNTH-3.md` — UI components, modals/safe-area, cosmetics gating, charts, perf/a11y (lanes: C-LOG, C-REST, A2, A5)
