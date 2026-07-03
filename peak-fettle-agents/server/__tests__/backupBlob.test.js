// __tests__/backupBlob.test.js
// TICKET-094 Workstream B — Server blob transport tests (Agent F)
// Run: npx jest __tests__/backupBlob.test.js (from server/)
//
// All Supabase storage calls are mocked — no live bucket or DB needed.
// Tests: happy PUT/GET roundtrip, 413 oversize, 400 malformed envelope
//        (missing fields, wrong format), 400 plaintext-looking ct,
//        status exists, status absent.

'use strict';

// ── Mock native modules that won't load in the Linux CI sandbox ─────────────
jest.mock('bcrypt', () => ({
    hash:    jest.fn().mockResolvedValue('$2b$10$fakehash'),
    compare: jest.fn().mockResolvedValue(true),
}));

// ── Env stubs (must precede any require('../index')) ─────────────────────────
process.env.JWT_SECRET   = 'ci-test-secret-do-not-use-in-prod';
process.env.WEB_ORIGIN   = 'http://localhost:3000';
process.env.NODE_ENV     = 'test';
process.env.SUPABASE_URL              = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// ── Mock DB pool ──────────────────────────────────────────────────────────────
jest.mock('../db', () => ({
    pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

// ── Mock requireAuth — inject a synthetic user ────────────────────────────────
jest.mock('../middleware/requireAuth', () => ({
    requireAuth: (req, _res, next) => {
        req.user = { id: 'user-test-001' };
        next();
    },
}));

// ── Mock supabaseAdmin.storage ────────────────────────────────────────────────
// We expose individual jest.fn()s so tests can reconfigure them.
const mockUpload   = jest.fn();
const mockDownload = jest.fn();
const mockList     = jest.fn();
const mockCreateBucket = jest.fn().mockResolvedValue({ error: null });

jest.mock('../lib/supabaseAdmin', () => ({
    supabaseAdmin: {
        storage: {
            createBucket: (...args) => mockCreateBucket(...args),
            from: () => ({
                upload:   (...args) => mockUpload(...args),
                download: (...args) => mockDownload(...args),
                list:     (...args) => mockList(...args),
            }),
        },
    },
}));

const request = require('supertest');
const app     = require('../index');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A valid spec §2 envelope. ct is random base64 — NOT plaintext. */
const VALID_ENVELOPE = {
    format:     'pf-encrypted-backup',
    v:          1,
    alg:        'AES-256-GCM',
    kdf:        'scrypt',
    kdf_params: { N: 32768, r: 8, p: 1 },
    salt:       'AAAAAAAAAAAAAAAAAAAAAA==',   // 16 B in b64
    wrap_iv:    'AAAAAAAAAAAAAAAA',           // 12 B in b64
    wrapped_key:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', // 48 B
    iv:         'BBBBBBBBBBBBBBBB',           // 12 B in b64
    ct:         'c2VjcmV0Y2lwaGVydGV4dA==',  // base64 of "secretciphertext" — not plaintext JSON
    created_at: '2026-06-11T00:00:00.000Z',
};

/** Build a ct value that looks like plaintext (base64 of plaintext backup JSON prefix). */
function plaintextLookingCt() {
    const prefix = '{"format":"peak-fettle-backup","version":1,"workouts":[]}';
    return Buffer.from(prefix).toString('base64');
}

/** Build a body that is just over 5 MB when serialised. */
function oversizeEnvelope() {
    const padding = 'A'.repeat(5 * 1024 * 1024 + 100);
    return { ...VALID_ENVELOPE, ct: padding };
}

// ---------------------------------------------------------------------------
// Helper: reset storage mocks to happy defaults before each test.
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.clearAllMocks();
    mockCreateBucket.mockResolvedValue({ error: null });

    // Default upload: success
    mockUpload.mockResolvedValue({ error: null });

    // Default download: returns VALID_ENVELOPE as a Blob-like
    const stored = JSON.stringify(VALID_ENVELOPE);
    mockDownload.mockResolvedValue({
        data:  { text: async () => stored },
        error: null,
    });

    // Default list: one file entry
    mockList.mockResolvedValue({
        data: [{
            name:       'backup.json',
            updated_at: '2026-06-11T00:00:00.000Z',
            created_at: '2026-06-11T00:00:00.000Z',
            metadata:   { size: 1234 },
        }],
        error: null,
    });
});

// ---------------------------------------------------------------------------
// 1. Happy PUT — valid envelope, upload succeeds
// ---------------------------------------------------------------------------
describe('PUT /user/backup-blob — happy path', () => {
    test('1a. returns 200 with updated_at', async () => {
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: VALID_ENVELOPE });

        expect(res.status).toBe(200);
        expect(typeof res.body.updated_at).toBe('string');
        expect(res.body.updated_at.length).toBeGreaterThan(0);
    });

    test('1b. calls storage.upload with upsert:true and correct path', async () => {
        await request(app)
            .put('/user/backup-blob')
            .send({ envelope: VALID_ENVELOPE });

        expect(mockUpload).toHaveBeenCalledTimes(1);
        const [path, , opts] = mockUpload.mock.calls[0];
        expect(path).toBe('user-test-001/backup.json');
        expect(opts.upsert).toBe(true);
        expect(opts.contentType).toBe('application/json');
    });
});

// ---------------------------------------------------------------------------
// 2. Happy GET — returns stored envelope
// ---------------------------------------------------------------------------
describe('GET /user/backup-blob — happy path', () => {
    test('2a. returns 200 with envelope and updated_at', async () => {
        const res = await request(app).get('/user/backup-blob');

        expect(res.status).toBe(200);
        expect(res.body.envelope).toBeDefined();
        expect(res.body.envelope.format).toBe('pf-encrypted-backup');
        expect(res.body.envelope.v).toBe(1);
        expect(typeof res.body.updated_at).toBe('string');
    });

    test('2b. roundtrip: PUT then GET returns matching envelope fields', async () => {
        // PUT
        const putRes = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: VALID_ENVELOPE });
        expect(putRes.status).toBe(200);

        // GET — mock still returns VALID_ENVELOPE
        const getRes = await request(app).get('/user/backup-blob');
        expect(getRes.status).toBe(200);
        expect(getRes.body.envelope.ct).toBe(VALID_ENVELOPE.ct);
        expect(getRes.body.envelope.salt).toBe(VALID_ENVELOPE.salt);
    });
});

// ---------------------------------------------------------------------------
// 3. GET — absent blob returns 404 no_backup
// ---------------------------------------------------------------------------
describe('GET /user/backup-blob — absent', () => {
    test('3. returns 404 { error: "no_backup" } when file not found', async () => {
        mockDownload.mockResolvedValue({
            data:  null,
            error: { message: 'Object not found' },
        });

        const res = await request(app).get('/user/backup-blob');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('no_backup');
    });
});

// ---------------------------------------------------------------------------
// 4. PUT — 413 oversize
// ---------------------------------------------------------------------------
describe('PUT /user/backup-blob — 413 oversize', () => {
    test('4. rejects body > 5 MB with 413', async () => {
        const big = oversizeEnvelope();
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: big });

        expect(res.status).toBe(413);
        expect(res.body.error).toBe('payload_too_large');
    });

    test('4b. upload is NOT called when size exceeds cap', async () => {
        const big = oversizeEnvelope();
        await request(app)
            .put('/user/backup-blob')
            .send({ envelope: big });

        expect(mockUpload).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// 5. PUT — 400 malformed envelope (missing / wrong fields)
// ---------------------------------------------------------------------------
describe('PUT /user/backup-blob — 400 malformed envelope', () => {
    test('5a. missing envelope key entirely → 400 invalid_envelope', async () => {
        const res = await request(app)
            .put('/user/backup-blob')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_envelope');
    });

    test('5b. wrong format string → 400 invalid_envelope', async () => {
        const bad = { ...VALID_ENVELOPE, format: 'peak-fettle-backup' };
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_envelope');
    });

    test('5c. v !== 1 → 400 invalid_envelope', async () => {
        const bad = { ...VALID_ENVELOPE, v: 2 };
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_envelope');
    });

    test('5d. missing ct field → 400 invalid_envelope', async () => {
        const { ct: _ct, ...bad } = VALID_ENVELOPE;
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_envelope');
    });

    test('5e. missing created_at → 400 invalid_envelope', async () => {
        const { created_at: _ca, ...bad } = VALID_ENVELOPE;
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_envelope');
    });

    test('5f. wrong kdf_params → 400 invalid_envelope', async () => {
        const bad = { ...VALID_ENVELOPE, kdf_params: { N: 4096, r: 8, p: 1 } };
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_envelope');
    });
});

// ---------------------------------------------------------------------------
// 6. PUT — 400 plaintext-looking ct
// ---------------------------------------------------------------------------
describe('PUT /user/backup-blob — 400 plaintext_rejected', () => {
    test('6a. ct that decodes to JSON starting {"format":"peak-fettle-backup → 400', async () => {
        const bad = { ...VALID_ENVELOPE, ct: plaintextLookingCt() };
        const res = await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('plaintext_rejected');
    });

    test('6b. upload NOT called on plaintext rejection', async () => {
        const bad = { ...VALID_ENVELOPE, ct: plaintextLookingCt() };
        await request(app)
            .put('/user/backup-blob')
            .send({ envelope: bad });

        expect(mockUpload).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// 7. GET /status — file exists
// ---------------------------------------------------------------------------
describe('GET /user/backup-blob/status — exists', () => {
    test('7. returns { exists: true, updated_at, bytes } when file present', async () => {
        const res = await request(app).get('/user/backup-blob/status');

        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(true);
        expect(typeof res.body.updated_at).toBe('string');
        expect(typeof res.body.bytes).toBe('number');
    });
});

// ---------------------------------------------------------------------------
// 8. GET /status — file absent
// ---------------------------------------------------------------------------
describe('GET /user/backup-blob/status — absent', () => {
    test('8. returns { exists: false, updated_at: null, bytes: null }', async () => {
        mockList.mockResolvedValue({ data: [], error: null });

        const res = await request(app).get('/user/backup-blob/status');

        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(false);
        expect(res.body.updated_at).toBeNull();
        expect(res.body.bytes).toBeNull();
    });
});
