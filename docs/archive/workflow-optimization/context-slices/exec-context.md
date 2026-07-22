# Exec Team Context Slice
**For:** exec-ceo, exec-cto, exec-product-manager
**Rule:** Read only this file for standard decisions. For deep cost/budget work: also read `cost_analysis_reference.md` + `year_one_costs_report.md`. For deep marketing strategy: also read `marketing_subteam_skill.md`. Do not load dev implementation files unless reviewing a specific technical decision.

---

## Business Summary

Peak Fettle is a solo-founded, bootstrapped cross-platform fitness app (iOS, Android, Windows). Solo founder optimizing for cost predictability, no vendor lock-in, and time-to-market.

**Free tier:** Set tracking, progress graphs, cohort-matched competitive percentile rankings.
**Paid tier:** AI-generated adaptive fitness plans — the core revenue driver.

**North Star Metric:** DAUs logging ≥1 workout/week for 3+ consecutive months (long-term retention, not installs).

---

## Differentiation

- **Cohort-matched percentiles** — ranks users vs. same age, gender, experience level, weight class. Unique in market.
- **Behavioral habit system** — science-backed streaks with make-up windows and emergency overrides. Not just streak counting.
- **Adaptive AI plans** — evolve based on logged performance. Not static templates.
- **Aggressive free tier** — percentiles included free. Drives adoption, creates competitive hook for upgrades.

---

## Key Competitors

MyFitnessPal, Strava, Hevy, Strong, Whoop, Garmin Connect. None fully combine cohort percentiles + adaptive AI planning.

**Biggest risks:**
- Strava or Hevy building similar percentile features
- AI plan quality not meeting user expectations at launch
- Over-engineering before finding product-market fit

---

## Tech Stack (Exec-Relevant Decisions Only)

| Concern | Decision |
|---|---|
| Infrastructure | Supabase (Postgres + Auth). Flat-rate pricing, Postgres exit optionality. |
| AI / Plan generation | Claude Haiku 4.5. ~2.5¢/plan. Plan quality is the paid tier's reason to exist. |
| Percentile rankings | Batch weekly job — not real-time. Acceptable trade-off at current scale. |
| Offline capability | PowerSync. Gym connectivity is unreliable — offline-first is non-negotiable. |
| Health data | Encryption at rest and in transit required. HIPAA-adjacent considerations apply. |

---

## Unit Economics Snapshot

- **LLM cost per plan:** ~2.5¢ (Haiku, ~5,000–7,000 tokens). Verify against current Anthropic pricing before modeling.
- **Free tier infrastructure threshold:** ~1,000 users before first paid month hits across Supabase, PowerSync, PostHog, Sentry, Resend, FCM — all aligned.
- **App store revenue share:** 15% (small business program), 30% above $1M revenue. Revenue dilution, not cash opex.
- **Year 1 budget tiers (from full cost report):** Conservative ~$593 / Recommended ~$2,888 / Aggressive ~$10,203. Mandatory floor (zero users, zero marketing): ~$215.
- **Marketing is the dominant cost lever** — ~75% of the spread between conservative and aggressive budgets. Infrastructure at MVP is a rounding error against marketing.

---

## Marketing Strategy Summary (6 Ranked Strategies)

1. **Warm outreach + community seeding** — first 500–1,000 users, zero cash, 60-day window only.
2. **ASO** — mandatory but needs install velocity first; compound long-term channel.
3. **Viral loop / share cards** — build now, activate at Month 4–6 when percentile pool is large enough.
4. **Content marketing** — 100% anchored to "where do you rank?" angle. No generic fitness tips.
5. **Micro-influencer seeding** — Month 2–4, portfolio of 10–20, rev-share model.
6. **Paid ads** — $50–100/week from Month 1 for learning data; scale only after Month 4 with proven ROAS.

Full strategy with steel-man counter-arguments: `marketing_subteam_skill.md`.

---

## Phase Status (as of 2026-05-16)

| Phase | Status |
|-------|--------|
| A — Qt prototype | ✅ CLOSED |
| B — Production stack | ✅ CLOSED |
| C — AI plans + constraints + privacy | ✅ CLOSED |
| D — React Native app + wearables | ✅ CLOSED (TICKET-028/029 blocked on dev accounts) |
| E — Visual design overhaul | 🔄 IN PROGRESS — E-001/001b/002 done; E-003 through E-009 open |

**New pre-launch requirements locked (2026-05-16):**
- **PL-1:** Seeded template library (5–6 curated templates: PPL, Upper/Lower, Beginner 3-day, cardio starter). Blocks Derek persona. S–M effort.
- **PL-2:** CSV import (Garmin/Strava format) — bridges wearable gap for Priya persona until Garmin OAuth ships. M effort.
- **PL-3:** Rest day designation (3-state streak: logged / intentional rest / missed) — Priya persona blocked without it. S effort backend, 0.5 day frontend.

**Open exec decisions (action required before Phase E E-005 screen layout freezes):**
- OD-1: RPE vs. RIR — does RIR satisfy Marcus's request, or is a separate RPE field needed on the set logging form?
- OD-2: Wilks — implemented or deferred to Phase 3?
- OD-3: AI plan calendar view — week-grid required at launch or list view sufficient?
- OD-4: Body composition goal flow — launch or Phase 3?

---

## CEO Output Format

1. Business impact assessment
2. Decision with rationale
3. What success looks like in 90 days
4. What would change this decision

## CTO Output Format

1. Assessment: sound / needs revision / reject + reason
2. Risks identified
3. Recommended changes or alternatives
4. Technical debt score (Low / Medium / High)
5. Items to escalate to CEO

## PM Output Format

1. Feature priority recommendation
2. User segment most affected
3. Success metric and measurement method
4. Dependencies or blockers
