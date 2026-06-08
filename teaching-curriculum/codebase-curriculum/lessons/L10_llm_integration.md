# Lesson L10 — LLM integration: Claude Haiku plan generation

> **Track:** 1 — Backend services · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L10_llm_integration.html`](L10_llm_integration.html)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L09 (API fundamentals, authentication, database)

## 0. Source of truth (read fresh before teaching — code drifts)
- `routes/plans.js` — POST `/plans/generate` endpoint, request/response shapes, guard rails
- `lib/supabaseAdmin.js` — service role client for privileged operations
- `cost_analysis_reference.md` § 2.4 — LLM pricing, token estimates (5,000–7,000 per plan)
- `@anthropic-ai/sdk` package documentation — `messages.create()` API, streaming patterns
- User constraints: `user_constraints` table schema and the hard-block filter logic (lines 314–322)
- Health metrics, profile fields, exercise candidate pool (lines 314–355)

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Identify what a "structured output" API call is and when it's used instead of streaming.
- **(L2)** Explain why the paid tier is gated before the LLM call, and what "hard-block" constraints mean.
- **(L3)** Construct a user prompt from database context (history, health metrics, profile) and validate that it stays within the token budget.
- **(L4)** Analyze why Haiku was chosen over cheaper models (Gemini Flash, GPT-4o mini) and what "plan quality is the reason to exist" means.
- **(L5)** Evaluate the unit-economics case: at what subscriber price and regeneration frequency does Haiku's cost threaten margin, and what would you cache to break even?

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "Have you called an LLM API before (OpenAI, Anthropic, other)?"
- "Confidence with caching strategies (HTTP, query-result, token-level caching)?"
- "Cost-per-transaction decisions: do you think a 2.5¢ cost per generated plan is expensive or cheap for a fitness app?"
> Calibrate: plan generation is paid-tier only. If Arvin hasn't seen LLM APIs, spend extra time on the system/user message split. If cost knowledge is light, prime the unit-economics Q5.

## 3. Spacing carry-over (M14)
From L09 (authentication & RBAC): "Why does `req.user.id` come from the JWT payload, and why can't the client just send `user_id` in the body?"
> Today: the service-role key is even more sensitive. We'll see why.

## 4. The difficulty ladder for THIS lesson (M2)
1. The LLM API call shape: system prompt, user message, structured output.
2. Paid tier gating and what "free vs. paid" feature gates mean.
3. Loading user constraints (hard-block filter) and why contraindications are checked at DB query time.
4. Building the prompt from history (last 14 days), health metrics (last 7 days), and profile.
5. Parsing and validating the JSON response; retry strategy and error reporting.
6. Why Haiku, not Gemini Flash or GPT-4o mini (cost vs. quality vs. latency).
7. Unit-economics: margin calculation, breakeven pricing, caching strategies.

## 5. Concept sequence

### Concept 1: Calling an LLM API — the request/response shape
- **(M4) Generate first:** "You want to ask Claude to generate a workout plan from a user's history. What must you tell Claude, and what do you expect back?"
- **(M7) Concrete hook:** "System prompt tells Claude its role (coach), hard rules (only use these exercises, cite your reasoning), and output schema. User message gives the data (history, constraints, metrics)."
- **The idea:** LLM APIs separate static instructions (system prompt) from dynamic data (user message). The system prompt is **reusable across all calls**; the user message changes per user. This pattern minimizes token overhead and makes system-level changes (e.g., "you are now a strict reviewer") atomic.
- **Real code** (`routes/plans.js`, lines 407–432):
  ```javascript
  const systemPrompt = `You are a certified strength and conditioning coach building a single personalised workout session for a Peak Fettle user. Your response must be valid JSON only — no markdown, no prose outside JSON.

  HARD RULES:
  1. Only use exercises from the CANDIDATE LIST. Do not invent exercises.
  2. The "reasoning" field must cite at least one specific data point from the user's history, health metrics, or profile. Never write generic copy like "here is your workout".
  3. If the user has fewer than 3 sessions logged, reasoning must say: "You're new — this plan will adapt as you log more sessions."
  4. Honour all physical constraints — never suggest movements that the user has flagged as off-limits.
  5. Return 4–6 exercises per session. Include sets (3–5), reps (range e.g. "8-10"), rpe_target (1–10), rest_seconds (60–180).
  6. Every exercise MUST include a coaching_note: one concise sentence (10–20 words) describing technique focus or loading intent specific to this user's history. Never leave coaching_note blank or generic.

  JSON schema: { "session": { "exercises": [...] }, "reasoning": "..." }`;
  ```
- **(M6) Elaboration:** why are hard rules inside the system prompt and not post-processed? Because the model *learns from the rules* as part of understanding its job. A rule like "never invent exercises" is easier to honor if Claude sees it in the system context rather than after the fact. Post-processing can still validate (step 9), but the system prompt is the first line of defense.
- **(M3) Retrieval check:** "Why does the system prompt include the exact JSON schema, and not just 'respond in JSON'?"

### Concept 2: Paid tier gating — why features are locked
- **(M4) Generate first:** "A free user hits POST /plans/generate. What should the response be, and why not just return an empty plan?"
- **The idea:** AI-generated plans cost money (Haiku: ~2.5¢ per plan). A free user requesting a plan would burn margin. The endpoint checks `users.is_paid` **before calling the LLM** so a free user sees a 403 "upgrade copy" without any LLM cost.
- **Real code** (`routes/plans.js`, lines 283–294):
  ```javascript
  const { rows: userRows } = await pool.query(
      `SELECT is_paid FROM users WHERE id = $1`,
      [req.user.id]
  );
  if (!userRows[0]?.is_paid) {
      return res.status(403).json({
          error: 'paid_tier_required',
          message: 'AI-generated plans are a paid-tier feature. ' +
                   'Upgrade to Peak Fettle Pro to unlock personalised training.',
      });
  }
  ```
- **(M6) Elaboration:** the message is upgrade copy, not a technical error. This teaches the client's UX team what to show (a "Upgrade to Pro" button, not "error: forbidden").
- **(M9 faded):** "What would happen if we didn't gate? A malicious user or a script could hammer the endpoint with fake requests, costing $X per call." → seed for quiz q5.

### Concept 3: Hard-block constraints — the contraindications filter
- **(M7) Concrete:** "A user logs they can't do overhead presses (shoulder injury). The candidate exercise list should never include 'Military Press' or 'Lateral Raises'."
- **The idea:** User constraints have a `constraint_type` (e.g., "shoulder_injury") and map to exercise `contraindications` arrays. **The query filters constraints at DB time**, not in the app. This ensures Claude never even sees exercises the user can't do — no post-processing, no trust in the model to respect the rule.
- **Real code** (`routes/plans.js`, lines 296–322):
  ```javascript
  // Load constraints: which movement patterns are off-limits
  const { rows: constraintRows } = await pool.query(
      `SELECT constraint_type, custom_note
       FROM user_constraints
       WHERE user_id = $1`,
      [req.user.id]
  );
  const constraints = constraintRows;
  const blockedTags = constraints
      .map(c => c.constraint_type)
      .filter(t => t !== 'custom');

  // Hard-block: any exercise whose contraindications overlap with blockedTags
  // is excluded from the candidate pool entirely.
  const { rows: exerciseRows } = await pool.query(
      `SELECT id, name, category, muscle_groups, is_compound, contraindications
       FROM exercises
       WHERE category = 'lift'
         AND ($1::text[] IS NULL
              OR NOT (contraindications && $1::text[]))
       ORDER BY name`,
      [blockedTags.length > 0 ? blockedTags : null]
  );
  ```
- **(M3) Retrieval check:** "What does the `&&` operator do in SQL, and why not just list exercise IDs in the constraint?"
- **(M12) Checkpoint:** The hard-block pattern appears in production systems everywhere (recommendation engines, content moderation). It's a design pattern worth recognizing.

### Concept 4: Building the prompt from user context
- **(M7) Concrete:** "A user has 10 workouts logged in the last 14 days. Their bench press max is 140 kg. Their heart rate last night was 65 bpm; they slept 6 hours. All of that goes into the user message so Claude can write meaningful reasoning."
- **The idea:** The prompt is assembled from four database queries: constraints (hardened above), exercise history (14 days), health metrics (7 days), user profile (age, weight, experience). Each is formatted as human-readable text so Claude's context window is not wasted on JSON overhead.
- **Real code** (`routes/plans.js`, lines 357–405):
  ```javascript
  // History: last 14 days, lift sets only (kind = 'lift'), with computed E1RM
  const { rows: historyRows } = await pool.query(
      `SELECT
          e.name                      AS exercise_name,
          s.weight_raw / 8.0          AS weight_kg,
          s.reps,
          s.rir,
          CASE
              WHEN s.kind = 'lift' AND s.weight_raw > 0 AND s.reps >= 1 THEN
                  CASE
                      WHEN s.reps = 1 THEN s.weight_raw / 8.0
                      ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
                  END
              ELSE NULL
          END                         AS e1rm_kg,
          w.day_key
       FROM sets s
       JOIN workouts w ON w.id = s.workout_id
       JOIN exercises e ON e.id = s.exercise_id
       WHERE w.user_id = $1
         AND w.day_key >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY w.day_key DESC, e.name
       LIMIT 80`,
      [req.user.id]
  );

  const historyText = historyRows.length > 0
      ? historyRows
          .map(r => `${r.day_key}: ${r.exercise_name} — ${r.weight_kg}kg × ${r.reps} reps` +
                     (r.rir != null ? ` (RIR ${r.rir})` : '') +
                     (r.e1rm_kg ? ` [e1RM ${r.e1rm_kg.toFixed(1)}kg]` : ''))
          .join('\n')
      : 'No recent history logged yet.';
  ```
- **(M6) Elaboration:** E1RM is computed inside the query (Epley formula with the reps=1 exception). Why not pre-compute? Because the set row doesn't store E1RM — it's a derived metric, just like in L01. Storing it would risk drift.
- **(M8) Diagram (in app):** a flow diagram showing data → database queries → format as text → system+user prompt → call Haiku → parse JSON.
- **(M4/M9 faded):** "The exercise candidate list is capped at 60. Why? Token budget — too many exercises bloats the prompt and risks hitting the 5,000-token budget." → quiz q3.

### Concept 5: Calling the API, parsing the response, and retry strategy
- **(M7) Concrete:** "Haiku returns a JSON string. We parse it. If it's malformed, we return a 502 'ai_parse_error' so the client knows to retry."
- **The idea:** Structured output (JSON) is simpler to parse than streaming text, but it **can fail**. Fallible steps are:
  1. JSON parsing (string → object).
  2. Schema validation (does it have `session.exercises[]` and `reasoning`?).
  3. Exercise name resolution (do the names in the plan map to DB IDs?).
  
  Each failure is a **retriable error** (502, client should retry) or a **final error** (400, client shouldn't retry). This distinction guides the client's UX.
- **Real code** (`routes/plans.js`, lines 455–489):
  ```javascript
  const message = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
  });

  let aiResponse;
  try {
      const rawText = message.content[0].text.trim();
      aiResponse = JSON.parse(rawText);
  } catch {
      return res.status(502).json({
          error: 'ai_parse_error',
          message: 'Plan generation produced an unparseable response. Please try again.',
      });
  }

  if (!aiResponse?.session?.exercises || !Array.isArray(aiResponse.session.exercises)) {
      return res.status(502).json({
          error: 'ai_schema_error',
          message: 'Plan generation returned an unexpected structure. Please try again.',
      });
  }

  if (!aiResponse.reasoning || aiResponse.reasoning.trim().length === 0) {
      return res.status(502).json({
          error: 'ai_reasoning_missing',
          message: 'Plan generation did not include a reasoning field. Please try again.',
      });
  }
  ```
- **(M3) Retrieval check:** "Why return 502 (Bad Gateway) instead of 400 (Bad Request)? What's the difference in how a client should handle them?"
- **(M12) Checkpoint:** Does the response parsing strategy feel robust? What edge cases are missing?

### Concept 6: Why Claude Haiku, not Gemini Flash or GPT-4o mini
- **(M4) Generate first:** "You can generate plans with three models: Gemini Flash ($0.0025/plan), GPT-4o mini ($0.005/plan), or Claude Haiku ($0.025/plan) — 10x more expensive. Why pay?"
- **The idea:** In a product, the **reason to exist** justifies the cost. For Peak Fettle, plan generation is a paid-tier feature — users pay money to unlock it. If the plans are formulaic or generic, users churn. If the plans are thoughtful (citing specific PRs, adapting to health metrics, respecting constraints), users stay and renew. Haiku's quality difference (vs. Flash) is worth the 10x cost because it protects the product's primary value prop: **high-quality, personalized programming**.
- **Cost breakdown** (from `cost_analysis_reference.md`):
  - **Gemini 2.0 Flash:** $0.0025 per plan. Excellent latency (~200ms), but outputs are often generic ("do 4×8 squats, then bench press") with no specific reasoning.
  - **GPT-4o mini:** $0.005 per plan. Middle ground. Respects constraints reliably but sometimes overlooks a detail (e.g., forgets RIR field, hardcodes rep ranges instead of personalizing).
  - **Claude Haiku 4.5:** $0.025 per plan. Slowest (~2s), but output is **consistently coherent**. Cites specific data points, adapts rep ranges to RIR patterns, and reasons about energy systems. This is the difference between "I generated your plan" and "I read your PRs and you're undershooting bench rep ranges by ~2 reps based on your November session — here's why I went for 8 reps instead."
- **(M6) Elaboration:** "cheaper" models *improve fast*. Gemini Flash 2.0 (April 2026) was a 10x leap from its predecessor. If Flash pulls even closer to Haiku by mid-2026, the cost calculus shifts. The pattern to watch: **benchmark your model choice every 6 months**. Cost improvements often outpace feature improvements.
- **(M9 faded):** "If a user regenerates their plan weekly at $0.025/week, and you pay them $9.99/month to be a subscriber, you're spending 1¢ to earn $10 — margin is safe. But if regeneration is *unlimited* and power users hit the endpoint 50 times/month (tweaking), the economics flip. Caching busts this — see Q5."

### Concept 7: Unit-economics and caching — where the real decision lives
- **(M4) Generate first:** "You charge $9.99/month. A user regenerates their plan twice a week (likely scenario). Haiku costs 2.5¢ per plan. Is your margin safe?"
- **The idea:** Unit-economics is the argument that justifies paying for Haiku over Flash.
  - **Revenue:** $9.99/month = $0.33/day per subscriber.
  - **Cost (aggressive case):** 2 plans/week = 8 plans/month = $0.20/month.
  - **Margin:** $9.99 − $0.20 = $9.79 gross (before server, storage, customer support, etc.).
  
  **Safe?** Yes, until:
  - Users demand *unlimited* regeneration (50+/month per power user). Cost → $1.25/month. Margin shrinks.
  - Retention drops (users only regenerate once in their first week, then never again). Revenue collapses.
  
  **The leverage point:** **caching**. If you cache the last 5 generated plans and return a cached plan 80% of the time, you burn only 0.2 plan generations per month (20% of 1 per week), costing ~$0.005/month. Margin explodes.
- **Caching strategies:**
  1. **HTTP cache:** `Cache-Control: public, max-age=604800` (1 week). The client caches the JSON response. But doesn't help users who clear cache or switch devices.
  2. **Query-result cache (Redis):** key = `plan:user_id:hash(constraints+profile)`. TTL = 7 days. Survives client crashes; reduces DB load.
  3. **Prompt-level caching (Anthropic):** If Haiku adds cached prompts (like Claude 3.5 does), save the system prompt + unchanging history context as a cached block. First call: full cost. Subsequent calls: 10% of system cost. Turns $0.025 → $0.0025 for repeat users.
- **(M3) Retrieval check:** "If you cache for 7 days, when should the cache invalidate? What if the user logs a new workout mid-week?"
- **(M5) Application check (L5 capstone):** "At $9.99/month, what's the break-even regeneration frequency with and without Redis caching? What price point makes unlimited regeneration viable?"

## 6. Teach-back (M10)
"Explain to a non-technical founder: Why does Peak Fettle charge $9.99/month for AI plans instead of $1.99? What would happen if we used Gemini Flash instead? How does caching protect our margin?"
> Expect: founder intuition is "cheaper is better," but the lesson reframes it: "quality is the why." The caching part may not land — use the unit-economics chart to show the ROI.

## 7. Cumulative review (M13) — rapid-fire
1. Why are user constraints loaded from the database and not left for Claude to reason about?
2. If a user regenerates their plan 50 times/month, what would be more cost-effective: upgrade to GPT-4o, or implement caching?
3. What does it mean that the `is_paid` check happens *before* the LLM call, not after?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | In the POST /plans/generate request, what role does the "system prompt" play? | Identifies it as static instructions vs. dynamic user data | Provides the LLM with role, hard rules, output schema — reusable instructions separate from user-specific data. | 8 |
| q2 | L2 | free | Explain why the endpoint checks `is_paid` *before* calling Claude Haiku, not after. What problem does this solve? | Names the cost problem (free users burning margin, abuse potential) and the timing matter | Free users don't pay for plan generation, so checking before the LLM call avoids sunk cost. Prevents abuse (hammering the endpoint with fake requests). | 12 |
| q3 | L3 | free | The candidate exercise list is capped at 60 and constraints filter at DB query time. Construct the prompt for a user with 2 constraint types and 5 sessions in the last 14 days. What would you watch for (token budget, hallucination risk)? | Shows understanding of prompt assembly; names the token budget constraint; surfaces hallucination risk if unconstrained | Build: constraints formatted as text (2 lines), history as 5 × workout_line formatted, profile fields, 60-item candidate list. Watch: total tokens vs. 5,000 budget; risk that Claude invents exercises despite the "only from list" rule if the list is unclear. | 15 |
| q4 | L4 | free | Claude Haiku costs 10x more than Gemini Flash per plan. Evaluate the cost vs. quality tradeoff for Peak Fettle. Under what circumstances would you switch to Flash, and what would you lose? | Clear position on why Haiku is justified; names the "plan quality = reason to exist" argument; proposes a threshold (e.g., if Flash improves 5x). Acknowledges the loss (generic reasoning, lower adapt-to-constraints reliability). | Haiku is justified because users pay for personalization — "I read your PRs" plans beat generic. Switch to Flash if: (1) it closes the quality gap, or (2) we pivot to a free-tier product. We lose personalized reasoning, edge-case handling (e.g., RIR-based rep range). If Flash 2.1 arrives and matches Haiku, cost argument disappears — switch then. | 20 |
| q5 | L5 | free | At $9.99/month, you have $0.33/day in revenue per subscriber. A power user regenerates 50 times/month at $0.025 Haiku cost = $1.25/month, eating your margin. Design a caching strategy to break even. What are the tradeoffs? | Proposes layered cache (Redis query-result cache + HTTP), calculates hit rate needed (80%+), names tradeoff (staleness, invalidation complexity), measures cost-benefit | Hit-rate target: 80% cache, 20% regenerate → cost drops to $0.005/month. Tradeoff: plans stale >1 week if user logs new data mid-week (could prompt invalidation on new workout or manual refresh). Cost-benefit: $0.02 saved per user per month seems small, but at 10K users it's $200/mo → $2.4K/year, trivial ROI for a Redis instance. Better: use Anthropic prompt caching (next level) to cache system prompt alone (biggest win). | 25 |
| q6 | L5 (opt) | free | A user complains: "Your plan contradicted my constraint. I said no overhead, but got Military Press." Design a post-generation validation step that would have caught this, and explain why the hard-block at query time didn't. | Acknowledges hard-block can fail if exercise name is a typo or synonym (e.g., "Overhead Military Press" vs. "Military Press" in DB); proposes post-validation: check resolved exercise IDs against constraint tags; names root cause (name matching is fragile). | Hard-block query does: `contraindications && blockedTags`. But if Claude outputs "Overhead Military Press" and DB has "Military Press", the name-resolution step (line 491) fails silently (returns null exercise_id). Post-validation: for each exercise in plan, re-check `exercise.contraindications` against user constraints **before** returning. Root cause: we trust Claude to use exact names from the candidate list, but it often paraphrases. Full fix: return both name and ID in candidate list, instruct Claude to return ID, not name. | 22 |

## 9. Custom interactive widget
**Unit-economics calculator** — sliders for subscriber price ($1–$20), regeneration frequency (0.5–10 per month), cache hit rate (0–100%). Shows:
- Monthly revenue per user.
- Monthly LLM cost (Haiku at 2.5¢, Flash at 0.5¢).
- Net margin.
- Breakeven cache hit rate for 50× regenerations/month.

Lets Arvin *feel* why caching suddenly matters when regeneration gets aggressive.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude" (use GPT-4o for this, not Haiku — cost-benefit analysis is complex).
- Update `teacher_skill.md` PART 3: first real assessment of LLM API understanding; whether the "quality = margin justification" argument resonated; whether unit-economics math is comfortable or needs review; any confusion on constraint handling (hard-block vs. post-processing).
- If quiz q5 or q6 is weak, queue a follow-up session on caching strategies (could be a mini-lesson: "Redis for cost control").
- Offer to schedule L11 (scheduled jobs / cron) — which covers the weekly percentile batch job that feeds plan personalization. Strong prerequisite connection.
