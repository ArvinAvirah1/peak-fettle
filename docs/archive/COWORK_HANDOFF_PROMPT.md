# Cowork handoff prompt — paste the block below into a fresh Cowork session

Everything described is already **committed on `main` (NOT pushed)**. Cowork's job: verify, finish two small
items, then ship. No body-model work remains.

---

You are continuing work on **Peak Fettle**, a React Native / Expo fitness app (local-first; Node/Express +
Postgres server) at `C:\Users\aavir\dev\Peak Fettle`. A prior session fixed 7 reported issues AND rebuilt the
exercise body model; **all of it is already committed on `main` (not pushed).** Your job: (1) verify, (2)
finish two small remaining items, (3) ship. Do NOT redo or revert the completed work.

**Read first, in the repo:** `CLAUDE.md` (architecture invariants — non-negotiable) and
`BODY_MODEL_AND_REMAINING_SCOPE.md` (full status of all 8 issues + what's left).

### Task 1 — Verify (gate)
Run the project definition-of-done yourself (self-reports are not trusted): `@babel/parser`
(`{plugins:['jsx','typescript']}`) sweep of `mobile/app` + `mobile/src` + `peak-fettle-agents/server` → 0
failures; `node --check` each server `.js`; `node mobile/src/db/__tests__/migrations.test.js` (12/12);
`node mobile/src/lib/trainingEngine/__tests__/engine.test.js` (8/8); `tsc --noEmit` must not exceed ~59 errors
(the baseline — all pre-existing expo-router typed-route strings + a chart `Value` type).

### Task 2 — Free-tier first-paint (the one real remaining bug)
In `mobile/src/db/migrations.ts`, `runMigrations` runs a per-launch backup snapshot (`buildBackupFromDb`)
BEFORE the first query resolves, so a populated FREE account can render empty until the user switches tabs.
Skip the snapshot when `user_version` shows no pending migration (it already tracks `user_version`), or move it
off the first-paint path. Keep DB ops drift-tolerant.

### Task 3 — (optional) Pro server survey-sync
The expanded survey fields persist locally for all tiers, but for PRO they don't sync because the server
ignores them. To enable sync, whitelist + add `users` columns in `peak-fettle-agents/server/routes/user.js`
PATCH: `primary_focus, injuries, muscle_priorities, bodyweight_kg, training_days, birth_date`. FREE works
without this — skip unless the founder asks.

### Task 4 — Ship
Re-run the gate (Task 1). Commit your changes with the `peak-fettle-commit` skill (inspect the staged set for
stray deletions first — a prior commit swept staged deletions and caused a prod outage). **Do NOT `git push`
without the founder's explicit OK** — a push to `main` is a Railway PRODUCTION deploy (server `auth.js` +
`user.js` go live). After approval, the founder runs `eas build` (iOS) from `origin/main`, installs, and tests
on-device (per `BODY_MODEL_AND_REMAINING_SCOPE.md` §5 step 4).

### Body model — already DONE (do not rebuild)
`react-native-body-highlighter` (v3.2.0, MIT) is integrated in `mobile/src/components/MuscleMap.tsx` — a real
human front/back, male/female body, recoloured to the active theme (muscle = `bgElevated`, separations/contour
= `borderDefault`, worked muscle = `accentDefault`), with `LABEL_TO_SLUGS` mapping our canonical muscle groups
to the library's slugs. `StepperLogger` already passes `groups/size/view/sex`; `react-native-svg` (peer dep)
was already present. Type-clean. The ONLY optional follow-up is on-device colour/scale tuning if the founder
wants a different muscle tone or a brighter highlight.

**Invariants (CLAUDE.md):** free users make NO personal REST calls; weights stored as exact kg (convert only
via `constants/units.ts`); modal headers need `insets.top`; DB ops drift-tolerant (degrade on 42P01/42703);
auth cold-start must not clear the token on transient failure; the parse-sweep is the real DoD. Investigate
before editing; Opus-level care.

---
