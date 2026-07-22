# Peak Fettle — Full Mobile Codebase Review · AUDITOR BRIEF
_Read this fully before reviewing. It is shared by all 14 auditors._

## Your role
You are ONE auditor in a coordinated fleet. You own a **disjoint** set of files (given in your task). Review ONLY your assigned files. You may `Read` a file outside your scope to verify a contract/call, but you report findings **only against your own files** — another auditor owns the rest. This avoids duplicate/conflicting findings.

## App context
Peak Fettle is a React Native + Expo (expo-router) + TypeScript strength-training app.
- **FREE users (`!is_paid`) are LOCAL-FIRST**: on-device SQLite only (`src/db/localDb.ts`), NO personal REST calls.
- **PRO users**: server + PowerSync live sync.
- Tier branch point: `src/data/backup/tierPolicy.ts` → `isLocalFirst(user)` / `syncsToServer(user)`.
- Tier-branched data layer (use these, never raw `api/*` from a screen/component): `src/data/{routines,profile,schedule}.ts` and the `useWorkout*` / `useStreak` / `useInsights` / `useHealthMetrics` hooks.

## How to work
1. `Read` every file in your scope (use `Grep`/`Glob` to navigate quickly).
2. Hunt for the issues in the RUBRIC, with special attention to the INVARIANTS — that's where this repo's real bugs have historically lived.
3. **Verify before flagging**: cite exact `file:line` and quote the offending code. Trace the actual data flow — don't guess. If unsure it's real, include it but mark `Confidence: LOW`.
4. Prefer **correctness/security/data-integrity** bugs over style. Don't pad with nits.
5. Write findings to your findings file (path in your task) using the OUTPUT SCHEMA. Do **not** paste all findings into chat — return only the short SUMMARY.

## PEAK FETTLE INVARIANTS — check these first (highest yield)
1. **Local-first tiering.** Any screen/hook/component that loads *personal* data on mount (routine, percentile, constraints, profile, schedule, workouts, streak, insights, health metrics) MUST branch on `isLocalFirst(user)` and use the tier-branched data layer or `localDb.ts`. **Flag any raw `from '../api/...'` personal-data import invoked on the free path without an `isLocalFirst`/`syncsToServer` branch** → for free users that's a failing/slow round-trip (infinite spinner / 500 / slow startup). The ONE allowed network call on the free path is the group weekly-signal.
2. **Weight = EXACT kg.** `sets.weight_kg REAL` is exact kilograms; legacy `weight_raw` (kg×8) is lossy/secondary. **Read** via `COALESCE(weight_kg, weight_raw/8.0)`; **write** exact kg. Convert display↔storage ONLY via `src/constants/units.ts` (`displayToKg` to store, `kgToInputValue` to prefill an edit field, `parseWeightInput`, `formatWeight`). Flag any weight path that stores a display value (lbs) as kg, or skips conversion — check BOTH the log path AND the edit path.
3. **Safe-area does NOT propagate inside `<Modal>`.** `SafeAreaView`/`useSafeAreaInsets()` around or inside an RN `<Modal>` does not push content below the Dynamic Island. Correct fix: `paddingTop: Math.max(insets.top, 12)` applied directly to the modal's header row. Flag modal headers that rely on `SafeAreaView` or omit a manual top inset. (`GestureHandlerRootView` must wrap the app root.)
4. **Schema-drift tolerance.** Prod DB has drifted from `db/schema.sql`. Server routes should catch Postgres `42P01`/`42703` and degrade (empty 200), not 500. `user_percentile_rankings`/`percentile_vectors` are DEPRECATED — percentiles compute on-device via `strengthModelV3.ts`. (Mostly server-side, but flag client code that hard-depends on a deprecated table/column.)
5. **Auth cold-start.** `AuthContext` must render the cached user immediately and refresh the token in the background (~8s timeout). It must clear the stored refresh token **ONLY** on a definitive `401` — never on a network error / timeout / 5xx. Flag any token-clear (or forced logout) triggered by a non-401 failure, and any auth path that blocks first render on the network.

## REVIEW RUBRIC (by severity)
**P0 — Correctness & data integrity**
- Async race conditions: `useEffect` with no cleanup/cancel flag; `setState` after unmount; stale closures; concurrent-render state updates.
- Tier-branch violations (Invariant 1). Weight/unit corruption (Invariant 2).
- Data loss: destructive writes/migrations without guards; overwriting local edits with stale server data.

**P0 — Security**
- Hardcoded secrets/API keys; tokens or PII in `AsyncStorage` (must be SecureStore/Keychain); cleartext `http://`; string-built SQL (must be parameterized); missing auth checks on sensitive ops.

**P1 — State / effects / types**
- Missing `useEffect` cleanup; floating promises (`async` called without `await`/`.catch`); missing deps / stale deps array; `SafeAreaView`-in-`Modal` (Invariant 3); auth token cleared on wrong status (Invariant 5); `any` flowing into typed state; null-safety (`object possibly undefined`); **duplicate object keys** (TS1117 — silently drops a value).

**P2 — Error handling & performance**
- Unhandled rejections; missing loading/error states in data hooks/screens; no degrade on `42P01`/`42703`; unnecessary re-renders (missing `memo`/`useCallback`/`useMemo`); inline `StyleSheet` objects recreated each render; `FlatList` missing `keyExtractor`/`getItemLayout` for long lists.

**P3 — Maintainability**
- Accessibility (`accessibilityLabel`/`accessibilityRole`, 44pt targets); dead code / unused exports/imports; misleading or missing "why" comments. (Never block on P3 alone.)

## SEVERITY TAXONOMY
- **P0 Critical** — data loss, security breach, auth bypass, crash on launch, or silent failure with no user feedback. Ship blocker.
- **P1 High** — wrong behavior visible in normal flows: broken feature, state corruption, unhandled happy-path exception.
- **P2 Medium** — degraded UX under load/edge cases: error-handling gaps, avoidable perf hits.
- **P3 Low** — style, naming, dead code, docs.

## STATIC GATE BASELINE (already run — do NOT re-report these as new findings)
- **parse-sweep**: 0 failures — no corruption/truncation.
- **migrations test**: 12/12 pass.
- **tsc --noEmit**: 59 errors (baseline ~85). Histogram: `33×TS2345` (mostly expo-router typed-route **string literals** like `router.push('/insights')` — KNOWN/expected, P3 at most — plus a few `Value | undefined` chart-arg types), `8×TS2322`, `7×TS2532` + `5×TS18048` = **12 "object possibly undefined"** (REAL null-safety — confirm & flag if in your scope), `2×TS1117` **duplicate object property** (REAL — find the duplicated key, flag P1), `2×TS2769`, `1×TS2554`, `1×TS2339`. Full output: `audits/full-review-2026-06-19/00-tsc.txt`. If one of YOUR files appears there, open it and decide: benign router-string, or a real null/dup bug?
- **security greps**: no hardcoded secrets, no `http://` cleartext, no string-interpolated SQL; tokens in SecureStore (correct); AsyncStorage holds only non-sensitive flags/prefs.

## OUTPUT SCHEMA (write to your findings file)
```
# <DOMAIN> findings
## Summary
Files reviewed: N. Counts — P0:_ P1:_ P2:_ P3:_. One-sentence overall health.

### [P0] <DOMAIN>-01 — short title
- **File:** path:line(s)
- **Problem:** 1–3 sentences.
- **Evidence:** ```ts\n<=8 lines of the actual code\n```
- **Invariant/Rubric:** which item it violates
- **Suggested direction:** how to fix (1–2 sentences; do NOT write the full patch — Opus will)
- **Confidence:** HIGH | MED | LOW
```
IDs: `<DOMAIN>-01`, `-02`, … Sort P0 → P3. Be specific; a finding without a `file:line` and quoted evidence is not actionable.

## What to RETURN in chat (short — orchestrator context is precious)
Return ONLY: (1) your findings file path, (2) counts `P0/P1/P2/P3`, (3) the top 3 one-liners (`ID · severity · title`). Nothing else.
