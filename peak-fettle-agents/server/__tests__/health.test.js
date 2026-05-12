// health.test.js — smoke test for GET /health
// Verifies the server initialises correctly and responds to the
// health-check endpoint used by the load balancer / uptime monitors.
//
// We mock the DB pool so no live Supabase connection is required in CI.

'use strict';

// ---- env must be set BEFORE requiring the app ----
process.env.JWT_SECRET  = 'ci-test-secret-do-not-use-in-prod';
process.env.WEB_ORIGIN  = 'http://localhost:3000';
process.env.NODE_ENV    = 'test';

// ---- mock pg pool so no DB connection is attempted ----
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
    },
}));

const request = require('supertest');
const app     = require('../index');

describe('GET /health', () => {
    it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.ts).toBe('number');
    });

    it('does not require a JWT', async () => {
        const res = await request(app).get('/health');
        expect(res.status).not.toBe(401);
    });
});
