// Peak Fettle — Group Streak Credits Weekly Evaluation Job
// dev-backend — 2026-05-03
// Phase: D (Group Streak Credits)
// Source: group_streak_credits_spec.md §5
//
// Schedule: Monday 00:05 UTC
//   Evaluates the ISO week that just ended (Mon 00:00 UTC seven days ago →
//   Sun 23:59 UTC yesterday).
//
// Idempotency: (group_id, week_start) is the primary key on group_week_evaluations.
//   Re-running the job for a week already evaluated is a no-op (§9).
//
// Run manually for a specific week (must be a Monday):
//   node cron/group-streaks.js 2026-04-27
//
// Evaluation algorithm (§5):
//   For each group with ≥2 eligible members:
//     1. Snapshot eligible membership (§7 rules — join date, kick 48h window).
//     2. Apply any queued goal changes whose pending_applies_at ≤ week_start.
//     3. For each eligible member, count workouts in [week_start, week_end).
//        Compare to their weekly goal (default 3 if unset).
//     4. Compute hit_rate = members_hit_goal / eligible_count.
//        hit_rate > 0.50 → SUCCESS; else → FAILURE.
//     5. SUCCESS: increment streak, compute credits (multiplier formula §6),
//        apply new-joiner carve-out (first 2 weeks at 1.0×), insert credit_ledger
//        rows for all eligible members (§3 decision 4: everyone earns on group win).
//     6. FAILURE: reset streak to 0, no credit writes.
//     7. Write group_week_evaluations audit row either way.
//
// Constants (§10 proposed defaults):
//   BASE_CREDITS         = 50
//   multiplier(w)        = min(1 + 0.10 × w, 3.0)   capped at 20 weeks = 3.0×
//   NEW_JOINER_GRACE_WKS = 2   (first 2 weeks earns at base rate regardless)

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');

// ---------------------------------------------------------------------------
// Constants (§10 proposed defaults)
// ---------------------------------------------------------------------------
const BASE_CREDITS          = 50;
const MULTIPLIER_SLOPE      = 0.10;
const MULTIPLIER_CAP        = 3.0;
const NEW_JOINER_GRACE_WEEKS = 2;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Credit multiplier per §6: min(1 + 0.10 × streak_weeks, 3.0)
 * Applied AFTER incrementing streak (streakWeeks = new value post-success).
 */
function multiplier(streakWeeks) {
    return Math.min(1 + MULTIPLIER_SLOPE * streakWeeks, MULTIPLIER_CAP);
}

/**
 * Returns the ISO week start (Monday 00:00 UTC) for the week that just ended.
 * The job runs Monday 00:05 UTC, so "last Monday" = today − 7 days.
 */
function prevMondayUTC(fromDate = new Date()) {
    const d = new Date(fromDate);
    d.setUTCDate(d.getUTCDate() - 7);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

/**
 * Returns the Monday of the ISO week containing joinedAt, as a UTC Date.
 * Used to compute how many full weeks a member has been in a group.
 */
function isoWeekStartOf(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const dow = d.getUTCDay(); // 0=Sun … 6=Sat
    const offsetToMon = dow === 0 ? -6 : 1 - dow;
    d.setUTCDate(d.getUTCDate() + offsetToMon);
    return d;
}

/**
 * How many complete ISO weeks has this member been in the group as of week_start?
 * Returns 0 for a member who joined during the evaluated week's prior Monday
 * (i.e., their first eligible week is the current one being evaluated).
 */
function weeksSinceJoin(joinedAt, weekStart) {
    const joinMonday = isoWeekStartOf(new Date(joinedAt));
    const msPerWeek  = 7 * 24 * 3600 * 1000;
    return Math.max(0, Math.floor((weekStart.getTime() - joinMonday.getTime()) / msPerWeek));
}

// ---------------------------------------------------------------------------
// Per-member goal check (called inside a transaction)
// ---------------------------------------------------------------------------

/**
 * 1. Applies any pending goal change for `userId` whose pending_applies_at
 *    is on or before weekStart.
 * 2. Returns true if the user logged ≥ their weekly goal in [weekStart, weekEnd).
 *    Falls back to goal = 3 if the user has no user_weekly_goals row.
 */
async function didHitGoal(client, userId, weekStartStr, weekEndStr) {
    // Apply queued goal changes that should have taken effect by this week
    await client.query(
        `UPDATE user_weekly_goals
         SET workouts_per_week         = pending_workouts_per_week,
             pending_workouts_per_week  = NULL,
             pending_applies_at         = NULL,
             updated_at                 = NOW()
         WHERE user_id            = $1
           AND pending_applies_at IS NOT NULL
           AND pending_applies_at <= $2`,
        [userId, weekStartStr]
    );

    // Read effective goal (default 3 if no row)
    const { rows: goalRows } = await client.query(
        `SELECT COALESCE(
            (SELECT workouts_per_week FROM user_weekly_goals WHERE user_id = $1),
            3
         ) AS goal`,
        [userId]
    );
    const goal = parseInt(goalRows[0].goal, 10);

    // Count workouts in the evaluated ISO week
    const { rows: countRows } = await client.query(
        `SELECT COUNT(*) AS session_count
         FROM workouts
         WHERE user_id = $1
           AND day_key >= $2
           AND day_key <  $3`,
        [userId, weekStartStr, weekEndStr]
    );
    return parseInt(countRows[0].session_count, 10) >= goal;
}

// ---------------------------------------------------------------------------
// Main batch function
// ---------------------------------------------------------------------------

/**
 * @param {string|null} overrideWeekStart  YYYY-MM-DD of the Monday to evaluate.
 *   Leave null to auto-derive (previous Monday UTC). Useful for manual backfills.
 */
async function run(overrideWeekStart = null) {
    const startedAt = new Date();

    // ── Determine the ISO week being evaluated ──────────────────────────────
    let weekStart;
    if (overrideWeekStart) {
        weekStart = new Date(overrideWeekStart + 'T00:00:00Z');
        // Validate that it's a Monday
        if (weekStart.getUTCDay() !== 1) {
            throw new Error(
                `overrideWeekStart "${overrideWeekStart}" is not a Monday (UTC). ` +
                `Provide the ISO week start date.`
            );
        }
    } else {
        weekStart = prevMondayUTC(startedAt);
    }

    const weekEnd    = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr   = weekEnd.toISOString().slice(0, 10);
    // Saturday 00:00 UTC = 5 days into the week; used for the 48h kick rule
    const kickWindowStr = new Date(
        weekStart.getTime() + 5 * 24 * 3600 * 1000
    ).toISOString().slice(0, 10);

    console.log(
        `[group-streaks-cron] started ${startedAt.toISOString()} — ` +
        `evaluating week ${weekStartStr} → ${weekEndStr}`
    );

    // Counters for the summary log
    let groupsEvaluated = 0;
    let groupsSkipped   = 0;
    let groupsSuccess   = 0;
    let groupsFailure   = 0;
    let errors          = 0;

    // ── Fetch candidate groups ──────────────────────────────────────────────
    // Only groups not yet evaluated for this week (idempotency guard).
    // We'll apply the ≥2-eligible-member check inside the loop after the
    // member snapshot, because dormancy is computed from the eligibility query.
    const { rows: groups } = await pool.query(
        `SELECT g.id, g.name, g.current_streak_weeks
         FROM groups g
         WHERE NOT EXISTS (
             SELECT 1 FROM group_week_evaluations gwe
             WHERE gwe.group_id   = g.id
               AND gwe.week_start = $1
         )
         ORDER BY g.id`,
        [weekStartStr]
    );

    console.log(`[group-streaks-cron] ${groups.length} group(s) to evaluate`);

    // ── Evaluate each group independently (one transaction per group) ───────
    for (const group of groups) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // ── Step 1: Snapshot eligible membership (§5, §7) ────────────
            //
            // A member is eligible for week [weekStart, weekEnd) if ALL of:
            //   a) joined_at < weekStart   (was a member when the week began;
            //      enforces the week-boundary join rule — §7)
            //   b) NOT excluded mid-week:
            //      • Active members (left_at IS NULL) → always eligible
            //      • Voluntarily left during or after the week → still counted
            //        for this week; excluded starting next week (§7)
            //      • Kicked members:
            //          - Kicked within the last 48h of the week
            //            (left_at >= Saturday 00:00 UTC = weekStart + 5d) →
            //            still counted per the 48h anti-gaming rule (§7, §8)
            //          - Kicked before the 48h window → excluded
            const { rows: eligible } = await client.query(
                `SELECT gm.user_id, gm.joined_at
                 FROM group_memberships gm
                 WHERE gm.group_id = $1
                   AND gm.joined_at < $2
                   AND (
                       gm.left_at IS NULL
                       OR (gm.status = 'left'   AND gm.left_at >= $2)
                       OR (gm.status = 'kicked' AND gm.left_at >= $3)
                   )`,
                [group.id, weekStartStr, kickWindowStr]
            );

            // Dormancy check: skip groups with fewer than 2 eligible members
            if (eligible.length < 2) {
                await client.query('ROLLBACK');
                groupsSkipped++;
                console.log(
                    `[group-streaks-cron] SKIP group ${group.id} ` +
                    `(dormant — ${eligible.length} eligible member(s))`
                );
                continue;
            }

            // ── Step 2: Check which eligible members hit their goal ────────
            let membersHitGoal = 0;
            for (const member of eligible) {
                const hit = await didHitGoal(
                    client, member.user_id, weekStartStr, weekEndStr
                );
                if (hit) membersHitGoal++;
            }

            const eligibleCount = eligible.length;
            const hitRate       = membersHitGoal / eligibleCount;
            const success       = hitRate > 0.50;

            // ── Step 3: Compute outcome ────────────────────────────────────
            let newStreakWeeks, creditsPerMemberBase;

            if (success) {
                newStreakWeeks        = group.current_streak_weeks + 1;
                const mult            = multiplier(newStreakWeeks);
                creditsPerMemberBase  = Math.floor(BASE_CREDITS * mult);
            } else {
                // §1: "when >50% miss, streak counter resets; credits already
                //      banked are kept — no clawback"
                newStreakWeeks       = 0;
                creditsPerMemberBase = 0;
            }

            // ── Step 4: Update group streak state ─────────────────────────
            await client.query(
                `UPDATE groups
                 SET current_streak_weeks = $1,
                     last_evaluated_week  = $2,
                     updated_at           = NOW()
                 WHERE id = $3`,
                [newStreakWeeks, weekStartStr, group.id]
            );

            // ── Step 5: Insert idempotent evaluation audit row ─────────────
            // ON CONFLICT DO NOTHING: if this row exists (replay), skip cleanly.
            await client.query(
                `INSERT INTO group_week_evaluations
                    (group_id, week_start, eligible_members, members_hit_goal,
                     streak_weeks_after, credits_per_member)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (group_id, week_start) DO NOTHING`,
                [
                    group.id, weekStartStr,
                    eligibleCount, membersHitGoal,
                    newStreakWeeks, creditsPerMemberBase,
                ]
            );

            // ── Step 6: Write credit_ledger rows on success ───────────────
            // §5 step 4: one row per eligible member.
            // §3 decision 4: ALL eligible members earn (including goal-missers).
            // §3 decision 9: new-joiner carve-out — first 2 weeks earn at base
            //   rate (1.0×) regardless of group streak, to prevent multiplier
            //   harvesting from joining an established group.
            if (success) {
                for (const member of eligible) {
                    const weeksInGroup  = weeksSinceJoin(member.joined_at, weekStart);
                    const isNewJoiner   = weeksInGroup < NEW_JOINER_GRACE_WEEKS;
                    const memberCredits = isNewJoiner ? BASE_CREDITS : creditsPerMemberBase;

                    await client.query(
                        `INSERT INTO credit_ledger
                            (user_id, amount, source, group_id, week_start)
                         VALUES ($1, $2, 'group_streak', $3, $4)`,
                        [member.user_id, memberCredits, group.id, weekStartStr]
                    );
                }
                groupsSuccess++;
            } else {
                groupsFailure++;
            }

            await client.query('COMMIT');
            groupsEvaluated++;

            console.log(
                `[group-streaks-cron] group ${group.id} "${group.name}" — ` +
                `${membersHitGoal}/${eligibleCount} hit goal (${(hitRate * 100).toFixed(0)}%) — ` +
                `${success ? 'SUCCESS' : 'FAILURE'} — ` +
                `streak=${newStreakWeeks} credits=${creditsPerMemberBase}`
            );

        } catch (err) {
            await client.query('ROLLBACK');
            errors++;
            // Log and continue so one broken group doesn't stall the whole run
            console.error(
                `[group-streaks-cron] ERROR on group ${group.id}:`, err.message
            );
        } finally {
            client.release();
        }
    }

    const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    console.log(
        `[group-streaks-cron] finished. ` +
        `evaluated=${groupsEvaluated} skipped=${groupsSkipped} ` +
        `success=${groupsSuccess} failure=${groupsFailure} ` +
        `errors=${errors} elapsed=${elapsed}s`
    );

    if (errors > 0) {
        process.exitCode = 1;
    }
}

module.exports = { run, multiplier, weeksSinceJoin };

// Allow direct invocation: node cron/group-streaks.js [YYYY-MM-DD]
if (require.main === module) {
    const weekArg = process.argv[2] || null;
    run(weekArg)
        .then(() => pool.end())
        .catch(err => {
            console.error('[group-streaks-cron] fatal:', err);
            process.exitCode = 1;
            pool.end();
        });
}
