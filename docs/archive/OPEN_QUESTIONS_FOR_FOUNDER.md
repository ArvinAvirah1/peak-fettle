# Open Questions for the Founder

Living doc (TICKET-071). When product **vision** is unclear, agents add a numbered question here — with context, options, and a recommendation — instead of guessing. Founder answers inline; the coordinator routes answers into tickets.

Status legend: `OPEN` · `ANSWERED (date)` · `SUPERSEDED`

---

## Q1 — Which mobile client is canonical? `ANSWERED (2026-05-29)`
The repo contains several clients: `mobile/` (RN/Expo, appears active), `MyApp/` (Expo), `peak-fettle-app/`, and a C++/QML app (`qml/`, `src/`, `CMakeLists.txt`). Multiple half-built clients are a maintenance and corruption-surface risk.
- **Options:** (a) `mobile/` is canonical, retire the rest; (b) keep one more for a reason; (c) other.
- **Recommendation:** (a). Confirm so TICKET-064 can mark the others legacy/dead and stop sweeping them.
- **Impact:** scope of the entire audit and all rewrites.
- **Answer:** **(a)** — `mobile/` is canonical. Retire `MyApp/`, `peak-fettle-app/`, `qml/`, `src/`, `CMakeLists.txt`. TICKET-064 audit scope and all future parse-sweeps cover `mobile/` only.

## Q2 — How many scores do we show users? `ANSWERED (2026-05-29)`
The product computes DOTS, (maybe) Wilks, `percentile_simple` (experience-adjusted), and the new sex-only percentile + tier ladder. Showing all four may confuse users.
- **Options:** (a) tier ladder as the headline + the two-score card as detail, Wilks hidden; (b) expose all; (c) other.
- **Recommendation:** (a). Drives TICKET-066.
- **Impact:** scoring consolidation + UI.
- **Answer:** Tier ladder is the headline. Also show the **experience + weight + sex adjusted percentile** — both per individual exercise (when viewing a single lift) and as a **median across all exercises once the user has ≥10 different exercises logged**. The median card is hidden below the 10-exercise threshold. Drives TICKET-066 UI spec.

## Q3 — Keep or drop Wilks? `ANSWERED (2026-05-29)`
ROADMAP §1.2 lists Wilks as "specified but not confirmed shipped."
- **Options:** (a) implement + verify against published tables; (b) drop it (DOTS + PF percentile suffice).
- **Recommendation:** (b) unless competitive powerlifters (Marcus persona) specifically need Wilks. Drives TICKET-066 #2.
- **Answer:** Keep Wilks but **hidden by default**. Users can toggle it on in the menu/settings if they want to see their Wilks number. Do not surface it in the main rankings UI. Drives TICKET-066: implement the toggle, keep the calculation, suppress the display by default.

## Q4 — May we squash migration history? `ANSWERED (2026-05-29)`
If `migrations/` and `all_migrations.sql` have drifted (TICKET-068), the clean fix may be a consolidation migration.
- **Options:** (a) consolidate to one canonical history; (b) preserve full history, only patch drift.
- **Recommendation:** decide before TICKET-068 acts; squashing is irreversible for history.
- **Answer:** **(a)** — consolidate to one canonical migration history. No real clients yet so history preservation is not a constraint. TICKET-068 may squash `migrations/` into a single `all_migrations.sql` baseline.

## Q5 — Companion app: confirm the pitch decisions `ANSWERED (2026-05-29)`
Captured 2026-05-29: standalone app / shared backend / bundled into paid tier / light CBT-mindfulness positioning. See `COMPANION_APP_PITCH_2026-05-29.md`.
- **Remaining sub-questions in the pitch's "Open questions" section** (name, platform priority iOS-first?, screen-time data approach given OS limits, launch scope). Answer there.
- **Impact:** gates TICKET-072 → build tickets.
- **Answer:** **(a)** — confirmed: standalone app, shared backend, bundled into paid tier, light CBT/mindfulness. Sub-questions (name, iOS-first, screen-time approach, launch scope) remain open in `COMPANION_APP_PITCH_2026-05-29.md`.

## Q6 — Push token registration: patchProfile vs /user/push-token endpoint? `ANSWERED (2026-06-12)`
Found in TICKET-064 audit (F-003/F-004). Two competing paths exist:
- **Active path:** `pushNotifications.ts` calls `patchProfile({ fcm_token: token.data })` — writes to `users.fcm_token` via `PATCH /user/profile`. Works today.
- **Dead stub:** `pushTokens.ts` declares `registerPushToken` / `unregisterPushToken` pointing to `/user/push-token` — that endpoint **does not exist** on the server. Never called anywhere.
- **Options:** (a) Build `/user/push-token` on the server, migrate `pushNotifications.ts` to use the dedicated endpoint; (b) Delete `pushTokens.ts`, keep `patchProfile` path as intentional; (c) other.
- **Recommendation:** (a) — dedicated endpoint is cleaner, decouples token lifecycle from profile updates, easier to debug. (b) is safe short-term.
- **Impact:** gates TICKET-065 push pipeline rewrite design.
- **Answer:** **(a)** — build `/user/push-token` on the server. Migrate `pushNotifications.ts` to call `registerPushToken` / `unregisterPushToken` from `pushTokens.ts`. Delete the `patchProfile({ fcm_token })` path. TICKET-065 owns the implementation.

---

## Q7 — Companion app name? `ANSWERED (2026-06-20)`
Founder does not like "Peak Fettle Mind." Expanded option set in `COMPANION_APP_NAMING_2026-05-29.md` (grouped: Fettle-family, mountain/trail siblings, standalone calm names). Build proceeds name-agnostic via a single `PRODUCT_NAME` constant (`mind/src/config/product.ts`) so the final pick is a one-line swap.
- **Working title in code:** "Fettle Rest" placeholder (clearly marked TBD) until founder picks.
- **Impact:** bundle ID, App Store listing, brand assets, all disclaimer/crisis copy. Needed before TICKET-081 (store submission); NOT a blocker for TICKET-073/074 thanks to the constant.

## Q8 — AI reflection in v1 or deferred? `ANSWERED (2026-05-29)`
Pitch recommendation: defer to P4 (Claude Haiku journaling prompts with safety guardrails).
- **Options:** (a) keep deferred to P4; (b) include in v1 with conservative safety prompting.
- **Answer:** **(a)** — deferred to P4. No LLM in v1. TICKET-078 exercise library ships with seeded, human-written content only.

## Q9 — Who human-reviews the crisis copy? `ANSWERED (2026-05-29)`
TICKET-073 requires a human to approve crisis resource text (988 copy, contextual trigger wording, disclaimer language) before any build ships.
- **Answer:** **Founder reviews it.** TICKET-073 drafts the copy; it is marked `PENDING FOUNDER REVIEW` and cannot ship until the founder signs off in `mind/CONTENT_SAFETY.md`.

## Q10 — Encryption key management for mood notes / journal entries? `ANSWERED (2026-05-29)`
Mind stores sensitive `note_encrypted` and `body_encrypted` fields.
- **(a) Client-side AES** — most private; notes lost if session key rotates.
- **(b) Server-side encryption** — simpler, operationally recoverable, server holds key.
- **(c) Defer encryption** — plain text v1.
- **Answer:** **(b) for v1 simplicity; upgrade to (a) post-beta if user trust requires it.** TICKET-076 encrypts notes server-side at write; migration column stays `note_encrypted` so an (a) upgrade is non-breaking.

## Q11 — Set-logging stepper format `ANSWERED (2026-06-01)`
Founder reported the live set-addition didn't match the wanted format; 5 annotated mockups provided.
- **Answer (drives TICKET-074 + TICKET-077):**
  - Stepper is the format. **`routine`** variant is default; **`free`** (add-as-you-go) variant
    for no-routine sessions; **`smart`** (suggested-next) variant is **PRO** → TICKET-077.
  - **Off-routine logging** → prompt to add the exercise to the routine with **three** placements:
    `End of routine` / `After current` (default) / `Pick position…`.
  - **RIR**: optional, **shown by default** (not behind a disclosure, not required).
  - **Cardio**: **deferred** — founder unsure of the format; leave cardio path unchanged for now.
  - **"Choose alternative exercise"** (machine busy at the gym → ranked swaps) is a **PRO**
    feature; backend `GET /exercises/:id/alternatives` already exists + `requirePaid` → TICKET-077.

## Q12 — Nuke the previous database? `ANSWERED (2026-06-01)`
Founder: "willing to just nuke the previous db because none of the pulls from it were working
other than the initial sign in."
- **Answer:** **Yes.** Old migration pile deleted from the tree (recoverable from git `815fb47`);
  `db/schema.sql` is the single source of truth. Founder to drop the Supabase DB and re-run
  `db/schema.sql` on a fresh project (TICKET-073). The "no pulls worked" symptom is consistent
  with the deployed DB missing schema the code needs — a fresh, complete `db/schema.sql` is the fix.

## Q13 — Pro-tier billing provider `ANSWERED (2026-06-01)`
How does `users.tier` flip to `'paid'` (the gate `requirePaid` enforces)?
- **Recommendation:** RevenueCat — first-class Expo/EAS support, wraps StoreKit + Play Billing,
  free under ~$2.5k/mo then ~1%, webhook → server sets `tier`. Don't use Stripe directly for
  in-app subs (store policy); Adapty is the comparable alternative.
- **Answer:** **RevenueCat.** Drives TICKET-077 (integration architecture recorded there): client
  `react-native-purchases` + Expo plugin; server webhook sets `users.tier='paid'` and must not
  downgrade comped users (`comp_pro=true`). `requirePaid` stays the single source of truth.

## Q14 — Set-logging visual design: are the 5 screenshots final? `ANSWERED (2026-06-01)`
- **Answer:** **Yes.** The 5 screenshots are the final design (dark theme + teal accent). The
  older `set-logging-*.html` variant files (layout/theme/font options) are **superseded**.
  Drives TICKET-074 (build to the screenshots).

---

# Q15–Q31 — Companion app v2 vision (2026-06-11 founder directive: expansive app — Opal-level blockers, habit stacks, goals, algorithmic life-direction engine)

*All answered 2026-06-11. Spec output: `COMPANION_APP_V2_LIFEOS_SPEC_2026-06-11.md` (TICKET-100…113).*

## Q15 — Supersede or extend the approved 2026-05-29 roadmap? `ANSWERED (2026-06-11)`
- **Answer:** **(a) supersede.** New spec replaces M-phase TICKET-075…081 scope; safety-scaffolding and foundation content carries forward (re-issued as TICKET-100/101 to avoid numbering collisions with fitness tickets).

## Q16 — Product identity & name direction `ANSWERED (2026-06-11, extends Q7)`
- **Answer:** **Life-OS positioning.** Do **not** describe or market it as a mental-health app — it improves mental health *indirectly* by providing direction and removing dopamine spirals. Standalone app on the shared backend confirmed. Name brief (Q7 still open) re-aimed at "ascent/direction", not "calm/mind".

## Q17 — Priority vs fitness backlog `ANSWERED (2026-06-11)`
- **Answer:** **Spec now.** Build sequenced after the 094 local-first base is stable (the new app reuses it).

## Q18 — iOS FamilyControls entitlement `ANSWERED (2026-06-11)`
- **Answer:** **(a)** — apply for the FamilyControls distribution entitlement immediately; build the rest in parallel; blockers ship behind a flag when granted. Native Swift extensions + custom dev client accepted.

## Q19 — Unlock-friction mechanics `ANSWERED (2026-06-11)`
- **Answer:** Per rec — **wait timer (escalating) + breathing gate + daily snooze budget in v1; opt-in strict "Deep Focus" mode v1.1; no money stakes.**

## Q20 — Blocking scope `ANSWERED (2026-06-11)`
- **Answer:** Per rec — **scheduled sessions + always-on per-app/category daily limits + one-tap focus-now in v1; website blocking P2.**

## Q21 — Android blocker timeline `ANSWERED (2026-06-11)`
- **Answer:** **Defer.** Architecture must keep iOS-only code isolated so Android can follow.

## Q22 — Habit-stack model `ANSWERED (2026-06-11)`
- **Answer:** Per rec — stack = ordered habit group with time/event anchor, per-step check-off, partial completion counts, guided stack player. One shared data model.

## Q23 — Streak philosophy `ANSWERED (2026-06-11)`
- **Answer:** Per rec — forgiving streaks everywhere; milestone badges on top; never punitive.

## Q24 — Goal taxonomy & structure `ANSWERED (2026-06-11)`
- **Answer:** Per rec — 6 fixed domains (Health/Fitness, Professional, Personal growth/Learning, Interpersonal, Financial, Mind/Wellbeing); outcome goal → milestones → linked process habits/stacks; weekly review is a core ritual screen.

## Q25 — Direction engine: runtime LLM or encoded algorithm? `ANSWERED (2026-06-11)`
- **Answer:** **No runtime AI.** Offline research distilled into a deterministic, versioned, on-device ruleset (`directionModel.v1.ts` + derivation doc), mirroring the strength-model practice.

## Q26 — Survey depth & variables `ANSWERED (2026-06-11)`
- **Answer:** Per rec — 5–7 min onboarding survey, progressive per-domain deepening, monthly micro-re-check, quarterly full re-survey.

## Q27 — Research scope & liability boundaries `ANSWERED (2026-06-11)`
- **Answer:** Per rec — cover focus/productivity, skill acquisition, career, sleep, relationships, finance, CBT/wellbeing, encoded strictly as **behavioral protocols** — never financial advice or therapy directives. CONTENT_SAFETY.md extended.

## Q28 — Engine prescriptiveness `ANSWERED (2026-06-11)`
- **Answer:** Per rec — engine generates per-domain protocols (stacks + milestones + blocker config + content); **proposes, never auto-enrolls**.

## Q29 — CBT depth & safety scaffolding `ANSWERED (2026-06-11)`
- **Answer:** Per rec — confirmed. Safety scaffolding (crisis resources, disclaimer, content rules) ships first, non-clinical positioning unchanged.

## Q30 — Local-first from day one? `ANSWERED (2026-06-11)`
- **Answer:** **Yes.** Reuse 094 local-DB + E2E-backup architecture; server stores only auth/entitlement + opaque encrypted blobs. Supersedes Q10's server-side-encryption answer for this app.

## Q31 — Monetization `ANSWERED (2026-06-11)`
- **Answer:** Per rec — **(c)** bundled into the paid tier at launch; entitlement plumbing kept separable for a future standalone SKU.

---
*Add new questions below as Q32, Q33, … — never silently assume an answer.*

---

# 2026-06-20 — v3 completion sprint (Peak Fettle LifeOS)

*Spec: `COMPANION_APP_V3_SPEC_2026-06-20.md`; roadmap: `DEV_ROADMAP_2026-06-20-LIFEOS-V3.md`.*

## Q7 — Companion app name? `ANSWERED (2026-06-20)`
- **Answer:** **"Peak Fettle LifeOS"** (`PRODUCT_NAME='Peak Fettle LifeOS'`, `PRODUCT_SHORT='LifeOS'`). Applied in `lifeos/src/config/product.ts` + `lifeos/app.json`. Bundle/slug/scheme unchanged (`com.peakfettle.lifeos` / `pf-lifeos` / `lifeos`).
- **Caveat:** USPTO trademark clearance (classes 9 + 42) still required before store submission (TICKET-127). "LifeOS"/"Life OS" is a common descriptive term; the compound mark is more defensible but must be cleared.

## Q32 — How should the fitness app surface LifeOS (the "separate mobile tab")? `ANSWERED (2026-07-02)`
The whole-person streak endpoint exists (TICKET-111); the fitness app doesn't surface LifeOS yet.
- **Options:** (a) a **card in the `You/Profile` tab** (whole-person streak + "Open/Get LifeOS" CTA) — lowest UX risk, no tab-bar crowding; (b) a **sixth bottom tab** in the fitness app linking to LifeOS — more prominent, crowds the already-5-tab bar.
- **Recommendation:** **(a).** Ship-ready code for (a) is in TICKET-125; (b) is a layout variant.
- **Impact:** TICKET-125.
- **Answer:** **(a)** — locked 2026-07-02. The profile-tab card shipped in TICKET-125 is final; no sixth tab.

## Q33 — Accountability-partner data posture? `ANSWERED (2026-07-02)`
The accountability-partner feature (TICKET-121, opt-in, default OFF) shares only a daily **summary**, never raw data.
- **Options:** (a) **invite-code + minimal server** (stores only the latest summary string + scope; enables automatic delivery; needs a tiny server route + an App Privacy "shared data" disclosure); (b) **share-sheet only** (user manually sends the summary; zero server, zero new disclosure, no auto-delivery).
- **Recommendation:** **(a)** if automatic partner visibility is wanted; **(b)** to avoid any new server-side data entirely. Either is privacy-safe (summary only).
- **Impact:** TICKET-121 (and TICKET-127 security/privacy review).
- **Answer:** **(a)** — locked 2026-07-02. Invite-code + minimal server endpoint as shipped in TICKET-121 (hardened in TICKET-127 + the 2026-07-02 completion run: server-side pause enforcement, friendly HTML partner page, `share_scope_json` removed).

*Add new questions below as Q34, Q35, …*
