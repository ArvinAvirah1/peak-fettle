# Verification Report — 2026-07-01 (independent re-review of the 2026-06-30 bug fixes)

Scope: re-verify Bugs 1–3 fixes from SESSION_SUMMARY_2026-07-01.md with a fresh deep dive.
Verdict: **all three fixes are correct as shipped**; the deep dive found **3 secondary defects**, all fixed this session.

## Per-bug verdicts

### Bug 3 — sign-out / delete-account loop: CORRECT ✅ (+1 gap fixed)
- All 9 `LOCAL_RESET_ASYNC_KEYS` verified against their real definition sites (splash, WelcomeTour, Tooltip, ScheduleEditorSheet, keyStore, onboarding, backupManager, exerciseNames, WorkoutLoggerHost). No suffixed key variants exist, so `multiRemove` catches everything. `@peak_fettle/theme` correctly preserved.
- `localDb.init()` / `execute(sql, params, {tables})` signatures match. Teardown is wired into `_clearAuthState` (logout + definitive-401), free-tier delete-account, and (via logout) paid-tier delete-account. Invariant 5 holds: transient failures never reach teardown.
- OAuth consume-once guard (`handledResponseRef`) is correct: deps of the effect are stable, a failed login doesn't lock the button (a new `promptAsync` yields a new response object).
- **GAP FIXED:** pre-migration snapshots survived logout — `migration_snapshots` table AND `pf_premigration_v*.json` files (each a FULL JSON backup of personal tables via `buildBackupFromDb`). `localReset.ts` now clears the table and deletes the files (best-effort, dynamic expo-file-system require).

### Bug 2 — Pro toggle-back duplicates: CORRECT ✅ (+1 defect fixed)
- Ledger survives Pro→Free→Pro (downgrade is not a logout) ✅; server GET fallback is non-fatal ✅; `upgradeToPro` fast-path on already-paid ✅.
- **DEFECT FIXED:** dedup keyed on routine NAME ONLY, but local names are not unique (no schema constraint, no UI guard). Two distinct routines named e.g. "Push Day" would collapse onto one server id — the second one's exercises silently never uploaded. Now keyed on `canonicalRoutineKey(name, exercises)` (name + normalized content, round-trip-safe vs the server's Zod/jsonb). Identical replay still adopts (Bug 2 stays fixed); distinct same-named routines now POST separately. Worst-case failure mode is a duplicate (pre-fix behaviour), never data loss.

### Bug 1 — free-tier touch lag: CORRECT ✅ (+1 fragility hardened)
- `AuthContext` and `ThemeContext` `useMemo` dep arrays verified complete and correct; all callbacks in the chain are `useCallback`-stable. `TourProvider` already memoized; `PowerSyncProvider` renders children straight through (no context value). `useGroups`/`useGroupDetail` 6s deadline is sound (bounds `isLoading`, no extra network call).
- **HARDENED:** `RootLayout` passed `onThemeChange` as an inline arrow — `setTheme` is `useCallback([onThemeChange])`, so any future RootLayout re-render would have silently defeated the whole-tree ThemeContext memo. Hoisted to module-level `syncThemeToServerIfPro` (stable identity, identical behaviour).
- On-device confirmation after the next EAS build is still the remaining step for this bug.

## Environment note (important for future sessions)
Host-side Write/Edit through the cowork mount **silently truncated** `migrateToPro.ts` mid-function during this session (cap appears lower than the previously assumed ~33 KB). Repaired by rebuilding the full file and writing via the sandbox shell (`cp` from /tmp), which propagates correctly in both directions. Prefer shell-side writes for any file > ~25 KB. `AuthContext.tsx` (33.3 KB) was deliberately left untouched.

## Verification gate (re-run after all changes)
| Check | Result |
|---|---|
| Babel parse-sweep (mobile/app + mobile/src) | 171 files, **0 failures** |
| Migrations test | **12/12 pass** |
| Engine test | **8/8 pass** |
| `tsc --noEmit` | **57 → 57 (delta 0)** — the 4 AuthContext hits are pre-existing expo-router route-typing errors |
| Engine prototype (`run-samples.mjs`) | exit 0 |

## Files changed this session
- `mobile/src/data/localReset.ts` — + `migration_snapshots` table, + snapshot-file deletion
- `mobile/src/data/migrateToPro.ts` — name+content routine dedup (`canonicalRoutineKey`)
- `mobile/app/_layout.tsx` — hoisted `syncThemeToServerIfPro` to module scope

## Still open (unchanged from session summary)
1. Engine v2 test-run approval → parametric port (gated).
2. On-device confirmation of Bug 1 after push + EAS build.
3. Deploy SRV-USER-02 server fix to Railway (paid-tier account deletion).
4. Commit hygiene: exclude the pre-existing June-audit server line-ending diffs from the bug-fix commit.
