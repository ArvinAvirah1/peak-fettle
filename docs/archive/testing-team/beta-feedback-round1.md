# Peak Fettle — Beta Feedback Round 1
**Testing Phase:** Initial UI / Workout Logging
**Date:** 2026-04-30
**Personas tested:** 6 (Marcus, Priya, Derek, Jasmine, Linda, Tyler)
**Features under review:** Workout logging flow, weight unit display, effort notation (RPE), exercise library, session transitions, workout storage, percentile rankings

---

> **Format per persona:** First impression → What worked → What was confusing or annoying → Specific friction points → Feature requests → Likelihood to recommend (1–10)

---

## MARCUS WEBB — Competitive Powerlifter, Advanced

**First impression:**
"Looks cleaner than Strong. Let's see if it actually handles serious lifting or if it's another app built for people who do 3×10 on machines."

**What worked:**
- Set logging is fast — adding sets with weight, reps, and a notes field is intuitive
- Progress graphs are good — E1RM trend line is exactly what he wants
- Percentile rankings tab: appreciates the cohort-matching concept (age/weight class/sex) — this is more honest than most apps

**What was confusing or annoying:**

🔴 **No kg/lbs toggle — critical.**
"I opened the app, started logging my squat, typed 200 — and it showed 200 lbs. I train in kg. My entire training history is in kg. My competition maxes are in kg. There is no way to switch this. This is a dealbreaker. I'm not doing mental math every session to convert my percentages." *[logged as 440 lbs instead of 200 kg — entire session data is wrong]*

🟡 **RPE field is present but the label says "RPE" with no context.**
"I actually use RIR now, not RPE. They're related but not the same — RPE 8 = 2 RIR, but it doesn't work cleanly across the full range. A lot of the powerlifting community has shifted to RIR. If you're going to have one, RIR is the more intuitive one for most users. RPE requires you to know your max. RIR is just 'how many reps did you have left.' Even if you keep RPE, give users a toggle."

🟡 **No auto-detected PR badges.**
"I set a 5-rep PR on pause squats today. The app logged it fine. Zero acknowledgment. Strong gives you a badge. This is a small thing but it's motivating."

🟡 **Exercise search — search is case-sensitive or inconsistent.**
"Searched 'rdl' — no results. Searched 'Romanian' — found it. Searched 'deadlift' — found 6 variations. This needs to handle abbreviations and common names."

**Feature requests:**
- Global kg/lbs setting in user profile, applied to all inputs and displays
- RIR as an alternative effort notation option (or replace RPE entirely with RIR, add tooltip)
- Auto-PR detection with a subtle visual badge on the set or session summary
- Fuzzy search / abbreviation handling in exercise library (RDL, OHP, DB = dumbbell, etc.)

**Likelihood to recommend:** 4/10
"Has bones of a good app. The kg thing alone makes it unusable for me today. Fix that and I'd actually use this."

---

## PRIYA NAIR — Hypertrophy / Physique Competitor, Intermediate

**First impression:**
"The home screen looks nice. It feels more premium than Hevy. I like the graphs being upfront. Let me try logging my pull day."

**What worked:**
- Exercise library is broad — found all her isolation movements (cable rows, lat pulldowns, face pulls)
- Progress graphs per exercise look clean and readable
- The streak widget on home screen — she likes checking it
- Session summary screen has good information density without feeling overwhelming

**What was confusing or annoying:**

🔴 **RPE field — she had no idea what it meant.**
"I got to the set log and there's a field that says 'RPE.' I had to Google it. On rate of perceived exertion — a scale from 1–10 where 10 is max effort. OK, fine, but why not say '10 = max effort, left in tank = 0?' The number by itself means nothing to me. I put 7 because I thought that seemed right. I honestly would prefer something that says 'how many reps did you have left?' — RIR, basically. That's a language I already think in at the gym."

🟡 **No weekly volume tracker per muscle group.**
"I track weekly sets per muscle. Right now I'd have to add up my pull sessions manually. This is a major gap for anyone doing hypertrophy-focused training. Even a simple 'sets logged per muscle group this week' widget would change how I use this app."

🟡 **Exercise substitution flow is missing.**
"I wanted to swap cable flyes for pec deck today. I couldn't do that within a plan — I had to delete the exercise and re-add a different one. That deleted my previous data for that slot. Need a 'swap exercise' option that preserves history."

🟡 **Workout stored under session date, not as a reusable template.**
"After I finished my Push A day, I wanted to save it as a template so next time I just open 'Push A' and go. Couldn't figure out how to do this. I had to rebuild the workout from scratch next session."

🟡 **UI transitions on the exercise detail page feel laggy.**
"When I tap into an exercise to see its graph, there's a noticeable pause before the animation starts. Doesn't feel smooth. Small thing but on a premium-looking app, it breaks the feel."

**Feature requests:**
- Weekly volume summary by muscle group (sets, reps, tonnage)
- "Swap exercise" function that doesn't delete prior history
- Save session as named template / routine
- RPE → RIR toggle or label change to "Reps in Reserve (RIR)" with a one-line explanation
- Faster/smoother transitions into exercise detail views

**Likelihood to recommend:** 6/10
"Genuinely like the design direction. The RPE thing is confusing but fixable. The volume tracker gap is the bigger miss for me."

---

## DEREK OKAFOR — General Fitness / Recreational, Beginner-Intermediate

**First impression:**
"OK this looks less intimidating than some of the apps I've tried. Let me see if I can figure out how to log my workout without reading a manual."

**What worked:**
- The onboarding flow got him into a workout fast — he appreciated not having to configure 20 things
- Streak counter on the home screen: "I love this. This is the main reason I'd use the app. I'm at 6 weeks. I don't want to break it."
- Templates for Upper/Lower — he found the static template and used it without friction
- Exercise names are familiar ("Bench Press," "Barbell Row," not clinical jargon)

**What was confusing or annoying:**

🟡 **RPE field — completely opaque.**
"There was a box that said RPE next to my set. I didn't know what that was. I left it blank. Is that bad? Did I break something? I'm not a numbers person with my training. If you need me to fill this in, tell me what it means in plain English. Something like 'how hard was that set? (1 = easy, 10 = couldn't do one more rep)' would work. Or just don't make it required — I'd skip it."

🟡 **Weight defaulted to lbs, but no clear indication of the unit.**
"I typed 135. The app logged it. Is that 135 lbs or 135 kg? I had to look twice to see the tiny 'lbs' label. Make that bigger or more obvious — especially during setup, ask me which unit I use."

🟡 **Percentile rankings were discouraging for some lifts.**
"I looked at my deadlift ranking. I'm in the 22nd percentile. I know logically I'm a beginner but seeing that number made me feel bad. Could there be a way to show me my progress vs. where I was, not just where I am vs. everyone? Or maybe show the beginner cohort separately?"

🟡 **Couldn't find where to save his upper/lower routine as a saved workout.**
"I built my upper day, finished the session, great. Next upper day — I had to start from scratch. I looked everywhere for 'my saved workouts' or 'routines.' Either I missed it or it's not obvious where this lives."

**Feature requests:**
- Tooltip or inline explanation for RPE, or option to log effort in plain language
- Make the weight unit label more prominent, and confirm preferred unit during onboarding
- "Progress vs. self" view alongside percentile ranking (your deadlift 3 months ago vs. now)
- Clear "save as routine" flow that's easy to find and navigate back to

**Likelihood to recommend:** 7/10
"It's the best I've tried. I'd tell my gym buddy to try it. The RPE thing is confusing but not a dealbreaker if I can just skip it."

---

## JASMINE COLE — Athletic Performance, Intermediate

**First impression:**
"It opens fast, which is good. Home screen is clean. Let me try logging today — it was squats, RDLs, then sprint intervals at the end."

**What worked:**
- Session starts quickly — she was logging her first set within 30 seconds of opening
- Timer / rest timer feature: if present, she loved it — athletes rely on rest timing
- The percentile ranking motivated her instantly — "43rd percentile on squat — I'll fix that"
- Session summary screen is shareable-looking — she could screenshot and send to coach

**What was confusing or annoying:**

🔴 **Cannot mix lifting and cardio within the same session.**
"I do squats, RDLs, pause squats — then I go outside and do 4×40m sprints. These are the same training session. I can't log them together. I had to create two separate sessions for one workout. My coach wants to see the full session. This is a fundamental gap for any athlete or anyone doing hybrid training."

🟡 **Transitions are noticeably choppy on Android.**
"Going from the exercise list into a specific exercise, and going back — the animation stutters. On iPhone it was smoother but on my Android it felt like it was loading. This matters to me. An app that feels laggy feels untrustworthy."

🟡 **RPE scale felt arbitrary without anchoring.**
"I know RPE from my coach but honestly even I get confused — is RPE 8 the same as 8/10 max effort, or is it based on e1RM percentage? The field just says 'RPE' with no anchor. I always second-guess. RIR is simpler — 'I had 2 reps left.' That's just a fact, not a judgment."

🟡 **No session timer visible during logging.**
"I like knowing how long my session has been running. It's there somewhere but not visible while I'm in the logging screen. I had to go back to the home screen to check. Should be a persistent element."

🟡 **Exercise search doesn't handle abbreviations.**
"I searched 'RDL' — nothing. Searched 'Romanian Deadlift' — found it. Searched 'hang clean' — found it. Search works for full names but not abbreviations or gym slang. Every lifter knows RDL, OHP, DB bench. These should map."

**Feature requests:**
- Mixed session type (lifting + cardio in same session, with different logging fields per block)
- Persistent session timer visible during active logging
- RPE anchor tooltip ("RPE 10 = couldn't do another rep") or switch to RIR labeling
- Abbreviation + common-name synonyms in exercise search
- Smoother transitions, especially on Android

**Likelihood to recommend:** 6/10
"For a pure lifter this could be great. For athletes or anyone who does more than lifting, the mixed session gap is a real problem. Fix that and the Android jank and I'd be all in."

---

## LINDA MARSH — Returning Beginner, 54F

**First impression:**
"OK it looks modern. Not sure where to start. I'll try to figure it out on my own before asking for help."
*(She spent 4 minutes on the home screen before finding how to start a new session.)*

**What worked:**
- Streak system: "This is really motivating for me. I've kept a 5-week streak. I was worried it would be broken if I missed a day but it gave me a grace period. That was kind."
- The graph showing her progress on dumbbell Romanian deadlifts over 8 weeks: "I didn't know I'd improved that much. Seeing it on a graph made me actually emotional."
- Exercise names are plain and recognizable

**What was confusing or annoying:**

🔴 **No clear entry point to start a workout — home screen navigation unclear.**
"I couldn't immediately find how to log a workout. There was a button but it wasn't obvious it was the starting point. I eventually found it but I shouldn't have to look. 'Start Workout' should be the biggest, most obvious thing on the home screen for a new user."

🟡 **RPE — she had no idea and it made her anxious.**
"I saw a box that said 'RPE' and I thought I was supposed to fill it in for every set. I didn't know what it was. I felt like I was doing the app wrong. When I Googled it, the explanation was full of jargon. Can this either be optional with a clear label that says 'optional' or have a friendly tooltip like 'How hard was that set? Skip if you're not sure.'"

🟡 **No visible lbs/kg label during entry.**
"I typed in my weights and I wasn't sure if it was in pounds or kilograms. I use pounds. I assumed it was pounds but I wasn't sure. There should be a unit label right next to the input field."

🟡 **Saving and returning to a routine is very unclear.**
"I built my dumbbell routine — 5 exercises. The session ended. The next time I opened the app, I couldn't find it. I thought I'd lost it. Eventually I found it buried in session history. But I want a 'My Routines' section where I can just tap my saved workout and go. I do the same workout every Monday and Thursday."

🟡 **Percentile rankings opted her out but she found the language intimidating.**
"The ranking system — the opt-out works, which I used. But even the opt-out screen had words like 'percentile cohort' and 'age band stratification.' I'd just say 'compare yourself to others your age' — that's the plain English version."

**Feature requests:**
- Prominent "Start Workout" CTA on home screen
- RPE field: mark as optional, add plain-English tooltip, consider replacing with RIR + friendly label
- Weight unit confirmation during onboarding and persistent label on input fields
- "My Routines" section — saved, named workouts accessible from home screen
- Plain-language copy throughout (especially percentile ranking screens)
- "Progress vs. your past self" view as a gentle alternative to competitive rankings

**Likelihood to recommend:** 5/10
"I want to use it. I really do. But I got confused a few times and I worry I'd give up. If someone walked me through it once, I'd be a loyal user. The streak feature alone is worth it to me."

---

## TYLER BROUSSARD — Hypertrophy Beginner, 19M

**First impression:**
"OK let's go. I need it to look good or I'm not using it." *(Opens app, scrolls quickly.)* "OK it actually looks clean. Let me try it."

**What worked:**
- Home screen aesthetics — immediately passed his first impression test
- Percentile rankings: "I'm 61st percentile on bench press after 6 months? That's actually sick." — highly motivating
- Exercise library covered all his movements
- Progress graph on bench press: "Let's go. I'm going up every month."

**What was confusing or annoying:**

🔴 **Session setup took too long to figure out the first time.**
"First time I opened it, I didn't know if I should start with a template or build from scratch. The options weren't obvious. I spent like 5 minutes figuring it out before I actually got to log a set. I almost gave up. There needs to be a 'first time? Start here' flow that takes you through your first workout in under 2 minutes."

🟡 **RPE field — he skipped it entirely but then wondered if it mattered.**
"There was this RPE box. I had no idea what it was. I left it blank. Then later I saw in the settings something about 'effort tracking' and wondered if I'd been logging wrong the whole time. Just tell me what it is with one sentence — or hide it until I unlock it later. Don't leave a mystery field."

🟡 **Weight is in lbs, that's fine, but no confirmation during setup.**
"I didn't even notice the lbs/kg thing until I read that other users mentioned it. But yeah, if you've ever used any foreign lifting content — a lot of YouTube lifters use kg — you might get confused. Just ask at the start."

🟡 **No workout templates section I could find easily.**
"I wanted to set up my chest day as a template so next Monday I just hit one button and start logging. Couldn't find how to do this. Had to redo it from scratch. If I have to rebuild my workout every session I'm gone."

🟡 **'Start Workout' button is not big enough / obvious enough.**
"It took me a few taps to find where to start a new workout. Should be right there — big green button, can't miss it."

**Feature requests:**
- Guided first-session onboarding flow (2-minute setup wizard for first workout)
- RPE field: add one-sentence explanation inline or option to hide it entirely
- Prominent "My Routines" / saved templates accessible from home screen
- Large, obvious "Start Workout" button on home screen
- Weight unit selector during onboarding

**Likelihood to recommend:** 7/10
"If the first-time setup was smoother I'd rate it higher. The rankings thing is actually fire — that's what's going to keep me coming back. Just gotta fix the confusing parts up front."
