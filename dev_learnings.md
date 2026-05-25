# Peak Fettle — Dev Learnings & Best Practices

A record of bugs, root causes, and the practices that prevent them. Updated 2026-05-25.

---

## L-001 · OneDrive corrupts the working tree

**What happened.** The entire repo lives in OneDrive Documents. OneDrive's live-sync process writes files while Node, git, or the agent are also writing them. This caused:
- Source files truncated mid-token (cut off inside a string, object, or JSX element).
- Duplicate `StyleSheet.create` blocks with a stray premature `});`.
- Annotation comments dropped mid-line, accidentally commenting out the real code after them.
- Corrupt git index (`bad index file sha1 signature`) and multi-pack-index.

**Why it's dangerous.** A truncated file can still be committed — git doesn't syntax-check blobs. The corruption then lives in HEAD and `git show HEAD:<path>` returns a broken file. A roadmap or manual review that only reads git history will miss it.

**Best practice.**
- Move the repo out of OneDrive (e.g. `C:\Users\aavir\dev\Peak Fettle`) and use GitHub for remote backup. OneDrive sync and git do not mix.
- Until the repo is moved, run a `@babel/parser` sweep over `mobile/app` and `mobile/src` (and `node --check` over all server `.js`) after every edit session — not just when a build fails. The sweep is fast and catches truncation that prose review misses.
- Verify each git blob before trusting it: `git show HEAD:<path> | node --check` (or parse it). Do not assume committed == correct.
- After any OneDrive-side corruption incident, walk `git log --format=%h -- <path>` and parse each blob to find the newest one that actually compiles.

---

## L-002 · Write tool silently truncates files > ~33 KB

**What happened.** When the agent used the Write tool to save a large file (e.g. `plans.js` at ~567 lines), the file was silently cut off partway through, producing a valid-looking but syntactically broken file with no error or warning.

**Best practice.**
- For any file likely to exceed ~33 KB, write/repair it via a bash heredoc directly on the mount (e.g. `cat > file << 'EOF'`) and then verify the byte count and line count.
- After writing, always do `node --check <file>` or `npx babel-parser <file>` before committing — never trust a large file written by the Write tool without verification.

---

## L-003 · Mock auth bypassed the entire authentication model

**What happened.** `AuthContext.tsx` originally had `USE_MOCK_AUTH = true` as the default. This meant any build that didn't explicitly toggle the flag:
1. Accepted any credentials (no backend call at all).
2. Granted a hardcoded `tier: 'paid'` profile to every "user".

Production builds could have shipped with this active, giving every user a paid tier and a non-functional auth model simultaneously.

**Root cause.** The flag was `true` by default and there was no guard on `__DEV__` or an explicit env var.

**Fix applied (MOCK-001, 2026-05-16).** Mock auth is now only enabled when ALL of the following hold:
1. `__DEV__ === true` (automatically false in EAS preview/production profiles).
2. `EXPO_PUBLIC_USE_MOCK_AUTH=true` is set at build time in `.env.local` (gitignored).

**Best practice.**
- Feature flags that bypass security gates must default to `false` (opt-in, not opt-out).
- Tie mocks to `__DEV__` AND a named, non-default env var so an unconfigured machine never runs mocked auth.
- Never commit `.env.local` — keep it in `.gitignore` and document it in `.env.example`.

---

## L-004 · Global `isLoading` in AuthContext unmounted the login screen on errors

**What happened.** `login()` and `register()` were calling `setIsLoading(true)` at the start of the request. The root layout renders a splash spinner when `isLoading` is `true`, which unmounts the entire screen tree. When the API returned an error, `setIsLoading(false)` was called — but the login screen had already been unmounted and its local error state destroyed, so the error silently disappeared and the user saw the login screen reappear with no explanation.

**Root cause.** `isLoading` has two different semantic meanings: (1) the cold-start bootstrap delay and (2) "a request is in flight." Conflating them caused an unintended full-screen remount.

**Fix applied.** `isLoading` is now exclusively for the cold-start bootstrap spinner. Login and register screens manage their own `isSubmitting` state for their loading buttons. `login()` and `register()` in AuthContext never touch `isLoading`.

**Best practice.**
- Keep loading states scoped to their component. A global loading flag should mean "the app isn't ready yet," not "a button is spinning."
- If a global state unmounts part of the screen tree, that state should only be toggled from a global lifecycle event (cold start, session expiry), never from an individual user action.
- When auth errors are invisible, check whether the screen was remounted by looking at the root layout's render conditions.

---

## L-005 · EAS builds pull from the git remote, not the working tree

**What happened.** Assets and config changes (including `eas.json`, `assets/icon.png`) were edited locally but not pushed to `origin/main`. EAS Build pulled the remote and built from the old version, producing `ENOENT: ./assets/icon.png` errors even though the file existed locally.

**Fix applied.** Updated `eas.json` to include `EXPO_PUBLIC_API_URL` for all three build profiles (development/preview/production) and pushed to the remote before triggering EAS.

**Best practice.**
- Before every `eas build` run: confirm `git status -sb` shows no uncommitted or unpushed changes.
- EAS reads the environment from `eas.json` — set `EXPO_PUBLIC_*` vars there, not only in `.env.local`, for preview and production builds.
- The production API URL must be the real deployed URL (`https://peak-fettle-production.up.railway.app`), not a placeholder from the initial scaffold.

---

## L-006 · `EXPO_PUBLIC_*` env vars are baked at build time, not runtime

**What happened.** The app was built with `EXPO_PUBLIC_API_URL` pointing at `http://localhost:3001` (the dev default) because `eas.json` didn't set the variable for preview/production profiles.

**Fix applied.** Added `EXPO_PUBLIC_API_URL` explicitly to all three EAS build profiles.

**Best practice.**
- `EXPO_PUBLIC_*` vars are embedded at bundle time by Metro. They cannot be changed after the build. Every EAS profile must declare any public env var it needs.
- Do not rely on `.env.local` for EAS builds — that file is gitignored and not present on the EAS build server.

---

## L-007 · Server JS files had null bytes and truncated content from OneDrive

**What happened.** OneDrive appended null bytes after `module.exports = router;\n` in `workouts.js`. Node.js cannot parse null bytes and threw `SyntaxError: Invalid or unexpected token` at the end of the file, crashing the server on startup. Similarly, `plans.js` was truncated mid-template-literal, also crashing on startup.

**Fix applied.**
- `workouts.js`: `tr -d '\000' < file > /tmp/clean.js && cat /tmp/clean.js > file`
- `plans.js`: restored from the last good git blob (`63038c3`), re-applied the lost changes, verified with `node --check`.

**Best practice.**
- After any OneDrive corruption incident, run `node --check` on every server `.js` file, not just the one that triggered the error. Multiple files are usually affected at once.
- Keep the git blob history as a recovery tool: `git log --format=%h -- <path>` + `git show <hash>:<path>` to find the last clean version.

---

## L-008 · `return next('route')` silently disabled a route handler

**What happened.** The rest-day `POST /workouts/rest-day` handler had `return next('route')` as its very first line (unreachable code after it). Express skipped it entirely and fell through to a duplicate handler that was missing the `day_key` column in its INSERT, causing a NOT NULL constraint violation in Postgres — so every rest-day log silently failed with a 500.

**Root cause.** A duplicate handler block was added (probably during a code migration) above the original one. The `return next('route')` was a placeholder/guard that should have been removed.

**Fix applied.** Removed `return next('route')` from the first handler. Deleted the entire duplicate handler block.

**Best practice.**
- `next('route')` skips to the next *route* handler (not middleware). Using it at the top of a handler is equivalent to deleting the handler. Never leave it in as a "disabled" marker — delete the block entirely.
- When you see two route handlers registered on the same method + path, that's almost always a bug. Express will always hit the first one unless it explicitly calls `next('route')`.
- Test every new server endpoint with a real HTTP call (curl or Postman) before marking it done. A handler that always forwards to the next route will pass all unit tests that mock the handler but fail all integration tests.

---

## L-009 · List endpoints return summaries; detail endpoints return the full resource

**What happened.** `GET /templates` returns template summaries with no `sessions` field. The templates screen set the modal's `selected` state directly from the list item. `selected.sessions.length` then threw because `sessions` was `undefined`.

**Fix applied.** Added a `handleSelectTemplate` function that immediately opens the modal (with the summary data) and simultaneously fetches `GET /templates/:id` to load the full sessions list, updating `selected` when the fetch completes.

**Best practice.**
- Any time you tap into a detail modal from a list, assume the list item is a summary and the detail endpoint has extra fields. Fetch the detail on tap.
- Guard all array accesses on data that comes from an API: `selected.sessions?.length ?? 0` instead of `selected.sessions.length`.

---

## L-010 · Mock data structures must exactly match the real type

**What happened.** `MOCK_LIBRARY` in `exercises.ts` was typed as `ExerciseLibrary` but was structured as `{ lift: [...], cardio: [...] }` instead of the correct `{ exercises: { lift: [...], cardio: [...] } }`. When the real API failed and the fallback was used, every consumer of `exerciseLibrary.exercises` got `undefined`, causing TypeErrors throughout the app.

**Fix applied.** Restructured `MOCK_LIBRARY` to include the `exercises` wrapper key.

**Best practice.**
- When you write a mock, copy-paste the type definition above it as a comment. Then verify the mock satisfies the type — TypeScript's structural typing catches this at compile time if you don't use `as any`.
- Mock IDs must be valid UUIDs if the server validates them with Zod `z.string().uuid()`. Use `crypto.randomUUID()` or a fixed valid UUID like `'00000000-0000-0000-0000-000000000001'`.

---

## L-011 · Utility functions that call string methods must guard against null/undefined

**What happened.** `liftIdToName(liftId)` called `liftId.split('_')` unconditionally. If `ranking.lift_id` came back `null` or `undefined` from the API, the function threw `TypeError: Cannot read properties of undefined (reading 'split')`, crashing the rankings screen.

**Fix applied.** Added a null guard: `if (!liftId) return 'Unknown lift';`

**Best practice.**
- Any utility that takes a string should accept `string | null | undefined` in its type signature and handle the falsy cases explicitly. TypeScript will then flag any callsite that passes a nullable value.
- Rankings and activity screens depend on data computed by a weekly batch job. Null values are an expected, not exceptional, state for new users.

---

## L-012 · Error messages from API 400 responses were swallowed

**What happened.** When `POST /sets` returned a 400 with Zod validation details, the app showed "Failed to log set" or nothing at all. Developers couldn't tell what field was invalid. Users couldn't either.

**Root cause.** The catch block read `err.message` from the Axios error, which is just "Request failed with status code 400" — the actual Zod `details` array is in `err.response.data.details`.

**Fix applied.** Updated `SetEntryForm.tsx` to extract `err.response.data.details[0]` and format it as `"<field>: <message>"` so both the user and developer can see exactly what failed.

**Best practice.**
- Server validation errors should always be surfaced to the user in a human-readable form. Never swallow them into a generic "something went wrong."
- When a Zod 400 fires in production and you can't read server logs, the only signal is the error shown in the app. Make it count.
- Server error shape: `{ error: 'validation_failed', details: ZodIssue[] }`. Mobile should pattern-match on `data.error === 'validation_failed'` and render `details[0].path + details[0].message`.

---

## L-013 · Push token format and send transport must match

**What happened (PUSH-001).** The mobile app registered using `Notifications.getExpoPushTokenAsync()` (Expo token, `ExponentPushToken[...]`). The cron `push-dispatcher.js` sent it to FCM's Legacy HTTP API (`fcm.googleapis.com/fcm/send`). FCM rejects Expo tokens as `InvalidRegistration`, then the dispatcher nulled the `fcm_token` column — so every push silently failed and the token was wiped after the first attempt.

**Fix applied.** Switched the dispatcher to the Expo Push API (`https://exp.host/--/api/v2/push/send`), which accepts Expo tokens directly.

**Best practice.**
- `getExpoPushTokenAsync()` → Expo Push API only.
- `getDevicePushTokenAsync()` → raw FCM / APNs only.
- Never mix the two. When the client and server push paths are written in separate changes, explicitly document which token format + which endpoint they use.
- Auto-clearing tokens on send failure is dangerous. A config/transport bug masquerades as "stale tokens" and silently destroys every user's registration. Only null a token if the error is specifically `DeviceNotRegistered`/`NotRegistered`.

---

## L-014 · A "reviewed manually" claim in a roadmap is not verification

**What happened (PUSH-002).** A commit was described in the roadmap as "full rewrite, reviewed manually" and declared "no code defects remain." In reality, OneDrive had truncated the file mid-comment at line 224 during the commit, dropping the entire dispatch loop, the summary log, `module.exports`, and the CLI block. The file threw `SyntaxError` on `require`. The cron crashed on load and every push silently failed.

**Best practice.**
- Run `@babel/parser` / `node --check` mechanically after every edit. Prose review misses truncation.
- "Reviewed manually" in a roadmap means a human read the text. It does not mean the file compiles or that logic was verified end-to-end.
- Before shipping any push/notification feature, send a test push from a real device and verify receipt. Silent failure is indistinguishable from success unless you check.

---

## L-015 · Git lock files cannot be removed on the agent mount

**What happened.** On the OneDrive mount, `rm` and `mv` return "Operation not permitted." Git leaves `.git/index.lock` and `.git/refs/heads/main.lock` when a previous process was interrupted. `git commit` and `git update-ref` both fail because they try to create these lock files and find them already present — but can't remove them either.

**Workaround.**
```bash
IDX=/tmp/pf_$(date +%s%N).idx
export GIT_INDEX_FILE=$IDX
export GIT_AUTHOR_NAME=ArvinAvirah1 GIT_AUTHOR_EMAIL=aavirah23@gmail.com
export GIT_COMMITTER_NAME=ArvinAvirah1 GIT_COMMITTER_EMAIL=aavirah23@gmail.com
git -c core.multiPackIndex=false read-tree HEAD
git -c core.multiPackIndex=false add <path>
TREE=$(git -c core.multiPackIndex=false write-tree)
COMMIT=$(git -c core.multiPackIndex=false commit-tree $TREE -p HEAD -m "msg")
printf '%s\n' "$COMMIT" > .git/refs/heads/main
git -c core.multiPackIndex=false log --oneline -1
```

**Best practice.**
- Moving to a non-OneDrive path eliminates this permanently.
- Always use a fresh, timestamped temp index (`/tmp/pf_$(date +%s%N).idx`) — never reuse one from a previous sandbox session (different uid, can't be removed).
- Pushing is not possible from the agent sandbox. After committing, give the user the `git push origin main` command to run from their own machine.


## L-016 · Mock exercise IDs that fail UUID validation block set logging

**Root cause.** `getExercises()` falls back to `MOCK_LIBRARY` on any server failure. The mock IDs were `'ex-001'`, `'ex-002'`, etc. — not UUIDs. The server's Zod schema uses `z.string().uuid()` for `exercise_id`, so every set logged with a mock exercise ID returned HTTP 400 `validation_failed`. Because the error was swallowed (L-012), the user saw nothing but a failure.

**Fix.** Mock IDs changed to UUID format: `'00000000-0000-0000-0000-000000000001'` through `'00000000-0000-0000-0000-000000000010'`. These are valid UUIDs that Zod accepts.

**Real fix.** Seed the production database with the exercises library so `getExercises()` never falls back to mock. Run `migrations/20260502_seed_exercise_library.sql` in the Supabase SQL editor.

**Best practice.** Any mock data that flows into a server request must pass that server's validation. If the server uses `z.string().uuid()`, the mock must use a UUID. Review every mock ID whenever a new Zod schema is written.

---

## L-017 · `RETURNING` clause referencing unapplied migration columns causes 500 on prod

**Root cause.** `PATCH /user/profile` had a `RETURNING` clause listing columns added in later migrations (`use_1rm_confirmation`, `theme_preference`, `fcm_token`). If the production database had not run those migrations yet, the `UPDATE … RETURNING` query threw `column "use_1rm_confirmation" does not exist` → 500. The client's catch block silently reverted the UI — the user saw the unit selector flip back with no explanation.

**Fix.** `RETURNING` pared back to only columns present in the baseline schema:
```sql
RETURNING id, unit_pref, experience_level, weight_class_kg
```

**Best practice.** A `RETURNING` clause is as fragile as a `SELECT`. Every column it names must exist in every deployment that runs the route. When a migration adds a column, audit all routes that touch that table and defer adding the new column to `RETURNING` until the migration is confirmed deployed on prod.

---

## L-018 · Silent catch blocks turn server errors into phantom UI resets

**Root cause.** Profile update (unit pref, experience level) caught API errors with an empty `catch` block and called `setUnitPref(user?.unit_pref)` to "roll back" the UI — so the user saw their change silently revert. No alert, no log output. The actual cause (`RETURNING` clause 500, Zod UUID rejection) was invisible.

**Fix.** Every catch that rolls back UI state must also show an `Alert.alert` with the real error message extracted from the response body (`data.message ?? data.error ?? err.message`).

**Best practice.** A catch block that swallows errors is worse than no try/catch at all — it actively hides problems. Always either: (a) surface the error to the user, or (b) log it with enough context for a developer to find it. Prefer both. "Silent rollback" is never an acceptable UX pattern for a failed write.

---

## L-019 · Tab crashes with no error boundary show a blank screen with no feedback

**Root cause.** A JS render-time exception in a tab screen (e.g., `.map()` on `undefined`) unmounted the entire screen with no error state — the user saw a white/dark blank with no way to recover or report the error.

**Fix.** `TabErrorBoundary` (class component with `getDerivedStateFromError`) wraps each tab screen. On error it shows a "Something went wrong" card with the error message and a "Try again" button that resets the boundary.

**Best practice.** Every tab screen that fetches data or does complex rendering should be wrapped in an error boundary. This is especially important on React Native where there is no browser console visible to end users. The error boundary should log to `console.error` (for Sentry/Crashlytics in production) and display the message so it can be reported.

---

## L-020 · OneDrive truncates files mid-write — always verify after any write

**Root cause.** OneDrive's live-sync process can truncate a file mid-write, leaving it cut off mid-token, mid-line, or at an exact byte boundary. This hit `index.tsx` which was 1013 lines but the mount showed only 1000 lines ending with `moda` (the start of `modalOverlay`). No write error is raised — the file silently ends early.

**Fix.** Restore the complete version from the git object store (`git show HEAD:<path> > <path>`), verify the HEAD blob itself parses, apply the diff on top, then write via `cat tmp > target` and recount lines.

**Best practice.** After every Write/Edit tool call on files in the OneDrive path, immediately run `wc -l` and `tail -5` to confirm the file ends where it should. For any file that matters, follow with a parse check (`node --check` for JS, `@babel/parser` for TSX). Never assume a write succeeded because the tool didn't raise an error.


## L-021 · Mock exercise names collide with real DB names under different UUIDs

**Root cause.** `searchExercises()` fell back to `MOCK_EXERCISES` on any server search failure. The mock included standard exercises ("Deadlift", "Squat", "Bench Press") with placeholder UUIDs (`00000000-...-000003` etc.). When the search server was unavailable, the user saw "Deadlift" in the picker but with a fake UUID. That UUID passes Zod `z.string().uuid()` validation but is not a row in the `exercises` table — the `sets.exercise_id` FK constraint fires on INSERT → 500. Meanwhile, exercises like "Alternating Dumbbell Curl" that are NOT in the mock only appear via real server results, so they always carry a valid UUID and succeed.

**Fix.** `searchExercises()` now returns `{ results: [], total: 0 }` on failure instead of mock data. The "Add as custom exercise" button replaces the fallback — it calls `POST /exercises` and gets a real server UUID.

**Best practice.** Any mock data that flows into a server-side FK must share the same UUID as the real row. If it can't (because the real UUID is unknown at dev time), don't surface it as a selectable result — show an empty state instead. A mock UUID that looks legitimate to the client but fails a DB FK is worse than no result.

---

## L-022 · `searchExercises` mock fallback silently disabled free-text exercise entry

**Root cause.** Because `searchExercises()` always returned *something* (even on failure), there was no "no results" code path to hang a "create custom" CTA on. The user was implicitly forced to pick from the library with no escape hatch.

**Fix.** Empty results from `searchExercises()` now trigger a visible "Add '[query]' as custom exercise" button. Tapping it calls `POST /exercises` (upsert by name) and immediately selects the result.

**Best practice.** Any input-backed list that restricts to a fixed set should always offer a "create new" escape. Design the empty state first — it defines the user's only path forward when their desired item doesn't exist.

---

## L-023 · Weight display precision: kg×8 fixed-point round-trips lose quarter-lb accuracy

**Root cause.** The server stores weight as `weight_raw SMALLINT` (kg × 8, nearest eighth-kg). On a lbs round-trip: 45 lbs → 20.412 kg → `ROUND(163.29) = 163` → `163/8 = 20.375 kg` → `20.375 × 2.20462 = 44.919 lbs`. The `formatWeight` function displayed `44.9 lbs` with no rounding, confusing users who entered `45`.

**Fix (band-aid).** `formatWeight` now applies `Math.round(lbs × 4) / 4` before `toFixed()` when unit is lbs. Standard plate weights (45, 135, 225 lbs) round-trip exactly because they land on quarter-pound boundaries through the kg×8 encoding.

**Long-term fix.** Store the user's entered weight in their preferred unit so no conversion happens for display. The kg conversion is only needed for the server-side E1RM/percentile computation.

---


## L-024 · Calling an undeployed DB function → always-500 on a whole tab

**What happened.** `GET /percentile` (and its `/lift/:liftId` alias) both called `compute_wilks_score()` — a PostgreSQL function that was planned but never had a migration deployed. Every request 500'd, making the Rankings tab always show an error. No exception was surfaced in the Railway logs beyond a generic function-not-found error. The roadmap described the function as "OD-2 (deferred)" but the code still called it.

**Root cause.** The route was written referencing a future DB function without a `NULL` stub fallback. When the migration didn't land, the code was never updated to guard the call.

**Fix applied.** Replaced both `ROUND(compute_wilks_score(...)::NUMERIC, 2)::DOUBLE PRECISION AS wilks_score` calls with `NULL::DOUBLE PRECISION AS wilks_score`, matching the "OD-2 deferred" roadmap intent. Also removed the `JOIN users u` that was only needed to feed sex/weight_class params to the missing function.

**Best practice.**
- Any DB function call in a route must have a corresponding migration. If the migration is deferred, the route must return `NULL` (or omit the field) with a comment explaining when it will be populated.
- Before deploying a server file that calls a DB function, verify the function exists: `SELECT proname FROM pg_proc WHERE proname = 'function_name'`.
- If a whole UI tab always errors, the first suspect is a server-side query that references something that doesn't exist (function, column, view). Check Railway logs for `42883` (undefined function) or `42703` (undefined column).

---

## L-025 · API response shape mismatch: server returns array, client expected object

**What happened.** `GET /workouts` returns a plain `ApiWorkout[]` array. The workout history screen used `res.data?.workouts ?? []`, expecting `{workouts: [...]}`. This always evaluated to `undefined ?? []`, making the history screen permanently empty even with real workout data.

**Root cause.** The server was written first and returned a plain array (simpler for the initial implementation). The client was written later and assumed the common envelope pattern `{workouts: []}` without checking the actual server response.

**Fix applied.** Changed to `Array.isArray(res.data) ? res.data : []`. Also verified the server's `GET /workouts` query included `total_sets`, `exercise_count`, and `total_volume_kg` via a LEFT JOIN + GROUP BY — these fields are rendered on each row. The server was updated to include them in the same pass.

**Best practice.**
- When writing a client-side fetch, always check the actual server route (in `peak-fettle-agents/server/routes/`) to confirm the response shape. Don't assume envelope vs. bare array.
- Any time a list screen is perpetually empty despite confirmed backend data, immediately check what `res.data` actually contains vs. what the client dereferences.

---

## L-026 · OneDrive injects null bytes after Edit tool writes (not just truncation)

**What happened.** After the Edit tool made a targeted change to a file, the resulting file parsed fine initially but later had ` ` null bytes appended after the final valid character. This caused `SyntaxError: Invalid or unexpected token` at a line beyond the actual end of the file. The issue is distinct from OneDrive truncation (L-001) — the file was the right size but contained null-byte padding.

**Root cause.** OneDrive apparently pads or re-pads files after a write. The null bytes appear at the end and are invisible in most text editors.

**Fix applied.** After every file write to the mount (Edit tool or bash), strip null bytes:
```python
with open(path, 'rb') as f:
    raw = f.read()
cleaned = raw.replace(b'\x00', b'')
if len(cleaned) != len(raw):
    with open(path, 'wb') as f:
        f.write(cleaned)
```

**Best practice.**
- After any file write on the OneDrive mount, run the null-byte strip above before committing.
- Build this check into every file-verification pass alongside `node --check`. A file can have null bytes even if `wc -l` and byte count look correct.
- Prefer writing via `cat /tmp/file > mount/target` (which overwrites cleanly) over the Edit tool for large files or files that have already been corrupted once.

---

---

## Summary: pre-build checklist

Before triggering an EAS build or deploying the server, run through this:

1. **Parse sweep**: `npx babel-parser` over `mobile/app` and `mobile/src` with `jsx` + `typescript` plugins. `node --check` on every file in `peak-fettle-agents/server`.
2. **No null bytes**: `grep -rPl '\x00' peak-fettle-agents/server` — should return nothing.
3. **EAS env vars**: confirm `eas.json` has `EXPO_PUBLIC_API_URL` set to the real Railway URL for all non-dev profiles.
4. **No debug flags**: confirm `USE_MOCK_AUTH` evaluates to `false` for non-dev builds (it should automatically since it requires `__DEV__ === true`).
5. **Pushed to remote**: `git status -sb` shows no ahead commits. EAS reads from `origin/main`.
6. **Server health**: hit `GET /health` on the Railway deployment and confirm it returns 200.
7. **Push smoke test**: after a new EAS build, send one test push notification from the admin panel and verify it arrives on device.
