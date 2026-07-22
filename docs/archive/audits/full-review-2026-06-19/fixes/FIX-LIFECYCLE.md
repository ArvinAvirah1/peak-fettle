# FIX-LIFECYCLE — S3-01 + S3-02 (P0 setState-after-unmount)

Branch: `fix/full-review-2026-06-19`
Implementer: FIX-LIFECYCLE (Opus)
Scope: 2 files, surgical. No external API changed.

## Files changed
- `mobile/app/insights.tsx`
- `mobile/src/components/WorkoutLoggerHost.tsx`

## Fixes

### S3-01 (P0) — insights.tsx — `unmount-guard`
Added a component-scoped `const mountedRef = useRef(true)` cleared by a real
`useEffect(() => () => { mountedRef.current = false; }, [])`. Guarded every
post-`await` setState on `mountedRef.current`: the `load()` callback (both the
free-tier early branch and after `Promise.all`), `onRefresh`, and the deload-ack
`Alert` `onPress`. Added an `ignore` flag in the loading `useEffect` (returned in
its cleanup) so a stale concurrent `load()` can't clobber fresher state or flip
`loading` after unmount. `useRef` was already imported.

### S3-02 (P0) — WorkoutLoggerHost.tsx — `unmount-guard`
`startRoutine` (a `useImperativeHandle` method) previously declared `let cancelled
= false` and `return () => { cancelled = true; }` — React never invokes a function
returned from an imperative-handle method, so the flag was dead and `getRoutine()`
was uncancellable (setState-after-unmount on slow networks). Hoisted a
component-level `const mountedRef = useRef(true)` cleared by a real unmount
`useEffect`; removed the dead `cancelled` local and the bogus cleanup return;
guarded the post-await `.then` (before `handleStartStepper`) and the `.catch`
(before `Alert.alert`) on `mountedRef.current`. The imperative-handle external API
(`startRoutine(routineId, routineName): void`) is unchanged.

## Verification
- `@babel/parser` (jsx + typescript) parse-sweep of both on-disk files: **OK / OK** (0 failures).
- Confirmed guards present on disk (insights: 6 guarded sites; WLH startRoutine: .then + .catch guarded, dead pattern removed).
- The other `let cancelled = false; … return () => { cancelled = true; }` blocks in WLH (lines ~272/314/340/437) are genuine `useEffect` cleanups — correct, left untouched.

## Concern
Both files were found **truncated mid-token on disk** after the Edit tool reported
success (insights cut at line 350 `onSuggestSubstitu…`; WLH cut at line 1297
`'row`). This is the documented mount truncation bug (CLAUDE.md / MEMORY: "Write AND
Edit truncate files on this mount"). Recovered by reconstructing each file from its
intact `HEAD` blob + re-applying the edits, then writing via `cat >` (mount-safe) and
re-parsing the on-disk result. Final on-disk files are intact and parse clean
(insights 14432 B / 389 ln; WLH 58868 B / 1333 ln). Flagging because: (1) the
`Edit`/`Write` tools cannot be trusted on this mount even though the repo is out of
OneDrive — use `cat >` + re-verify; (2) any other implementer in this run who edited
via the file tools and did NOT re-parse the on-disk result may have left a truncated
file in the working tree. Recommend a full parse-sweep of all edited files before commit.
