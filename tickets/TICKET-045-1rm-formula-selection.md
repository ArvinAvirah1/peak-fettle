# TICKET-045 — 1RM Formula Selection in Settings
**Owner:** dev-frontend + dev-backend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17; ROADMAP.md §2.3

---

## Goal

Let users choose their preferred 1RM estimation formula. Currently Epley is hardcoded everywhere. Marcus-persona users who compete or follow programs using Brzycki/Lombardi want their preferred formula respected.

---

## Acceptance criteria

1. `users` table has `onerm_formula TEXT NOT NULL DEFAULT 'epley' CHECK (onerm_formula IN ('epley', 'brzycki', 'lombardi', 'mayhew'))`.
2. Settings screen has a 1RM Formula picker with four options, each showing the formula equation and a worked example using the user's own most-recent set.
3. All 1RM calculations across the app (PR display, progress chart, plan generation context) respect this preference.
4. A `GET /user/me` response includes `onerm_formula`.
5. `PUT /user/profile` accepts `onerm_formula`.
6. The settings panel includes an info modal: formula name, equation, and a note that "DOTS and percentile rankings always use Epley internally for consistency — your formula choice only affects what you see in your own progress view."

---

## Implementation plan

### Migration
Create `migrations/20260522_onerm_formula.sql`:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS onerm_formula TEXT NOT NULL DEFAULT 'epley'
  CHECK (onerm_formula IN ('epley', 'brzycki', 'lombardi', 'mayhew'));
```

### Formulas (implement in `mobile/src/utils/oneRepMax.ts`)
```typescript
export type OnermFormula = 'epley' | 'brzycki' | 'lombardi' | 'mayhew';

export function calc1RM(weightKg: number, reps: number, formula: OnermFormula): number {
  if (reps === 1) return weightKg;
  switch (formula) {
    case 'epley':    return weightKg * (1 + reps / 30);
    case 'brzycki':  return weightKg * (36 / (37 - reps));
    case 'lombardi': return weightKg * Math.pow(reps, 0.10);
    case 'mayhew':   return (100 * weightKg) / (52.2 + 41.9 * Math.exp(-0.055 * reps));
  }
}
```

### Backend
- `routes/user.js` — include `onerm_formula` in GET /user/me response; accept it in PUT /user/profile.
- `routes/sets.js` — 1RM calculations in PR triggers do NOT change (they use Epley for ranking consistency). Backend note in comment: "1RM estimates for display are client-side; server uses Epley for all ranking math."

### Mobile
- `mobile/src/utils/oneRepMax.ts` — new file with `calc1RM` function above.
- Replace all inline `epley(weightRaw, reps)` calls in `progress.tsx` and elsewhere with `calc1RM(weightRaw / 8, reps, userFormula)`.
- `mobile/src/hooks/useAuth.ts` (or user profile hook) — expose `onermFormula` from user profile.
- Settings screen — add formula picker with inline equation display.

---

## Test plan

1. Default formula is Epley; PR display matches current behavior.
2. Switch to Brzycki — PR values update on next screen load.
3. 1-rep sets: all formulas return the raw weight (no formula applied).
4. Settings modal shows the correct equation for each formula.
5. `onerm_formula` persists across app restarts.

---

## Notes
- Percentile/DOTS ranking always uses Epley server-side for consistency. Make this explicit in the settings UI to avoid user confusion.
