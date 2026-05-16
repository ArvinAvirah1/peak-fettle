// Postgres pool against the Supabase Postgres URL.
// dev-backend — 2026-04-30

const { Pool } = require('pg');

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
