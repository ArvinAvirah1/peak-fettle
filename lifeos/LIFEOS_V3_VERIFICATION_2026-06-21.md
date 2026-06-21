# LifeOS v3 — Verification, Compliance & Store-Readiness (TICKET-127)

*Run 2026-06-20/21 against `COMPANION_APP_V3_SPEC_2026-06-20.md` + `DEV_ROADMAP_2026-06-20-LIFEOS-V3.md`.
Branch `fix/full-review-2026-06-19`. Honest ledger: what is verified, what passed security review,
and what only a human / macOS build machine / Apple can unblock. Self-reports are NOT trusted — the
parse-sweep + security review were re-run on the working tree.*

## 1. Ticket ledger (TICKET-114…127)

| Ticket | Commit | Status |
|---|---|---|
| 114 Separate EAS build | `33a1bb0` | ✅ config verified (JSON valid, 5 extensions, mirrors mobile/eas.json) |
| 115 Lock name "Peak Fettle LifeOS" | `cef8997` | ✅ literals routed through product.ts + Swift constant |
| 116 iOS widgets | `b1635a1` + `d921098` | ✅ bridge wired, vocab reconciled, a11y, **/review → 9 bugs fixed**, 11/11 parity test |
| 117 Interactive check-off (App Intents) | `2dfd7cd` | ✅ RN drain verified; Swift AppIntent ⬜ macOS |
| 118 Focus Live Activity (ActivityKit) | `0b55f38` | ✅ lo_meta.active_focus + RN wiring verified; native module ⬜ macOS |
| 119 Feature framework + schema v2 | `b7856fd` | ✅ 16/16 migration test (fresh + upgrade, no data loss) |
| 120 Shareable milestone cards | `f269ee6` | ✅ flag OFF default; needs `react-native-view-shot` install |
| 121 Accountability partner (Q33 a) | `3e770f7` | ✅ client + server, behind default-OFF flag; **security-reviewed + hardened** |
| 122 App wellbeing scoring | `d42d99f` | ✅ flag OFF default; native token-label bridge ⬜ macOS |
| 123 Identity affirmations | `4d36600` | ✅ flag OFF default; deterministic selection; rides 124 delivery |
| 124 Notifications completion | `403c820` | ✅ local-first scheduler, 18/18 cap test; device delivery ⬜ |
| 125 Surface LifeOS in fitness app (Q32 a) | `6f6ea79` | ✅ profile card, local-first held; field-mismatch bug fixed |
| 127 Verification + store readiness | *(this commit)* | ✅ full DoD green + security fixes below |

## 2. Verification ledger (the real DoD — re-run on the working tree)

- ✅ **`@babel/parser` parse-sweep: 306 files, ALL CLEAN** across `lifeos/{app,src,targets,__tests__,modules}`,
  `mobile/{app,src}`, `peak-fettle-agents/server`. Zero parse failures, zero null bytes.
- ✅ **`node --check`** on every server `.js` (routes, lib, cron) — all pass (incl. the new
  `routes/partner.js` + the 121/127 edits to `lifeos.js`, `index.js`, `user.js`).
- ✅ **JSON valid** (`python -m json.tool`): `lifeos/eas.json`, `lifeos/app.json`, `lifeos/package.json`,
  `lifeos/modules/live-activity/expo-module.config.json`.
- ✅ **Tests (5/5 files pass)** — `npm test` now runs them all:
  - `streaks.test.js` (30) · `direction-model.test.js` (207) · **`widget-streak.test.js` (11, NEW —
    widget↔engine parity, TICKET-116)** · **`migrations-v2.test.js` (16, NEW — schema v2 fresh+upgrade,
    TICKET-119)** · **`reminder-plan.test.js` (18, NEW — ≤2/day cap + quiet hours, TICKET-124)**.
- ⬜ **`xcodebuild`** — impossible on Windows. First macOS build will likely need minor Swift
  signature fixes (recorded below + in `native/README.md`).

## 3. Security review (TICKET-127 §4) — focused multi-agent pass on the new attack surface

Ran an adversarial review (3 angles × verify) over the only new server surface — the TICKET-121
accountability-partner endpoints + the privacy guarantee. **Fixed in this commit:**

| Sev | Finding | Fix |
|---|---|---|
| 🔴 HIGH | `trust proxy` unset → on Railway, express-rate-limit keys on the proxy IP, so `authLimiter` + `partnerLimiter` were ONE global bucket (broke brute-force + enumeration throttling). | `app.set('trust proxy', 1)` in `index.js` — per-client IP buckets now work. |
| 🔴 HIGH | Account-deletion + GDPR export omitted the new lifeos tables (relied on `ON DELETE CASCADE`, fragile on drifted prod). | Explicit `delGuarded` deletes for `lifeos_partner_summaries` + `lifeos_activity_days` in `DELETE /user/account`; both added to `GET /user/data-export` (drift-tolerant). |
| 🟠 MED | A downgraded (free) user could NOT revoke partner sharing — `DELETE /lifeos/partner/summary` sat behind `requirePaid` (403). | Moved the DELETE ABOVE `requirePaid` — revocation works for any authenticated user (privacy-protective actions must not be tier-gated). |
| 🟠 MED | Public `GET /partner/:code` returned a microsecond `updatedAt` → activity-timing/sleep side-channel. | Coarsened to date-only (`to_char(updated_at,'YYYY-MM-DD')` → `updatedDate`). |
| 🟡 PLAUSIBLE | `share_scope_json` is a dead field — a future dev could read it inside the summary composer and leak raw data. | (Guardrail) — the "summary only" rule lives in the pure `formatPartnerSummary`; **founder TODO: keep `share_scope_json` out of compose/formatPartnerSummary, or remove the field.** |

**Refuted / by-design:** the public GET is intentionally unauthenticated (the 128-bit code is the
capability); SQL is parameterized; the POST has an atomic paid re-check (`rowCount===0`→403); the DELETE's
idempotent 204 is intentional. **Privacy guarantee CONFIRMED:** `composePartnerSummary` reads only
`lo_habits`/`lo_habit_logs` counts + the streak — it never touches mood notes, habit names, or app
identities; the server caps `summaryText` at 280 chars.

**Noted, deferred to founder (LOW, JWT-compromise-gated or pre-existing):**
- "Pause" is a client-side control only — a stolen JWT could still POST a summary. Server-side pause
  enforcement (a `paused` column + GET-goes-dark) is a follow-up.
- Invite code is 128-bit hex (sufficient); base64url would match the server regex's wider alphabet.
- `POST /lifeos/activity-ping` allows +24h future-date slack (gamification only; tighten to +14h later).
- `requirePaid` returns a generic 500 (not 503) on DB-pool exhaustion (operational clarity only).

## 4. Human / macOS / Apple-gated checklist (CANNOT be done by an agent)

### Founder — accounts & store
- [ ] **EAS:** `cd lifeos && eas init` to mint the real `extra.eas.projectId` (replaces the
      `PENDING-…` placeholder in `app.json`). Commit + push.
- [ ] **Apple — FamilyControls distribution entitlement** requested for `com.peakfettle.lifeos` AND the
      4 extension bundle IDs (`.monitor`, `.shield`, `.shieldaction`, `.report`). Dev/TestFlight works on
      the development entitlement meanwhile.
- [ ] **Trademark:** clear "Peak Fettle LifeOS" (USPTO classes 9 + 42) before submission; confirm no
      competitor marks/trade dress in copy or share cards.
- [ ] **App Privacy (iOS) + Data Safety (Android):** declare the accountability-partner "shared data"
      (a usage summary shared with others) — the ONLY off-device data, opt-in. Everything else: not
      collected / on-device. (See §3 — the summary is counts+streak only.)
- [ ] **App Store positioning (Q16):** category Productivity; FamilyControls justification in review
      notes; **no mental-health claims anywhere**; 17+ rating + age gate.
- [ ] ⚠️ **Verify the shared iOS Google OAuth client is registered for bundle `com.peakfettle.lifeos`** —
      an iOS OAuth client is bound to one bundle id; reusing the fitness app's may need a new iOS client
      or the web-flow fallback (flagged in 114; not changed per "mirror mobile" spec).

### Founder — database (no in-repo migration runner)
- [ ] Apply `db/schema.sql` `lifeos_partner_summaries` table to the live DB **with the
      `ON DELETE CASCADE` FK + `code` UNIQUE index** (the explicit delete in `user.js` is the backstop,
      but the cascade should exist too).
- [ ] Apply the `lifeos_activity_days` tail (carried from v2) if not already applied.
- [ ] Schema v2 (the 4 local `lo_*` tables) is **on-device only** — the migration runner applies it
      automatically on app open (verified by `migrations-v2.test.js`); no server action.

### macOS build machine
- [ ] `cd lifeos && npm install` (incl. the new `react-native-view-shot` — run `npx expo install
      react-native-view-shot`), then `npx expo prebuild -p ios`.
- [ ] `xcodebuild` compiles all 5 extensions + the app + the `live-activity` local module. **Expect minor
      Swift signature fixes** in: `targets/widget/index.swift` (TICKET-116/117 — AppIntent / WidgetKit),
      `modules/live-activity/ios/LifeOSLiveActivityModule.swift` (TICKET-118 — `Activity.request` signature
      varies by SDK; the `LifeOSFocusAttributes` struct MUST stay in sync with the widget's copy),
      `targets/shield-config/*` + the 4 FC targets.
- [ ] `eas build --profile preview --platform ios` → install on a device.

### On-device verification (physical iPhone + dev build)
- [ ] Widgets show live data; lock-screen accessories render; theme switch repaints (TICKET-116).
- [ ] iOS 17 widget habit check-off logs without opening the app; iOS 16 falls back to deep link (117).
- [ ] Focus session shows the Dynamic Island + lock-screen countdown; ends on session end (118).
- [ ] Each `LO_*` reminder delivers on schedule; the ≤2/day cap + quiet hours hold (124).
- [ ] Blocker demo (pick app → shield → friction → grant → re-shield) once the entitlement lands.

### Founder — content & legal sign-off (carried from v2 + new)
- [ ] Crisis copy (`src/content/crisis.ts`), protocol/exercise templates, **affirmation seed copy**
      (`src/features/affirmations/seedLibrary.ts`) against the CONTENT_SAFETY checklist.
- [ ] Legal review of `legal/lifeos-privacy-addendum.md` + the partner "shared data" delta.
- [ ] Decide `share_scope_json` posture (keep-but-guard vs remove) per §3.

## 5. Open founder decisions (left OPEN per instruction; recommended option implemented behind a flag)

- **Q32 (main-app surfacing):** implemented option **(a)** — a LifeOS card in the fitness app's profile
  tab (`6f6ea79`). Option (b) (6th tab) NOT built. Question remains open in `OPEN_QUESTIONS_FOR_FOUNDER.md`.
- **Q33 (partner data posture):** implemented option **(a)** — invite-code + minimal server endpoint —
  behind the default-OFF `accountabilityPartner` flag (`3e770f7`, hardened in this commit). Option (b)
  (share-sheet only, no server) is the alternative if the founder prefers zero new server data. Question
  remains open. A friendly partner web page (vs raw JSON at `/partner/:code`) is a follow-up.

## 6. Ship order (CLAUDE.md)
fix → commit → `git push origin main` (= Railway deploy) → `eas build` → install → test. **Nothing here is
pushed** (agent can't push; founder pushes from their machine). EAS builds from `origin/main`, so the
config/asset commits must be on the remote before a build sees them.
