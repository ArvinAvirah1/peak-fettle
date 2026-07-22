# lifeOS — Ultrareview (2026-07-03)

## Executive summary

lifeOS (~96 source files, ~13.8k lines under `lifeos/` plus the shared server routes it touches) is, at the code level, in reasonably good shape: all six local test suites ran clean this run (307/307 assertions — streaks, direction-model, widget-streak, migrations-v2, reminder-plan, backup-envelope), no file truncation was found anywhere in scope (a real concern given this repo's OneDrive-corruption history, now resolved), and the crypto design underneath the E2E-encrypted backup feature is verified solid: AES-256-GCM (authenticated, no CBC-without-MAC), scrypt KDF with strong parameters, keys held in SecureStore/Keychain, and `expo-crypto`-sourced RNG for all key material and nonces. The crisis-help pathway and the paywall/entitlement logic were both explicitly checked at the app level and found sound, with no bypass and no false-lockout.

The headline risk is not in that crypto or in the UI — it's in the shared backend plumbing the app depends on. Two CRITICAL findings sit in the same shared `/user/backup-blob` route: the storage path is keyed only by `userId` with no app namespace and `upsert: true`, so a user running both the fitness app and lifeOS can have one app's auto-backup **silently and irreversibly destroy the other app's only server-side backup** — of mental-health-adjacent mood/habit data, in lifeOS's case. Compounding this, the route's plaintext-detection safety net (meant to catch an accidental unencrypted upload) is hardcoded to recognize only the fitness app's format string, so a future lifeOS bug that skips encryption would upload a fully readable mental-health dataset undetected. A third serious defect, rated CRITICAL by the reviewers, is that lifeOS's local backup **restore is non-transactional**: it deletes-then-reinserts across ~14 SQLite tables one statement at a time with no BEGIN/COMMIT, so a crash or thrown error mid-restore leaves some tables permanently wiped while others are untouched — a silent, real loss of the user's mood/habit history.

All 17 items the second stage attempted to verify were CONFIRMED (0 rejected), including two HIGH findings on the auth and partner-sharing paths (unconditional token-clearing on any refresh failure; a swallowed server-DELETE failure that leaves a "revoked" partner-sharing code still publicly resolvable) that also carry meaningful privacy/availability impact for this class of app. **Verdict: the app is not deployment-blocked on UI/UX or crypto grounds, but the three CRITICALs — all backup/data-integrity issues on paths that hold a user's only copy of sensitive mental-health data — should be fixed before this ships further, ahead of any lower-severity polish.**

## Methodology & scope

This was a two-stage review. Stage 1 (coverage) ran three parallel agents across disjoint scope — app/screens (`lo-raw-app.md`), data/crypto/engine/native (`lo-raw-data-crypto.md`), and server/deps (`lo-raw-server-deps.md`) — reading essentially the full `lifeos/` tree (app screens, src/data, src/db, src/engine, src/native, native Swift modules/targets, `__tests__/`) plus the shared Express server routes that serve lifeOS data (`peak-fettle-agents/server/routes/lifeos.js`, `partner.js`, `backup.js`, and adjacent middleware/db/index files). Stage 2 (verification) independently re-read the cited file/line ranges for every CRITICAL and HIGH finding, plus a curated set of lower-severity items (the crisis-region gap, the share-card habit-name note, and five MEDIUMs touching backup/crypto/native/partner code), tracing each claimed mechanism through the live repo at `C:\Users\aavir\dev\Peak Fettle` rather than trusting stage-1 prose. Result: **17 verified, 0 rejected, 0 downgraded**.

Scope is `lifeos/**` plus its server routes as they touch lifeOS data; this report treats "lifeOS" as the `lifeos/` subfolder of the Peak Fettle repo, with the understanding that `backup.js`, `lifeos.js`, and `partner.js` are shared Express infrastructure also used by the sibling fitness app (`mobile/`) — several findings below are specifically about that sharing.

## Findings

### Critical

**Shared `/user/backup-blob` route + storage path collide between the fitness app and lifeOS, silently clobbering each other's backup** — `peak-fettle-agents/server/routes/backup.js:33-34,196,199-204`; `lifeos/src/data/backup/backupManager.ts:202-205`; `mobile/src/data/backup/backupManager.ts`
Problem: `BLOB_PATH_FOR(userId)` produces `${userId}/backup.json` with no app/format discriminator, and the PUT handler uploads with `upsert: true` (unconditional overwrite). Both lifeOS (`format: 'lifeos-backup'`) and the fitness app (`format: 'peak-fettle-backup'`) PUT to the identical route and identical storage key. A user running both apps — or just lifeOS's periodic auto-backup timer firing after the fitness app's — will have whichever app writes last silently destroy the other app's only server-side backup, with no warning in either app and no way to recover it afterward.
Fix: Namespace the storage path per app (e.g. `${userId}/${app}-backup.json`, `app` derived from the envelope's `format` field or a dedicated route prefix), and reject a PUT whose `format` doesn't match the expected app for that path.
```js
const BLOB_PATH_FOR = (userId) => `${userId}/backup.json`;
...
await supabaseAdmin.storage.from(BUCKET)
    .upload(path, fileBuffer, { contentType: 'application/json', upsert: true });
```
Provenance: verifier-confirmed.

**Plaintext-detection defense-in-depth check only recognizes the fitness app's format string, not lifeOS's** — `peak-fettle-agents/server/routes/backup.js:111-130`
Problem: The server's safety net for catching an accidentally-unencrypted backup upload (`detectsPlaintext`) hardcodes a check for exactly one literal prefix, `{"format":"peak-fettle-backup`. lifeOS's plaintext export format is `lifeos-backup` — a completely different string. A future client-side bug in lifeOS that skips `encryptBackup` (e.g. during a refactor) would upload a fully readable plaintext mood/habit/mental-health dataset, and this check would not catch it, defeating the stated "server stores ciphertext only" invariant specifically for lifeOS.
Fix: Check for both known format prefixes, or generically detect any `{"format":"..."` JSON prefix combined with plaintext-only keys (`"tables":`, `"schemaVersion":`) rather than hardcoding one app's magic string.
```js
function detectsPlaintext(ctB64) {
    const buf = Buffer.from(ctB64.slice(0, 88), 'base64');
    return buf.toString('utf8').startsWith('{"format":"peak-fettle-backup');
}
```
Provenance: verifier-confirmed.

**Backup restore is not transactional — a mid-restore crash/error leaves the local DB in a corrupted, half-wiped state** — `lifeos/src/data/backup.ts:57-86` (`restoreBackupToDb`); `lifeos/src/db/localDb.ts` (no transaction primitive exists)
Problem: `localDb` exposes only `getAll`/`getFirst`/`execute`/`watch`/`subscribe`/`notify` — no `transaction()`/BEGIN/COMMIT anywhere in the codebase (repo-wide grep confirmed zero matches). `restoreBackupToDb` deletes-then-reinserts across ~14 tables (habits, goals, mood check-ins, weekly reviews, partner state, etc.) one `await`ed statement at a time. A crash, app-kill, or a single malformed row throwing partway through leaves some tables permanently emptied while others are untouched — real, silent loss of the user's mood/habit history. `backupManager.restoreFromServer`'s try/catch only converts the exception to `{ok:false}`; it never undoes the DELETEs that already committed.
Fix: Wrap the full restore loop in a single SQLite transaction (`BEGIN`/`COMMIT`/`ROLLBACK` or expo-sqlite's `withTransactionAsync`) so either all tables are replaced or none are; add a `transaction()` method to `localDb`'s public surface.
```ts
for (const t of BACKUP_TABLES) {
  await db.execute(`DELETE FROM ${t}`, [], { tables: [t] });
  for (const row of rows) {
    await db.execute(`INSERT OR REPLACE INTO ${t} (...) VALUES (...)`, ..., { tables: [t] });
  }
}
```
Provenance: verifier-confirmed.

### High

**AuthContext/apiClient clears the refresh token (forces logout) on ANY refresh failure, not just a definitive 401** — `lifeos/src/api/client.ts:63-94`; `lifeos/src/auth/AuthContext.tsx:59-62`
Problem: `_doRefresh` is a plain `axios.post` with no status-code discrimination. Network errors, timeouts, and 5xx responses all land in the same `catch`, which unconditionally calls `_authHandlers.onLogout()` → `clearSession()`, deleting both tokens from SecureStore. This directly violates the project's own stated invariant (mirrored in the file's own header comment) that tokens should clear only on a definitive 401 — a flaky server or a user on a plane forces re-login on every subsequent app open.
Fix: Only call `onLogout()` when the error is a definitive 401 from `/auth/refresh` (`axios.isAxiosError(err) && err.response?.status === 401`); on network error/timeout/5xx, reject the original request but leave the stored refresh token intact.
```ts
} catch (err) {
  console.warn('[LO] client/responseInterceptor:', ...);
  _authHandlers.onLogout();   // unconditional, no status-code check
  return Promise.reject(error);
}
```
Provenance: verifier-confirmed.

**Partner-summary revocation swallows server DELETE failure, leaving a "revoked" code still publicly resolvable** — `lifeos/app/partner.tsx:119-130`; `peak-fettle-agents/server/routes/lifeos.js:57-62`
Problem: The UI's `revoke()` catches any failure from `deletePartnerSummary()` with an empty `catch {}` and unconditionally clears local state and shows the pairing as gone. If the server DELETE actually fails (network/5xx), `lifeos_partner_summaries` still has the row, and the old code remains fully resolvable at the public, unauthenticated `GET /partner/:code` — for anyone who still has the link, including an ex-partner the user explicitly meant to cut off. This directly undermines the feature's own stated threat model ("revocation is immediate") for data that implies mood/habit/streak information.
Fix: On DELETE failure, don't silently clear local state and show success — retry, persist a durable "pending revoke" flag re-attempted on next foreground/network-available event, or surface an error so the user knows the link may still be live.
```ts
try {
  await deletePartnerSummary();
} catch {
  // even if the server call fails, clear locally so the user is in control
}
await clearPartner();
```
Provenance: verifier-confirmed.

**`lifeos.js`'s inline `requirePaid` duplicates and can drift from the shared `middleware/requirePaid.js`** — `peak-fettle-agents/server/routes/lifeos.js:34-50`; `peak-fettle-agents/server/middleware/requirePaid.js:1-51`
Problem: The shared middleware's own doc comment states it's "the single source of truth ... so the gate can never drift between features," yet `lifeos.js` defines a second implementation with a different error shape (403 `lifeos_access_required` vs 402 `paid_tier_required`) and different `deleted_at` handling (lifeos.js folds "no rows" and "not paid" into one 403; the shared middleware returns a distinct 401 `user_not_found`). A future tier-logic change (trial tier, grace period, comp-tier) applied to the shared middleware will not propagate to lifeOS, silently reintroducing the exact drift the shared middleware exists to prevent.
Fix: Have `lifeos.js` import and use `middleware/requirePaid.js` directly, or extend the shared middleware to cover lifeOS's check-then-act pattern and delete the duplicate.
```js
// lifeos.js — separate implementation
if (rows.length === 0 || rows[0].tier !== 'paid') {
  return res.status(403).json({ error: 'lifeos_access_required' });
}
```
Provenance: verifier-confirmed.

**Local schema (`SCHEMA_STATEMENTS`) omits the v2 tables entirely — they exist only via a migration that a future `SCHEMA_VERSION` bump could silently skip** — `lifeos/src/db/localSchema.ts:164-205`; `lifeos/src/db/migrations.ts:14,20-70`
Problem: `SCHEMA_STATEMENTS` has no `CREATE TABLE` for `lo_app_ratings`, `lo_share_events`, `lo_partner`, or `lo_affirmations` — they're created only by the `to: 2` migration. Today `SCHEMA_VERSION = 1 < 2`, so this works correctly, but nothing enforces the "SCHEMA_VERSION must be a floor, not a ceiling" contract. If a future change mistakenly bumps `SCHEMA_VERSION` to 2 without adding these tables to `SCHEMA_STATEMENTS`, fresh installs would skip the migration and be missing 3 of the 4 tables listed in `BACKUP_TABLES` — every backup attempt on that install would throw.
Fix: Fold each migration's DDL into `SCHEMA_STATEMENTS` as `CREATE TABLE IF NOT EXISTS` once it has shipped a release (matching the "fold migrations back into canonical schema" pattern this repo already uses elsewhere), so a fresh install never depends solely on the migration runner.
```ts
export const SCHEMA_VERSION = 1;
export const SCHEMA_STATEMENTS: string[] = [ /* no lo_app_ratings/lo_share_events/lo_partner/lo_affirmations */ ];
// migrations.ts — the ONLY place these 4 tables are created
const MIGRATIONS: Migration[] = [{ to: 2, run: async (db) => { /* CREATE TABLE IF NOT EXISTS ... */ } }];
```
Provenance: verifier-confirmed.

### Medium

**`grantExemption` builds a DeviceActivitySchedule from wall-clock hour/minute components that may not handle the exemption window crossing midnight** — `lifeos/modules/lifeos-blocking/ios/LifeOsBlockingModule.swift:157-178`; `lifeos/src/config/product.ts:33`
Problem: `DeviceActivitySchedule` is built from hour/minute-only components with no explicit day. With the default 5-minute grant window, a late-night exemption (e.g. 23:58) produces `intervalStart` 23:58 and `intervalEnd` 00:03 — a legitimate midnight-crossing case that occurs under ordinary use. If `DeviceActivityCenter` doesn't reliably interpret this as "tomorrow 00:03," the interval could resolve to zero-length or backwards, meaning the shield re-application (`intervalDidEnd`) may never fire and the shield could stay lifted indefinitely until the next full-day boundary.
Fix: Test the exact midnight-crossing case on-device; if mishandled, switch to an explicit day-aware schedule or split the exemption at midnight into two monitored intervals.
Provenance: verifier-confirmed.

**Stray `.fuse_hidden0000000500000001` file in `routes/` contains an unresolved git merge-conflict marker touching the GDPR account-deletion path** — `peak-fettle-agents/server/routes/.fuse_hidden0000000500000001:367`
Problem: A stray, near-duplicate-sized copy of `user.js` (53,165 vs 53,964 bytes, same-day timestamp) contains a literal unresolved `>>>>>>> origin/main` marker, evidence a merge conflict touching the account-deletion transaction (which deletes `lifeos_partner_summaries`/`lifeos_activity_days`) was recently in play. The live, `require()`d `user.js` was confirmed clean/markerless, so this is not a currently-live hole, but it's a forensic trace that a human should confirm was resolved correctly, and it risks being swept into a deploy artifact if directory globs aren't careful.
Fix: Delete the stray file and add a `.fuse_hidden*`/editor-swap-file pattern to `.gitignore`; have a human diff the stray file against current `user.js` to confirm nothing from the "losing side" of that merge was dropped.
Provenance: verifier-confirmed.

**`npm test` in `lifeos/package.json` omits `backup-envelope.test.js`** — `lifeos/package.json:10`
Problem: `backup-envelope.test.js` exists and passes (25/25) but is the only automated test covering the crypto layer of the highest-risk feature (E2E-encrypted mental-health backup) — it is not wired into the `test` script, so CI/pre-commit `npm test` never runs it. A future crypto regression (IV reuse, KDF param change, broken tamper-detection assertion) would go uncaught.
Fix: Add `&& node __tests__/backup-envelope.test.js` to the `test` script.
Provenance: verifier-confirmed.

**`ITSAppUsesNonExemptEncryption: false` while the app implements custom AES-256-GCM + scrypt encryption** — `lifeos/app.json:13-17`
Problem: This flag tells Apple the app uses no encryption beyond standard TLS-exempt categories, auto-skipping the export-compliance questionnaire — but lifeOS implements proprietary payload encryption (AES-256-GCM + scrypt key wrapping) for its backup feature, which is generally not covered by the standard exemption and typically needs either a deliberate mass-market/ancillary-use self-classification or a real export-compliance declaration.
Fix: Confirm with legal/compliance whether a mass-market exemption applies; if so use the specific exemption annotation rather than blanket `false`, or set to `true` and complete export compliance in App Store Connect.
Provenance: verifier-confirmed.

**`genId()` uses `Math.random()` for all local primary keys (habits, goals, mood check-ins, focus events, etc.)** — `lifeos/src/db/localDb.ts:17-23`
Problem: Not key material (it's a row-identity UUID, not used cryptographically), but it is the one remaining place in the codebase that uses `Math.random()` where every other RNG use (`blobCrypto.ts`) deliberately uses `expo-crypto`. These IDs round-trip into the encrypted backup envelope; a `Math.random()`-based UUID is less collision-resistant than a CSPRNG-based one and is inconsistent with the module's own stated security convention.
Fix: Use `expo-crypto`'s `getRandomBytes`/`randomUUID` (already a dependency) for `genId()` too, matching the rest of the codebase.
Provenance: verifier-confirmed.

**`restoreFromServer` accepts any `schemaVersion <= LIFEOS_BACKUP_SCHEMA_VERSION` with no forward-migration logic implemented yet** — `lifeos/src/data/backup/backupManager.ts:315-323`; `lifeos/src/data/backup.ts:53-63`
Problem: Correctly defensive today (schemaVersion=1, no migrations needed), but is a placeholder — the code comment itself says "forward migrations slot in here when schemaVersion bumps." When `LIFEOS_BACKUP_SCHEMA_VERSION` is eventually bumped to 2, an old `schemaVersion: 1` backup will pass the gate and go straight into the wipe+reinsert loop with no adaptation for renamed/added columns, risking silent per-row column-filtering failures instead of a clean upgrade.
Fix: When schema version 2 ships, add an explicit `migrateBackupDoc()` step rather than relying on the restore loop's column-filtering to paper over shape mismatches.
Provenance: coverage-stage finding.

**Recovery code hand-off (`pendingRecoveryCode`) is a bare module-level variable with no durable "unacknowledged" recovery if the app is killed before the UI reads it** — `lifeos/src/data/backup/backupManager.ts:76-83,210-214`
Problem: Matches the documented design (never persist the recovery code), but if the app backgrounds/crashes between `backupNow()` completing and the UI calling `consumePendingRecoveryCode()`, the code is lost silently — the user never sees their only recovery code, and the next key-ensure call treats the wrap as already present and won't regenerate it. Not a security flaw, but a real data-recoverability gap for mood/habit history.
Fix: Persist a durable `needsRecoveryAck` flag so a session that never consumed the code causes the next app open to detect the unacknowledged wrap and regenerate + redisplay a fresh code.
Provenance: coverage-stage finding.

**`lo_partner` table is included in the E2E-encrypted backup, allowing a restore to resurrect a locally-cleared/revoked pairing** — `lifeos/src/db/localSchema.ts` (`BACKUP_TABLES`); `lifeos/src/data/backup.ts:57-86`
Problem: If a user revokes a partner pairing and later restores an older backup, `restoreBackupToDb` wipes and reinserts `lo_partner` from that backup, silently reviving the old `invite_code` client-side. Combined with the partner-revocation HIGH above (server DELETE can silently fail), this can compound into an old partner link looking "active" again on-device with no signal it no longer matches server reality.
Fix: Exclude `lo_partner` from `BACKUP_TABLES` (it's small, easily re-created by re-pairing), or have the restore path re-verify server state for `lo_partner` post-restore rather than trusting the backed-up row blindly.
Provenance: coverage-stage finding.

### Low

**Crisis resource list covers only US/GB, and no caller passes a `region`, so every non-US/GB user sees US-only numbers** — `lifeos/src/content/crisis.ts:20-49`; `lifeos/src/components/CrisisResourcesBanner.tsx:16-19`; `lifeos/app/crisis-help.tsx:31`; `lifeos/app/mood-checkin.tsx:157`
Problem: `CrisisResourcesBanner` does accept and forward a `region` prop, but both real call sites (`crisis-help.tsx`, `mood-checkin.tsx`) render `<CrisisResourcesBanner />` with no `region` passed, so `getCrisisResources(undefined)` always resolves to the `US` entry. A non-US, non-GB user in a real crisis is shown a US phone number that won't connect to their local emergency services. The content file's own header flags this content as "PENDING FOUNDER REVIEW," consistent with this being incomplete rather than a shipped bug.
Fix: Wire `region` from device locale (`Localization.region`/`Intl`) at both call sites, or until that lands, make "outside the US, use your local emergency number" the primary line rather than secondary footer text (already partially done in crisis-help.tsx; entirely absent from mood-checkin's inline banner).
Provenance: verifier-confirmed.

**Share-card habit names are unfiltered, user-authored free text included in the shared image with no per-habit opt-out** — `lifeos/app/share-card.tsx:61-65`
Problem: The first 5 non-archived habit names are pulled directly into share-card state and rendered on an exported PNG with no review step. Habit names are freely user-typed (e.g. "Take antidepressant," "Call therapist"), so a sensitively-named habit could appear on a shareable image by default.
Fix: Let the user review/deselect which habit names appear before capture (the existing "Preview" step could add per-habit checkboxes), or at minimum warn that habit names are visible on the card.
Provenance: verifier-confirmed.

**`unlockAttemptsToday` matches config id via a fragile substring `LIKE` query against a serialized JSON blob** — `lifeos/src/data/focus.ts:131-140`
Problem: Uses `meta_json LIKE '%configId%'` rather than an indexed column or parsed-JSON filter. If one config id happens to be a substring of another (or of another field's value in the same blob), the unlock wait-ladder/breathing-gate escalation could read the wrong attempt count — feeding directly into the app's core anti-compulsion friction design.
Fix: Store `configId` as its own indexed column on `lo_focus_events`, or parse `meta_json` and filter in JS.
Provenance: coverage-stage finding.

**`BreathingGate` completion path triggers a `setTimeout` side effect from inside a React state-updater function** — `lifeos/src/components/BreathingGate.tsx:55-78`
Problem: `setTimeout(onComplete, 0)` is called inside a `setCycle` functional updater — a side effect embedded where React expects pure state derivation. A `completedRef` guard makes double-firing unlikely in practice, but the pattern is fragile under Strict Mode/concurrent rendering.
Fix: Move the completion trigger to a `useEffect` keyed off `cycle`/`phaseIndex` instead of the setter.
Provenance: coverage-stage finding.

**Reminder scheduling calls `cancelAllScheduledNotificationsAsync()`, which is not scoped to lifeOS's own notifications** — `lifeos/src/services/notifications.ts:108-131`
Problem: Per the Expo API this clears every notification the app has scheduled app-wide, not just lifeOS's reminders. Likely harmless today (lifeOS appears to be the sole local-notification scheduler), but is a latent hazard if any other feature later schedules a local notification — it would be silently wiped every time a reminder toggle is touched.
Fix: Track owned notification identifiers and cancel only those by id, or explicitly document/enforce that this module is the sole owner of all local notifications.
Provenance: coverage-stage finding.

**`/partner/:code` degrades gracefully on two specific Postgres error codes but has no test coverage for either fallback path** — `peak-fettle-agents/server/routes/partner.js:175-197,213-219`
Problem: The route correctly degrades on `42703` (missing `paused` column) and `42P01` (missing table), matching the repo's schema-drift-tolerance invariant. However no test in `__tests__/` exercises either drift path, and since this is a public, unauthenticated route, a future refactor could silently break the fallback and surface a raw 500 instead of degrading.
Fix: Add a test with a mocked pool simulating a `42703` error on the first query, asserting the retry path still returns 200.
Provenance: coverage-stage finding.

**Every "done" habit log fires a network call for users without lifeOS entitlement, guaranteed to fail** — `lifeos/src/data/habits.ts:153-160`
Problem: Not a security bug — the server-side gate correctly rejects non-paid users and the client ignores the failure — but every habit completion for a non-entitled user unconditionally fires an HTTP round trip that always fails, wasted battery/network contradicting the "local-first, no needless network calls" design.
Fix: Gate the `pingActivity` call behind a cached entitlement flag, refreshed periodically, skipping the call when known non-paid.
Provenance: coverage-stage finding.

**Duplicate entry in `com.apple.security.application-groups` array** — `lifeos/app.json:18-22`
Problem: The same app group string is listed twice; harmless (iOS tolerates the duplicate) but suggests a copy-paste mistake, and `plugins/withFamilyControls.js` re-adds the same group programmatically at build time, making the static declaration possibly redundant.
Fix: Remove the duplicate literal; consider removing the static declaration entirely if the plugin already ensures it's present.
Provenance: coverage-stage finding.

**`withFamilyControls.js` monkey-patches `@bacons/apple-targets` internal (non-public) module exports at require-time** — `lifeos/plugins/withFamilyControls.js:55-106`
Problem: Reaches into internal, non-exported objects to teach the library an unsupported target type. Works today with the pinned version, but any patch/minor bump that reorganizes these internal files will silently break prebuild, likely surfacing as a confusing Xcode error rather than a clear failure.
Fix: Add an explicit assertion for the expected internal shape that throws a clear, named error if missing, so an upgrade fails loudly at `expo prebuild` rather than mysteriously.
Provenance: coverage-stage finding.

**Onboarding survey "top 3 values" step silently no-ops past the 3rd selection with no feedback** — `lifeos/app/onboarding/survey.tsx:258-274`
Problem: Tapping a 4th chip after 3 are selected does nothing — no error, haptic, or visual cue — a user may think the tap didn't register. Minor UX polish issue, not a correctness bug.
Fix: Add a dimmed/disabled style or a brief hint ("Pick 3 — tap one you've chosen to swap it out") once the limit is reached.
Provenance: coverage-stage finding.

## Top 10 prioritized fixes

1. Namespace the `/user/backup-blob` storage path per app so lifeOS and the fitness app stop overwriting each other's only server backup — `peak-fettle-agents/server/routes/backup.js:33-34`.
2. Extend `detectsPlaintext` to recognize `lifeos-backup` (not just `peak-fettle-backup`) so an accidental plaintext upload is actually caught — `peak-fettle-agents/server/routes/backup.js:111-130`.
3. Wrap `restoreBackupToDb`'s per-table delete+reinsert loop in a real SQLite transaction so a mid-restore crash can't leave the local DB half-wiped — `lifeos/src/data/backup.ts:57-86` (needs a new `transaction()` method on `lifeos/src/db/localDb.ts`).
4. Stop clearing the refresh token on network errors/timeouts/5xx — only on a definitive 401 — in the response interceptor's catch block — `lifeos/src/api/client.ts:63-94`.
5. Fix partner-revocation to not silently swallow a server DELETE failure and show false "revoked" success — `lifeos/app/partner.tsx:119-130`.
6. Unify `lifeos.js`'s inline `requirePaid` with the shared `middleware/requirePaid.js` so the paid-gate can't drift — `peak-fettle-agents/server/routes/lifeos.js:34-50`.
7. Fold the v2 migration's tables into `SCHEMA_STATEMENTS` (or add an explicit guard) so a future `SCHEMA_VERSION` bump can't skip creating `lo_app_ratings`/`lo_share_events`/`lo_partner`/`lo_affirmations` — `lifeos/src/db/localSchema.ts:164-205`.
8. Verify the midnight-crossing `DeviceActivitySchedule` case on-device and fix if the shield fails to re-apply — `lifeos/modules/lifeos-blocking/ios/LifeOsBlockingModule.swift:157-178`.
9. Wire `backup-envelope.test.js` into `npm test` so the crypto layer's only test actually runs in CI — `lifeos/package.json:10`.
10. Delete the stray `.fuse_hidden0000000500000001` file and have a human confirm the GDPR account-deletion merge resolved correctly — `peak-fettle-agents/server/routes/.fuse_hidden0000000500000001`.

## Positive observations

- **Crypto stack verified solid end-to-end**: AES-256-GCM (authenticated, no CBC-without-MAC pattern), scrypt KDF with strong parameters (N=32768, r=8, p=1, 256-bit derived key), fresh 12-byte IVs per encryption call sourced from `expo-crypto`, keys held in SecureStore/Keychain with `AFTER_FIRST_UNLOCK`, and normalized decrypt-failure errors with no padding-oracle-shaped branching.
- **Crisis pathway is reachable and correct where implemented**: the banner fires unconditionally on mood ≤ 2, is permanently reachable via the You tab, and resolves to real, correct US/GB numbers (locale coverage gap noted above as LOW).
- **Paywall/entitlement logic is sound**: access is server-derived only, never client-computed, with no bypass found; the offline-fallback behavior matches the app's documented local-first intent rather than being a bug.
- **All 6 local test suites ran clean this run — 307/307 assertions** (streaks, direction-model, widget-streak, migrations-v2, reminder-plan, backup-envelope), and no file truncation was found anywhere in the reviewed scope.
- **No SQL injection or IDOR found in lifeOS's server routes**: `lo-raw-server-deps.md` confirms every data-layer file uses parameterized `?`/`$1` placeholders, and the one place identifiers are interpolated (the `backup.ts` restore loop) validates against a whitelist regex plus a static table list. No injection vector was reported in the crypto/data-layer coverage pass either.

