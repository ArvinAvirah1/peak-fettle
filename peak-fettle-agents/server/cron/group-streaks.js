// Peak Fettle -- Group Streak Credits Weekly Evaluation Job
// dev-backend -- 2026-05-03 (updated 2026-06-12 Agent O, SPEC_094A)
// Source: group_streak_credits_spec.md S5
//
// 2026-06-12 (Agent O, SPEC_094A): Signal-based evaluation path.
//   PRIMARY path: read group_weekly_signals for the evaluated week.
//     If a member has a signal row, use hit_goal from that row.
//   LEGACY fallback: if NO signal exists for this member x group x week,
//     count workouts directly from the workouts table.
//     This preserves backwards-compatibility for older clients.
//
// Schedule: Monday 00:05 UTC -- evaluates the just-ended ISO week.
// Idempotency: (group_id, week_start) PK on group_week_evaluations.
// Manual run: node cron/group-streaks.js 2026-04-27

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../db');

const BASE_CREDITS           = 50;
const MULTIPLIER_SLOPE       = 0.10;
const MULTIPLIER_CAP         = 3.0;
const NEW_JOINER_GRACE_WEEKS = 2;

function multiplier(streakWeeks) {
    return Math.min(1 + MULTIPLIER_SLOPE * streakWeeks, MULTIPLIER_CAP);
}

function prevMondayUTC(fromDate = new Date()) {
    const d = new Date(fromDate);
    d.setUTCDate(d.getUTCDate() - 7);
    d.setUTCHours(0, 0, 0, 0);
    return d;
}

function isoWeekStartOf(date) {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const dow = d.getUTCDay();
    const offsetToMon = dow === 0 ? -6 : 1 - dow;
    d.setUTCDate(d.getUTCDate() + offsetToMon);
    return d;
}

function weeksSinceJoin(joinedAt, weekStart) {
    const joinMonday = isoWeekStartOf(new Date(joinedAt));
    const msPerWeek  = 7 * 24 * 3600 * 1000;
    return Math.max(0, Math.floor((weekStart.getTime() - joinMonday.getTime()) / msPerWeek));
}

// PRIMARY: read hit_goal from group_weekly_signals.
// Returns null if no signal exists (caller must fall back to legacy path).
async function didHitGoalFromSignal(client, userId, groupId, weekStartStr) {
    const { rows } = await client.query(
        'SELECT hit_goal FROM group_weekly_signals' +
        ' WHERE group_id = $1 AND user_id = $2 AND week_start = $3',
        [groupId, userId, weekStartStr]
    );
    if (rows.length === 0) return null;
    return rows[0].hit_goal;
}

// LEGACY: apply pending goal changes then count workout rows.
// Used when no signal exists for this member x group x week.
async function didHitGoalLegacy(client, userId, weekStartStr, weekEndStr) {
    await client.query(
        'UPDATE user_weekly_goals' +
        ' SET workouts_per_week = pending_workouts_per_week,' +
        '     pending_workouts_per_week = NULL,' +
        '     pending_applies_at = NULL,' +
        '     updated_at = NOW()' +
        ' WHERE user_id = $1' +
        '   AND pending_applies_at IS NOT NULL' +
        '   AND pending_applies_at <= $2',
        [userId, weekStartStr]
    );
    const { rows: goalRows } = await client.query(
        'SELECT COALESCE(' +
        '    (SELECT workouts_per_week FROM user_weekly_goals WHERE user_id = $1),' +
        '    3' +
        ') AS goal',
        [userId]
    );
    const goal = parseInt(goalRows[0].goal, 10);
    const { rows: countRows } = await client.query(
        "SELECT COUNT(*) AS session_count FROM workouts" +
        " WHERE user_id = $1 AND day_key >= $2 AND day_key < $3" +
        "   AND session_type = 'workout'",
        [userId, weekStartStr, weekEndStr]
    );
    return parseInt(countRows[0].session_count, 10) >= goal;
}

async function run(overrideWeekStart = null) {
    const startedAt = new Date();
    let weekStart;
    if (overrideWeekStart) {
        weekStart = new Date(overrideWeekStart + 'T00:00:00Z');
        if (weekStart.getUTCDay() !== 1) {
            throw new Error(
                'overrideWeekStart "' + overrideWeekStart + '" is not a Monday (UTC). ' +
                'Provide the ISO week start date.'
            );
        }
    } else {
        weekStart = prevMondayUTC(startedAt);
    }
    const weekEnd       = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);
    const weekStartStr  = weekStart.toISOString().slice(0, 10);
    const weekEndStr    = weekEnd.toISOString().slice(0, 10);
    const kickWindowStr = new Date(
        weekStart.getTime() + 5 * 24 * 3600 * 1000
    ).toISOString().slice(0, 10);

    console.log('[group-streaks-cron] started ' + startedAt.toISOString() +
        ' -- evaluating week ' + weekStartStr + ' -> ' + weekEndStr);

    let groupsEvaluated = 0, groupsSkipped = 0;
    let groupsSuccess   = 0, groupsFailure = 0, errors = 0;

    const { rows: groups } = await pool.query(
        'SELECT g.id, g.name, g.current_streak_weeks FROM groups g' +
        ' WHERE NOT EXISTS (' +
        '    SELECT 1 FROM group_week_evaluations gwe' +
        '    WHERE gwe.group_id = g.id AND gwe.week_start = $1' +
        ') ORDER BY g.id',
        [weekStartStr]
    );
    console.log('[group-streaks-cron] ' + groups.length + ' group(s) to evaluate');

    for (const group of groups) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Step 1: eligible membership snapshot
            const { rows: eligible } = await client.query(
                'SELECT gm.user_id, gm.joined_at FROM group_memberships gm' +
                ' WHERE gm.group_id = $1' +
                '   AND gm.joined_at < $2' +
                '   AND (' +
                '       gm.left_at IS NULL' +
                "       OR (gm.status = 'left'   AND gm.left_at >= $2)" +
                "       OR (gm.status = 'kicked' AND gm.left_at >= $3)" +
                '   )',
                [group.id, weekStartStr, kickWindowStr]
            );
            if (eligible.length < 2) {
                await client.query('ROLLBACK');
                groupsSkipped++;
                console.log('[group-streaks-cron] SKIP group ' + group.id +
                    ' (dormant -- ' + eligible.length + ' eligible)');
                continue;
            }

            // Step 2: signal-primary / legacy-fallback per member
            let membersHitGoal = 0, signalCount = 0, legacyCount = 0;
            for (const member of eligible) {
                const signalHit = await didHitGoalFromSignal(
                    client, member.user_id, group.id, weekStartStr
                );
                let hit;
                if (signalHit !== null) {
                    hit = signalHit; signalCount++;
                } else {
                    hit = await didHitGoalLegacy(
                        client, member.user_id, weekStartStr, weekEndStr
                    );
                    legacyCount++;
                }
                if (hit) membersHitGoal++;
            }
            const eligibleCount = eligible.length;
            const hitRate       = membersHitGoal / eligibleCount;
            const success       = hitRate > 0.50;
            console.log('[group-streaks-cron] group ' + group.id +
                ' signals=' + signalCount + ' legacy=' + legacyCount);

            // Step 3: compute outcome
            let newStreakWeeks, creditsPerMemberBase;
            if (success) {
                newStreakWeeks        = group.current_streak_weeks + 1;
                creditsPerMemberBase  = Math.floor(BASE_CREDITS * multiplier(newStreakWeeks));
            } else {
                newStreakWeeks        = 0;
                creditsPerMemberBase  = 0;
            }

            // Step 4: update group streak state
            await client.query(
                'UPDATE groups' +
                ' SET current_streak_weeks = $1, last_evaluated_week = $2, updated_at = NOW()' +
                ' WHERE id = $3',
                [newStreakWeeks, weekStartStr, group.id]
            );

            // Step 5: idempotent evaluation audit row
            await client.query(
                'INSERT INTO group_week_evaluations' +
                ' (group_id, week_start, eligible_members, members_hit_goal,' +
                '  streak_weeks_after, credits_per_member)' +
                ' VALUES ($1, $2, $3, $4, $5, $6)' +
                ' ON CONFLICT (group_id, week_start) DO NOTHING',
                [group.id, weekStartStr, eligibleCount, membersHitGoal,
                 newStreakWeeks, creditsPerMemberBase]
            );

            // Step 6: credit ledger on success
            // S3 decision 4: ALL eligible members earn (including goal-missers).
            // S3 decision 9: new-joiner carve-out -- first 2 weeks at base rate.
            if (success) {
                for (const member of eligible) {
                    const weeksInGroup  = weeksSinceJoin(member.joined_at, weekStart);
                    const isNewJoiner   = weeksInGroup < NEW_JOINER_GRACE_WEEKS;
                    const memberCredits = isNewJoiner ? BASE_CREDITS : creditsPerMemberBase;
                    await client.query(
                        'INSERT INTO credit_ledger' +
                        ' (user_id, amount, source, group_id, week_start)' +
                        " VALUES ($1, $2, 'group_streak', $3, $4)",
                        [member.user_id, memberCredits, group.id, weekStartStr]
                    );
                }
                groupsSuccess++;
            } else {
                groupsFailure++;
            }

            await client.query('COMMIT');
            groupsEvaluated++;
            console.log('[group-streaks-cron] group ' + group.id + ' "' + group.name + '" -- ' +
                membersHitGoal + '/' + eligibleCount +
                ' (' + (hitRate * 100).toFixed(0) + '%) -- ' +
                (success ? 'SUCCESS' : 'FAILURE') +
                ' -- streak=' + newStreakWeeks + ' credits=' + creditsPerMemberBase);

        } catch (err) {
            await client.query('ROLLBACK');
            errors++;
            console.error('[group-streaks-cron] ERROR on group ' + group.id + ':', err.message);
        } finally {
            client.release();
        }
    }

    const elapsed = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);
    console.log('[group-streaks-cron] finished.' +
        ' evaluated=' + groupsEvaluated + ' skipped=' + groupsSkipped +
        ' success=' + groupsSuccess + ' failure=' + groupsFailure +
        ' errors=' + errors + ' elapsed=' + elapsed + 's');
    if (errors > 0) process.exitCode = 1;
}

module.exports = { run, multiplier, weeksSinceJoin };

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
