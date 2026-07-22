# SPEC — TICKET-094 Workstream B: E2E-Encrypted Backup Subsystem (BINDING)

**Date:** 2026-06-11 · Founder-approved scope: Workstream B only (data-layer move = next run).
**Working rules:** identical to TRAINING_ENGINE_SPEC_2026-06-11.md §0 — bash-heredoc writes ONLY (Write/Edit corrupt this mount), verify wc -lc + tail, /tmp backups, no rm/mv/git, stay in your ownership lane, node --check / @babel parse as DoD.

## 1. Threat model & invariants
Server stores **ciphertext only** — it must never receive the data key, the recovery code, or plaintext. Restore must work in two ways: (a) keychain key present (same-ecosystem reinstall), (b) recovery code only (new ecosystem / keychain loss). A compromised server or bucket leaks nothing usable. No telemetry of key material in logs ever.

## 2. Envelope format (v1, exact)
```json
{ "format": "pf-encrypted-backup", "v": 1, "alg": "AES-256-GCM", "kdf": "scrypt",
  "kdf_params": {"N": 32768, "r": 8, "p": 1},
  "salt": "<b64 16B>",            // scrypt salt for the recovery-code KEK
  "wrap_iv": "<b64 12B>",         // IV for wrapping the data key under the KEK
  "wrapped_key": "<b64 48B>",     // AES-256-GCM(KEK, dataKey) = 32B ct + 16B tag
  "iv": "<b64 12B>",              // IV for the payload
  "ct": "<b64>",                  // AES-256-GCM(dataKey, canonicalize(ExportDoc))
  "created_at": "<ISO8601>" }
```
Payload plaintext = `canonicalize(buildBackupFromDb(localDb))` (exportEngine, already deterministic + schema-versioned). The wrapped key travels INSIDE the envelope → recovery-code-only restore needs nothing but the blob + code.

## 3. Crypto (Agent E) — `mobile/src/data/backup/blobCrypto.ts` + `keyStore.ts`
Dependencies: `@noble/ciphers` (gcm) + `@noble/hashes` (scrypt) — audited, pure-JS, Hermes-safe. Agent E adds both + `expo-crypto`, `expo-file-system`, `expo-sharing` to `mobile/package.json` dependencies via JSON patch (founder runs one install; imports parse without install).
RNG: `getRandomBytes(n)` MUST come from `expo-crypto.getRandomBytes` (dynamic require). If unavailable → **throw** `RNG_UNAVAILABLE` ("npx expo install expo-crypto"). Math.random is forbidden for key material.

`blobCrypto.ts` exports (pure; RNG injected for testability):
- `generateDataKey(rng): Uint8Array` — 32 bytes.
- `generateRecoveryCode(rng): string` — 120 bits, Crockford base32, formatted `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` (6 groups × 4). Include `normalizeRecoveryCode(s)` (strip dashes/whitespace, uppercase, map I→1 O→0 L→1).
- `deriveKek(code: string, salt: Uint8Array): Promise<Uint8Array>` — scrypt(normalized code, salt, {N:32768,r:8,p:1,dkLen:32}).
- `encryptBackup(plaintext: string, dataKey: Uint8Array, recoveryCode: string, rng): Promise<Envelope>` — fresh salt + both IVs per call.
- `decryptWithKey(env: Envelope, dataKey: Uint8Array): string` — throws `DECRYPT_FAILED` on tag mismatch.
- `decryptWithRecoveryCode(env: Envelope, code: string): Promise<string>` — derive KEK → unwrap dataKey → decrypt.
- `unwrapDataKey(env, code): Promise<Uint8Array>` — exposed so restore can re-save the key to the keychain.

`keyStore.ts` (expo-secure-store, already installed; dynamic require pattern):
- `saveDataKey(b64)`, `loadDataKey(): Promise<string|null>`, `clearDataKey()` — key name `pf_backup_data_key_v1`, `keychainAccessible: AFTER_FIRST_UNLOCK` (no `requiresAuthentication` — backup must run in background).
- `markRecoveryCodeAcknowledged()` / `isRecoveryCodeAcknowledged()` via AsyncStorage flag `@peak_fettle/recovery_code_ack`.
**Never store the recovery code itself anywhere.**

Tests: `mobile/src/data/backup/__tests__/blobCrypto.test.mjs`, run in-sandbox with node: `npm install --prefix /tmp/cryptotest @noble/ciphers @noble/hashes`, import the module via a small esbuild/ts-strip or restructure: put the pure logic in `blobCrypto.core.ts` (no RN imports, noble imports only) and test THAT file by transpiling with the server's @babel or simply authoring core as `.ts` importable after `npx tsc`-free strip — simplest accepted approach: test file re-implements imports via createRequire from /tmp/cryptotest and `node --experimental-strip-types` if available, else use the server's babel to transpile to /tmp. ≥8 cases: roundtrip key, roundtrip recovery code, wrong code fails, tampered ct fails (flip one byte), tampered wrapped_key fails, normalization (lowercase/dashes/O→0), unique salts/IVs across two encrypts of same plaintext, kdf params present in envelope.

## 4. Server (Agent F) — `peak-fettle-agents/server/routes/backup.js` + mount in index.js
Bucket: `user-backups` (private). On first use: `supabaseAdmin.storage.createBucket('user-backups', { public: false })` — ignore "already exists" error. Path: `${req.user.id}/backup.json`.
- `PUT /user/backup-blob` — body `{ envelope }` (JSON). Validate: envelope.format === 'pf-encrypted-backup', v === 1, required b64 fields present, total serialized size ≤ 5 MB (413 otherwise). **Reject anything that looks like plaintext**: if `envelope.ct` decodes to valid UTF-8 JSON starting with `{"format":"peak-fettle-backup"` → 400 `plaintext_rejected` (defense-in-depth sanity check). Upload with upsert:true, contentType 'application/json'. Respond `{ updated_at }`. NOT paid-gated. Rate-limit: reuse existing limiter pattern if user.js has one (exportLimiter) — 12/day.
- `GET /user/backup-blob` — download, respond `{ envelope, updated_at }`; 404 `{error:'no_backup'}` if absent.
- `GET /user/backup-blob/status` — `{ exists, updated_at, bytes }` without downloading (list with search).
Tests `__tests__/backupBlob.test.js`: mock supabaseAdmin.storage (jest.mock); cases: happy PUT/GET, size cap 413, malformed envelope 400, plaintext-looking ct 400, status exists/absent. node --check everything.

## 5. Mobile orchestration (Agent G) — `mobile/src/data/backup/backupManager.ts`, `mobile/src/hooks/useAutoBackup.ts`, `mobile/app/recovery-code.tsx`, additions to `mobile/app/data-export.tsx`, hook mount in `mobile/app/(tabs)/_layout.tsx`
`backupManager.ts` (singleton-ish module, no React):
- `ensureKeyAndCode(): Promise<{dataKey, recoveryCode|null, isNew}>` — load key from keyStore; if absent generate key + recovery code (this is the ONLY time the code exists in memory; return it so UI can show it; never persist).
- `backupNow(): Promise<{ok:true, at:string} | {ok:false, error:string}>` — localDb.init → buildBackupFromDb → canonicalize → ensureKeyAndCode → encryptBackup → PUT via apiClient → persist `@peak_fettle/last_backup_at`. If a NEW key/code was generated and code not yet acknowledged → return `{needsRecoveryAck: true, recoveryCode}` so caller routes to `/recovery-code`.
- `getStatus(): Promise<{lastLocalAt|null, server: {exists, updated_at}|null, stale: boolean}>` — stale = no backup in >7 days while sets exist.
- `restoreFromCloud(opts: {recoveryCode?: string}): Promise<{ok, restored?: number, error?}>` — GET blob → key from keyStore else require recoveryCode → decrypt (on code path: unwrapDataKey + saveDataKey so future backups reuse it) → parseImport → restoreBackupToDb → set last_backup_at.
- `maybeAutoBackup(reason: 'background'|'launch')` — debounce: skip if last_backup_at < 6h ago; never throw (catch + console.warn only, NO key material in logs).
`useAutoBackup.ts`: AppState listener → 'background' ⇒ maybeAutoBackup('background'); on mount ⇒ maybeAutoBackup('launch'). Free-tier only: import `usesBlobBackup` from tierPolicy and no-op for Pro. Mount the hook once in `(tabs)/_layout.tsx` (one line + import — minimal diff; this file is NOT in the pre-existing dirty list).
`recovery-code.tsx`: displays the code in a monospace card, copy button, severe copy ("This is the only way to restore on a new platform. We cannot recover it."), checkbox-style confirm → markRecoveryCodeAcknowledged → back. NEVER render the code into logs/analytics.
`data-export.tsx` additions (own this file this run): a "Cloud backup" card ABOVE the manual-file card: status line ("Last backed up: …" / "Never — back up now", stale warning color), buttons: "Back up now" (→ backupNow; if needsRecoveryAck route to /recovery-code with the code via router param — params leak into nav state; instead pass via an in-memory module variable `pendingRecoveryCode` in backupManager, the screen reads + clears it), "Restore from cloud" (if keychain key: confirm-replace dialog like file restore; else prompt TextInput for recovery code). Copy must say encrypted, zero-knowledge: "Encrypted on your phone before upload — we can't read it."
Branding rule: no "AI"; privacy copy factual, no overclaiming ("end-to-end encrypted" is accurate here).

## 6. Ownership matrix
| Agent | Files |
|---|---|
| E | `mobile/src/data/backup/blobCrypto.ts` (+core split if used), `keyStore.ts`, `__tests__/blobCrypto.test.mjs` (new), `mobile/package.json` (deps add ONLY) |
| F | `server/routes/backup.js` (new), `server/index.js` (mount only), `server/__tests__/backupBlob.test.js` (new) |
| G | `backupManager.ts`, `useAutoBackup.ts`, `recovery-code.tsx` (new), `mobile/app/data-export.tsx`, `mobile/app/(tabs)/_layout.tsx` (hook mount line only) |
Cross-needs → final report. E's exports above are the frozen contract G codes against.

## 7. Acceptance criteria
1. Crypto tests pass in-sandbox (≥8 cases incl. tamper + wrong-code failures). 2. Server tests pass; node --check clean. 3. Full parse-sweep clean. 4. grep confirms: no key material logged; recovery code never written to AsyncStorage/SecureStore/server payloads. 5. Envelope matches §2 byte-field-for-field. 6. Pro users: useAutoBackup no-ops (tierPolicy). 7. Founder-gated remainder explicitly listed in final report: `npx expo install expo-crypto expo-file-system expo-sharing` + `npm install` (noble), EAS build, real-device delete→reinstall→restore test, Android Block Store config.

### Amendment 2026-06-11: key-wrap persistence

**Problem fixed:** `backupManager` called `encryptBackup(plaintext, dataKey, recoveryCode ?? '', rng)` on every backup. On every backup after the first, `recoveryCode` was `null` (never persisted, by design), so `wrapped_key` was derived from `KEK('')`. Recovery-code-only restore therefore failed for all backups after the first — violating §1 invariant (b).

**Design change:**

`blobCrypto.ts` now exports:
- `KeyWrap` interface: `{ salt: string; wrap_iv: string; wrapped_key: string }` — the three b64 wrap fields, safe to persist (all ciphertext).
- `createKeyWrap(dataKey, recoveryCode, rng): Promise<KeyWrap>` — derives a fresh KEK from a fresh 16-byte salt, wraps the data key under AES-256-GCM. Called once when a key+code pair is first created.
- `encryptBackup` signature changed to `(plaintext, dataKey, keyWrap: KeyWrap, rng)` — copies `keyWrap` fields verbatim into the envelope; only the payload IV is fresh per call. No KEK derivation inside `encryptBackup`. Reusing the same salt/wrap_iv/wrapped_key across envelopes is sound: same KEK+IV+plaintext = identical ciphertext, no new information leaks.

`keyStore.ts` now exports:
- `saveKeyWrap(wrap: KeyWrap)` — persists JSON-serialized wrap to SecureStore key `pf_backup_key_wrap_v1` with `AFTER_FIRST_UNLOCK`.
- `loadKeyWrap(): Promise<KeyWrap|null>` — loads and JSON-parses the wrap; returns null if absent.
- `clearKeyWrap()` — removes the wrap (called on sign-out / account deletion).

`backupManager.ts` changes:
- `ensureKeyAndCode`: when generating a new key+code, also calls `createKeyWrap` + `saveKeyWrap` before returning. If key exists but wrap is missing (legacy/corrupt state), generates a fresh recovery code, calls `createKeyWrap` with the **existing** data key, persists the wrap, and sets `needsRecoveryAck` so the UI surfaces the new code.
- `backupNow`: loads wrap via `loadKeyWrap()` through `ensureKeyAndCode`; passes it to `encryptBackup`.
- `restoreFromCloud` (recovery-code path): after `unwrapDataKey` + `saveDataKey`, also rebuilds the wrap directly from the downloaded envelope fields (`{ salt, wrap_iv, wrapped_key }`) and calls `saveKeyWrap`, so subsequent backups keep the same recovery code working.

**Invariant preserved:** the recovery code itself is still never persisted anywhere. Only the derived ciphertext (`wrapped_key`) and its derivation parameters (`salt`, `wrap_iv`) are stored.
