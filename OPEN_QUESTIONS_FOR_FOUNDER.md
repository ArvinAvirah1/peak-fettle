# Open Questions for the Founder

Living doc (TICKET-071). When product **vision** is unclear, agents add a numbered question here — with context, options, and a recommendation — instead of guessing. Founder answers inline; the coordinator routes answers into tickets.

Status legend: `OPEN` · `ANSWERED (date)` · `SUPERSEDED`

---

## Q1 — Which mobile client is canonical? `OPEN`
The repo contains several clients: `mobile/` (RN/Expo, appears active), `MyApp/` (Expo), `peak-fettle-app/`, and a C++/QML app (`qml/`, `src/`, `CMakeLists.txt`). Multiple half-built clients are a maintenance and corruption-surface risk.
- **Options:** (a) `mobile/` is canonical, retire the rest; (b) keep one more for a reason; (c) other.
- **Recommendation:** (a). Confirm so TICKET-064 can mark the others legacy/dead and stop sweeping them.
- **Impact:** scope of the entire audit and all rewrites.

## Q2 — How many scores do we show users? `OPEN`
The product computes DOTS, (maybe) Wilks, `percentile_simple` (experience-adjusted), and the new sex-only percentile + tier ladder. Showing all four may confuse users.
- **Options:** (a) tier ladder as the headline + the two-score card as detail, Wilks hidden; (b) expose all; (c) other.
- **Recommendation:** (a). Drives TICKET-066.
- **Impact:** scoring consolidation + UI.

## Q3 — Keep or drop Wilks? `OPEN`
ROADMAP §1.2 lists Wilks as "specified but not confirmed shipped."
- **Options:** (a) implement + verify against published tables; (b) drop it (DOTS + PF percentile suffice); 
- **Recommendation:** (b) unless competitive powerlifters (Marcus persona) specifically need Wilks. Drives TICKET-066 #2.

## Q4 — May we squash migration history? `OPEN`
If `migrations/` and `all_migrations.sql` have drifted (TICKET-068), the clean fix may be a consolidation migration.
- **Options:** (a) consolidate to one canonical history; (b) preserve full history, only patch drift.
- **Recommendation:** decide before TICKET-068 acts; squashing is irreversible for history.

## Q5 — Companion app: confirm the pitch decisions `OPEN`
Captured 2026-05-29: standalone app / shared backend / bundled into paid tier / light CBT-mindfulness positioning. See `COMPANION_APP_PITCH_2026-05-29.md`.
- **Remaining sub-questions in the pitch's "Open questions" section** (name, platform priority iOS-first?, screen-time data approach given OS limits, launch scope). Answer there.
- **Impact:** gates TICKET-072 → build tickets.

## Q6 — Push token registration: patchProfile vs /user/push-token endpoint? `OPEN`
Found in TICKET-064 audit (F-003/F-004). Two competing paths exist:
- **Active path:** `pushNotifications.ts` calls `patchProfile({ fcm_token: token.data })` — writes to `users.fcm_token` via `PATCH /user/profile`. Works today.
- **Dead stub:** `pushTokens.ts` declares `registerPushToken` / `unregisterPushToken` pointing to `/user/push-token` — that endpoint **does not exist** on the server. Never called anywhere.
- **Options:** (a) Build `/user/push-token` on the server, migrate `pushNotifications.ts` to use the dedicated endpoint; (b) Delete `pushTokens.ts`, keep `patchProfile` path as intentional; (c) other.
- **Recommendation:** (a) — dedicated endpoint is cleaner, decouples token lifecycle from profile updates, easier to debug. (b) is safe short-term.
- **Impact:** gates TICKET-065 push pipeline rewrite design.

---
*Add new questions below as Q7, Q8, … — never silently assume an answer.*
