# TICKET-047 — Deload Week Support in AI-Generated Plans
**Owner:** dev-backend + dev-frontend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17; ROADMAP.md §2.3

---

## Goal

AI-generated plans should include explicit deload weeks for users with ≥ 3 months of logged data. Deload weeks must be visually distinct in the plan view and carry a tooltip explanation.

---

## Acceptance criteria

1. The Haiku prompt in `routes/plans.js` instructs the model to include a deload week every 4–6 weeks when the user has ≥ 3 months of workout history.
2. The API response includes a `week_type` field per session: `'build' | 'peak' | 'deload' | 'standard'`.
3. The plan view (`mobile/app/(tabs)/plans.tsx`) renders deload weeks with a visually distinct card style (e.g., muted color, 🛌 icon, "Recovery Week" label).
4. A `Tooltip` on "Deload" / "Recovery Week" explains: "A planned easy week lets your body adapt to recent training. Research shows deload weeks improve long-term strength gains."
5. Users with < 3 months of history get plans without deload weeks — no error.

---

## Implementation plan

### Backend — `routes/plans.js`

Check session history length before calling Haiku:
```javascript
const { rows: [{ month_count }] } = await pool.query(
  `SELECT COUNT(DISTINCT DATE_TRUNC('month', day_key::date))::int AS month_count
   FROM workouts WHERE user_id = $1 AND session_type NOT IN ('rest_day', 'emergency_override')`,
  [userId]
);
const includeDeload = month_count >= 3;
```

Update the system prompt to include (when `includeDeload` is true):
```
Include a deload week every 4-6 weeks. Mark deload sessions with "week_type": "deload".
Deload sessions should have ~40-60% of the normal volume (fewer sets, same exercises).
Mark other weeks as "week_type": "build", "peak", or "standard" as appropriate.
```

Ensure the structured output schema for plan sessions includes `week_type: z.enum(['build', 'peak', 'deload', 'standard']).optional()`.

### Mobile — `mobile/app/(tabs)/plans.tsx`

- Add `week_type?: 'build' | 'peak' | 'deload' | 'standard'` to the plan session type.
- In the session card renderer: if `week_type === 'deload'`, apply a distinct style:
  - Background: `theme.colors.bgSecondary` with reduced opacity or a muted border.
  - Header: "🛌 Recovery Week" label.
  - Wrap "Recovery Week" text in `<Tooltip>` linking to glossary entry for "Deload".
- For `week_type === 'peak'`: add "🏋️ Peak Week" label with a subtle highlight.

### Glossary update
Add deload entry to `mobile/src/utils/glossaryTerms.ts`:
> **Deload**: A planned training week with reduced volume (sets/reps) to allow your body to fully recover and adapt. Deload weeks prevent overtraining and are associated with improved long-term strength gains.

---

## Test plan

1. User with 4+ months history generates a plan — verify at least one session has `week_type: 'deload'` in the response.
2. User with 1 month history generates a plan — verify no deload sessions, no error.
3. Deload session card is visually distinct in the plan view.
4. Tooltip on "Recovery Week" text opens the glossary entry for Deload.
5. Deload session has fewer sets than adjacent build-week sessions (verify in plan JSON).

---

## Notes
- The `week_type` field is advisory — the AI generates it and the client renders it. There is no server-side enforcement of volume thresholds (that would require knowing the user's plan in full, which is expensive).
- If the AI omits `week_type` on a session, default to `'standard'` — no crash.
