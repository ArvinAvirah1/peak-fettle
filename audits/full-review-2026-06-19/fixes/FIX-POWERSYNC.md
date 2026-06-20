# FIX-POWERSYNC — HOOKS-01 (P0)

**Branch:** `fix/full-review-2026-06-19`
**Finding:** HOOKS-01 (P0) — CLAUDE.md Invariant 1 (local-first tier integrity)
**Rationale:** `audits/full-review-2026-06-19/synthesis/SYNTH-2.md`

## File changed
- `mobile/src/hooks/usePowerSyncLog.ts`

## The bug
`initWorkout`'s `useCallback` dependency array was `[todayKey]`, but the callback
body reads two values derived from `user`:
- `localFirst` = `isLocalFirst(user)` (boolean)
- `userId` = `user?.id ?? ''` (string)

Because the callback was memoized only on `todayKey`, it captured `localFirst`
and `userId` from the **first render**. At cold start `user` is `null`, and
`isLocalFirst(null)` returns `true` while `userId === ''` (verified in
`mobile/src/data/backup/tierPolicy.ts`). If `user`/tier resolves AFTER mount the
stale closure caused two failure modes:

1. **Free user → `userId===''` workout.** First render takes the local-first
   path and calls `ensureLocalWorkoutForDay(todayKey, '')`, writing a local
   workout owned by the empty string. The callback never re-fired with the real
   id.
2. **Pro user → never syncs.** Stale `localFirst === true` keeps the Pro user on
   the local-only branch (skips `createWorkout` / server hydrate / outbox
   enqueue), so their session silently never reaches the server.

## The fix
Added `localFirst` and `userId` to the dependency array:
```
}, [todayKey, localFirst, userId]);
```
When `user` resolves, both primitives change (`'' → real id`, default `false`/
`true` → correct tier), re-firing `initWorkout` so it always runs on the current
tier/user. No `userId===''` workout can be created and Pro users take the sync
path.

**Loop-safety:** both deps are primitives (boolean / string) recomputed each
render from `user` — not fresh object identities — so they are stable per render
and adding them cannot create an infinite re-subscribe loop. (`todayKey` is a
`useMemo` constant; the existing `useEffect` that invokes `initWorkout` already
keys on the callback identity.)

The hook's external API (`UsePowerSyncLogResult`) is unchanged.

## Concerns
None. Surgical, single-file, primitive-only deps. The TS gate / parse-sweep runs
after this change per the project DoD.
