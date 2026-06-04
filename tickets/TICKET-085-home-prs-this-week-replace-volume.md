# TICKET-085 — Home: replace "volume" with "PRs this week"

**Owner:** dev-frontend · **Date:** 2026-06-03 · **Phase:** R · **Model:** Sonnet
**Founder decision (2026-06-03):** Home should not show volume; show the number of PRs the user set
in the last week instead — **everywhere** volume appears on Home.
**Implemented by:** Agent 1 (same file as TICKET-084: `index.tsx`).
**File-ownership boundary:** `mobile/app/(tabs)/index.tsx` ONLY.

---

## Current state (in `mobile/app/(tabs)/index.tsx`)
Volume appears in two places on Home:
1. **Today card** (`TodayCard`, ~lines 190-271): shows "total volume" (`volumeDisplay`) beside "sets logged".
2. **Quick Stats row** (~lines 736-766): a `StatCard label="Weekly Volume"` tile (`weeklyVolume`), next
   to "Sessions" and "Best Rank".

The screen already computes PR data: `prChips` (~lines 431-452) iterates `history` for lift sets
flagged `is_pr` (all-time). `history` comes from `useWorkoutHistory()` and each entry has
`workout.day_key` (YYYY-MM-DD) and `sets[]`.

## Required
Compute **PRs in the last 7 days**: count of lift sets with `is_pr === true` whose
`entry.workout.day_key >= (today − 6 days)` (use the same `toDateKey`/7-day-window pattern already in
`recentDays`, ~lines 346-351). Call it `prsThisWeek` (an integer count).

Then **remove volume from Home entirely** and surface `prsThisWeek` instead:
1. **Quick Stats:** replace the `StatCard label="Weekly Volume" value={…kg}` with
   `StatCard label="PRs this week" value={String(prsThisWeek)}`. Keep "Sessions" and "Best Rank".
   Remove the now-unused `weeklyVolume` memo.
2. **Today card:** remove the "total volume" stat. Replace that second stat with **"PRs this week"**
   (`prsThisWeek`) so the card shows "N sets logged" + "M PRs this week". Remove `todayVolume`/
   `todayVolumeDisplay` and the `TodayCard` `volumeDisplay` prop (update the prop interface + call site).
   Keep the "Log a set →" CTA behaviour (note: per TICKET-084 the CTA now triggers the Home Start-workout
   flow rather than navigating to a Log tab — Agent 1 wires that; just keep the button).

## DO-NOT
- Do not touch any file other than `index.tsx`.
- Do not remove the `prChips` "RECENT PRs" horizontal scroll (that stays — it's all-time PR chips).
- Do not run git/npm/expo. Parse-check with @babel/parser. Do NOT commit.

## Acceptance criteria
1. No "volume" text anywhere on Home (neither Today card nor Quick Stats).
2. Quick Stats shows "PRs this week" (count of is_pr sets in the last 7 days); Today card shows sets +
   "PRs this week".
3. `prsThisWeek` is 0 when there are no recent PRs (no crash on empty history).
4. Parse-sweep clean; no new tsc errors. Do not commit.
