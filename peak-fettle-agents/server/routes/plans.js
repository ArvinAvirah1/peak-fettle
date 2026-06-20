// /plans — CRUD for training plans
// Phase B: skeleton CRUD.  Phase C: AI generation via POST /plans/generate.
// dev-backend — 2026-05-02 (updated 2026-05-04 — TICKET-011)
//
// CHANGELOG:
//   2026-06-11 — TICKET-training-engine: replaced Claude/Haiku call with
//   deterministic Peak Fettle Training Engine (pf-engine-v1).
//   Paid gate kept; daily throttle raised 3 → 20 per spec §3.
//   Extended profile SELECT (training_goal, sessions_per_week, session_minutes,
//   goal_weight_kg, equipment_profile, season_phase) and exercises SELECT
//   (movement_pattern, equipment) per spec §2.
//   is_ai_generated saved as FALSE; plan name "Training Engine Plan — <date>".

const express = require('express');
const { z }   = require('zod');
const { pool } = require('../db');
const { supabaseAdmin } = require('../lib/supabaseAdmin');
const { generatePlan }  = require('../lib/trainingEngine');

const router = express.Router();

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

const PlanStructureSchema = z.record(z.unknown());

const CreatePlanSchema = z.object({
    name:          z.string().trim().min(1).max(120),
    structure:     PlanStructureSchema,
    isTemplate:    z.boolean().optional().default(false),
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
        // which plan is the user's currently-followed program.
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

        const sets   = [];
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
// PLANS-001 (2026-05-19)
// ---------------------------------------------------------------------------
router.post('/:id/activate', async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

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

        await client.query(
            `UPDATE plans
             SET is_active = FALSE, updated_at = NOW()
             WHERE user_id = $1
               AND id <> $2
               AND is_active = TRUE`,
            [req.user.id, req.params.id]
        );

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
        try { await client.query('ROLLBACK'); } catch (_e) { /* swallow */ }
        next(err);
    } finally {
        client.release();
    }
});

// ---------------------------------------------------------------------------
// POST /plans/deactivate — clear the active plan for the calling user
// PLANS-001 (2026-05-19)
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
// POST /plans/generate — deterministic Training Engine plan generation
// TICKET-training-engine (2026-06-11)
//
// Replaced Claude Haiku call with pf-engine-v1 (pure deterministic engine).
// Paid gate kept. Daily throttle: 20 plans/day (raised from 3 per spec §3).
//
// Request body: none required — all context read from DB.
//
// Response:
//   {
//     session?,   — backward-compat: first session of week 1 in legacy shape
//     weeks,      — 3-week program per spec §3 output schema
//     reasoning,  — 1-2 sentences citing a concrete user data point
//     rule_trace, — full engine rule chain
//     engine,     — "pf-engine-v1"
//     plan_id     — UUID of persisted plan row
//   }
// ---------------------------------------------------------------------------
router.post('/generate', async (req, res, next) => {
    try {
        // ── 1. Paid gate ─────────────────────────────────────────────────────
        const { rows: userRows } = await pool.query(
            `SELECT (tier = 'paid') AS is_paid FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!userRows[0]?.is_paid) {
            return res.status(403).json({
                error:   'paid_tier_required',
                message: 'Training Engine plans are a paid-tier feature. ' +
                         'Upgrade to Peak Fettle Pro to unlock personalised training.',
            });
        }

        // ── 1b. 20/day throttle ───────────────────────────────────────────────
        const { rows: throttleRows } = await pool.query(
            `SELECT COUNT(*) AS cnt
             FROM plans
             WHERE user_id = $1
               AND name LIKE 'Training Engine Plan%'
               AND created_at >= CURRENT_DATE`,
            [req.user.id]
        );
        if (parseInt(throttleRows[0]?.cnt ?? 0, 10) >= 20) {
            return res.status(429).json({
                error:   'daily_limit_reached',
                message: 'You’ve generated 20 plans today — your daily limit. ' +
                         'Come back tomorrow for a fresh batch.',
            });
        }

        // ── 2. Load user constraints ──────────────────────────────────────────
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

        // ── 3. Load candidate exercises (with movement_pattern + equipment) ───
        // Agent B migration adds movement_pattern + equipment columns.
        // Graceful fallback: COALESCE returns NULL if column doesn't exist yet.
        const { rows: exerciseRows } = await pool.query(
            `SELECT id, name, category, muscle_groups, is_compound,
                    movement_pattern, equipment, contraindications
             FROM exercises
             WHERE category = 'lift'
               AND ($1::text[] IS NULL
                    OR NOT (contraindications && $1::text[]))
             ORDER BY name`,
            [blockedTags.length > 0 ? blockedTags : null]
        );

        // ── 4. Load recent training history (last 14 days) ───────────────────
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
                            ELSE (s.weight_raw / 8.0) * (1.0 + LEAST(s.reps, 12)::float / 30.0)
                        END
                    ELSE NULL
                END                         AS e1rm_kg,
                w.day_key
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             JOIN exercises e ON e.id = s.exercise_id
             WHERE w.user_id = $1
               AND w.day_key >= CURRENT_DATE - INTERVAL '14 days'
               AND s.kind = 'lift'
             ORDER BY w.day_key DESC, e.name
             LIMIT 80`,
            [req.user.id]
        );

        // ── 4b. Load personal bests ───────────────────────────────────────────
        const { rows: pbRows } = await pool.query(
            `SELECT DISTINCT ON (s.exercise_id)
                e.name                         AS exercise_name,
                s.weight_raw / 8.0             AS weight_kg,
                s.reps
             FROM sets s
             JOIN exercises e ON e.id = s.exercise_id
             JOIN workouts w  ON w.id = s.workout_id
             WHERE w.user_id = $1
               AND s.kind = 'lift'
               AND s.weight_raw > 0
             ORDER BY s.exercise_id,
                      (s.weight_raw / 8.0) * (1.0 + LEAST(s.reps, 12)::float / 30.0) DESC`,
            [req.user.id]
        );

        // ── 5. Load recent health metrics ─────────────────────────────────────
        const { rows: metricsRows } = await pool.query(
            `SELECT date, resting_hr_bpm, hrv_ms, sleep_hours
             FROM daily_health_metrics
             WHERE user_id = $1
               AND date >= CURRENT_DATE - INTERVAL '7 days'
             ORDER BY date DESC`,
            [req.user.id]
        );

        // ── 6. Load user profile (extended for engine — new columns from Agent B migration)
        const { rows: profileRows } = await pool.query(
            // age_band is DERIVED from birth_date (no stored column — selecting
            // it bare crashes with 42703; same pattern as USER_PROFILE_SELECT
            // in auth.js). Found 2026-06-12 by the LIFEOS review sweep.
            `SELECT experience_level, weight_class_kg, sex,
                    CASE
                        WHEN birth_date IS NULL THEN NULL
                        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 18 THEN 'under-18'
                        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 25 THEN '18-24'
                        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 35 THEN '25-34'
                        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 45 THEN '35-44'
                        WHEN EXTRACT(YEAR FROM AGE(NOW(), birth_date)) < 55 THEN '45-54'
                        ELSE '55+'
                    END AS age_band,
                    training_goal, sessions_per_week, session_minutes,
                    goal_weight_kg, equipment_profile, season_phase,
                    primary_discipline
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        const profile = profileRows[0] ?? {};

        // ── 7. Call the Training Engine ───────────────────────────────────────
        const engineCtx = {
            profile:     {
                experience_level:   profile.experience_level,
                sex:                profile.sex,
                age_band:           profile.age_band,
                weight_class_kg:    profile.weight_class_kg,
                training_goal:      profile.training_goal,
                sessions_per_week:  profile.sessions_per_week,
                session_minutes:    profile.session_minutes,
                goal_weight_kg:     profile.goal_weight_kg,
                equipment_profile:  profile.equipment_profile,
                season_phase:       profile.season_phase,
                primary_discipline: profile.primary_discipline,
            },
            exercises:   exerciseRows,
            history:     historyRows,
            pbs:         pbRows,
            metrics:     metricsRows,
            constraints: constraints,
            userId:      req.user.id,
            today:       new Date(),
        };

        const engineResult = generatePlan(engineCtx);

        // ── 8. Persist the plan ───────────────────────────────────────────────
        const planName  = `Training Engine Plan — ${new Date().toISOString().slice(0, 10)}`;
        const structure = {
            session:      engineResult.session,
            weeks:        engineResult.weeks,
            reasoning:    engineResult.reasoning,
            rule_trace:   engineResult.rule_trace,
            engine:       engineResult.engine,
            generated_at: new Date().toISOString(),
        };

        const { rows: planRows } = await pool.query(
            `INSERT INTO plans (user_id, name, structure, is_template, is_ai_generated)
             VALUES ($1, $2, $3, FALSE, FALSE)
             RETURNING id`,
            [req.user.id, planName, JSON.stringify(structure)]
        );

        // ── 9. Return to client ───────────────────────────────────────────────
        const plan = planRows[0];
        res.status(201).json({
            plan_id:    plan.id,
            session:    engineResult.session,
            weeks:      engineResult.weeks,
            reasoning:  engineResult.reasoning,
            rule_trace: engineResult.rule_trace,
            engine:     engineResult.engine,
        });

        // Push notification: plan ready (best-effort; non-blocking).
        try {
            const weekCount = (engineResult.weeks || []).length;
            await supabaseAdmin.from('notification_queue').insert({
                user_id: req.user.id,
                type:    'plan_ready',
                title:   'Your plan is ready',
                body:    weekCount > 1
                    ? `${weekCount}-week Training Engine program generated — tap to start Week 1.`
                    : 'Your evidence-based training plan is ready. Tap to view it.',
                data: { plan_id: plan.id ?? null },
            });
        } catch (_e) {
            console.warn('[push] plan_ready enqueue failed:', _e?.message);
        }

    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /plans/:id/regenerate — replace an existing plan with a fresh generation.
// Shares the same 20/day throttle as /generate.
// ---------------------------------------------------------------------------
router.post('/:id/regenerate', async (req, res, next) => {
    try {
        // SRV-PLANS-03: explicit paid gate — don't rely solely on the
        // router.handle('/generate') delegation re-checking it (fragile if the
        // internal dispatch is ever refactored).
        const { rows: paidRows } = await pool.query(
            `SELECT (tier = 'paid') AS is_paid FROM users WHERE id = $1`,
            [req.user.id]
        );
        if (!paidRows[0]?.is_paid) {
            return res.status(403).json({
                error:   'paid_tier_required',
                message: 'Training Engine plans are a paid-tier feature. ' +
                         'Upgrade to Peak Fettle Pro to unlock personalised training.',
            });
        }

        // Verify ownership.
        const { rows: ownerRows } = await pool.query(
            `SELECT id FROM plans WHERE id = $1 AND user_id = $2 AND is_ai_generated = FALSE`,
            [req.params.id, req.user.id]
        );
        // Also accept plans where is_ai_generated is TRUE (legacy).
        const { rows: ownerRowsLegacy } = ownerRows.length === 0
            ? await pool.query(
                `SELECT id FROM plans WHERE id = $1 AND user_id = $2`,
                [req.params.id, req.user.id]
              )
            : { rows: ownerRows };

        if (ownerRowsLegacy.length === 0) {
            return res.status(404).json({ error: 'Plan not found or not regeneratable.' });
        }

        // Throttle check.
        const { rows: throttleRows } = await pool.query(
            `SELECT COUNT(*) AS cnt FROM plans
             WHERE user_id = $1
               AND name LIKE 'Training Engine Plan%' -- SRV-PLANS-05: scope to engine plans
               AND created_at >= CURRENT_DATE`,
            [req.user.id]
        );
        if (parseInt(throttleRows[0]?.cnt ?? 0, 10) >= 20) {
            return res.status(429).json({
                error:   'daily_limit_reached',
                message: 'Daily generation limit reached (20/day). Try again tomorrow.',
            });
        }

        // Delegate to /generate by re-routing the request.
        req.url    = '/generate';
        req.method = 'POST';
        req.body   = {};
        return router.handle(req, res, next);
    } catch (err) { next(err); }
});

module.exports = router;
