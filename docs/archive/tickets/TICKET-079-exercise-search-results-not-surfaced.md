# TICKET-079 — Exercise search doesn't surface the match (user must scroll to find it)

**Owner:** dev-frontend
**Date opened:** 2026-06-03
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet
**Depends on:** TICKET-073 (live DB) — DONE.
**File-ownership boundary (this agent edits ONLY these; do not touch StepperLogger.tsx, log.tsx, or the tab layout):**
- `mobile/src/components/ExercisePicker.tsx`  ← primary
- `mobile/src/api/exercises.ts`               ← only if a shape bug is proven (see below)
- (read-only, do NOT edit) `peak-fettle-agents/server/routes/exercises.js`

---

## Symptom (founder-reported, 2026-06-03)
> "When I try to search for an exercise it does not show up. I have to scroll down every time to
> find the actual exercise because the functionality is broken."

i.e. typing a query in the exercise picker does **not** narrow the list to the match; the user is
left scrolling the full alphabetical library to find the exercise by hand. Search is effectively a no-op.

## Where this happens
The component is `mobile/src/components/ExercisePicker.tsx` — the modal opened from:
- The Log tab "+" button (`mobile/app/(tabs)/log.tsx:996`, `setPickerVisible(true)`), and
- The stepper's "Browse full library" (`onBrowseLibrary`) which also opens this same picker.

(There is a second search surface, `mobile/app/exercise-library.tsx`, but the founder's report is the
**picker** used during logging. Fix the picker. If you also spot the same defect class in
`exercise-library.tsx`, note it in a follow-up comment — do NOT fix it under this ticket.)

## Verified facts (so you don't re-derive them)
- The server route `GET /exercises/search?q=&limit=&kind=` exists and returns
  `{ query, results: [{ id, name, category, muscle_groups, is_compound, score }] }`
  (`peak-fettle-agents/server/routes/exercises.js:24-88`). It searches names **and** the
  `exercise_aliases` table, scored exact(3)/prefix(2)/substring(1). The shape the client expects
  (`searchExercises → result.results`) **matches** the server. So a flat shape-mismatch is NOT the
  obvious cause — but still verify at runtime (see step 1).
- `searchExercises()` (`mobile/src/api/exercises.ts:62-83`) returns `response.data` and, on ANY
  error, **swallows it and returns `{ results: [], total: 0 }`** (intentional — do not "fix" by
  adding a mock fallback; that path is forbidden by TICKET-067).
- In `ExercisePicker.tsx`:
  - `handleQueryChange` (lines 103-122) debounces 300 ms, then `setSearchResults(result.results)`.
  - `listItems` (lines 139-141): `searchResults ? searchResults.map(...) : buildLibraryItems()`.
  - The `FlatList` (lines 316-332) sets **`getItemLayout={(_, index) => ({ length: 64, offset: 64*index, index })}`**
    — a **fixed 64 px per row**. But section headers (`sectionHeader`, lines 389-393) are ~42 px and
    rows can exceed 64 px when the muscle sub-label wraps. This makes the list's scroll math wrong.

## Most-likely root cause (prime suspect) + required fix
When the list `data` swaps from the full library (≈100+ items, with category headers) to the short
search-results array, the `FlatList` **keeps its previous scroll offset**. Combined with the wrong
`getItemLayout` (every item assumed 64 px), the list ends up scrolled past the few results, so the
match renders **below the fold / off-screen** → the user perceives "it didn't show up" and scrolls.

**Required behaviour after fix:** the instant search results are shown (or the query changes), the
list must be scrolled back to the **top** so the top-ranked match is visible without scrolling.

### Implementation (do all of these)
1. **Reproduce + confirm the real cause first.** Add a temporary `console.log` of
   `searchResults?.length` and the network response in `handleQueryChange`; type a known exercise
   (e.g. "bench"). Confirm whether (a) results come back non-empty but are off-screen [prime suspect],
   or (b) `result.results` is empty/undefined [shape/network bug]. Fix what you actually observe;
   remove the temporary logs before finishing.
2. **Reset scroll to top when the result set changes.** Hold a `FlatList` ref
   (`const listRef = useRef<FlatList>(null)`) and call
   `listRef.current?.scrollToOffset({ offset: 0, animated: false })` whenever `searchResults`
   transitions (in a `useEffect` keyed on `searchResults`, guarded for the ref existing). This is the
   core fix for "have to scroll to find it."
3. **Fix or remove `getItemLayout`.** The fixed-64 assumption is wrong because headers and wrapped
   rows differ. Simplest correct fix: **remove `getItemLayout` entirely** (let FlatList measure).
   Only keep it if you make it accurate for BOTH item types (header height vs row height) — removal
   is preferred and acceptable here (lists are ≤ a few hundred items).
4. **Keyboard must not hide the first result.** Verify `keyboardShouldPersistTaps="handled"` is kept
   and the first result is tappable while the keyboard is up.
5. Leave the "Add as custom exercise" footer behaviour (lines 212-231, 307-314) intact — when a query
   genuinely has no library match, the user can still create it.

## Explicit DO-NOT (prevents wrong assumptions)
- Do **NOT** reintroduce any mock/`MOCK_EXERCISES` fallback on search failure — that path silently
  breaks set logging (FK violation) and is explicitly forbidden (TICKET-067, see comments at
  `mobile/src/api/exercises.ts:72-82`).
- Do **NOT** change the server route or the search SQL.
- Do **NOT** change `autoCapitalize`/`autoCorrect` to "fix" matching — the server already does
  case-insensitive ILIKE/LOWER matching and alias resolution.
- Do **NOT** touch `log.tsx`, `StepperLogger.tsx`, or the tab layout — those are other tickets.

## Acceptance criteria
1. Opening the picker, scrolling down a few screens, then typing a query → the list jumps to the top
   and shows the top-ranked match at the very top, with no manual scrolling required.
2. Typing "bench" surfaces "Bench Press" as a top result; typing an alias the DB knows (e.g. "ohp")
   surfaces the canonical exercise.
3. A query with no library match shows "No exercises found for '<q>'" + the "Add as custom exercise"
   button (existing behaviour preserved).
4. Clearing the query restores the full grouped library, scrolled to the top.
5. No temporary debug logs remain. `peak-fettle-verify` parse-sweep clean.

## Test plan
1. Picker → scroll to "Squat" area → type "curl" → "Dumbbell Curl" visible at top immediately.
2. Type a 1-char then 3-char query; confirm the 300 ms debounce still fires a single search and the
   top result is visible.
3. Airplane mode / kill server → search → confirm graceful "No exercises found" + custom-add, no crash.

## Definition of done
- Parse-sweep clean; committed via `peak-fettle-commit`.
