// Centralized error handler — converts thrown ZodError / pg errors / unknown into JSON.
// dev-backend — 2026-04-30

function errorHandler(err, _req, res, _next) {
    if (err && err.name === 'ZodError') {
        return res.status(400).json({ error: 'validation_failed', details: err.issues });
    }
    if (err && err.code === '23505') { // pg unique violation
        return res.status(409).json({ error: 'conflict' });
    }

    // Log unknown errors for Sentry once it's wired
    console.error('[unhandled]', err);
    return res.status(500).json({ error: 'internal_error' });
}

module.exports = { errorHandler };
