// /routines — user-saved single-session workout routines
// TICKET-055/056
//
// A routine is an ordered list of exercises with per-exercise targets.
// Distinct from: workout_templates (global curated multi-day programs)
//                plans (AI-generated multi-week blocks)
//
// Structure: { exercises: [{exercise_id, name, target_sets, target_reps}] }

'use strict';

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

const ExerciseEntrySchema = z.object({
    exercise_id: z.string().uuid(),
    name:        z.string().min(1).max(100),
    target_sets: z.number().int().min(1).max(20).optional(),
    target_reps: z.string().max(20).optional(), // e.g. "8-12" or "5"
});

const CreateSchema = z.object({
    name:      z.string().min(1).max(100),
    exercises: z.array(ExerciseEntrySchema).min(1).max(30),
});

const UpdateSchema = z.object({
    name:      z.string().min(1).max(100).optional(),
    exercises: z.array(ExerciseEntrySchema).min(1).max(30).optional(),
});

// GET /routines — list all routines for the authenticated user
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, name, exercises, created_at, updated_at
             FROM routines
             WHERE user_id = $1
             ORDER BY updated_at DESC`,
            [req.user.id]
        );
        res.json({ routines: rows });
    } catch (err) { next(err); }
});

// GET /routines/:id — single routine
router.get('/:id', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, user_id, name, exercises, created_at, updated_at
             FROM routines
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// POST /routines — create a routine
router.post('/', async (req, res, next) => {
    try {
        const { name, exercises } = CreateSchema.parse(req.body);
        const { rows } = await pool.query(
            `INSERT INTO routines (user_id, name, exercises)
             VALUES ($1, $2, $3::jsonb)
             RETURNING id, user_id, name, exercises, created_at, updated_at`,
            [req.user.id, name, JSON.stringify(exercises)]
        );
        res.status(201).json(rows[0]);
    } catch (err) { next(err); }
});

// PUT /routines/:id — replace a routine (full update)
router.put('/:id', async (req, res, next) => {
    try {
        const { name, exercises } = CreateSchema.parse(req.body);
        const { rows } = await pool.query(
            `UPDATE routines
             SET name = $1, exercises = $2::jsonb, updated_at = NOW()
             WHERE id = $3 AND user_id = $4
             RETURNING id, user_id, name, exercises, created_at, updated_at`,
            [name, JSON.stringify(exercises), req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// PATCH /routines/:id — partial update (name or exercises)
router.patch('/:id', async (req, res, next) => {
    try {
        const patch = UpdateSchema.parse(req.body);
        const sets = [];
        const params = [];

        if (patch.name !== undefined) {
            params.push(patch.name);
            sets.push(`name = $${params.length}`);
        }
        if (patch.exercises !== undefined) {
            params.push(JSON.stringify(patch.exercises));
            sets.push(`exercises = $${params.length}::jsonb`);
        }
        if (sets.length === 0) return res.status(400).json({ error: 'no_fields' });

        sets.push('updated_at = NOW()');
        params.push(req.params.id, req.user.id);

        const { rows } = await pool.query(
            `UPDATE routines SET ${sets.join(', ')}
             WHERE id = $${params.length - 1} AND user_id = $${params.length}
             RETURNING id, user_id, name, exercises, created_at, updated_at`,
            params
        );
        if (!rows[0]) return res.status(404).json({ error: 'not_found' });
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// DELETE /routines/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM routines WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
        res.status(204).end();
    } catch (err) { next(err); }
});

module.exports = router;
