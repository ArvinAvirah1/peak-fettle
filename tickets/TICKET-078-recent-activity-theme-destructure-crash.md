# TICKET-078 — "Cannot read property 's5' of undefined" crash on Recent Activity

**Owner:** dev-frontend
**Date opened:** 2026-06-03
**Phase:** R — Revision & Hardening
**Model lane:** Sonnet (mechanical fix) — already applied in the 2026-06-03 session; this ticket is the written record + verification gate.
**Status:** FIX APPLIED (awaiting parse-sweep verification + commit)
**Depends on:** nothing
**File-ownership boundary (do not edit outside these):**
- `mobile/app/workout-history.tsx`
- `mobile/app/workout-day.tsx`

---

## Symptom (founder-reported, 2026-06-03)
Tapping **RECENT ACTIVITY** on the Home tab (the "View all →" link, and/or a history row)
throws a red-screen runtime error: **"cannot read property 's5' of undefined"**. The
workout-history list and the per-day detail screen are completely inaccessible.

## Root cause (confirmed)
`useTheme()` (see `mobile/src/theme/ThemeContext.tsx:129-137`) returns this shape:

```ts
{ theme, themeName, setTheme, spacing, radius, fontSize, fontWeight }
```

`spacing`, `radius`, `fontSize`, `fontWeight` are **top-level** on that return value.
The `theme` object itself is only `{ name, displayName, primitives, colors, components }`
(see `mobile/src/theme/tokens.ts:204-212`, `buildTheme`). **`theme.spacing` does not exist.**

Both Recent-Activity screens destructured the spacing/size tokens from **inside** `theme`:

```ts
// WRONG — theme.spacing is undefined
const { theme: { colors, spacing, radius } } = useTheme();
...
<View style={{ paddingHorizontal: spacing.s5 }} />   // spacing is undefined → crash on `.s5`
```

`workout-history.tsx` renders `SkeletonRows` immediately while `loading === true`, so the
crash fires on first paint — the screen never renders. The same wrong pattern existed in 7 spots
across the two files:
- `mobile/app/workout-history.tsx`: lines 127 (`SkeletonRows`), 147 (`FooterSpinner`), 161 (screen body)
- `mobile/app/workout-day.tsx`: lines 237 (`SkeletonBlock`), 263 (`SetRow`), 335, 379

## Fix applied (2026-06-03)
Pull `colors` from `theme`, and `spacing`/`radius`/`fontSize`/`fontWeight` from the **top level**
of `useTheme()`. Example:

```ts
// CORRECT
const { theme: { colors }, spacing, radius } = useTheme();
// or, when the whole theme object is also needed:
const { theme, spacing, fontSize, fontWeight, radius } = useTheme();
const { colors } = theme;
```

All 7 spots were corrected and both files parse clean under `@babel/parser`
(`jsx` + `typescript`). A grep for the bad pattern
`theme:\s*\{[^}]*\b(spacing|fontSize|fontWeight|radius)\b` now returns zero matches in `mobile/**/*.tsx`.

## Acceptance criteria
1. Home → "RECENT ACTIVITY → View all" opens `workout-history` with **no** runtime error
   (skeleton rows render, then the ISO-week SectionList).
2. Tapping any history row opens `workout-day` for that date with no runtime error.
3. `rg "theme:\s*\{[^}]*\b(spacing|fontSize|fontWeight|radius)\b"` (multiline) over `mobile/**/*.tsx`
   returns **0** matches — guards against the pattern reappearing elsewhere.
4. `peak-fettle-verify` parse-sweep is clean.

## Test plan
1. Open the app with at least one logged workout in history → tap RECENT ACTIVITY "View all" → list renders.
2. Tap a row → day detail renders with exercise groups + set rows.
3. Open with an **empty** history → the empty-state ("No workouts yet") renders (this path also
   used the buggy destructure indirectly via shared sub-components — confirm no crash).

## Definition of done
- Both files parse clean (`peak-fettle-verify`).
- Committed via the `peak-fettle-commit` skill (lock-bypassing plumbing).
