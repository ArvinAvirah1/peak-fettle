# Beta Tester Context Slice
**For:** beta-casual-gymgoer, beta-competitive-lifter, beta-runner, beta-beginner
**Rule:** Read only this file. You are a user, not a developer. You do not need the tech stack, marketing strategy, or cost documents.

---

## What Peak Fettle Offers Users

### Free Tier (Everyone)
- **Workout logging** — sets, reps, weight for lifting; pace/splits for cardio. Manual entry or session logger.
- **Progress graphs** — visual trends over time for any tracked lift or cardio metric.
- **Competitive percentile rankings** — opt-in. Shows where you rank vs. users of the same age, gender, experience level, and weight class. Refreshed weekly.
- **Static training templates** — Push/Pull/Legs, Upper/Lower splits. Not AI-generated but well-structured and immediately usable.

### Paid Tier
- **AI-generated personalized plans** — built from a survey covering: goals, fitness level, injury history, equipment, session length, weekly availability, exercise preferences.
- **Adaptive programming** — plan updates based on your logged performance over time.
- **User-modifiable plans** — swap exercises, adjust volume, reschedule days at any time.
- **Body composition goals** — AI guides users toward sustainable targets; user has final say.

### Streak System
- Tracks workout consistency. Any session — even 5 minutes — counts.
- Missed session? You have a make-up window within the same week.
- Genuine emergency (illness, travel, exams)? Manual override preserves streak.
- Streak only resets if you miss 2 sessions in a week with no make-up and no override.

---

## Percentile System Details

- Cohort-matched: you are only compared to people with similar age, gender, experience level, and weight class.
- Beginners are never ranked against veterans. Early feedback stays encouraging.
- Opt-out available for a unisex scale.
- Rankings update weekly (not real-time).

---

## Competitive Landscape You'd Know About as a User

Apps you may have used or heard of: MyFitnessPal, Strava, Hevy, Strong, Whoop, Garmin Connect. Peak Fettle's differentiators are the cohort-matched percentiles and the AI plan adaptation — features none of those apps fully combine.

---

## Testing Team — Round 1 Personas (2026-04-30)

Six mock clients defined in `testing-team/personas.md`. Full feedback in `testing-team/beta-feedback-round1.md`. Consolidated dev tickets in `testing-team/dev-tickets-round1.md`.

| Persona | Sex | Age | Goal | Experience | Units |
|---|---|---|---|---|---|
| Marcus Webb | M | 28 | Powerlifting | Advanced | kg |
| Priya Nair | F | 26 | Hypertrophy / physique | Intermediate | lbs |
| Derek Okafor | M | 38 | General fitness | Beginner-intermediate | lbs |
| Jasmine Cole | F | 21 | Athletic performance | Intermediate | lbs |
| Linda Marsh | F | 54 | Returning beginner | Beginner | lbs |
| Tyler Broussard | M | 19 | Muscle building | Beginner | lbs |

**Top findings from Round 1:**
- RPE is opaque to 5/6 testers — RIR ("reps in reserve") is preferred or more intuitive across all segments
- No kg/lbs toggle — critical data error for kg users; unit label unclear for lbs users
- No saved routine/template system — 4/6 had to rebuild workouts from scratch on session 2
- "Start Workout" CTA not prominent enough — caused navigation confusion for 3 testers
- Android transition performance noticeably worse than iOS

---

## How to Test as Your Persona

For each feature you test, report:
1. First impression (emotional reaction, 1–2 sentences)
2. What worked well
3. What was confusing or annoying
4. Would you use this feature regularly? Why or why not?
5. Likelihood to recommend to a friend (1–10) and why

Be honest. Notice friction (too many taps, confusing labels, overwhelming data). Notice delight (something that made you want to come back). Flag features you'd ignore entirely.
