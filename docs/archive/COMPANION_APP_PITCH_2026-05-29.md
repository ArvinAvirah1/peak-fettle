# Companion Mental-Health App — Pitch & Implementation Map

*Prepared 2026-05-29 for founder review. **This is a proposal. No code, schema, or infra will be built until you approve it** (gated by TICKET-072).*

---

## 1. The pitch in one paragraph
Peak Fettle already helps people train the body and keeps them consistent with streaks and percentiles. The natural extension is a **companion app that trains the mind** — a calm, evidence-informed daily wellbeing tool that helps subscribers manage **screen-time awareness, habits & streaks, mood, and short guided CBT/mindfulness exercises**. It ships as a **standalone app on the shared Peak Fettle backend**, is **included free for existing paid subscribers**, and is positioned as **light, evidence-based wellbeing — explicitly not clinical treatment**. It deepens the brand from "fitness" to "whole-person fettle," and gives paid users a second reason to stay subscribed.

## 2. Why this, why now
- **Retention & value story.** A second app bundled into the existing paid tier raises perceived value and stickiness without a price change (your chosen access model).
- **Brand fit.** "Peak Fettle" already means *being in good condition* — extending from physical to mental wellbeing is on-brand, not a pivot.
- **Reuse, don't rebuild.** Auth, subscriptions, the streak engine concepts, and the (soon-hardened) push pipeline already exist. The companion app is mostly new UI + a new data namespace on a backend we already run.
- **Differentiation.** Most fitness apps stop at the body; pairing training consistency with mood/screen-time/habit support is a credible "whole-person" wedge.

## 3. Positioning & guardrails (decided: light evidence-based)
- **What it is:** habit/mood support and skills drawn from **CBT and mindfulness** (thought reframing, gratitude, breathing, grounding) — the kind of self-help content found in reputable wellbeing apps.
- **What it is NOT:** therapy, diagnosis, or a medical device. No treatment claims. No "we'll fix your depression."
- **Hard safety rules (non-negotiable, baked into every build ticket):**
  - **Always-available crisis resources** — locale-aware, e.g. in the US the **988 Suicide & Crisis Lifeline** (call/text 988); surfaced prominently, never buried, and shown contextually if a user logs severe distress.
  - **A clear disclaimer**: "Peak Fettle Mind is a wellbeing tool, not a substitute for professional care."
  - **No features that could reinforce self-harm or disordered behavior** — no calorie/weight shaming hooks, no "punishment" mechanics, no streak pressure that guilt-trips. Streaks here are gentle and forgiving by design.
  - **No confidentiality promises we can't keep** — we describe how data is handled factually; we don't make absolute privacy or "no one will ever see this" guarantees.

## 4. Working name ideas (pick one in Q-A below)
- **Peak Fettle Mind** (clear sibling brand — recommended)
- **Fettle** (umbrella name; fitness app becomes "Fettle Body", this is "Fettle Mind")
- **Headroom** / **Even Keel** / **Baseline** (standalone-feeling sub-brands)

## 5. Core feature set (v1)

### 5.1 Habit tracking & streaks (forgiving)
- User-defined habits (meditate, journal, walk, no-phone-in-bed, gratitude).
- Streaks reusing Peak Fettle's proven, **forgiving** model: make-up windows, intentional rest/skip days, no break on a single miss (mirrors the fitness streak rules — and explicitly avoids guilt mechanics).
- Optional **cross-app "whole-person" streak**: a day counts if the user trained *or* did a mind habit — ties the two apps together.

### 5.2 Mood check-ins
- Lightweight daily check-in: mood (simple scale or emoji), optional tags (sleep, stress, social), optional note.
- Trends over time; correlate gently with training (e.g. "you tend to log better moods on days you train"). **Correlation framed softly, never as medical insight.**

### 5.3 Guided CBT / mindfulness exercises
- A small library: thought record / cognitive reframing, 1–3 min breathing, grounding (5-4-3-2-1), gratitude prompt.
- Short, skippable, no streak penalty for skipping.
- **Optional AI-guided reflection** (reusing the existing Claude Haiku integration) for journaling prompts — with strict safety prompting and crisis-resource fallback. *(Flag: AI handling of mental-health text is sensitive — see Q-D.)*

### 5.4 Screen-time awareness *(the hardest feature — read §10)*
- Goal: gentle awareness + intention-setting, not surveillance.
- Realistic v1: **intention + self-report + OS-assisted where allowed.** iOS exposes screen-time only via the **Screen Time / FamilyControls / DeviceActivity** entitlements (restricted, privacy-gated, no raw export to our servers); Android via Digital Wellbeing/UsageStats with user permission. So v1 likely = "set a daily intention, nudge, and let users log/reflect" with deeper OS integration as a fast-follow if entitlements are granted.

### 5.5 Insights
- A simple weekly recap: habits completed, mood trend, exercises done, screen-time intention adherence. No scores that could feel judgmental.

## 6. Architecture (decided: standalone app, shared backend)
- **Client:** a new Expo/React Native app (same stack as `mobile/`), separate binary/store listing. Reuses our component patterns, theme tokens, and the hardened push pipeline (TICKET-065).
- **Backend:** the **existing** Peak Fettle server + Supabase/Postgres. New tables live in a clear namespace (e.g. `mind_*`). **Shared auth** — one account works in both apps.
- **Entitlement:** a server-side flag derived from the existing subscription (`has_paid_tier` ⇒ `mind_access = true`). The companion app checks entitlement at login; free users see an upsell.
- **Why standalone over a module:** keeps the fitness app's release cadence and bundle size clean, lets Mind have its own calmer UX, and still gives us one source of truth for users/billing.

## 7. Data model sketch (illustrative — finalized in build tickets)
- `mind_habits(id, user_id, name, cadence, forgiving_rules, created_at)`
- `mind_habit_logs(id, habit_id, user_id, date, status)`  // done / rest / skip
- `mind_mood_checkins(id, user_id, ts, mood, tags jsonb, note_encrypted)`
- `mind_exercises(id, slug, type, title, body)`  // seeded content library
- `mind_exercise_completions(id, user_id, exercise_id, ts)`
- `mind_journal_entries(id, user_id, ts, body_encrypted)`
- `mind_screen_intentions(id, user_id, date, target_minutes, self_reported_minutes)`
- `user_entitlements(user_id, mind_access bool, source)`
- **Sensitive fields (notes, journal) are treated as sensitive PII** — encrypted at rest, minimal retention, covered by the existing GDPR export/delete flows (TICKET-014/030).

## 8. Monetization (decided: bundled into paid tier)
- No new SKU. Current paid subscribers get Mind free; it's a retention/value lever.
- Free Peak Fettle users get a teaser + upsell to the paid tier.
- (A future "wellness tier" upsell remains possible but is explicitly out of scope for v1.)

## 9. Safety, privacy & legal (first-class)
- **Crisis resources**: locale-aware, prominent, contextual on severe-distress signals; US default **988**. Maintained as content, reviewed by a human.
- **Disclaimers** on onboarding and in-app: wellbeing tool, not treatment; encourage professional help where appropriate.
- **Data sensitivity**: mental-health data is among the most sensitive PII. Encrypt notes/journals, minimize what leaves the device, never sell/share, document retention. Run the path through the `security-guidance` plugin + `/security-review`, and draft policy/disclaimers with the `legal` plugin (human-reviewed).
- **App Store / Play compliance**: health & medical, sensitive-data, and (if any social features) UGC policies. iOS Screen Time/FamilyControls entitlements have their own review requirements.
- **No dark patterns**: gentle streaks, no guilt loops, no manipulative notifications.

## 10. Key technical risks (be honest)
1. **Screen-time data is genuinely constrained.** Don't promise deep automatic tracking in v1; iOS keeps this data on-device behind FamilyControls/DeviceActivity and Android needs UsageStats permission. Plan for intention/self-report first, OS integration as a permissioned fast-follow.
2. **AI on mental-health text** needs careful safety prompting + crisis fallback; keep it optional and conservative in v1.
3. **Scope creep** — mood + habits + journaling + screen time + AI is a lot. Recommend cutting v1 to habits/streaks + mood + a few exercises; screen-time = intention only; AI = later.
4. **Shared backend coupling** — keep `mind_*` cleanly namespaced so it can't destabilize the fitness app, and build it only after the Revision phase (TICKET-064…070) has hardened the base.

## 11. Phased rollout (becomes build tickets after approval)
- **P0 — Discovery (this doc).** Approve positioning, name, v1 scope, and answer the open questions.
- **P1 — Foundations.** Entitlement flag + shared-auth login in a new Expo app; `mind_*` schema; safety scaffolding (crisis resources, disclaimers) FIRST.
- **P2 — Core v1.** Habits & forgiving streaks, mood check-ins, a small seeded exercise library, weekly recap.
- **P3 — Beta.** Internal → small paid-subscriber beta; tester personas; `security-review`.
- **P4 — GA + fast-follows.** Screen-time OS integration (if entitlements granted), optional AI reflection, cross-app whole-person streak.

## 12. Success metrics
- Paid-subscriber **retention lift** and Mind **WAU/DAU** among paid users.
- Habit-completion and check-in frequency (engagement, not pressure).
- Qualitative: do users report it feels supportive, calm, and safe? Zero tolerance for harm reports.

## 13. Open questions for you (answer in OPEN_QUESTIONS_FOR_FOUNDER.md → Q5)
- **Q-A. Name?** Peak Fettle Mind (recommended) / Fettle Mind / other.
- **Q-B. Platform priority?** iOS-first, Android-first, or both at once for v1? (Recommend iOS-first.)
- **Q-C. v1 scope cut?** OK to ship v1 as habits+streaks+mood+exercises, with screen-time = intention-only and AI reflection deferred? (Recommended.)
- **Q-D. AI reflection in v1?** Use Haiku for journaling prompts now (with safety guardrails), or defer to a fast-follow? (Recommend defer.)
- **Q-E. Screen-time depth?** Are you comfortable pursuing iOS FamilyControls/DeviceActivity entitlements later, or keep it self-report only? 

## 14. Recommendation
Approve **light-evidence-based, standalone-on-shared-backend, bundled-in-paid**, with a **deliberately small v1** (habits/streaks + mood + a few CBT/mindfulness exercises + weekly recap; screen-time = intention-only; AI deferred), built **after** the Revision phase hardens the base. Safety scaffolding ships first, not last. On your sign-off I'll expand §11 into TICKET-073…0xx in the house format.

**Until you approve: nothing gets built.**
