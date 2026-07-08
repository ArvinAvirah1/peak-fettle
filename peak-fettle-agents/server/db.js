// Postgres pool against the Supabase Postgres URL.
// dev-backend — 2026-04-30

const { Pool, types } = require('pg');

// ---------------------------------------------------------------------------
// Type parsers (2026-07-07) — the API contract is JSON-friendly scalars.
//
// DATE (day_key, week_start, …): node-postgres defaults to a JS Date, which
// res.json() serialises as a full ISO timestamp ("2026-07-05T00:00:00.000Z").
// Every client consumer expects the plain 'YYYY-MM-DD' the column stores —
// the Date round-trip broke Pro workout drill-downs ("undefined, undefined
// NaN" headers, "No workout logged for this day" on days that have sets).
// Return the wire text verbatim; no server code does date math on DATE
// columns (verified: groups.js/lifeos.js already handle string-or-Date).
types.setTypeParser(types.builtins.DATE, (v) => v);

// INT8 (every COUNT(*)): defaults to a string ("3"), which broke i18next
// pluralisation client-side (a string `count` skips plural resolution → raw
// key rendered). Counts here can never exceed 2^53. NUMERIC (SUM/AVG of
// weights, distances): same string default → parse to float.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : parseInt(v, 10)));
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));

const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    // Supabase requires SSL
    ssl: { rejectUnauthorized: false },
    // Nano instance (512 MB RAM) — keep the footprint minimal.
    // 2 connections is enough for low-traffic / early-stage: one active query +
    // one spare for a burst. Cron jobs only ever check out 1 connection at a time,
    // so this is also safe for all scheduled scripts.
    // Raise to 5–10 once compute is upgraded to micro or above.
    max: 2,
    // Release idle connections quickly so memory is returned to the OS promptly.
    idleTimeoutMillis: 10_000,
    // Prevent indefinite hangs when all connections are busy.
    connectionTimeoutMillis: 10_000,
});

module.exports = { pool };
