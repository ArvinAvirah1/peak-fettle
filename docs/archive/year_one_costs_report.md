# Peak Fettle — Year One Costs Report

**Authors:** CTO & CEO
**Date:** 2026-04-30
**Methodology:** See `exec_playbook_steelmanning.md` — every line item below is steel-manned across at least two viable options before recommendation.
**Operating principle:** Minimize Year 1 spend without taking on technical debt that becomes expensive in Year 2.

---

## 1. Executive summary

Realistic Year 1 cash outlay for a solo-founded launch with a paid tier and modest paid acquisition lands at **$1,150–$1,650** in fixed and variable infrastructure costs, plus **$500–$3,000** in optional marketing depending on how aggressively paid acquisition is tested. The mandatory floor — what you spend even with zero users and zero marketing — is approximately **$215**. Everything above that floor is a deliberate choice, and the report below explains where every dollar goes and what each one buys.

The recommended Year 1 budget breaks down as follows:

| Category | Recommended Year 1 spend | Type |
|---|---|---|
| Domain registration | $50 | Fixed |
| Apple Developer Program | $99 | Fixed |
| Google Play registration | $25 | One-time |
| Microsoft Store registration | $19 | One-time |
| Database (Supabase) | $0–$300 | Variable |
| LLM (plan generation) | $50–$400 | Variable, scales with paid users |
| Push notifications (FCM) | $0 | Free |
| Analytics (PostHog) | $0 | Free tier |
| Crash reporting (Sentry) | $0 | Free tier |
| Email transactional (Resend) | $0–$120 | Variable |
| Offline sync (PowerSync) | $0–$200 | Variable |
| Legal/privacy (Termly or DIY) | $0–$120 | Optional |
| Branding/logo | $0–$200 | One-time |
| Marketing (organic-first) | $0–$3,000 | Discretionary |
| **Estimated total** | **$243–$4,533** | |

The wide range is intentional — it captures the difference between a pure organic launch and a launch with meaningful paid acquisition testing.

---

## 2. Fixed infrastructure costs (the mandatory floor)

### 2.1 Domain — $50/year (specified)

A $50/year domain is materially above market for a `.com` (Namecheap and Cloudflare are around $10–$13/year for standard `.com` names), which suggests the $50 figure includes either privacy protection, premium TLDs (`.fitness`, `.app`, `.io`), email forwarding, or a slightly premium name. The figure is acceptable as specified and not worth optimizing — domain cost is rounding error against any other line item, and switching registrars is annoying.

**Cost:** $50/year.

### 2.2 Apple Developer Program — $99/year

Mandatory to publish to the iOS App Store. There is no free tier, no founder discount, no work-around. The Apple Developer Program also covers TestFlight (free beta distribution to up to 10,000 testers), code signing, and the necessary entitlements for push notifications and in-app purchases.

**Steel-man for skipping iOS at launch:** Android-only launch saves $99/year, defers App Store Review friction, and lets the founder iterate faster on a single platform. Android is also a larger global install base, which matters for a fitness app whose competitive ranking feature benefits from a denser user pool.

**Steel-man for shipping iOS at launch:** iOS users in fitness convert to paid tiers at materially higher rates than Android users (industry observation, not Peak Fettle data — verify post-launch). The fitness apps that succeed commercially almost universally launch iOS-first or iOS-and-Android. Skipping iOS forfeits the higher-LTV segment to save $99.

**Decision:** Pay it. The $99 is recovered by a single annual subscription at any reasonable price point.

**Cost:** $99/year.

### 2.3 Google Play Developer Account — $25 one-time

A flat $25 one-time fee, paid once for the lifetime of the account. No reasonable steel-man for skipping it.

**Cost:** $25 one-time.

### 2.4 Microsoft Store — $19 one-time (individual) or $99 one-time (company)

Microsoft Store registration is $19 for an individual developer account, $99 for a company account. Windows is part of the platform brief, so the registration is required.

**Steel-man for company account at $99:** A company account allows publishing under "Peak Fettle Inc." rather than the founder's legal name, which matters for brand perception and future investor or acquirer due diligence. It also enables business-tier submission options.

**Steel-man for individual at $19:** Saves $80 immediately. The account type can be upgraded later by re-verifying. At MVP stage, no user inspects the publisher field.

**Decision:** Start individual at $19. Upgrade if and when the company is incorporated and the brand-perception cost of the founder's name in the publisher field becomes material.

**Cost:** $19 one-time.

### 2.5 App store revenue share (variable, post-launch)

Both Apple and Google take **15% of the first $1M in annual developer revenue** under their small business programs (App Store Small Business Program, Google Play 15% tier), and **30% above $1M**. Microsoft Store takes 12% on apps and 15% on games for in-app subscriptions. This is not a Year 1 cash cost — it is a revenue dilution applied to gross subscription revenue. For a pre-revenue or early-revenue app, the cash impact is minimal; budget against gross revenue, not against operating expense.

**Cost:** 15% revenue share on App Store and Google Play subscriptions. Material only after revenue exists.

---

## 3. Database — Supabase (decision carried from prior memo)

The database decision was made in the prior memo (`database_decision_memo.md`). The choice is Supabase, with PowerSync for offline mobile sync. Cost summary at scale:

| Stage | MAU | Supabase cost | PowerSync cost |
|---|---|---|---|
| Pre-launch | 0–500 | $0 (Free tier) | $0 (Free tier ≤ 1k users) |
| Early traction | 500–5,000 | $25/month (Pro) | $0–$25/month |
| Growth | 5,000–50,000 | $25–$125/month | $50–$200/month |

**Year 1 expected:** $0 for the first 3–6 months, $25/month thereafter, plus $0–$25/month PowerSync once MAU climbs.

**Year 1 estimate:** $0–$300 total.

---

## 4. LLM costs for personalized plan generation

This is the single most important cost line item to think about correctly, because it scales linearly with paid users and the wrong choice between models can mean a 10x difference in unit economics.

### 4.1 Token estimates per plan

A reasonable personalized plan generation involves roughly:

- **System prompt:** 1,500–2,000 tokens (programming principles, exercise database snippet, output schema)
- **User survey input:** 500–1,500 tokens (goals, equipment, schedule, preferences, history)
- **Output plan:** 2,500–4,000 tokens (multi-week structured plan with exercise selection, sets, reps, progression, alternatives)

Total per plan: **~5,000–7,000 tokens**, weighted toward output.

Plan refresh cadence: realistically, one full plan generation on signup, plus monthly adjustments (smaller, ~2,000 tokens each), plus occasional ad-hoc tweaks. Annualized: roughly **20,000–40,000 tokens per paid user per year** in LLM throughput.

### 4.2 Steel-manning each model option

**OpenAI GPT-4o mini.** The strongest case for GPT-4o mini is raw cost — at roughly $0.15 per million input tokens and $0.60 per million output tokens, plan generation runs around half a cent per plan. The model is competent at structured output, function calling is mature, and OpenAI's tooling ecosystem is the largest. For a solo founder optimizing per-user variable cost above all else, GPT-4o mini produces the cheapest unit economics in mainstream commercial LLMs.

**Google Gemini 2.0 Flash.** The strongest case for Gemini Flash is that it is even cheaper than GPT-4o mini at roughly $0.075 per million input tokens and $0.30 per million output tokens, while supporting native multi-modal input. For Peak Fettle specifically, multi-modal matters because future features could include analyzing user-uploaded form check videos or progress photos. Starting on Gemini means that capability is free to add later instead of requiring a second vendor.

**Anthropic Claude Haiku 4.5.** The strongest case for Claude Haiku is quality of structured output and instruction following at a reasonable cost (~$1 per million input, ~$5 per million output — roughly 5–10x GPT-4o mini). Workout plans must be safe, internally consistent, and follow programming principles like progressive overload — small inconsistencies erode trust quickly. Haiku's output reliability at a price still measured in cents per plan is a defensible premium for a feature that is the paid tier's core differentiator.

**Anthropic Claude Sonnet 4.6.** The strongest case for Sonnet is that the AI-generated plan is the entire paid value proposition. Spending an extra few cents per generation to get a plan that is meaningfully better than competitors' is the highest-ROI dollar Peak Fettle can spend. At roughly $3/M input and $15/M output, Sonnet costs around 6–8 cents per plan — still negligible against any reasonable subscription price.

**Open-source via Together AI (Llama 3.x 70B, Mistral, etc.).** The strongest case for open-source is data sovereignty (fitness data is sensitive, and not sending it to OpenAI/Google/Anthropic is a real privacy advantage), no per-token rate limits, and a price floor at very high volume. For a privacy-positioned brand, this is a marketing differentiator as well as a cost choice.

**Self-hosted inference on a GPU.** The strongest case for self-hosting is that at sufficient scale (~100,000+ paid users generating plans monthly), a $300/month GPU instance produces marginal-zero per-plan inference cost. Unit economics become unbeatable.

### 4.3 Honest weaknesses

GPT-4o mini's plan quality is the lowest of the commercial options; for a feature where plan quality is the product, the cost savings may not justify the quality drop. Gemini Flash's structured-output and instruction-following reliability has historically lagged GPT and Claude, though the gap has narrowed. Claude Haiku and Sonnet are 5–30x more expensive per token than the cheapest options, which matters at scale even if it is invisible at MVP. Open-source models via Together require more prompt engineering to match commercial-model output quality, and the operational burden of model upgrades falls on the founder. Self-hosting is unjustifiable below tens of thousands of users.

### 4.4 Recommendation

**Use Claude Haiku 4.5 for plan generation.** The cost difference between Haiku and the cheapest options (GPT-4o mini, Gemini Flash) is roughly 1–3 cents per plan. At 100 paid users generating one plan per month plus monthly adjustments, that is a difference of $30–$60 per year. The plan quality is the paid tier's reason to exist; spending an extra fifty dollars per year on the highest-leverage feature is not where to optimize.

Build the integration behind a thin abstraction (one function: `generate_plan(survey, history) → plan`) so swapping providers is one file change. Re-evaluate after 100 paid users when there is real data on plan quality complaints versus cost.

**Cost estimate, Year 1:** Assuming 50–500 paid users by year-end, with monthly plan refreshes:

- 50 users × 12 plans × 7,000 tokens × Haiku pricing ≈ $25/year
- 500 users × 12 plans × 7,000 tokens × Haiku pricing ≈ $250/year

**Year 1 estimate: $50–$400.** Negligible compared to subscription revenue at any reasonable conversion.

---

## 5. Adjacent infrastructure (push, analytics, crash, email, sync)

These are the services the database memo flagged as "not bundled with Supabase" and that need separate vendors.

**Push notifications — Firebase Cloud Messaging (FCM).** Free for unlimited messages on iOS and Android. There is no real alternative worth considering at MVP. **Cost: $0.**

**Product analytics — PostHog.** Free tier covers 1 million events per month, which is more than sufficient for the first several thousand active users. Self-hostable later if cloud cost ever becomes meaningful. The steel-man alternatives are Mixpanel (more polished UI, more expensive at scale), Amplitude (similar profile to Mixpanel), and Google Analytics (free but increasingly hostile to mobile apps and not a real product analytics tool). PostHog wins on cost predictability and self-host optionality. **Cost: $0 in Year 1.**

**Crash reporting — Sentry.** Free tier covers 5,000 errors per month. Steel-man alternative is Firebase Crashlytics, which is free and bundled with Firebase Auth — but using only Crashlytics from the Firebase suite drags in the entire Firebase SDK for a single capability. Sentry is the cleaner choice when not already on Firebase. **Cost: $0 in Year 1, likely $26/month at scale.**

**Transactional email — Resend.** Free tier of 3,000 emails per month and 100 per day. Sufficient for signups, password resets, and weekly summaries at MVP. Steel-man alternatives are AWS SES (cheaper at scale, more setup), Postmark (better deliverability, more expensive), and SendGrid (mature, similar pricing). **Cost: $0 in Year 1, perhaps $20/month at scale.**

**Offline sync — PowerSync.** Free tier covers up to 1,000 synced users. Above that, paid plans start at $35/month. Required because Supabase does not provide native offline sync and gym connectivity demands offline-first writes. **Cost: $0 in Year 1 unless MAU exceeds 1,000.**

**Total adjacent infrastructure, Year 1: $0–$200.**

---

## 6. Marketing budget

This is the line item with the widest range and the loudest opinions. The steel-man framework matters more here than anywhere else, because every dollar spent on marketing is a dollar not available for runway.

### 6.1 Steel-manning each channel

**Pure organic content (Reddit, TikTok, YouTube Shorts, blog).** The strongest case for organic-first is that fitness content compounds. A single TikTok or YouTube short that lands can drive thousands of installs at zero marginal cost, and SEO content built today produces traffic for years. Fitness is a category where authentic expertise is rewarded — the founder talking honestly about programming principles, percentile rankings, and the science behind plan generation is more credible than a paid ad. Reddit's r/fitness, r/weightroom, and r/xxfitness are well-trafficked communities where genuine value sharing converts. The cost is time, not capital.

**Paid acquisition (Meta ads, TikTok ads, Apple Search Ads).** The strongest case for paid is speed of feedback. Organic takes months to know whether the product resonates; paid acquisition produces install data, conversion data, and retention data within days. For a founder trying to validate that the percentile feature, the AI plans, or the cross-platform support actually drives subscriptions, $500 spent on a paid test produces faster, more legible signal than three months of organic experimentation. Apple Search Ads on App Store specifically converts at materially higher rates for fitness apps than other channels because intent is highest at the moment of category search.

**Influencer partnerships.** The strongest case for influencer marketing is that fitness is fundamentally a trust-transfer category. A 50,000-follower lifter or runner endorsing Peak Fettle to their audience produces install rates and conversion rates that paid ads cannot match, because the audience has already pre-qualified the recommendation source. Micro-influencer deals at the 10K–100K follower range can be negotiated for $100–$500 per integrated post, and well-targeted ones can pay back in a single month.

**App Store Optimization (ASO).** The strongest case for ASO is that organic App Store search is the largest free distribution channel for mobile apps. Optimizing the app title, subtitle, keywords, screenshots, and listing copy is a one-time effort that produces ongoing free installs. Tools like AppTweak or Sensor Tower Lite are $0–$30/month for keyword research.

### 6.2 Honest weaknesses

Pure organic is slow and high-variance — it might produce zero installs for six months before something hits. Paid acquisition burns capital before product-market fit, and fitness is one of the most expensive categories on Meta with $5–$20 cost-per-install. Influencer deals have wide quality variance and are hard to scale; finding good partners is slow. ASO produces compounding returns but the effort is front-loaded and benefits depend on having a polished product to convert against.

### 6.3 Recommended phasing

**Phase 1 (months 1–3, target: 0–500 users):** Pure organic + ASO. Founder publishes on TikTok, YouTube Shorts, and Reddit; writes SEO blog posts on programming principles and percentile-based goal setting. ASO is locked in before launch with researched keywords. **Spend: $0–$50/month** (optional: AppTweak Lite at $30/month).

**Phase 2 (months 4–6, target: 500–2,000 users):** Add paid testing. $300–$500/month split across Apple Search Ads (highest expected ROAS for the category) and one Meta or TikTok ad set. The goal is not scale — it is finding which channel and creative converts, with a strict CAC ceiling tied to projected LTV. **Spend: $300–$500/month.**

**Phase 3 (months 7–12, target: 2,000–10,000 users):** Either scale paid (if Phase 2 hit CAC targets) or pivot to influencer partnerships (if paid was unprofitable). Begin two to four micro-influencer deals at $100–$300 per integrated post. **Spend: $500–$2,000/month**, scaling with revenue.

### 6.4 Recommendation

For Year 1, budget marketing in three tiers based on confidence:

- **Conservative (organic-first):** $0–$500 total Year 1 (mostly ASO tooling and a small paid test).
- **Recommended (organic + measured paid testing):** $1,500–$3,000 Year 1.
- **Aggressive (full paid + influencer push):** $5,000–$10,000 Year 1.

Recommendation defaults to **conservative-to-recommended** unless external capital is raised, because every dollar of marketing spend that does not produce a subscriber is a dollar removed from the founder's runway.

**Year 1 estimate: $500–$3,000.**

---

## 7. Often-overlooked costs

The following line items are easy to forget at planning time and unpleasant to discover mid-launch.

**Privacy policy and Terms of Service.** Required for both App Store and Google Play submissions. Termly's free tier covers a basic privacy policy, or Iubenda is roughly $30/year. DIY templates exist but produce real legal risk for an app handling biometric data. **Cost: $0–$120/year.**

**Logo and branding.** A $50–$200 Fiverr engagement or a few hours with Figma produces a workable launch logo. Avoid spending more until the brand is validated. **Cost: $0–$200 one-time.**

**Code-signing certificates (Windows).** A standard Windows code-signing certificate costs $200–$400/year. For Microsoft Store distribution this is often unnecessary (the store handles signing), but for sideloaded distribution it matters. Defer unless required. **Cost: $0–$400/year, defer if possible.**

**Developer tools and AI coding assistants.** Cursor or GitHub Copilot at $10–$20/month is realistically a productivity multiplier worth paying for. **Cost: $0–$240/year.**

**Business entity formation.** LLC formation is $50–$500 depending on state, plus annual fees of $0–$800. Worth doing once revenue exists, not before. **Cost: $0–$500 one-time, deferred.**

**Insurance (liability).** General liability or product liability insurance for a fitness app handling health-adjacent advice runs $500–$1,500/year. Worth investigating once the AI plan generation feature ships, because the legal exposure is non-trivial. **Cost: $0–$1,500/year, deferred to Phase 2 or 3.**

---

## 8. Year 1 total budget summary

### 8.1 Conservative (organic-first launch, minimal paid testing)

| Category | Cost |
|---|---|
| Domain | $50 |
| Apple Developer | $99 |
| Google Play | $25 |
| Microsoft Store | $19 |
| Database (Supabase, free tier most of year) | $50 |
| LLM (Claude Haiku, ~50 paid users) | $50 |
| Adjacent infra (all free tier) | $0 |
| Privacy policy (Termly free) | $0 |
| Logo (DIY) | $0 |
| Marketing (organic + ASO) | $300 |
| **Total Year 1** | **$593** |

### 8.2 Recommended (measured paid testing in Phase 2)

| Category | Cost |
|---|---|
| Domain | $50 |
| Apple Developer | $99 |
| Google Play | $25 |
| Microsoft Store | $19 |
| Database (Supabase Pro from month 4) | $225 |
| LLM (Claude Haiku, 100–300 paid users) | $200 |
| Adjacent infra (PowerSync small tier) | $100 |
| Privacy policy (Iubenda) | $30 |
| Logo (Fiverr) | $100 |
| Dev tools (Cursor) | $240 |
| Marketing (organic + paid testing) | $1,800 |
| **Total Year 1** | **$2,888** |

### 8.3 Aggressive (full paid acquisition, influencer push)

| Category | Cost |
|---|---|
| Domain | $50 |
| Apple Developer | $99 |
| Google Play | $25 |
| Microsoft Store | $19 |
| Database (Supabase Pro full year) | $300 |
| LLM (Claude Haiku, 500+ paid users) | $400 |
| Adjacent infra (PowerSync growth tier) | $300 |
| Privacy policy + ToS | $120 |
| Logo + brand kit | $400 |
| Dev tools | $240 |
| Liability insurance | $750 |
| Marketing (paid + influencer) | $7,500 |
| **Total Year 1** | **$10,203** |

---

## 9. Cost-cutting principles

The principles below are how the conservative budget stays conservative without producing technical debt that compounds in Year 2.

**Use free tiers until they break, not until they feel limiting.** Free tiers on Supabase, Sentry, PostHog, Resend, and PowerSync cover roughly the first 1,000 active users. Paying before that point is paying for capacity not yet needed.

**Buy one-time costs, lease ongoing costs.** Domain, store registrations, logo, and privacy policy generation are paid once. Avoid converting any of them into subscriptions.

**Defer every "professional" cost until revenue exists.** LLC formation, liability insurance, premium ASO tools, paid Slack, and accounting software are all deferrable until there is revenue to justify them. They are not Year 1 costs; they are Year 1.5 costs.

**Treat marketing spend as a test budget, not a growth budget.** Until product-market fit is demonstrated by retention metrics (ideally: 30%+ Day-30 retention on the paid tier), every marketing dollar is buying information, not users. Spend accordingly.

**Build provider-swap flexibility into every integration.** The largest variable cost (LLM) and the largest fixed cost (database) should both sit behind thin abstractions so a vendor change is one file. This makes future cost-cutting cheap rather than catastrophic.

---

## 10. Revisit triggers

This budget should be revisited if any of the following occurs:

- MAU crosses 1,000 (PowerSync upgrade triggered).
- Paid subscribers cross 500 (LLM cost begins to matter, and Supabase Pro is mandatory).
- Marketing CAC tests in Phase 2 produce a sub-target CAC (scale spend; revisit budget upward).
- Marketing CAC tests in Phase 2 produce CAC above LTV (cut spend; revisit channel mix).
- Apple or Google revenue share cliff at $1M annual revenue (begin contingency planning to negotiate or absorb).
- Any vendor pricing change that meaningfully affects the line item (most likely: LLM pricing — providers cut prices roughly twice a year).
