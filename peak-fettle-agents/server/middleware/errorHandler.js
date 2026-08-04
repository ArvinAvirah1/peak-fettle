// Centralized error handler — converts thrown ZodError / pg errors / unknown into JSON.
// dev-backend — 2026-04-30

function errorHandler(err, _req, res, _next) {
    if (err && err.name === 'ZodError') {
        // AUTH-01: surface WHICH field failed so the client can say more than
        // "Something went wrong" — but keep SRV-AUTH-04's spirit: only the
        // field path and Zod's constraint message ship; received values and
        // the full schema never do.
        const details = Array.isArray(err.issues)
            ? err.issues.slice(0, 10).map((i) => ({
                  field: Array.isArray(i.path) ? i.path.join('.') : String(i.path ?? ''),
                  message: typeof i.message === 'string' ? i.message : 'Invalid value',
              }))
            : undefined;
        return res.status(400).json(
            details && details.length > 0
                ? { error: 'validation_failed', details }
                : { error: 'validation_failed' }
        );
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
