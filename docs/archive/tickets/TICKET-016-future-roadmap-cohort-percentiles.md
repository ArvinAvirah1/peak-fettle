# TICKET-016 — Future Roadmap: Cohort-Based Percentiles (Conditional)

**Owner:** dev-backend, dev-database, data-analyst  
**Date opened:** 2026-05-04  
**Phase:** D+ (post-MVP, conditional on user base growth)  
**Priority:** P3 (nice-to-have, not in current roadmap)  
**Status:** 🔲 BLOCKED (depends on user base milestone)  
**Blocks:** None  
**Related:** [TICKET-015](#ticket-015--percentile-computation-architecture-clarification--validation) (prerequisite)

---

## Goal

**This ticket exists to document the future feature, not to implement it now.** If/when Peak Fettle reaches 500+ logged lifts per weight class cohort, this ticket becomes unblocked and can be activated.

Cohort-based percentiles will allow users to see "You're in the 78th percentile compared to other athletes in your weight class" — but only when the user base is large enough for this comparison to be statistically valid.

---

## Why This Matters

**Current state (v1 — TICKET-015):**
- Percentiles show strength relative to a statistical model (log-normal distribution)
- This is the right choice for small user bases (< 500 per cohort)
- Users see: "You're at the 62nd percentile (strength model)"

**Future state (v2 — this ticket):**
- *If* user base grows to 500+ per weight class, add cohort-based percentiles
- Users would see: "You're in the 78th percentile in your weight class" (directly compared to other users)
- *If* user base stays small, cohort percentiles remain permanently disabled (they'd be meaningless)

**This is intentional:** We do not want to show "You're in the top 1% of your cohort" when there are only 3 users in that cohort. That's misleading and demoralizing.

---

## User Base Milestone

| Metric | Threshold | Status | Date |
|--------|-----------|--------|------|
| Total registered users | 50+ | ❌ Not yet | — |
| Logged lifts in any weight class | 100+ | ❌ Not yet | — |
| Weight class with 500+ logged lifts | Milestone reached | ❌ Not yet | — |
| **Action:** Unblock TICKET-016 | **←← HERE** | — | — |

When the metric hits the "Milestone reached" row, move this ticket from `🔲 BLOCKED` to `🟡 PENDING` and assign to dev-backend.

---

## What This Feature Would Look Like (Design, Not Implemented)

### New database table: `cohort_percentile_rankings`

```sql
CREATE TABLE IF NOT EXISTS cohort_percentile_rankings (
    user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lift_id              TEXT NOT NULL,
    weight_class_kg      INTEGER,  -- e.g. 52, 59, 66, 74, 83, 93, 105, 120, 999 (≥120)
    sex                  CHAR(1),
    age_band             TEXT,     -- e.g. '25-34', '35-44'
    years_in_sport       TEXT,     -- e.g. '1-3', '3-5', '5+'
    cohort_size          INTEGER,  -- number of users in this cohort
    percentile           INTEGER,  -- 0–100, relative to cohort
    computed_at          TIMESTAMPTZ DEFAULT NOW(),
    model_version        INTEGER DEFAULT 2,
    
    PRIMARY KEY (user_id, lift_id, weight_class_kg, sex, age_band, years_in_sport, model_version),
    FOREIGN KEY (lift_id) REFERENCES lifts(id)
);

CREATE INDEX cohort_percentile_lookup_idx
    ON cohort_percentile_rankings (user_id, lift_id, model_version);
```

### New API endpoint (stub for now, implement when unblocked)

```
GET /percentile/v2?include_cohort=true
```

Response would include **both** v1 (strength model) and v2 (cohort) percentiles:

```json
{
  "rankings": [
    {
      "lift_id": "back_squat",
      "strength_percentile": 62,          // ← v1 (always available)
      "cohort_percentile": null,          // ← v2 (null if cohort too small)
      "cohort": {
        "weight_class_kg": 83,
        "sex": "M",
        "age_band": "25-34",
        "years_in_sport": "3-5",
        "cohort_size": 12                  // ← only show percentile if 500+
      },
      "computed_at": "2026-05-11T03:00:00Z",
      "model_version": 1
    }
  ],
  "note": "Cohort percentiles are only shown when the cohort has 500+ members."
}
```

If `cohort_size < 500`, `cohort_percentile` is `null` and the front-end does not display it.

### New cron job: `cohort-percentile.js`

```javascript
// Similar to cron/percentile.js but:
// 1. Computes PERCENT_RANK() for each (user, lift, cohort_id) tuple
// 2. Groups by (weight_class, sex, age_band, years_in_sport)
// 3. Inserts into cohort_percentile_rankings
// 4. Only computes if cohort_size >= 500 (safety check)
```

### Front-end UX (stub)

In `qml/PercentileCard.qml` or the percentile view:

```qml
if (ranking.cohort_percentile !== null && ranking.cohort_size >= 500) {
    Text { text: "You're in the " + ranking.cohort_percentile + "th percentile in your cohort" }
} else {
    Text { text: "Strength model: " + ranking.strength_percentile + "th percentile" }
}
```

---

## Acceptance Criteria (Implementation)

**When user base reaches 500+ per cohort:**

- [ ] Create `cohort_percentile_rankings` table in a migration
- [ ] Implement `compute_cohort_percentile_batch()` SQL function (or wrapper)
- [ ] Create `cron/cohort-percentile.js` job
- [ ] Add `GET /percentile/v2` endpoint that includes both strength + cohort percentiles
- [ ] API returns `cohort_percentile: null` if `cohort_size < 500` (safe default)
- [ ] Update front-end to display cohort percentiles only when available
- [ ] Add monitoring: alert if a cohort starts hitting 500+ (so PMs know we've hit the milestone)
- [ ] Update `dev-lead.md` with the new strategy

**Gating:**
- Do not implement this until the user base metric is reached
- If user base never reaches 500 per cohort, this ticket remains `🔲 BLOCKED` indefinitely
- That's okay — the v1 strength model is sufficient and not a limitation

---

## Why This Design

### ✅ Pros
- **Safe for small user bases:** Cohort percentiles are `null` if < 500 users (never misleading)
- **Non-breaking:** Both v1 and v2 coexist; v1 is always available
- **Motivating when ready:** "You're top 15% of your weight class" is more relatable than "62nd percentile on the strength model"
- **Data-informed:** Only turns on when we have enough data

### ❌ Anti-patterns to avoid
- ❌ Showing "You're #1 in your cohort" when there are 2 users (misleading)
- ❌ Enabling cohort percentiles with < 100 total users (statistically invalid)
- ❌ Removing the strength model when cohort percentiles launch (keep both for comparison)
- ❌ Auto-enabling cohort percentiles without explicit QA sign-off

---

## Decision Matrix

| Scenario | Action |
|----------|--------|
| User base < 500 per cohort | ✅ Use TICKET-015 (strength model). Do not implement TICKET-016. |
| User base ≥ 500 per cohort | ✅ Implement TICKET-016. Show both strength + cohort percentiles. |
| User base never grows | ✅ Leave TICKET-016 blocked. v1 is sufficient. |
| User base shrinks below 500 | ✅ Keep both percentile types, but warn: "Cohort percentile is based on limited data" |

---

## Known Traps

❌ **Do not:**
- Implement cohort percentiles before the user base milestone is hit
- Show cohort percentiles if `cohort_size < 500` (even by accident)
- Delete or archive TICKET-016 (it might be unblocked later)
- Assume cohort percentiles are "better" than strength model percentiles (they're just different)

✅ **Do:**
- Keep TICKET-016 in the roadmap as a conditional feature
- Monitor user cohort sizes; ping PMs when we approach 500+ per cohort
- Write tests that verify cohort percentiles are `null` if cohort is too small
- Document the "milestone reached" event in release notes

---

## How This Links to TICKET-015

1. **TICKET-015** validates that v1 (strength model) is correctly implemented and documented
2. **TICKET-016** (this ticket) documents the v2 feature and the *condition* under which it becomes relevant
3. Together, they ensure Peak Fettle's percentile strategy is deliberate, not accidental

---

## Monitoring / Trigger Conditions

To know when to unblock this ticket, watch these metrics:

```sql
-- How many users per weight class per lift?
SELECT 
  weight_class_kg,
  sex,
  lift_id,
  COUNT(DISTINCT user_id) as cohort_size
FROM v_user_lift_inputs  -- or user_set_logs + users join
GROUP BY weight_class_kg, sex, lift_id
ORDER BY cohort_size DESC;

-- If any row shows cohort_size >= 500 → unblock TICKET-016
```

Set up a weekly monitoring alert that pings the dev team if this threshold is approached.

---

## Timeline (Estimates)

If/when unblocked:
- **Design:** 2 hours (finalize schema, API response format)
- **Implementation:** 6–8 hours (SQL function, cron job, API endpoint, tests)
- **QA:** 4 hours (test edge cases, cohort size boundaries)
- **Deployment:** 1 hour (migration, cron scheduling, monitoring)
- **Total:** ~2 days of dev work

---

## Output (per dev-context format)

After implementation (when unblocked), dev-backend appends to `dev-lead.md` "Recently completed":

> `[DATE]` — TICKET-016 cohort-based percentiles. Implemented `compute_cohort_percentile_batch()` SQL function, new `cron/cohort-percentile.js` job, and `GET /percentile/v2` endpoint. Cohort percentiles only displayed when `cohort_size >= 500` (safety guard). Both v1 (strength model) and v2 (cohort) percentiles coexist; front-end shows both when available. Monitoring in place to track when cohorts approach 500+ members.

**Files touched (when implemented):**
- `migrations/[date]_cohort_percentiles.sql` — new table + function
- `peak-fettle-agents/server/cron/cohort-percentile.js` — new file
- `peak-fettle-agents/server/routes/percentile.js` — new `GET /percentile/v2` endpoint
- `qml/PercentileCard.qml` — UI for both percentile types
- `dev-lead.md` — new subsection "Percentile Model (v1 & v2)"

---

## Related Documents

- **TICKET-015** — Current implementation (v1 / strength model)
- **INSTRUCTIONS.md** — Founding goals (might mention percentile vision)
- **compute_percentile.sql** — The v1 model definition
- **peak_fettle_project.md** — Product roadmap context
