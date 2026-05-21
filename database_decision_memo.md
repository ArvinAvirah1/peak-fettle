# Peak Fettle — Database Decision Memo

**Authors:** CTO & CEO
**Date:** 2026-04-30
**Status:** Revised after percentile-as-batch insight
**Scope:** Backend database and BaaS selection for the Peak Fettle MVP and first 18 months of operation

---

## 1. Context and constraints

Peak Fettle is a solo-founded, small-investment fitness product targeting iOS, Android, and Windows. Core features include set tracking with graphing, competitive target creation, percentile rankings versus other users, and (on the paid tier) AI-generated personalized fitness plans across weightlifting, cardio, and sports. The backend must securely store critical client information (workout history, biometric data, goals, payment metadata) at a cost compatible with a one-person operation.

A revised technical assumption changes the calculus from the prior memo: **percentile rankings do not need to be computed in real time during each user interaction.** Fitness progress moves on a weekly-to-monthly timescale, not minute-to-minute. The percentile distribution can be recomputed periodically by a scheduled job (e.g., nightly or weekly), stored as a vectoring function (a precomputed CDF lookup keyed by lift, body-weight class, age band, and sex), and resolved on the client or via a single keyed read at request time. This neutralizes what was previously the strongest argument for a relational database — that SQL window functions made percentile cheap — and forces an honest reweighting of every other option.

---

## 2. Steel-manning each candidate

Before recommending, here is the most charitable, fair-minded case for each option, evaluated on its own merits.

### 2.1 Firebase (Firestore + Auth + FCM + Crashlytics)

The best case for Firebase is that it is the lowest-friction, highest-velocity stack on the market for a solo mobile developer. Firestore's offline-first sync is genuinely best-in-class — writes are queued locally, replayed on reconnect, and reconciled with server state automatically. For a fitness app where users log sets in dead-zone basement gyms, this is not a "nice to have"; it is the difference between an app that works and one that frustrates. Firebase Auth handles every provider a fitness app could need (Apple, Google, email, phone) with battle-tested SDKs. FCM delivers push notifications free on both iOS and Android. Crashlytics, Analytics, Remote Config, and A/B Testing are bundled — eliminating four separate vendors and SDK integrations. The free Spark tier is generous enough to validate the product entirely without spending a dollar, and Firestore scales horizontally with no operator effort. Once percentile is moved off real-time queries, the per-read pricing concern collapses: lookups become single-document reads at fractions of a cent. Google's longevity is not in serious doubt. For a one-person team optimizing for time-to-market over architectural purity, Firebase is a defensible default choice.

### 2.2 Supabase (managed Postgres + Auth + Storage + Realtime)

The best case for Supabase is that it offers the only modern BaaS built on an open-source relational core, which means no vendor lock-in, predictable flat-rate pricing, and a data model that ages well. Postgres is the most flexible analytical engine ever shipped — even with percentile moved to batch, every other reporting need (workout streaks, lift trends, adherence rates, founder-driven ad-hoc queries) is one SQL statement away rather than a custom aggregation pipeline. Row-level security policies provide a clean, auditable boundary between users that lives in the database itself, not scattered across application code. The bundled feature set (auth, storage, edge functions, realtime subscriptions) eliminates several would-be vendors. The Pro tier is a flat $25/month, which means cost is predictable from the first paying user through tens of thousands of MAUs — a meaningful advantage when the AI-generation feature on the paid tier will already create variable cost the founder cannot fully control. If the company is ever acquired, raises a Series A, or simply outgrows the managed tier, `pg_dump` is the entire exit plan. Optionality is one of the few advantages a small product has over funded competitors, and Supabase preserves it.

### 2.3 MongoDB Atlas (with Realm for offline sync)

The best case for MongoDB Atlas is that it is the only option whose data model is genuinely shaped like the domain. A personalized fitness plan is a tree — program contains weeks, weeks contain days, days contain exercises, exercises contain sets, each level with arbitrary attributes (notes, tempo, RPE, AI-generated coaching cues). Storing that as a single document is one read, one write, no joins, and the schema can evolve freely as the AI plan generator adds new fields. Realm provides Firestore-class offline sync with automatic conflict resolution and is purpose-built for mobile. Atlas Search is built in, making exercise lookup and plan search trivial without bolting on Algolia. The aggregation pipeline can handle the periodic percentile batch job natively. Free tier covers 512 MB of storage, and Atlas runs on AWS, GCP, or Azure — multi-cloud rather than locked to a single vendor. For a product whose core paid feature is AI-generated, schema-fluid workout plans, MongoDB's document model is the most natural fit on offer.

### 2.4 AWS Amplify (Cognito + DynamoDB or Aurora Serverless v2 + AppSync)

The best case for AWS Amplify is that it is the only option that scales without a re-platforming event. AppSync provides GraphQL with offline sync and conflict resolution comparable to Firestore. Cognito handles auth at any scale with HIPAA-eligible configurations available out of the box, which matters if Peak Fettle ever expands into clinical, insurance, or B2B-corporate-wellness markets where compliance posture is a procurement gate. DynamoDB scales writes to effectively unlimited throughput; Aurora Serverless v2 offers a Postgres-compatible relational option that scales to zero when idle. Reserved capacity, savings plans, and committed-use discounts give a sophisticated operator levers to manage cost that no managed BaaS provides. The AWS service catalog (SES for email, SNS for push, S3 for media, Lambda for backend logic, Bedrock for AI) means future features rarely require new vendors. For a founder who anticipates raising capital and scaling aggressively, starting on AWS avoids a painful migration later.

### 2.5 Appwrite (open-source BaaS, self-hostable or cloud)

The best case for Appwrite is that it offers the same bundled BaaS feature set as Supabase and Firebase — auth, database, storage, functions, realtime — at a lower price point and with the option to self-host on a $10/month VPS if cloud costs ever become uncomfortable. Its database supports document storage with optional relations, splitting the difference between strict relational and pure NoSQL. The cloud free tier is competitive, and the self-hosted option is genuinely production-viable, not a hobbyist toy. For a founder who is comfortable with infrastructure and wants the absolute floor on operating cost while retaining BaaS ergonomics, Appwrite is the most cost-defensive choice on offer.

### 2.6 Self-hosted Postgres on a VPS

The best case for self-hosted Postgres is uncompromising cost and control. A $10/month DigitalOcean or Hetzner droplet running Postgres with daily backups to S3 is the cheapest production database option available, and it offers every feature the managed tiers do at none of the markup. The founder retains full control over extensions, tuning, and replication strategy. There is no vendor at all, which means no risk of pricing changes, deprecation, or acquisition-driven product decline. For a technically capable solo founder who values independence and is comfortable owning their infrastructure, this is the option that maximizes margin per paying user.

---

## 3. Honest weaknesses revealed by steel-manning

Steel-manning each option also clarifies what each one costs.

Firebase locks the data model into a proprietary document store with no clean exit; pricing is per-operation, which means a viral moment creates a surprise bill rather than a predictable monthly cost; and the bundled analytics, while convenient, are owned by an advertising company, which has implications worth weighing.

Supabase requires the founder to integrate FCM, an analytics provider, and an offline-sync layer (PowerSync, WatermelonDB, or homegrown) separately, because none of those are in the box. Mobile SDKs are younger and rougher than Firebase's. Free-tier projects pause after seven days of inactivity, which stings during sporadic early development.

MongoDB Atlas is more expensive than Supabase or Firebase at comparable scales (the M10 dedicated cluster is $57/month versus $25/month Supabase Pro). Realm sync requires App Services configuration that is more involved than Firestore's near-zero setup. The aggregation pipeline is powerful but has a steeper learning curve than SQL.

AWS Amplify has the steepest learning curve of any option, the least predictable pricing, and the highest operational overhead. For a one-person team optimizing for time-to-market, this is almost certainly the wrong starting point regardless of how attractive the long-term scaling story is.

Appwrite has a smaller community than Firebase or Supabase, fewer third-party integrations, and a smaller talent pool of developers familiar with it. If the founder ever hires, onboarding cost is real.

Self-hosted Postgres puts the founder on the hook for backups, security patches, monitoring, OS upgrades, and incident response. A solo founder's time is the scarcest resource in the company, and managed services exist precisely to buy that time back.

---

## 4. Cost projection across realistic scale tiers

| Stage | Users (MAU) | Firebase | Supabase | MongoDB Atlas | Amplify | Appwrite Cloud | Self-hosted |
|---|---|---|---|---|---|---|---|
| MVP / pre-launch | 0–500 | $0 | $0 | $0 | ~$5 | $0 | $10 |
| Early traction | 500–5,000 | $0–25 | $25 | $0–60 | $30–80 | $15 | $10–25 |
| Growth | 5,000–50,000 | $50–400 | $25–125 | $60–250 | $150–600 | $50–200 | $40–150 |
| Scale | 50,000–500,000 | $400–3,000 | $599+ (Team) or self-host | $250–1,500 | $600–4,000 | $200–800 | $150–500 |

Two observations from this table. First, at the stage Peak Fettle will actually live in for the first 12–18 months (under 5,000 MAU), every option is between free and $80/month — the choice is not really about cost in the near term, it is about feature fit and lock-in. Second, Firebase's variable pricing creates the widest spread at scale, which is a feature in the optimistic case (you only pay for what you use) and a risk in the pessimistic one (a viral leaderboard moment produces a bill the founder cannot absorb). Predictability has independent value when the operator is also the underwriter.

---

## 5. Decision matrix (revised with batch-percentile assumption)

| Criterion | Weight | Firebase | Supabase | MongoDB | Amplify | Appwrite | Self-host |
|---|---|---|---|---|---|---|---|
| Offline sync (gym connectivity) | High | 5 | 2 | 4 | 4 | 2 | 1 |
| Mobile SDK maturity | High | 5 | 3 | 4 | 4 | 3 | 2 |
| Schema flexibility for AI plans | High | 5 | 3 | 5 | 3 | 4 | 3 |
| Cost predictability | High | 2 | 5 | 4 | 2 | 5 | 5 |
| No vendor lock-in | Medium | 1 | 5 | 3 | 1 | 5 | 5 |
| Bundled push/analytics/crash | Medium | 5 | 1 | 2 | 4 | 2 | 1 |
| Security/compliance posture | High | 4 | 4 | 4 | 5 | 3 | 2 |
| Time to MVP | High | 5 | 4 | 3 | 2 | 4 | 2 |
| Founder operational overhead | Medium | 5 | 4 | 3 | 2 | 3 | 1 |
| Future analytics flexibility | Low | 2 | 5 | 4 | 5 | 3 | 5 |

The matrix is an aid, not an oracle. Two options score within a few points of each other, and the decision turns on which weights the founder personally believes are right.

---

## 6. Recommendation

**Primary recommendation: Supabase, with PowerSync for offline mobile sync and FCM for push notifications.**

Rationale: even after relaxing the percentile-as-real-time argument, Supabase still wins on the dimensions that compound over the life of the product — predictable cost, no lock-in, a relational core that absorbs every future analytics need without re-platforming, and row-level security as a clean compliance boundary. The known weaknesses (offline sync, push, analytics not in the box) are addressable with specific, well-supported third parties: PowerSync handles offline sync against Postgres natively, FCM is free, and PostHog covers analytics and crash reporting at a flat self-hosted price. The integration cost is real but bounded and pays for itself in cost predictability and exit optionality.

**Strong alternative: Firebase**, if and only if the founder values absolute time-to-market over lock-in concerns and is comfortable with variable pricing. Firebase is the right answer for a founder who wants to ship in three weeks instead of six and accepts that the data model is effectively a one-way door.

**Reject for now:** AWS Amplify (operational overhead too high for one person), MongoDB Atlas (cost premium not justified by document model when JSONB in Postgres covers the AI-plan use case adequately), Appwrite (smaller ecosystem creates hiring and support friction), and self-hosted Postgres (founder time is the scarce resource).

---

## 7. Implementation outline

The recommended stack at MVP:

- **Database & Auth:** Supabase (Postgres + Supabase Auth)
- **Offline sync:** PowerSync, configured against the Supabase Postgres instance
- **Push:** Firebase Cloud Messaging (free, no Firebase backend dependency)
- **Analytics & crash:** PostHog (self-hosted free tier or cloud at $0 below 1M events)
- **AI generation:** Anthropic or OpenAI API, called from Supabase Edge Functions
- **File storage:** Supabase Storage (for progress photos, exercise demo videos)

Schema sketch — relational core, JSONB for fluid shapes:

```
users(id, email, dob, sex, weight_class, created_at, ...)
exercises(id, name, category, muscle_groups, ...)
sets(id, user_id, exercise_id, weight, reps, rpe, performed_at, ...)
goals(id, user_id, exercise_id, target_weight, target_date, ...)
plans(id, user_id, name, plan_data JSONB, created_at, ...)  -- AI-generated tree lives in JSONB
percentile_vectors(lift_id, weight_class, age_band, sex, distribution JSONB, computed_at)
```

The `percentile_vectors` table is the materialization of the user's "vectoring function" idea — a scheduled job (Supabase cron, weekly) recomputes the distribution per lift and demographic segment, and the client resolves a user's percentile against the cached vector with a single keyed read.

---

## 8. Open risks and revisit triggers

The decision should be revisited if any of the following becomes true: PowerSync integration proves materially more painful than projected and offline reliability suffers (re-evaluate Firebase or MongoDB+Realm); MAU crosses 50,000 with sustained growth (evaluate moving to Supabase Team tier or migrating to self-hosted Postgres on managed Kubernetes); the product expands into clinical, insurance, or enterprise B2B markets where HIPAA or SOC 2 are procurement gates (evaluate Amplify or Supabase Enterprise); the AI-plan feature evolves into something where document-tree storage becomes dominant and the relational core feels vestigial (evaluate MongoDB Atlas with Realm).

The recommendation is right for the next 12–18 months and the current product scope. Keep this memo under version control and revise it when assumptions move.
