# HOOKS findings

## Summary
Files reviewed: 14 (`useAuth`, `useAutoBackup`, `useBodyweight`, `useGroups`, `useHealthMetrics`, `usePercentile`, `usePlans`, `usePowerSyncLog`, `useReduceMotion`, `useRestTimer`, `useStreak`/`useLocalStreak`, `useSyncStatus`, `useWorkout`, `useWorkoutHistory`). Counts — P0: 1, P1: 4, P2: 2, P3: 1. The tier-branching and weight-encoding invariants are well-implemented across the refactored hooks; the main risks are stale-closure bugs in `usePowerSyncLog`, missing unmount guards in four async hooks, and a silent error swallow in `useBodyweight`.

---

### [P0] HOOKS-01 — `usePowerSyncLog.initWorkout` stale closure: `localFirst` and `userId` missing from `useCallback` deps

- **File:** `mobile/src/hooks/usePowerSyncLog.ts:222–305`
- **Problem:** `initWorkout` captures `localFirst` (line 229) and `userId` (line 233) via closure but its `useCallback` dep array is `[todayKey]` only (line 305). If `user` changes after mount (e.g. auth refresh resolves a previously-null user, or tier changes), the memoized callback retains the stale values. A free user who logs in post-mount will have `localFirst=true` and `userId=''` baked into the function — `ensureLocalWorkoutForDay` is called with an empty userId, silently creating an anonymous local workout that can never be cleaned up or associated with the real account. Symmetrically, a Pro user who logs in after a cold-start will fire the REST `createWorkout` path but skip it (stale `localFirst=true`) and write a local-only workout that never syncs.
- **Evidence:**
  ```ts
  const initWorkout = useCallback(async () => {
    // ...
    if (localFirst) {                                      // line 229 — stale if user tier changed
      const localWorkout = await ensureLocalWorkoutForDay(todayKey, userId); // line 233 — stale userId
    }
    // ...
  }, [todayKey]);  // line 305 — localFirst and userId MISSING
  ```
- **Invariant/Rubric:** P0 — Invariant 1 (local-first tier branch) + stale closure race condition.
- **Suggested direction:** Add `localFirst` and `userId` to the `useCallback` dep array: `}, [todayKey, localFirst, userId])`. Since `todayKey` is memoized to a stable string (line 203), the only re-creation will happen on real auth/tier changes, which is exactly when re-init is needed.
- **Confidence:** HIGH

---

### [P1] HOOKS-02 — `useWorkout`, `useWorkoutHistory`, `useHealthMetrics`, `usePlans` — no unmount guard; `setState` after unmount on slow async

- **File:** `mobile/src/hooks/useWorkout.ts:132–167`, `mobile/src/hooks/useWorkoutHistory.ts:144–328`, `mobile/src/hooks/useHealthMetrics.ts:160–224`, `mobile/src/hooks/usePlans.ts:95–116`
- **Problem:** All four hooks use `useCallback` async `load` functions that call multiple `setState` setters (`setIsLoading`, `setError`, `setWorkout`, `setSets`, `setHistory`, etc.) after `await` points. The `useEffect` that calls `load()` returns no cleanup cancellation token. If the component unmounts while a `localDb.getAll` or REST fetch is in-flight, all the subsequent `setState` calls fire on an unmounted component — this produces the React "Can't perform a state update on an unmounted component" warning in dev and, in concurrent-mode React Native, can cause stale state to be applied to a freshly remounted component. The SQLite path is fast in practice, but the REST Pro path (multi-`Promise.all`) is the higher-risk scenario.
- **Evidence (useWorkout representative):**
  ```ts
  const load = useCallback(async () => {
    setIsLoading(true);                          // setState 1
    try {
      const w = await ensureLocalWorkoutForDay(…); // <-- unmount can happen here
      setWorkout(w);                             // setState after unmount
      const setRows = await localDb.getAll(…);
      setSets(setRows.map(rowToSet));            // setState after unmount
    } finally { setIsLoading(false); }           // setState after unmount
  }, [localFirst, userId]);

  useEffect(() => { load(); }, [load]);          // no cleanup / cancel flag returned
  ```
- **Invariant/Rubric:** P1 — missing `useEffect` cleanup; `setState` after unmount.
- **Suggested direction:** Add a `cancelled` ref (or `AbortController` for fetch paths) inside the effect: `let cancelled = false;` before `load()`, check `if (cancelled) return;` before each `setState` inside `load`, and return `() => { cancelled = true; }` from the effect. `useLocalStreak` already demonstrates the correct pattern (`mountedRef`).
- **Confidence:** HIGH

---

### [P1] HOOKS-03 — `useBodyweight` silently swallows all errors; `error` state never exposed

- **File:** `mobile/src/hooks/useBodyweight.ts:36–51`, `mobile/src/hooks/useBodyweight.ts:20–28`
- **Problem:** The `reload` callback catches all exceptions with `catch { /* localDb unavailable */ }` and falls back to defaults with no `error` state field. The `UseBodyweightResult` interface does not include an `error` property. If the `daily_health_metrics` table query throws (schema drift, pre-migration cold start, or any other failure), the user silently sees stale/empty data with no indication anything failed — no banner, no retry, nothing. This violates the "every data hook should expose `loading` AND `error`" contract from the brief.
- **Evidence:**
  ```ts
  const reload = useCallback(async () => {
    try {
      const [l, h, cur] = await Promise.all([
        getLatestBodyweight(), getBodyweightHistory(), hasCurrentWeekEntry(),
      ]);
      setLatest(l); setHistory(h); setHasThisWeek(cur);
    } catch {
      // localDb unavailable (e.g. first run before init) — keep defaults.
      // ← no setError(), no error field in interface
    } finally { setIsLoading(false); }
  }, []);
  ```
  `UseBodyweightResult` interface: no `error` field (lines 20–28).
- **Invariant/Rubric:** P1 — silent failure; missing error state in data hook.
- **Suggested direction:** Add `error: string | null` to `UseBodyweightResult`, add `const [error, setError] = useState<string | null>(null)` to the hook, and in the catch block do `setError(err instanceof Error ? err.message : 'Failed to load bodyweight')` so callers can surface a retry UI.
- **Confidence:** HIGH

---

### [P1] HOOKS-04 — `useGroups` / `useGroupDetail` refetch returns `void` in interface but callers may `await` it expecting completion

- **File:** `mobile/src/hooks/useGroups.ts:51`, `mobile/src/hooks/useGroups.ts:199`
- **Problem:** The public interface declares `refetch: () => void` (lines 51, 199), but the actual `load` callback is `async` and returns a `Promise<void>`. The interface typing discards the promise, so any caller that writes `await refetch()` silently gets a `void` (the TS type system won't warn), and the `await` resolves immediately before the data has loaded. This is a latent race: if a mutation handler does `await leaveGroup(id); await refetch(); navigateAway()`, the navigation fires before the list is updated.
- **Evidence:**
  ```ts
  // UseGroupsResult interface:
  refetch: () => void;   // line 51 — discards the async promise

  // Returned value:
  refetch: load,         // load is async () => Promise<void>
  ```
- **Invariant/Rubric:** P1 — floating promise / type mismatch in returned API.
- **Suggested direction:** Change the interface to `refetch: () => Promise<void>` in both `UseGroupsResult` and `UseGroupDetailResult`. Same fix needed in any other hook that declares `refetch: () => void` but returns an async function.
- **Confidence:** HIGH

---

### [P2] HOOKS-05 — `useHealthMetrics`: no unmount guard in `sync()` callback; `load()` called after user navigates away

- **File:** `mobile/src/hooks/useHealthMetrics.ts:230–298`
- **Problem:** `sync()` is a `useCallback` that can be triggered by a user tap. It performs HealthKit permission requests and per-sample `localDb.execute` inserts, then calls `await load()` at lines 274 and 289. If the user navigates away during a HealthKit sync (which can take several seconds), `load()` fires multiple `setState` calls on an unmounted component. Unlike `useLocalStreak`, no `mountedRef` guards these paths. `sync` is also not cancellable — there is no way for the effect cleanup to abort an in-flight sync.
- **Evidence:**
  ```ts
  const sync = useCallback(async () => {
    // …HealthKit permission + sample loop…
    for (const sample of samples) {
      await localDb.execute(…);  // <-- unmount can happen here (multi-sample)
    }
    await load();  // line 274 — setState on unmounted component
  }, [localFirst, load, user]);
  ```
- **Invariant/Rubric:** P2 — setState after unmount in mutation path.
- **Suggested direction:** Add a `mountedRef` (same pattern as `useLocalStreak`) and gate all `setState` calls in both `load` and `sync` behind `if (!mountedRef.current) return`. Alternatively, wrap `sync` to no-op if `!mountedRef.current` before the first await.
- **Confidence:** MED (common in RN; React 18 concurrent mode makes it more likely to manifest)

---

### [P2] HOOKS-06 — `usePowerSyncLog`: watch loop sets state after `aborted=true` window due to async gap between `aborted` check and `db.getAll`

- **File:** `mobile/src/hooks/usePowerSyncLog.ts:347–369`
- **Problem:** Inside the `for await` watch loop, the guard `if (aborted) break` is checked at the top of each iteration (line 353), but then `db.getAll` (line 356) is awaited before checking `aborted` again (line 360). If the component unmounts between the `break` check passing and the `getAll` resolving, `setSets` fires on an unmounted component. The window is small but real on slow devices.
- **Evidence:**
  ```ts
  for await (const _ of db.watch(…)) {
    if (aborted) break;         // check passes
    wid = workoutIdRef.current ?? wid;
    const rows = await db.getAll<SetRow>(…);   // unmount can happen here
    if (!aborted) {             // second check — correct, but 'aborted' could flip between these
      setSets(rows.map(rowToSet));
    }
  }
  ```
- **Invariant/Rubric:** P2 — async race / setState after unmount.
- **Suggested direction:** The `if (!aborted)` guard before `setSets` (line 360) is correct and already present. This is already partially mitigated; consider also checking `if (aborted) return` immediately after the `getAll` awaits to be fully clean.
- **Confidence:** MED

---

### [P3] HOOKS-07 — `useRestTimer`: `recompute` reads `Date.now()` inside a `setEndTs` functional updater — correct but fragile pattern

- **File:** `mobile/src/hooks/useRestTimer.ts:64–76`
- **Problem:** `recompute` uses a functional `setEndTs((ts) => { … return null; })` to both read the end timestamp and derive `secondsLeft`. Calling `setSecondsLeft(left)` inside a `setEndTs` updater is a side effect inside a state updater, which violates React's purity requirement for updater functions. In Strict Mode / concurrent mode, React may invoke updater functions more than once speculatively, which would call `setSecondsLeft` multiple times per tick, resulting in flicker or incorrect state if the two calls compute a different `left` due to `Date.now()` drift.
- **Evidence:**
  ```ts
  const recompute = useCallback(() => {
    setEndTs((ts) => {
      if (ts === null) return null;
      const left = Math.round((ts - Date.now()) / 1000);  // side-effect: Date.now()
      if (left <= 0) {
        setSecondsLeft(0);   // nested setState inside updater — impure
        return null;
      }
      setSecondsLeft(left);  // nested setState inside updater — impure
      return ts;
    });
  }, []);
  ```
- **Invariant/Rubric:** P3 — impure state updater; may cause double-update in Strict Mode.
- **Suggested direction:** Read `endTs` from a ref instead of the functional updater, so `recompute` can compute `left` directly and call both `setEndTs` and `setSecondsLeft` in a normal (non-nested) fashion.
- **Confidence:** MED (real in Strict Mode dev; benign in production builds today)
