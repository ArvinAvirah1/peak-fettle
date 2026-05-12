// /workouts — CRUD on the per-day workout container
// dev-backend — 2026-04-30

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

const CreateSchema = z.object({
    dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().max(500).optional(),
});

// POST /workouts — idempotent on (user_id, day_key)
// T-04 (2026-05-02): return 201 on create, 200 on update so clients can
// distinguish a brand-new workout from an upsert hit on an existing one.
// We use the Postgres xmax trick: xmax = 0 means the row was just inserted;
// xmax != 0 means the row existed and was updated.
router.post('/', async (req, res, next) => {
    try {
        const { dayKey, notes } = CreateSchema.parse(req.body);
        const { rows } = await pool.query(
            `INSERT INTO workouts (user_id, day_key, notes)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, day_key) DO UPDATE
                SET notes = COALESCE(EXCLUDED.notes, workouts.notes),
                    updated_at = NOW()
             RETURNING id, user_id, day_key, notes, created_at, updated_at,
                       (xmax = 0) AS inserted`,
            [req.user.id, dayKey, notes || null]
        );
        const row = rows[0];
        const wasInserted = row.inserted;
        delete row.inserted; // don't leak internal flag to clients
        res.status(wasInserted ? 201 : 200).json(row);
    } catch (err) { next(err); }
});

// GET /workouts?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res, next) => {
    try {
        const { from, to } = req.query;
        const conditions = ['w.user_id = $1'];
        const params = [req.user.id];

        if (from) {
            params.push(from);
            conditions.push(`w.day_key >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            conditions.push(`w.day_key <= $${params.length}`);
        }

        const { rows } = await pool.query(
            `SELECT id, user_id, day_key, notes, created_at, updated_at
             FROM workouts w
             WHERE ${conditions.join(' AND ')}
             ORDER BY day_key DESC
             LIMIT 90`,
            params
        );
        res.json(rows);
    } catch (err) { next(err); }
});

// GET /workouts/:id
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, day_key, notes, created_at, updated_at
             FROM workouts
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// DELETE /workouts/:id
// N-13 (2026-05-03): delete endpoint with ownership check.
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM workouts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
        res.status(204).end();
    } catch (err) { next(err); }
});

module.exports = router;
