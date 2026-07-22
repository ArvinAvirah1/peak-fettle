# Peak Fettle — Competitive Analysis & Market Positioning

**Date:** 2026-07-03 · **Scope:** Peak Fettle mobile app + LifeOS companion · **Sources:** full repo inventory (this codebase) + live web research on competitor pricing/features/sentiment as of July 2026. Companion doc: `audits/feature-gap-analysis-2026-07-03.html`.

---

## 1. Executive summary — what is extremely marketable about Peak Fettle

Seven differentiators, ranked by marketing power. Each is verified in the codebase, and each maps to a documented, current market gap.

**1. The only serious lifting tracker where free-tier data never leaves your phone.** Free = on-device SQLite, E2E-encrypted backup (AES-256-GCM, human recovery code), unpaywalled JSON/CSV export (`tierPolicy.ts`, `blobCrypto.ts`, `data-export.tsx`). Every major competitor requires an account and cloud; JEFIT had a 9M-account breach (2020), Gymverse discloses *health data itself* as cross-app tracking data, Hevy ships 4 advertising SDKs. "Your training history is yours. We can't read it, sell it, or lose it" is a claim no competitor can make. Data-ownership anxiety and subscription/cloud distrust are documented recurring complaints across the category.

**2. Workout-gated screen time (LifeOS) — a validated empty market.** Research confirmed **no product combines a serious strength tracker with screen-time gating**. The gating category (ClearSpace, Steppin, StepLock) tops out at step counts and camera-counted pushups; the only entrant attempting the combo ("Lock In", 1515 Labs) is shallow on the training side. LifeOS's FamilyControls blocking + escalating unlock friction + cross-app streak (where only a per-day boolean ever reaches the server) is the intersection of two categories with no incumbent. This is the strongest earned-media hook ("the app that locks TikTok until you've trained").

**3. An honest, deterministic Training Engine in a market drowning in fake AI.** Reviewers now openly call out Juggernaut ("it isn't really AI, it is an expert system"), Alpha Progression, and JEFIT for rules-dressed-as-AI. Peak Fettle's engine is deliberately non-LLM, seeded-PRNG reproducible, and shows its work via `rule_trace` ("Why this plan"). Marketing inversion: *"No AI. Evidence-based rules you can read."* Free tier gets real plan generation (engine v1) — Fitbod has no free tier at all, and its 3-workout trial expires before its personalization even matures.

**4. On-device percentile rankings + tier ladder — motivation without a social feed.** `strengthModelV3.ts`: lognormal-fit, DOTS-calibrated, age/training-age-adjusted percentiles per lift, fully offline, **free** (explicit decision: growth driver, not paywall). No competitor researched offers strength percentiles at all, let alone offline. It answers "am I strong?" — the question serious lifters actually have — without the feed/badges bloat the r/weightroom demographic actively dislikes.

**5. Solves the speed-vs-depth tradeoff the market documents as unsolved.** Strong is fast but shallow; Fitbod is deep-ish but generic; Hevy is social-first. Peak Fettle pairs a stepper logger with supersets/dropsets (free, ungated), a rest timer, warm-up ramps, and a real programming engine with readiness/deload logic (`insightsLocal.ts`) in one app.

**6. Best-in-category plate calculator.** `plateMath.ts` handles machine/pulley effective load (2:1, 1:2 ratios), not just barbell per-side math. Small feature, disproportionate word-of-mouth value — plate-loading is a persistent complaint category-wide, and Strong paywalls its barbell-only version.

**7. Price/value dominance at free.** Free includes: unlimited local logging, supersets/dropsets, plate + warm-up + 1RM calculators, percentile rankings, plan generation, streaks, groups, CSV import/export, no ads. Compare: Strong free = 3 routines, no charts; Hevy free = 4 routines + ads + ~3-month history; Fitbod/RP/Juggernaut = no free tier.

**Positioning sentence:** *Peak Fettle is the private, honest, offline-complete strength system — pro-grade programming and rankings with zero cloud dependency, plus the only screen-time gate that demands a real workout.*

---

## 2. The competitive landscape

### 2.1 Tier-1 lifting trackers (direct competitors)

| App | Price (2026) | Free tier | Platforms | Key strengths | Key weaknesses |
|---|---|---|---|---|---|
| **Strong** | $4.99/mo · $29.99/yr · $99.99 life | Unlimited logging, **3-routine cap**, no charts/plate calc | iOS, Android, Watch, Wear OS | Fastest logging, 10+ yr reliability, clean privacy label | Stagnant (v6.2 Mar 2026 = maintenance), no programming intelligence, free tier crippled |
| **Hevy** | $2.99/mo · $23.99/yr · $74.99 life | 4 routines, 7 custom exercises, ~3 mo history, **ads** | iOS, Android, Web, Watch, Wear OS | 10M+ users, cheapest Pro, social layer, Hevy Trainer AI (Feb 2026) | Ads, 11 third-party SDKs (4 advertising), unit/timezone bugs, "busy" UI |
| **Fitbod** | $15.99/mo · $95.99/yr | **None** (7-day/3-workout trial) | iOS, Android, Watch, Wear OS | Hands-off AI generation, recovery modeling, 1,000+ videos, 15M downloads | Expensive, generic/repetitive plans, cold-start beats trial length, tracks usage data for ads |
| **JEFIT** | $12.99/mo · $69.99/yr | Genuinely functional free | iOS, Android, Watch, Wear OS | 1,400+ exercise DB, community, cross-platform watch | Cluttered/dated UI (2026 redesign made it worse per reviews), **2020 breach: ~9M accounts** |
| **Alpha Progression** | $12.99/mo · $79.99/yr | Limited | iOS, Android | RIR periodization, multi-gym equipment profiles | No watch app, no cardio, no 1RM tracking, heavy Pro-gating, ad SDKs (Adjust) |
| **Gymverse** (Fitness22) | ~$19.99/mo · $199.99 life (Jun 2026) | Trial only | iOS, Android, Watch, visionOS | Video library, lifetime pricing play | **Worst privacy in category** (discloses Health & Fitness data as tracking; Mixpanel/AdMob/Facebook Ads), rigid scheduling, documented data-loss incident |

### 2.2 Programming / "AI coach" apps (indirect competitors)

| App | Price | Reality of the "AI" | Weakness we exploit |
|---|---|---|---|
| **Juggernaut AI** | $34.99/mo · $349.99/yr, no free | Expert system (readiness + RPE rules), not ML | Powerlifting-only, excessive volume complaints, 1.5–2.5 hr sessions, no rest timer/plate calc/Health sync |
| **RP Hypertrophy** | $34.99/mo · $299.99/yr, no free | Feedback-driven set adjustment (MEV/MRV framework) | Trustpilot 2.8/5, price is #1 complaint, steep learning curve, no offline mode |
| **Boostcamp** | Free library · Pro $14.99/mo / $59.99/yr | Not AI — curated human programs (~11K) | Reliability bugs (workouts failing to save, offline data loss); no adaptation |
| **Caliber** | Free · ~$19/mo templates · $200+/mo human coach | Rules engine at Plus; real humans at Premium | Genuine personalization costs $200+/mo |

Category-wide pattern: "AI" claims resolve to rules engines; free tiers are absent or too thin to prove value; nobody unifies strength + cardio stress; wearable integration is brittle everywhere.

### 2.3 Screen-time / exercise-gating apps (LifeOS competitors)

| App | Gate mechanism | Price | Notes |
|---|---|---|---|
| **ClearSpace** (YC) | Camera-ML pushups/squats, steps, breathing | Free (1 app) · $7/mo / $50/yr | Most rigorous incumbent; ~850 ratings — small |
| **Steppin** | Steps → unlock minutes (100 steps = 1 min) | Free, ~$20/yr planned | Kayak co-founder, TechCrunch coverage; reliability regressions reported |
| **StepLock / WalkLock / PushUp Time** | Steps or camera-counted reps | Varies | Fragmented sub-genre; PushUp Time largest at 11K ratings |
| **Opal / ScreenZen / one sec** | Time/friction only — **no exercise gate** | Free–$99 life | Not direct competitors; prove demand for blocking |
| **Lock In** (1515 Labs) | Blocks until session logged / gym arrival | — | **Only combo attempt**; training side is shallow (no periodization/progression depth) |

**Category ceiling:** every gate is steps or bodyweight reps. Nobody verifies a real, loaded, progressing workout — because nobody else owns both the tracker and the gate. Peak Fettle does.

---

## 3. How we beat them — five vectors, with quality guardrails

**Vector 1 — Privacy as the brand, not a footnote.** Attack surface: JEFIT's breach, Gymverse's health-data tracking, Hevy's ad SDKs, Fitbod's "Advertising Partners." Our claim is architectural, not policy-based — free data physically cannot leak from a server that never has it. *Guardrail:* the local-first invariant is already the #1 source of past bugs (raw `api/*` calls on the free path); every new feature must branch on `isLocalFirst()` and pass the grep review step in CLAUDE.md. Never add ad SDKs; never paywall export.

**Vector 2 — Own "honest programming" against AI fatigue.** Every competitor is racing to slap "AI" on rules engines and getting called out for it. We already stripped "AI" from user copy (Training Engine v1 decision). Double down: surface `rule_trace` more prominently, publish the engine's evidence basis. *Guardrail:* keep the engine deterministic and reproducible (seeded PRNG); resist LLM-generation pressure — it would destroy the differentiator and the offline guarantee simultaneously.

**Vector 3 — Rankings as the growth loop.** Percentile + tier ladder is unique, free, and inherently shareable ("I'm top 18% for my bodyweight and age"). Pair with share cards (§4.7) for zero-server virality. *Guardrail:* keep it free (the CTO decision in `rankings.tsx` is right); keep the model on-device and portable — never make it depend on a live user base.

**Vector 4 — LifeOS as the category-creating wedge.** "Train or stay blocked" earns press no tracker feature can. Pro-gating LifeOS makes it the subscription's anchor value, avoiding the per-feature paywall resentment Alpha Progression suffers. *Guardrail:* it ships OFF pending Apple's FamilyControls distribution entitlement — that grant is the critical path and should be treated as a launch blocker, not a nice-to-have. Keep the zero-content-server design (per-day booleans only); it is both the privacy story and the App Store review story.

**Vector 5 — Win the switchers.** Strong is stagnating and its users have a decade of data; Hevy users hit unit bugs and ads. Direct importers (§4.9) turn their lock-in into our acquisition channel. Free tier with no routine cap + no ads is the landing pad. *Guardrail:* import must write exact `weight_kg` through `units.ts` conversion (the 185 lb → 185 kg class of bug) and be covered by the parse-sweep/migration test DoD.

**What we deliberately do NOT copy:** a public social feed (our target segment documents it as unwanted bloat; groups-of-2–12 accountability is the right-sized social layer), ads-funded free tier, LLM chat coaches (generic per Fitbod reviews), and $200/mo human coaching (different business).

---

## 4. Gap analysis — competitor features we lack, and what implementation takes

Verified absences from the repo sweep, ordered by (impact ÷ effort). Effort assumes current architecture; every item must respect the tier-branched data layer and the schema-migration + parse-sweep DoD from CLAUDE.md.

### 4.1 Apple Health integration (unstub) — **S/M, 3–5 days** — HIGHEST PRIORITY
Everyone has it; ours is stubbed (`healthKit.ts` "TEMPORARILY STUBBED" after a native crash). Health-metrics screens and readiness scoring already exist and consume the data shape, so this is repair, not construction. Work: root-cause the crash (likely the same native-module class as the iOS 26 font issue — verify against commit d1205a9's pattern), re-enable behind a runtime guard, write bodyweight/workouts back to HealthKit. Risk: low. Absence is a review-killer ("no Apple Health? uninstall").

### 4.2 Strong/Hevy CSV importers — **S/M, 2–4 days each** — HIGHEST PRIORITY
`csvImport.ts`/`routes/csvImport.js` already handle Garmin/Strava; Strong and Hevy both export documented CSV. Work: two parsers + exercise-name mapping table into the 194-exercise catalog (fuzzy match + manual-confirm UI), writing exact kg via `displayToKg`. Free-path local write, no server round-trip. This is the single cheapest acquisition feature available.

### 4.3 Per-set notes + RPE display toggle — **S, 2–3 days**
Table stakes in Strong/Hevy. Notes: local schema v4 migration adding `sets.note TEXT` (+ drift-tolerant server mirror), UI in the stepper. RPE: no schema change — store RIR as canonical, render RPE = 10 − RIR behind a settings toggle. Include in the migrations test.

### 4.4 Body measurements + progress photos — **M, 5–8 days**
Strong/Hevy/JEFIT track measurements; we only track bodyweight. Measurements: new local table (mirrors `bodyweight` pattern), entry sheet, trends charts reuse `BodyweightChart`. Photos: store in app-documents (never server on free), optional inclusion in the E2E blob (watch blob size — may need a photos-excluded default). Privacy framing writes itself: "progress photos that never touch a cloud."

### 4.5 Live Activity / Dynamic Island rest timer — **M, 3–5 days**
Hevy/Strong ship it; our rest timer is a local notification (`useRestTimer.ts`). The ActivityKit scaffold already exists in `lifeos/modules/live-activity/` — port it to `mobile/`, drive it from the timer hook. Requires EAS build + on-device testing (nothing reaches the device without push + rebuild). High perceived polish per dev-day.

### 4.6 Exercise demo media — **M code, L content, 2–3 days + content pipeline**
Fitbod (1,000+ videos), JEFIT, Gymverse all have it; our catalog is text-only. Code is trivial (`media_url` on the catalog + cached lazy download — do NOT bundle; protects app size and offline-first). The real cost is content: licensing an existing library vs. commissioning ~194 loop animations (consistent style, one-time cost, ours forever). Recommendation: commissioned minimal line-art loops — on-brand with the no-bloat identity. Interim: form-cue text (already have) + link-out.

### 4.7 Shareable workout/PR/rank cards — **S/M, 2–4 days**
Hevy's social feed drives its growth; we won't build a feed, but on-device-rendered share images (PR card, tier-ladder card, weekly summary) get the virality with zero server and zero privacy cost. LifeOS already has a `share-card.tsx` to generalize from. Pairs directly with Vector 3.

### 4.8 Prebuilt program library expansion — **M, 1–2 weeks**
Boostcamp's moat is ~11K programs; we ship a small beginner set. Don't chase the marketplace — curate 20–30 public-domain/renamed classic templates (GZCLP, PHUL, nSuns-style; mind trademarks on branded names like 5/3/1) expressed as Training Engine presets so they inherit rule traces and progression. Differentiator: our programs *adapt*; Boostcamp's are static.

### 4.9 Apple Watch app — **L, 3–6 weeks** — biggest single gap
Strong/Hevy/Fitbod/JEFIT all have watch apps; we have none (no watchOS target in repo). Expo doesn't cover watchOS: needs a native SwiftUI target (extend the existing `@bacons/apple-targets` setup), WatchConnectivity sync to the RN app, and a minimal loop (current exercise, log set, rest timer, heart rate). Local-first actually helps — the watch talks to the phone, not a server. Defer full standalone-watch support. This is the most-cited comparison-table checkbox we fail today.

### 4.10 Android build — **L, 2–4 weeks to beta (main app only)**
Config stub exists (`android.package` in `app.json`) but no native project, no Health Connect, no Android widgets. Expo/EAS makes the core app feasible; the long tail is Health Connect (replaces HealthKit), notification channels, widget parity, and a device test matrix. **LifeOS cannot ship on Android as designed** — FamilyControls is Apple-only; the Android analog (UsageStatsManager/Accessibility) is a separate project with Play-policy risk. Sequence Android after the iOS wedge is proven; when done, it unlocks the half of the market where Hevy/JEFIT are strongest.

### 4.11 Localization — **M/L, 1–2 weeks + translation spend**
All copy is hardcoded English across ~153 files despite `expo-localization` being present. Mechanical extraction work — fits the Haiku/Sonnet mechanical lane. Do after copy stabilizes (post-LifeOS launch), starting with es/de/pt (lifting-app-heavy markets; Alpha Progression's German base shows the demand).

### 4.12 Web app — **L, not recommended now**
Only Hevy and RP have real web apps. Our free tier is architecturally phone-local (no server data to render), so web only serves Pro — thin ROI until Pro volume justifies it.

**Explicitly skipped:** public social feed/follows/leaderboards (anti-positioning, §3), LLM coach chat (documented as generic in competitor reviews; breaks offline + honesty positioning), human coaching marketplace (different business), hardware (Fort's problem).

---

## 5. Recommended sequencing

1. **Now (pre-LifeOS-launch polish, ~2 weeks):** HealthKit unstub (4.1) → Strong/Hevy importers (4.2) → per-set notes + RPE toggle (4.3) → share cards (4.7). All S/M, all free-path, all sharpen the switcher pitch.
2. **Launch window:** LifeOS entitlement + ship (the press hook), Live Activity timer (4.5), measurements/photos (4.4).
3. **Scale (1–3 months):** program library as engine presets (4.8), exercise media pipeline (4.6), Apple Watch (4.9).
4. **Expansion (post-traction):** Android (4.10), localization (4.11), web (4.12).

Every item above goes through the standard DoD: parse-sweep, `node --check`, migrations test, `tsc` delta, and ships only after push + EAS rebuild.

---

## Appendix — key sources

Strong pricing/account: help.strongapp.io · Hevy pricing/limits + Trainer launch: help.hevyapp.com · Hevy SDK audit: blankspaces.app/check/hevy · Fitbod pricing/offline: fitbod.me/faqs, sensai.fit/blog/fitbod-review-2026 · JEFIT breach: haveibeenpwned.com/Breach/Jefit · JEFIT UI sentiment: g2.com JEFIT reviews · Gymverse lifetime PR (Jun 18 2026): prunderground.com · Juggernaut pricing/sentiment: juggernautai.app/pricing, justuseapp.com, dr-muscle.com/juggernaut-workout-app-review · RP: rpstrength.com/pages/hypertrophy-app, dr-muscle.com/rp-hypertrophy-app-critique · Boostcamp: boostcamp.app/pro, barbend.com/boostcamp-review · Caliber: garagegymreviews.com/caliber-app-review, tomsguide.com · ClearSpace: ycombinator.com/companies/clearspace · Steppin: techcrunch.com (Jan 14 2025) · Lock In: App Store id6738963949.

*Evidence-quality caveats: Reddit sentiment is via secondary aggregators (direct thread access unavailable); Trustpilot figures for Juggernaut/RP from search snippets; Alpha Progression watch status disputed between sources (founder statement says roadmap-only, Mar 2026). Competitor pricing checked July 3, 2026 — re-verify before publishing externally.*

