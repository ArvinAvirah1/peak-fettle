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

## Q7 — Peak Fettle Mind: app name confirmed? `OPEN`
"Peak Fettle Mind" applied as default in `COMPANION_APP_ROADMAP_2026-05-29.md`. Alternatives from the pitch: "Fettle Mind", "Headroom", "Even Keel", "Baseline".
- **Impact:** bundle ID, App Store listing, brand assets. Easy to change before TICKET-074 (foundation).

## Q8 — AI reflection in v1 or deferred? `OPEN`
Pitch recommendation: defer to P4 (Claude Haiku journaling prompts with safety guardrails). Applied as default.
- **Options:** (a) keep deferred to P4; (b) include in v1 with conservative safety prompting.
- **Impact:** gates whether TICKET-078 exercise library includes any AI-generated prompts.

## Q9 — Who human-reviews the crisis copy? `OPEN`
TICKET-073 (safety scaffolding) requires a human to approve crisis resource text (988 copy, contextual trigger wording, disclaimer language) before any build ships. An agent can draft; a human must sign off.
- **Impact:** TICKET-073 cannot be marked done without a named reviewer.
- **Action needed:** nominate yourself or a designated reviewer.

## Q10 — Encryption key management for mood notes / journal entries? `OPEN`
Mind stores sensitive `note_encrypted` and `body_encrypted` fields. Three options:
- **(a) Client-side AES** — key derived from session token. Notes lost if session key rotates without migration. Most private.
- **(b) Server-side encryption** — server encrypts before storing. Simpler, operationally recoverable, but server holds the key.
- **(c) Defer encryption** — store plain text in v1, encrypt in a fast-follow migration.
- **Recommendation:** (b) for v1 simplicity; upgrade to (a) post-beta if user trust requires it.
- **Impact:** gates TICKET-076 note implementation.

---
*Add new questions below as Q11, Q12, … — never silently assume an answer.*
