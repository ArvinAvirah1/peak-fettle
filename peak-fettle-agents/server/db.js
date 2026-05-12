// Postgres pool against the Supabase Postgres URL.
// dev-backend — 2026-04-30

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    // Supabase requires SSL
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
});

module.exports = { pool };
