// /constraints — user physical limitation / injury constraint management
// Phase C: TICKET-012 (Injury & Limitation Constraint Filter)
// dev-backend — 2026-05-04
//
// These constraints are read by POST /plans/generate (TICKET-011) to hard-block
// contraindicated exercises from AI-generated plans.
//
// Routes:
//   GET  /constraints         — list all constraints for the calling user
//   POST /constraints         — add a constraint (or upsert on conflict)
//   DELETE /constraints/:type — remove a specific constraint type

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

// Canonical constraint type vocabulary — must match contraindications tags in DB.
const CONSTRAINT_TYPES = [
    'lower_back', 'knee', 'shoulder', 'wrist', 'hip', 'ankle',
    'no_barbell', 'no_jumping', 'bodyweight_only', 'custom',
];

const AddConstraintSchema = z.object({
    constraint_type: z.enum(CONSTRAINT_TYPES),
    custom_note:     z.string().trim().max(300).optional(),
}).refine(
    data => data.constraint_type !== 'custom' || (data.custom_note && data.custom_note.length > 0),
    { message: 'custom_note is required when constraint_type is "custom".' }
);

// ---------------------------------------------------------------------------
// GET /constraints
// Returns all physical constraints set by the calling user.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT constraint_id, constraint_type, custom_note, created_at
             FROM user_constraints
             WHERE user_id = $1
             ORDER BY created_at ASC`,
            [req.user.id]
        );

        res.json({
            constraints: rows,
            valid_types: CONSTRAINT_TYPES,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /constraints
// Add a constraint. Uses INSERT ... ON CONFLICT DO UPDATE so that re-setting
// an existing type updates the custom_note without error.
// ---------------------------------------------------------------------------
router.post('/', async (req, res, next) => {
    try {
        const { constraint_type, custom_note } = AddConstraintSchema.parse(req.body);

        const { rows } = await pool.query(
            `INSERT INTO user_constraints (user_id, constraint_type, custom_note)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, constraint_type)
             DO UPDATE SET custom_note = EXCLUDED.custom_note
             RETURNING constraint_id, constraint_type, custom_note, created_at`,
            [req.user.id, constraint_type, custom_note ?? null]
        );

        res.status(201).json(rows[0]);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /constraints/:type
// Remove a constraint by type. 404 if the user had no such constraint set.
// ---------------------------------------------------------------------------
router.delete('/:type', async (req, res, next) => {
    try {
        const { type } = req.params;

        // Validate against the vocabulary to give a clear error instead of
        // silently returning 404 on a typo.
        if (!CONSTRAINT_TYPES.includes(type)) {
            return res.status(400).json({
                error: 'invalid_type',
                message: `"${type}" is not a recognised constraint type.`,
                valid_types: CONSTRAINT_TYPES,
            });
        }

        const { rowCount } = await pool.query(
            `DELETE FROM user_constraints
             WHERE user_id = $1 AND constraint_type = $2`,
            [req.user.id, type]
        );

        if (rowCount === 0) {
            return res.status(404).json({
                error: 'not_found',
                message: `No "${type}" constraint is set for your account.`,
            });
        }

        res.status(204).end();
    } catch (err) { next(err); }
});

module.exports = router;
