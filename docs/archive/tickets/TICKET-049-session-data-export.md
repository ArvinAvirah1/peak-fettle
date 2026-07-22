# TICKET-049 — User-Facing Session Data Export (CSV/JSON)
**Owner:** dev-backend + dev-frontend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17; ROADMAP.md §3.5

---

## Goal

Give users a workout-history-specific export in CSV or JSON format, accessible from the profile settings screen. Distinct from the GDPR data export (all-data dump): this is a clean, user-friendly export of just session history — suitable for opening in Excel or sharing with a coach.

---

## Acceptance criteria

1. `GET /user/export?format=csv` returns all workout sessions as a CSV attachment with headers: `date, exercise, sets, reps, weight_kg, rpe, notes`.
2. `GET /user/export?format=json` returns the same data as a JSON array.
3. Both endpoints require auth. Response includes appropriate Content-Disposition header for file download.
4. Mobile: Settings screen has an "Export my workout data" option with a format picker (CSV / JSON). Tapping triggers a share sheet (`Share.share()`) with the file content.
5. Cardio import sessions are included (with `distance_m`, `duration_seconds`, `avg_pace_sec_per_km` columns; exercise columns are null).
6. Export completes in < 3 seconds for up to 2 years of data (test with synthetic 5,000-row dataset).
7. Empty export (no sessions yet) returns a valid empty CSV/JSON, not an error.

---

## Implementation plan

### Backend — `routes/user.js`

```javascript
router.get('/export', async (req, res, next) => {
  const format = req.query.format === 'json' ? 'json' : 'csv';
  try {
    const { rows } = await pool.query(
      `SELECT
         w.day_key                 AS date,
         e.name                    AS exercise,
         s.set_number,
         s.reps,
         ROUND(s.weight_raw / 8.0, 2) AS weight_kg,
         s.rpe,
         s.notes,
         w.duration_seconds,
         w.distance_m,
         w.avg_pace_sec_per_km,
         w.activity_type
       FROM workouts w
       LEFT JOIN sets s      ON s.workout_id = w.id
       LEFT JOIN exercises e ON e.id = s.exercise_id
       WHERE w.user_id = $1 AND w.deleted_at IS NULL
       ORDER BY w.day_key DESC, s.set_number ASC`,
      [req.user.id]
    );

    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="peak-fettle-export.json"');
      res.json(rows);
    } else {
      const headers = ['date','exercise','set_number','reps','weight_kg','rpe','notes','duration_seconds','distance_m','avg_pace_sec_per_km','activity_type'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push(headers.map(h => JSON.stringify(r[h] ?? '')).join(','));
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="peak-fettle-export.csv"');
      res.send(lines.join('\n'));
    }
  } catch (err) { next(err); }
});
```

### Mobile
- Profile settings screen — add "Export Workout Data" row.
- Tapping opens an `ActionSheet` with "Export as CSV" / "Export as JSON".
- On selection: call `GET /user/export?format=<format>`, receive text/blob, then call `Share.share({ message: data, title: 'Peak Fettle Export' })`.
- Show a loading spinner during the export call.

---

## Test plan

1. User with 50 sessions exports CSV — file downloads with correct headers and row count.
2. User with no sessions exports CSV — returns empty CSV with headers only, no error.
3. JSON export is valid JSON array parseable by `JSON.parse()`.
4. CSV export opens correctly in Numbers/Excel (check for proper quoting of notes with commas).
5. Export includes cardio import sessions with distance/pace columns populated.
6. Auth required: unauthenticated request returns 401.

---

## Notes
- This supplements (does not replace) the GDPR data export at `GET /user/data-export`. The GDPR export is all-data; this is workout-history only, formatted for usability.
- For very large exports (> 10,000 rows) consider streaming the response. Not required at launch but add a `// TODO: stream for large datasets` comment.
