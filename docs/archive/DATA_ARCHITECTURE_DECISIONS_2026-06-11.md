# Data Architecture Decisions — 2026-06-11 (founder-locked)

Supersedes nothing; CONFIRMS and extends the 2026-06-06 TICKET-094 decisions after a steel-man review of "manual CSV as primary sync".

## Current state (verified in code today)
Supabase/Postgres still stores ALL personal data (workouts, sets, plans, metrics) for everyone; PowerSync syncs full rows; Training Engine + insights endpoints read server-side sets. The local-first move (LOCAL_FIRST_MIGRATION_PLAN_2026-06-06.md) is planned with partial foundations (localSchema.ts, exportEngine.ts, tierPolicy.ts) but NOT executed.

## Decisions (2026-06-11)
1. **Free tier = local-first + automatic E2E-encrypted blob backup + CSV/JSON export** (not manual-CSV-only). Rationale: blob costs ≈ the same as nothing (~200KB–1MB/user in Supabase Storage ≈ $0.50/mo per 100k users), removes the lost-phone data-loss catastrophe, and "lost my data" reviews are the most damaging kind for a tracker. Storage rows were never the scaling cost — PowerSync + API compute are.
2. **Pro = live server sync stays** (the paid multi-device differentiator, per tierPolicy.ts).
3. **Training Engine + insights port on-device for all users.** The engine is already pure functions with no DB access by design — ports to TS cleanly. Server endpoints remain for Pro (whose data stays server-side).

## Shipped today (manual transfer slice — in-sandbox-safe)
`mobile/app/data-export.tsx` now includes: "Save backup file" (deterministic exportEngine serialization of all on-device tables → share sheet) and "Restore from backup file" (document picker → parseImport with version checks → confirm → restoreBackupToDb), plus in-settings "Moving to a new phone?" step-by-step instructions. This is the unencrypted manual path; the TICKET-094 crypto/blob layer wraps these exact functions.

## Still founder-gated (TICKET-094 supervised sprint, unchanged)
AES-256-GCM + keychain/recovery-code handling, Supabase opaque-blob transport, auto-backup triggers, the actual data-layer move off the server for free users, security review, and the delete→reinstall→restore real-device test. New follow-up ticket implied by decision 3: port lib/trainingEngine + readiness/recovery/deload formulas to mobile/src (pure-function port + fixtures).
