// /exercises — search and browse the global exercise library
// Backs TICKET-007 (exercise search synonyms/aliases)
// dev-backend — 2026-05-02
// Phase: B (production stack foundation)

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /exercises/search?q=<query>&limit=50&kind=lift|cardio
// ---------------------------------------------------------------------------
// Searches both exercise names AND the exercise_aliases table so users can
// type "bench", "benchpress", "chest press", "OHP", etc. and land on the
// canonical exercise. Results are scored:
//   1. Exact alias or name match (score 3)
//   2. Name prefix match (score 2)
//   3. Name or alias substring match (score 1)
// ---------------------------------------------------------------------------
router.get('/search', async (req, res, next) => {
    try {
        const schema = z.object({
            q:     z.string().trim().min(1).max(100),
            limit: z.coerce.number().int().min(1).max(200).optional().default(50),
            kind:  z.enum(['lift', 'cardio', 'sport', 'mobility']).optional(),
        });
        const { q, limit, kind } = schema.parse(req.query);

        const params = [`%${q}%`, q, `${q}%`, limit];
        let kindClause = '';
        if (kind) {
            params.push(kind);
            kindClause = `AND e.category = $${params.length}`;
        }

        const { rows } = await pool.query(
            `WITH scored AS (
                SELECT
                    e.id,
                    e.name,
                    e.category,
                    e.muscle_groups,
                    e.is_compound,
                    CASE
                        WHEN LOWER(e.name) = LOWER($2)
                          OR EXISTS (
                              SELECT 1 FROM exercise_aliases a
                              WHERE a.exercise_id = e.id
                                AND LOWER(a.alias) = LOWER($2)
                          )
                        THEN 3
                        WHEN LOWER(e.name) LIKE LOWER($3)
                        THEN 2
                        ELSE 1
                    END AS score
                FROM exercises e
                WHERE (
                    e.name ILIKE $1
                    OR EXISTS (
                        SELECT 1 FROM exercise_aliases a
                        WHERE a.exercise_id = e.id
                          AND a.alias ILIKE $1
                    )
                )
                ${kindClause}
            )
            SELECT DISTINCT ON (id) id, name, category, muscle_groups, is_compound, score
            FROM scored
            ORDER BY id, score DESC`,
            params
        );

        rows.sort((a, b) =>
            b.score !== a.score
                ? b.score - a.score
                : a.name.localeCompare(b.name)
        );

        res.json({
            query:   q,
            results: rows.slice(0, limit),
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /exercises — browse the full library, grouped by category
// (no auth required — global read-only data)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const { kind } = req.query;
        const params = [];
        let where = '';
        if (kind) {
            params.push(kind);
            where = `WHERE category = $1`;
        }

        const { rows } = await pool.query(
            `SELECT id, name, category, muscle_groups, is_compound
             FROM exercises ${where}
             ORDER BY category, name`,
            params
        );

        const grouped = {};
        for (const ex of rows) {
            if (!grouped[ex.category]) grouped[ex.category] = [];
            grouped[ex.category].push(ex);
        }

        res.json({ exercises: grouped });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /exercises/:id/aliases — return all known aliases for an exercise
// (useful for the edit-exercise modal in the admin panel)
// ---------------------------------------------------------------------------
router.get('/:id/aliases', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT a.id, a.alias
             FROM exercise_aliases a
             WHERE a.exercise_id = $1
             ORDER BY a.alias`,
            [req.params.id]
        );
        res.json({ aliases: rows });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /exercises — create a custom exercise (free-text entry from mobile)
//
// Allows users to log sets for exercises not yet in the global library.
// Uses INSERT ... ON CONFLICT DO NOTHING so a name that already exists is
// silently re-used, and the real UUID is always returned via the SELECT.
//
// Auth required (enforced by inline middleware in index.js) so anonymous
// clients cannot pollute the library.
//
// Body: { name, category?, muscle_groups?, is_compound? }
// Response: { exercise: { id, name, category, muscle_groups, is_compound } }
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
    try {
        const schema = z.object({
            name:          z.string().trim().min(1).max(100),
            category:      z.enum(['lift', 'cardio', 'sport', 'mobility']).optional().default('lift'),
            muscle_groups: z.array(z.string().trim().max(50)).optional().default([]),
            is_compound:   z.boolean().optional().default(false),
        });
        const body = schema.parse(req.body);

        // Insert if name is new; silently skip if it already exists.
        await pool.query(
            `INSERT INTO exercises (name, category, muscle_groups, is_compound)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [body.name, body.category, body.muscle_groups, body.is_compound]
        );

        // Always SELECT back so we return the authoritative UUID regardless of
        // whether the INSERT ran or was skipped due to conflict.
        const { rows } = await pool.query(
            `SELECT id, name, category, muscle_groups, is_compound
             FROM exercises WHERE name = $1`,
            [body.name]
        );

        if (rows.length === 0) {
            return res.status(500).json({ error: 'exercise_not_found_after_insert' });
        }

        res.status(201).json({ exercise: rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
