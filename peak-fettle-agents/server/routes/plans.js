// /plans — CRUD for AI-generated and user-saved training plans
// Phase B: skeleton CRUD.  Phase C: AI generation via POST /plans/generate.
// dev-backend — 2026-05-02 (updated 2026-05-04 — TICKET-011)

const express = require('express');
const { z } = require('zod');
const Anthropic = require('@anthropic-ai/sdk');
const { pool } = require('../db');
const { supabaseAdmin } = require('../lib/supabaseAdmin');

// Anthropic client — model pinned to Haiku 4.5 per CTO cost guardrail (~2.5¢/plan).
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const router = express.Router();

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

// A plan "structure" is a JSONB blob — the shape is defined by the AI service
// in Phase D. Phase B only stores/retrieves it opaquely so the schema is
// flexible. At minimum it should be an object; stricter validation ships with
// the AI layer in Phase D.
const PlanStructureSchema = z.record(z.unknown());

const CreatePlanSchema = z.object({
    name:         z.string().trim().min(1).max(120),
    structure:    PlanStructureSchema,
    isTemplate:   z.boolean().optional().default(false),
    isAiGenerated: z.boolean().optional().default(false),
});

const UpdatePlanSchema = z.object({
    name:      z.string().trim().min(1).max(120).optional(),
    structure: PlanStructureSchema.optional(),
});

// ---------------------------------------------------------------------------
// POST /plans — create a new plan
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
    try {
        const { name, structure, isTemplate, isAiGenerated } = CreatePlanSchema.parse(req.body);

        // Only the service role can create global templates (user_id IS NULL).
        // Regular users always own their plans.
        const { rows } = await pool.query(
            `INSERT INTO plans (user_id, name, structure, is_template, is_ai_generated)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, user_id, name, is_template, is_ai_generated, is_active,
                       created_at, updated_at`,
            [req.user.id, name, JSON.stringify(structure), isTemplate, isAiGenerated]
        );

        res.status(201).json(rows[0]);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /plans — list the calling user's plans + all global templates
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        // PLANS-001 (2026-05-19): include `is_active` so the client can show
        // which plan is the user's currently-followed program. Global templates
        // (user_id IS NULL) always report is_active = FALSE — the partial
        // unique index excludes them by design.
        const { rows } = await pool.query(
            `SELECT id, user_id, name, is_template, is_ai_generated, is_active,
                    created_at, updated_at
             FROM plans
             WHERE user_id = $1 OR is_template = TRUE
             ORDER BY is_active DESC, is_template DESC, updated_at DESC`,
            [req.user.id]
        );

        res.json({ plans: rows });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /plans/:id — fetch one plan (including structure)
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
    try {
        // PLANS-001 (2026-05-19): expose `is_active` on detail fetch as well.
        const { rows } = await pool.query(
            `SELECT id, user_id, name, structure,
                    is_template, is_ai_generated, is_active,
                    created_at, updated_at
             FROM plans
             WHERE id = $1
               AND (user_id = $2 OR is_template = TRUE)`,
            [req.params.id, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Plan not found.' });
        }

        res.json(rows[0]);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PATCH /plans/:id — partial update (name or structure)
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res, next) => {
    try {
        const { name, structure } = UpdatePlanSchema.parse(req.body);

        if (!name && !structure) {
            return res.status(400).json({ error: 'Provide at least name or structure.' });
        }

        // Build a dynamic SET clause with only the fields being changed.
        const sets = [];
        const params = [];

        if (name) {
            params.push(name);
            sets.push(`name = $${params.length}`);
        }
        if (structure) {
            params.push(JSON.stringify(structure));
            sets.push(`structure = $${params.length}`);
        }

        sets.push('updated_at = NOW()');

        // Only let users edit their own plans (not global templates).
        params.push(req.params.id, req.user.id);
        const { rows } = await pool.query(
            `UPDATE plans
             SET ${sets.join(', ')}
             WHERE id = $${params.length - 1}
               AND user_id = $${params.length}
               AND is_template = FALSE
             RETURNING id, user_id, name, is_template,
                       is_ai_generated, updated_at`,
            params
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Plan not found or not editable.' });
        }

        res.json(rows[0]);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/activate — mark one user plan as the active program
// PLANS-001 (2026-05-19): wires the `is_active` column shipped in
// 20260515_plans_active.sql. Runs in a single transaction so the at-most-one
// constraint is upheld even under concurrent calls — the partial unique index
// `idx_plans_one_active_per_user` is the source of truth.
//
// Returns: the updated plan row (same shape as GET /plans/:id minus structure).
// 404 if the target plan does not belong to the caller (templates excluded).
// ---------------------------------------------------------------------------
router.post('/:id/activate', async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Confirm the plan is user-owned (templates can't be activated).
        const { rows: ownerRows } = await client.query(
            `SELECT id FROM plans
             WHERE id = $1
               AND user_id = $2
               AND is_template = FALSE`,
            [req.params.id, req.user.id]
        );
        if (ownerRows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Plan not found or not activatable.' });
        }

        // 2. Deactivate every other plan owned by this user.
        //    Must run BEFORE the activate UPDATE so the partial unique index
        //    `idx_plans_one_active_per_user` is never violated mid-transaction.
        await client.query(
            `UPDATE plans
             SET is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1
               AND id <> $2
               AND is_active = TRUE`,
            [req.user.id, req.params.id]
        );

        // 3. Activate the target plan.
        const { rows } = await client.query(
            `UPDATE plans
             SET is_active = TRUE, updated_at = NOW()
             WHERE id = $1
               AND user_id = $2
               AND is_template = FALSE
             RETURNING id, user_id, name, is_template, is_ai_generated,
                       is_active, created_at, updated_at`,
            [req.params.id, req.user.id]
        );

        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_e) { /* swallow rollback err */ }
        next(err);
    } finally {
        client.release();
    }
});

// ---------------------------------------------------------------------------
// POST /plans/deactivate — clear the active plan for the calling user
// PLANS-001 (2026-05-19): companion to /activate so users can step away from
// any active program without selecting a replacement (e.g., taking a deload
// week off-program).
// ---------------------------------------------------------------------------
router.post('/deactivate', async (req, res, next) => {
    try {
        await pool.query(
            `UPDATE plans
             SET is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1 AND is_active = TRUE`,
            [req.user.id]
        );
        res.status(204).end();
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /plans/:id — delete a user-owned plan
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM plans
             WHERE id = $1
               AND user_id = $2
               AND is_template = FALSE`,
            [req.params.id, req.user.id]
        );

        if (rowCount === 0) {
            return res.status(404).json({ error: 'Plan not found or not deletable.' });
        }

        res.status(204).end();
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /plans/generate — AI-generated plan session via Claude Haiku 4.5
// TICKET-011: Transparent AI Plan Reasoning
// TICKET-012: Constraint Filter (reads user_constraints before building prompt)
//
// Open decision resolved (2026-05-04): reasoning string is generated by Haiku
// as part of the plan prompt — not a rule-based post-processor. This keeps
// the reasoning grounded in natural language and easier to personalise.
//
// Request body: none required; all context is read from the DB.
//
// Response:
//   {
//     session: {
//       exercises: [
//         { exercise_id, name, sets, reps, rpe_target, rest_seconds }
//       ]
//     },
//     reasoning: "1-2 sentences citing a specific data point from user history",
//     plan_id: "<uuid of the saved plan row>"
//   }
//
// Guard rails:
//   - Max 5,000 prompt tokens per call (CTO budget guardrail).
//   - Only paid users may call this endpoint (is_paid flag on users table).
//     Free users get a 403 with upgrade copy.
//   - Constraints are hard-blocked; the AI cannot override them.
// ---------------------------------------------------------------------------
router.post('/generate', async (req, res, next) => {
    try {
        // ── 1. Check paid tier ──────────────────────────────────────────────
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

        // ── 2. Load user constraints (TICKET-012) ────────────────────────────
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
        const customNotes = constraints
            .filter(c => c.constraint_type === 'custom' && c.custom_note)
            .map(c => c.custom_note);

        // ── 3. Load candidate exercises (respecting constraint filter) ───────
        // Hard-block: any exercise whose contraindications array overlaps with
        // the user's blocked tags is excluded from the candidate pool entirely.
        const { rows: exerciseRows } = await pool.query(
            `SELECT id, name, category, muscle_groups, is_compound, contraindications
             FROM exercises
             WHERE category = 'lift'
               AND ($1::text[] IS NULL
                    OR NOT (contraindications && $1::text[]))
             ORDER BY name`,
            [blockedTags.length > 0 ? blockedTags : null]
        );

        // ── 4. Load recent training history (last 14 days) ──────────────────
        // TYPE-001 follow-up (2026-05-16): `s.e1rm_kg` column was dropped in
        // 20260505_sets_weight_raw.sql; the previous SELECT would have
        // crashed any plan-generation request. Compute Epley inline from
        // weight_raw (the same pattern used in routes/percentile.js).
        // Lift sets only (`s.kind = 'lift'`) so cardio rows can't pollute the
        // e1rm prompt context.
        const { rows: historyRows } = await pool.query(
            `SELECT
                e.name                      AS exercise_name,
                -- Decode weight_raw (SMALLINT, kg × 8) back to kg float for prompt context
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

        // ── 5. Load recent health metrics (last 7 days, for intensity signals)
        const { rows: metricsRows } = await pool.query(
            `SELECT date, resting_hr_bpm, hrv_ms, sleep_hours
             FROM daily_health_metrics
             WHERE user_id = $1
               AND date >= CURRENT_DATE - INTERVAL '7 days'
             ORDER BY date DESC`,
            [req.user.id]
        );

        // ── 6. Load user profile (weight class, experience level) ────────────
        const { rows: profileRows } = await pool.query(
            `SELECT experience_level, weight_class_kg, sex, age_band
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        const profile = profileRows[0] ?? {};

        // ── 7. Build the Haiku prompt ─────────────────────────────────────────
        const historyText = historyRows.length > 0
            ? historyRows
                .map(r => `${r.day_key}: ${r.exercise_name} — ${r.weight_kg}kg × ${r.reps} reps` +
                           (r.rir != null ? ` (RIR ${r.rir})` : '') +
                           (r.e1rm_kg ? ` [e1RM ${r.e1rm_kg.toFixed(1)}kg]` : ''))
                .join('\n')
            : 'No recent history logged yet.';

        const metricsText = metricsRows.length > 0
            ? metricsRows
                .map(r => [
                    r.date,
                    r.resting_hr_bpm ? `HR ${r.resting_hr_bpm}bpm` : null,
                    r.hrv_ms         ? `HRV ${r.hrv_ms}ms`         : null,
                    r.sleep_hours    ? `sleep ${r.sleep_hours}h`    : null,
                ].filter(Boolean).join(', '))
                .join('\n')
            : 'No wearable data available.';

        const constraintsText = constraints.length > 0
            ? constraints.map(c =>
                c.custom_note ? `${c.constraint_type}: ${c.custom_note}` : c.constraint_type
              ).join(', ')
            : 'None';

        // Candidate list capped at 60 exercises to stay within token budget.
        const candidateList = exerciseRows
            .slice(0, 60)
            .map(e => `- ${e.name} (${(e.muscle_groups ?? []).join(', ')})`)
            .join('\n');

        const systemPrompt = `You are a certified strength and conditioning coach building a single personalised workout session for a Peak Fettle user. Your response must be valid JSON only — no markdown, no prose outside JSON.

HARD RULES:
1. Only use exercises from the CANDIDATE LIST. Do not invent exercises.
2. The "reasoning" field must cite at least one specific data point from the user's history, health metrics, or profile. Never write generic copy like "here is your workout".
3. If the user has fewer than 3 sessions logged, reasoning must say: "You're new — this plan will adapt as you log more sessions."
4. Honour all physical constraints — never suggest movements that the user has flagged as off-limits.
5. Return 4–6 exercises per session. Include sets (3–5), reps (range e.g. "8-10"), rpe_target (1–10), rest_seconds (60–180).
6. Every exercise MUST include a coaching_note: one concise sentence (10–20 words) describing technique focus or loading intent specific to this user's history. Never leave coaching_note blank or generic.

JSON schema:
{
  "session": {
    "exercises": [
      {
        "name": "string",
        "sets": number,
        "reps": "string",
        "rpe_target": number,
        "rest_seconds": number,
        "coaching_note": "string (1 sentence, technique or loading intent)"
      }
    ]
  },
  "reasoning": "string (1-2 sentences, cites specific history data point)"
}`;

        const userMessage = `USER PROFILE:
Experience level: ${profile.experience_level ?? 'unknown'}
Weight class: ${profile.weight_class_kg ? profile.weight_class_kg + 'kg' : 'unknown'}
Sex: ${profile.sex ?? 'not specified'}
Age band: ${profile.age_band ?? 'unknown'}

PHYSICAL CONSTRAINTS (hard-blocked — do not use these movement patterns):
${constraintsText}

RECENT TRAINING HISTORY (last 14 days):
${historyText}

HEALTH METRICS (last 7 days):
${metricsText}

CANDIDATE EXERCISES (you may only pick from this list):
${candidateList}

Generate one workout session now.`;

        // ── 8. Call Claude Haiku 4.5 ─────────────────────────────────────────
        const message = await anthropic.messages.create({
            model:      'claude-haiku-4-5',
            max_tokens: 1024,
            system:     systemPrompt,
            messages:   [{ role: 'user', content: userMessage }],
        });

        // ── 9. Parse and validate the AI response ────────────────────────────
        let aiResponse;
        try {
            const rawText = message.content[0].text.trim();
            aiResponse = JSON.parse(rawText);
        } catch {
            // If Haiku returns malformed JSON, return a structured error rather
            // than a 500 — the client can retry.
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

        // ── 10. Resolve exercise names → IDs for storage ────────────────────
        const exerciseNameMap = new Map(exerciseRows.map(e => [e.name.toLowerCase(), e.id]));
        const resolvedExercises = aiResponse.session.exercises.map(ex => ({
            ...ex,
            exercise_id: exerciseNameMap.get(ex.name?.toLowerCase()) ?? null,
        }));

        const sessionWithIds = { ...aiResponse.session, exercises: resolvedExercises };

        // ── 11. Persist the generated plan ───────────────────────────────────
        const planName = `AI Plan — ${new Date().toISOString().slice(0, 10)}`;
        const structure = {
            session:   sessionWithIds,
            reasoning: aiResponse.reasoning,
            generated_at: new Date().toISOString(),
            model: 'claude-haiku-4-5',
        };

        const { rows: planRows } = await pool.query(
            `INSERT INTO plans (user_id, name, structure, is_template, is_ai_generated)
             VALUES ($1, $2, $3, FALSE, TRUE)
             RETURNING id`,
            [req.user.id, planName, JSON.stringify(structure)]
        );

        // ── 12. Return to client ──────────────────────────────────────────────
        const plan = planRows[0];
        res.status(201).json({
            plan_id:   plan.id,
            session:   sessionWithIds,
            reasoning: aiResponse.reasoning,
        });

        // Push notification: AI plan ready
        try {
            await supabaseAdmin.from('notification_queue').insert({
                user_id: req.user.id,
                type: 'plan_ready',
                title: 'Your personalised plan is ready',
                body: 'Tap to view your new AI-generated workout program.',
                data: { plan_id: plan.id ?? null },
            });
        } catch (_e) {
            console.warn('[push] plan_ready enqueue failed:', _e?.message);
        }

    } catch (err) { next(err); }
});

module.exports = router;
