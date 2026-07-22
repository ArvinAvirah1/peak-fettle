# Peak Fettle — UI/UX Overhaul Proposal (2026-06-12)

**How to use this doc:** each surface lists 12+ concrete improvements, then a
**Direction** line with three options — **Keep** (no visual change, bugfix only),
**Polish** (same layout, tightened), **Redesign** (new layout). Tell me your pick per
surface (or "Polish all", "Redesign worst 3", etc.) and I'll implement only what you choose.

**Design language (recommended baseline):** keep the dark + teal identity — it's correct
for a data-dense strength tracker. The app already has the right bones: a token system
(`theme.colors`, `fontSize`, `sp` spacing), `tabular-nums` on metrics, and a card grammar.
The work is consistency, hierarchy, safe areas, and motion — not a new palette. Everything
below uses `react-native-safe-area-context`, 4/8pt spacing, ≥44pt touch targets, 150–300ms
spring transitions, and respects reduced-motion + Dynamic Type.

> Note: this is independent of the bug review. The functional fixes in `REVIEW_2026-06-12.md`
> ship regardless of which directions you pick here.

---

## 1. Set-tracking flow — `StepperLogger`, `WorkoutLoggerHost`, `SetEntryForm`
*The most-used screen in the app. Highest ROI.*

1. **Safe-area header** — wrap in `SafeAreaView edges={['top','bottom']}`; the close chevron currently sits under the Dynamic Island (P1 bug + visual).
2. **Big numeric keypad targets** — weight/reps steppers and the number field to ≥56pt height with `inputMode="decimal"`; logging is one-handed and fast.
3. **Tabular, large set numbers** — render weight × reps at `heading1` with `tabular-nums` so values don't jitter as you increment.
4. **Per-set rest timer inline** — auto-start a rest countdown ring on "log set" (you already have `useRestTimer`), with a tap-to-skip; this is the #1 missing affordance vs Strong/Hevy.
5. **Previous-set ghost text** — show last session's weight×reps for the same exercise as a faded placeholder ("last: 80×5"); one-tap to copy.
6. **Plate math affordance** — surface the existing `PlateCalculatorSheet` from a small barbell icon next to the weight field instead of burying it.
7. **Progress as a slim top bar** — replace the dots row with a thin determinate progress bar (exercise i/n) that animates; dots don't scale past ~6 exercises.
8. **Swipe between exercises** — horizontal pager with a spring, plus the existing buttons (gesture + visible control, per HIG).
9. **RIR/RPE as a segmented chip row** — not a free number; 3–4 tap targets ("easy / 2 / 1 / fail").
10. **Unit-aware everywhere** — weight respects `unit_pref` (kg/lb) with the unit shown in the field, not assumed kg.
11. **"Just logged" confirmation** — a 150ms scale+check micro-interaction + light haptic on log; currently silent.
12. **Sticky bottom action bar** — "Log set" primary + "Finish" secondary pinned above the home indicator (`insets.bottom`), always reachable without scrolling.
13. **Empty/early state** — when a session has 0 exercises, show "Add an exercise" CTA, not a blank sheet (ties to the `gettemplate` P0 fix).
14. **Failure surfacing** — if a set fails to save, a non-blocking retry toast, never a silent drop.

**Direction:** ☐ Keep ☐ Polish ☐ **Redesign (recommended — biggest impact)**

---

## 2. Home page — `app/(tabs)/index.tsx`
*Screenshot: greeting, Start workout, My Routines, Starter Splits, Streak, Today, Recent.*

1. **Kill the perpetual spinners** — every section gets a skeleton (≤1s) then either data or an empty state; never an infinite ActivityIndicator (the current symptom).
2. **Honest connectivity** — drop the "Offline" badge for local-first free users (it's meaningless when PowerSync is intentionally off); replace with nothing, or a subtle "On-device" pill.
3. **Hero "Start workout" with context** — show what's next ("Next: Push Day · 6 exercises") under the CTA instead of a bare button.
4. **Streak as a compact stat strip** — current 🔥 + longest + this-week dots in one row with `tabular-nums`; today it's a tall card that loads slowly.
5. **Today card = today's plan or a rest-day prompt** — make the state explicit; the current empty "Today" + separate "Log rest day" reads as two competing actions.
6. **Merge "My Routines" + "Starter Splits"** into one horizontally-scrollable carousel with a clear "+ New" affordance; two stacked horizontal lists is heavy.
7. **Card press states** — `scale 0.97` spring + state layer on every tappable card (several are flat/no feedback).
8. **Section headers consistent** — one label style (uppercase, `letterSpacing`, tertiary) with optional right-aligned action; currently mixed weights/sizes.
9. **Recent activity as rich rows** — exercise icon + "Leg Day · 6/4 · 12 sets · 4.2k kg" with tabular volume, not a spinner.
10. **Greeting + date hierarchy** — name at `heading1`, date at `caption` tertiary; tighten the vertical rhythm (currently large gaps).
11. **Pull-to-refresh** with a branded spinner instead of per-section loaders.
12. **Quick-add FAB or header action** for "log a single lift" without starting a full session.
13. **Safe-area top** — greeting currently hugs the status bar on some devices; standardize the screen top inset.
14. **Reduced-motion + Dynamic Type** pass on the streak/stat numbers so they don't truncate at large text sizes.

**Direction:** ☐ Keep ☐ **Polish (recommended)** ☐ Redesign

---

## 3. Routines — `app/(tabs)/routines.tsx`, `RoutineEditorSheet`
*Screenshot: "Create schedule" card, "Yours" empty, "Starter Splits · tap to duplicate".*

1. **Working starter splits** (P0 `gettemplate` fix) — tapping a chip must open a real preview, not "No exercises".
2. **Starter splits as preview cards**, not pills — show day count, focus, exercise count; pills hide all signal.
3. **"Yours" empty state with a real CTA** — "Build your first routine" button + "or duplicate a starter split below", not just gray text.
4. **Clear primary action** — one "+ New" (top-right) is enough; the inline "Create schedule" card competes with it — move scheduling into the routine detail.
5. **Routine cards** — name, day badges (M/W/F), exercise count, last-performed; press-state spring.
6. **Duplicate = one tap + toast** ("Copied to Yours"), then inline rename; today it errors (P0).
7. **Swipe actions** on "Yours" rows — duplicate / edit / delete with confirm.
8. **RoutineEditorSheet safe areas** (P2) + a sticky Save bar above the home indicator.
9. **Drag-to-reorder** exercises in the editor with a movement threshold + haptic.
10. **Inline exercise add** from the editor (reuse `ExercisePicker`) without leaving the sheet.
11. **Local-first** — free users' routines save instantly to-device (ties to the routines GAP fix); show no network state.
12. **Section grammar** — "Yours" and "Starter splits" share one header style + spacing.
13. **Per-routine schedule chip** — show "Mon/Wed/Fri" on the card if scheduled, tap to edit.
14. **Search/filter** starter splits by goal (strength/hypertrophy/PPL) once the library grows.

**Direction:** ☐ Keep ☐ Polish ☐ **Redesign (recommended — it's central + currently broken)**

---

## 4. Scheduling — `ScheduleEditorSheet` (the screenshot with the header under the clock)
*"Create schedule": Repeating cycle / Day of week, then an infinite spinner.*

1. **Safe-area header** (P1 — the exact screenshot bug): `SafeAreaView edges={['top']}`, X + Save reachable.
2. **Kill the infinite spinner** — the sheet hangs on the localDB deadlock (P0 A); after the fix, show content immediately.
3. **Segmented control polish** — "Repeating cycle / Day of week" as a proper iOS-style segmented control with an animated thumb, not two buttons.
4. **Day-of-week** — 7 round toggle chips (S M T W T F S) with selected state; large tap targets.
5. **Repeating cycle** — a clean stepper ("Train 3 days, rest 1") with a live preview of the next 2 weeks.
6. **Routine picker per slot** — assign a routine to each scheduled day inline (chips), with "Rest" as a first-class option.
7. **Live calendar preview** — a 2-week mini-grid showing the resulting pattern updates as you edit.
8. **Sticky Save bar** above the home indicator; disabled until valid, with a reason.
9. **Time-of-day + reminder** toggle per schedule (optional push) — ties to the notification prefs.
10. **Confirm-on-dismiss** if there are unsaved changes (HIG sheet-dismiss).
11. **Modal entry motion** — slide+fade from the trigger, not an instant cut.
12. **Empty→guided** — first-time schedulers get a one-line explainer ("Schedules pick which routine to surface each day").
13. **Validation inline** — "Pick at least one day" near the control, not a silent dead Save.
14. **Local-first persistence** — saves on-device for free users, instantly.

**Direction:** ☐ Keep ☐ Polish ☐ **Redesign (recommended — broken + the worst safe-area offender)**

---

## 5. Settings / Profile — `app/(tabs)/profile.tsx`
*Screenshot: avatar, name/email, Free tier, Units, Confirm-1RM, Training profile, Readiness.*

1. **Saves actually persist** (P1) — unit/1RM/notification toggles write locally for free users and surface real success/failure (today they fake success or silently revert).
2. **Unit toggle as a segmented control** (kg | lb) with an animated thumb + instant app-wide effect.
3. **Grouped sections with headers** — Account · Training · Notifications · Data · About; consistent row height ≥44pt.
4. **Row affordances** — every navigational row gets a chevron + press state; some are flat.
5. **Avatar edit safe-area** (P1 `AvatarCustomizer`) + a clear Save/Cancel bar.
6. **Tier card** — "Free tier" becomes a tasteful upgrade card (value bullets) rather than a plain label, linking to the paywall.
7. **Toggle semantics** — switches show a brief inline "Saved" tick; failures show an Alert with retry (no silent revert).
8. **Destructive separation** — Sign out / Delete account in their own section, danger-colored, away from normal rows (HIG).
9. **Data section** — "Export my data" exports the *right* source (local for free users — P3 fix) and shows last-backup time.
10. **Readiness/Training rows** show a one-line current value ("Goal: Strength · 4×/wk") as a subtitle, not just a title.
11. **Constraints/injuries** editable inline (chips) and stored locally for free users.
12. **Icons** — one consistent set (Ionicons) at one size token; no emoji as structural icons.
13. **Profile header** — larger avatar, name `heading1`, email `caption`; tier pill beside the name.
14. **Settings search** (optional) once the list grows past ~2 screens.

**Direction:** ☐ Keep ☐ **Polish (recommended)** ☐ Redesign

---

## 6. Onboarding survey — `onboarding.tsx`, `training-survey.tsx`
*Goal-weight is kg-only with no toggle (founder symptom 8).*

1. **kg/lb toggle on goal-weight** (P2 bug) — segmented unit switch; store canonical kg, accept/display lb; default from `unit_pref`.
2. **Unit-aware on every weight field** — bodyweight + goal-weight both honor the preference, with the unit in the field.
3. **Step progress indicator** — "3 of 7" bar with back navigation; multi-step flow needs orientation.
4. **One question per screen** with a large title + helper, big tap targets, and a persistent Next bar.
5. **Inline validation on blur** — "Enter a weight or skip", not a dead Next.
6. **Choice cards, not tiny radios** — goal/discipline/experience as full-width selectable cards with checkmarks + spring select.
7. **Numeric keyboards** — `inputMode="decimal"`/`numeric` so the right keypad appears.
8. **Skip affordance** — optional steps (goal weight, season) get a clear "Skip" that doesn't feel like a dead end.
9. **Autosave draft** — survey answers persist locally per step so a mis-tap doesn't lose progress (also fixes the silent-loss P1).
10. **Save locally for free users** (P1) — answers land in `user_profile` on-device, not a failing server PATCH.
11. **Summary/confirmation step** — review all answers before finishing, with edit links.
12. **Motivational framing** — short value line per step ("This tailors your starting loads"), consistent with the marketing voice.
13. **Safe-area + keyboard avoidance** so the Next bar never hides behind the keyboard or home indicator.
14. **Reduced-motion + Dynamic Type** — choice cards reflow, no truncation at large text.

**Direction:** ☐ Keep ☐ **Polish (recommended)** ☐ Redesign

---

## 7. Cross-cutting (applies to whichever surfaces you pick)

- **Global safe-area fix** — adopt `react-native-safe-area-context` everywhere (P1/P2 sweep);
  one `ScreenLayout`/`ModalLayout` wrapper so this never regresses.
- **Motion system** — shared 150–300ms spring tokens; modals animate from source; exit ~70% of enter.
- **One icon set, one size scale, no emoji as structural icons** (🔥 streak is fine as content).
- **Tabular numerals** on every metric (mostly done — extend to logger + history).
- **Empty/error/loading triad** — every data view defines all three; no bare spinners.
- **Accessibility** — labels on icon-only buttons, ≥44pt targets, 4.5:1 contrast, focus order.

---

## My recommendation (if you want a default)

**Redesign** the three broken/high-traffic surfaces — **Set-tracking (1)**, **Routines (3)**,
**Scheduling (4)** — and **Polish** the rest (**Home, Profile, Survey**). That concentrates the
visual jump where users spend time and where things are currently broken, while keeping the
lower-risk screens consistent. The cross-cutting safe-area + motion + empty-state work ships
under all of them.

**Reply with your picks** (e.g. "Redesign 1, 3, 4; Polish 2, 5, 6" or "Polish everything") and
I'll start implementation.
