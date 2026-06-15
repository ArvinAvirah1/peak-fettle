// JWT auth middleware — verifies Bearer token and attaches req.user.
// dev-backend — 2026-04-30
// T-01 (2026-05-02): reject refresh tokens presented as access tokens.
// CTO guardrail #9: access and refresh tokens must be distinguishable at the
// middleware layer. Refresh tokens carry payload.type === 'refresh'; access
// tokens carry no type field. Any token presenting type === 'refresh' is
// rejected here with 401 so stolen refresh tokens cannot call protected routes.

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'missing_token' });

    try {
        // Pin the algorithm to HS256 (what routes/auth.js signs with). Without an
        // allowlist, jsonwebtoken honours the token header's `alg`, which opens the
        // door to algorithm-substitution attacks. The OAuth path already pins RS256.
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        // T-01: Refuse refresh tokens used as access tokens.
        if (payload.type === 'refresh') {
            return res.status(401).json({ error: 'refresh_token_not_accepted' });
        }

        req.user = { id: payload.sub, email: payload.email };
        next();
    } catch (_err) {
        return res.status(401).json({ error: 'invalid_token' });
    }
}

module.exports = { requireAuth };
