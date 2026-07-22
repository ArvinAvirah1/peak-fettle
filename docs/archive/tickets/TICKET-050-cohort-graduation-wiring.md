# TICKET-050 — Cohort Graduation Batch Job — Notification Wiring
**Owner:** dev-backend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17; ROADMAP.md §2.8

---

## Goal

`cron/cohort-graduation.js` exists but its output is silent — it updates `experience_level` on the `users` table but sends no in-app notification or push notification when a user advances from Beginner → Intermediate → Advanced. This ticket wires the graduation event to both a push notification and an in-app banner.

---

## Acceptance criteria

1. When `cron/cohort-graduation.js` promotes a user's `experience_level`, it inserts a row into `notification_queue` with `type: 'cohort_promotion'`.
2. The push notification payload: title "You've leveled up! 🎉", body "Your training history earned you a promotion to [new level]. Your percentile ranking now compares you to your new cohort."
3. The mobile app handles the `cohort_promotion` notification type: on cold-start with this notification, navigate to the Rankings tab.
4. A GitHub Actions workflow `cohort-graduation.yml` runs the job on a weekly schedule (Sundays at 03:00 UTC — after the percentile refresh job).
5. The cron job logs a summary: "X users promoted this week: [ids and old→new transitions]."
6. The `experience_level` column update is idempotent — running the job twice in the same week does not double-promote.

---

## Implementation plan

### `cron/cohort-graduation.js` changes

After updating `experience_level`, add:
```javascript
for (const promotion of promotions) {
  // Insert push notification
  await pool.query(
    `INSERT INTO notification_queue (user_id, type, title, body, data)
     VALUES ($1, 'cohort_promotion', $2, $3, $4::jsonb)`,
    [
      promotion.userId,
      "You've leveled up! 🎉",
      `Your training history earned you a promotion to ${promotion.newLevel}. Your percentile now compares you to your new cohort.`,
      JSON.stringify({ old_level: promotion.oldLevel, new_level: promotion.newLevel, screen: 'rankings' }),
    ]
  );
  console.log(`[cohort-graduation] ${promotion.userId}: ${promotion.oldLevel} → ${promotion.newLevel}`);
}
console.log(`[cohort-graduation] ${promotions.length} user(s) promoted this week.`);
```

### Idempotency guard
Add a `last_graduated_at TIMESTAMPTZ` column to `users`:
```sql
-- migrations/20260522_cohort_graduation_guard.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_graduated_at TIMESTAMPTZ;
```
In the cron job: only promote users where `last_graduated_at IS NULL OR last_graduated_at < NOW() - INTERVAL '6 days'`. Update `last_graduated_at = NOW()` alongside the `experience_level` update.

### GitHub Actions — `.github/workflows/cohort-graduation.yml`
```yaml
name: Cohort Graduation
on:
  schedule:
    - cron: '0 3 * * 0'  # Sundays at 03:00 UTC
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: peak-fettle-agents
      - run: node cron/cohort-graduation.js
        working-directory: peak-fettle-agents
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### Mobile — notification routing
In the app's notification handler (likely `mobile/app/_layout.tsx` or a notification service):
```typescript
if (notification.data?.screen === 'rankings') {
  router.push('/(tabs)/rankings');
}
```

---

## Test plan

1. Manually trigger `cohort-graduation.yml` via `workflow_dispatch`. Confirm it runs without error with "0 users promoted" when no users qualify.
2. Seed a test user with history that qualifies for promotion. Run job — verify `experience_level` updated, `notification_queue` row inserted.
3. Run job again same day — verify no second promotion (idempotency guard).
4. Tapping the push notification navigates to the Rankings tab.
5. Job logs print a summary to stdout visible in Actions run output.

---

## Notes
- Requires `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions secrets (Step 7 from DEV_NEXT_STEPS).
- Schedule runs after the percentile refresh job (which should run at 02:00 UTC Sundays) so freshly updated percentiles are available when the graduation assessment runs.
- The `experience_level` graduation thresholds are defined in the existing `cron/cohort-graduation.js`. Do not change them in this ticket — only wire the notifications.
