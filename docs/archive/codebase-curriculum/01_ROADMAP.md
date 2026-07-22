---
name: codebase-curriculum-roadmap
description: The full-stack teaching roadmap for the entire Peak Fettle codebase — backend to frontend, every layer — sequenced as a difficulty ladder. Each rung links to a lesson generated from the template. The teaching agent reads 00_TEACHING_METHODOLOGY.md first, then this.
type: skill
owner: Arvin
last_reviewed: 2026-05-19
---

# Peak Fettle — Full-Stack Codebase Teaching Roadmap

> **Read [`00_TEACHING_METHODOLOGY.md`](00_TEACHING_METHODOLOGY.md) before this file, and re-read it before every lesson.** This roadmap is the *what* and the *order*. The methodology is the *how*. Each rung links to a lesson file built from [`LESSON_TEMPLATE.md`](LESSON_TEMPLATE.md) + [`lesson_app_template.html`](lesson_app_template.html). When a lesson hasn't been built yet, the link is the path it *will* live at — the agent generates it on demand using the per-lesson build protocol (methodology Part 5).

## How to read this map

The curriculum is a **difficulty ladder**: every rung rests on the prerequisites below it. We deliberately start at the bottom — the in-memory C++ domain model — because it is the most concrete, picture-able representation of *what Peak Fettle is about* (sets, exercises, workouts, scores), and every other layer (database tables, API payloads, mobile screens) is a re-expression of those same nouns. Learn the nouns once, recognize them everywhere.

The ladder is grouped into **tracks**. Tracks 0–2 are the spine everyone should do in order. Tracks 3–4 are the two frontends (React Native — active; C++/Qt — legacy/parallel) and can be taken in either order or interleaved. Track 5 is the cross-cutting capstone that only makes sense once the spine is in place.

**Status legend:** ✅ built · 🛠️ template-ready (generate on demand) · ⭐ reference lesson (fully worked, copy this pattern)

A note on the codebase as it actually stands (verify before teaching — code drifts): the production spine is **Node/Express (`peak-fettle-agents/server/`) on Supabase/Postgres**, with **batch-computed percentile rankings** and **Claude Haiku** plan generation. The **active frontend is React Native/Expo (`mobile/`)**. The **C++/Qt desktop app (`src/` + `qml/`)** is the original frontend and remains a rich teaching surface for the Qt object model and C++↔UI data flow.

---

## TRACK 0 — Foundations: the domain model & the language it's written in

### L01 ⭐ — The core domain model: Set, Exercise, WorkoutTracker
**Lesson:** [`lessons/L01_cpp_domain_model.html`](lessons/L01_cpp_domain_model.html) · [`.md`](lessons/L01_cpp_domain_model.md) — **FULLY BUILT REFERENCE LESSON**
**Why this rung first:** these three classes are the vocabulary of the entire product. A `Set` is the atomic unit; an `Exercise` groups sets for one movement; `WorkoutTracker` is the in-memory hub. Every later layer (DB rows, JSON, screens) re-expresses these nouns.
**Source files:** `src/set.h`, `src/set.cpp`, `src/exercise.h`, `src/exercise.cpp`, `src/WorkoutTracker.h`, `src/WorkoutTracker.cpp`.
**Key concepts:** the atomic Set (weight/reps/RIR vs. cardio duration/distance/pace); computed-on-read `volume`; the RIR-over-RPE decision and why RPE is kept read-only; the `kind` discriminator; `dayKey` caching; storage narrowing (quint16/qint8) and clamping; `QHash` name→Exercise for O(1) logging; the "best of the day" aggregation that fixed the "second set to failure makes you look weaker" graph artifact.
**Sample L5 capstone:** *"`progressSeries` defaults `perSet=false` and aggregates to one best point per day. Marcus (competitive powerlifter) wants every set plotted. Defend or refute the default, name the failure mode it prevents, and say who each choice serves."*

### L02 🛠️ — C++ as used here: ownership, QObject, headers, const, enums
**Lesson:** `lessons/L02_cpp_language_essentials.*`
**Why here:** L01 showed *what* the classes do; this rung explains the *language mechanics* that make them work, so the rest of `src/` is readable.
**Source files:** any of `src/*.h`/`*.cpp`, especially `UnitPreference.*`, `EffortPreference.*`, `UserProfile.*`, `usermanager.*`, `main.cpp`.
**Key concepts:** header/implementation split and include guards; pointers & `new` with Qt parent-child ownership (who deletes whom); `const` correctness; `static` factory methods (`Set::makeCardio`) and why; `enum`/preference classes; `std::clamp`, `std::atomic`; `QString`/`QVector`/`QHash` value types; the translation unit / linker mental model.
**Sample L5 capstone:** *"`makeCardio` is a static factory while the lift set uses a constructor. Evaluate that inconsistency as an API-design choice — what does the factory buy, and is the asymmetry worth it?"*

### L03 🛠️ — The domain math: E1RM, strength curves, DOTS, percentiles
**Lesson:** `lessons/L03_domain_math.*`
**Why here:** the scores are the product's competitive hook; understanding the math demystifies both the C++ and the SQL that compute it.
**Source files:** `src/StrengthCurve.h`/`.cpp`, `strength_curve_model.md`, `compute_percentile.sql`, `exercise.cpp` (`estimatedOneRepMax`, Epley), `WorkoutTracker.cpp` (`computeStrengthScore`).
**Key concepts:** Epley `w·(1+reps/30)`; the log-normal strength model; weight-class/age/sex bands; DOTS coefficient; the 0–1000 gamified score and its deliberately gentle curve; extrapolation flags outside the calibrated band.
**Sample L5 capstone:** *"The strength score is calibrated so 100 kg bench E1RM ≈ 600 for an intermediate male, with a deliberately gentle curve. Critique this from a motivation-design standpoint: who benefits, who might feel cheated, and what would you change?"*

---

## TRACK 1 — The data layer: relational modeling, SQL, Supabase

### L04 🛠️ — Relational modeling & the Postgres schema (joins/indexes explicit)
**Lesson:** `lessons/L04_relational_modeling.*`
**Why here:** once the nouns exist as objects (Track 0), see them as *tables*. Profile flags joins/indexes/normalization as fuzzy — **teach these from first principles, slowly.**
**Source files:** `migrations/`, `all_migrations.sql`, `peak-fettle-agents/server/migrations/`.
**Key concepts:** tables/rows/columns vs. objects; primary & foreign keys; one-to-many (user→sets, exercise→sets); normalization (1NF→3NF) and when to denormalize; what an index *is* (B-tree intuition) and why `dayKey`/`user_id` get indexed; the `sets.kind` column mirroring the C++ discriminator; migrations as versioned schema history.
**Sample L5 capstone:** *"The C++ `Set` caches `dayKey` to avoid re-formatting dates on render. The DB could compute it on the fly or store it. Evaluate storing a derived column vs. an index on a date expression — what are you trading?"*

### L05 🛠️ — SQL deep dive: the percentile batch job
**Lesson:** `lessons/L05_sql_percentile_batch.*`
**Why here:** the most sophisticated SQL in the repo; rewards the L04 foundation and connects to L03's math.
**Source files:** `compute_percentile.sql`, `lift_vectors_seed.sql`, `cron/percentile.js`.
**Key concepts:** aggregates & `GROUP BY`; window functions (`percent_rank`, `ntile`); CTEs; the `percentile_vectors` table as a precomputed lookup; why this is **batch (weekly), not real-time**, and the cost/freshness trade-off; seeding reference data.
**Sample L5 capstone:** *"Percentiles are recomputed weekly and stored, not computed per request. Defend this against a 'show me my live rank' product demand — quantify the trade-off and name the breaking point where you'd switch to real-time."*

### L06 🛠️ — Supabase: managed Postgres + Auth + Storage + RLS
**Lesson:** `lessons/L06_supabase.*`
**Source files:** `peak-fettle-agents/server/lib/supabaseAdmin.js`, `db.js`, `database_decision_memo.md`, `.env.example`.
**Key concepts:** what a BaaS gives you; the anon key vs. the **service-role key** (and why account deletion needs it); Row-Level Security as auth-in-the-database; connection pooling; the "no vendor lock-in / Postgres exit optionality" rationale from the decision memo.
**Sample L5 capstone:** *"The decision memo chose Supabase over Firebase partly for 'Postgres exit optionality.' Evaluate how real that optionality is once you depend on Auth + RLS + service-role flows — what would actually be hard to migrate?"*

---

## TRACK 2 — The backend: Node, REST, auth, the LLM, jobs, deploy

### L07 🛠️ — Node & Express fundamentals: the server skeleton
**Lesson:** `lessons/L07_node_express.*`
**Source files:** `peak-fettle-agents/server/index.js`, `db.js`, `middleware/errorHandler.js`, `package.json`.
**Key concepts:** the event loop / async model (concept-first, profile says backend is new); what a web server *is*; the middleware pipeline; `helmet`, `cors`, `express-rate-limit`; centralized error handling; `app.use` ordering and why it matters.
**Sample L5 capstone:** *"Middleware order is significant. Given helmet, cors, rate-limit, auth, and the error handler, justify a correct ordering and explain a concrete bug caused by getting it wrong."*

### L08 🛠️ — REST API design: the routes and their contracts
**Lesson:** `lessons/L08_rest_api.*`
**Source files:** `peak-fettle-agents/server/routes/` (`sets.js`, `workouts.js`, `exercises.js`, `percentile.js`, `templates.js`, `groups.js`, `constraints.js`, `healthMetrics.js`, `csvImport.js`, `user.js`).
**Key concepts:** resources, verbs, status codes; request → validation (`zod`) → DB → response; idempotency; the same domain nouns now as JSON; error shapes; pagination/limits (`recentSets` limit echo).
**Sample L5 capstone:** *"`GET /user/data-export` and `DELETE /user/account` exist for GDPR. Critique the API surface for a privacy regulator: what's missing, and how would you prove deletion actually happened?"*

### L09 🛠️ — Auth & security from first principles: JWT, bcrypt, requireAuth
**Lesson:** `lessons/L09_auth_security.*`
**Why here:** profile flags auth/JWT as abstract — **teach the mental models (tamper-evident envelope vs. locked box) before any code.**
**Source files:** `routes/auth.js`, `middleware/requireAuth.js`, `lib/supabaseAdmin.js`.
**Key concepts:** authentication vs. authorization; password hashing with `bcrypt` (salt, work factor) vs. encryption; JWT structure (header.payload.signature), signing vs. encryption, expiry/refresh; how `requireAuth` gates a route; never trusting the client.
**Sample L5 capstone:** *"A teammate proposes storing the JWT in localStorage on web for convenience. Evaluate the security trade-off vs. httpOnly cookies, name the specific attack each choice exposes you to, and make a recommendation for Peak Fettle."*

### L10 🛠️ — LLM integration: Claude Haiku plan generation
**Lesson:** `lessons/L10_llm_integration.*`
**Source files:** `routes/plans.js`, `@anthropic-ai/sdk` usage, `user_constraints`/`contraindications` handling, cost notes in `cost_analysis_reference.md`.
**Key concepts:** calling a model from a server; building the prompt from user history + constraints + health metrics; getting *structured* output; hard-blocking contraindicated exercises; why Haiku (≈2.5¢/plan) over cheaper options — quality is the paid tier's reason to exist; latency, retries, failure handling.
**Sample L5 capstone:** *"Plan quality justified paying for Haiku over a cheaper model. Construct the unit-economics argument: at what subscriber price and plan-regeneration frequency does the 2.5¢/plan cost threaten margin, and what would you cache?"*

### L11 🛠️ — Background jobs: node-cron and the scheduled work
**Lesson:** `lessons/L11_cron_jobs.*`
**Source files:** `cron/percentile.js`, `cron/group-streaks.js`, `cron/push-dispatcher.js`, `cron/cohort-graduation.js`, `cron/cleanup-orphaned-auth.js`, `migrations/20260517_notification_queue.sql`.
**Key concepts:** why some work must be async/scheduled vs. request-time; cron expressions; idempotent jobs; the notification queue pattern; the weekly percentile recompute; cleaning up orphaned auth records.
**Sample L5 capstone:** *"The group-streak tick runs weekly with a >50% rule and banked credits. Evaluate failure modes if the cron misfires or runs twice — which jobs here are safe to double-run and which aren't, and how would you make the unsafe ones idempotent?"*

### L12 🛠️ — Config, secrets, environments, deployment
**Lesson:** `lessons/L12_env_deploy.*`
**Source files:** `.env.example` (server + mobile), `setup_local_llm.ps1`, `RUN_SETUP.bat`, `.github/`.
**Key concepts:** env vars vs. hardcoding; secret management; dev/staging/prod separation; the service-role key as a server-only secret; what a deploy pipeline does; the local-LLM dev path.
**Sample L5 capstone:** *"The service-role key can bypass RLS entirely. Design the blast-radius containment: where may it live, where must it never appear, and how would you detect a leak?"*

---

## TRACK 3 — Frontend A: React Native / Expo (the active app)

### L13 🛠️ — RN + Expo + expo-router fundamentals
**Lesson:** `lessons/L13_rn_expo_router.*`
**Source files:** `mobile/app/_layout.tsx`, `mobile/app/(auth)/`, `mobile/app/(tabs)/`, `mobile/app.json`.
**Key concepts:** React Native vs. web React; Expo's role; **file-based routing** (folders = routes), route groups `(auth)`/`(tabs)`, `_layout` files; navigation stack vs. tabs; the screen inventory (home, log, plans, rankings, profile, …).
**Sample L5 capstone:** *"File-based routing trades explicit route config for convention. Evaluate it against a hand-wired navigator for a team onboarding a new dev — what becomes easier, what becomes a footgun?"*

### L14 🛠️ — Component & screen architecture, state, custom hooks
**Lesson:** `lessons/L14_rn_state_hooks.*`
**Source files:** `mobile/app/(tabs)/*.tsx`, `MyApp/hooks/useWorkoutSession.ts`, `useWorkoutHistory.ts`, `useWorkoutPlans.ts`, `mobile/src/`.
**Key concepts:** components & props; `useState`/`useEffect`; custom hooks as reusable logic; lifting state; the domain nouns now as UI state; re-render mental model.
**Sample L5 capstone:** *"`useWorkoutSession` encapsulates session logic as a hook. Critique extracting this into a hook vs. a context vs. a state library for an app that must work offline mid-set."*

### L15 🛠️ — The API client layer: talking to the backend
**Lesson:** `lessons/L15_api_client.*`
**Source files:** `mobile/src/api/client.ts`, `auth.ts`, `exercises.ts`, `groups.ts`, `healthMetrics.ts`, `constraints.ts`; compare `peak-fettle-app/src/api/`.
**Key concepts:** `axios` instance & interceptors; attaching the JWT; centralizing base URL/error handling; mapping API JSON back to typed objects; the full request round-trip from screen to server.
**Sample L5 capstone:** *"The client attaches the auth token via an interceptor. Evaluate handling a 401 mid-session (token expired) — design the refresh-and-retry flow and name the race condition you must avoid."*

### L16 🛠️ — Offline-first sync: PowerSync
**Lesson:** `lessons/L16_offline_sync.*`
**Source files:** `sync-rules.yaml`, `MyApp/lib/db/OFFLINE_ARCHITECTURE.md`, `MyApp/lib/db/connector.ts`, PowerSync deps in `mobile/package.json`.
**Key concepts:** why offline matters (unreliable gym connectivity — a load-bearing product decision); local SQLite as source of truth; sync rules; conflict resolution; optimistic UI; reconciling with Supabase Postgres.
**Sample L5 capstone:** *"Two phones log sets for the same user offline, then both sync. Evaluate Peak Fettle's conflict strategy against last-write-wins and CRDTs for *append-only set logs* specifically — which is right and why?"*

### L17 🛠️ — Charts & data visualization
**Lesson:** `lessons/L17_charts_viz.*`
**Source files:** `victory-native` + `@shopify/react-native-skia` usage in progress screens; compare QML `ProgressGraphPage.qml`.
**Key concepts:** turning `progressSeries` into a chart; the "best per day" series feeding the graph; axis/scale choices; performance with Skia; the same data the C++ `progressSeries` produced.
**Sample L5 capstone:** *"The graph plots best-of-day E1RM. A user with a deload week sees a scary dip. Evaluate three honest ways to present a deload without hiding it or discouraging the user."*

### L18 🛠️ — The design system: tokens & theming (Phase E)
**Lesson:** `lessons/L18_design_system.*`
**Source files:** `MyApp/constants/theme.ts`, `mobile` theme files, `peak_fettle_design_spec.docx`, Phase E notes; compare QML `Theme.qml`.
**Key concepts:** design tokens vs. inline hex (the 470+ hex migration); a theme switcher; light/dark; why a token layer pays off; parallels to `Theme.qml`.
**Sample L5 capstone:** *"Phase E migrated 470+ raw hex values to tokens. Quantify the payback: what class of bug does this prevent, and was the migration cost justified for a solo founder pre-launch?"*

---

## TRACK 4 — Frontend B: C++/Qt desktop (original/parallel)

### L19 🛠️ — The Qt object model & exposing C++ to QML
**Lesson:** `lessons/L19_qt_object_model.*`
**Source files:** `src/*.h` (`Q_OBJECT`, `Q_PROPERTY`, `QML_ELEMENT`, `QML_SINGLETON`, signals), `src/main.cpp`.
**Key concepts:** `QObject` as the base of everything; `Q_PROPERTY` (READ/WRITE/NOTIFY) as the bridge; signals & slots; the meta-object system; `QML_ELEMENT`/`QML_SINGLETON` registration; why `WorkoutTracker` is a singleton.
**Sample L5 capstone:** *"`Q_PROPERTY` requires READ/WRITE/NOTIFY boilerplate per field. Evaluate this against a plain struct + manual signals — what does the property system buy QML, and when is the boilerplate not worth it?"*

### L20 🛠️ — QML UI: pages, bindings, delegates, theming, navigation
**Lesson:** `lessons/L20_qml_ui.*`
**Source files:** `qml/Main.qml`, `qml/HomePage.qml`, `qml/SetTrackerPage.qml`, `qml/ProgressGraphPage.qml`, `qml/PercentilesPage.qml`, `qml/components/`, `qml/Theme.qml`.
**Key concepts:** declarative UI & property bindings (auto-recompute); `ListView` + delegates over `recentSets`; component reuse (`PrimaryButton`, `WeightLabel`); page navigation; binding to C++ properties so the UI redraws on `dataChanged`.
**Sample L5 capstone:** *"QML bindings auto-update when a bound property changes. Compare this reactive model to React's explicit re-render in the mobile app — evaluate which is easier to reason about for the progress-graph redraw and why."*

### L21 🛠️ — C++↔QML data flow: the full round-trip on the desktop
**Lesson:** `lessons/L21_cpp_qml_dataflow.*`
**Source files:** `WorkoutTracker.cpp` (`Q_INVOKABLE` methods, `recentSets`, `progressSeries`), the QML pages that call them.
**Key concepts:** calling C++ from QML via `Q_INVOKABLE`; returning `QVariantList`/`QVariantMap` for ListView delegates; the signal→binding→repaint loop; where the in-memory model meets the view.
**Sample L5 capstone:** *"`recentSets` returns a `QVariantList` of maps rather than exposing the `Set` objects directly. Evaluate this DTO-style boundary vs. exposing the model objects to QML — what does each cost in coupling and performance?"*

---

## TRACK 5 — Cross-cutting & capstone

### L22 🛠️ — End-to-end: one set's journey through the whole stack
**Lesson:** `lessons/L22_end_to_end_dataflow.*`
**Why here:** the synthesis rung — only makes sense after the spine. Trace a single logged set from UI → API → validation → Postgres → weekly percentile batch → back into the rankings screen.
**Source files:** pulls from every track; the tracing exercise is the lesson.
**Sample L5 capstone:** *"Trace a single bench-press set end to end and identify the *single highest-risk hop* for data loss or corruption. Defend your choice and propose the one guardrail you'd add first."*

### L23 🛠️ — Build & tooling: CMake, Expo/EAS, CI
**Lesson:** `lessons/L23_build_tooling.*`
**Source files:** `CMakeLists.txt`, `mobile/eas.json`, `mobile/app.json`, `.github/`.
**Key concepts:** what a build system does; CMake targets for the Qt app; Expo/EAS builds for mobile; CI on push; the two very different build worlds in one repo.

### L24 🛠️ — Testing & the feedback loop
**Lesson:** `lessons/L24_testing.*`
**Source files:** `peak-fettle-agents/server/__tests__/`, `testing-team/`, `pf-tester-feedback-*.md`, `TESTER_PROMPT_*.md`.
**Key concepts:** unit tests (`requireAuth.test.js`, `health.test.js`); what to test at each layer; the persona-based beta feedback loop (Jamie/Marcus/Priya/Derek) feeding the roadmap; the mock-removal sprint and why mocks can mask real bugs.
**Sample L5 capstone:** *"The team ran a 'mock-removal' sprint. Evaluate when mocking the database in tests is a liability vs. an asset, citing a concrete Peak Fettle route where each call would be right."*

### L25 🛠️ — Capstone: evaluate the architecture & design an extension (L5/L6)
**Lesson:** `lessons/L25_capstone.*`
**What it is:** no new source — a pure Bloom L5/L6 session. Defend (or challenge) the major architecture decisions as a whole — Supabase, batch percentiles, Haiku, offline-first, two frontends — then design a non-trivial new feature end to end (e.g., live head-to-head challenges) and justify every layer choice. This is the graduation exercise.

---

## Progress tracker

| Rung | Title | Status |
|------|-------|--------|
| L01 | C++ core domain model | ⭐ built (reference) |
| L02 | C++ language essentials | 🛠️ on demand |
| L03 | Domain math (E1RM, percentiles) | 🛠️ on demand |
| L04 | Relational modeling & schema | 🛠️ on demand |
| L05 | SQL percentile batch | 🛠️ on demand |
| L06 | Supabase | 🛠️ on demand |
| L07 | Node & Express | 🛠️ on demand |
| L08 | REST API design | 🛠️ on demand |
| L09 | Auth & security | 🛠️ on demand |
| L10 | LLM integration | 🛠️ on demand |
| L11 | Cron jobs | 🛠️ on demand |
| L12 | Config & deploy | 🛠️ on demand |
| L13 | RN + Expo router | 🛠️ on demand |
| L14 | RN state & hooks | 🛠️ on demand |
| L15 | API client layer | 🛠️ on demand |
| L16 | Offline sync (PowerSync) | 🛠️ on demand |
| L17 | Charts & viz | 🛠️ on demand |
| L18 | Design system | 🛠️ on demand |
| L19 | Qt object model | 🛠️ on demand |
| L20 | QML UI | 🛠️ on demand |
| L21 | C++↔QML data flow | 🛠️ on demand |
| L22 | End-to-end data flow | 🛠️ on demand |
| L23 | Build & tooling | 🛠️ on demand |
| L24 | Testing & feedback loop | 🛠️ on demand |
| L25 | Capstone | 🛠️ on demand |

To start any rung, tell the teaching agent the rung ID (e.g. "teach L04"). It will follow the per-lesson build protocol in the methodology guide, generate the lesson + interactive app if not yet built, teach it live, grade the quiz, and update the LEARNER PROFILE.
