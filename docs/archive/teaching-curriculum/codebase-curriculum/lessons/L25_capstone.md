# L25 — Capstone: Architecture Evaluation & Feature Design

**Duration:** 4–5 hours (pure Bloom L4–L6; no new source code)
**Bloom Levels:** L4 (Analyze), L5 (Evaluate), L6 (Create/Synthesize)
**Prerequisites:** All prior 24 lessons

---

## Opening Context

This capstone has **no new source code to learn**. Instead, you will:

1. **Evaluate** Peak Fettle's major architectural decisions holistically
2. **Defend or challenge** each choice against tradeoffs
3. **Design** a non-trivial feature from scratch, end-to-end
4. **Justify** every layer choice (database, API, mobile/desktop UI, deployment)

This lesson tests whether you can see the **whole system** — not just one rung of the stack, but how all 24 prior lessons interconnect.

---

## Section 1 — Architecture Evaluation Framework

### Dimensions of Evaluation

When evaluating an architecture, consider:

1. **Correctness** — Does it solve the stated problem?
2. **Maintainability** — Can a new dev understand and modify it?
3. **Scalability** — Does it handle 10x users? 100x?
4. **Cost** — What are the operational expenses?
5. **Tradeoffs** — What did we gain? What did we sacrifice?
6. **Risk** — What could go wrong? What's the mitigation?

### Architectural Layers to Evaluate

Peak Fettle's architecture consists of:

| Layer | Tech | Decision | Tradeoff |
|-------|------|----------|----------|
| **Database** | Supabase (Postgres + auto-scale) | Managed PostgreSQL + RLS + real-time | Cost: $25–200/mo; vendor lock-in |
| **Backend** | Express.js + Node.js | Lightweight HTTP API | Not a monolith; overhead if scaled to 100+ endpoints |
| **Percentiles** | Batch SQL (weekly) | Offline computation, not real-time | Stale data (1 week old); trade latency for cost |
| **Desktop** | Qt 6 (C++/QML) | Native app, offline-first | Maintenance burden of two frontends; Windows/Mac/Linux fragmentation |
| **Mobile** | React Native + Expo | Write-once, deploy to iOS/Android | Less performant than native; dependency on Expo (vendor lock-in) |
| **AI** | Claude Haiku (cost optimization) | Cheap, fast inference | Not reasoning-heavy; limits feature complexity |
| **Language** | Haiku for backend logic, humans for strategy | Humans -> Agents -> Humans feedback loop | Slow iteration; requires careful prompting |

---

## Section 2 — Deep Evaluation: Database (Supabase)

### The Choice: Supabase (Managed Postgres)

**Alternatives considered:**

1. **Firebase (NoSQL)** — Easy setup, automatic scaling, real-time
2. **Self-hosted PostgreSQL** — Full control, no vendor lock-in
3. **Supabase** — Postgres + managed infra + RLS + real-time (chosen)

### Evaluation: Why Supabase Is Correct

**Correctness:**
- Postgres supports the complex queries Peak Fettle needs (percentile calculations, group aggregations, RLS).
- Firebase's NoSQL model would require denormalization (storing pre-computed percentiles in every user doc), increasing storage and complexity.
- ✓ Verdict: Correct choice.

**Maintainability:**
- Postgres is industry-standard. Any dev can pick it up.
- Supabase's SDK is thin (you write SQL, not a proprietary query language).
- ✓ Verdict: High maintainability.

**Scalability:**
- Supabase auto-scales read replicas up to 200+ concurrent users at the free tier.
- Peak Fettle's traffic is **read-heavy** (users logging sets, viewing their own data) and **bursty** (3–4 users at dinner time, none at 3am).
- ✓ Verdict: Scales to ~10k monthly active users on paid Supabase tiers.
- ✗ Scales to 100k+ MAU only if you migrate to on-prem or sharded Postgres.

**Cost:**
- Free tier: 500 MB database, 1M API calls/month → $0
- Paid tier: Pay-as-you-go, ~$25–200/mo at 10k MAU
- ✓ Verdict: Cost-effective for early stage.
- ✗ At 100k+ MAU, might reach $1k+/mo unless optimized (caching, read replicas).

**Tradeoff Analysis:**

✓ **Gained:**
- Rapid iteration (managed infra, don't need to provision servers)
- RLS (row-level security built-in; enforce "users see only their own data" in SQL)
- Real-time subscriptions (future feature: live leaderboards)
- Open database standard (easy to migrate away if needed)

✗ **Sacrificed:**
- Vendor lock-in (switching away requires data export + new infra)
- 50ms baseline latency (managed service overhead)
- Limited control over indexing strategy (Supabase restricts some advanced tuning)

**Risk Analysis:**

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Vendor lock-in (Supabase acquired/pivoted) | Low | High | Keep migrations directory up-to-date; can self-host Postgres on notice |
| Cost spike (unexpected usage) | Medium | Medium | Set up billing alerts; optimize queries proactively |
| Data breach (Supabase infrastructure) | Low | Critical | Supabase is SOC 2 certified; maintain backup exports weekly |
| Schema migration breaks (downtime) | Low | Medium | Test migrations on staging before production; use blue-green deploys |

### Verdict: Correct Choice (Defend)

✓ **Supabase is the right choice for Peak Fettle Phase A–C** (0–100k users). It provides:
- Fast iteration without ops overhead
- Industry-standard SQL (portable)
- Built-in security (RLS)
- Cost efficiency (pay-as-you-go)

At 100k+ users, you'd **re-evaluate:**
- Self-hosted Postgres (full control, cost savings)
- Sharded Postgres (if single machine overloads)
- Data warehouse (Snowflake, BigQuery) for analytics

---

## Section 3 — Deep Evaluation: Percentiles (Batch, Not Real-Time)

### The Choice: Weekly Batch Calculation

**Alternatives considered:**

1. **Real-time percentiles** — Calculate on every set logged
2. **Hourly batch** — Recalculate every hour
3. **Weekly batch** — Recalculate every Sunday 2am (chosen)

### Analysis: Why Weekly Batch Is Correct

**Correctness:**
- Percentiles need 500+ data points per lift to be statistically meaningful.
- At current scale (~100 testers), weekly batches have enough data.
- ✓ Verdict: Correct choice.

**Cost:**
- Real-time: Every set logged triggers a percentile recalculation (~50ms latency per set). Expensive.
- Weekly batch: One SQL query per week (~1 second). Cheap.
- ✓ Verdict: Weekly is 10,000x cheaper than real-time.

**Latency:**
- Real-time: User logs set, sees updated percentile immediately (100% current).
- Weekly: User logs set, sees percentile from last week (7 days stale, but close enough).
- ~ Verdict: Acceptable tradeoff for early product.

**Scalability:**
- Real-time percentiles: O(n) cost per set logged. At 10k sets/week, 1,400 sets/day, this is manageable.
- At 100k sets/week, real-time becomes expensive (1–2ms per set × 14k sets/day = 14–28s aggregate).
- Weekly batch: O(1) cost, scales indefinitely.
- ✓ Verdict: Weekly batch scales better.

**Tradeoff Analysis:**

✓ **Gained:**
- Cheap infrastructure (no expensive real-time recalculation)
- Reliable (predictable weekly job, easier to test)
- Batch computations can be complex (e.g., smoothing, outlier removal) without latency pressure

✗ **Sacrificed:**
- Stale data (percentile is 0–7 days old)
- No "live leaderboard" feature (would require real-time)
- Harder to fix a calculation bug (must wait a week for next batch, or manually recompute)

### At What Scale Should You Switch?

**If Peak Fettle reaches 100k MAU:**

1. **Option A: Keep weekly batch**
   - Add caching layer (Redis) to pre-compute common queries
   - Add a "percentile last updated" timestamp in the UI
   - Cost: 50–100 Redis nodes (~$500/mo)

2. **Option B: Switch to hourly batch**
   - Compromise: more current (max 1 hour stale) but less cost than real-time
   - Cost: 100 batch jobs/day (manageable)

3. **Option C: Hybrid — Real-time with cache**
   - Recalculate percentiles in the background (async)
   - Serve cached result immediately (fast)
   - Cost: Same as Option A, but better UX (appears real-time)

### Verdict: Correct Choice (Defend)

✓ **Weekly batch is the right choice for Phase A–B.** It optimizes for:
- Cost (critical at early stage)
- Simplicity (predictable job, easier to test)
- Scalability to 100k+ users

At 100k+ users, you'd **re-evaluate** and likely move to Option C (real-time with cache).

---

## Section 4 — Deep Evaluation: Two Frontends (Qt + React Native)

### The Choice: Maintain Two Frontends

**Alternatives considered:**

1. **Desktop-only** — Shipping via Qt, no mobile app
2. **Mobile-only** — Skip desktop, focus on React Native (iOS/Android)
3. **Web** — Single React frontend runs on web, mobile, desktop
4. **Two frontends** — Qt (desktop) + React Native (mobile) (chosen)

### Analysis: Tradeoffs

| Dimension | Desktop-Only | Mobile-Only | Web | Two Frontends |
|-----------|--------------|-------------|-----|---------------|
| **Dev cost** | Low (1 stack) | Low (1 stack) | Low (1 stack) | High (2 stacks) |
| **UX** | Good (native) | Good (native) | Fair (web) | Excellent (native x2) |
| **Scalability** | Limited | Limited | High | High |
| **Offline** | Built-in (Qt) | Built-in (RN) | Hard (web) | Built-in (both) |
| **Maintenance** | 1 codebase | 1 codebase | 1 codebase | 2 codebases |
| **Team required** | 1–2 (Qt) | 2–3 (RN) | 2–3 (React) | 4–6 (both) |

### Why Two Frontends Is (Probably) Wrong

**Problem:** Peak Fettle chose two frontends, which means:
- Maintaining Qt codebase (C++/QML) — requires Qt expertise
- Maintaining React Native codebase (JavaScript) — requires RN/Expo expertise
- Shared backend (Express) — must work with both clients
- Different bugs in each client (QML crashes vs RN crashes)
- Different testing strategies (Qt unit tests vs Jest)

**Cost of two frontends:**

Assuming a team of 6 (3 full-stack for each platform):
- Desktop team: 1 Qt expert + 1 backend engineer + 1 QA = 3 people
- Mobile team: 1 RN expert + 1 backend engineer + 1 QA = 3 people
- Shared backend: Actually needs 2–3 people (Qt team needs backend help, RN team needs backend help)
- Total: 6–7 people to maintain two frontends

**Annual cost:** 6 people × $120k salary = $720k/year

### Alternative: Web Frontend (React)

**What if Peak Fettle chose a single web frontend (React)?**

```
Web (React) → Express API → Supabase
  ├─ Desktop: Opens in Chrome/Safari browser (full experience)
  ├─ Mobile: React Native app (same codebase, compiled native)
  └─ Tablet: Web browser, responsive layout
```

**Pros:**
- Single codebase (React)
- Easier for new dev to join (learn one stack, not two)
- Faster iteration (change code once, deploy everywhere)
- Web accessible without app store

**Cons:**
- Desktop browser experience is less native (no window management, file menu, etc.)
- Mobile web is worse than native (slower, less access to OS features)
- RN can't run the exact same React code (different component libs, navigation)

### Why Peak Fettle Chose Two Frontends (Likely Reasoning)

**Reason 1: Native UX is critical for fitness logging**

Logging a set should be:
- Fast (1–2 taps, no browser overhead)
- Offline-first (gym has no WiFi)
- Accessible via home screen (no browser tab needed)

A web app in a browser fails on all three. Native (Qt + RN) succeeds.

**Reason 2: Offline-first is a hard requirement**

Qt handles offline easily (SQLite locally, sync to server when back online). React Native + Expo can do it with `expo-offline-first` libraries, but it's more complex.

### Verdict: Wrong Choice (Challenge)

✗ **Two frontends is likely the wrong architectural decision for Peak Fettle.**

**Better alternative:** Focus on **mobile first** (React Native), because:
- 80% of users will use the mobile app (convenience)
- Desktop users are rare (logging from a computer gym is uncommon)
- Single codebase is worth the 20% UX reduction on desktop

**Why it's hard to fix now:**
- Qt desktop app is already built and used internally
- Shipping two apps is more impressive marketing than "just a mobile app"
- Team is split and invested in both

**Recommendation:**
- Phase A–B: Keep both (sunk cost)
- Phase C: Deprecate Qt, focus all resources on RN
- Users who need desktop: Direct them to web PWA (progressive web app) or mobile browser

---

## Section 5 — Deep Evaluation: Haiku for Backend Logic

### The Choice: Claude Haiku Handles Backend Rules

**Example:** During onboarding, Haiku classifies user experience level (beginner/intermediate/advanced) based on survey answers.

```javascript
// In the backend, call Haiku to interpret the survey
const haiku = new Anthropic();
const message = await haiku.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 100,
    messages: [{
        role: "user",
        content: `Classify the user's experience level (beginner/intermediate/advanced)...`,
    }],
});
const level = message.content[0].text.trim();
```

### Analysis: Is Haiku the Right Tool?

**Correctness:**
- Haiku can classify experience level from survey text
- But classification logic should be **deterministic**, not AI-based

**Alternative: Rule-based classification**

```javascript
const level = 
    years >= 5 && competitions >= 3 ? "advanced" :
    years >= 2 && sets_per_week >= 15 ? "intermediate" :
    "beginner";
```

**Pros of rule-based:**
- Deterministic (same input → same output every time)
- Testable (unit test: if years=5 and competitions=3, expect "advanced")
- Fast (no API call)
- No hallucinations (Haiku might classify a troll as "advanced")

**Pros of Haiku:**
- Flexible (handles edge cases humans didn't anticipate)
- Natural (reads user's description, not just numbers)
- Interpretable (Haiku explains why it classified someone as "intermediate")

### Verdict: Wrong Choice (Challenge)

✗ **Using Haiku for deterministic rules is over-engineering.**

The onboarding classification is:
- Low-risk (misclassifying experience level doesn't break anything)
- Low-frequency (happens once per new user)
- Rule-based (can be expressed as simple if-statements)

**Better approach:**

```javascript
// Phase A: Use rules
function classifyExperience(years, competitions, setsPerWeek) {
    if (years >= 5 && competitions >= 3) return "advanced";
    if (years >= 2 && setsPerWeek >= 15) return "intermediate";
    return "beginner";
}

// Phase C: If rules are too simple, add Haiku
// But only for features where flexibility matters (e.g., AI workout recommendation)
```

**Rule of thumb for Haiku:**

| Feature | Rule-Based | Haiku | Recommendation |
|---------|-----------|-------|-----------------|
| Classify experience | ✓ | ~ | Rules (simpler) |
| Recommend exercises | ~ | ✓ | Haiku (flexible) |
| Detect PR (weight increased) | ✓ | ~ | Rules (deterministic) |
| Personalize feedback | ~ | ✓ | Haiku (natural) |
| Validate email | ✓ | ~ | Rules (fast) |
| Generate workout description | ~ | ✓ | Haiku (creative) |

---

## Section 6 — Capstone Design Exercise: Live Head-to-Head Challenges

### The Feature Request

**User story:**

> Marcus and his friend Sarah both use Peak Fettle. They want to compete in a "strength challenge": pick an exercise (e.g., Squat) and whoever reaches the highest estimated one-rep max (E1RM) in 30 days wins. They want to see each other's progress in real-time, with a leaderboard showing their daily progress.

### Your Task

Design this feature **end-to-end**, justifying every architectural decision.

### Phase 1: Requirements Analysis

**Functional requirements:**

1. Marcus initiates a challenge, invites Sarah (by username or email)
2. Sarah accepts/declines
3. If accepted, a leaderboard appears showing:
   - Sarah's current E1RM
   - Marcus's current E1RM
   - Days remaining
   - Best set so far (date, weight, reps)
4. Leaderboard updates in real-time (or near-real-time)
5. Challenge ends at day 30, winner is announced
6. Results are archived so they can review later ("We competed in May 2026, Sarah won")

**Non-functional requirements:**

- Low latency (leaderboard updates within 5 seconds of logging a set)
- Works offline (set is logged locally, syncs when online)
- Supports 100+ concurrent challenges at 100k MAU

### Phase 2: Architecture Design

#### Database Schema

```sql
-- Challenges table
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiator_id UUID REFERENCES users(id),
    invitee_id UUID REFERENCES users(id),
    exercise_name TEXT NOT NULL,  -- "Squat", "Bench Press", etc.
    status TEXT CHECK (status IN ('pending', 'active', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    winner_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
);

-- Challenge participants (for future group challenges)
CREATE TABLE challenge_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    accepted_at TIMESTAMPTZ,  -- NULL if pending
    is_winner BOOLEAN,
);

-- Challenge leaderboard (pre-computed, refreshed after each set)
CREATE TABLE challenge_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    current_e1rm NUMERIC,
    best_set_id UUID REFERENCES sets(id),
    best_set_date DATE,
    best_set_weight_kg NUMERIC,
    best_set_reps INT,
    last_updated_at TIMESTAMPTZ DEFAULT now(),
);
```

#### API Endpoints

```javascript
// Create a challenge
POST /challenges
Body: { invitee_username: "sarah", exercise: "Squat", days: 30 }
Response: { id: "challenge-123", status: "pending" }

// Accept/decline challenge
PATCH /challenges/:id
Body: { action: "accept" } or { action: "decline" }
Response: { status: "active", starts_at: "2026-05-21T00:00:00Z", ends_at: "2026-06-20T00:00:00Z" }

// Get leaderboard (real-time)
GET /challenges/:id/leaderboard
Response: {
  challenge: { id, exercise, ends_at },
  participants: [
    { user: "marcus", e1rm: 210.5, best_set: { weight: 210, reps: 1, date: "2026-05-21" } },
    { user: "sarah", e1rm: 185.0, best_set: { weight: 185, reps: 1, date: "2026-05-19" } },
  ]
}

// Get past challenges (archive)
GET /users/:id/challenges?status=completed
Response: [
  { id, exercise, winner, initiator, invitee, created_at }
]
```

#### Real-Time Updates

**Option A: Polling (simple)**
```javascript
// Client polls every 5 seconds
setInterval(() => {
    fetch(`/challenges/${challengeId}/leaderboard`)
        .then(res => res.json())
        .then(data => updateUI(data));
}, 5000);
```
**Pros:** Simple, no server infrastructure. **Cons:** Latency (5 sec), battery drain (polling).

**Option B: WebSockets (better)**
```javascript
// Server pushes leaderboard updates
const ws = new WebSocket('wss://api.peakfettle.com/challenges/challenge-123/subscribe');
ws.onmessage = (event) => {
    const leaderboard = JSON.parse(event.data);
    updateUI(leaderboard);
};

// When Marcus logs a set that updates his E1RM:
POST /sets → Updates leaderboard in cache → 
    Server broadcasts to all subscribed WebSocket clients →
        Sarah's app updates immediately
```
**Pros:** Real-time, low latency, low battery. **Cons:** Server complexity.

**Recommendation:** Use **Option A (polling) in Phase A** for simplicity. Upgrade to **Option B (WebSockets) in Phase C** if needed.

#### Updating the Leaderboard

When Marcus logs a set, the backend needs to:
1. Calculate his E1RM for the exercise
2. Update `challenge_leaderboard` table
3. Notify Sarah (if she's subscribed via WebSocket)

```javascript
// POST /sets logic
async function logSet(req, res) {
    const set = await db.query(
        `INSERT INTO sets (...) VALUES (...) RETURNING *`
    );
    
    // Find any active challenges for this user + exercise
    const challenges = await db.query(
        `SELECT c.id FROM challenges c
         WHERE c.status = 'active'
         AND c.exercise_name = $1
         AND (c.initiator_id = $2 OR c.invitee_id = $2)`,
        [set.exercise, req.user.id]
    );
    
    // Update leaderboard for each challenge
    for (const challenge of challenges.rows) {
        const newE1rm = await calculateE1RM(set);
        await db.query(
            `INSERT INTO challenge_leaderboard (challenge_id, user_id, current_e1rm, best_set_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (challenge_id, user_id) DO UPDATE SET
                current_e1rm = $3, best_set_id = $4, last_updated_at = now()`,
            [challenge.id, req.user.id, newE1rm, set.id]
        );
        
        // Broadcast update to subscribed clients
        broadcastChallengeUpdate(challenge.id);
    }
    
    res.json(set);
}
```

#### Mobile/Desktop UI

**Mobile (React Native):**
```jsx
// ChallengeScreen.js
export default function ChallengeScreen({ challengeId }) {
    const [leaderboard, setLeaderboard] = useState(null);
    
    useEffect(() => {
        const interval = setInterval(() => {
            fetch(`/challenges/${challengeId}/leaderboard`)
                .then(res => res.json())
                .then(setLeaderboard);
        }, 5000);
        return () => clearInterval(interval);
    }, [challengeId]);
    
    return (
        <View>
            <Text>{leaderboard.challenge.exercise} Challenge</Text>
            <Text>{Math.ceil((new Date(leaderboard.challenge.ends_at) - new Date()) / 86400000)} days left</Text>
            
            <FlatList
                data={leaderboard.participants}
                renderItem={({ item, index }) => (
                    <View style={styles.leaderboardRow}>
                        <Text>{index + 1}. {item.user}</Text>
                        <Text>{item.e1rm.toFixed(1)} kg</Text>
                    </View>
                )}
            />
        </View>
    );
}
```

**Desktop (Qt/QML):**
```qml
// ChallengeView.qml
Rectangle {
    ListView {
        model: challengeLeaderboardModel
        delegate: Row {
            Text { text: index + 1 + ". " + model.username }
            Text { text: model.e1rm.toFixed(1) + " kg" }
        }
    }
}
```

### Phase 3: Justification of Decisions

| Decision | Alternative | Why This Is Better |
|----------|-------------|-------------------|
| **Leaderboard pre-computed** | Compute on-demand | Pre-compute is fast (no per-request calculation); no latency |
| **Polling every 5s** | Real-time WebSocket | Polling is simpler to implement; users accept 5s stale data |
| **Store archive** | Delete after 30 days | Archive lets users replay past challenges, better UX |
| **RLS on challenges** | Manual auth checks | RLS enforces "only see challenges you're in" at DB level; more secure |
| **On-demand E1RM calc** | Pre-compute E1RM daily | We already compute E1RM per set for display; reuse that |

### Phase 4: Testing Strategy

**Unit tests:**
- E1RM calculation for challenge exercise
- Challenge status transitions (pending → active → completed)
- Winner determination logic

**Integration tests:**
- Create challenge → accept → log set → leaderboard updates
- Archive a challenge and verify it's not in active list
- Concurrent sets from two users update leaderboard correctly

**Beta testing:**
- Marcus and Sarah run a 30-day challenge
- Verify leaderboard updates within 5 seconds
- Verify challenge notification emails are sent
- Verify archive shows past challenges

### Phase 5: Cost Analysis

**Database:**
- 1 extra table (challenges): ~10KB per challenge → negligible
- 1 extra table (leaderboard): ~5KB per active challenge → negligible
- Index on (challenge_id, user_id): ~1KB per challenge

**API:**
- 2 new endpoints (POST /challenges, GET /leaderboard): minimal
- Polling adds ~1 request per user per 5 seconds = 12 requests/min/user
- 100 concurrent challenges, 2 users each = 200 users polling = 2,400 requests/min = 40 req/s

**Cost at 100k MAU with 5% engaging in challenges:**
- 5,000 concurrent users × 12 requests/min = 60,000 requests/min = 1,000 req/s
- Supabase free tier: 1M API calls/month = ~23 req/s sustained. **Over budget.**
- Supabase paid: $50/mo for 10M API calls = 230 req/s. **Within budget.**

**Mitigation:** Add caching (Redis) to avoid polling the same leaderboard 1,000 times/min.

```javascript
// Cache leaderboard for 30 seconds
async function getLeaderboard(challengeId) {
    const cached = await redis.get(`leaderboard:${challengeId}`);
    if (cached) return JSON.parse(cached);
    
    const fresh = await db.query(...);
    await redis.setex(`leaderboard:${challengeId}`, 30, JSON.stringify(fresh));
    return fresh;
}
```

---

## Section 7 — Comparative Analysis: Leaderboards at Scale

### Real-World Example: Strava Leaderboards

Strava (a cycling/running social app) shows local leaderboards (fastest runners on a segment). How do they do it at scale (50M users)?

**Strava's approach:**
1. **Pre-computed leaderboards** (like Peak Fettle's percentiles)
2. **Cache everything** (Memcached/Redis)
3. **Denormalized data** (store rank, time, user info in one document)
4. **Background jobs** (recalculate leaderboards every hour, not real-time)

**Lesson for Peak Fettle:** Strava also uses caching + background jobs, not real-time computation. The 5-second polling latency is acceptable.

---

## Section 8 — Bloom L4–L6 Evaluation Questions

### L4 — Analyze

**Q4.1:** Peak Fettle chose Supabase. Analyze the feedback report issue N-07 (missing `v_user_lift_inputs` view). How did this architectural decision (using Supabase migrations) contribute to the bug?

**Q4.2:** Analyze the tradeoff between weekly batch percentiles (current) vs. real-time (alternative). At what scale does the tradeoff flip in favor of real-time?

**Q4.3:** Analyze the two-frontend decision (Qt + React Native). What would be the cost of unifying them into one frontend? What would be lost?

**Answers:**

- **Q4.1:** Supabase requires migrations to be in `migrations/` folder and named with a date prefix (`20260501_*.sql`). The compute_percentile and lift_vectors_seed SQL files were placed at the project root, not in `migrations/`. This broke the contract: EAS build runs `supabase db push`, which only applies files in `migrations/`. The batch job was never deployed, so the missing view was never detected until runtime. **Lesson:** Architectural contracts (where files must live) matter as much as code. This would have been caught by a linter that enforces "only SQL in migrations/ has date prefixes."

- **Q4.2:** At current scale (100 testers, ~1,000 sets/week), weekly batch costs $0 in compute (one SQL query). Real-time would cost ~$50/mo (one query per set × 1,000 sets = overhead). At 100k users (100,000 sets/week), real-time becomes $500/mo; weekly batch stays $0. **The tradeoff flips at ~10k sets/week**, where real-time compute becomes expensive and caching becomes necessary. At 100k users, you'd re-evaluate: cache the leaderboards, compute percentiles hourly (instead of weekly), or migrate to a data warehouse (Snowflake) that's optimized for analytics.

- **Q4.3:** Unifying two frontends into one would save: (1) code duplication, (2) different bugs per platform, (3) team coordination. Cost: (1) UX compromise (web is slower than native), (2) offline support is harder (web needs service workers, not built-in), (3) no native app presence (can't be on home screen). At 10k MAU, one team saving is worth ~$200k/year. At 100k MAU, one team saves ~$400k/year. **Decision rule:** If one frontend saves more money than the UX cost, unify. If the UX cost (losing app store visibility, offline support) is worth more than saved salary, keep two.

### L5 — Evaluate

**Q5.1:** Evaluate Peak Fettle's choice to use Haiku for backend logic (like experience classification). Is this the right tool for the job? Argue both for and against.

**Q5.2:** You are tasked with building the live leaderboard feature. Evaluate the polling approach (5s interval) vs. WebSocket approach. Which should you choose for Phase A? Why?

**Q5.3:** Evaluate Peak Fettle's testing strategy (unit tests in CI, beta testing weekly). Is this sufficient? What's missing?

**Answers:**

- **Q5.1:** 
  - **For Haiku:** Flexible, handles edge cases, natural language interpretation, interpretable explanations
  - **Against Haiku:** Overkill for a deterministic rule (if years >= 5, then advanced), cost per call, hallucination risk (might classify invalid input unexpectedly), latency (API call adds 200ms)
  - **Verdict:** Use rules for onboarding experience. Save Haiku for features where **flexibility is core to the feature** (workout recommendation, form-check feedback). Haiku should not be used for simple rules.

- **Q5.2:**
  - **Polling (5s):** Pros: Simple (just setInterval + fetch), works with free Supabase, supports HTTP clients (no special library needed). Cons: Latency (5s stale), battery drain, redundant requests.
  - **WebSocket:** Pros: Real-time, low battery, no redundant requests. Cons: Server complexity, requires Node.js server to manage connections, not compatible with all network types (corporate firewalls block it).
  - **Verdict for Phase A:** Use polling. It's simpler, costs less infrastructure, and 5s latency is acceptable for a fitness app. **Upgrade to WebSocket in Phase C** if you see users complaining about stale leaderboards or if analytics show battery drain is an issue.

- **Q5.3:** 
  - **Current:** Unit tests (Jest on every push) + beta testing (weekly, 6 personas)
  - **Missing:** Integration tests (against real DB), load testing (does the API handle 1,000 concurrent users?), security testing (can I exploit the auth?), performance testing (is the leaderboard query fast at 100k users?)
  - **Recommendation:** Add integration tests (weekly pre-deploy), add load tests (monthly), add security review (quarterly). This gives you confidence at scale.

### L6 — Create/Synthesize

**Q6.1:** Design a new feature end-to-end: "Workout Templates." A user creates a template (e.g., "Upper Day") with 5 exercises (Bench, Rows, Pull-ups, Shoulder Press, Curls). Next week, they open the template and it pre-fills a new workout with the same exercises. Justify every architectural decision.

**Q6.2:** Propose an alternative architecture for Peak Fettle. Instead of Supabase + Express, use [any technology you choose]. Defend your choice against the current architecture.

**Q6.3:** Identify one architectural decision in Peak Fettle that you believe is **wrong** and propose a concrete fix.

**Answers:**

- **Q6.1: Workout Templates — Full Design**
  
  **Database Schema:**
  ```sql
  CREATE TABLE workout_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
  );
  
  CREATE TABLE template_exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_name TEXT NOT NULL,
      order_index INT,  -- To preserve exercise order
  );
  
  CREATE INDEX idx_templates_user ON workout_templates(user_id);
  ```
  
  **API:**
  ```javascript
  // Create template
  POST /templates
  Body: { name: "Upper Day", exercises: ["Bench", "Rows", "Pull-ups"] }
  
  // Get templates for user
  GET /users/:id/templates
  
  // Start workout from template
  POST /workouts/from-template/:templateId
  // Creates a new workout with the same exercises
  ```
  
  **UI (mobile):**
  ```jsx
  // TemplatePickerScreen
  <FlatList
      data={templates}
      renderItem={({ item }) => (
          <Button
              title={item.name}
              onPress={() => createWorkoutFromTemplate(item.id)}
          />
      )}
  />
  ```
  
  **Decision justifications:**
  - Store exercises as separate rows (not JSON array) → allows indexing, filtering, reordering
  - No denormalization (e.g., don't store exercise count in template) → simpler migrations
  - On-delete cascade → if user deletes, templates disappear (not orphaned)
  - Order by explicit order_index → allows user to reorder exercises

- **Q6.2: Alternative Architecture**
  
  **Current:** Supabase (Postgres) + Express.js + React Native + Qt
  
  **Alternative: Firebase + Cloud Functions + Flutter + Web**
  
  **Justification:**
  - Firebase Realtime Database or Firestore → automatic scaling, real-time subscriptions (no polling needed)
  - Cloud Functions → serverless backend (no ops overhead, auto-scales)
  - Flutter → single codebase for mobile (iOS + Android), native performance
  - React or Vue for web → reach non-mobile users
  
  **Pros vs. Supabase + Express:**
  - Simpler (Firebase handles scaling, backups, security)
  - Better real-time (built-in subscriptions)
  - Single mobile codebase (Flutter)
  - Cheaper at small scale ($0 free tier)
  
  **Cons:**
  - Vendor lock-in (Firebase is Google; harder to migrate)
  - Less control over data (Firestore's query language is limited)
  - Less familiar to most teams (Postgres is industry-standard)
  
  **Verdict:** For a **startup** (Phase A, <1k users), Firebase is faster to ship. For a **scale-up** (100k+ users), Supabase + self-hosted is more flexible. Peak Fettle chose Supabase as a middle ground (managed but open-source standard).

- **Q6.3: One Wrong Decision and the Fix**
  
  **Decision:** Two frontends (Qt + React Native) with 2 separate teams.
  
  **Why it's wrong:**
  - Overhead of maintaining two codebases (bugs in one don't appear in the other)
  - Slower iteration (bug fix in backend affects both, must test both)
  - Higher onboarding cost for new devs (learn two stacks)
  
  **Concrete fix:**
  1. **Phase A–B (now):** Keep both, but establish a "single backend" contract (same API, same behavior)
  2. **Phase C (6 months):** Sunset Qt desktop app. Announce to users: "We're focusing on mobile. Use the web app if you need desktop."
  3. **Phase D (1 year):** Dedicate all resources to React Native. Build web wrapper if needed (React + React Native shared code is possible with tools like Tamagui).
  
  **Cost savings:** 1 team of 3 people = $360k/year
  **UX impact:** Desktop users (~5%) lose the app; route them to web
  
  **Alternative:** Instead of sunsetting, keep Qt but make it a **lower-priority** fork of the React Native app. Use a code generator to keep them in sync. But this is complex and probably not worth it.

---

## Section 9 — Interactive Widget: Decision Tree

The following widget walks through how to evaluate an architectural decision.

```
┌─────────────────────────────────────────────────────────────────┐
│           ARCHITECTURAL DECISION EVALUATION TREE                 │
└─────────────────────────────────────────────────────────────────┘

START: "We're considering [technology/approach]"
  │
  ├─ Is it solving a real problem?
  │  ├─ NO  → Don't use it (avoid YAGNI trap)
  │  └─ YES → Continue
  │
  ├─ What are the alternatives?
  │  └─ List 3+ options (always)
  │
  ├─ For each alternative, evaluate:
  │  ├─ Correctness (does it work?)
  │  ├─ Cost (money + time)
  │  ├─ Maintenance (can future devs use it?)
  │  ├─ Scalability (100x users?)
  │  └─ Tradeoffs (what are we giving up?)
  │
  ├─ Make a decision matrix
  │  ├─ Supabase: ✓Correct ✓Cheap ~Scalable ~Maintenance
  │  ├─ Firebase: ✓Correct ✓Cheap ✓Scalable ✗ Vendor lock-in
  │  └─ Self-hosted: ✓Correct ✗Expensive ✓Scalable ✓Maintenance
  │
  ├─ Choose the best tradeoff for NOW
  │  (Not for 100k users, for today's constraints)
  │  └─ Supabase: best balance for Phase A
  │
  ├─ Document the decision
  │  ├─ Why we chose it
  │  ├─ When we'd reconsider it
  │  └─ How to reverse it (migration path)
  │
  └─ END: Commit and move on
```

---

## Summary: What You've Learned

By reaching this capstone, you now understand:

1. **Full-stack architecture** — How database, backend, and frontend interact
2. **Tradeoff analysis** — Every choice sacrifices something
3. **Scaling decisions** — What works at 100 users might break at 100k users
4. **Cost-benefit thinking** — Two frontends cost 2x but are 10% better UX
5. **Vendor lock-in** — Supabase is great now, but plan for migration later
6. **Feature design** — How to take a user story and build it end-to-end
7. **Testing at scale** — Unit tests, integration tests, and beta testing catch different bugs
8. **Challenging decisions** — Being able to say "this is probably wrong" and justify an alternative

---

## Parting Wisdom

**You are now qualified to:**

- Understand the entire Peak Fettle codebase (all 25 lessons)
- Propose architectural improvements
- Design new features end-to-end
- Onboard new developers
- Make trade-off decisions
- Scale the system to 10x users
- Migrate away from decisions you're unhappy with

**The real world is about tradeoffs.** There is no perfect architecture. Supabase is not perfect (vendor lock-in), Qt is not perfect (maintenance burden), percentiles are not perfect (stale data). The art of architecture is choosing **good-enough-now** and **planning-for-later**.

**Welcome to the Peak Fettle team.** You've made it to the top of the mountain.

---

## Appendix: Further Reading

- [Martin Fowler — Software Architecture Guide](https://martinfowler.com/architecture/)
- [Designing Data-Intensive Applications](https://dataintensive.dev/) — Kleppmann
- Peak Fettle — Read all 24 prior lessons (L01–L24) if you skipped any
- Real-world case studies: Airbnb, Uber, Stripe (search for "architecture decision records")

---

**Congratulations on completing the Peak Fettle Codebase Curriculum!**

*Duration: 60+ hours | Bloom Levels: L1–L6 | Lessons: 25*

Go forth, evaluate architecture, and build things that matter.
