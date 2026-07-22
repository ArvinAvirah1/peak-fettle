# Founder Action Checklist — 2026-06-11

Everything below runs on YOUR machine/accounts (the sandbox cannot). Ordered: each phase unlocks the next. Tickets unblocked are noted per step.

---

## Phase 0 — Push & deploy (unlocks: everything; ~10 min)

1. Open a terminal:
   ```
   cd C:\Users\aavir\dev\Peak Fettle
   git remote -v        # confirm origin points at your GitHub
   git status -sb       # expect "ahead of origin/main" by 4 commits
   git log --oneline -4 # 57b19a7 backup, ba17d32 transfer, 2193197 engine, d033f7c widgets
   git push origin main
   ```
   EAS and Railway build from `origin/main` — nothing from today exists for them until this push lands.
2. **Apply the two new migrations to live Supabase** (SQL Editor → paste/run, in this order):
   - `peak-fettle-agents/server/migrations/20260611_engine_profile_fields.sql`
   - `peak-fettle-agents/server/migrations/20260611_exercise_tagging.sql`
   Both are idempotent (safe to re-run). ⚠️ Note: these are NOT yet folded into `db/schema.sql` (standing rule from commit 2a8642a) — tell the next agent run to fold them.
3. Redeploy the server (Railway picks up the push). Smoke-test: `GET /insights/readiness` with a logged-in token returns 200.
4. Optional cleanup: `ANTHROPIC_API_KEY` is no longer used by the production server (plans.js is deterministic now) — you can remove it from Railway env. Keep it locally if you still run the dev orchestrator.
5. Supabase Dashboard → Storage: after the first backup upload, confirm bucket `user-backups` exists and is **private**. (It auto-creates on first PUT.)

## Phase 1 — Mobile dependencies + dev build (unlocks: 094-B device test, widgets, 099 client; ~30–60 min)

6. ```
   cd C:\Users\aavir\dev\Peak Fettle\mobile
   npx expo install expo-crypto expo-file-system expo-sharing
   npm install                  # pulls @noble/ciphers + @noble/hashes (already in package.json)
   npx expo install expo-clipboard   # optional: enables Copy button on the recovery-code screen
   ```
7. Build a dev client (widgets + secure-store + crypto are native; Expo Go cannot run them):
   ```
   eas build --profile development --platform ios
   ```
   Install on your physical iPhone.

## Phase 2 — TICKET-094B definition of done: the restore test (~20 min, needs Phase 1)

8. On the device: log a few sets → Profile → **Export my data** → **Back up now**.
9. The **recovery code screen** appears (first backup only). Write the code on paper. Confirm.
10. Verify "Last backed up: just now" shows. In Supabase Storage, download `user-backups/<your-user-id>/backup.json` and eyeball it: must be the envelope JSON (base64 `ct`), **zero readable workout data**.
11. **The critical test:** delete the app → reinstall the dev build → log in → Export my data → **Restore from cloud**. Same-device path should restore WITHOUT the code (iCloud Keychain). Verify full history present.
12. **Code-only path:** Settings → erase the app again AND (simplest proxy) test on a second device, or after signing out of iCloud Keychain: Restore from cloud → type the paper code. Verify history restores. If both pass, TICKET-094B is DONE and Workstream A (data-layer move) is green-lit as the next agent run.
13. While you're there: manual path — **Save backup file** → AirDrop/Files → second device → **Restore from backup file**.

## Phase 3 — Widgets verification (TICKET-097 Phase 2 close-out; ~5 min, needs Phase 1)

14. Home screen: long-press → ＋ → Peak Fettle → add small AND medium widgets.
15. Lock screen (iOS 16+): long-press lock screen → Customize → add the Peak Fettle rectangular widget.
16. Verify: next split / PRs this week / goals show; log a set; confirm the widget refreshes (it reloads on local data changes). Android widget intentionally does not exist yet — separate ticket if wanted.

## Phase 4 — TICKET-099 Apple/Google sign-in (credentials; ~45 min)

17. **Apple:** developer.apple.com → Certificates, IDs & Profiles → Identifiers → your App ID → enable *Sign in with Apple*. Create a **Services ID** + a **Sign in with Apple key** (.p8). 
18. **Google:** console.cloud.google.com → APIs & Services → Credentials → create OAuth client IDs (iOS type with your bundle id, + Web type).
19. Server env (Railway): set `APPLE_OAUTH_AUDIENCE` (your bundle id / Services ID) and `GOOGLE_OAUTH_AUDIENCE` (the Web client ID) — those exact var names are what `lib/oauthVerify.js` reads.
20. ```
    cd mobile && npx expo install expo-apple-authentication expo-auth-session
    ```
21. Then hand back to an agent run: "mount the OAuth buttons in login/register + add the oauth_identities migration" (the buttons were deliberately left unmounted to avoid breaking the bundle before these deps existed).

## Phase 5 — Decisions only you can make (unblocks 093 + the last open question; ~30 min of reading)

22. **TICKET-093:** open `strength_model_v3_revision_2026-06-06.md` §9 and answer the sign-off items + 6 product calls (World-Class standard values, beginner-anchor residual, tier-band cutoffs, seed values). Write answers inline. This unblocks the Lens-1 revisions, which ship with the 094-A on-device port.
23. **Q6** in `OPEN_QUESTIONS_FOR_FOUNDER.md`: push-token registration — dedicated `/user/push-token` endpoint (recommendation) vs folding into patchProfile. One-line answer unblocks it.
24. Optional backlog hygiene to request from the next run: fold the 20260611 migrations into `db/schema.sql`; file tickets for 094-A + the engine on-device port; verify/close stale TICKET-078 status; confirm 067/068/069 completion state.

## Phase 6 — Standing verification while you have the device out (~10 min)

25. Push delivery (PUSH-001/002 history): trigger a notification and confirm it arrives on-device — the dispatcher is still "unproven post-EAS-build" per CLAUDE.md.
26. Airplane-mode: start a bundled beginner program offline; welcome tour replay from Profile; schedule "Next up" advance. (Carried over from the 06-06 handoff.)
