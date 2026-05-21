# Peak Fettle — Cost Analysis Reference

**Purpose:** Reusable reference for any future cost report, vendor comparison, or budget revision. Captures methodology, vendor-specific cost data, token estimates, and lessons learned from the Year 1 costs report (2026-04-30).
**Status:** Living document — append new findings, vendor pricing changes, and post-launch actuals as they are observed.
**Companion docs:** `exec_playbook_steelmanning.md`, `year_one_costs_report.md`, `database_decision_memo.md`.

---

## 1. Methodology lessons — how to structure a cost report

A cost report is not a price list. It is a decision document about where money goes, what each dollar buys, and which dollars are deferrable. The structure that produced a useful Year 1 report was:

**Compute the mandatory floor first.** This is what gets spent with zero users and zero marketing — the cost of merely existing as a published app. For Peak Fettle this was ~$215 (domain + three store registrations). The floor anchors every other discussion: anything above it is a deliberate choice, and naming it makes optional spending feel optional.

**Separate the four cost types.** Fixed recurring (domain, developer accounts), one-time (Google Play registration, logo), variable (database scaling, LLM per-user), and deferrable (LLC formation, liability insurance). Mixing them in a single column hides the fact that some are commitments and some are choices.

**Build three-tier scenarios, not a single budget.** Conservative, recommended, and aggressive. The spread between them is the most informative part of the report — it shows which line items are the real levers (in Year 1: marketing) and which barely move (store fees, domain). A single-number budget hides this.

**Steel-man each vendor before picking.** Same methodology as architectural decisions. Cheapest is rarely correct; most expensive is rarely correct. The right answer often depends on a single product detail (in our case: that plan quality is the paid tier's reason to exist, which justified Claude Haiku over GPT-4o mini despite a 5x per-token cost).

**Distinguish cash costs from revenue dilution.** Apple and Google's 15% revenue share is not a Year 1 cash expense — it is a haircut on future revenue. Treating it as cash distorts pre-revenue planning. Treating it as zero produces a surprise after launch. Quote it against gross revenue, not against operating expense.

**Estimate per-unit variable costs concretely.** For LLM costs specifically: token counts for input, output, and frequency must be written down explicitly. Hand-waving this leads to 10x errors. The tokens-per-plan estimate (~5,000–7,000) was the foundation for every LLM cost calculation downstream.

**Phase marketing spend, do not flatten it.** A single annual marketing number is meaningless. Phase 1 (organic, validate retention), Phase 2 (small paid tests, find a working channel), Phase 3 (scale the working channel) is the structure. Each phase has different CAC tolerance and different success criteria.

**List "often overlooked" costs explicitly.** Privacy policy, code-signing certs, business entity, liability insurance, dev tools. These are easy to forget at planning time and unpleasant to discover mid-launch. Every cost report should have a section for them, even if the recommendation is "defer."

**Set revisit triggers tied to thresholds.** "Revisit at 1,000 MAU" is more useful than "revisit annually." The threshold is what actually changes the math.

---

## 2. Vendor-specific cost data (as of 2026-04)

These are the figures used in the Year 1 report. Update when vendor pricing changes — historically, LLM providers cut prices ~2x/year, and BaaS pricing is more stable.

### App store and platform fees

| Item | Cost | Type |
|---|---|---|
| Apple Developer Program | $99/year | Recurring |
| Google Play Developer | $25 | One-time |
| Microsoft Store (individual) | $19 | One-time |
| Microsoft Store (company) | $99 | One-time |
| Apple App Store revenue share (under $1M) | 15% | Revenue dilution |
| Apple App Store revenue share (over $1M) | 30% | Revenue dilution |
| Google Play revenue share (under $1M) | 15% | Revenue dilution |
| Google Play revenue share (over $1M) | 30% | Revenue dilution |
| Microsoft Store revenue share (apps) | 12% | Revenue dilution |

### Domains

Standard `.com` domains are $10–$13/year on Cloudflare, Namecheap, or Porkbun. Premium TLDs (`.app`, `.io`, `.fitness`) and privacy-protected names land at $30–$60/year. Avoid GoDaddy retail pricing.

### Database / BaaS

| Tier | Supabase | Firebase | MongoDB Atlas |
|---|---|---|---|
| Free | 500 MB DB, 50K MAU, 5 GB bandwidth | Generous Spark plan, pay-as-you-go above | 512 MB free cluster |
| Entry paid | $25/mo Pro | Variable (per-operation) | $0–$60 (M0/M2) |
| Growth | $25–$125/mo (compute add-ons) | Scales with reads/writes — unpredictable | $57+/mo (M10) |

### Adjacent infrastructure (free tiers covered MVP for all of these)

| Service | Free tier | Paid entry |
|---|---|---|
| FCM (push) | Unlimited | N/A — always free |
| PostHog (analytics) | 1M events/mo | Self-host free, cloud ~$0.00031/event after |
| Sentry (crash) | 5K errors/mo | $26/mo |
| Resend (email) | 3K/mo, 100/day | $20/mo |
| PowerSync (offline sync) | 1K synced users | $35/mo and up |

### LLM pricing (per million tokens, 2026-04)

| Model | Input $/M | Output $/M | Approx. cost per 5–7K-token plan |
|---|---|---|---|
| Gemini 2.0 Flash | $0.075 | $0.30 | ~$0.0025 |
| GPT-4o mini | $0.15 | $0.60 | ~$0.005 |
| Claude Haiku 4.5 | $1.00 | $5.00 | ~$0.025 |
| GPT-4o | $2.50 | $10.00 | ~$0.05 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | ~$0.07 |
| Llama 3.x 70B (Together) | ~$0.88 | ~$0.88 | ~$0.005 |

Plan-generation token estimate (Peak Fettle baseline): 1,500–2,000 system + 500–1,500 user input + 2,500–4,000 output ≈ **5,000–7,000 tokens per plan**, weighted toward output. Annual plan + monthly adjustments + ad-hoc tweaks ≈ **20,000–40,000 tokens per paid user per year**.

### Marketing channel cost benchmarks (fitness category)

| Channel | Typical metric | Note |
|---|---|---|
| Apple Search Ads | $1–$3 cost per tap, $5–$10 CPI | Highest intent for fitness apps |
| Meta (FB/IG) | $5–$20 CPI | Saturated category, expensive |
| TikTok Ads | $3–$15 CPI | Younger audience, creative-dependent |
| Micro-influencer (10K–100K) | $100–$500 per integrated post | Wide quality variance |
| ASO tools (AppTweak Lite, etc.) | $0–$30/mo | Front-loaded effort, compounding return |

### Legal and operational

| Item | Cost |
|---|---|
| Privacy policy (Termly free / Iubenda) | $0 / $30/year |
| LLC formation | $50–$500 + $0–$800/year state fees |
| Liability insurance (fitness app) | $500–$1,500/year |
| Windows code-signing cert | $200–$400/year (often unnecessary for Store distribution) |
| Cursor / Copilot | $10–$20/month |

---

## 3. Lessons learned from the Year 1 cost exercise

**The cost lever that actually matters is marketing.** Infrastructure costs at MVP scale are rounding error against marketing. The conservative-vs-aggressive Year 1 spread was ~$600 vs ~$10,000 — and 75% of that gap was marketing alone. Optimizing infrastructure choices when marketing is unbounded is solving the wrong problem.

**Free tiers cover roughly the first 1,000 users across the entire BaaS stack.** Supabase, PowerSync, PostHog, Sentry, Resend, FCM — all designed with free tiers that align around the same approximate breakpoint. This means the *first* paid month is roughly the same across the stack: signal that you have ~1,000 active users. Plan the cash buffer for that month, not for hypothetical scale.

**LLM cost is negligible at MVP and irrelevant to model choice below 1,000 paid users.** The difference between the cheapest model (Gemini Flash at ~$0.0025/plan) and a strong model (Claude Haiku at ~$0.025/plan) is roughly $0.30/user/year. For a feature that is the paid tier's reason to exist, picking the cheaper model to save $30/year per 100 paid users is a false economy. Quality of the differentiated feature wins.

**Microsoft Store individual at $19 is almost always the right starting tier.** The $99 company tier upgrade is reversible later, and at MVP no user inspects the publisher field. This pattern generalizes: pick the lowest tier that meets the actual current need, not the tier that signals legitimacy.

**Apple Developer Program is non-negotiable for any iOS launch.** No free tier, no founder discount, no clever workaround. Treat the $99 as an Apple tax and stop optimizing.

**Build provider-swap flexibility behind thin abstractions for the largest variable costs.** For Peak Fettle the two were LLM (per-paid-user variable) and database (per-MAU variable). Both sit behind thin function signatures so a vendor swap is a one-file change. This converts what would be migration projects into config changes.

**Defer "professional" costs until revenue exists.** LLC formation, liability insurance, paid Slack, accounting software, code-signing certificates — all common pre-launch spending traps. None of them exist to make the product better; they exist to make the operator feel legitimate. Defer until there is revenue to justify them or a specific risk to mitigate.

**Marketing is a test budget before product-market fit, a growth budget after.** The signal for transition is retention metric, not revenue. Day-30 retention on the paid tier crossing ~30% is the threshold below which marketing buys information and above which marketing buys customers. Spending growth-budget rates before that crossover destroys runway.

**Three-tier budgets force commitment to a confidence level.** Picking "conservative" or "recommended" or "aggressive" forces an explicit statement about how confident the operator is in the product. This is more honest than a single budget number that hides the confidence assumption.

---

## 4. What to verify when reusing these figures

LLM pricing changes the most often — verify against current Anthropic, OpenAI, and Google price pages before any new cost report. App store fees are stable but Microsoft Store has restructured fees twice in the last five years; verify. Supabase and Firebase pricing tiers are stable but the free tier limits change occasionally — verify. Marketing CPI benchmarks should be replaced with Peak Fettle's own observed CAC as soon as Phase 2 produces real data; until then, industry benchmarks are the best available proxy.

When updating this file, replace stale figures rather than appending — the goal is a current reference, not an archive. Move historically interesting figures to a "historical pricing" appendix only if the trajectory itself is informative.

---

## 5. Future learnings (append as observed)

This section grows with each cost-related decision the team makes. A good entry includes the situation, the unexpected finding, and the principle.

### Template

```
### Finding N — [one-line title] — [date]

[Two or three sentences: what was being decided, what figure or assumption surprised us, how the budget or vendor choice changed.]

The lesson: [one-sentence portable principle for future cost work.]
```

### Entries

(none yet — append as the team accumulates real-world cost data post-launch)
