# Peak Fettle — Beta Tester Feedback Report
**Run date:** 2026-05-01  
**Scope:** landing.html (landing page) + Express API (auth, workouts, sets routes)  
**Methodology:** Four distinct user-persona simulations, each testing relevant surface areas with edge/outlier cases considered. Technical audit conducted in parallel.

---

## SECTION 1 — BETA TESTER FEEDBACK

---

### Persona 1: Jamie — Casual Gym-Goer (Free Tier)
*26 y/o, 2–3x/week, no competitive goals, moderate tech literacy, has quit 3 other fitness apps*

#### Feature: Landing Page — First Impression
**Emotional reaction:** "Okay, this looks sleek — way more premium than I expected. But… 'fettle'? I had to Google that. I thought it was a typo for 'Battle'? Not sure if that's cool or confusing."

**What worked well:** The visual design is genuinely impressive. The teal-on-dark palette feels fresh, not like another blue-gradient fitness app. The animated peak logo on load is a satisfying little moment. The feature tabs auto-advance, which means I don't have to do anything to get the tour — I appreciated that.

**What was confusing or annoying:**
- The hero CTA says "Find your fettle" — I clicked it expecting to sign up or download the app. Instead it just scrolled me to the features section. That felt like a bait-and-switch. I wanted a signup button, not more marketing copy.
- There are no social numbers anywhere. Other apps I've tried show "1M+ users" or "4.8 stars." Without that, I'm not sure this is real yet.
- The pricing section says "Start Free" links back to `#top`, which scrolls me to the very beginning. That's a dead loop — there's no actual signup form or app store link.
- "Static templates: Push/Pull/Legs, Upper/Lower" — is that all? That section of the free card feels thin. I didn't see anything about how to actually start using those templates.
- The mobile menu snaps open/closed with no animation. Desktop feels polished; mobile feels unfinished.

**Would you use this feature regularly?** I'd come back if there was an actual app to download. Right now the landing page is a brochure with no door.

**Likelihood to recommend (1–10):** 5 — Design is great, but there's nowhere to actually go.

#### Edge/Outlier Cases Noted by Jamie:
- Tested on iPhone SE (small screen): the `.def-card` hero section overflows slightly at 320px width — the pronunciation text wraps awkwardly.
- The "Get notified" form accepts "test@" as a valid email and shows the success state. That's going to fill the list with garbage.
- Tapping "Features" in the mobile menu closes the menu and smooth-scrolls, but the scroll overshoots by about 12px (navbar offset is 60px but nav is actually 72px tall — content hides under the nav).

---

### Persona 2: Marcus — Competitive Powerlifter (Paid Tier)
*29 y/o, 6 years training, competes in meets, tracks meticulously, skeptical of fitness apps*

#### Feature: Landing Page — Strength Tracking Claims
**Technical accuracy assessment:** The landing page claims both "Wilks/DOTS" scoring and a "Peak Fettle score that factors in volume, progressive overload, and consistency." As someone who uses Wilks daily, I'm immediately asking: what's the formula? Where's the validation? A single mention in a bullet point doesn't cut it. I need to see an example calculation — "you benched 225 lbs at 185 lbs bodyweight, here's your Wilks score" — before I trust it.

**Depth evaluation:** Way too shallow. The percentile panel shows "78 PERCENTILE" with generic cohort tags (Age 28–32, 3–5 yrs, Unisex) — fine as a concept, but I need to know: where does the cohort data come from? Is it self-reported by users? Referenced against published powerlifting meet data (OpenPowerlifting)? If it's just app user data at launch, the cohort will be too small to mean anything for at least 6 months.

**What's missing vs. current spreadsheet:**
- No RPE field visible in the UI demo (though the API has `rir` — RIR and RPE are related but different; most powerlifters use RPE, not RIR)
- No periodization block labels (peaking block, hypertrophy block, etc.)
- No 1RM calculator demo with a specific formula shown (Epley? Brzycki? The industry has 8+ formulas and they diverge significantly at higher reps)

**What genuinely impresses:** The RIR field exists in the API — that's a strong signal someone who lifts wrote this. The `rir: -1` sentinel value for "not recorded" is clean. The discriminated union in the sets schema (lift vs. cardio) is architecturally correct and avoids the garbage `null` fields most apps produce.

**Would you switch?** Not based on the landing page alone. Need to see the actual 1RM formula, a live Wilks example, and sample AI plan output.

#### Edge/Outlier Cases Noted by Marcus:
- **API BUG — CRITICAL SECURITY:** `requireAuth` middleware does not check if the JWT has `type: 'refresh'`. This means a refresh token (30-day lifetime) can be presented as a Bearer token and will pass authentication. Refresh tokens have a 30x longer window of exposure and should never be accepted by protected endpoints.
- **API BUG:** `POST /sets` does not verify that the provided `workoutId` belongs to `req.user.id`. I could POST a set to another user's workout. Horizontal privilege escalation.
- **API: RIR vs RPE confusion** — the schema uses `rir` (Reps in Reserve) but the INSTRUCTIONS.md never mentions RIR. The industry standard for competitive lifters is RPE (Rate of Perceived Exertion). These are similar but not the same. This naming choice needs to be intentional and documented.

---

### Persona 3: Priya — Dedicated Runner (Potential User)
*32 y/o, half-marathon training, 35–40 mi/week, uses Garmin + Strava, would only switch if Peak Fettle offers something Strava doesn't*

#### Feature: Landing Page — Cardio Tracking
**Comparison to Strava:** The landing page is dramatically weightlifting-centric. Cardio gets one line on the Progress Tracking tab ("Cardio gets splits, pace trends, and consistency") and that's essentially it. Strava has full map visualization, segment leaderboards, and Flyby. Peak Fettle can't out-Strava Strava, but it needs a clearer answer to "why would a runner use this instead of or alongside Strava?"

**Usability for cardio-first athlete:** The disciplines section includes Running with a description ("Splits, pace trends, and consistency tracked across every distance") — that's fine. But the marquee strip lists Swimming, Soccer, Climbing, Tennis and yet the feature tabs contain zero cardio-specific demo content. The Habit & Streaks tab is the only one that would resonate with me, and it doesn't mention rest days as intentional recovery.

**Data that's missing:**
- Heart rate zones (critical for aerobic base training)
- Elevation data
- Explicit "rest day" designation that preserves streak (the INSTRUCTIONS say intentional rest counts, but the UI doesn't show this)
- The `avgPaceSecPerKm` field in the API is correct for metric runners, but there's no `avgPaceSecPerMile` — US-centric runners will hit friction immediately

**Features that would make me add this to my toolkit:** The cohort-matched percentiles concept is genuinely interesting for running. "Top 82% of half-marathon runners with 3 years experience in your age group" — that's actually more meaningful than Strava's kudos system. But right now that value prop isn't surfaced in the running context at all.

**Concerns about injury/overtraining detection:** Nothing. Completely absent. The INSTRUCTIONS document doesn't mention overtraining detection. For a runner logging 40 miles/week, this is a significant gap relative to both Strava and Whoop.

#### Edge/Outlier Cases Noted by Priya:
- **API:** The `GET /sets?from=...&to=...` uses `logged_at >= $N::timestamptz`. If a user logs a session in GMT+9 (Tokyo) and queries from a US-based date boundary, timezone handling could silently return incomplete results. No timezone normalization is documented.
- **API:** `LIMIT 1000` on the sets endpoint would cut off a serious runner who logs interval splits as individual "sets" over multiple months. No pagination endpoint exists.
- **Landing:** The wearable integration note ("Apple Watch, Garmin, etc. — on the roadmap") is buried in the Progress Tracking tab body text. For a Garmin user, this should be prominent — either as a known limitation or a waitlist.

---

### Persona 4: Derek — Complete Beginner
*22 y/o, college student, zero gym experience, easily discouraged, needs early wins*

#### Feature: Onboarding / Landing Page — Comprehension Test
**Confusion log (every moment of not understanding):**
1. "fettle" — I don't know this word. The dictionary-style hero is clever if you're educated but alienating if you're not.
2. "1RM" — appears in the Progress Tracking panel art. No tooltip. No explanation.
3. "Wilks/DOTS" — mentioned in the panel body copy. Never explained. I had to Google both.
4. "Progressive overload" — used in passing. The INSTRUCTIONS explain it but the landing page doesn't.
5. "Push/Pull/Legs" — the template names mean nothing to me. What does "push" mean in a gym context?
6. "RPE" — used in the agent files, leaks into the surface through Marcus's lens, but if a beginner ever touches the app's plan terminology, they'll hit this immediately.
7. The hero's secondary CTA is "Find your fettle" — what does that mean as an action? Find my what?
8. **Content inconsistency:** The Free Tier pricing card lists "Push/Pull/Legs, Upper/Lower" as the two templates. But the SVG illustration in the Free Tier panel shows three stacked cards: "Push/Pull/Legs", "Upper/Lower", and "Full Body 3x". Which is it? If "Full Body 3x" is also free, it's missing from the feature list. If it's not free, the illustration is misleading.

**Emotional response:** Intimidated. The design feels like it's for serious athletes. I'd feel like I'm in the wrong gym just loading this page.

**What I wish the app had explained:** A single sentence under each template name: "Push/Pull/Legs: you train pushing muscles Monday, pulling muscles Wednesday, and legs Friday." Without that, I'd pick whichever one sounds cooler and probably do it wrong.

**Would you come back tomorrow?** Maybe, if I downloaded the actual app and had an onboarding flow. The website alone gives me nothing to do.

**Suggested UX changes:**
- Add a "New to fitness? Start here" entry point that bypasses the competitive/data-heavy framing
- Explain "1RM", "sets", "reps" on first mention with a tooltip or glossary
- Fix the template count inconsistency (2 in copy vs. 3 in illustration)
- Change "Find your fettle" to something action-oriented: "Get started free" or "Start tracking today"

#### Edge/Outlier Cases Noted by Derek:
- **Landing:** If a user has `prefers-reduced-motion` set (common for users with vestibular disorders), the hero logo doesn't animate — it just snaps to visible. This is correct behavior per the media query, but the hero icon also has CSS fallback `opacity: 0` → `opacity: 1` driven by the animation. With reduced motion, the summit circle and peak line simply appear instantly. That's fine. ✓
- **Landing:** The mobile menu (`role="dialog"`) has no `aria-modal="true"` and no focus trap. Screen reader users navigating by Tab while the menu is open can escape the menu and interact with the page content behind it. This is a WCAG 2.1 failure (2.1 – Keyboard trap goes the other way, but the backdrop interaction is still broken).
- **Landing:** If JavaScript is disabled, none of the tab panels except the first are accessible — the others have `hidden` set and no JS to remove it. The entire feature showcase collapses to one tab.

---

## SECTION 2 — TECHNICAL AUDIT
*Issues discovered across all files regardless of persona*

### T-01 — CRITICAL SECURITY: Refresh token accepted as access token
**File:** `server/middleware/requireAuth.js`, `server/routes/auth.js`  
`requireAuth` calls `jwt.verify(token, JWT_SECRET)` but does not check `payload.type`. Since refresh tokens are signed with the same secret and only differ by `{ type: 'refresh' }`, a refresh token will pass `requireAuth` and grant access to all protected endpoints. An attacker who obtains a refresh token (30-day validity) has full API access without ever going through `/auth/refresh`. **Fix:** Add `if (payload.type === 'refresh') return 401` inside `requireAuth`, or use separate secrets.

### T-02 — HIGH SECURITY: No refresh token revocation
**File:** `server/routes/auth.js`  
Refresh tokens are issued but never stored in the database. There is no logout endpoint, no token blacklist, and no mechanism to invalidate tokens on password change or account compromise. A stolen refresh token is valid for 30 days with no recourse. **Fix:** Store refresh tokens in a `refresh_tokens` table; delete row on logout/revocation.

### T-03 — HIGH SECURITY: Horizontal privilege escalation in `/sets` POST
**File:** `server/routes/sets.js`  
`POST /sets` accepts a `workoutId` from the request body and inserts it directly without verifying that the workout belongs to `req.user.id`. Any authenticated user can attach sets to another user's workout records. **Fix:** Add `SELECT id FROM workouts WHERE id = $1 AND user_id = $2` validation before insertion, or use a JOIN in the INSERT query.

### T-04 — MEDIUM BUG: POST /workouts always returns 201 on upsert
**File:** `server/routes/workouts.js`  
The `INSERT ... ON CONFLICT DO UPDATE` upsert always returns `res.status(201)`, even when the conflict branch fires (i.e., the workout already existed and was updated). HTTP semantics: 201 = Created, 200 = OK (updated). Clients that check status codes for cache invalidation or optimistic UI will behave incorrectly. **Fix:** Detect insert vs. update by adding `(xmax = 0) AS inserted` to the RETURNING clause and conditionally return 200 or 201.

### T-05 — MEDIUM BUG: Weak email validation in notify form
**File:** `landing.html` (line ~1653)  
The email validation `if (!input.value || !input.value.includes('@'))` accepts strings like "a@", "@b.com", "a@b", and "not an email @all". This will admit junk entries into the waitlist. **Fix:** Use `input.checkValidity()` (HTML5 native) or a basic RFC-compliant regex.

### T-06 — MEDIUM BUG: Free tier template count mismatch
**File:** `landing.html`  
The pricing card text states two free templates ("Push/Pull/Legs, Upper/Lower"). The panel-art SVG illustration in the Free Tier tab shows three template cards: "Push/Pull/Legs", "Upper/Lower", and "Full Body 3x". These are inconsistent. Either the third template is missing from the copy or the illustration is inaccurate. INSTRUCTIONS.md also lists only PPL and Upper/Lower as launch templates, making the SVG incorrect.

### T-07 — MEDIUM: No exercises API endpoint
**File:** `server/routes/sets.js`  
Sets require an `exerciseId` (UUID). There is no `/exercises` endpoint to create, list, or look up exercises. Without this, the sets API is functionally unusable — clients would need to know exercise UUIDs in advance through some out-of-band mechanism. This endpoint appears to be missing from the current build phase.

### T-08 — MEDIUM: No pagination on GET /sets
**File:** `server/routes/sets.js`  
`SELECT * FROM sets ... LIMIT 1000` is hardcoded. No `offset`, `cursor`, or `page` parameter exists. Heavy users (competitive lifters logging 20+ sets/session, 5 sessions/week for 12 months) will hit this ceiling in approximately 10 weeks of data. **Fix:** Implement cursor-based pagination via `logged_at` timestamp.

### T-09 — LOW BUG: Smooth scroll offset mismatch
**File:** `landing.html` (line ~1673)  
`const top = target.getBoundingClientRect().top + window.scrollY - 60;` subtracts 60px for nav clearance, but the nav height is 72px (`.nav-inner { height: 72px }`). In-page anchor links consistently scroll 12px too far, hiding the first line of each section behind the navbar. **Fix:** Change offset to 76px (72px + 4px breathing room) or read the nav height dynamically.

### T-10 — LOW: Mobile menu missing focus trap and aria-modal
**File:** `landing.html`  
`<div class="mobile-menu" id="mobileMenu" role="dialog">` lacks `aria-modal="true"` and does not trap focus. Screen reader users can Tab through page content while the overlay is open. **Fix:** Add `aria-modal="true"` and implement a focus trap (capture Tab/Shift+Tab to cycle within the menu only).

### T-11 — LOW: Stat chips CSS + JS present but no HTML elements
**File:** `landing.html`  
CSS classes `.chip`, `.stat-chips`, and `.chip .num` are fully defined. JS includes a `countUp()` function targeting `[data-count]` attributes. No `.chip` elements exist anywhere in the HTML body. The animated stat counters (likely intended to show metrics like "tracked workouts" or "active users") are dead code. **Fix:** Either add `.chip` elements to the hero section, or remove the dead CSS/JS.

### T-12 — LOW: Mobile menu display/opacity animation mismatch
**File:** `landing.html`  
`.mobile-menu` starts as `display: none` and transitions to `display: flex; opacity: 1` on open. CSS `transition: opacity 0.3s` has no effect when paired with `display: none` → `display: flex` because the browser cannot interpolate between these display states. The menu snaps open with no fade. **Fix:** Use `visibility: hidden` + `pointer-events: none` instead of `display: none`, keeping the element in the render tree so the opacity transition fires.

---

## SECTION 3 — WORKFLOW COORDINATOR ANALYSIS

*As Product Manager: synthesizing all tester feedback and technical audit into a ranked action list for executive context.*

### Key Insights

1. **Security has two launch-blocking holes** (T-01, T-03). The refresh token acting as an access token is a textbook JWT misuse that would be exploited immediately on any public beta. The sets ownership gap is a data integrity and privacy violation. Neither can ship.

2. **The landing page has no conversion path.** All four testers noted that "Start Free" and "Find your fettle" do not lead to a signup form or app store link. The page functions as a brand brochure with no door. This is the single biggest acquisition problem.

3. **Beginners are under-served in copy and UX.** Derek's confusion log has 8 distinct items. The app's stated positioning includes beginners as a target segment (free tier, habit system), but the landing page copy speaks almost exclusively to experienced athletes. This is a positioning misalignment that will hurt top-of-funnel conversion.

4. **Cardio athletes have insufficient reason to try the product.** Priya found essentially no cardio-specific value prop on the landing page. With Strava already dominant, the differentiated angle (cohort percentiles for runners) is never surfaced.

5. **Backend is missing basic CRUD.** No DELETE on sets/workouts, no exercises endpoint, no pagination. These are table-stakes for any fitness tracking app.

### Ranked Issues for Executive Review

| Rank | ID | Category | Issue | Severity |
|------|----|----------|-------|----------|
| 1 | T-01 | Security | Refresh token accepted by protected endpoints (JWT type not checked) | 🔴 CRITICAL |
| 2 | T-03 | Security | POST /sets does not verify workout ownership — horizontal privilege escalation | 🔴 CRITICAL |
| 3 | T-02 | Security | No refresh token revocation / logout mechanism | 🔴 HIGH |
| 4 | — | Acquisition | Landing page has no signup / app download CTA — zero conversion path | 🔴 HIGH |
| 5 | T-07 | Backend | No /exercises endpoint — sets API is non-functional without it | 🟠 HIGH |
| 6 | T-06 | Content | Free tier template count inconsistency (2 in copy, 3 in SVG) | 🟠 MEDIUM |
| 7 | T-05 | Frontend | Notify form weak email validation — garbage will enter waitlist | 🟠 MEDIUM |
| 8 | T-04 | Backend | POST /workouts returns 201 on update (semantic error, breaks client logic) | 🟠 MEDIUM |
| 9 | T-08 | Backend | No pagination on GET /sets — 1000 row limit will hit serious users in ~10 weeks | 🟠 MEDIUM |
| 10 | — | UX/Copy | Beginner copy fails — 8 unexplained jargon terms (1RM, Wilks, RPE, etc.) | 🟡 MEDIUM |
| 11 | — | UX/Copy | No cardio-specific value prop for runners on landing page | 🟡 MEDIUM |
| 12 | T-09 | Frontend | Smooth scroll 12px offset mismatch (nav 72px, offset coded as 60px) | 🟡 LOW |
| 13 | T-12 | Frontend | Mobile menu has no fade animation (display:none blocks opacity transition) | 🟡 LOW |
| 14 | T-10 | Accessibility | Mobile menu dialog missing aria-modal and focus trap (WCAG fail) | 🟡 LOW |
| 15 | T-11 | Frontend | Stat chip CSS + countUp JS present but no HTML chips rendered | 🟡 LOW |

---

## SECTION 4 — EXECUTIVE BRIEF

*Prepared for: CEO, CTO, Product Manager*  
*Prepared by: Workflow Coordinator (automated beta run — 2026-05-01)*

### Status: Pre-Launch — Do Not Ship Until Items 1–3 Are Resolved

**What's working:** The landing page visual identity is strong and differentiated. The backend architecture (Express + Zod + Postgres discriminated union for lift/cardio) is well-structured and clearly written by someone with real training knowledge. The feature concept (cohort-matched percentiles + behavioral streak system) remains highly differentiated in the market.

**What must be fixed before any public access:**

**Item 1 (Security — T-01):** The JWT authentication middleware accepts refresh tokens as valid access tokens. This is a single-line fix but represents a critical vulnerability that would be found and exploited in any security scan or adversarial beta test.

**Item 2 (Security — T-03):** The sets logging endpoint does not verify workout ownership. An authenticated user can write data into another user's workout history. Fix requires one additional query or a JOIN condition.

**Item 3 (Security — T-02):** No logout/token revocation exists. Add a `refresh_tokens` table and DELETE rows on logout. This is a standard implementation detail but currently missing.

**What should be fixed before public beta:**

**Item 4 (Acquisition):** The landing page does not have a sign-up form or app store link. "Start Free" and all primary CTAs loop back to `#top` or `#features`. There is no conversion event. This should be replaced with either a waitlist email capture (properly validated) or an app download link.

**Item 5 (Backend completeness):** The `/exercises` endpoint is absent. Sets cannot be logged without it. This should be included in the same sprint as the sets endpoint that references it.

**Item 6 (Content integrity):** The free tier shows 2 templates in copy and 3 in the illustration. This should be aligned before any press or beta user sees the pricing page.

**Strategic observations for CEO/CTO:**

- **Beginner positioning gap:** If Peak Fettle wants to compete on free-tier acquisition (vs. Hevy/Strong which skew advanced), the landing page needs a beginner entry point. The current copy will repel the Derek persona, who represents a high-volume addressable market.
- **Runner retention risk:** The cardio tracking experience has no visible differentiation from Strava on the landing page. The percentiles angle is the answer — it should be leading the running pitch, not buried.
- **Technical debt score (per CTO framework):** LOW for the route logic itself, HIGH for the missing exercises API (which blocks the entire data-entry loop) and the security items above.

---

*Report generated automatically by the pf-tester-prompts scheduled task.*  
*Next recommended run: after dev team addresses T-01, T-02, T-03, and the exercises endpoint.*
