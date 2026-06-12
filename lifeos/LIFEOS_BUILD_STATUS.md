# Life OS — Build Status (TICKET-100…113)

*Built 2026-06-12 against `COMPANION_APP_V2_LIFEOS_SPEC_2026-06-11.md`. This is
the honest ledger: what exists, what deviated, what is verified, and what only
a human / a macOS build machine / Apple can unblock.*

## Ticket ledger

| Ticket | Status | Notes |
|--------|--------|-------|
| 100 Safety scaffolding | ✅ built | Crisis banner + trigger, disclaimer gate, data-handling screen, CONTENT_SAFETY.md, legal draft. **Crisis copy + protocol/exercise content PENDING FOUNDER REVIEW (Q9).** |
| 101 Foundation | ✅ built | `lifeos/` Expo app, shared auth, `lifeos_access` entitlement gate + upsell, local-first SQLite (schema v1 + migration runner from day 1), backup doc builder, parse-sweep paths extended. |
| 102 Native blocker arch | ✅ code written / ⬜ compiled | Expo local module (Swift) + 4 extension targets + config plugin. **Cannot compile on Windows** — see `native/README.md` caveats. **Founder must submit the FamilyControls distribution-entitlement request (day-1 action).** |
| 103 Habits & stacks | ✅ built + tested | Streak engine: 30-case unit table green. Stacks, player, editor, templates (incl. the wake→read→stretch→brush→wash-face morning stack). |
| 104 Blocker UX | ✅ built (behind flag) | Focus tab, rule editor, escalating-timer + breathing-gate + snooze-budget friction, shield handoff. Ships dark until the entitlement lands (Q18a). |
| 105 Goals & weekly review | ✅ built | 6 domains, milestones, habit linkage, two-signal progress, staggered review ritual. |
| 106 Direction model | ✅ built + tested | `directionModel.v1.ts` + derivation doc (R1–R16, graded citations) + template registry. 207-case test suite green (determinism, budget-fit, banned-class, 12 personas). **Founder skim of DIRECTION_MODEL_DERIVATION.md required by DoD.** |
| 107 Survey & plan reveal | ✅ built | 6-step survey, proposal cards with evidence notes, accept/edit/dismiss, full-survey supersession. Monthly micro-check exists as survey `kind:'micro'`; its push prompt rides TICKET-110's pipeline (copy in notificationTypes). |
| 108 Mind toolkit | ✅ built | Mood check-in (crisis trigger verified in code path), 11 seeded exercises + player, habit credit. |
| 109 Insights | ✅ built | Weekly recap, blocks-held metric, thresholded mood×habit correlation (≥14/≥14, soft copy, dismissable). On-device screen-time report = native `LIFEOSActivityReport` target (needs device build). |
| 110 Notifications | ◐ partial | `LO_*` types registered server-side with rules documented. **Queue writers + client reminder-time UI deferred** — the push pipeline is shared infra; wiring reminders is a small follow-up once a device build exists to verify delivery. |
| 111 Cross-app loop | ✅ built | `/lifeos/activity-ping` + computed whole-person streak endpoint; fire-and-forget ping on habit done. Fitness-app surfacing of the shared streak = follow-up in `mobile/`. |
| 112 v1.1 backlog | ⬜ not scoped | Per spec: strict mode + website blocking are v1.1. |
| 113 Verify/beta gate | ◐ this doc | See verification ledger below. Beta + store compliance need humans. |

## Verification ledger (peak-fettle-verify standard)

- ✅ `@babel/parser` sweep: **260 files, all clean** (mobile/app, mobile/src, server, lifeos/app, lifeos/src, lifeos/plugins, lifeos/targets, lifeos/__tests__) — 2026-06-12.
- ✅ `node --check` on server `.js` (included in sweep) — lifeos.js, user.js, index.js, notificationTypes.js clean.
- ✅ `lifeos/__tests__/streaks.test.js` — 30/30.
- ✅ `lifeos/__tests__/direction-model.test.js` — 207/207.
- ✅ Multi-agent adversarial review (6 dimensions, 21 agents, refutation vote per finding): 15 raw findings → 9 confirmed → **all 9 fixed**, 6 refuted. Notable: 3 of the confirmed criticals were **pre-existing fitness-server bugs** (GDPR `/user/data-export`, `/user/export`, and `POST /plans/generate` selected a nonexistent `users.age_band` column — 42703 crash on every call; fixed with the derived-CASE pattern from auth.js). Also fixed: Today-tab watcher leak, atomic tier check in activity-ping, future-date bound, RLS on `lifeos_activity_days`, restore-path identifier guard, shield-handoff contract docs.
- ⬜ `npm install` + Metro bundle of `lifeos/` — **not run** (no node_modules in sandbox; package versions mirror `mobile/` exactly).
- ⬜ Swift compilation — **impossible on Windows**; first `xcodebuild` on macOS will likely need minor signature fixes (recorded in `native/README.md`).
- ⬜ On-device blocker demo (pick app → shield → friction → grant → re-shield) — needs a physical iPhone + dev build.

## Deviations from spec (all recorded, none silent)

1. **Whole-person streak is computed on read** (server, from `workouts.day_key ∪ lifeos_activity_days`) instead of a stored `user_streaks.whole_person_streak` counter updated by two writers. One source of truth, zero coupling into the workouts route.
2. **Shield unlock handoff uses an App Group marker, not a deep link** — iOS shield-action extensions cannot launch the host app. Security posture unchanged (friction state lives app-side; only `grantExemption()` lifts a shield).
3. **Mood-note encryption**: notes live in the local DB and ride the E2E-encrypted backup (Q30 posture) rather than per-field crypto. The old Q10 server-side-encryption answer is moot — the server never sees the note at all.
4. **E2E blob upload wiring** reuses the existing `/user/backup-blob` route (094B); `src/data/backup.ts` produces the canonical doc. The crypto envelope + restore UX hook-up is a follow-up tied to a device build (restore ends with "re-pick blocked apps").
5. **Q26 cadence**: monthly micro-check/quarterly re-survey exist as data kinds + re-survey UI; the *scheduled prompting* rides the notification follow-up (110).

## Human-gated checklist (cannot be done by an agent)

- [ ] **Apple: submit FamilyControls distribution-entitlement request** (founder, day 1 — `native/README.md` has the exact steps; the review clock starts only when submitted).
- [ ] Founder review: crisis copy (`src/content/crisis.ts`), protocol templates, exercise copy, derivation register — sign-off boxes in `CONTENT_SAFETY.md` §7.
- [ ] Legal review of `legal/lifeos-privacy-addendum.md`.
- [ ] macOS: `npm install && npx expo prebuild -p ios && npx expo run:ios --device`; fix any Swift signature drift; run the blocker DoD demo.
- [ ] Apply `db/schema.sql` tail (lifeos_activity_days) to the live Supabase DB — **there is still no in-repo migration runner** (same gotcha as memory `workout-routine-link`).
- [ ] App Store: category/positioning review against Q16 (Productivity, no mental-health claims), FamilyControls justification in review notes.
- [ ] Beta: 10–20 paid subscribers, 2 weeks, zero-guilt-report bar.
- [ ] Q7: pick the name → one-line change in `src/config/product.ts` + `ShieldConfigurationExtension.swift` + bundle IDs.
