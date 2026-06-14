// /exercises — search and browse the global exercise library
// Backs TICKET-007 (exercise search synonyms/aliases)
// dev-backend — 2026-05-02
// Phase: B (production stack foundation)

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { requirePaid } = require('../middleware/requirePaid');

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

        // NOTE: `limit` is intentionally NOT a bind parameter. It is applied in
        // JS via rows.slice(0, limit) below. Pushing it here made it $4 while
        // neither SQL references $4, so Postgres rejected every no-`kind` call
        // with "bind message supplies 4 parameters, but prepared statement
        // requires 3" — breaking search for every caller (ExercisePicker never
        // sends `kind`). The catch only wrapped the alias query, so the
        // name-only fallback's identical failure 500'd. (search-still-broken fix)
        const params = [`%${q}%`, q, `${q}%`];
        let kindClause = '';
        if (kind) {
            params.push(kind);
            kindClause = `AND e.category = $${params.length}`;
        }

        // TICKET-089: the alias-aware query joins exercise_aliases. If that table
        // is missing/unmigrated on the live DB the whole query 500s, and the
        // client swallows the error → search looks completely dead while browse
        // still works (browse doesn't touch aliases). Run the alias-aware query
        // first; on ANY DB error fall back to a name-only search so search always
        // returns matches rather than failing.
        const aliasAwareSql =
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
            ORDER BY id, score DESC`;

        const nameOnlySql =
            `SELECT
                e.id, e.name, e.category, e.muscle_groups, e.is_compound,
                CASE
                    WHEN LOWER(e.name) = LOWER($2) THEN 3
                    WHEN LOWER(e.name) LIKE LOWER($3) THEN 2
                    ELSE 1
                END AS score
             FROM exercises e
             WHERE e.name ILIKE $1
             ${kindClause}`;

        let rows;
        try {
            ({ rows } = await pool.query(aliasAwareSql, params));
        } catch (aliasErr) {
            console.warn('[PF] /exercises/search alias query failed, falling back to name-only:',
                aliasErr && aliasErr.message);
            ({ rows } = await pool.query(nameOnlySql, params));
        }

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

// ---------------------------------------------------------------------------
// GET /exercises/:id/alternatives — PRO feature (machine-busy swap)
//
// Returns exercises that train the same muscles as :id, ranked by overlap.
// Pro-gated: /exercises GETs are public at the mount, so we apply requireAuth +
// requirePaid at the ROUTE level here.
//
// Matching:
//   • Primary signal: shared muscle_heads (granular: 'lower_chest', 'side_delt').
//   • Until exercises are tagged with muscle_heads, falls back to the coarse
//     muscle_groups so the endpoint degrades gracefully (never errors).
//   • Same category; prefer same compound/isolation profile.
//   • ?avoid=machine (or dumbbell/etc.) down-ranks that equipment and rewards
//     alternatives on different equipment — the actual "machine is busy" case.
//   • Excludes movements contraindicated by the user's saved constraints.
//
// Query: ?limit=6 (max 20) &avoid=<equipment>
// Response: { source, tagged, alternatives: [{ id, name, equipment,
//             muscle_heads, shared_heads, is_compound }] }
// ---------------------------------------------------------------------------
router.get('/:id/alternatives', requireAuth, requirePaid, async (req, res, next) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 6, 20);
        const avoid = typeof req.query.avoid === 'string' ? req.query.avoid : null;

        // 1. Source exercise
        const { rows: srcRows } = await pool.query(
            `SELECT id, name, category, muscle_groups, muscle_heads, equipment, is_compound
             FROM exercises WHERE id = $1`,
            [req.params.id]
        );
        if (srcRows.length === 0) return res.status(404).json({ error: 'exercise_not_found' });
        const src = srcRows[0];

        const srcHeads = Array.isArray(src.muscle_heads) ? src.muscle_heads : [];
        const srcGroups = Array.isArray(src.muscle_groups) ? src.muscle_groups : [];
        const useHeads = srcHeads.length > 0;

        // 2. Candidates: same category, sharing a head (or, pre-tagging, a group)
        const { rows: candidates } = await pool.query(
            `SELECT id, name, category, muscle_groups, muscle_heads, equipment,
                    is_compound, contraindications
             FROM exercises
             WHERE id <> $1
               AND category = $2
               AND (
                   ($3::text[] <> '{}' AND muscle_heads && $3::text[])
                   OR ($3::text[] = '{}' AND muscle_groups && $4::text[])
               )`,
            [src.id, src.category, srcHeads, srcGroups]
        );

        // 3. User constraints — drop contraindicated movements
        const { rows: consRows } = await pool.query(
            `SELECT constraint_type FROM user_constraints WHERE user_id = $1`,
            [req.user.id]
        );
        const userConstraints = new Set(consRows.map((c) => c.constraint_type));

        const headSet = new Set(srcHeads);
        const groupSet = new Set(srcGroups);

        const scored = candidates
            .filter((ex) => {
                const contra = Array.isArray(ex.contraindications) ? ex.contraindications : [];
                return !contra.some((c) => userConstraints.has(c));
            })
            .map((ex) => {
                const heads = Array.isArray(ex.muscle_heads) ? ex.muscle_heads : [];
                const groups = Array.isArray(ex.muscle_groups) ? ex.muscle_groups : [];
                const sharedHeads = heads.filter((h) => headSet.has(h));
                const sharedGroups = groups.filter((g) => groupSet.has(g));

                let score = sharedHeads.length * 10 + sharedGroups.length * 2;
                if (ex.is_compound === src.is_compound) score += 1;
                if (avoid && ex.equipment) {
                    if (ex.equipment === avoid) score -= 4;   // same busy equipment — avoid
                    else score += 4;                          // different equipment — preferred
                }
                return {
                    id: ex.id,
                    name: ex.name,
                    equipment: ex.equipment,
                    muscle_heads: heads,
                    shared_heads: sharedHeads,
                    is_compound: ex.is_compound,
                    score,
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        res.json({
            source: { id: src.id, name: src.name },
            tagged: useHeads,   // false until exercises get muscle_heads — UI can hint "improving"
            alternatives: scored,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /exercises/:id/substitutes — Training Engine spec §4
//
// Returns up to 5 substitutes for a given exercise, ranked by:
//   1. Equipment compatible with the user's equipment_profile (optional ?equipment CSV param)
//   2. Same primary muscle_groups overlap (desc)
//   3. is_compound match
// Excludes exercises contraindicated by user's saved constraints.
//
// Query params: equipment — comma-separated list (overrides user profile)
// Response: { substitutes:[{id,name,equipment,muscle_groups,why}], rule_trace[] }
// ---------------------------------------------------------------------------
router.get('/:id/substitutes', requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const ruleTrace = [];

        // 1. Source exercise
        const { rows: srcRows } = await pool.query(
            `SELECT id, name, category, muscle_groups, movement_pattern,
                    equipment, is_compound, contraindications
             FROM exercises WHERE id = $1`,
            [id]
        );
        if (srcRows.length === 0) {
            return res.status(404).json({ error: 'exercise_not_found' });
        }
        const src = srcRows[0];
        ruleTrace.push(`Source: "${src.name}" — pattern: ${src.movement_pattern ?? 'untagged'}`);

        // 2. Determine equipment filter
        // Priority: ?equipment param → user profile → unrestricted
        let equipmentFilter = null;
        if (req.query.equipment) {
            equipmentFilter = req.query.equipment.split(',').map(e => e.trim()).filter(Boolean);
            ruleTrace.push(`Equipment from query param: [${equipmentFilter.join(', ')}]`);
        } else {
            const { rows: profRows } = await pool.query(
                `SELECT equipment_profile FROM users WHERE id = $1`,
                [req.user.id]
            );
            if (profRows[0]?.equipment_profile?.length) {
                equipmentFilter = profRows[0].equipment_profile;
                ruleTrace.push(`Equipment from user profile: [${equipmentFilter.join(', ')}]`);
            } else {
                ruleTrace.push('No equipment filter — returning all equipment');
            }
        }

        // 3. User constraints — for exclusion
        const { rows: consRows } = await pool.query(
            `SELECT constraint_type FROM user_constraints WHERE user_id = $1`,
            [req.user.id]
        );
        const userConstraints = new Set(consRows.map(c => c.constraint_type));

        // 4. Candidates: same movement_pattern (if tagged), same category, excluding self
        // Fall back to muscle_group overlap if movement_pattern is NULL
        let candidateRows;
        if (src.movement_pattern) {
            const { rows } = await pool.query(
                `SELECT id, name, category, muscle_groups, movement_pattern,
                        equipment, is_compound, contraindications
                 FROM exercises
                 WHERE id <> $1
                   AND movement_pattern = $2`,
                [id, src.movement_pattern]
            );
            candidateRows = rows;
            ruleTrace.push(`Candidates by movement_pattern="${src.movement_pattern}": ${rows.length}`);
        } else {
            // Fallback: muscle group overlap
            const srcGroups = Array.isArray(src.muscle_groups) ? src.muscle_groups : [];
            const { rows } = await pool.query(
                `SELECT id, name, category, muscle_groups, movement_pattern,
                        equipment, is_compound, contraindications
                 FROM exercises
                 WHERE id <> $1
                   AND category = $2
                   AND muscle_groups && $3::text[]`,
                [id, src.category, srcGroups]
            );
            candidateRows = rows;
            ruleTrace.push(`Fallback (untagged): candidates by muscle_group overlap: ${rows.length}`);
        }

        // 5. Score candidates
        const srcGroups = new Set(Array.isArray(src.muscle_groups) ? src.muscle_groups : []);

        const scored = candidateRows
            .filter(ex => {
                // Exclude contraindicated
                const contra = Array.isArray(ex.contraindications) ? ex.contraindications : [];
                return !contra.some(c => userConstraints.has(c));
            })
            .map(ex => {
                const exEquipment = Array.isArray(ex.equipment) ? ex.equipment : [];
                const exGroups = Array.isArray(ex.muscle_groups) ? ex.muscle_groups : [];

                // Equipment compatibility: has at least one item from filter
                const equipCompat = !equipmentFilter ||
                    exEquipment.some(e => equipmentFilter.includes(e));

                // Muscle group overlap count
                const overlapCount = exGroups.filter(g => srcGroups.has(g)).length;

                // Compound match
                const compoundMatch = ex.is_compound === src.is_compound;

                // Score: equipment compat is primary sort key (4 pts), then overlap, then compound
                const score = (equipCompat ? 40 : 0) + overlapCount * 5 + (compoundMatch ? 1 : 0);

                // Build why string
                const whyParts = [];
                if (src.movement_pattern) whyParts.push(`same movement pattern (${src.movement_pattern})`);
                if (overlapCount > 0) whyParts.push(`${overlapCount} shared muscle group${overlapCount > 1 ? 's' : ''}`);
                if (equipCompat && equipmentFilter) whyParts.push('matches your equipment');
                const why = whyParts.length > 0 ? whyParts.join('; ') : 'similar exercise';

                return {
                    id: ex.id,
                    name: ex.name,
                    equipment: exEquipment,
                    muscle_groups: exGroups,
                    why,
                    score,
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(({ score: _score, ...ex }) => ex); // strip internal score field

        ruleTrace.push(`Returning ${scored.length} substitutes after filtering and ranking`);

        res.json({ substitutes: scored, rule_trace: ruleTrace });
    } catch (err) { next(err); }
});

module.exports = router;
