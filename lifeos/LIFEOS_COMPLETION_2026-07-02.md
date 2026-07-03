# LifeOS — Completion Run (2026-07-02)

*Closes the agent-doable remainder after v3 (TICKET-114…127). Q32/Q33 locked by the
founder 2026-07-02 (both option (a), as implemented). This run's headline: the app
was **built for the first time** — `npm install` + Metro export had never been run,
and they surfaced four ship-blocking config bugs that all prior parse-sweeps
structurally could not catch.*

## 1. Build-blocking bugs found by the first real build (all fixed)

| # | Bug | Fix |
|---|-----|-----|
| 1 | `@bacons/apple-targets@4.0.7` pulls `@expo/prebuild-config@~55.0.6` (Expo SDK 55; dropped `AssetContents`) into this SDK 54 app → `PluginError` at any prebuild/export. `mobile/` only builds because its lockfile pins 54.0.8; lifeos had **no lockfile**. | `devDependencies['@expo/prebuild-config']='54.0.8'` + npm `overrides` for apple-targets' copy + **`lifeos/package-lock.json` now committed**. |
| 2 | **No released apple-targets version knows the four FamilyControls target types** (`device-activity-monitor`, `device-activity-report`, `shield-configuration`, `shield-action`) → `TypeError … reading 'frameworks'` at prebuild; the EAS build would have crashed immediately. | `plugins/withFamilyControls.js` now extends apple-targets' `TARGET_REGISTRY` (+ its two load-time-derived maps) and wraps `getTargetInfoPlistForType` to inject each extension's `NSExtensionPrincipalClass` (report ext is `@main`, needs none). Plugin reordered BEFORE `@bacons/apple-targets` in `app.json` — order is load-bearing. |
| 3 | `babel-preset-expo` was not a dependency (unresolvable in a clean install) → Metro `SyntaxError` on `expo-router/entry`. | Added `babel-preset-expo@~54.0.11` to devDependencies (version mirrors mobile). |
| 4 | `babel.config.js` still added `react-native-reanimated/plugin` — removed in reanimated v4 and double-applied by babel-preset-expo on SDK 54; this exact mistake shipped a boot-crash in the fitness app once (see mobile/babel.config.js postmortem note). | Mirrored mobile's config: preset only. |

Also fixed: the first-ever `tsc --noEmit` over lifeos → **5 type errors → 0** (focus.tsx
literal-typed `useState`, backupManager union narrowing, data-handling `<Body>` children,
ShareCard nullable ref, missing `shouldShowList` in the notification handler).

## 2. Deferred hardening closed (TICKET-127 follow-ups)

- **Server-side partner pause**: `paused` column (schema.sql, idempotent ALTER),
  `POST /lifeos/partner/pause` registered above `requirePaid` (privacy actions are
  never tier-gated), public GET goes dark (indistinguishable 404) while paused;
  client `setPartnerPaused` fire-and-forgets the server sync.
- **Friendly partner page**: `GET /partner/:code` content-negotiates HTML — minimal
  inline-styled page, summary + updated date HTML-escaped (stored-XSS closed),
  `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`.
- **`share_scope_json` removed** (Q33 guardrail): dropped from the v2 migration,
  `lo_partner` row type, and upsert. Zero code references remain.
- **activity-ping future slack** tightened +24h → +14h (max legitimate TZ lead).
- **`requirePaid`** returns 503 (not 500) on pool/connection failure.
- **E2E backup wired end-to-end** (v2 deviation #4 closed): `src/data/backup/`
  (blobCrypto + keyStore + backupManager — same envelope format as mobile 094B, keys
  namespaced `lifeos_*`), Backup card in the data-handling screen (back up now /
  restore with destructive confirm / recovery-code fallback), post-restore re-setup
  prompts (re-pick blocked apps; re-tag apps when `appWellbeingScoring` is on).
  New `backup-envelope.test.js` (25 cases).

## 3. Verification (re-run on the working tree, 2026-07-02)

- `@babel/parser` sweep: **321 files, 0 failures** (lifeos app/src/tests/plugins/modules,
  mobile app/src, server). `node --check`: every server `.js` clean.
- Tests: **307/307** across 6 files (backup-envelope 25, direction-model 207,
  migrations-v2 16, reminder-plan 18, streaks 30, widget-streak 11).
- `tsc --noEmit` (lifeos): **0 errors** (new baseline; keep it at 0).
- **`npx expo export --platform ios`: SUCCEEDS** — dev (11 MB) and production
  (4.95 MB Hermes `.hbc`). First successful bundle in the app's history.
- JSON valid: app.json, eas.json, package.json, package-lock.json.

## 4. Still human-gated (unchanged, see LIFEOS_V3_VERIFICATION §4)

`eas init` (projectId placeholder) → commit → push → `eas build --profile preview
--platform ios`; Apple FamilyControls distribution entitlement (main + 4 extension
bundle IDs); apply `db/schema.sql` lifeos tails (incl. the new `paused` column) to
Supabase; macOS Swift compile check; trademark; content/legal sign-offs; on-device
checks (widgets, Live Activity, reminders cap, blocker demo, backup/restore round trip).

## 5. Addendum 2026-07-03 — Family Controls build toggle

Apple's FC **distribution** entitlement is approval-gated, so the blocker is now
switched OFF at build level by ONE flag: `FAMILY_CONTROLS_ENABLED = false` in
`lifeos/plugins/withFamilyControls.js`. While off: the 4 FC extension targets are
skipped at prebuild (code untouched in `targets/`), the FC entitlement is stripped
from the main app (App Group kept — the widget needs it), and the FC appExtensions
are filtered from the EAS credentials config. Store-class builds sign cleanly; the
Focus tab ships dark (its designed pre-entitlement state, Q18a).

**To re-enable after Apple grants the entitlement** (requested for the 5 bundle
IDs): flip the flag to `true`, commit, `eas build`. Nothing else changes.
