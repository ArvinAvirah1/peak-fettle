// requireAuth.test.js — unit tests for the JWT auth middleware
//
// Covers:
//   T-01  Refresh tokens must be rejected when presented as access tokens
//         (CTO guardrail #9; regression introduced after 2026-05-02 sprint)
//
// No DB is touched — this is a pure unit test of the middleware function.

'use strict';

process.env.JWT_SECRET = 'ci-test-secret-do-not-use-in-prod';

const jwt           = require('jsonwebtoken');
const { requireAuth } = require('../middleware/requireAuth');

const SECRET = process.env.JWT_SECRET;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Build a minimal mock Express response with chainable status + json. */
function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json   = jest.fn(() => res);
    return res;
}

/** Build a request with an Authorization header carrying the given token. */
function mockReq(token) {
    return { headers: { authorization: token ? `Bearer ${token}` : '' } };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('requireAuth middleware', () => {
    let next;

    beforeEach(() => { next = jest.fn(); });

    // ------ happy path ------

    it('calls next() and attaches req.user for a valid access token', () => {
        const token = jwt.sign(
            { sub: 'user-abc', email: 'alice@example.com' },
            SECRET,
            { expiresIn: '15m' }
        );
        const req = mockReq(token);
        const res = mockRes();

        requireAuth(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(req.user).toEqual({ id: 'user-abc', email: 'alice@example.com' });
        expect(res.status).not.toHaveBeenCalled();
    });

    // ------ missing / malformed token ------

    it('returns 401 missing_token when Authorization header is absent', () => {
        const req = { headers: {} };
        const res = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'missing_token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 invalid_token for a syntactically invalid token', () => {
        const req = mockReq('not.a.real.jwt');
        const res = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'invalid_token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 invalid_token for a token signed with the wrong secret', () => {
        const token = jwt.sign({ sub: 'user-abc' }, 'wrong-secret', { expiresIn: '15m' });
        const req   = mockReq(token);
        const res   = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'invalid_token' });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 invalid_token for an expired access token', () => {
        // expiresIn: 0 produces a token that expired at the moment of signing
        const token = jwt.sign({ sub: 'user-abc' }, SECRET, { expiresIn: 0 });
        const req   = mockReq(token);
        const res   = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'invalid_token' });
        expect(next).not.toHaveBeenCalled();
    });

    // ------ T-01: refresh token used as access token ------

    it('returns 401 refresh_token_not_accepted when a refresh token is presented (T-01)', () => {
        const refreshToken = jwt.sign(
            { sub: 'user-abc', type: 'refresh' },
            SECRET,
            { expiresIn: '30d' }
        );
        const req = mockReq(refreshToken);
        const res = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'refresh_token_not_accepted' });
        expect(next).not.toHaveBeenCalled();
    });
});
