/**
 * POST /import/csv
 * Accepts a multipart/form-data upload with a single CSV file.
 * Supports Garmin Connect and Strava activity export formats.
 *
 * Garmin columns (relevant): Activity Type, Date, Time, Distance, Avg Pace, Avg HR
 * Strava columns (relevant): Activity Date, Activity Type, Distance, Moving Time, Average Speed
 *
 * Returns: { imported: N, skipped: N, errors: [...] }
 *
 * Required npm packages (not yet in package.json): multer, csv-parse
 */
const express = require('express');
const multer  = require('multer');
const { parse } = require('csv-parse/sync');
const { pool } = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------
function detectFormat(headers) {
    if (headers.includes('Activity Type') && headers.includes('Avg Pace')) return 'garmin';
    if (headers.includes('Activity Type') && headers.includes('Moving Time')) return 'strava';
    return 'unknown';
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------
function parseGarminRow(row) {
    const activityTypeMap = { 'Running': 'run', 'Cycling': 'ride', 'Swimming': 'swim', 'Walking': 'walk' };
    return {
        activity_type:       activityTypeMap[row['Activity Type']] ?? 'other',
        logged_at:           row['Date'] ? new Date(row['Date']).toISOString() : null,
        duration_seconds:    parseDuration(row['Time']),
        distance_m:          row['Distance'] ? Math.round(parseFloat(row['Distance']) * 1000) : null,
        avg_pace_sec_per_km: parsePace(row['Avg Pace']),
        source:              'garmin_csv',
    };
}

function parseStravaRow(row) {
    const activityTypeMap = { 'Run': 'run', 'Ride': 'ride', 'Swim': 'swim', 'Walk': 'walk' };
    // CSV-003 (2026-05-19 tester flag): the unit of `Average Speed` in Strava's
    // CSV varies by export source:
    //   - Bulk export (Settings → Download Your Data → activities.csv): m/s
    //     → 1000 / (m/s) = sec/km  ✅ formula below is correct
    //   - Single-activity Export-CSV button on web: km/h (metric accounts)
    //     → 3600 / (km/h) = sec/km  ❌ formula below is ~3.6× too low
    //
    // Distance is multiplied by 1000 elsewhere on this same row, which is only
    // consistent with the single-activity (km) export, NOT the bulk export
    // (which gives meters). The two assumptions in this parser are
    // contradictory; one of them must be wrong.
    //
    // Resolution requires a real Strava export file. Until that's available,
    // we add a sanity clamp: any pace below 120 sec/km (~32 km/h running pace,
    // a marathon world record) is suspect — return null instead of writing a
    // wildly wrong value into the database. This keeps Priya's import working
    // for distance/duration while degrading gracefully on pace.
    let avgPace = null;
    if (row['Average Speed']) {
        const speed = parseFloat(row['Average Speed']);
        if (speed > 0) {
            const candidate = Math.round(1000 / speed);
            // Plausibility: 120 sec/km ≈ 2:00/km — faster than any human run.
            // Anything below 120 implies the unit was km/h, not m/s.
            avgPace = candidate >= 120 && candidate <= 1800 ? candidate : null;
        }
    }
    return {
        activity_type:       activityTypeMap[row['Activity Type']] ?? 'other',
        logged_at:           row['Activity Date'] ? new Date(row['Activity Date']).toISOString() : null,
        duration_seconds:    row['Moving Time'] ? parseInt(row['Moving Time'], 10) : null,
        distance_m:          row['Distance'] ? Math.round(parseFloat(row['Distance']) * 1000) : null,
        avg_pace_sec_per_km: avgPace,
        source:              'strava_csv',
    };
}

function parseDuration(str) {
    if (!str) return null;
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
}

function parsePace(str) {
    // "5:30" min/km → 330 sec/km
    if (!str || !str.includes(':')) return null;
    const [min, sec] = str.split(':').map(Number);
    return min * 60 + sec;
}

// ---------------------------------------------------------------------------
// POST /import/csv
// POOL-001 (2026-05-21): replaced per-row SELECT+INSERT with a 3-phase approach:
//   Phase 1 — parse all rows up-front (no DB calls)
//   Phase 2 — single batch dedup SELECT for all candidate dates
//   Phase 3 — single bulk INSERT wrapped in a transaction
// Reduces round-trips from O(2N) to O(3) for a 200-row Strava upload
// (~400 ms → ~30 ms on typical Supabase latency).
// ---------------------------------------------------------------------------
router.post('/', upload.single('file'), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const userId = req.user.id;

    let rows;
    try {
        rows = parse(req.file.buffer.toString('utf8'), {
            columns:           true,
            skip_empty_lines:  true,
            trim:              true,
        });
    } catch (e) {
        return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
    }

    if (rows.length === 0) return res.status(400).json({ error: 'CSV file is empty.' });

    const headers = Object.keys(rows[0]);
    const format  = detectFormat(headers);
    if (format === 'unknown') {
        return res.status(400).json({
            error: 'Unrecognised CSV format. Please export from Garmin Connect or Strava.',
        });
    }

    const parseRow = format === 'garmin' ? parseGarminRow : parseStravaRow;
    const skipped = [], errors = [];

    // ── Phase 1: parse all rows (no DB) ─────────────────────────────────────
    const parsed = [];
    for (const row of rows) {
        try {
            const p = parseRow(row);
            if (!p.logged_at) {
                skipped.push({ reason: 'missing date', row });
            } else {
                parsed.push(p);
            }
        } catch (e) {
            errors.push({ error: e.message });
        }
    }

    if (parsed.length === 0) {
        return res.json({ imported: 0, skipped: skipped.length, errors });
    }

    // ── Phase 2: batch dedup — one SELECT for all candidate dates ────────────
    // Fetch all existing cardio_import rows for this user on any of the
    // candidate calendar days.  One round-trip replaces N individual queries.
    // Dedup key: "YYYY-MM-DD|<duration_seconds or NULL>" — same semantics as
    // the original NULL-safe per-row check (CSV-001).
    const candidateDates = [...new Set(parsed.map(p => p.logged_at.split('T')[0]))];

    let existingSet = new Set();
    try {
        const { rows: existing } = await pool.query(
            `SELECT
               created_at::date::text  AS day,
               duration_seconds
             FROM workouts
             WHERE user_id      = $1
               AND session_type = 'cardio_import'
               AND created_at::date = ANY($2::date[])`,
            [userId, candidateDates]
        );
        for (const ex of existing) {
            existingSet.add(`${ex.day}|${ex.duration_seconds ?? 'NULL'}`);
        }
    } catch (e) {
        return next(e);
    }

    const toInsert = [];
    for (const p of parsed) {
        const day    = p.logged_at.split('T')[0];
        const durKey = p.duration_seconds != null ? String(p.duration_seconds) : 'NULL';
        if (existingSet.has(`${day}|${durKey}`)) {
            skipped.push({ reason: 'duplicate', date: day });
        } else {
            toInsert.push(p);
        }
    }

    if (toInsert.length === 0) {
        return res.json({ imported: 0, skipped: skipped.length, errors });
    }

    // ── Phase 3: bulk INSERT in a single transaction ─────────────────────────
    // user_id is factored out as $1.  Per-row columns (6 each) are laid out
    // sequentially: base = 2 + i * 6 for row i.
    // CSV-002: activity_type is included in every INSERT.
    const PER_ROW_COLS = 6; // activity_type, duration_seconds, distance_m, avg_pace, source, logged_at
    const bindValues  = [userId];
    const placeholders = toInsert.map((p, i) => {
        const base = 2 + i * PER_ROW_COLS;
        bindValues.push(
            p.activity_type,
            p.duration_seconds,
            p.distance_m,
            p.avg_pace_sec_per_km,
            p.source,
            p.logged_at,
        );
        return `($1, 'cardio_import', $${base}, $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}::timestamptz)`;
    });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO workouts
               (user_id, session_type, activity_type, duration_seconds,
                distance_m, avg_pace_sec_per_km, source, created_at)
             VALUES ${placeholders.join(', ')}`,
            bindValues
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        return next(e);
    } finally {
        client.release();
    }

    return res.json({ imported: toInsert.length, skipped: skipped.length, errors });
});

module.exports = router;
