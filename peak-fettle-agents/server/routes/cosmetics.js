// Peak Fettle — /cosmetics route
// dev-backend — 2026-05-03
// Phase: D (Character Customization + Cosmetic Shop)
// Source: user decision (2026-05-03) + group_streak_credits_spec.md §2 (spending)
//
// All routes require JWT auth (mounted under requireAuth in index.js).
//
// ── Shop catalog ──────────────────────────────────────────────────────────────
//   GET  /cosmetics                    Full catalog with per-item owned flag
//   GET  /cosmetics?category=avatar    Filter by category
//   GET  /cosmetics?rarity=rare        Filter by rarity
//
// ── Ownership ─────────────────────────────────────────────────────────────────
//   GET  /cosmetics/owned              Caller's owned items (+ defaults)
//
// ── Purchase ──────────────────────────────────────────────────────────────────
//   POST /cosmetics/:id/purchase       Atomically debit credits + grant ownership
//
// ── Loadout (equip/unequip) ───────────────────────────────────────────────────
//   GET  /cosmetics/equipped           Caller's active loadout (all 4 slots)
//   PUT  /cosmetics/equipped/:slot     Equip an item (must be owned or default)
//   DELETE /cosmetics/equipped/:slot   Unequip (slot falls back to category default)
//
// ── Public profile ────────────────────────────────────────────────────────────
//   GET  /cosmetics/profile/:userId    Another user's equipped cosmetics (public)
//
// ── Item detail ───────────────────────────────────────────────────────────────
//   GET  /cosmetics/:id                Single item detail + caller's ownership status
//
// Purchase atomicity:
//   The balance check and credit debit happen in a single INSERT … SELECT … WHERE
//   statement. If the balance is insufficient, the INSERT produces 0 rows and no
//   ledger entry is written. This avoids a read-then-write race condition.

'use strict';

const express = require('express');
const { z }   = require('zod');
const { pool } = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VALID_CATEGORIES = ['avatar', 'frame', 'badge', 'theme'];
const VALID_RARITIES   = ['common', 'rare', 'legendary'];
const VALID_SLOTS      = VALID_CATEGORIES; // slot names mirror category names

// Rarity → default price mapping (matches seed data; used for validation only).
const RARITY_PRICES = { common: 100, rare: 300, legendary: 750 };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches the caller's credit balance (SUM of all credit_ledger rows).
 * Used only for response enrichment after a transaction — not for the
 * balance-check itself (that is done atomically in the INSERT…SELECT).
 */
async function getBalance(client, userId) {
    const { rows } = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS balance
         FROM credit_ledger WHERE user_id = $1`,
        [userId]
    );
    return parseInt(rows[0].balance, 10);
}

// ---------------------------------------------------------------------------
// IMPORTANT: All static sub-paths must be declared BEFORE /:id to prevent
// Express from treating 'owned', 'equipped', 'profile' as item UUIDs.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET /cosmetics/owned — caller's acquired items + all default items
// Defaults are included regardless of user_cosmetics rows (they are free
// and available to all users without a purchase).
// ---------------------------------------------------------------------------
router.get('/owned', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT ci.id, ci.name, ci.description, ci.category, ci.rarity,
                    ci.price_credits, ci.is_default, ci.metadata, ci.sort_order,
                    CASE WHEN ci.is_default THEN TRUE
                         ELSE (uc.item_id IS NOT NULL)
                    END AS owned,
                    uc.acquired_at,
                    uc.acquisition_source,
                    -- Is this item currently equipped in its slot?
                    (uec.item_id IS NOT NULL) AS equipped
             FROM cosmetic_items ci
             LEFT JOIN user_cosmetics uc
                    ON uc.item_id = ci.id AND uc.user_id = $1
             LEFT JOIN user_equipped_cosmetics uec
                    ON uec.item_id = ci.id AND uec.user_id = $1
             WHERE ci.is_default = TRUE
                OR uc.item_id IS NOT NULL
             ORDER BY ci.category, ci.rarity, ci.sort_order`,
            [req.user.id]
        );
        res.json({ items: rows });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /cosmetics/equipped — caller's active loadout (all 4 slots)
// Returns an object keyed by slot. Missing slots resolve to the category
// default at render time (client responsibility), but we also return the
// default item data for slots with no explicit selection.
// ---------------------------------------------------------------------------
router.get('/equipped', async (req, res, next) => {
    try {
        // Fetch explicitly equipped items
        const { rows: equipped } = await pool.query(
            `SELECT uec.slot, uec.item_id, uec.equipped_at,
                    ci.name, ci.description, ci.category, ci.rarity,
                    ci.is_default, ci.metadata
             FROM user_equipped_cosmetics uec
             JOIN cosmetic_items ci ON ci.id = uec.item_id
             WHERE uec.user_id = $1`,
            [req.user.id]
        );

        // Fetch one default item per category as fallback data
        const { rows: defaults } = await pool.query(
            `SELECT DISTINCT ON (category)
                    id AS item_id, name, description, category,
                    rarity, is_default, metadata
             FROM cosmetic_items
             WHERE is_default = TRUE AND is_active = TRUE
             ORDER BY category, sort_order ASC`
        );

        // Build a slot map: explicit equipped items take precedence; fall back to default
        const defaultBySlot = {};
        defaults.forEach(d => { defaultBySlot[d.category] = d; });

        const loadout = {};
        VALID_SLOTS.forEach(slot => {
            const explicit = equipped.find(e => e.slot === slot);
            loadout[slot] = explicit
                ? { ...explicit, is_fallback_default: false }
                : { ...defaultBySlot[slot], slot, equipped_at: null, is_fallback_default: true };
        });

        res.json({ loadout });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PUT /cosmetics/equipped/:slot — equip an item
// Rules:
//   1. slot must be a valid category name.
//   2. item must exist, be active, and match the slot's category.
//   3. item must be owned by the caller OR be a default item.
// ---------------------------------------------------------------------------
router.put('/equipped/:slot', async (req, res, next) => {
    try {
        const { slot } = z.object({
            slot: z.enum(VALID_SLOTS),
        }).parse(req.params);

        const { itemId } = z.object({
            itemId: z.string().uuid(),
        }).parse(req.body);

        // Fetch the item and verify category match
        const { rows: itemRows } = await pool.query(
            `SELECT id, name, category, rarity, is_default, is_active
             FROM cosmetic_items WHERE id = $1`,
            [itemId]
        );
        if (itemRows.length === 0 || !itemRows[0].is_active) {
            return res.status(404).json({ error: 'item_not_found' });
        }
        const item = itemRows[0];
        if (item.category !== slot) {
            return res.status(400).json({
                error: 'category_slot_mismatch',
                detail: `Item category '${item.category}' cannot be equipped in slot '${slot}'.`,
            });
        }

        // Ownership check: default items are equippable by anyone; non-defaults
        // require a user_cosmetics row.
        if (!item.is_default) {
            const { rows: ownedRows } = await pool.query(
                `SELECT 1 FROM user_cosmetics
                 WHERE user_id = $1 AND item_id = $2`,
                [req.user.id, itemId]
            );
            if (ownedRows.length === 0) {
                return res.status(403).json({ error: 'item_not_owned' });
            }
        }

        // Upsert the equipped slot
        const { rows } = await pool.query(
            `INSERT INTO user_equipped_cosmetics (user_id, slot, item_id, equipped_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, slot) DO UPDATE
                SET item_id    = EXCLUDED.item_id,
                    equipped_at = EXCLUDED.equipped_at
             RETURNING slot, item_id, equipped_at`,
            [req.user.id, slot, itemId]
        );

        res.json({ equipped: rows[0], item: { name: item.name, rarity: item.rarity } });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /cosmetics/equipped/:slot — unequip (slot falls back to default)
// ---------------------------------------------------------------------------
router.delete('/equipped/:slot', async (req, res, next) => {
    try {
        const { slot } = z.object({
            slot: z.enum(VALID_SLOTS),
        }).parse(req.params);

        await pool.query(
            `DELETE FROM user_equipped_cosmetics WHERE user_id = $1 AND slot = $2`,
            [req.user.id, slot]
        );

        // Return the category default so the client can immediately re-render
        const { rows: defaultItem } = await pool.query(
            `SELECT id, name, description, category, rarity, metadata
             FROM cosmetic_items
             WHERE category = $1 AND is_default = TRUE AND is_active = TRUE
             ORDER BY sort_order ASC LIMIT 1`,
            [slot]
        );

        res.json({
            unequipped: true,
            slot,
            fallback_default: defaultItem[0] || null,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /cosmetics/profile/:userId — another user's equipped loadout (public)
// Used in group rosters and leaderboards to display members' customizations.
// ---------------------------------------------------------------------------
router.get('/profile/:userId', async (req, res, next) => {
    try {
        const { userId } = z.object({
            userId: z.string().uuid(),
        }).parse(req.params);

        // Verify the user exists
        const { rows: userRows } = await pool.query(
            `SELECT id, display_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
            [userId]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ error: 'user_not_found' });
        }

        const { rows: equipped } = await pool.query(
            `SELECT uec.slot, ci.id AS item_id, ci.name, ci.description,
                    ci.category, ci.rarity, ci.is_default, ci.metadata, uec.equipped_at
             FROM user_equipped_cosmetics uec
             JOIN cosmetic_items ci ON ci.id = uec.item_id
             WHERE uec.user_id = $1`,
            [userId]
        );

        // Fallback defaults for unset slots
        const { rows: defaults } = await pool.query(
            `SELECT DISTINCT ON (category)
                    id AS item_id, name, description,
                    category, rarity, is_default, metadata
             FROM cosmetic_items
             WHERE is_default = TRUE AND is_active = TRUE
             ORDER BY category, sort_order ASC`
        );
        const defaultBySlot = {};
        defaults.forEach(d => { defaultBySlot[d.category] = d; });

        const loadout = {};
        VALID_SLOTS.forEach(slot => {
            const explicit = equipped.find(e => e.slot === slot);
            loadout[slot] = explicit || { ...defaultBySlot[slot], slot, is_fallback_default: true };
        });

        res.json({
            user: userRows[0],
            loadout,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /cosmetics — full shop catalog with per-item ownership status
// Optional query params: ?category=avatar  ?rarity=rare
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const categoryFilter = req.query.category || null;
        const rarityFilter   = req.query.rarity   || null;

        // Validate filters
        if (categoryFilter && !VALID_CATEGORIES.includes(categoryFilter)) {
            return res.status(400).json({
                error: 'invalid_category',
                valid: VALID_CATEGORIES,
            });
        }
        if (rarityFilter && !VALID_RARITIES.includes(rarityFilter)) {
            return res.status(400).json({
                error: 'invalid_rarity',
                valid: VALID_RARITIES,
            });
        }

        const { rows } = await pool.query(
            `SELECT ci.id, ci.name, ci.description, ci.category, ci.rarity,
                    ci.price_credits, ci.is_default, ci.metadata, ci.sort_order,
                    -- owned: true if the caller has this item OR it is a default
                    CASE WHEN ci.is_default THEN TRUE
                         ELSE (uc.item_id IS NOT NULL)
                    END AS owned,
                    -- equipped: true if this item is the caller's active slot selection
                    (uec.item_id IS NOT NULL) AS equipped
             FROM cosmetic_items ci
             LEFT JOIN user_cosmetics uc
                    ON uc.item_id = ci.id AND uc.user_id = $1
             LEFT JOIN user_equipped_cosmetics uec
                    ON uec.item_id = ci.id AND uec.user_id = $1
             WHERE ci.is_active = TRUE
               AND ($2::text IS NULL OR ci.category = $2)
               AND ($3::text IS NULL OR ci.rarity   = $3)
             ORDER BY ci.category, ci.rarity, ci.sort_order`,
            [req.user.id, categoryFilter, rarityFilter]
        );

        res.json({ items: rows });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /cosmetics/:id/purchase — buy an item with credits
//
// Atomicity: we use a single INSERT … SELECT … WHERE statement that checks
// the balance and writes the ledger entry in one operation. If the WHERE
// clause (balance >= price) is false, the SELECT returns 0 rows, the INSERT
// inserts nothing, and rows.length === 0 tells us the purchase failed.
// This eliminates the read-then-write race condition that could allow
// overdrafts under concurrent requests from the same user.
//
// Idempotency: attempting to purchase an already-owned item returns 409.
// ---------------------------------------------------------------------------
router.post('/:id/purchase', async (req, res, next) => {
    try {
        const { id: itemId } = z.object({ id: z.string().uuid() }).parse(req.params);
        const userId = req.user.id;

        // Fetch the item
        const { rows: itemRows } = await pool.query(
            `SELECT id, name, category, rarity, price_credits, is_default, is_active
             FROM cosmetic_items WHERE id = $1`,
            [itemId]
        );
        if (itemRows.length === 0 || !itemRows[0].is_active) {
            return res.status(404).json({ error: 'item_not_found' });
        }
        const item = itemRows[0];

        // Default items cannot be purchased (they are already "owned" by everyone)
        if (item.is_default) {
            return res.status(400).json({ error: 'item_is_free_no_purchase_needed' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Idempotency check: already owned?
            const { rows: alreadyOwned } = await client.query(
                `SELECT 1 FROM user_cosmetics WHERE user_id = $1 AND item_id = $2`,
                [userId, itemId]
            );
            if (alreadyOwned.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'already_owned' });
            }

            // ── Atomic balance-check + credit debit ────────────────────────
            // Insert a negative ledger entry ONLY IF current balance ≥ price.
            // The subquery SUM is evaluated at INSERT time inside the transaction,
            // preventing concurrent overdrafts.
            const { rows: ledgerRows } = await client.query(
                `INSERT INTO credit_ledger (user_id, amount, source, group_id, week_start)
                 SELECT $1, -$2, 'cosmetic_purchase', NULL, NULL
                 WHERE (
                     SELECT COALESCE(SUM(amount), 0)
                     FROM credit_ledger
                     WHERE user_id = $1
                 ) >= $2
                 RETURNING id`,
                [userId, item.price_credits]
            );

            if (ledgerRows.length === 0) {
                // Balance insufficient — no ledger row was written
                await client.query('ROLLBACK');
                const balance = await getBalance(client, userId);
                return res.status(402).json({
                    error:    'insufficient_credits',
                    balance,
                    required: item.price_credits,
                });
            }

            // Grant ownership
            await client.query(
                `INSERT INTO user_cosmetics (user_id, item_id, acquisition_source)
                 VALUES ($1, $2, 'purchase')`,
                [userId, itemId]
            );

            await client.query('COMMIT');

            const newBalance = await getBalance(pool, userId); // pool (not client) — tx committed
            return res.status(201).json({
                purchased:   true,
                item:        { id: item.id, name: item.name, category: item.category, rarity: item.rarity },
                credits_spent: item.price_credits,
                new_balance: newBalance,
            });

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /cosmetics/:id — single item detail + caller's ownership/equipped status
// Declared LAST so static paths (/owned, /equipped, /profile/:userId) match first.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
    try {
        const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

        const { rows } = await pool.query(
            `SELECT ci.id, ci.name, ci.description, ci.category, ci.rarity,
                    ci.price_credits, ci.is_default, ci.metadata, ci.sort_order,
                    ci.created_at,
                    CASE WHEN ci.is_default THEN TRUE
                         ELSE (uc.item_id IS NOT NULL)
                    END AS owned,
                    uc.acquired_at,
                    (uec.item_id IS NOT NULL) AS equipped
             FROM cosmetic_items ci
             LEFT JOIN user_cosmetics uc
                    ON uc.item_id = ci.id AND uc.user_id = $2
             LEFT JOIN user_equipped_cosmetics uec
                    ON uec.item_id = ci.id AND uec.user_id = $2
             WHERE ci.id = $1`,
            [id, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'item_not_found' });
        }

        res.json(rows[0]);
    } catch (err) { next(err); }
});

module.exports = router;
