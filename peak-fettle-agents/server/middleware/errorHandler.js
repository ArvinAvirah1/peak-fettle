// Centralized error handler — converts thrown ZodError / pg errors / unknown into JSON.
// dev-backend — 2026-04-30

function errorHandler(err, _req, res, _next) {
    if (err && err.name === 'ZodError') {
        // SRV-AUTH-04: do not leak the request schema (field paths, lengths,
        // received values) to the client.
        return res.status(400).json({ error: 'validation_failed' });
    }
    if (err && err.code === '23505') { // pg unique violation
        return res.status(409).json({ error: 'conflict' });
    }
    // SRV-AUTH-06: schema drift (missing table/column) on a route that did not
    // catch it locally — label it so it is distinguishable from a real bug.
    if (err && (err.code === '42P01' || err.code === '42703')) {
        console.warn('[schema-drift]', err.code, err.message);
        return res.status(500).json({ error: 'schema_drift' });
    }

    // Log unknown errors for Sentry once it's wired
    console.error('[unhandled]', err);
    return res.status(500).json({ error: 'internal_error' });
}

module.exports = { errorHandler };
