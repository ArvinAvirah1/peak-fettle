// /insights — Training Engine insight endpoints
// Agent B — 2026-06-11 (TICKET-engine spec §4)
//
// GET  /insights/recovery      — muscle recovery heatmap (freshness per muscle group)
// GET  /insights/readiness     — daily readiness score 0–100 with band + component breakdown
// GET  /insights/deload        — deload detection: triggers + prescription
// POST /insights/deload/ack    — acknowledge deload: sets users.last_deload_at = today
//
// All endpoints: authenticated (requireAuth applied at mount in index.js).
// All responses include rule_trace[].

const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /insights/recovery
// Muscle recovery heatmap. For each muscle group present in the user's last
// 14 days of sets, computes:
//   freshness = min(100, round(hours_since_last_worked / tau * 100))
//   tau = 48 + 12 * min(sets_in_last_session_for_muscle / 5, 2)  (48–72 h)
//
// Muscles with no training in 14 days: freshness 100, last_worked null.
// Response: { muscles:[{muscle,freshness,last_worked,sets_last_session}],
//             generated_at, rule_trace[] }
// ---------------------------------------------------------------------------
router.get('/recovery', async (req, res, next) => {
    try {
        const uid = req.user.id;
        const ruleTrace = [];

        // Fetch all sets from the last 14 days with their muscle groups
        const { rows: recentSets } = await pool.query(
            `SELECT
                s.logged_at,
                w.day_key,
                e.muscle_groups,
                s.weight_raw,
                s.reps,
                s.kind
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             JOIN exercises e ON e.id = s.exercise_id
             WHERE w.user_id = $1
               AND s.logged_at >= NOW() - INTERVAL '14 days'
               AND s.kind = 'lift'
             ORDER BY s.logged_at DESC`,
            [uid]
        );

        ruleTrace.push(`Fetched ${recentSets.length} lift sets from the last 14 days`);

        if (recentSets.length === 0) {
            ruleTrace.push('No sets in window — all muscles at 100% freshness');
            return res.json({
                muscles: [],
                generated_at: new Date().toISOString(),
                rule_trace: ruleTrace,
            });
        }

        // Build per-muscle map: last_worked timestamp + sets per session
        // Use a Map keyed by muscle name
        const muscleData = {}; // muscle -> { lastWorked: Date, lastDayKey, setsLastSession }

        for (const row of recentSets) {
            const muscles = Array.isArray(row.muscle_groups) ? row.muscle_groups : [];
            const loggedAt = new Date(row.logged_at);
            const dayKey = row.day_key;

            for (const muscle of muscles) {
                if (!muscleData[muscle]) {
                    muscleData[muscle] = {
                        lastWorked: loggedAt,
                        lastDayKey: dayKey,
                        setsLastSession: 1,
                    };
                } else {
                    const existing = muscleData[muscle];
                    if (loggedAt > existing.lastWorked) {
                        // More recent session found — this is now "last session"
                        existing.lastWorked = loggedAt;
                        existing.lastDayKey = dayKey;
                        existing.setsLastSession = 1;
                    } else if (dayKey === existing.lastDayKey) {
                        // Same session as already-recorded most recent
                        existing.setsLastSession += 1;
                    }
                    // Older sessions: ignore for freshness calc
                }
            }
        }

        const now = new Date();
        const muscles = Object.entries(muscleData).map(([muscle, data]) => {
            const hoursSince = (now - data.lastWorked) / (1000 * 60 * 60);
            // tau = 48 + 12 * min(sets / 5, 2) → range 48–72 h
            const tau = 48 + 12 * Math.min(data.setsLastSession / 5, 2);
            const freshness = Math.min(100, Math.round((hoursSince / tau) * 100));

            ruleTrace.push(
                `${muscle}: last worked ${data.lastWorked.toISOString()}, ` +
                `${data.setsLastSession} sets, tau=${tau.toFixed(1)}h, ` +
                `${hoursSince.toFixed(1)}h ago → freshness ${freshness}`
            );

            return {
                muscle,
                freshness,
                last_worked: data.lastWorked.toISOString(),
                sets_last_session: data.setsLastSession,
            };
        });

        // Sort by freshness ascending (most fatigued first — most useful for UI)
        muscles.sort((a, b) => a.freshness - b.freshness);

        res.json({
            muscles,
            generated_at: new Date().toISOString(),
            rule_trace: ruleTrace,
        });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /insights/readiness
// Daily readiness score 0–100. Components vs user's own 28-day baseline.
// Skip any component lacking ≥7 baseline days; reweight the rest.
//
// Components:
//   HRV          weight .35 — today/7d-avg vs baseline; ratio≥1→100; 0 at 0.7
//   Resting HR   weight .25 — inverted; ratio≤1→100; 0 at ratio 1.15
//   Sleep        weight .20 — last night / 8h, capped 100
//   ACR load     weight .20 — 7d tonnage / 28d weekly-avg; ≤0.8→100; ≥1.5→20
//
// Bands: ≥67 push | 34–66 maintain | <34 rest
// Response: { score, band, components:[{name,value,weight,detail}], rule_trace[] }
// No data at all → { score:null, band:'unknown' }
// ---------------------------------------------------------------------------
router.get('/readiness', async (req, res, next) => {
    try {
        const uid = req.user.id;
        const ruleTrace = [];

        // ── Health metrics ───────────────────────────────────────────────
        const { rows: metrics } = await pool.query(
            `SELECT date, resting_hr_bpm, hrv_ms, sleep_hours
             FROM daily_health_metrics
             WHERE user_id = $1
               AND date >= CURRENT_DATE - INTERVAL '28 days'
             ORDER BY date DESC`,
            [uid]
        );

        // Today's and 7-day metrics
        const today = metrics[0] ?? null;
        const last7 = metrics.slice(0, 7);
        const baseline28 = metrics; // all 28 days

        // ── Tonnage (load) ────────────────────────────────────────────────
        // 7-day tonnage: sum(weight_raw/8 * reps) for lift sets in last 7 days
        const { rows: tonnageRows } = await pool.query(
            `SELECT
                SUM((s.weight_raw / 8.0) * s.reps)                           AS tonnage_7d,
                -- 28-day weekly average: total tonnage / 4 weeks
                SUM((s.weight_raw / 8.0) * s.reps) FILTER (
                    WHERE s.logged_at >= NOW() - INTERVAL '28 days'
                ) / 4.0                                                        AS weekly_avg_28d,
                COUNT(DISTINCT w.day_key) FILTER (
                    WHERE s.logged_at >= NOW() - INTERVAL '28 days'
                )                                                              AS session_days_28d
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             WHERE w.user_id = $1
               AND s.kind = 'lift'
               AND s.weight_raw > 0
               AND s.reps > 0
               AND s.logged_at >= NOW() - INTERVAL '28 days'`,
            [uid]
        );

        // Also get 7-day slice separately for ACR
        const { rows: tonnage7Rows } = await pool.query(
            `SELECT SUM((s.weight_raw / 8.0) * s.reps) AS tonnage_7d
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             WHERE w.user_id = $1
               AND s.kind = 'lift'
               AND s.weight_raw > 0
               AND s.reps > 0
               AND s.logged_at >= NOW() - INTERVAL '7 days'`,
            [uid]
        );

        const tonnage7d = parseFloat(tonnage7Rows[0]?.tonnage_7d) || 0;
        const weeklyAvg28d = parseFloat(tonnageRows[0]?.weekly_avg_28d) || 0;
        const sessionDays28d = parseInt(tonnageRows[0]?.session_days_28d, 10) || 0;

        ruleTrace.push(`Health metrics rows in 28-day window: ${metrics.length}`);
        ruleTrace.push(`7d tonnage: ${tonnage7d.toFixed(1)} kg·reps, 28d weekly avg: ${weeklyAvg28d.toFixed(1)} kg·reps`);

        // ── Component computation ─────────────────────────────────────────
        const components = [];
        let totalWeight = 0;
        let weightedScore = 0;

        // Helper: clamp linear interpolation
        function lerp(x, x0, y0, x1, y1) {
            if (x <= x0) return y0;
            if (x >= x1) return y1;
            return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
        }

        // --- HRV (weight 0.35) ---
        const hrvBaseline = baseline28.filter(m => m.hrv_ms != null);
        const hrv7 = last7.filter(m => m.hrv_ms != null);
        if (hrvBaseline.length >= 7 && today?.hrv_ms != null && hrv7.length > 0) {
            const baselineAvgHrv = hrvBaseline.reduce((s, m) => s + parseFloat(m.hrv_ms), 0) / hrvBaseline.length;
            const avg7dHrv = hrv7.reduce((s, m) => s + parseFloat(m.hrv_ms), 0) / hrv7.length;
            const ratio = avg7dHrv / (baselineAvgHrv || 1);
            // ratio ≥ 1 → 100; linear down to 0 at ratio 0.7
            const score = Math.round(Math.max(0, Math.min(100, lerp(ratio, 0.7, 0, 1.0, 100))));
            components.push({
                name: 'hrv',
                value: score,
                weight: 0.35,
                detail: `7d avg HRV ${avg7dHrv.toFixed(1)} ms vs 28d baseline ${baselineAvgHrv.toFixed(1)} ms (ratio ${ratio.toFixed(2)})`,
            });
            totalWeight += 0.35;
            weightedScore += score * 0.35;
            ruleTrace.push(`HRV: ratio=${ratio.toFixed(2)} → score ${score} (weight 0.35)`);
        } else {
            ruleTrace.push(`HRV: skipped — insufficient baseline data (${hrvBaseline.length} days, need ≥7)`);
        }

        // --- Resting HR (weight 0.25) ---
        const hrBaseline = baseline28.filter(m => m.resting_hr_bpm != null);
        const hr7 = last7.filter(m => m.resting_hr_bpm != null);
        if (hrBaseline.length >= 7 && today?.resting_hr_bpm != null && hr7.length > 0) {
            const baselineAvgHr = hrBaseline.reduce((s, m) => s + parseFloat(m.resting_hr_bpm), 0) / hrBaseline.length;
            const avg7dHr = hr7.reduce((s, m) => s + parseFloat(m.resting_hr_bpm), 0) / hr7.length;
            const ratio = avg7dHr / (baselineAvgHr || 1);
            // Inverted: ratio ≤ 1 → 100; 0 at ratio 1.15
            const score = Math.round(Math.max(0, Math.min(100, lerp(ratio, 1.0, 100, 1.15, 0))));
            components.push({
                name: 'resting_hr',
                value: score,
                weight: 0.25,
                detail: `7d avg resting HR ${avg7dHr.toFixed(1)} bpm vs 28d baseline ${baselineAvgHr.toFixed(1)} bpm (ratio ${ratio.toFixed(2)})`,
            });
            totalWeight += 0.25;
            weightedScore += score * 0.25;
            ruleTrace.push(`Resting HR: ratio=${ratio.toFixed(2)} → score ${score} (weight 0.25)`);
        } else {
            ruleTrace.push(`Resting HR: skipped — insufficient data (${hrBaseline.length} days, need ≥7)`);
        }

        // --- Sleep (weight 0.20) ---
        if (today?.sleep_hours != null) {
            const sleep = parseFloat(today.sleep_hours);
            const score = Math.min(100, Math.round((sleep / 8.0) * 100));
            components.push({
                name: 'sleep',
                value: score,
                weight: 0.20,
                detail: `Last night ${sleep.toFixed(1)} h / 8 h target`,
            });
            totalWeight += 0.20;
            weightedScore += score * 0.20;
            ruleTrace.push(`Sleep: ${sleep.toFixed(1)}h → score ${score} (weight 0.20)`);
        } else {
            ruleTrace.push('Sleep: skipped — no data for today');
        }

        // --- Acute:Chronic Load (ACR) (weight 0.20) ---
        if (sessionDays28d >= 7 && weeklyAvg28d > 0) {
            const acr = tonnage7d / weeklyAvg28d;
            // ACR ≤ 0.8 → 100; 1.0 → 85; 1.3 → 50; ≥ 1.5 → 20 (linear between)
            let score;
            if (acr <= 0.8) score = 100;
            else if (acr <= 1.0) score = Math.round(lerp(acr, 0.8, 100, 1.0, 85));
            else if (acr <= 1.3) score = Math.round(lerp(acr, 1.0, 85, 1.3, 50));
            else score = Math.round(lerp(acr, 1.3, 50, 1.5, 20));
            score = Math.max(0, Math.min(100, score));

            components.push({
                name: 'load_acr',
                value: score,
                weight: 0.20,
                detail: `7d tonnage ${tonnage7d.toFixed(0)} kg·reps / 28d weekly avg ${weeklyAvg28d.toFixed(0)} kg·reps = ACR ${acr.toFixed(2)}`,
            });
            totalWeight += 0.20;
            weightedScore += score * 0.20;
            ruleTrace.push(`ACR: ${acr.toFixed(2)} → score ${score} (weight 0.20)`);
        } else {
            ruleTrace.push(`ACR: skipped — insufficient training history (${sessionDays28d} session days, need ≥7)`);
        }

        // ── Final score ───────────────────────────────────────────────────
        if (components.length === 0) {
            ruleTrace.push('No components available — returning null score');
            return res.json({
                score: null,
                band: 'unknown',
                components: [],
                rule_trace: ruleTrace,
            });
        }

        // Reweight: normalise weights to sum to 1.0
        if (totalWeight < 1.0) {
            const scale = 1.0 / totalWeight;
            for (const c of components) {
                c.weight = Math.round(c.weight * scale * 100) / 100;
            }
            ruleTrace.push(`Reweighted components (original total weight ${totalWeight.toFixed(2)}) — scale factor ${(1 / totalWeight).toFixed(2)}`);
        }

        const rawScore = Math.round(weightedScore / totalWeight);
        const score = Math.max(0, Math.min(100, rawScore));
        const band = score >= 67 ? 'push' : score >= 34 ? 'maintain' : 'rest';

        ruleTrace.push(`Final readiness score: ${score} → band: ${band}`);

        res.json({ score, band, components, rule_trace: ruleTrace });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /insights/deload
// Deload auto-detection. Returns recommended:bool, triggers:[], prescription.
//
// Triggers (any → recommended=true):
//  (a) e1RM down ≥2% over 3 consecutive sessions on any lift with ≥6 sessions logged
//  (b) Same exercise+weight failed (reps decreased session-over-session) 3 consecutive sessions
//  (c) Mean RIR < 1 over trailing 14 days with ≥6 sets
//  (d) last_deload_at > 42 days ago (or NULL with ≥42 days of history)
// ---------------------------------------------------------------------------
router.get('/deload', async (req, res, next) => {
    try {
        const uid = req.user.id;
        const ruleTrace = [];
        const triggers = [];

        // ── (d) Time-based trigger ─────────────────────────────────────────
        const { rows: userRows } = await pool.query(
            `SELECT last_deload_at,
                    (SELECT MIN(w.day_key) FROM workouts w WHERE w.user_id = $1) AS first_session
             FROM users WHERE id = $1`,
            [uid]
        );

        const lastDeloadAt = userRows[0]?.last_deload_at;
        const firstSession = userRows[0]?.first_session;
        const now = new Date();

        if (firstSession) {
            const historyDays = (now - new Date(firstSession)) / (1000 * 60 * 60 * 24);
            if (historyDays >= 42) {
                if (!lastDeloadAt) {
                    triggers.push({ trigger: 'time_based', detail: `${Math.round(historyDays)} days of training history with no deload recorded` });
                    ruleTrace.push(`Trigger D: ${Math.round(historyDays)} days history, no last_deload_at → deload recommended`);
                } else {
                    const daysSinceDeload = (now - new Date(lastDeloadAt)) / (1000 * 60 * 60 * 24);
                    if (daysSinceDeload >= 42) {
                        triggers.push({ trigger: 'time_based', detail: `Last deload was ${Math.round(daysSinceDeload)} days ago (threshold: 42 days)` });
                        ruleTrace.push(`Trigger D: ${Math.round(daysSinceDeload)} days since last deload → deload recommended`);
                    } else {
                        ruleTrace.push(`Trigger D: ${Math.round(daysSinceDeload)} days since last deload — within threshold`);
                    }
                }
            } else {
                ruleTrace.push(`Trigger D: only ${Math.round(historyDays)} days of history — time trigger not applicable`);
            }
        } else {
            ruleTrace.push('Trigger D: no training history');
        }

        // ── (c) Mean RIR < 1 over trailing 14 days ────────────────────────
        const { rows: rirRows } = await pool.query(
            `SELECT COUNT(*) AS set_count, AVG(s.rir) AS mean_rir
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             WHERE w.user_id = $1
               AND s.kind = 'lift'
               AND s.rir IS NOT NULL
               AND s.logged_at >= NOW() - INTERVAL '14 days'`,
            [uid]
        );

        const rirSetCount = parseInt(rirRows[0]?.set_count, 10) || 0;
        const meanRir = parseFloat(rirRows[0]?.mean_rir);

        if (rirSetCount >= 6 && !isNaN(meanRir)) {
            if (meanRir < 1.0) {
                triggers.push({ trigger: 'low_rir', detail: `Mean RIR ${meanRir.toFixed(2)} over ${rirSetCount} sets in last 14 days (threshold: <1.0)` });
                ruleTrace.push(`Trigger C: mean RIR ${meanRir.toFixed(2)} < 1 across ${rirSetCount} sets → fatigue signal`);
            } else {
                ruleTrace.push(`Trigger C: mean RIR ${meanRir.toFixed(2)} — acceptable (≥1.0)`);
            }
        } else {
            ruleTrace.push(`Trigger C: insufficient RIR data (${rirSetCount} sets, need ≥6)`);
        }

        // ── (a) + (b) per-lift analysis ────────────────────────────────────
        // Get lifts with ≥6 sessions in last 90 days
        const { rows: liftSessions } = await pool.query(
            `SELECT
                e.id AS exercise_id,
                e.name AS exercise_name,
                w.day_key,
                -- Best e1RM per session (Epley, reps capped 12)
                MAX(
                    CASE
                        WHEN s.reps = 1 THEN s.weight_raw / 8.0
                        ELSE (s.weight_raw / 8.0) * (1.0 + LEAST(s.reps, 12)::float / 30.0)
                    END
                ) AS session_e1rm,
                -- Best reps at max weight (for failure detection)
                MAX(s.reps) FILTER (WHERE s.weight_raw = (
                    SELECT MAX(s2.weight_raw)
                    FROM sets s2
                    JOIN workouts w2 ON w2.id = s2.workout_id
                    WHERE w2.user_id = $1
                      AND s2.exercise_id = e.id
                      AND w2.day_key = w.day_key
                      AND s2.kind = 'lift'
                )) AS reps_at_max_weight,
                MAX(s.weight_raw) AS max_weight_raw,
                COUNT(*) AS set_count
             FROM sets s
             JOIN workouts w ON w.id = s.workout_id
             JOIN exercises e ON e.id = s.exercise_id
             WHERE w.user_id = $1
               AND s.kind = 'lift'
               AND s.weight_raw > 0
               AND s.reps > 0
               AND s.logged_at >= NOW() - INTERVAL '90 days'
             GROUP BY e.id, e.name, w.day_key
             ORDER BY e.id, w.day_key ASC`,
            [uid]
        );

        // Group by exercise
        const byExercise = {};
        for (const row of liftSessions) {
            if (!byExercise[row.exercise_id]) byExercise[row.exercise_id] = { name: row.exercise_name, sessions: [] };
            byExercise[row.exercise_id].sessions.push({
                day_key: row.day_key,
                e1rm: parseFloat(row.session_e1rm),
                reps_at_max: parseInt(row.reps_at_max_weight, 10),
                max_weight_raw: parseInt(row.max_weight_raw, 10),
            });
        }

        for (const [exId, ex] of Object.entries(byExercise)) {
            const sessions = ex.sessions;
            if (sessions.length < 6) {
                ruleTrace.push(`${ex.name}: only ${sessions.length} sessions — skipping e1RM/failure analysis`);
                continue;
            }

            // Trigger (a): e1RM down ≥2% for 3 consecutive sessions
            let e1rmDeclineStreak = 0;
            for (let i = sessions.length - 1; i >= 1 && e1rmDeclineStreak < 3; i--) {
                const cur = sessions[i].e1rm;
                const prev = sessions[i - 1].e1rm;
                if (prev > 0 && (prev - cur) / prev >= 0.02) {
                    e1rmDeclineStreak++;
                } else {
                    break;
                }
            }
            if (e1rmDeclineStreak >= 3) {
                triggers.push({ trigger: 'e1rm_decline', exercise: ex.name, detail: `e1RM declined ≥2% in ${e1rmDeclineStreak} consecutive sessions` });
                ruleTrace.push(`Trigger A: ${ex.name} — e1RM declining ≥2% for ${e1rmDeclineStreak} consecutive sessions`);
            } else {
                ruleTrace.push(`${ex.name}: e1RM decline streak ${e1rmDeclineStreak} — no trigger`);
            }

            // Trigger (b): reps decreased at same weight 3 consecutive sessions
            let repDeclineStreak = 0;
            // Look at last few sessions where same weight was used
            const last5 = sessions.slice(-5);
            for (let i = last5.length - 1; i >= 1 && repDeclineStreak < 3; i--) {
                if (last5[i].max_weight_raw === last5[i - 1].max_weight_raw &&
                    last5[i].reps_at_max < last5[i - 1].reps_at_max) {
                    repDeclineStreak++;
                } else {
                    break;
                }
            }
            if (repDeclineStreak >= 3) {
                triggers.push({ trigger: 'rep_failure', exercise: ex.name, detail: `Reps decreased at same weight in ${repDeclineStreak} consecutive sessions` });
                ruleTrace.push(`Trigger B: ${ex.name} — rep decline at same weight for ${repDeclineStreak} consecutive sessions`);
            } else {
                ruleTrace.push(`${ex.name}: rep decline streak ${repDeclineStreak} — no trigger`);
            }
        }

        const recommended = triggers.length > 0;
        const prescription = recommended
            ? '1 week: same exercises, 50–60% of normal sets, weights −10%'
            : null;

        if (recommended) {
            ruleTrace.push(`Deload recommended: ${triggers.length} trigger(s) detected`);
        } else {
            ruleTrace.push('No deload triggers detected — training status normal');
        }

        // Flatten to strings — mobile contract (api/insights.ts) declares triggers: string[].
        const triggerStrings = triggers.map(t => t.exercise ? `${t.exercise}: ${t.detail}` : t.detail);
        res.json({ recommended, triggers: triggerStrings, prescription, rule_trace: ruleTrace });
    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /insights/deload/ack
// Acknowledge a deload: sets users.last_deload_at = today.
// Response: { acknowledged: true, last_deload_at: '2026-06-11' }
// ---------------------------------------------------------------------------
router.post('/deload/ack', async (req, res, next) => {
    try {
        const uid = req.user.id;

        const { rows } = await pool.query(
            `UPDATE users
             SET last_deload_at = CURRENT_DATE
             WHERE id = $1
             RETURNING last_deload_at`,
            [uid]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'user_not_found' });
        }

        res.json({
            acknowledged: true,
            last_deload_at: rows[0].last_deload_at,
        });
    } catch (err) { next(err); }
});

module.exports = router;
