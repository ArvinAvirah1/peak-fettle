# TICKET-094 — Storage Architecture Refactor: Local-First + Backup/Recovery

**Owner:** Opus (architecture + integration) + dev-backend + dev-frontend (mobile)
**Date opened:** 2026-06-06
**Phase:** R — Revision & Hardening
**Source:** `LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md`; founder decisions 2026-06-06.
**Model routing:** Data-layer architecture → **Opus** owns the design, the on-device migration runner, the crypto/key handling, and the final integration pass. Sonnet does the mechanical table port, the export serializer, and tests. Haiku not used.

---

## Goal

Move **all personal user data off the server into on-device SQLite** to cut server cost/overhead, shrink the server to only what is irreducibly shared (auth + groups), compute percentiles on-device (TICKET-093), and add a **backup/recovery subsystem that survives app delete, a lost phone, and device upgrades — without re-introducing a live per-user relational database.** The recovery store is a *stateless, opaque, end-to-end-encrypted blob per user*, not a queryable DB.

---

## Founder decisions — locked 2026-06-06

- **Storage:** personal data lives on-device (`expo-sqlite`). The server keeps only auth, group state, and push.
- **Percentiles:** computed on-device from model coefficients (TICKET-093); `user_percentile_rankings` + the weekly cron are deleted. All percentiles use the model-calibrated distribution, never the live user base.
- **Backup target:** a **stateless encrypted blob store** — one opaque ciphertext file per user in object storage, fronted by the existing thin auth server. Not a relational DB.
- **Recovery scope:** automatic protection against **surprise delete / lost phone** (primary, launch); **device-to-device transfer** for upgrades (fast-follow).
- **Identity:** reuse the thin-server account (already kept for groups) to key the blob.
- **Encryption:** the blob is **end-to-end encrypted**; the data key is held in the platform keychain (iCloud Keychain on iOS; Android Keystore + Block Store), with a **recovery code** as the universal fallback. The server stores ciphertext only and cannot read it.
- **Backup format:** a **structured, schema-versioned JSON export** of the logical tables — *not* a raw SQLite file copy (raw copies break across schema migrations).
- **Platform:** one cross-platform mechanism (not CloudKit-on-iOS + Drive-on-Android).

---

## Scope — Workstream A: Data-layer move (the refactor)

Table-by-table mapping (all 32 tables) is in `LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md`; this ticket implements it.

1. **Expand `mobile/src/db/localSchema.ts`** from `{workouts, sets, outbox}` to every personal table: plans, routines, workout_templates/template_sessions/template_exercises, streaks, streak_overrides, daily_health_log, daily_health_metrics, habits, user_weekly_goals, user_constraints, exercise_prs, user_confirmed_1rm, user_cosmetics, user_equipped_cosmetics, and the profile fields of `users`.
2. **Versioned on-device migration runner** — sequential, idempotent, with a pre-migration local snapshot (the phone holds the only copy; a bad migration is data loss). User-version pragma gated.
3. **Rewrite the personal data-access layer** to read/write local SQLite instead of the server. PowerSync narrows to the group buckets only (or is replaced by a small REST call for the weekly group signal).
4. **Ship reference data read-only** — exercises, exercise_aliases, and the percentile model coefficients (`lift_vectors`) bundled with the app / fetched once.
5. **Slim the server:** delete `user_percentile_rankings` and the percentile cron; define and accept the weekly group `{group_id, user_id, week_start, hit_goal}` signal; stop syncing personal logs; the server computes `group_week_evaluations` + `credit_ledger` from those signals only.
6. **Drop the personal tables from `sync-rules.yaml`** (keep only group + global_library buckets).

## Scope — Workstream B: Backup / recovery subsystem

1. **Export engine** — serialize all on-device logical tables to a canonical, deterministic, **schema-versioned JSON** document. Reuse/extend the CSV serializer from TICKET-049.
2. **Encryption** — generate a per-user random data key (AES-256-GCM); encrypt the export; store the data key in the platform keychain (`expo-secure-store` / Keystore); wrap the key with a key derived from the **recovery code** (e.g. scrypt/Argon2) so the code alone can also decrypt. Server never sees plaintext or the key.
3. **Blob transport** — `PUT`/`GET` a single opaque ciphertext blob per account to object storage (S3 / Cloudflare R2 / serverless KV) via the thin auth server. Authn = the account; the server stores/returns bytes and an updated-at, nothing else.
4. **Automatic backup trigger** — on significant change (debounced) + a periodic job (e.g. daily) + on app-background. Surface a **"Last backed up: …"** status and a stale-backup reminder (this is the surprise-delete safety net — it must run *before* a delete).
5. **Restore flow** — after reinstall → user logs in → fetch blob → obtain key from keychain (or prompt for recovery code) → decrypt → import into a fresh SQLite store → reconcile schema version.
6. **Recovery-code UX** — generated and shown on first successful backup with a "save this" prompt; required for new-ecosystem moves (iOS↔Android) or keychain loss.
7. **Device-to-device (fast-follow)** — export the encrypted bundle and transfer old→new phone via QR (carries the key) + AirDrop / Nearby Share / `expo-sharing`; import on the new device. No backend involved.
8. **New dependencies** — add `expo-file-system`, `expo-sharing`, `expo-crypto`, `expo-secure-store` (have: `expo-sqlite`, `expo-document-picker`, `async-storage`). Block Store on Android needs native config (dev/EAS build).

---

## Acceptance criteria

1. Every personal table exists on-device behind the versioned migration runner; write→read round-trip verified for each.
2. The server holds **zero** personal workout/health rows — only auth, group state, and opaque ciphertext blobs. A query/audit confirms this.
3. **Delete + reinstall + login restores full history** — on-device integration test passes.
4. The server-stored blob is **ciphertext**: an automated test asserts the stored payload contains no plaintext field values and cannot be decrypted without the key/recovery code.
5. Backup runs **automatically**; the "Last backed up" timestamp is visible and a stale reminder fires.
6. The **recovery-code path** restores when the keychain is unavailable (simulated new ecosystem / cleared keychain).
7. The export format is **schema-versioned and forward-compatible** — a backup taken on schema vN restores cleanly on vN+1.
8. Percentiles and the ranked tier work fully offline from bundled coefficients (coordinated with TICKET-093); no call hits a server for a percentile.
9. `peak-fettle-verify` parse-sweep + `node --check` clean; **`/ultra-review`** (data correctness) **plus a `security-review`** of the crypto, key storage, and blob endpoint; **`/codex:review`** second opinion on the migration runner.

## Test plan

1. Round-trip every table; 5,000-set synthetic dataset exports + restores in a few seconds.
2. Delete app → reinstall → login → assert full restore (counts + spot-checked rows).
3. Corrupt/garbage blob → restore fails safely and does **not** destroy the existing local store.
4. Wrong recovery code → clear error, no partial import.
5. Crypto: stored payload never contains plaintext; AES-GCM auth tag verified; key never written to disk in plaintext; key absent from logs.
6. Cross-platform: iOS keychain-sync happy path; Android recovery-code path; (fast-follow) device-to-device QR transfer.
7. Migration upgrade: vN backup restores on vN+1; downgrade is rejected with a clear message.
8. Offline: airplane-mode logging, percentiles, and tier all work; backup queues and drains on reconnect.

## Risks / call-outs

- **On-device migrations are safety-critical** — the phone holds the only copy. Version, snapshot pre-migration, and test on real data before shipping. This is the single highest-risk part of the refactor.
- **Android Keystore keys are device-bound** (they do not sync like iCloud Keychain) → rely on Block Store where available, recovery code otherwise. Don't assume seamless cross-device key sync on Android.
- **Health-adjacent data:** E2E encryption is exactly what keeps a server-side blob store defensible (data minimization / security of processing). Never log plaintext; route a legal review (`legal:compliance-check`).
- **Lost recovery code + new ecosystem = unrecoverable, by design** — that's the privacy tradeoff of E2E. Make the "save your code" moment prominent and repeatable from settings.
- **Native modules require a dev/EAS build** (managed-workflow caveat). Per CLAUDE.md, **EAS pulls `origin/main`** — push the config/asset commits before triggering a build.
- **No live multi-device *live* sync** for personal data (acceptable per these decisions): two devices used concurrently can diverge; last-backup-wins on restore. State this in onboarding.

## Dependencies / related

- `LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md` — the table mapping + 6 work items.
- **TICKET-093** — percentiles on-device; implement the model once in the TS port, not twice.
- TICKET-068 (data-layer/migration integrity), TICKET-049 (CSV export — reuse the serializer), TICKET-065 (push pipeline — server still sends push).
- `exec-percentile-decisions.md` D4 confidence-ring: **retired** (model-derived, no live-user comparison).

## Open items (non-blocking — confirm during build)

1. Object-storage provider: S3 vs Cloudflare R2 vs serverless KV (cost/ops call).
2. Backup cadence specifics (debounce window, periodic interval).
3. Whether device-to-device ships at launch or as the fast-follow (currently fast-follow).

## Notes

- Founder-intent rule (TICKET-071): the open items above are calls to confirm, not guess.
- "Reviewed manually" is not verification (PUSH-002): the parse-sweep, the delete→reinstall→restore integration test, and the ciphertext assertion are the definition of done.
