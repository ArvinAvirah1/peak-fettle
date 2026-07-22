# TICKET-043 — Jargon Glossary & Contextual Tooltips
**Owner:** dev-frontend
**Date opened:** 2026-05-14
**Phase:** D / Product Phase 1 — Pre-Launch Foundations
**Source:** `ROADMAP.md §1.1`, `DEV_NEXT_STEPS_2026-05-11.md` Step 8, `DEV_ROADMAP_2026-05-12.md` §9.5

---

## Goal

New users (Derek the beginner, Jamie the casual gym-goer) bounce off Peak Fettle
because the app is dense with unexplained jargon — "1RM", "RPE", "DOTS", "PR",
"progressive overload", "percentile". This ticket adds two things:

1. A **Glossary** — a searchable list of every fitness term the app uses, with
   plain-English one-sentence definitions, reachable from a persistent `?` help
   icon in the main navigation header.
2. A **first-encounter tooltip system** — an inline, tappable term component
   that surfaces a short definition the first time a user sees a given term,
   and links through to the full glossary entry on tap.

This is the first of the five Phase 1 product items and has no upstream
dependency — it can ship independently of EAS Build, the Supabase IPv6 issue,
and TICKET-025 sign-off.

---

## Acceptance criteria

1. A persistent `?` help icon appears in the header of all five main tabs
   (Home, Log, Rankings, Plans, Profile) and opens the Glossary.
2. The Glossary screen is a searchable flat list. Search filters on both the
   term and its definition text. Each entry shows: term, plain-English
   definition, optional category tag.
3. Glossary data lives in a typed constant array in
   `mobile/src/utils/glossaryTerms.ts` — not in component state — so it is
   trivially extensible.
4. At minimum the glossary defines: Set, Rep, 1RM, PR, RPE, RIR, Progressive
   Overload, Wilks Score, DOTS Score, Percentile, Normalized Strength Score,
   Deload, Periodization, AMRAP.
5. A `GlossaryTerm` component renders an inline, tappable term (subtle dotted
   underline). Tapping it opens the Glossary pre-filtered to that term.
6. The first time a user encounters a given `GlossaryTerm`, an inline
   definition bubble is shown once. "Seen" state is tracked per term slug in
   `AsyncStorage` under key `@peak_fettle/tooltip_seen` (JSON array of slugs)
   and persists across sessions.
7. Deep-linking: `/glossary?term=<slug>` opens the glossary scrolled/filtered
   to that term.

---

## Implementation plan

### Files to add

- `mobile/src/utils/glossaryTerms.ts` — `GlossaryTerm` type + `GLOSSARY_TERMS`
  typed constant array, plus `getGlossaryTerm(slug)` lookup helper.
- `mobile/app/glossary.tsx` — searchable glossary screen. Registered as a
  pushed (non-tab) route. Reads `?term=` param for deep-linking.
- `mobile/src/components/Tooltip.tsx` — exports:
  - `GlossaryTerm` — inline nestable `<Text>` that links to the glossary and
    shows a first-encounter bubble.
  - `useFirstEncounter(slug)` — AsyncStorage-backed seen/markSeen hook.
  - `InlineTooltipBubble` — the standalone definition bubble (used by
    `GlossaryTerm`, also reusable in non-Text contexts).

### Files to modify

- `mobile/app/_layout.tsx` — register `<Stack.Screen name="glossary" />`.
- `mobile/app/(tabs)/_layout.tsx` — add a persistent `?` `headerRight` button
  to the shared `screenOptions` so it appears on every tab.
- `mobile/app/(tabs)/rankings.tsx` — instrument the screen with `GlossaryTerm`
  for "Percentile" / "DOTS Score" (Step 8c).

### Step 8c — remaining instrumentation (follow-up)

`log.tsx` ("1RM", "RPE", "Set", "Rep"), `plans.tsx` ("Deload",
"Periodization", "Progressive Overload") and `onboarding.tsx` term wrapping are
tracked as the remaining 8c sub-task. The `GlossaryTerm` API is stable, so this
is mechanical wrapping work with no further design needed.

---

## Test plan

1. Open each of the five tabs — confirm the `?` icon is present and opens the
   glossary.
2. Search "max" — confirm 1RM and related entries filter in.
3. Tap a `GlossaryTerm` in the Rankings screen — confirm it deep-links to the
   glossary filtered to that term.
4. First app open: confirm the first-encounter bubble shows once for a term,
   then does not reappear after the screen is revisited or the app restarts.
5. Clear AsyncStorage — confirm first-encounter bubbles reappear.

---

## Notes / decisions

- The glossary is intentionally static local data (not an API call) — the term
  set changes at the speed of product copy, not user data, and offline-first is
  a project rule.
- `GlossaryTerm` is implemented as a nestable `<Text>` so it can be dropped
  inside existing `<Text>` blocks without restructuring layouts.
- First-encounter "seen" tracking uses `AsyncStorage` (already a dependency via
  `@react-native-async-storage/async-storage`), consistent with the pattern
  called out in `DEV_NEXT_STEPS` Steps 8b, 11b, 12a.
