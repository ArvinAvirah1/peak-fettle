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

## Q6 — Push token registration: patchProfile vs /user/push-token endpoint? `OPEN`
Found in TICKET-064 audit (F-003/F-004). Two competing paths exist:
- **Active path:** `pushNotifications.ts` calls `patchProfile({ fcm_token: token.data })` — writes to `users.fcm_token` via `PATCH /user/profile`. Works today.
- **Dead stub:** `pushTokens.ts` declares `registerPushToken` / `unregisterPushToken` pointing to `/user/push-token` — that endpoint **does not exist** on the server. Never called anywhere.
- **Options:** (a) Build `/user/push-token` on the server, migrate `pushNotifications.ts` to use the dedicated endpoint; (b) Delete `pushTokens.ts`, keep `patchProfile` path as intentional; (c) other.
- **Recommendation:** (a) — dedicated endpoint is cleaner, decouples token lifecycle from profile updates, easier to debug. (b) is safe short-term.
- **Impact:** gates TICKET-065 push pipeline rewrite design.
- **Answer:** **(a)** — build `/user/push-token` on the server. Migrate `pushNotifications.ts` to call `registerPushToken` / `unregisterPushToken` from `pushTokens.ts`. Delete the `patchProfile({ fcm_token })` path. TICKET-065 owns the implementation.

---

## Q7 — Companion app name? `OPEN — founder rejected "Peak Fettle Mind", reviewing new options`
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

---
*Add new questions below as Q13, Q14, … — never silently assume an answer.*
