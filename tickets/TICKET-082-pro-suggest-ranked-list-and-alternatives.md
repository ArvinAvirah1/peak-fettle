# TICKET-082 — PRO suggested-next: ranked list (real data) + machine-busy "Choose alternative" swap

**Owner:** dev-frontend (+ verify server gating)
**Date opened:** 2026-06-03
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Founder decision (2026-06-03):** for the PRO "Suggested next" (mock 5), "enumerate more" =
**"Ranked list + machine-busy swap"** — show several ranked next-exercise options (each with a reason
+ PB + rep target, backed by real data), PLUS the "Choose alternative exercise (machine busy)" pro
action already scoped in TICKET-077 Feature B.
**Supersedes/implements:** TICKET-077 Feature A (now a ranked list, not one card) + Feature B (alt swap).
**Authoritative design:** `set-logging-stepper-flow.html` §3c.

This ticket is split into **two parts owned by two different agents** so they can run in parallel.
The interface between them is frozen below — neither part may change it without telling the orchestrator.

---

## PART A — Suggest engine + alternatives API  (Agent 3; logic/data only, NO UI)

**File-ownership boundary (Part A edits ONLY):**
- `mobile/src/utils/smartSuggest.ts`
- `mobile/src/api/alternatives.ts`  ← NEW FILE (create it)
- `mobile/src/components/RoutineStrip.tsx` — **only** to add `'free'` to the exported
  `RoutineSession.source` union and (additive) optional fields `category?` on `RoutineSessionExercise`
  and `weekNumber?` on `RoutineSession`. These shared-type edits live here so Agent 4 can import them.
  Touch ONLY the type declarations — do not change RoutineStrip's component logic (that's TICKET-083).
**Do NOT edit:** `StepperLogger.tsx`, `log.tsx`, the server.

### A1. Enrich `smartSuggest.ts` (keep existing signatures — additive only)
- `SuggestCandidate` currently: `{ exerciseId, name, reason, pbLabel?: string|null }`
  (`smartSuggest.ts:75-82`). **ADD** `repTarget?: string | null` (e.g. `"6–10"`). Do not remove/rename
  existing fields. Do not change the signatures of `suggestNextExercise` or `suggestNextExercises`
  (`log.tsx` imports both — changing them breaks Agent 4's file).
- Improve the ranking so `suggestNextExercises(sessionLog, historyNames, allExercises, limit)` returns
  a genuinely useful ranked list (the founder's "enumerate more"):
  - Keep the muscle-balance + same-weekday-history heuristic.
  - Produce **distinct, human reasons** per candidate (e.g. "balances push volume", "you usually do
    this on <weekday>", "undertrained this week", "complements <last exercise>"). Avoid every row
    saying the same generic string.
  - De-duplicate by exercise; never suggest an already-logged-this-session exercise.
  - Return up to `limit` (default 3; Agent 4 may request up to 5).
- `repTarget`/`pbLabel` are POPULATED BY THE PARENT (Agent 4 already batch-fetches PBs in
  `log.tsx:789-805`). Part A just needs to (a) declare the `repTarget` field and (b) NOT overwrite
  `pbLabel`/`repTarget` if the caller has set them. (i.e. the pure functions may leave them undefined;
  the parent fills them. Keep that separation.)

### A2. NEW `mobile/src/api/alternatives.ts` — typed client for the machine-busy swap
Wrap the **already-built, pro-gated** endpoint `GET /exercises/:id/alternatives`
(`peak-fettle-agents/server/routes/exercises.js:205-280`). Server response shape (verified):
```jsonc
{ "source": { "id": "...", "name": "..." },
  "tagged": true,
  "alternatives": [
    { "id": "...", "name": "Machine Chest Press", "equipment": "machine",
      "muscle_heads": [...], "shared_heads": [...], "is_compound": true, "score": 24 }
  ] }
```
Export:
```ts
export interface AlternativeExercise {
  id: string; name: string; equipment: string | null;
  muscle_heads: string[]; shared_heads: string[]; is_compound: boolean; score: number;
}
export interface AlternativesResult {
  source: { id: string; name: string };
  tagged: boolean;
  alternatives: AlternativeExercise[];
}
export async function getAlternatives(
  exerciseId: string,
  opts?: { avoid?: string; limit?: number },   // avoid='machine' for the busy-machine case; limit≤20
): Promise<AlternativesResult>;
```
- Use the shared `apiClient` (`mobile/src/api/client.ts`) — same pattern as `mobile/src/api/exercises.ts`.
- The endpoint is `requireAuth + requirePaid`. On a **402/403** (unentitled) the client must throw an
  error the UI can detect as "needs upgrade" (do NOT swallow to `[]`, do NOT mock). Recommended:
  rethrow with a typed marker (e.g. attach `err.isPaywall = true` when `status === 402 || 403`) so
  Agent 4 can route to the paywall sheet, not a silent fail (TICKET-069 / TICKET-077 AC#4).
- No mock fallback (TICKET-067).

### A2 interface contract (FROZEN — Agent 4 codes against exactly this)
`SuggestCandidate` = `{ exerciseId, name, reason, pbLabel?: string|null, repTarget?: string|null }`.
`getAlternatives(exerciseId, { avoid?, limit? }) => Promise<AlternativesResult>` as above.
`AlternativeExercise` / `AlternativesResult` as above.
`RoutineSession.source` includes `'free'`; `RoutineSessionExercise.category?`,
`RoutineSession.weekNumber?` exist (optional).

---

## PART B — Stepper UI for ranked suggestions + alternative swap  (Agent 4; consumes Part A)

**File-ownership boundary:** `mobile/src/components/StepperLogger.tsx`, `mobile/app/(tabs)/log.tsx`
(shared with TICKET-080/081 — same agent). Imports `smartSuggest.ts` + `alternatives.ts` from Part A
against the FROZEN contract above; does not edit them.

### B1. Ranked "Suggested next" list (mock 3c) — pro only
- The `'smart'` interstitial already renders a primary suggestion card + an "OR TRY" list
  (`StepperLogger.tsx:338-378`). Wire it to the enriched `suggestions` (up to 5) with per-row
  `reason`, and on the primary card show `PB <pbLabel> · aim <repTarget>` (per TICKET-081 §3c).
- `log.tsx` already recomputes suggestions (`recomputeSuggestion`, `:760-784`) and batch-fetches PBs
  (`:789-805`). Extend it to also set `repTarget` per candidate from the routine/exercise rep target
  where known (else leave null). Keep the catalogue fetch gated on `user.is_paid` (`:745-758`).
- Gating: the `'smart'` variant + this list render ONLY for `user.is_paid` (already true via the
  variant selector). Free users never see suggestions.

### B2. "Choose alternative exercise" (machine-busy) — pro action, DISTINCT from "Select different exercise"
- Add a **separate** affordance in the stepper logging screen (not the interstitial), pro-only, labelled
  **"Choose alternative exercise"** (e.g. a small link/button under the WEIGHT/REPS row or beside
  "Select different exercise"). This is **different** from "Select different exercise" (which opens the
  full routine switcher / library). "Choose alternative" is for "the machine is busy — give me a swap
  that trains the same muscles on different equipment."
- On tap (pro user): call `getAlternatives(currentExerciseId, { avoid: 'machine' })`. Present the ranked
  `alternatives` in a sheet (name + equipment + a "same muscles" hint; if `tagged === false`, show a
  subtle "matches improving as the library is tagged" note — optional). Selecting one **substitutes the
  current exercise in-session**:
  - If the current exercise is in a routine, swap it for this session (replace the current
    `RoutineSessionExercise` name/id at `currentIndex`).
  - If it's a free/off-routine exercise, respect the existing off-routine placement flow (TICKET-074 /
    `handleStepperAddOffRoutine`) as appropriate.
  - Logging then continues seamlessly on the substituted exercise.
- **Free user** tapping "Choose alternative exercise": show the existing paywall sheet
  (`PaywallUpgradeModal` in `log.tsx:336-476`, or the `paywall_trigger` path) — NOT a 403 dead-end, NOT
  a silent fail. If the API itself returns 402/403 (defense in depth), catch the `isPaywall` marker from
  Part A and route to the same paywall.
  - Ideally the button is simply hidden for free users AND the API guards server-side; show the paywall
    if a free user reaches it by any path.

## Explicit DO-NOT
- Do not change existing `smartSuggest` function signatures (Part A) — `log.tsx` imports them.
- Do not add a mock/stub fallback for `/alternatives` (TICKET-067).
- Do not show pro-only UI (`smart` suggestions, "Choose alternative") to free users.
- Part A must not edit StepperLogger/log.tsx; Part B must not edit smartSuggest/alternatives internals.

## Acceptance criteria
1. **Pro** user, free session: after logging a set, "Done — see what's next →" shows the **ranked**
   suggestion list — primary card (`PB … · aim …` + reason) plus ≥1 distinct "OR TRY" alternative with
   its own reason. Picking one advances to it.
2. **Pro** user: "Choose alternative exercise" calls `GET /exercises/:id/alternatives?avoid=machine`,
   shows ranked swaps on different equipment, and selecting one substitutes the current exercise; logging
   continues.
3. **Free** user: never sees the `smart` suggestion list; tapping any pro path → paywall sheet, never a
   silent fail or raw 403. (Cross-check TICKET-069 / TICKET-077 AC#2 & #4.)
4. Server `GET /exercises/:id/alternatives` without paid entitlement returns the paywall status (not 500);
   client surfaces the paywall.
5. `peak-fettle-verify` parse-sweep clean; `node --check` clean for any server file touched (none expected).

## Test plan
1. Entitlement ON → ranked suggestions appear with varied reasons; "Choose alternative (machine busy)"
   returns same-muscle, different-equipment options; selecting swaps the exercise.
2. Entitlement OFF → no suggestion list; "Choose alternative" gated to the paywall sheet.
3. Network/endpoint error → graceful message, no crash, no mock data.

## Definition of done
- Parse-sweep clean; **do not commit** — the orchestrator commits after the Opus design-spec review.
