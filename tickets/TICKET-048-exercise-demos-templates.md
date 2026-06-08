# TICKET-048 — Exercise Demonstrations for Free Templates
**Owner:** dev-backend + dev-frontend
**Date opened:** 2026-05-22
**Phase:** 2 (Post-launch polish — first 60 days)
**Source:** DEV_NEXT_STEPS_2026-05-11.md Step 17; ROADMAP.md §2.2, §2.5

---

## Goal

Add video demo links and safety notes to the top 30 most-logged exercises. Displayed in the exercise detail view as a "Watch Demo" button. High-risk movements (squat, deadlift, overhead press) also show a prominent safety note. Closes the Derek-persona gap in free templates.

---

## Acceptance criteria

1. `exercises` table has `demo_url TEXT` (nullable) and `safety_note TEXT` (nullable).
2. `GET /exercises` and `GET /exercises/:id` include `demo_url` and `safety_note`.
3. The top 30 most-logged exercises have `demo_url` seeded with YouTube links (curated to form-focused, no-fluff videos — no ad-heavy channels).
4. High-risk exercises (barbell back squat, deadlift, Romanian deadlift, overhead press, bench press) have a `safety_note` displayed prominently.
5. In the exercise detail / template exercise view, show a "Watch Demo" button when `demo_url` is present. It opens the URL in the in-app browser (`Linking.openURL`).
6. Safety note is displayed in a yellow/warning-colored card above the demo button for flagged exercises.
7. Free-tier users can access demos — no paywall gate.

---

## Implementation plan

### Migration
Create `migrations/20260522_exercise_demos.sql`:
```sql
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS demo_url TEXT;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS safety_note TEXT;
```

### Seed data
Create `migrations/20260522_exercise_demos_seed.sql` with UPDATE statements for the top 30 exercises.

Safety notes (at minimum):
- Barbell Back Squat: "Keep your chest up and knees tracking over your toes. Do not round your lower back. Start light and build depth gradually."
- Deadlift: "Neutral spine is non-negotiable. Engage your lats before breaking the floor. Never jerk the bar off the ground."
- Overhead Press: "Brace your core and squeeze your glutes to protect your lower back. Keep the bar path vertical — no forward lean."
- Bench Press: "Maintain a slight arch and keep your feet flat. Unrack with a spotter or use safety pins. Touch your chest, don't bounce."
- Romanian Deadlift: "Keep the bar close to your legs and stop when you feel a hamstring stretch — do not round the lower back to reach the floor."

### Backend
- `routes/exercises.js` — include `demo_url` and `safety_note` in SELECT/RETURNING clauses for GET /exercises and GET /exercises/:id.

### Mobile
- Exercise detail component (wherever exercises are shown in templates/plans) — add:
  ```tsx
  {exercise.demo_url && (
    <PFButton label="Watch Demo" onPress={() => Linking.openURL(exercise.demo_url!)} variant="secondary" />
  )}
  {exercise.safety_note && (
    <View style={safetyNoteStyle}>
      <Ionicons name="warning-outline" />
      <Text>{exercise.safety_note}</Text>
    </View>
  )}
  ```

---

## Test plan

1. Deadlift exercise detail shows safety note card and "Watch Demo" button.
2. Tapping "Watch Demo" opens the YouTube link in the browser.
3. An exercise without a demo URL (e.g., an obscure accessory) shows no button.
4. Free-tier user can access demos.
5. Safety note is visually distinct (warning color) and appears above the demo button.

---

## Notes
- Demo URLs must be checked periodically — YouTube videos can be deleted. Consider noting the video ID in a comment next to each URL so replacements are findable.
- Videos should be form-tutorial focused (e.g., Alan Thrall, Barbell Medicine, Jeff Nippard). No fitness influencer channels with primarily supplement promotion.
- Phase 3 (ROADMAP §3.1) will add animated GIFs from a licensed library. This ticket is the text + YouTube link MVP.
