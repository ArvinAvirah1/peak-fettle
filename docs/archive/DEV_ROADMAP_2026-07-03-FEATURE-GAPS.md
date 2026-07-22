# DEV ROADMAP — 2026-07-03 — FEATURE-GAP BACKLOG (v1)

**Source:** `audits/feature-gap-analysis-2026-07-03.html` (grep-verified gap analysis vs Hevy/Strong/Fitbod/Boostcamp).
**Scope:** every BLUE (Tier 1), GREEN (Tier 2), and YELLOW (Tier 3) item from the priority matrix, in that order. RED items (public social feed, coach platform) are deliberately NOT ticketed — founder decision required first.
**Numbering:** continues from TICKET-127 → this file owns **TICKET-128…146**.

---

## 🚦 STATUS — updated 2026-07-04 PM (all 19 tickets have code landed; waves 1–4 + watch Stage A + localization)

**Gate at this update (run on the full tree):** parse-sweep 251 files / 0 failures · `node --check` 48 server files / 0 failures · 248 tests green across 12 node suites · i18n check 2,322 keys / 0 missing · tsc 60 errors (below the pre-run 61; baseline ~85).
**Schema note:** local bumps landed as **v11–v15** (the v4–v7 numbers in the ticket text were already taken by pre-kickoff work; sequencing preserved): v11=129, v12=130, v13=133, v14=143, v15=141 (autoreg mute).

- ✅ TICKET-128 RPE toggle — wave 1 (22f534f), re-verified vs criteria this pass
- ✅ TICKET-129 set notes+flags (v11) — wave 2 (fd33777), re-verified
- ✅ TICKET-130 body measurements (v12) — wave 2, re-verified
- ✅ TICKET-131 share cards — wave 1; 🔔 needs the EAS batch (view-shot)
- ✅ TICKET-132 program shelf (11 programs) — wave 1; 🔔 founder review: program naming
- ✅ TICKET-133 progress photos (v13) — wave 3; 🔔 EAS (image-picker) + on-device deletion check
- ✅ TICKET-134 exercise media — wave 1 + wave 4 completion (a1f25b0): media now covers ALL 220 seeded exercises, 0 uncovered (`mobile/scripts/pf_ticket134_coverage.js`); 🔔 founder cue review; v2 shortlist: `audits/TICKET-134-animation-shortlist.md`
- ✅ TICKET-135 Strong/Hevy importers — wave 1, re-verified (fixtures, RPE→RIR, dedupe)
- ✅ TICKET-136 HealthKit re-enable (@kingstinct) — wave 2 code done; ⏸ 🔔 EAS + iOS 26 cold-start ×20 device test before "done"
- ✅ TICKET-137 Live Activities + Android notif — wave 2 + 2026-07-04 completion: the host-side `LiveActivityModule` local Expo module was MISSING (facade no-op'd — the activity could never start on device); built in `mobile/modules/live-activity/` with the attributes struct byte-matched to the extension. ⏸ 🔔 EAS + device matrix
- ✅ TICKET-138 routine share links — wave 2, re-verified (Zod validate, expiry, drift-guarded, schema.sql folded)
- ✅ TICKET-139 group leaderboards — wave 3, re-verified (per-group opt-in default off, weekly-signal ride-along)
- 🔨 TICKET-140 Apple Watch v1 — GO given 2026-07-04; phone-always-present design locked. **Stage A BUILT** (ec20b5a): `targets/watch/` SwiftUI app + `modules/watch-connectivity/` WCSession module + guarded `src/native/watchBridge.ts` + `useWatchMirror` (pure payload builder, 21/21 tests). Architecture of record: `audits/TICKET-140-watch-sync-architecture-2026-07-04.md`. ⏸ 🔔 EAS + physical iPhone↔Watch pairing test REQUIRED before Stage B (wrist set-logging, queued WatchConnectivity) and Stage C (rest timer + HR).
- ✅ TICKET-141 autoregulation — wave 3 (pure v2/autoregulation.ts, off-by-default flag); 🔔 threshold sign-off, flip flag after self-test week
- ✅ TICKET-142 fatigue-aware plan adjustment — wave 4 (a1f25b0): `v2/fatigue.ts` (FT-D1 deload-forward / FT-V1 −20% accessory trim, dismissal backoff 3→28 d, 31 tests) + FatigueAdviceCard on insights; Accept prefills plan-adjust (deload → `deloadFrequency: 'frequent'`); trim has NO existing engine lever → banner-only accept (single wiring point: `fatigueAdviceMapping.ts`); 🔔 threshold sign-off
- ✅ TICKET-143 badges → cosmetics (v14, 23 badges) — wave 3, re-verified
- ✅ TICKET-144 circuits + conditioning timers — rotation/N≤5 editor shipped pre-wave-4; wave 4 adds EMOM/AMRAP/interval timer sheet (27 tests), group-rest-mode setting (`after_round`/`after_exercise`) wired through restAfterSet + profile row, 4-exercise allowlist round-trip tests
- ✅ TICKET-145 App Intents — wave 3; Siri settings row applied in profile.tsx; 🔔 rides the EAS batch
- ✅ TICKET-146 localization — DONE 2026-07-04, ran solo as the final wave (eeb559f + dc943b5 + 43d8d35 + f5ee7db): i18next rail (sync init, device-locale detection, language settings row incl. __DEV__ pseudo-locale), **2,322 EN keys across 9 namespaces** covering tabs/auth/all screens/logger/components/planGen/badges/notifications; engine because-lines through keys with a golden template≡English test (11/11); CI check `mobile/scripts/pf_i18n_check.js` (key existence + raw-literal lint — flip REPO_WIDE_STRICT once the 11 documented residuals [diagnostics.tsx dev screen + unit/brand exemptions] are allowlisted). Typed-key TS augmentation deliberately scoped to defaultNS: i18next v26 does not type the `t('ns:key')` call style (full augmentation = ~2k tsc errors, violating the tsc-delta rule); key integrity is gate-enforced by the check script instead. 🔔 founder: `npm install` in mobile/ (new deps i18next + react-i18next) and a pseudo-locale truncation pass on the worst 10 screens. Translations themselves = future content task (drop de/ etc. next to locales/en/).

**Founder queue (in order):** 1) `npm install` in mobile/ (new deps: i18next, react-i18next) 2) `git push origin main` (13 commits waiting; sandbox cannot push) 3) EAS build batch — now includes the watch app + watch-connectivity/live-activity local modules (131/133/136/137/140-A/145/146) 4) device tests: 136 cold-start ×20 on iOS 26 · 137 island/lock-screen/Android · 140-A iPhone↔Watch pairing (handshake, mirror renders, refresh round-trip) · 133 deletion-really-deletes · 146 pseudo-locale truncation pass (Profile → Language → Pseudo, dev build) 5) content reviews: 134 cues + shortlist, 132 naming, 141+142 thresholds 6) after a self-test week: flip 141's settings flag 7) Stage B of the watch only after the pairing test passes.

---

## 📋 Backlog at a glance (run order = ticket order)

| # | Ticket | Feature | Band | Sev | Size | Native/EAS? | Schema? |
|---|--------|---------|------|-----|------|-------------|---------|
| 1 | TICKET-128 | RPE display toggle (RIR ⇄ RPE) | 🔵 T1 | 🟠 P1 | S | no | no |
| 2 | TICKET-129 | Per-set notes + set flags | 🔵 T1 | 🟠 P1 | S | no | local v4 + server additive |
| 3 | TICKET-130 | Body measurements module | 🔵 T1 | 🟠 P1 | S–M | no | local v5 + server additive |
| 4 | TICKET-131 | Shareable workout summary cards | 🔵 T1 | 🟠 P1 | S | maybe (view-shot) | no |
| 5 | TICKET-132 | Prebuilt program shelf | 🔵 T1 | 🟠 P1 | S–M | no | no |
| 6 | TICKET-133 | Progress photos (private) | 🔵 T1 | 🟠 P1 | M | yes (image-picker) | local v6 (metadata) |
| 7 | TICKET-134 | Exercise media v1 (diagrams + cues) | 🔵 T1 | 🟠 P1 | M | no | no (static catalog) |
| 8 | TICKET-135 | Strong/Hevy CSV importers | 🟢 T2 | 🟡 P2 | S | no | no |
| 9 | TICKET-136 | HealthKit / Health Connect re-enable | 🟢 T2 | 🟡 P2 | M | yes | no |
| 10 | TICKET-137 | Live Activities + DI rest timer (+ Android ongoing notif) | 🟢 T2 | 🟡 P2 | M | yes (ActivityKit target) | no |
| 11 | TICKET-138 | Routine share links + deep-link import | 🟢 T2 | 🟡 P2 | M | no | server only |
| 12 | TICKET-139 | Group leaderboards (opt-in, group-scoped) | 🟢 T2 | 🟡 P2 | M | no | server only |
| 13 | TICKET-140 | Apple Watch app v1 | 🟢 T2 | 🟡 P2 | XL | yes (watchOS target) | no |
| 14 | TICKET-141 | In-session autoregulation suggestions | 🟡 T3 | 🟢 P3 | M | no | no |
| 15 | TICKET-142 | Fatigue-aware plan adjustment | 🟡 T3 | 🟢 P3 | M | no | no |
| 16 | TICKET-143 | Achievements/badges → cosmetics unlocks | 🟡 T3 | 🟢 P3 | S–M | no | local v7 (badge state) |
| 17 | TICKET-144 | Circuits (3+ exercises) + conditioning timers | 🟡 T3 | 🟢 P3 | M | no | no (model already supports) |
| 18 | TICKET-145 | Siri / App Intents voice logging + interactive widgets | 🟡 T3 | 🟢 P3 | M | yes | no |
| 19 | TICKET-146 | Localization scaffold + string extraction | 🟡 T3 | 🟢 P3 | L | no | no |

**Dependency edges:** 129 → 130 (sequential schema bumps v4→v5) · 136 + 137 → 140 (watch needs HealthKit HR + session-state plumbing) · 141 → 142 (shared engine suggestion plumbing) · 128 before 141 (suggestion copy respects effort-display setting). Everything else is independent → disjoint file ownership parallelizes cleanly.

**EAS batching (founder time is the bottleneck):** tickets needing a native rebuild are 131(?), 133, 136, 137, 140, 145. Batch 131+133 into the Tier-1 sprint-end build; 136+137 into one Tier-2 build; 140 and 145 each get their own cycle. Remember: fix → commit → **push** → EAS → install → test; a local commit changes nothing on-device.

---

## ⚙️ MODEL ROUTING (per CLAUDE.md convention)

| Lane | Tickets |
|------|---------|
| **Opus** | **TICKET-141, TICKET-142** (engine math / correctness-critical), architecture review of **TICKET-140** (watch sync design) — then the **final integration + verification pass** over everything merged. |
| **Sonnet** | Everything else: 128–140, 143–145. Default workhorse lane. |
| **Haiku** | **TICKET-146 string extraction only** (mechanical); never the math/native/debugging tickets. |

**Standing definition of done — every ticket, every model (from CLAUDE.md, non-negotiable):**
1. `@babel/parser` parse-sweep of all `.ts/.tsx` under `mobile/app` + `mobile/src` → 0 failures; `node --check` every server `.js`.
2. `node mobile/src/db/__tests__/migrations.test.js` (mandatory for 129, 130, 133, 143).
3. `tsc --noEmit` delta vs baseline (~85) must not increase.
4. Grep new/changed screens for raw `from '../api/` personal-data imports → every one needs an `isLocalFirst` branch.
5. Weight I/O only via `constants/units.ts` (`displayToKg` / `kgToInputValue` / `formatWeight`) — the 185 lb → 185 kg bug must not recur.
6. New local tables/columns registered in `exportEngine BACKUP_TABLES` + covered by migrate-to-Pro; server migrations additive + drift-guarded (`to_regclass`, catch `42P01`/`42703`, degrade to empty 200) and folded back into `db/schema.sql`.
7. Self-reports are not verification — run the sweep yourself after any multi-agent run.

---

# 🔵 TIER 1 — BLUES

# TICKET-128 — RPE display toggle (RIR ⇄ RPE)
**Owner:** dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** S (1–2 d)
**Area:** `mobile/src/data/appSettings.ts`, `mobile/src/components/StepperLogger.tsx`, `mobile/src/components/loggerLogic.ts`, workout-history/workout-day renderers, `mobile/app/glossary.tsx`
**Blocks:** TICKET-141 (suggestion copy reads the setting)

## Goal
Powerlifters speak RPE; we log RIR. Add a display-layer toggle — **RIR stays the only stored value** (`sets.rir`, canonical, no migration ever). RPE = `10 − RIR`, clamped to the 5–10 display band; RIR > 5 renders as "RPE ≤ 5".

## Acceptance criteria
1. `appSettings` gains `effort_display: 'rir' | 'rpe'` (default `'rir'` — current behavior unchanged for existing users).
2. Logger effort pills, previous-performance line, workout-day and history rows, exercise detail records, and glossary all respect the setting.
3. Conversion lives in ONE pure helper (suggest `loggerLogic.ts`) with unit tests in `__tests__/loggerLogic.test.js` — including the clamp and null/undefined RIR.
4. DB writes are provably unchanged (test asserts stored value is RIR regardless of display mode).
5. Settings row with a one-line explainer ("RPE 8 = RIR 2 — same number, different direction").

## Notes
Zero network, zero schema, zero tier logic. The cheapest ticket in this file — do it first as the warm-up.

---

# TICKET-129 — Per-set notes + set flags
**Owner:** dev-fullstack
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** S (2–3 d)
**Area:** `mobile/src/db/localSchema.ts` + `migrations.ts` (v3→v4), `mobile/src/db/__tests__/migrations.test.js`, `StepperLogger.tsx`, workout-day/history views, `server/routes/workouts.js` (or sets route), `db/schema.sql`
**Blocks:** TICKET-130 (sequential schema bump)

## Goal
Set-level annotations — where the real training information lives ("felt pinchy", "paused reps", "belt on"). Strong/Hevy both have it; we only have `workouts.notes`.

## Acceptance criteria
1. Local migration **v4**: `ALTER TABLE sets ADD COLUMN note TEXT` + `ADD COLUMN flags INTEGER DEFAULT 0` (bitmask: 1=paused, 2=tempo, 4=belt, 8=pin/rack, 16=discomfort). Additive only; `migrations.test.js` extended (fresh install AND v3→v4 upgrade paths).
2. Logger: note icon / long-press on a set row → note sheet with free text + flag chips. ≤ 2 taps to add a flag, no modal maze. Respect the safe-area-in-Modal rule (`paddingTop: Math.max(insets.top, 12)` on the sheet header — CLAUDE.md §3).
3. Notes + flags render in workout-day, workout-history, and per-exercise history (truncated with expand).
4. Server: additive `note` / `flags` columns on `sets`, drift-guarded, folded into `db/schema.sql`; Pro sync round-trips them; free tier stays 100% local.
5. Backup: confirm `exportEngine` picks up the new columns (if it selects explicit columns, add them; if `SELECT *`, add a test proving they survive an export→import round-trip). CSV export gains the two columns.

## Notes
Keep the flag vocabulary SMALL (5 bits). "Searchable notes" is a later ticket — don't build search UI here.

---

# TICKET-130 — Body measurements module
**Owner:** dev-fullstack
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** S–M (3–5 d)
**Area:** local schema v5 + migrations + tests, new `mobile/src/data/measurements.ts`, `mobile/app/progress.tsx` (or new `measurements.tsx` route), trends chart components, `exportEngine` BACKUP_TABLES, `migrateToPro.ts`, server additive table, `db/schema.sql`
**Blocked by:** TICKET-129 (takes v5 after 129's v4)

## Goal
We track exactly one body metric (weekly bodyweight). Market standard is a measurements module: waist, chest, hips, arms, thighs, calves, neck, body-fat %, plus custom metrics — each with a trend chart. Strong paywalls this; we ship it free and local.

## Acceptance criteria
1. Local migration **v5**: `body_measurements (id TEXT PK, metric TEXT, value REAL, unit TEXT, logged_at TEXT, synced INTEGER DEFAULT 0)`. Registered in `BACKUP_TABLES`, covered by `migrateToPro`, covered by `migrations.test.js`.
2. Preset metric list + user-defined custom metrics; cm/in handled via a single conversion helper in `constants/units.ts` (extend it — do NOT create a second conversion path; the weight-unit lesson applies to length too).
3. Entry UX: from Progress tab — pick metric → numeric pad → save; last value prefilled; sparkline + full trend chart per metric (reuse trends chart components).
4. Existing weekly `bodyweight` table stays canonical for the percentile model — the module READS it for the bodyweight row rather than duplicating storage.
5. Tier-branched data layer (`mobile/src/data/measurements.ts`): free = local only; Pro = additive drift-guarded server table + sync. No raw `api/*` import from any screen.
6. JSON/CSV export includes measurements.

## Notes
Progress photos are deliberately a separate ticket (TICKET-133) — different native deps, different backup semantics.

---

# TICKET-131 — Shareable workout summary cards
**Owner:** dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** S (3–5 d)
**Area:** new `mobile/src/components/ShareCardSheet.tsx`, workout-finish flow + `workout-day.tsx` entry points, `react-native-view-shot` + `expo-sharing` deps, theme tokens
**Blocks:** nothing

## Goal
The cheapest acquisition loop we can build: a rendered summary card (volume, sets, duration, PRs, streak) exported to the OS share sheet / Instagram stories. Our unfair advantage: the optional **percentile flex line** ("TOP 8% · BENCH PRESS · men 75–82.5 kg") that no competitor can copy.

## Acceptance criteria
1. "Share" entry point on the workout-complete screen and on any past workout in workout-day.
2. Card renders: workout name, date, duration, total volume (via `formatWeight`), set count, PR badges (from the PR table), streak weeks; styled with the user's ACTIVE THEME + cosmetics accent so cards are visually distinct per user.
3. Percentile flex line is opt-in per share (toggle on the preview, remembered), pulled from the on-device `strengthModelV3` result — never a network call.
4. Export via `react-native-view-shot` → PNG (1080×1920 story ratio + 1080×1080 square) → `expo-sharing`. Verify view-shot works in the current dev client; if not, add to the sprint-end EAS batch.
5. Zero server involvement; sharing is a user-initiated OS action (privacy story intact).
6. Small "Peak Fettle" wordmark + subtle app-store hint on the card footer.

## Notes
Do NOT auto-post anywhere. No deep analytics on shares in v1.

---

# TICKET-132 — Prebuilt program shelf
**Owner:** dev-frontend + content
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** S–M (~1 wk)
**Area:** new `mobile/src/data/programs/` (static JSON), `mobile/app/templates.tsx` shelf section + preview sheet, `planAdoption.ts` glue
**Blocks:** nothing

## Goal
Boostcamp built a company on "the classics, ready to run." We already own the harder half (template rail + deterministic engine with progression/deloads). Encode ~8 canonical public-domain programs and give them a browsable shelf. Our twist: **classics that auto-progress and auto-deload** through the engine.

## Acceptance criteria
1. Programs encoded as static bundled JSON using the existing routine/template shape — superset/dropset fields included where the program calls for them (validated through `routineExerciseFields.ts` allowlist, same as any import): GZCLP (4-day), 5/3/1-style wave (3-day), PPL (6-day), nSuns-style (5-day), Starting-Strength-style LP (3-day), upper/lower (4-day), full-body beginner (already have — link it), minimalist 2-day.
2. Shelf UI on templates screen: card per program — days/week, level, progression style, preview of week 1 → "Adopt". Adoption runs through `planAdoption` so the engine owns progression thereafter.
3. Works fully offline (free tier) — static content, no server.
4. Naming is trademark-safe: describe the method ("LP 4-day T1/T2/T3"), credit styles generically; no coach brand names.
5. Each program JSON has a `source_notes` field documenting the progression rules encoded, so engine mapping is reviewable.

## Notes
If the engine cannot express a program's exact progression (e.g. AMRAP-driven TM bumps), encode the closest deterministic rule and document the delta in `source_notes` — do NOT bolt special cases onto engine v2 in this ticket.

---

# TICKET-133 — Progress photos (private, on-device)
**Owner:** dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** M (~1–1.5 wks)
**Area:** `expo-image-picker` dep (EAS), photo storage under app documents dir, local schema **v6** (photo metadata), new gallery + compare UI (tab inside measurements/progress), backup toggle in `exportEngine`
**Blocked by:** TICKET-130 (lives in the same Progress surface; v6 after v5)

## Goal
Private progress photos with side-by-side compare. Positioning gift: "your photos never leave your phone — optionally sealed into your encrypted backup" is a line Hevy/Fitbod cannot say.

## Acceptance criteria
1. Capture/import via `expo-image-picker`; files stored in an app-private directory (never the camera roll unless the user exports); EXIF-stripped copies.
2. Local migration **v6**: `progress_photos (id, file_name, taken_at, pose TEXT, note TEXT)` — metadata only, in `BACKUP_TABLES`; image FILES are **excluded from the default E2E blob**, included only behind an explicit "include photos" toggle with a size estimate shown before export.
3. Gallery grid by date + pose tag (front/side/back/custom); compare view: two-up with a draggable divider + date labels.
4. Optional weekly photo reminder rides the existing notification system (no new transport).
5. Free tier: photos NEVER touch the server, full stop. Pro: photos still local-only in v1 (no photo sync) — document this in the tier policy comment.
6. Deletion actually deletes files (verify on-device), and localReset covers the photo dir.

## Notes
Requires EAS rebuild (new native module) — batch with TICKET-131's build if view-shot also needs one.

---

# TICKET-134 — Exercise media v1: muscle diagrams + form cues
**Owner:** dev-frontend + content
**Date opened:** 2026-07-03
**Sev:** 🟠 P1 · **Size:** M (1–2 wks code) — content licensing tracked separately
**Area:** `mobile/src/lib/trainingEngine/exerciseCatalog.ts` (cue + muscle fields), new `ExerciseDetailSheet`, reuse `MuscleHeatmap` body assets, `ExercisePicker` + logger entry points
**Blocks:** nothing (v2 animation pack is a later ticket)

## Goal
The most visible gap vs every competitor: our ~194-exercise catalog is text-only. v1 skips video entirely: static target-muscle diagram (highlight on the body map we ALREADY ship for MuscleHeatmap) + 3 written form cues per exercise + per-exercise history/records composed from existing components.

## Acceptance criteria
1. Catalog gains `primary_muscles[]`, `secondary_muscles[]` (aligned to the MuscleHeatmap region taxonomy) and `cues: [string, string, string]` for all ~194 entries. Static content — no schema migration, no network.
2. `ExerciseDetailSheet` reachable from ExercisePicker, logger header, and quickSwap suggestions: diagram (primary = accent fill, secondary = dimmed), cues, equipment tag, best set / e1RM / goal (existing data), recent history bars.
3. Diagram renders from the existing body-map SVG assets — no new art pipeline in v1.
4. Cue content generated in bulk, then **founder review pass before ship** (they're coaching claims); flag ~20 exercises where a text cue is genuinely insufficient as the v2 animation shortlist.
5. Bundle size delta < 300 KB (text + reused assets only).

## Notes
v2 (licensed WebP/Lottie loops for top ~80 movements) is a separate content-procurement decision — do not start licensing inside this ticket.

---

# 🟢 TIER 2 — GREENS

# TICKET-135 — Strong & Hevy CSV importers
**Owner:** dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟡 P2 · **Size:** S (2–4 d per format)
**Area:** `mobile/app/csv-import.tsx` + import pipeline (Garmin/Strava parsers already live there), new exercise-name mapping module
**Blocks:** nothing

## Goal
The switcher funnel. We already parse Garmin and Strava CSV; Strong and Hevy exports are simpler (one row per set). Hevy grew partly by importing Strong data — take the same on-ramp.

## Acceptance criteria
1. Format auto-detection by header signature (Strong: `Date,Workout Name,Exercise Name,Set Order,Weight,Reps,...`; Hevy: `title,start_time,exercise_title,set_index,weight_kg,reps,...` — verify against CURRENT real exports before coding; both apps have changed columns before).
2. Exercise-name → catalog fuzzy mapping (normalize, alias table for the top ~100 names); unmatched names → manual match/“create custom exercise” UI, mapping remembered for the rest of the file.
3. Units: Strong exports in the user's display unit — parse via `units.ts`, store exact kg (`weight_kg`), never raw lbs. Hevy exports kg. Test both.
4. Warm-up/failure set markers map to our set `kind`; RPE columns map to RIR (10 − RPE); dedupe by (timestamp, exercise, set_index) so re-import is idempotent.
5. Free tier: pure local writes through the data layer. Import summary screen (workouts/sets imported, skipped, unmatched).
6. Fixture-file unit tests for both parsers (real anonymized exports as fixtures).

---

# TICKET-136 — HealthKit / Health Connect re-enable
**Owner:** dev-mobile-native
**Date opened:** 2026-07-03
**Sev:** 🟡 P2 · **Size:** M (1–2 wks + on-device soak)
**Area:** `mobile/src/services/healthKit.ts` (stub → real adapter), `mobile/package.json` + `app.json` plugins, EAS
**Blocks:** TICKET-140 (watch HR)

## Goal
`healthKit.ts` has been stubbed since 2026-05-28 (iOS 26.5-beta TurboModule NSException boot crash in `react-native-health`). Every competitor syncs Apple Health / Google Fit; Strong even paywalls it. **Do NOT restore `react-native-health`** — swap to the maintained Swift-based `@kingstinct/react-native-healthkit`; Android via Health Connect (`react-native-health-connect`).

## Acceptance criteria
1. Implement the existing adapter seam ONLY: `fetchHealthKitData` + `importCardioMetrics(range)` return the established `CardioMetrics` shape — consumers (`useHealthMetrics`, `api/healthMetrics`) must need ZERO changes (that seam was built for exactly this swap).
2. Auth prompt is user-triggered from the health-metrics screen — NEVER on the boot path; all Health queries off cold-start, background/idle with a timeout (CLAUDE.md §5 discipline applies).
3. Reads v1: bodyweight (feeds the weekly `bodyweight` table + percentile model), workouts/HR/energy for cardio import. Writes v1: finished workouts to Health (toggle, default on for iOS parity).
4. Free-tier note: Health data is device-local by nature — no tier branch needed for reads, but any server mirror of health metrics remains Pro-only through the existing tier-branched hook.
5. EAS rebuild; the boot-crash regression check is explicit: cold-start 20× on an iOS 26 device before calling it done (founder device test — schedule it).
6. If `@kingstinct` also proves crashy on iOS 26: STOP, document, fall back to the stub — do not ship a boot risk for a sync feature.

---

# TICKET-137 — Live Activities + Dynamic Island rest timer (+ Android ongoing notification)
**Owner:** dev-mobile-native
**Date opened:** 2026-07-03
**Sev:** 🟡 P2 · **Size:** M (1–2 wks iOS, 2–3 d Android)
**Area:** new ActivityKit widget-extension target via `@bacons/apple-targets` (pattern proven in LifeOS — keep the plugin-order lesson in mind), small native bridge module, `useRestTimer` + logger session state, Android foreground notification
**Blocks:** TICKET-140 (shares session-state plumbing)

## Goal
Between sets, users lock the phone — and we go silent while Hevy/Strong keep the countdown on the lock screen and Dynamic Island. Most-felt daily gap for switchers; highest "feels native" payoff per week of work.

## Acceptance criteria
1. iOS Live Activity: rest countdown (native timer text — no per-second bridge updates), current exercise, set x/y, next target (from logger state), progress bar; +15 s and Skip actions via extension App Intents that round-trip to `useRestTimer`.
2. `useRestTimer` remains the single source of truth; bridge exposes start/update/end only. Activity auto-ends on workout finish/discard and self-expires (stale-activity guard) if the app is killed.
3. Dynamic Island: compact = countdown; expanded = exercise + next target + actions.
4. Android: foreground service notification with chronometer + same actions; survives app backgrounding; respects notification permissions flow.
5. Free tier: zero network — all state is on-device.
6. EAS rebuild both platforms; test matrix: island devices, non-island devices (lock screen only), Android 14+.

---

# TICKET-138 — Routine share links + deep-link import
**Owner:** dev-fullstack
**Date opened:** 2026-07-03
**Sev:** 🟡 P2 · **Size:** M (~1 wk)
**Area:** new server route (`server/routes/shareLinks.js`), routine sheet "Share" action, deep-link handling in `mobile/app/_layout.tsx` routing, import path through `routineExerciseFields.ts`
**Blocks:** nothing

## Goal
"Send my routine to a friend" — Hevy's quiet viral loop. Server stores a validated routine blob behind a short link; the app imports via deep link. Our import path is already hardened for exactly this: the DATA-01 allowlist was built for untrusted routine JSON, supersets/dropsets included.

## Acceptance criteria
1. POST (auth'd, rate-limited) → validate through the existing Zod `ExerciseEntrySchema` server-side → store blob → short id. GET serves a minimal web preview (name, days, exercise list) + `peakfettle://routine/<id>` deep link + store links.
2. Client import: fetch blob → `allowlistExercise` per entry (NO blind spread — DATA-01) → save as a new local routine (free tier: local only; creating/serving a link is an explicit user-initiated network action — same carve-out class as the group weekly signal; note it in `tierPolicy.ts` comments).
3. Links expire (default 90 d) and are unlisted; no browsing/discovery surface in v1. Revoke = delete.
4. Server migration additive + drift-guarded + folded into `db/schema.sql`; route degrades (404/410 JSON) cleanly.
5. Round-trip test: routine with superset pair + dropset config survives share → import byte-equal on the allowlisted fields (`canonicalRoutineKey` stable).

---

# TICKET-139 — Group leaderboards (opt-in, group-scoped)
**Owner:** dev-fullstack
**Date opened:** 2026-07-03
**Sev:** 🟡 P2 · **Size:** M (~1 wk)
**Area:** group weekly-signal payload + server aggregation, `mobile/app/group-detail.tsx` board UI, per-group opt-in setting
**Blocks:** nothing

## Goal
Competition without a public feed: weekly volume/session/streak board INSIDE existing groups only. Rides the one sanctioned free-tier network path (group weekly signal). Global public leaderboards remain explicitly out of scope — they fight the privacy identity and invite sandbagging.

## Acceptance criteria
1. Weekly signal payload gains opt-in aggregates: total volume (kg), session count, streak weeks. Opt-in is PER GROUP, off by default; non-participants show as "—" not zero.
2. Server aggregates per group-week; drift-guarded migration; endpoint degrades to empty 200 per house rules.
3. Board UI in group-detail: current week + last week, member display names (existing group identity), no cross-group or global rollups, no absolute-strength comparisons (volume ≠ strength — copy makes that clear).
4. Free-tier network review: the ONLY new call rides the existing weekly-signal cadence — verify no new on-mount fetch (grep gate per DoD #4).
5. Anti-gaming guard v1: volume counted only from sets with plausible bounds (reuse engine plausibility limits); document known limitations.

---

# TICKET-140 — Apple Watch app v1
**Owner:** dev-mobile-native (+ Opus architecture review before build)
**Date opened:** 2026-07-03
**Sev:** 🟡 P2 · **Size:** XL (4–8 wks, staged)
**Area:** new watchOS SwiftUI target (`@bacons/apple-targets`), WatchConnectivity bridge to the phone's local DB, logger session mirror, HR via HealthKit workout session
**Blocked by:** TICKET-136 (HR), TICKET-137 (session-state plumbing)

## Goal
Logging from the wrist: set ticks, weight/rep steppers, rest timer, HR capture. The #1 App-Store-review differentiator among Hevy/Strong/Fitbod and the hardest-to-copy moat feature. The codebase is unusually ready (HealthKit adapter is documented as the watch-ready seam; apple-targets pattern proven in LifeOS) — but this is still the biggest lift in the backlog. Commit a full block or park it; no half-commitment.

## Acceptance criteria (staged — each stage independently shippable to TestFlight)
1. **Stage A (wk 1–2):** watchOS target boots; WatchConnectivity handshake; today's workout (exercises + target sets) mirrors to the wrist; phone remains source of truth.
2. **Stage B (wk 2–4):** set logging on watch (✓ at target, or adjust reps/weight with crown/steppers) → queued via WatchConnectivity → written through the PHONE's local data layer (the local-first invariant extends to the wrist — the watch NEVER talks REST). Offline queue with replay; conflict rule: last-write-wins per set id.
3. **Stage C (wk 4–6):** rest timer on wrist (haptic at zero) synced with TICKET-137 state; HR sampling via HKWorkoutSession → per-set/per-workout HR through `importCardioMetrics`.
4. Battery + reliability soak: a full 60-min workout with screen-off gaps loses zero sets (founder device test).
5. Every stage: EAS + physical devices; budget calendar time, not just eng time.

## Open decision for the founder
Standalone-watch logging (no phone in the gym) is OUT of v1 — requires watch-local storage + sync merge. Flag interest level now; it shapes Stage B's queue design.

---

# 🟡 TIER 3 — YELLOWS

# TICKET-141 — In-session autoregulation suggestions (deterministic)
**Owner:** **Opus lane** (engine math) + dev-frontend (strip UI)
**Date opened:** 2026-07-03
**Sev:** 🟢 P3 · **Size:** M (1–2 wks incl. tests)
**Area:** `mobile/src/lib/trainingEngine/v2/` (new suggestion rule module), `StepperLogger` suggestion strip, `engineV2.test.js`
**Blocked by:** TICKET-128 (respect effort-display setting in copy)
**Blocks:** TICKET-142 (shares suggestion plumbing)

## Goal
"Hevy Trainer auto-adjusts your weights" is 2026's headline feature — and under the hood it's arithmetic we already own. Extend engine v2 with next-set/next-session load suggestions from (last e1RM, logged RIR vs target band, engine increment config). **Founder rule stands: the word "AI" never appears.** The copy IS the feature: every suggestion shows its rule ("engine rule P2: you hit 80×8 @ RIR 2 last week").

## Acceptance criteria
1. Pure, deterministic rule module: inputs (exercise history slice, target RIR band, increment/rounding config per equipment) → `{suggested_kg, rule_id, because: string}`. No randomness, no clock reads inside the rule (Workflow lint: no literal Date.now()/Math.random() — pass "now" in).
2. Table-driven unit tests: progression case, RIR-miss case (suggest hold/‑2.5%), missed-reps case, stale-history case (>21 d → conservative restart), unit rounding via `units.ts` plate increments (kg AND lb mode).
3. Logger strip renders suggestion + "because" line + one-tap Apply (prefills via `kgToInputValue`); dismissible; per-exercise mute. Suggestions render for the CURRENT exercise only, computed on-device from local history — zero network on any tier.
4. Engine docs section: rule table with worked examples; copy reviewed against the no-"AI" rule.
5. Off by default in v1 (settings flag) → flip after a founder self-test week.

---

# TICKET-142 — Fatigue-aware plan adjustment
**Owner:** **Opus lane** (engine) + dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟢 P3 · **Size:** M (1–2 wks)
**Area:** readiness/recovery model outputs → `mobile/app/plan-adjust.tsx` + engine deload/volume hooks (`season_phase`, `last_deload_at` already in profile)
**Blocked by:** TICKET-141 (suggestion plumbing + UI patterns)

## Goal
Fitbod's moat is fatigue-aware programming. We already COMPUTE readiness (`ReadinessCard`, recovery heatmap) — it just doesn't act. Wire it into plan adjustment: sustained low readiness → suggest a volume trim or early deload. Suggest-only; the user always confirms. All on-device.

## Acceptance criteria
1. Deterministic trigger rules (documented thresholds): e.g. readiness below X for N consecutive sessions → propose −20% accessory volume next session; below Y across a rolling week + ≥5 wks since `last_deload_at` → propose pulling the deload forward. Exact thresholds proposed by Opus, signed off by founder.
2. Surfaced as a plan-adjust card (same "because" pattern as TICKET-141): what fires, why, one-tap accept / dismiss; dismissals back off (no nagging).
3. Engine applies accepted adjustments through EXISTING deload/volume mechanisms — no new progression concepts.
4. Unit tests over synthetic readiness series (trigger, no-trigger, backoff, post-deload reset).
5. Zero network; readiness inputs are already local on both tiers.

---

# TICKET-143 — Achievements / badges → cosmetics unlocks
**Owner:** dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟢 P3 · **Size:** S–M (~1 wk)
**Area:** local schema **v7** (badge state), static badge definitions JSON, rule evaluator over existing tables (workouts, PRs, streaks, groups), profile "badge case" UI, cosmetics grant hook
**Blocks:** nothing

## Goal
We already have the hard parts: streaks, PR detection, and — uniquely — a cosmetics/avatar system that gives badges something REAL to unlock ("100 workouts → jersey option"). Close the gamification gap at near-zero architectural cost.

## Acceptance criteria
1. Static badge defs (id, name, rule, cosmetic_grant?): milestones for workout count, streak weeks, PR count, total volume, group participation, program completion. ~20 badges v1.
2. Local evaluator runs post-workout-save + on app open (cheap, indexed queries only — nothing on the boot critical path); state in `badges_earned (badge_id, earned_at)` (migration v7, BACKUP_TABLES, migrations test).
3. Unlock moment: toast + badge-case entry + cosmetic grant through the EXISTING cosmetics grant path — coordinate with the cosmetic-gating fix from the 2026-06-19 review (do not add a new bypass surface; free/Pro cosmetic entitlements respected).
4. Badge case on profile: earned vs locked (locked show rule, not a mystery). No server, no sharing in v1 (share-card integration = later ticket).
5. Retroactive grant on first run (evaluate over full local history — test with a large history fixture for perf).

---

# TICKET-144 — Circuits (3+ exercises) + conditioning timers
**Owner:** dev-frontend
**Date opened:** 2026-07-03
**Sev:** 🟢 P3 · **Size:** M (1–2 wks)
**Area:** `SupersetLinkSheet` / `SupersetPairSheet` → group editor, logger rotation logic (`loggerLogic.ts`), new interval timer mode
**Blocks:** nothing

## Goal
The data model already supports circuits TODAY — `superset_group` is a string and `superset_rounds` goes to 10; only the pair-oriented UI caps groups at 2. Unlock 3+ exercise groups, then add EMOM/AMRAP/interval timer modes for conditioning work.

## Acceptance criteria
1. Routine editor: link N ≤ 5 exercises into one group (UI bound; schema already allows it); group letter + rounds editing; DATA-01 allowlist bounds unchanged (verify round-trip through `routineExerciseFields` for a 4-exercise group).
2. Logger rotation: A→B→C→A ordering with clear "next up" indication; rest timer behavior per group (rest after round vs after exercise — setting); DropChainBar unaffected.
3. Conditioning timers: EMOM (work-on-the-minute), AMRAP (count rounds in T), fixed intervals (work/rest × rounds) — as a timer sheet attachable to a cardio-type exercise; results land in existing set fields (`duration_sec`, reps=rounds where sensible).
4. Engine/plan-gen: generated plans may EMIT pairs only (unchanged); circuits are user-authored in v1.
5. Unit tests for rotation logic edge cases (mid-circuit exercise swap, abandon, unequal set counts).

---

# TICKET-145 — Siri / App Intents voice logging + interactive widgets
**Owner:** dev-mobile-native
**Date opened:** 2026-07-03
**Sev:** 🟢 P3 · **Size:** M (1–2 wks)
**Area:** App Intents extension (apple-targets), intents → local data layer bridge, `widgetBridge` interactive buttons, EAS
**Blocks:** nothing

## Goal
"Hey Siri, log 8 reps at 100 kilos." Hands-are-chalky is a real gym case, and App Intents also unlock interactive buttons on the widgets we already ship (start workout / start rest from the lock screen). This is where iOS is pushing; cheap differentiation vs slower competitors.

## Acceptance criteria
1. Intents v1: `LogSetIntent(reps, weight, exercise?)` (defaults to current in-progress exercise), `StartWorkoutIntent(routine?)`, `StartRestIntent(seconds?)`. All write through the LOCAL data layer via the bridge — no REST on any tier.
2. Weight parsing respects the user's display unit and converts via `units.ts` (a spoken "one hundred" in lb-mode must store 45.36 kg — the 185-lb lesson, voice edition).
3. Widget upgrade: existing home/lock widgets gain interactive buttons wired to the same intents (iOS 17+ path; static fallback below).
4. Siri phrase suggestions surfaced in settings; graceful failure copy when no workout is active.
5. EAS rebuild; intents unit-testable via a thin pure "intent handler" layer (parse-sweep + tests per DoD).

---

# TICKET-146 — Localization scaffold + string extraction
**Owner:** dev-frontend scaffold + **Haiku lane** extraction
**Date opened:** 2026-07-03
**Sev:** 🟢 P3 · **Size:** L (2–4 wks, mechanical)
**Area:** i18n scaffold (i18next or Lingui), all 35 screens + components, `constants/locale.ts`, pseudo-locale test
**Blocks:** nothing (translations procurement is a separate, later decision)

## Goal
Hevy/Strong ship 10+ languages; we ship English. This ticket builds the RAIL (scaffold + full string extraction + pseudo-locale verification) so that translating later is a content task, not an engineering one. Schedule only when non-English marketing is actually on the table.

## Acceptance criteria
1. i18n scaffold with typed keys; `en.json` as source of truth; locale detection + manual override in settings; units stay on the existing `units.ts`/`locale.ts` logic (do not entangle).
2. Every user-facing string in `mobile/app` + `mobile/src` extracted (Haiku lane, screen-by-screen with disjoint file ownership; Sonnet reviews interpolations/plurals). Notification copy + widget strings included; engine "because" strings (TICKET-141/142) go through keys from day one.
3. Pseudo-locale (āccented, 1.4× length) build verifies nothing truncates on the worst 10 screens; RTL smoke-check documented as v2.
4. `tsc` delta rule strictly enforced — typed keys must not add errors; parse-sweep after every extraction batch (this is exactly the kind of mechanical mass-edit that has truncated files before).
5. CI-able check: no raw JSX string literals in changed files (lint rule), so the extraction doesn't rot.

---

## 🔚 Explicitly NOT ticketed (red band — founder decision first)
- **Public social feed (G14):** recommend the group-feed variant instead (see gap report M8); if group engagement data later demands more, spec it as its own product cycle with moderation/reporting scoped in.
- **Coach/client platform (G21):** a second business, not a feature.

*Generated 2026-07-03 from the feature-gap analysis. Numbering verified against the repo (highest prior ticket: TICKET-127).*
