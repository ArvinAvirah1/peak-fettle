# Dev handoff — today's tickets (2026-06-06)

Goal: complete the tickets opened today (TICKET-093…099) that don't need founder input, match spec, verify, and flag the rest.

## ✅ Implemented (code-complete; parse-sweep + tsc clean; needs on-device test)

### TICKET-098 — Bundle beginner templates (3-day PPL, 6-day PPL, Upper/Lower) + safe swaps
- **New** `mobile/src/data/beginnerTemplates.ts` — all 3 splits, every exercise as a stable `slug` → real library name; **no barbell back squat / no conventional deadlift** (Leg Press, Hack Squat, DB RDL, Hip Thrust). Resolver `buildBundledSession()` maps slug → library UUID at load and **degrades gracefully offline** to a name-only session (stepper accepts that, per TICKET-088).
- **Wired** `app/templates.tsx`: a "BEGINNER PROGRAMS · WORKS OFFLINE" section rendered above the server list (so it shows even when the API is down); day-tap → opens the stepper.
- **Wired** `app/(tabs)/index.tsx`: handles `?bundledProgram=&bundledDay=` → builds the session locally → `startSession()`.
- Identifier scheme question (the one open blocker) resolved: the library has **no slug column** — rows are UUID + name; the bundled file carries its own stable slug and resolves by name.

### TICKET-095 — Interactive welcome tour
- **New** `mobile/src/components/tour/WelcomeTour.tsx` — thin custom coach-mark overlay (spotlight + tooltip + Back/Next/Skip + step dots), theme-tokened, **no new dependency**. 6-step script over the real screens; missing anchors fall back to a centered tooltip (never blocks/crashes).
- `TourProvider` wraps the Stack in `app/_layout.tsx`. Auto-starts **once** after onboarding (Home mount checks `@peak_fettle/tour_seen`); **Replay** entry added to Profile. Anchors registered on Home ("Start workout") and Routines ("＋ New" + "Create schedule").

### TICKET-097 — Split scheduling (PHASE 1 only: data model + resolver + UI)
- **New** `mobile/src/data/schedule.ts` — `cycle | weekly` model, on-device persistence (new `schedule` table), and the **shared `resolveNextUp()` resolver** (the same one the widgets will use). Cycle advances on START of a slot (Phase-1 choice; isolated `advanceCycle()` so it can move to completion-based later).
- **New** `mobile/src/components/ScheduleEditorSheet.tsx` — build a repeating cycle (distinct A/B/C routines + rest days, reorderable) or a weekday map.
- **Wired** `app/(tabs)/routines.tsx`: "Create schedule" button + a "Next up" strip at the top.
- **Schema** `mobile/src/db/localSchema.ts`: added `schedule` table (additive, idempotent).
- **DEFERRED to founder (Phase 2): the lock/home-screen widgets** — that's a native WidgetKit/App-Widget target + App Group wiring + a dev/EAS build. The ticket itself says "ship the schedule UI + resolver first, widgets second."

### TICKET-096 — Avatar (PHASE 1 only: concept options)
- Per the ticket's **hard gate**, no avatar code was written. Deliverable for your decision: `AVATAR_CONCEPTS_2026-06-06.html` — four art directions (Flat Chunky / Soft Blob / Bold Sticker / Peak Pals), three sample characters each. **Pick one (or a blend) and Phase 2 builds the customizer.**

## ⏸ Deferred — need your input / credentials / a native build

- **TICKET-093 (percentile v3):** the math scaffolding could be built, but the spec **requires your sign-off** on the §9 items + 6 product calls (World Class standard values, beginner-anchor residual, tier-band cutoffs, seed values). TICKET-071 says don't guess vision — so this is blocked on you. It also says to implement v3 **once, in the on-device TS port** (coordinate with 094), not twice.
- **TICKET-094 (local-first storage refactor + E2E backup):** large native + infra + crypto, safety-critical on-device migration, needs an **object-storage provider decision**, a `security-review` of the crypto/key handling, and the definition-of-done is a **delete→reinstall→restore on a real device** — none of which is doable/safe unsupervised in this sandbox. Recommend scoping this as its own supervised sprint.
- **TICKET-096 Phase 2:** blocked on your art-direction pick (above).
- **TICKET-099 (Apple/Google sign-in):** needs an Apple **Services ID + key**, Google **OAuth client IDs**, server secrets, and a dev/EAS build to run/verify. Code can be scaffolded but not verified in-sandbox, so it's left for the credentialed build.

## ✅ Verification (the repo's real definition of done)
- `peak-fettle-verify` parse-sweep (`@babel/parser`, jsx+typescript) over `mobile/app`, `mobile/src`, `peak-fettle-agents/server`: **134 files, all parse, no null bytes.**
- `node --check` on all server/cron JS: **pass.**
- `tsc --noEmit`: **my new/changed code is type-clean.** The repo's 47 pre-existing tsc errors (noUncheckedIndexedAccess / expo-router typed-routes, in untouched code) are unchanged — the project ships with those and gates on the parse-sweep, not tsc.
- No server migration touched (schedule is on-device SQLite; templates are bundled; tour uses AsyncStorage).

## 👉 Your action steps
1. **Review + commit + push.** The working tree already had prior uncommitted changes (e.g. the routines RoutineEditorSheet refactor) — `git status` before committing. Pushing must be done from your machine (the sandbox can't push), and **EAS builds from `origin/main`**, so it won't see any of this until you push.
2. **Pick an avatar direction** in `AVATAR_CONCEPTS_2026-06-06.html` (unblocks TICKET-096 Phase 2).
3. **TICKET-093:** answer the §9 sign-off items / 6 product calls so the v3 math can be locked.
4. **TICKET-094 & TICKET-099:** decide if/when to schedule these (094 = supervised refactor + provider + security review; 099 = provide Apple/Google credentials + dev build).
5. **On-device test pass** (can't be done in-sandbox): bundled programs start a session in airplane mode; welcome tour runs once + replay from Profile; create a cycle + weekday schedule and confirm "Next up" + start/advance. Then the native widgets (097 Phase 2).

## Files
Created: `mobile/src/data/beginnerTemplates.ts`, `mobile/src/data/schedule.ts`, `mobile/src/components/tour/WelcomeTour.tsx`, `mobile/src/components/ScheduleEditorSheet.tsx`, `AVATAR_CONCEPTS_2026-06-06.html`
Modified: `mobile/app/templates.tsx`, `mobile/app/(tabs)/index.tsx`, `mobile/app/(tabs)/routines.tsx`, `mobile/app/(tabs)/profile.tsx`, `mobile/app/_layout.tsx`, `mobile/src/db/localSchema.ts`

---

# Session 2 addendum (same day) — avatar build + 094/099 progress

## ✅ TICKET-096 Phase 2 — avatar BUILT (you picked direction D · Peak Pals)
Full parametric, layered SVG avatar in the Peak Pals style — config is serialized (not an image), persisted on-device, default shown until customized, randomize always valid.
- **New** `mobile/src/components/avatar/peakAvatarOptions.ts` — option catalog for **every** category (background, face, skin, hair, hair color, facial hair, eyes, brows, mouth, glasses, headwear) + default + `normalizeAvatar` + `randomizeAvatar`.
- **New** `mobile/src/components/avatar/PeakAvatar.tsx` — pure layered renderer (react-native-svg), reusable anywhere via `size`.
- **New** `mobile/src/components/avatar/AvatarCustomizer.tsx` — live preview + per-category pickers (mini-avatar swatches for shapes, color swatches for colors) + Randomize + Save.
- **New** `mobile/src/data/avatar.ts` + `avatar` table in `localSchema.ts` — local persistence.
- **Wired** `app/(tabs)/profile.tsx` — the profile image is now the avatar (tap → customizer, pencil badge).
- Acceptance: covers every category ✓; randomize always valid ✓; default until customized ✓; persists locally ✓ and is in the 094 backup registry ✓. Cross-screen reuse: `PeakAvatar` is drop-in; rankings/groups can show the current user's avatar now, other users' once the backend stores per-user configs.

## ✅ TICKET-094 — verifiable increment (the safe slice)
- **New** `mobile/src/data/backup/exportEngine.ts` — **deterministic, schema-versioned** JSON export/import over the on-device logical tables (`workouts, sets, schedule, avatar`), with forward-compatible restore (vN restores on vN+1; newer backup rejected) and a thin DB read/write glue.
- **New test** `mobile/__tests__/backup-export.test.js` — round-trip, determinism, version reconcile, validation — **all pass** (`node __tests__/backup-export.test.js`).
- **Still founder-gated (unchanged):** the AES-256-GCM encryption + keychain/recovery-code key handling, the opaque-blob object-storage transport (+ provider choice), automatic backup triggers, the full data-layer move, and the device delete→reinstall→restore test. Those need native modules, a provider decision, a `security-review`, and a real device.

## ✅ TICKET-099 — server verification BUILT + tested; client buttons still gated
- **New** `peak-fettle-agents/server/lib/oauthVerify.js` — verifies Apple/Google id_tokens the secure way (JWKS → `kid` → RS256 + issuer + audience). No new dependency (`crypto.createPublicKey` reads JWK directly).
- **New test** `peak-fettle-agents/server/__tests__/oauthVerify.test.js` — generates a real RSA key, signs a token, and checks valid / wrong-audience / wrong-issuer / expired / unknown-kid / forged-signature / unconfigured — **all 8 pass**.
- **Wired** `POST /auth/oauth` into `routes/auth.js` (verify → find-or-create by verified email → same session/refresh pair) and added `oauthLogin()` to `mobile/src/api/auth.ts`.
- **INERT until you configure it:** returns `501 oauth_not_configured` until `GOOGLE_OAUTH_AUDIENCE` / `APPLE_OAUTH_AUDIENCE` env vars are set — so shipping it changes nothing today.
- **Deliberately NOT done (would break the Metro bundle):** the client provider buttons need `expo-apple-authentication` + `expo-auth-session`, which aren't installed; adding their imports before a dev build would break bundling. Remaining client steps: `npx expo install expo-apple-authentication expo-auth-session`, add the two buttons to `login.tsx`/`register.tsx` calling `oauthLogin(provider, idToken)`. A proper `oauth_identities` table (map provider `sub`→account) is the account-linking follow-up and needs its own migration.

## Verification (this session)
- Parse-sweep: **141 files, all clean**, no null bytes. `node --check` all server JS: **pass**. `tsc`: **47 = unchanged pre-existing baseline, 0 new** errors from any new code. Unit tests: export-engine **pass**, oauthVerify **pass (8/8)**.

## ⚠️ One housekeeping note
`peak-fettle-agents/server/node_modules` was already partially broken (OneDrive-origin truncation) and a sandbox `npm install` disturbed it further — it's **gitignored** (not committed) and `package.json`/`package-lock.json` are unchanged. Run **`npm ci` in `peak-fettle-agents/server`** before running the server locally.

## Updated action steps (delta)
- Avatar: nothing needed — it's built. (Optional: drop `PeakAvatar` into rankings/groups rows once the backend serves per-user configs.)
- 094: decide object-storage provider + schedule the crypto/transport build with a `security-review`; the export format is ready underneath it.
- 099: add the two native deps + provider credentials (`GOOGLE_OAUTH_AUDIENCE`/`APPLE_OAUTH_AUDIENCE` + Apple Services ID/key), wire the buttons, dev/EAS build to verify.
- `npm ci` in the server before running it; review + commit + push as before.

---

# Session 3 addendum — founder decisions implemented (093/094/096/097/098/099)

All verified: parse-sweep clean (144 files), server `node --check` clean, 4 unit suites pass (v3 model, backup engine, tier policy, OAuth verify). New modules are type-clean; the only new tsc errors are the 3 not-yet-installed 099 native modules (resolve on `npx expo install`).

## TICKET-093 — percentile v3 model BUILT + proven (on-device TS)
- **New** `mobile/src/lib/strengthModelV3.ts` — DOTS (memo §4), the bodyweight-normalized ranked lens (2a), the calibrated DOTS-composite tier (2b), 50/50 undisclosed mixture (D5), provisional partial-total (D4), and the World Class tier ladder (§9). Calibration is fit in-code from the published standards (not hardcoded seeds).
- **New test** `mobile/__tests__/strength-model-v3.test.js` — 27 assertions, all pass: DOTS reproduces all 5 memo vectors exactly; the in-code lognormal fit reproduces the memo's male SBD params (μ=4.53/σ=0.377, 4.08/0.374, 4.73/0.324); ranked ranks lighter lifters higher; the composite is uniform-calibrated to ±0.1pp.
- **Remaining:** Lens 1 (experience-adjusted) revisions (heteroscedastic σ, McCulloch/Foster age, per-lift α fit), and wiring the module into the rankings UI (rides with the 094 on-device port).

## TICKET-094 — Supabase + tier policy (founder decisions encoded)
- **New** `mobile/src/data/backup/tierPolicy.ts` (+ test) — single source of truth: **Pro = server-stored sets / live multi-device sync; free = local-first + E2E blob backup; provider = Supabase; key model unchanged.**
- **Remaining (supervised build):** AES-256-GCM crypto + keychain/recovery-code handling, the Supabase opaque-blob transport, auto-backup triggers, and the data-layer move — now de-risked since the provider + key model are locked. Route a `security-review`.

## TICKET-097 — advancement reworked to your spec
- Weekly advances by **calendar day** (resolver). Cycle advances off the **last completed in-loop routine** — `markRoutineCompleted()` is hooked into both stepper finish paths (`WorkoutLoggerHost`), out-of-loop routines are ignored, and starting no longer advances. The Routines next-up strip refreshes reactively via a `localDb` subscription.

## TICKET-098 — library expanded + 1:1 mapping
- **New migration** `peak-fettle-agents/server/migrations/20260607_expand_exercise_library.sql` — 34 exercises (idempotent `ON CONFLICT (name)`), incl. **Close-Grip Lat Pulldown** (the one bundled gap, now mapped 1:1) plus a deeper common set across every muscle group + 2 cardio.
- **ACTION:** run this migration against Supabase.

## TICKET-096 — cosmetics confirmed intact
- The Achievements & Shop entry + `cosmetics.tsx` are unchanged; the avatar coexists.

## TICKET-099 — client sign-in BUILT
- **New** `mobile/src/components/auth/OAuthButtons.tsx` (Apple + Google) wired into **login + register**; **new** `AuthContext.loginWithOAuth`; client `oauthLogin` + server `/auth/oauth` now return `isNew` (new accounts route through onboarding). Deps added to `package.json`.
- **ACTION:** `npx expo install expo-apple-authentication expo-auth-session expo-web-browser` (corrects the placeholder versions), set Google client-ID env vars (`EXPO_PUBLIC_GOOGLE_*`) + `GOOGLE_OAUTH_AUDIENCE`/`APPLE_OAUTH_AUDIENCE`, obtain Apple/Google credentials, then a dev/EAS build (Apple auth doesn't run in Expo Go).
