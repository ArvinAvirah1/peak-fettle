# Peak Fettle — Remaining Scope + Body-Model Spec (2026-06-19)

A multi-agent session addressed 8 reported issues. This doc records what is **DONE**, what is
**REMAINING**, and the **full spec for the exercise body-model rebuild** (the main remaining build)
so it can be finished in another session (e.g. Cowork). Read alongside `CLAUDE.md` (architecture
invariants — non-negotiable) and `TRAINING_ENGINE_SPEC_2026-06-11.md`.

> Verification status: each lane self-verified (per-file `@babel/parser` sweep + `tsc` no-increase).
> A unified parse-sweep was run after all four lanes completed: **211 files (167 ts/tsx + 44 server js),
> 0 failures.** The full ship gate (§5) still must be run before release.

---

## 1. Status of the 8 reported issues

| # | Issue | Status | Where |
|---|-------|--------|-------|
| 1 | Forced sign-in on every launch | **DONE** | `AuthContext.tsx`, `server/routes/auth.js`, `api/client.ts` |
| 2 | HTTP 400 when changing username | **DONE** | `server/routes/user.js` (PATCH `display_name` branch) |
| 3 | Pages don't load until you tab-switch | **PARTIAL** | Pro: fixed via #1. Free: residual `migrations.ts` snapshot fix **REMAINING** (§4) |
| 4 | "Your plan / here's why" unreadable + split "based on nothing" | **DONE** | `lib/trainingEngine/*`, `training-survey.tsx`, `plans.tsx` |
| 5 | Weight should default to country | **DONE** | `constants/locale.ts`, onboarding/profile (US → lbs only) |
| 6 | Can't exit "Start a workout" (top buttons under the island) | **DONE** | `StepperLogger.tsx` (header `insets.top`) |
| 7 | Sign-in button dead until app restart | **DONE** | `api/auth.ts` (timeouts + guards), auth screens |
| 8 | Choose-exercise model: sex-match, much more muscular, back view for back work | **DONE** | `view`/`sex` wiring + real human body via `react-native-body-highlighter` in `MuscleMap.tsx` (§3) |

Bonus root-cause: the random username "64t9tvkymn" was the local-part of an **Apple "Hide My Email"**
relay address; the OAuth path used it as the display name. The server no longer stores relay/token-shaped
names, and onboarding now asks for a name (#2 / #5 lane).

---

## 2. DONE — summary (files already changed in the working tree)

**Auth (issues 1, 3-Pro, 7):**
- Root cause of #1: a single-use refresh-token **rotation race** — on cold start the app fired Pro data
  calls before the access token existed → a 401 → the bootstrap and the 401-interceptor both refreshed the
  *same* token → the loser got `invalid_token` → the session was wiped.
- Fixes: 30s server-side rotation **grace window** + unique `jti` per token (`server/routes/auth.js`); a
  client **bootstrap guard** that suppresses logout during the cold-start refresh; durable keychain storage
  (`keychainAccessible: AFTER_FIRST_UNLOCK`) in `AuthContext.tsx`.
- #7: auth API calls had **no timeout** → a hung request left the button permanently disabled. Added 15s
  timeouts in `api/auth.ts` + re-entrancy guard + defensive navigation.

**Identity + units (issues 2, 5):**
- #2: `PATCH /user/profile` now validates + persists `display_name` (the empty-`SET` → `no_fields` 400 is gone).
- #5: `expo-localization` added; new `constants/locale.ts` `defaultUnitForLocale()` → `'lbs'` only when device
  region is `US`, else `'kg'`; applied as a default that never overrides an explicit choice.
- Ask-at-signup: onboarding opens with "What should we call you?" (prefilled from email); Home greeting
  rejects random-looking tokens and falls back to the email local-part.

**Plans / survey / engine (issue 4):**
- Survey now **drives** the engine: `lib/trainingEngine/localContext.ts` reads the saved `user_profile` row
  and merges it over the in-memory user (a 6-day survey now yields a real 6-session week, not the old 3-day default).
- "Here's why" rewritten into plain sentences citing the user's real numbers (`lib/trainingEngine/reasoning.ts`);
  the verbose technical chain is kept only as an internal `debugTrace`.
- Survey expanded (schema **v8**): training days, injuries/limitations, muscle-group priorities, bodyweight + DOB.
- Generation rules improved (a >idealDays request repeats quality sessions instead of padding rest days;
  muscle-priority bias in `exerciseFill.ts`).

**Workout logger (issues 6, 8-wiring):**
- #6: the prior fix wrongly pushed the whole page down; corrected so only the **header row** gets
  `paddingTop: Math.max(insets.top, 12)` (the close/collapse control now clears the Dynamic Island), and the
  over-correction was removed.
- #8 wiring: `StepperLogger.tsx` now passes `<MuscleMap groups size view sex />` — `view` flips to `'back'`
  for posterior-dominant exercises, `sex` comes from the user, figure enlarged 40 → 64.

---

## 3. Body-model rebuild — DONE (2026-06-19)

> **STATUS: DONE.** The hand-drawn SVG never read as human, so it was replaced by
> **`react-native-body-highlighter` (v3.2.0, MIT)** in `mobile/src/components/MuscleMap.tsx` — a real anatomical
> **front/back, male/female** human body with **per-muscle highlighting**, recoloured to the active theme
> (resting muscles = `bgElevated`, separations + contour = `borderDefault`, worked muscle = `accentDefault`).
> Type-checked clean (`tsc` 59 = baseline, 0 new errors). Canonical labels → library slugs in `MuscleMap.tsx`
> `LABEL_TO_SLUGS`; the `StepperLogger` contract (`groups/size/view/sex`) is unchanged; `react-native-svg` peer
> dep was already present. **Remaining: on-device visual tuning ONLY** (muscle-fill contrast / `scale`) after the
> EAS build, plus an optional female-proportion glance. The original spec below is retained for reference.

### (reference) original spec — Body-model rebuild

**Founder decision (2026-06-19):** a realistic **anatomical muscle figure** like the supplied reference
(full-body **front + back**, all major groups), but **MONOCHROME — no anatomy-chart red** — to fit the dark
theme. **Sex-matched** (male + female). Back view for posterior exercises. **CRITICAL — full muscle coverage (écorché):** the muscles must TILE THE ENTIRE BODY exactly like the
reference — the body contour IS the outer edge of the muscle mass. Do NOT draw a separate skin silhouette
larger than the muscles with muscle blobs floating inside (the rejected first attempt did exactly that).
Fill the whole figure with the muscle tone and carve the groups with darker separation LINES. Monochrome only
(no red); the founder is choosing a base tone — options shown: **Slate** (neutral, recommended), **Graphite**
(darker), **Bronze** (warm). Worked muscles highlight in the app's teal accent at runtime.

**Reference described** (for a session without the image): a 3D-rendered male muscular figure shown front and
back with labelled groups — front: neck, traps, shoulders, chest, biceps, forearms, abs, quadriceps, calves;
back: traps, shoulders, upper back, triceps, forearms, lower back, glutes, hamstrings, calves. Match that
anatomical read; drop the pink/red; recolor to the app's dark theme with a teal highlight for worked muscles.

**Contract already in place** (do not break): `StepperLogger.tsx` renders
`<MuscleMap groups={canonicalGroups} size={64} view={'front'|'back'} sex={'male'|'female'|null} />`.
`MuscleMap.tsx` today has **identical** front/back outlines, a thin androgynous silhouette, no `sex`, and no
muscularity. `StepperLogger` currently casts the prop because `MuscleMapProps` lacks `sex`.

**Build:**
1. Add `sex?: 'male' | 'female' | null` to `MuscleMapProps` (removes the cast alias in `StepperLogger.tsx:47`).
2. Implement four muscular, monochrome, theme-tokened figure variants: **male-front, male-back, female-front,
   female-back**. Real back anatomy (traps diamond, lats V, erector spinae, glutes, hamstrings, gastroc) must
   differ from front (pecs, serratus, abs, delts, quad sweep). Female variant: adjusted proportions, still
   clearly athletic/muscular.
3. Keep the highlight API: `groups` → `MUSCLE_REGION_IDS` (in `data/muscleRegions.ts`). Extend the region-id
   map so each canonical muscle highlights the correct shape(s) on the new figures, per view.
4. Colors via theme tokens (`useTheme()`): body fill ≈ `bgElevated`, separations ≈ `borderDefault`, highlight =
   `accentDefault`. No hardcoded red. Keep the component `memo`-ized.
5. **Approach A (recommended — ships now, fully themeable, per-muscle highlight is trivial):** pure-SVG écorché.
   The candidate geometry (front + back muscle layout) is in the appendix below — refine it into male/female.
   **Approach B (only if photoreal is required):** bundle four monochrome anatomy assets (male/female ×
   front/back) + an SVG highlight-overlay layer aligned per muscle. Heavier, asset-dependent.
6. Optional: a `modelStyle` prop if the founder wants all three finishes selectable in-app (TBD — confirm).

**Files:** `mobile/src/components/MuscleMap.tsx`, `mobile/src/data/muscleRegions.ts` (+ optional
`mobile/src/components/bodyModels/*`). Do not edit `StepperLogger.tsx` beyond removing the now-redundant cast.

**Acceptance:** a back exercise shows a real back; a chest exercise highlights the pecs on the correct-sex body;
the figure is visibly muscular; no red anywhere; parses clean; `tsc` does not increase.

---

## 4. REMAINING (smaller items)

- **Free-tier first-paint (issue #3 residual):** `mobile/src/db/migrations.ts` `runMigrations` runs a
  per-launch backup snapshot (`buildBackupFromDb`) **before** the first query resolves, so a populated free DB
  can render empty until you switch tabs. Skip the snapshot when `user_version` shows **no pending migration**
  (or move it off the first-paint path). It already tracks `user_version`. (Auth-lane handoff; not yet done.)
- **Server-side survey sync for Pro (optional):** `PATCH /user/profile` in
  `peak-fettle-agents/server/routes/user.js` ignores the new survey fields, so for Pro they persist only
  locally. To sync, whitelist + add `users` columns: `primary_focus`, `injuries`, `muscle_priorities`,
  `bodyweight_kg`, `training_days`, `birth_date`. **Free works fully without this.**

---

## 5. SHIP checklist (nothing reaches the phone until this is done)

1. **Gate** (project DoD, run yourself — self-reports are not trusted):
   - `@babel/parser` (`{plugins:['jsx','typescript']}`) sweep of `mobile/app`, `mobile/src`, and
     `peak-fettle-agents/server` → **0 failures**.
   - `node --check` every server `.js`.
   - `node mobile/src/db/__tests__/migrations.test.js` → 12/12.
   - `node mobile/src/lib/trainingEngine/__tests__/engine.test.js` → 8/8.
   - `tsc --noEmit` must not exceed the ~59-error baseline (expo-router typed-route strings + a chart `Value`).
2. **Commit** with the `peak-fettle-commit` skill. **Inspect the staged set for stray deletions first** — a
   prior commit swept staged agent-session deletions and caused a prod outage.
3. `git push origin main` = **Railway PROD deploy** (server: `auth.js` + `user.js`). Founder approval required.
4. `eas build` (iOS) **from origin/main**; install; on-device test: cold-launch stays signed in; change
   username (no 400); generate a plan (6-7 days is reflected; "here's why" reads cleanly); start a workout →
   can exit; body model is sex-matched + shows the back for back work; a US device defaults to lbs.

---

## 6. Architecture invariants (condensed from CLAUDE.md — do not violate)

1. **Local-first:** FREE users (`!is_paid`) make **no** personal REST calls; branch on
   `data/backup/tierPolicy.ts`. Group weekly-signal is the only allowed free network call.
2. **Weight stored as exact kg** (`sets.weight_kg`); convert display↔storage only via `constants/units.ts`.
3. **Safe-area does NOT propagate into a `<Modal>`** — apply `paddingTop: Math.max(insets.top, …)` to the
   header row directly.
4. **Prod DB has drifted** from `db/schema.sql`; guard DB ops, degrade on `42P01`/`42703`, no temp tables.
5. **Auth cold-start** must not block on the network or clear the token on transient (non-401) failure.
6. **The verification gate is the real DoD** — run the parse-sweep yourself; do not trust a prose "reviewed".
7. **Disjoint file ownership** across agents avoids conflicts (no worktree needed).
8. **Nothing ships without push + EAS rebuild.** Commit → `git push origin main` (= Railway deploy) → `eas build`.

---

## Appendix — candidate SVG muscle geometry (Approach A starting point)

120×270-ish local space per figure (center x ≈ 60). Refine into male/female and theme the fills.

```
BODY OUTLINE (front & back share this silhouette):
M60 8 C71 8 77 17 76 28 C75 36 71 42 66 45 C78 47 89 52 98 60 C108 67 113 77 113 90
C113 104 110 118 107 131 C105 142 102 152 100 162 C99 169 100 175 102 182 L94 182
C92 173 90 163 89 153 C87 140 85 127 82 116 C80 106 78 99 75 94 C79 114 81 134 81 151
L80 171 C88 186 92 205 90 223 C89 236 86 245 82 252 L75 252 C73 239 72 226 71 213 L63 177
L57 177 L49 213 C48 226 47 239 45 252 L38 252 C34 245 31 236 30 223 C28 205 32 186 40 171
L39 151 C39 134 41 114 45 94 C42 99 40 106 38 116 C35 127 33 140 31 153 C30 163 28 173 26 182
L18 182 C20 175 21 169 20 162 C18 152 15 142 13 131 C10 118 7 104 7 90 C7 77 12 67 22 60
C31 52 42 47 54 45 C49 42 45 36 44 28 C43 17 49 8 60 8 Z

FRONT muscle shapes (highlight ids → these):
neck-scm  M55 47 L58 45 L59 56 L56 57 Z   |   M65 47 L62 45 L61 56 L64 57 Z
traps     M41 58 Q53 52 58 56 L57 62 Q49 60 43 64 Z   (mirror for right)
delts     ellipse 22,76,12,13   |   98,76,12,13
pecs      M45 67 Q58 65 59 69 L59 87 Q50 91 43 86 Q41 75 45 67 Z   (mirror)
biceps    ellipse 16,106,8,16   |   104,106,8,16
forearms  ellipse 18,147,7,18   |   102,147,7,18
abs       rects (51|61, y=93/105/117, 8×10 r2) + lower M52 130 Q60 136 68 130 L66 140 Q60 144 54 140 Z
obliques  M41 112 Q45 122 44 134 Q40 128 39 118 Z   (mirror)
quads     rectus ellipse 49,200,8,26 (mirror 71); vastus-lat M34 178 Q29 200 36 226 Q41 210 42 188 Z (mirror); vastus-med ellipse 47,228,7,11 (mirror 73)
knees     ellipse 44,243,6,6   |   76,243,6,6

BACK muscle shapes:
traps     M60 50 L73 60 L71 90 L60 99 L49 90 L47 60 Z  + spreads M47 60 Q34 64 24 74 L31 84 Q42 74 49 72 Z (mirror)
delts     ellipse 22,76,12,13   |   98,76,12,13
triceps   ellipse 16,106,8,17   |   104,106,8,17
teres     ellipse 47,93,9,8   |   73,93,9,8
lats      M45 98 Q34 112 40 142 L53 150 L55 112 Q51 102 45 98 Z   (mirror)
erectors  rect 54,118,5,34 r2   |   61,118,5,34 r2
glutes    ellipse 49,166,15,13   |   71,166,15,13
hamstrings ellipse 48,205,12,24   |   72,205,12,24
calves    ellipse 45,240,8,13   |   75,240,8,13
forearms  ellipse 18,147,7,18   |   102,147,7,18
```
