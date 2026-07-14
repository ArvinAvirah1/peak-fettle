// /sets — log a set and read sets back; honors TICKET-010 lift+cardio contract
// dev-backend — 2026-04-30
// Updated 2026-05-05: weight stored as weight_raw SMALLINT (kg × 8).
//   Encode on write: Math.round(weightKg * 8)
//   Decode on read:  weight_raw / 8  (returned to clients as weight_kg float)
//   API contract unchanged — clients still send/receive weight_kg.
//
// TICKET-129 (2026-07-03): per-set notes + flags. `note` (free text) and
// `flags` (small bitmask — see mobile src/db/localSchema.ts SET_FLAG_* for the
// bit meanings) are additive columns on `sets` (db/schema.sql, ADD COLUMN IF
// NOT EXISTS — drift-tolerant per CLAUDE.md §4). A bare/older prod DB that
// hasn't picked up the migration yet must degrade rather than 500: any query
// touching these columns is guarded and falls back to the pre-129 shape on
// 42703 (undefined_column) / 42P01 (undefined_table).

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const router = express.Router();

// SERVER-1-style drift guard (see routes/percentile.js) — a prod DB that
// hasn't run the note/flags migration yet must degrade, not 500.
function isMissingSchema(err) {
    return err && (err.code === '42703' || err.code === '42P01');
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** kg (float) → weight_raw SMALLINT (kg × 8, rounded to nearest eighth) */
function encodeWeight(kg) {
    return Math.round(kg * 8);
}

/** weight_raw SMALLINT → kg (float).  Returns null for null inputs (cardio). */
function decodeWeight(raw) {
    return raw != null ? raw / 8 : null;
}

/**
 * Normalise a raw DB set row for API responses.
 * Translates weight_raw (internal SMALLINT) back to weight_kg (float)
 * so the client-facing shape is unchanged.
 */
function normalizeSet(row) {
    if (!row) return row;
    const { weight_raw, ...rest } = row;
    return { ...rest, weight_kg: decodeWeight(weight_raw) };
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// TICKET-129: note is free text (capped to keep rows small); flags is the
// small 5-bit mask (0-31) — validated as an int in that range so a client bug
// can't silently write out-of-band bits that would decode to junk chips.
const MAX_FLAGS = 31; // 1+2+4+8+16 — every bit set
const noteField = z.string().max(500).optional();
const flagsField = z.number().int().min(0).max(MAX_FLAGS).optional();

// Backdated logging (2026-07-14): an optional client-supplied logged_at so a
// workout tracked after the fact (forgot the phone / stayed off it in the gym)
// carries the date it actually happened. ISO datetime, never in the future
// (24h skew allowance), never older than 5 years (fat-finger guard). Omitted →
// the column's now() default applies, exactly as before.
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_BACKDATE_MS = 5 * 365 * 24 * 60 * 60 * 1000;
const loggedAtField = z
    .string()
    .refine((v) => {
        const t = Date.parse(v);
        if (Number.isNaN(t)) return false;
        const now = Date.now();
        return t <= now + FUTURE_SKEW_MS && t >= now - MAX_BACKDATE_MS;
    }, { message: 'loggedAt must be a valid ISO datetime, not in the future, within 5 years' })
    .optional();

const LiftSetSchema = z.object({
    kind: z.literal('lift'),
    workoutId: z.string().uuid(),
    exerciseId: z.string().uuid(),
    setIndex: z.number().int().min(0),
    // AA-03 (2026-05-11): reps must be >= 1. A "set" with zero reps is not a
    // set — it has no E1RM, no PR contribution, and would inflate volume
    // counts. Qt's logSetAt() already rejects reps <= 0; this aligns the
    // server-side Zod schema so a mobile UI bug can't silently store phantom
    // sets that appear in history but contribute nothing.
    reps: z.number().int().min(1),
    // weight ceiling = max SMALLINT (32767) ÷ 8 = 4095.875 kg
    weightKg: z.number().min(0).max(4095.875),
    // rir range matches DB CHECK: -1 (not recorded), 0 (to failure), 1–10
    rir: z.number().int().min(-1).max(10).optional(),
    note: noteField,
    flags: flagsField,
    loggedAt: loggedAtField,
});

const CardioSetSchema = z.object({
    kind: z.literal('cardio'),
    workoutId: z.string().uuid(),
    exerciseId: z.string().uuid(),
    setIndex: z.number().int().min(0),
    durationSec: z.number().int().min(0),
    distanceM: z.number().min(0).optional(),
    avgPaceSecPerKm: z.number().min(0).optional(),
    note: noteField,
    flags: flagsField,
    loggedAt: loggedAtField,
});

const SetSchema = z.discriminatedUnion('kind', [LiftSetSchema, CardioSetSchema]);

// PATCH /sets/:id body — note/flags only (partial update of an existing set's
// annotations; weight/reps corrections still go through the replace-row path
// in mobile/src/data/setEditing.ts).
const PatchNoteFlagsSchema = z.object({
    note: z.string().max(500).nullable().optional(),
    flags: z.number().int().min(0).max(MAX_FLAGS).optional(),
});

// POST /sets
// T-03 (2026-05-02): verify workout ownership before inserting.
// CTO guardrail #10: any route that accepts a foreign-key reference must
// verify ownership against req.user.id before writing.
router.post('/', async (req, res, next) => {
    try {
        const body = SetSchema.parse(req.body);

        // T-03: confirm the workout belongs to the calling user.
        const { rows: ownerCheck } = await pool.query(
            `SELECT id FROM workouts WHERE id = $1 AND user_id = $2`,
            [body.workoutId, req.user.id]
        );
        if (ownerCheck.length === 0) {
            return res.status(403).json({ error: 'workout_not_found_or_forbidden' });
        }

        const insertParams = [
            body.workoutId, req.user.id, body.exerciseId, body.kind, body.setIndex,
            body.kind === 'lift' ? body.reps : null,
            // Encode weight_kg → weight_raw (kg × 8) for SMALLINT storage
            body.kind === 'lift' ? encodeWeight(body.weightKg) : null,
            body.kind === 'lift' ? (body.rir ?? -1) : null,
            body.kind === 'cardio' ? body.durationSec : null,
            body.kind === 'cardio' ? (body.distanceM ?? null) : null,
            body.kind === 'cardio' ? (body.avgPaceSecPerKm ?? null) : null,
            body.note ?? null,
            body.flags ?? 0,
            // Backdated logging: COALESCE($14, now()) — omitted → now(),
            // exactly the column default's old behaviour.
            body.loggedAt ?? null,
        ];

        try {
            // TICKET-129: try the note/flags-aware INSERT first.
            const { rows } = await pool.query(
                `INSERT INTO sets
                    (workout_id, user_id, exercise_id, kind, set_index,
                     reps, weight_raw, rir,
                     duration_sec, distance_m, avg_pace_sec_per_km,
                     note, flags, logged_at)
                 VALUES ($1, $2, $3, $4, $5,
                         $6, $7, $8,
                         $9, $10, $11,
                         $12, $13, COALESCE($14, now()))
                 RETURNING id, workout_id, user_id, exercise_id, kind, set_index,
                           reps, weight_raw, rir,
                           duration_sec, distance_m, avg_pace_sec_per_km,
                           note, flags,
                           logged_at`,
                // NOTE (2026-06-01): removed `is_pr` from RETURNING — there is no
                // is_pr column on `sets` in any migration, so this RETURNING 500'd
                // every POST /sets (logging a set was completely broken). PR status
                // is derived client-side in useWorkoutHistory.ts (prIds.has(set.id))
                // against the exercise_prs table; it is NOT a column on sets and the
                // client never reads it from this response. See TICKET-068 / L-017.
                insertParams
            );
            // Decode weight_raw → weight_kg before returning to client
            return res.status(201).json(normalizeSet(rows[0]));
        } catch (err) {
            // Drift guard (CLAUDE.md §4): a prod DB that hasn't yet run the
            // note/flags migration 42703s on the new columns — degrade to the
            // pre-129 INSERT rather than 500ing every set log for every user.
            if (!isMissingSchema(err)) throw err;
            const { rows } = await pool.query(
                `INSERT INTO sets
                    (workout_id, user_id, exercise_id, kind, set_index,
                     reps, weight_raw, rir,
                     duration_sec, distance_m, avg_pace_sec_per_km,
                     logged_at)
                 VALUES ($1, $2, $3, $4, $5,
                         $6, $7, $8,
                         $9, $10, $11,
                         COALESCE($12, now()))
                 RETURNING id, workout_id, user_id, exercise_id, kind, set_index,
                           reps, weight_raw, rir,
                           duration_sec, distance_m, avg_pace_sec_per_km,
                           logged_at`,
                // logged_at exists in every deployed schema (it's in RETURNING
                // above) — only note/flags are drift-guarded out here.
                insertParams.slice(0, 11).concat([body.loggedAt ?? null])
            );
            return res.status(201).json(normalizeSet(rows[0]));
        }
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PATCH /sets/:id — TICKET-129: update note / flags on an already-logged set.
//
// Ownership-checked (WHERE id = $1 AND user_id = $2, same guardrail as every
// other per-row route). Weight/reps corrections still go through the
// delete+re-log replace path (mobile/src/data/setEditing.ts) — this endpoint
// ONLY ever touches note/flags, so it can't be used to smuggle a weight edit
// past that path's ownership + PR-recompute semantics.
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res, next) => {
    try {
        const patch = PatchNoteFlagsSchema.parse(req.body);
        if (patch.note === undefined && patch.flags === undefined) {
            return res.status(400).json({ error: 'no_fields' });
        }

        const sets = [];
        const params = [];
        if (patch.note !== undefined) {
            params.push(patch.note);
            sets.push(`note = $${params.length}`);
        }
        if (patch.flags !== undefined) {
            params.push(patch.flags);
            sets.push(`flags = $${params.length}`);
        }
        params.push(req.params.id, req.user.id);

        try {
            const { rows } = await pool.query(
                `UPDATE sets SET ${sets.join(', ')}
                 WHERE id = $${params.length - 1} AND user_id = $${params.length}
                 RETURNING id, workout_id, user_id, exercise_id, kind, set_index,
                           reps, weight_raw, rir,
                           duration_sec, distance_m, avg_pace_sec_per_km,
                           note, flags, logged_at`,
                params
            );
            if (!rows[0]) return res.status(404).json({ error: 'not_found' });
            return res.json(normalizeSet(rows[0]));
        } catch (err) {
            // Drift guard: prod hasn't migrated yet — there is nothing to patch,
            // degrade to 404 rather than 500 (the columns don't exist to update).
            if (isMissingSchema(err)) {
                return res.status(404).json({ error: 'not_found' });
            }
            throw err;
        }
    } catch (err) { next(err); }
});

// GET /sets?workoutId=<uuid>  OR  GET /sets?cursor=<ISO>&limit=<n>
// T-08 (2026-05-02): cursor-based pagination replaces the hardcoded LIMIT 1000.
// Params:
//   ?workoutId=<uuid>          — all sets for a specific workout (no cursor)
//   ?cursor=<ISO-timestamp>    — return only rows logged_at < cursor (exclusive)
//   ?limit=<integer>           — page size; default 50, max 200
// Response includes nextCursor (null when no more pages).
router.get('/', async (req, res, next) => {
    try {
        const { workoutId, cursor } = req.query;
        const exerciseId = req.query.exercise_id || req.query.exerciseId;
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

        // TICKET-090: per-exercise history. The old handler ignored exercise_id
        // entirely and fell through to the cursor scan, returning the user's most
        // recent sets across ALL exercises — so every exercise's "history" showed
        // whatever was logged most (e.g. hack squat). Filter to the one exercise.
        if (exerciseId) {
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!UUID_RE.test(String(exerciseId))) {
                return res.json({ sets: [], nextCursor: null });
            }
            const params = [req.user.id, exerciseId, limit];
            const cursorClause = cursor
                ? `AND s.logged_at < $${params.push(cursor) && params.length}`
                : '';
            const { rows } = await pool.query(
                `SELECT s.*
                 FROM sets s
                 WHERE s.user_id = $1 AND s.exercise_id = $2
                   ${cursorClause}
                 ORDER BY s.logged_at DESC
                 LIMIT $3`,
                params
            );
            return res.json({ sets: rows.map(normalizeSet), nextCursor: null });
        }

        if (workoutId) {
            // Direct workout lookup — no pagination needed.
            const { rows } = await pool.query(
                `SELECT s.*
                 FROM sets s
                 JOIN workouts w ON w.id = s.workout_id
                 WHERE s.workout_id = $1 AND w.user_id = $2
                 ORDER BY s.set_index ASC`,
                [workoutId, req.user.id]
            );
            return res.json({ sets: rows.map(normalizeSet), nextCursor: null });
        }

        // Cursor-based page scan across all sets for the user.
        const params = [req.user.id, limit + 1]; // fetch one extra to detect next page
        const cursorClause = cursor
            ? `AND s.logged_at < $${params.push(cursor) && params.length}`
            : '';

        const { rows } = await pool.query(
            `SELECT s.*
             FROM sets s
             WHERE s.user_id = $1
               ${cursorClause}
             ORDER BY s.logged_at DESC
             LIMIT $2`,
            params
        );

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const nextCursor = hasMore ? page[page.length - 1].logged_at : null;

        res.json({ sets: page.map(normalizeSet), nextCursor });
    } catch (err) { next(err); }
});


// ---------------------------------------------------------------------------
// GET /sets/personal-best/:exerciseId
//
// Returns the all-time best set and the last-session best set for the
// authenticated user × a specific exercise. Used by the Log screen to show
// a reference PB card after the user selects an exercise.
//
// "All-time best"   — set with the highest Epley estimated 1RM across all
//                     logged history (weight_raw/8 × (1 + reps/30)).
// "Last session"    — heaviest set from the most-recent day_key that
//                     contains at least one set for this exercise.
//
// Response:
//   {
//     all_time_best:  { weight_kg, reps, logged_at, day_key } | null,
//     last_session:   { weight_kg, reps, logged_at, day_key } | null
//   }
//
// Returns { all_time_best: null, last_session: null } if the user has never
// logged this exercise.
// ---------------------------------------------------------------------------
router.get('/personal-best/:exerciseId', async (req, res, next) => {
    try {
        const { exerciseId } = req.params;

        // SRV-DATA-03: reject a non-UUID :exerciseId before it hits the UUID cast
        // ($2) and 22P02-500s; return the same empty shape as "never logged".
        if (!z.string().uuid().safeParse(exerciseId).success) {
            return res.json({ all_time_best: null, last_session: null });
        }

        // All-time best: highest Epley e1rm across all sets for this exercise.
        const atbResult = await pool.query(
            `SELECT
                s.weight_raw / 8.0                                   AS weight_kg,
                s.reps,
                s.logged_at,
                w.day_key,
                CASE
                    WHEN s.reps = 1 THEN s.weight_raw / 8.0
                    ELSE (s.weight_raw / 8.0) * (1.0 + s.reps::float / 30.0)
                END                                                  AS e1rm_kg
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             WHERE w.user_id    = $1
               AND s.exercise_id = $2
               AND s.kind        = 'lift'
               AND s.weight_raw  > 0
               AND s.reps       >= 1
             ORDER BY e1rm_kg DESC
             LIMIT 1`,
            [req.user.id, exerciseId]
        );

        // Last session: most recent day that has a set for this exercise,
        // then the heaviest set from that day.
        const lsResult = await pool.query(
            `WITH last_day AS (
                SELECT MAX(w.day_key) AS day_key
                FROM sets s
                JOIN workouts w ON w.id = s.workout_id
                WHERE w.user_id    = $1
                  AND s.exercise_id = $2
                  AND s.kind        = 'lift'
                  AND s.weight_raw  > 0
                  AND s.reps       >= 1
             )
             SELECT
                s.weight_raw / 8.0 AS weight_kg,
                s.reps,
                s.logged_at,
                w.day_key
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             WHERE w.user_id    = $1
               AND s.exercise_id = $2
               AND s.kind        = 'lift'
               AND s.weight_raw  > 0
               AND s.reps       >= 1
               AND w.day_key     = (SELECT day_key FROM last_day)
             ORDER BY s.weight_raw DESC, s.reps DESC
             LIMIT 1`,
            [req.user.id, exerciseId]
        );

        const atb = atbResult.rows[0] ?? null;
        const ls  = lsResult.rows[0] ?? null;

        res.json({
            all_time_best: atb ? {
                weight_kg: parseFloat(atb.weight_kg),
                reps:      atb.reps,
                logged_at: atb.logged_at,
                day_key:   atb.day_key,
            } : null,
            last_session: ls ? {
                weight_kg: parseFloat(ls.weight_kg),
                reps:      ls.reps,
                logged_at: ls.logged_at,
                day_key:   ls.day_key,
            } : null,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /sets/personal-best/batch  body: { exerciseIds: string[] }
//   → { [exerciseId]: { weight_kg: number, reps: number } | null }
//
// Batch version of GET /sets/personal-best/:exerciseId used by the PRO
// smart-suggest "JUST LOGGED" stepper card to show each suggested exercise's
// all-time best (highest Epley e1rm) in a single round-trip. Inherits
// requireAuth from this router (same as every other /sets route).
// ---------------------------------------------------------------------------
router.post('/personal-best/batch', async (req, res, next) => {
    try {
        const raw = req.body?.exerciseIds;
        if (!Array.isArray(raw) || raw.length === 0) {
            return res.json({});
        }
        // Keep only strings, de-dupe, cap at 50.
        const exerciseIds = [...new Set(raw.filter((id) => typeof id === 'string'))].slice(0, 50);
        if (exerciseIds.length === 0) {
            return res.json({});
        }

        // ONE query: all-time best (highest Epley e1rm) lift set per exercise.
        const { rows } = await pool.query(
            `SELECT DISTINCT ON (s.exercise_id)
                s.exercise_id,
                s.weight_raw / 8.0 AS weight_kg,
                s.reps
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             WHERE w.user_id = $1
               AND s.exercise_id = ANY($2::uuid[])
               AND s.kind = 'lift' AND s.weight_raw > 0 AND s.reps >= 1
             ORDER BY s.exercise_id,
               (CASE WHEN s.reps = 1 THEN s.weight_raw/8.0 ELSE (s.weight_raw/8.0)*(1.0 + s.reps::float/30.0) END) DESC`,
            [req.user.id, exerciseIds]
        );

        // Start every requested id at null, then fill from rows.
        const result = {};
        for (const id of exerciseIds) result[id] = null;
        for (const row of rows) {
            result[row.exercise_id] = { weight_kg: Number(row.weight_kg), reps: row.reps };
        }
        res.json(result);
    } catch (err) { next(err); }
});

// DELETE /sets/:id
// N-13 (2026-05-03): delete endpoint with ownership check.
router.delete('/:id', async (req, res, next) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM sets WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'not_found' });
        res.status(204).end();
    } catch (err) { next(err); }
});

module.exports = router;
