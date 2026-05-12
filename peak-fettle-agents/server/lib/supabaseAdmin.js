// server/lib/supabaseAdmin.js
// Supabase admin client — uses the service role key (server-side only, never
// exposed to clients). Required for auth.admin.deleteUser() and any other
// privileged Supabase operations that bypass Row Level Security.
//
// This module is intentionally separate from the Postgres pool (db.js) because:
//   1. It talks to the Supabase REST/PostgREST API, not the raw PG wire protocol.
//   2. The service role key is a high-privilege secret; isolating it here makes
//      it easy to audit which modules can escalate privileges.
//
// Import: const { supabaseAdmin } = require('../lib/supabaseAdmin');

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl      = process.env.SUPABASE_URL;
const serviceRoleKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    // Fail loudly at startup — a missing service role key means account
    // deletion (and any other admin operation) is silently broken.
    throw new Error(
        '[supabaseAdmin] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
        'Copy .env.example → .env and fill in both values.'
    );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
        // Server-side use only: no token refresh loop, no local storage.
        autoRefreshToken: false,
        persistSession:   false,
    },
});

module.exports = { supabaseAdmin };
