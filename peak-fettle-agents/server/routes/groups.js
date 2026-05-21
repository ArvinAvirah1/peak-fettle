// Peak Fettle — /groups, /credits, /goals routes
// dev-backend — 2026-05-03
// Phase: D (Group Streak Credits)
// Source: group_streak_credits_spec.md
//
// This file exposes three Express routers, all registered in server/index.js:
//   groupsRouter  → mounted at /groups
//   creditsRouter → mounted at /credits
//   goalsRouter   → mounted at /goals
//
// ── Groups (/groups) ──────────────────────────────────────────────────────────
//   POST   /groups                      Create a group (eligibility-gated)
//   GET    /groups                      List caller's active groups
//   GET    /groups/:id                  Group details + full membership roster
//   PATCH  /groups/:id                  Rename group (admin only)
//   POST   /groups/:id/transfer-admin   Transfer admin role (admin only)
//   POST   /groups/:id/invitations      Regenerate share-link token (admin only)
//   POST   /groups/invitations/accept   Join via share-link token
//   POST   /groups/:id/members          Direct-add a member by username (admin only)
//   DELETE /groups/:id/members/:userId  Kick a member (admin only)
//   POST   /groups/:id/leave            Leave a group (self)
//   GET    /groups/:id/history          Week evaluation history
//
// ── Credits (/credits) ────────────────────────────────────────────────────────
//   GET /credits/balance                Current wallet balance
//   GET /credits/history                Paginated credit ledger (cursor-based)
//
// ── Goals (/goals) ────────────────────────────────────────────────────────────
//   GET /goals/weekly                   Current weekly workout goal
//   PUT /goals/weekly                   Queue a new weekly goal (applies next Monday)

'use strict';

const express = require('express');
const { z } = require('zod');
const { pool } = require('../db');

const groupsRouter  = express.Router();
const creditsRouter = express.Router();
const goalsRouter   = express.Router();

// ---------------------------------------------------------------------------
// Constants (§10 proposed defaults — change here + in cron if recalibrated)
// ---------------------------------------------------------------------------
const GROUP_SIZE_HARD_CAP   = 12;   // §1, §3 decision 1
const MAX_GROUPS_PER_USER   = 3;    // §3 decision 5
const ACCOUNT_AGE_DAYS      = 30;   // §3 decision 6
const MIN_SESSIONS          = 10;   // §3 decision 6
const KICK_COOLDOWN_WEEKS   = 4;    // §7 — prevents kick-rotation gaming
const WEEKLY_GOAL_MAX       = 14;   // sanity cap; not in spec, practical upper bound

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Checks whether a user meets the account-age + activity gate (§3 decision 6).
 * Returns { eligible: true } or { eligible: false, reason: string }.
 */
async function checkEligibility(userId) {
    const { rows } = await pool.query(
        `SELECT
            EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 86400 >= $2 AS old_enough,
            (SELECT COUNT(*) FROM workouts WHERE user_id = u.id) >= $3 AS enough_sessions
         FROM users u
         WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [userId, ACCOUNT_AGE_DAYS, MIN_SESSIONS]
    );
    if (rows.length === 0) return { eligible: false, reason: 'user_not_found' };
    const { old_enough, enough_sessions } = rows[0];
    if (!old_enough)       return { eligible: false, reason: 'account_too_new' };
    if (!enough_sessions)  return { eligible: false, reason: 'not_enough_sessions' };
    return { eligible: true };
}

/**
 * Returns the next Monday 00:00 UTC as a YYYY-MM-DD string.
 * Used for goal change queueing (§7).
 */
function nextMondayUTC() {
    const now = new Date();
    const daysUntilMonday = now.getUTCDay() === 1
        ? 7                          // today IS Monday → queue for NEXT Monday
        : (8 - now.getUTCDay()) % 7; // days until next Monday (0=Sun,1=Mon,...,6=Sat)
    const next = new Date(now);
    next.setUTCDate(now.getUTCDate() + daysUntilMonday);
    next.setUTCHours(0, 0, 0, 0);
    return next.toISOString().slice(0, 10);
}

/**
 * Shared join logic (token-based and direct-add paths both flow through here).
 * Enforces: group-cap, size-cap, kick-cooldown, already-a-member.
 * Sends the HTTP response directly.
 *
 * @param {object} res  Express response object
 * @param {object} group  { id, size_cap } fetched from DB
 * @param {string} joiningUserId  UUID of the user joining
 */
async function executeJoin(res, group, joiningUserId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // §3 decision 5: concurrent group cap
        const { rows: capRows } = await client.query(
            `SELECT COUNT(*) AS cnt
             FROM group_memberships
             WHERE user_id = $1 AND status = 'active'`,
            [joiningUserId]
        );
        if (parseInt(capRows[0].cnt) >= MAX_GROUPS_PER_USER) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                error: 'group_cap_reached',
                max:   MAX_GROUPS_PER_USER,
            });
        }

        // §1: size cap
        const { rows: sizeRows } = await client.query(
            `SELECT COUNT(*) AS cnt
             FROM group_memberships
             WHERE group_id = $1 AND status = 'active'`,
            [group.id]
        );
        if (parseInt(sizeRows[0].cnt) >= group.size_cap) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'group_full' });
        }

        // §7: kick cooldown — cannot rejoin while cooldown is active
        const { rows: cooldownRows } = await client.query(
            `SELECT kick_cooldown_until
             FROM group_memberships
             WHERE group_id = $1
               AND user_id  = $2
               AND status   = 'kicked'
               AND kick_cooldown_until > NOW()`,
            [group.id, joiningUserId]
        );
        if (cooldownRows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                error:          'kick_cooldown_active',
                cooldown_until: cooldownRows[0].kick_cooldown_until,
            });
        }

        // Guard: already an active member
        const { rows: existing } = await client.query(
            `SELECT status FROM group_memberships
             WHERE group_id = $1 AND user_id = $2`,
            [group.id, joiningUserId]
        );
        if (existing.length > 0 && existing[0].status === 'active') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'already_a_member' });
        }

        // §7: upsert membership
        // If the user left or was kicked (and cooldown elapsed), we restore them
        // with a fresh joined_at so the week-boundary rule applies correctly.
        await client.query(
            `INSERT INTO group_memberships (group_id, user_id, joined_at, status)
             VALUES ($1, $2, NOW(), 'active')
             ON CONFLICT (group_id, user_id) DO UPDATE
                SET joined_at           = NOW(),
                    status              = 'active',
                    left_at             = NULL,
                    kick_cooldown_until = NULL`,
            [group.id, joiningUserId]
        );

        await client.query('COMMIT');
        return res.status(201).json({ joined: true, group_id: group.id });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * If the group admin just left, auto-transfer admin to the longest-tenured
 * remaining active member.
 */
async function handleAdminLeave(groupId, leavingUserId) {
    const { rows: adminCheck } = await pool.query(
        `SELECT id FROM groups WHERE id = $1 AND admin_user_id = $2`,
        [groupId, leavingUserId]
    );
    if (adminCheck.length === 0) return; // caller was not admin — nothing to do

    const { rows: nextAdmin } = await pool.query(
        `SELECT user_id FROM group_memberships
         WHERE group_id = $1 AND status = 'active'
         ORDER BY joined_at ASC
         LIMIT 1`,
        [groupId]
    );
    if (nextAdmin.length === 0) return; // no remaining members

    await pool.query(
        `UPDATE groups SET admin_user_id = $1, updated_at = NOW() WHERE id = $2`,
        [nextAdmin[0].user_id, groupId]
    );
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const CreateGroupSchema = z.object({
    name:    z.string().trim().min(1).max(80),
    sizeCap: z.number().int().min(2).max(GROUP_SIZE_HARD_CAP),
});

const UpdateGroupSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
});

// ---------------------------------------------------------------------------
// IMPORTANT: Static sub-paths (e.g. /invitations/accept) must be declared
// BEFORE parameterised paths (/:id) to prevent Express routing to the wrong
// handler.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// POST /groups/invitations/accept — join a group via share-link token
// §2: "invites members by username or share-link"
// §7: joining; §3 decisions 5 & 6: group cap + eligibility gate
// ---------------------------------------------------------------------------
groupsRouter.post('/invitations/accept', async (req, res, next) => {
    try {
        const { token } = z.object({ token: z.string().uuid() }).parse(req.body);
        const userId = req.user.id;

        // Eligibility gate
        const elig = await checkEligibility(userId);
        if (!elig.eligible) {
            return res.status(403).json({ error: 'not_eligible', reason: elig.reason });
        }

        // Look up the group by invite token
        const { rows: groupRows } = await pool.query(
            `SELECT id, size_cap FROM groups WHERE invite_token = $1`,
            [token]
        );
        if (groupRows.length === 0) {
            return res.status(404).json({ error: 'invalid_invite_token' });
        }

        return executeJoin(res, groupRows[0], userId);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /groups — create a new group
// §1: creator becomes admin; group activates when second member joins
// §3 decisions 5 & 6: concurrent-group cap + eligibility gate
// ---------------------------------------------------------------------------
groupsRouter.post('/', async (req, res, next) => {
    try {
        const { name, sizeCap } = CreateGroupSchema.parse(req.body);
        const userId = req.user.id;

        // Eligibility gate
        const elig = await checkEligibility(userId);
        if (!elig.eligible) {
            return res.status(403).json({ error: 'not_eligible', reason: elig.reason });
        }

        // Concurrent group cap
        const { rows: capRows } = await pool.query(
            `SELECT COUNT(*) AS cnt
             FROM group_memberships
             WHERE user_id = $1 AND status = 'active'`,
            [userId]
        );
        if (parseInt(capRows[0].cnt) >= MAX_GROUPS_PER_USER) {
            return res.status(403).json({
                error: 'group_cap_reached',
                max:   MAX_GROUPS_PER_USER,
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Create the group; creator is set as admin
            const { rows: groupRows } = await client.query(
                `INSERT INTO groups (name, size_cap, admin_user_id)
                 VALUES ($1, $2, $3)
                 RETURNING id, name, size_cap, admin_user_id,
                           current_streak_weeks, invite_token, created_at`,
                [name, sizeCap, userId]
            );
            const group = groupRows[0];

            // Creator auto-joins as the first active member
            await client.query(
                `INSERT INTO group_memberships (group_id, user_id) VALUES ($1, $2)`,
                [group.id, userId]
            );

            await client.query('COMMIT');
            return res.status(201).json(group);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /groups — list calling user's active group memberships
// ---------------------------------------------------------------------------
groupsRouter.get('/', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.id, g.name, g.size_cap, g.admin_user_id,
                    g.current_streak_weeks, g.last_evaluated_week, g.created_at,
                    gm.joined_at,
                    (SELECT COUNT(*)
                     FROM group_memberships m2
                     WHERE m2.group_id = g.id AND m2.status = 'active'
                    ) AS active_count
             FROM groups g
             JOIN group_memberships gm ON gm.group_id = g.id
             WHERE gm.user_id = $1
               AND gm.status  = 'active'
             ORDER BY g.current_streak_weeks DESC, g.created_at DESC`,
            [req.user.id]
        );
        res.json({ groups: rows });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /groups/:id — group details + full membership roster
// Invite token only returned to the admin.
// ---------------------------------------------------------------------------
groupsRouter.get('/:id', async (req, res, next) => {
    try {
        // Caller must be an active member to see the group
        const { rows: groupRows } = await pool.query(
            `SELECT g.id, g.name, g.size_cap, g.admin_user_id,
                    g.current_streak_weeks, g.last_evaluated_week,
                    g.invite_token, g.created_at
             FROM groups g
             JOIN group_memberships gm ON gm.group_id = g.id
             WHERE g.id = $1
               AND gm.user_id = $2
               AND gm.status  = 'active'`,
            [req.params.id, req.user.id]
        );
        if (groupRows.length === 0) {
            return res.status(404).json({ error: 'group_not_found_or_not_a_member' });
        }
        const group = groupRows[0];

        // Hide invite token from non-admins
        if (group.admin_user_id !== req.user.id) {
            delete group.invite_token;
        }

        // Full membership roster (all statuses for history)
        const { rows: members } = await pool.query(
            `SELECT gm.user_id, u.display_name, gm.joined_at,
                    gm.status, gm.left_at, gm.kick_cooldown_until
             FROM group_memberships gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = $1
             ORDER BY
                gm.status = 'active' DESC,  -- active first
                gm.joined_at ASC`,
            [req.params.id]
        );

        res.json({ ...group, members });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// PATCH /groups/:id — update group name (admin only)
// §2: admin can update the group name
// ---------------------------------------------------------------------------
groupsRouter.patch('/:id', async (req, res, next) => {
    try {
        const { name } = UpdateGroupSchema.parse(req.body);
        if (!name) {
            return res.status(400).json({ error: 'no_fields_to_update' });
        }

        const { rows } = await pool.query(
            `UPDATE groups
             SET name = $1, updated_at = NOW()
             WHERE id = $2 AND admin_user_id = $3
             RETURNING id, name, size_cap, admin_user_id, current_streak_weeks`,
            [name, req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'group_not_found_or_not_admin' });
        }
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /groups/:id/transfer-admin — transfer admin role (admin only)
// §2: admin can transfer the admin role to another active member
// ---------------------------------------------------------------------------
groupsRouter.post('/:id/transfer-admin', async (req, res, next) => {
    try {
        const { newAdminUserId } = z.object({
            newAdminUserId: z.string().uuid(),
        }).parse(req.body);

        // New admin must be an active member
        const { rows: memberRows } = await pool.query(
            `SELECT 1 FROM group_memberships
             WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
            [req.params.id, newAdminUserId]
        );
        if (memberRows.length === 0) {
            return res.status(400).json({ error: 'new_admin_not_an_active_member' });
        }

        const { rows } = await pool.query(
            `UPDATE groups
             SET admin_user_id = $1, updated_at = NOW()
             WHERE id = $2 AND admin_user_id = $3
             RETURNING id, name, admin_user_id`,
            [newAdminUserId, req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'group_not_found_or_not_admin' });
        }
        res.json(rows[0]);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /groups/:id/invitations — regenerate share-link token (admin only)
// Invalidates the previous invite link.
// ---------------------------------------------------------------------------
groupsRouter.post('/:id/invitations', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `UPDATE groups
             SET invite_token = gen_random_uuid(), updated_at = NOW()
             WHERE id = $1 AND admin_user_id = $2
             RETURNING id, invite_token`,
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'group_not_found_or_not_admin' });
        }
        res.json({ invite_token: rows[0].invite_token });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /groups/:id/members — direct-add a member by username (admin only)
// §2: "invites members by username or share-link"
// Checks eligibility for the invitee, not the admin.
// ---------------------------------------------------------------------------
groupsRouter.post('/:id/members', async (req, res, next) => {
    try {
        const { username } = z.object({
            username: z.string().trim().min(1),
        }).parse(req.body);

        // Verify caller is the group admin
        const { rows: adminRows } = await pool.query(
            `SELECT size_cap FROM groups WHERE id = $1 AND admin_user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (adminRows.length === 0) {
            return res.status(403).json({ error: 'not_admin' });
        }

        // Look up the target user by display_name
        const { rows: userRows } = await pool.query(
            `SELECT id FROM users
             WHERE display_name = $1 AND deleted_at IS NULL`,
            [username]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ error: 'user_not_found' });
        }

        const targetUserId = userRows[0].id;

        // Eligibility gate for the invitee
        const elig = await checkEligibility(targetUserId);
        if (!elig.eligible) {
            return res.status(403).json({ error: 'invitee_not_eligible', reason: elig.reason });
        }

        return executeJoin(res, { id: req.params.id, size_cap: adminRows[0].size_cap }, targetUserId);
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// DELETE /groups/:id/members/:userId — kick a member (admin only)
// §7: 4-week rejoin cooldown after kick
// §7, §8: Kicks within 48h of the next week boundary do not remove the
//   kicked member from that week's eligible set — enforced in the cron job
//   (the cron reads left_at vs the 48h window), not here.
// ---------------------------------------------------------------------------
groupsRouter.delete('/:id/members/:userId', async (req, res, next) => {
    try {
        const { id: groupId, userId: targetId } = req.params;

        // Verify caller is admin
        const { rows: adminRows } = await pool.query(
            `SELECT id FROM groups WHERE id = $1 AND admin_user_id = $2`,
            [groupId, req.user.id]
        );
        if (adminRows.length === 0) {
            return res.status(403).json({ error: 'not_admin' });
        }

        // Cannot kick yourself; use /leave instead
        if (targetId === req.user.id) {
            return res.status(400).json({ error: 'cannot_kick_yourself_use_leave' });
        }

        const cooldownUntil = new Date(
            Date.now() + KICK_COOLDOWN_WEEKS * 7 * 24 * 3600 * 1000
        ).toISOString();

        const { rows } = await pool.query(
            `UPDATE group_memberships
             SET status              = 'kicked',
                 left_at             = NOW(),
                 kick_cooldown_until = $1
             WHERE group_id = $2 AND user_id = $3 AND status = 'active'
             RETURNING user_id, left_at, kick_cooldown_until`,
            [cooldownUntil, groupId, targetId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'member_not_found_or_not_active' });
        }

        // If the kicked member was admin (shouldn't happen — can't kick yourself —
        // but guard anyway), transfer admin to next member.
        await handleAdminLeave(groupId, targetId);

        res.json({ kicked: true, cooldown_until: rows[0].kick_cooldown_until });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /groups/:id/leave — voluntarily leave a group
// §7: "excluded from the next week's evaluation; banked credits stay"
// If the leaver was admin, auto-transfer to longest-tenured remaining member.
// ---------------------------------------------------------------------------
groupsRouter.post('/:id/leave', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `UPDATE group_memberships
             SET status  = 'left',
                 left_at = NOW()
             WHERE group_id = $1 AND user_id = $2 AND status = 'active'
             RETURNING user_id`,
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'not_an_active_member' });
        }

        // Transfer admin if the leaver held the role
        await handleAdminLeave(req.params.id, req.user.id);

        res.json({ left: true });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /groups/:id/history — evaluation history (current + past members)
// Returns most recent 52 rows (one year of weekly evaluations).
// ---------------------------------------------------------------------------
groupsRouter.get('/:id/history', async (req, res, next) => {
    try {
        // Caller must be a current or past member to see history
        const { rows: memberCheck } = await pool.query(
            `SELECT 1 FROM group_memberships
             WHERE group_id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (memberCheck.length === 0) {
            return res.status(403).json({ error: 'not_a_member' });
        }

        const { rows } = await pool.query(
            `SELECT week_start, eligible_members, members_hit_goal,
                    streak_weeks_after, credits_per_member, evaluated_at
             FROM group_week_evaluations
             WHERE group_id = $1
             ORDER BY week_start DESC
             LIMIT 52`,
            [req.params.id]
        );
        res.json({ history: rows });
    } catch (err) { next(err); }
});

// ===========================================================================
// Credits router (/credits)
// ===========================================================================

// GET /credits/balance — caller's current wallet balance
// Returns both spendable balance (all entries, can be negative) and total_earned
// (all-time sum of positive entries — displayed as "lifetime credits" in the UI).
creditsRouter.get('/balance', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT
                COALESCE(SUM(amount), 0)                              AS balance,
                COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)   AS total_earned
             FROM credit_ledger WHERE user_id = $1`,
            [req.user.id]
        );
        res.json({
            balance:      parseInt(rows[0].balance, 10),
            total_earned: parseInt(rows[0].total_earned, 10),
        });
    } catch (err) { next(err); }
});

// GET /credits/history?limit=50&cursor=<iso-timestamp> — paginated ledger
creditsRouter.get('/history', async (req, res, next) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const cursor = req.query.cursor || null;

        const { rows } = await pool.query(
            `SELECT id, amount, source, group_id, week_start, created_at
             FROM credit_ledger
             WHERE user_id = $1
               AND ($2::timestamptz IS NULL OR created_at < $2)
             ORDER BY created_at DESC
             LIMIT $3`,
            [req.user.id, cursor, limit]
        );

        const nextCursor = rows.length === limit
            ? rows[rows.length - 1].created_at.toISOString()
            : null;

        res.json({ ledger: rows, next_cursor: nextCursor });
    } catch (err) { next(err); }
});

// ===========================================================================
// Goals router (/goals)
// ===========================================================================

// GET /goals/weekly — caller's current weekly workout goal
// Returns the active goal and any pending (queued) change.
goalsRouter.get('/weekly', async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT workouts_per_week, pending_workouts_per_week,
                    pending_applies_at, updated_at
             FROM user_weekly_goals WHERE user_id = $1`,
            [req.user.id]
        );

        if (rows.length === 0) {
            // No explicit goal set yet — return the default
            return res.json({ workouts_per_week: 3, pending: null });
        }

        const { workouts_per_week, pending_workouts_per_week, pending_applies_at } = rows[0];
        res.json({
            workouts_per_week,
            pending: pending_workouts_per_week != null
                ? { workouts_per_week: pending_workouts_per_week, applies_at: pending_applies_at }
                : null,
        });
    } catch (err) { next(err); }
});

// PUT /goals/weekly — queue a new weekly goal
// §7: "goals can be edited only at week boundaries; mid-week edits queue and
//      apply the following Monday"
// §3 decision 7: floor of 1 workout/week (enforced by schema CHECK + zod)
goalsRouter.put('/weekly', async (req, res, next) => {
    try {
        const { workoutsPerWeek } = z.object({
            workoutsPerWeek: z.number().int().min(1).max(WEEKLY_GOAL_MAX),
        }).parse(req.body);

        const appliesAt = nextMondayUTC();

        // Upsert: create goal row if not present; otherwise queue the change.
        // On first insert the active goal is set immediately to the requested
        // value (no prior active goal to protect). On update, only the pending
        // columns change — the active goal is untouched until the cron applies it.
        const { rows } = await pool.query(
            `INSERT INTO user_weekly_goals
                (user_id, workouts_per_week,
                 pending_workouts_per_week, pending_applies_at)
             VALUES ($1, $2, $2, $3)
             ON CONFLICT (user_id) DO UPDATE
                SET pending_workouts_per_week = $2,
                    pending_applies_at        = $3,
                    updated_at                = NOW()
             RETURNING workouts_per_week,
                       pending_workouts_per_week,
                       pending_applies_at`,
            [req.user.id, workoutsPerWeek, appliesAt]
        );

        res.json({
            message:                 'goal_queued',
            current_workouts_per_week: rows[0].workouts_per_week,
            pending: {
                workouts_per_week: rows[0].pending_workouts_per_week,
                applies_at:        rows[0].pending_applies_at,
            },
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
module.exports = { groupsRouter, creditsRouter, goalsRouter };
