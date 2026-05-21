// /templates — read-only template library (curated workout programs)
// PL-1: Template Library
// dev-backend — 2026-05-17
//
// Public endpoints — no auth required (templates are a global read-only library).
// Data is seeded in migrations/20260517_template_library.sql.

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// GET /templates
// List all templates, optionally filtered by discipline and/or experience_level.
// Featured templates are surfaced first.
router.get('/', async (req, res, next) => {
    try {
        const { discipline, experience_level } = req.query;
        const conditions = [];
        const params = [];

        if (discipline) {
            params.push(discipline);
            conditions.push(`discipline = $${params.length}`);
        }
        if (experience_level) {
            params.push(experience_level);
            conditions.push(`experience_level = $${params.length}`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(
            `SELECT id, name, description, discipline, experience_level,
                    days_per_week, is_featured, created_at
             FROM workout_templates
             ${where}
             ORDER BY is_featured DESC, name ASC`,
            params
        );

        return res.json({ templates: rows });
    } catch (err) { next(err); }
});

// GET /templates/:id
// Full template with all sessions and exercises, ordered by day_number and order_index.
router.get('/:id', async (req, res, next) => {
    try {
        // Fetch template
        const { rows: tmplRows } = await pool.query(
            `SELECT id, name, description, discipline, experience_level,
                    days_per_week, is_featured, created_at
             FROM workout_templates
             WHERE id = $1`,
            [req.params.id]
        );
        if (tmplRows.length === 0) return res.status(404).json({ error: 'Template not found.' });
        const template = tmplRows[0];

        // Fetch sessions
        const { rows: sessions } = await pool.query(
            `SELECT id, day_number, session_name, notes
             FROM template_sessions
             WHERE template_id = $1
             ORDER BY day_number ASC`,
            [template.id]
        );

        // Fetch exercises for all sessions in one query
        if (sessions.length > 0) {
            const sessionIds = sessions.map(s => s.id);
            const { rows: exercises } = await pool.query(
                `SELECT id, session_id, exercise_name, sets, reps,
                        rest_seconds, form_cue, order_index
                 FROM template_exercises
                 WHERE session_id = ANY($1::uuid[])
                 ORDER BY session_id, order_index ASC`,
                [sessionIds]
            );

            // Group exercises by session_id
            const bySession = {};
            for (const ex of exercises) {
                if (!bySession[ex.session_id]) bySession[ex.session_id] = [];
                bySession[ex.session_id].push(ex);
            }

            template.sessions = sessions.map(s => ({
                ...s,
                exercises: bySession[s.id] || [],
            }));
        } else {
            template.sessions = [];
        }

        return res.json({ template });
    } catch (err) { next(err); }
});

module.exports = router;
