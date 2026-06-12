// peak-fettle-agents/server/routes/backup.js
// TICKET-094 Workstream B — E2E-Encrypted Backup blob transport (Agent F)
// Date: 2026-06-11
//
// Mounts AT /user/backup-blob so that final URLs are:
//   PUT  /user/backup-blob          → upload / upsert encrypted envelope
//   GET  /user/backup-blob          → download envelope
//   GET  /user/backup-blob/status   → metadata (exists, bytes, updated_at) — no download
//
// Security invariants (spec §1):
//   - Server stores ciphertext ONLY; never logs envelope contents or any field value.
//   - Plaintext-detection sanity check: reject if ct decodes to plaintext JSON backup.
//   - No paid gate (spec §4: "NOT paid-gated").
//
// Rate limit: 12 PUT/day per user (spec §4).

'use strict';

const express    = require('express');
const { supabaseAdmin } = require('../lib/supabaseAdmin');

const router = express.Router();



// ---------------------------------------------------------------------------
// Per-user daily rate limit for PUT (12 writes / day).
// Uses an in-process Map keyed by userId — lightweight, resets on restart.
// A more durable implementation (Redis) can replace this later without
// changing the route logic.
// ---------------------------------------------------------------------------

const BUCKET        = 'user-backups';
const BLOB_PATH_FOR = (userId) => `${userId}/backup.json`;
const MAX_BYTES     = 5 * 1024 * 1024; // 5 MB
const MAX_DAILY_PUT = 12;

// { userId → { count: number, windowStart: number (ms epoch) } }
const putCounters = new Map();

function checkPutRateLimit(userId) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const entry = putCounters.get(userId);

    if (!entry || (now - entry.windowStart) >= dayMs) {
        putCounters.set(userId, { count: 1, windowStart: now });
        return true; // allowed
    }
    if (entry.count >= MAX_DAILY_PUT) {
        return false; // blocked
    }
    entry.count += 1;
    return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Required b64-encoded fields in the envelope (spec §2).
const REQUIRED_B64_FIELDS = ['salt', 'wrap_iv', 'wrapped_key', 'iv', 'ct'];

// Loose but sufficient base64 check — any non-empty base64url-or-padded string.
function isNonEmptyB64(v) {
    return typeof v === 'string' && v.length > 0 && /^[A-Za-z0-9+/=_-]+$/.test(v);
}

/**
 * Validate the envelope object against spec §2.
 * Returns null if valid, or an error string describing the first problem.
 */
function validateEnvelope(env) {
    if (env === null || typeof env !== 'object' || Array.isArray(env)) {
        return 'envelope must be a JSON object';
    }
    if (env.format !== 'pf-encrypted-backup') {
        return 'envelope.format must be "pf-encrypted-backup"';
    }
    if (env.v !== 1) {
        return 'envelope.v must be 1';
    }
    if (env.alg !== 'AES-256-GCM') {
        return 'envelope.alg must be "AES-256-GCM"';
    }
    if (env.kdf !== 'scrypt') {
        return 'envelope.kdf must be "scrypt"';
    }
    // kdf_params
    if (
        typeof env.kdf_params !== 'object' ||
        env.kdf_params === null ||
        env.kdf_params.N !== 32768 ||
        env.kdf_params.r !== 8 ||
        env.kdf_params.p !== 1
    ) {
        return 'envelope.kdf_params must be { N: 32768, r: 8, p: 1 }';
    }
    for (const field of REQUIRED_B64_FIELDS) {
        if (!isNonEmptyB64(env[field])) {
            return `envelope.${field} must be a non-empty base64 string`;
        }
    }
    if (typeof env.created_at !== 'string' || env.created_at.length === 0) {
        return 'envelope.created_at must be a non-empty ISO8601 string';
    }
    return null;
}

/**
 * Plaintext-detection sanity check (spec §4 / §1 defense-in-depth).
 * If envelope.ct decodes to valid UTF-8 JSON beginning with
 * {"format":"peak-fettle-backup" → reject with plaintext_rejected.
 *
 * We only decode the first 64 bytes of the base64 value — enough to
 * detect the forbidden prefix without loading the whole ciphertext.
 * We deliberately do NOT log the decoded value or any prefix content.
 */
function detectsPlaintext(ctB64) {
    try {
        // Take enough characters from the front to decode ~64 bytes.
        // Base64 ratio is 4:3, so 88 chars ≈ 66 bytes — plenty.
        const prefix = ctB64.slice(0, 88);
        const buf = Buffer.from(prefix, 'base64');
        const str = buf.toString('utf8');
        return str.startsWith('{"format":"peak-fettle-backup');
    } catch (_) {
        return false; // not decodable → not plaintext
    }
}

// ---------------------------------------------------------------------------
// Ensure the private bucket exists (creates once; tolerates already-exists).
// ---------------------------------------------------------------------------
let bucketReady = false;

async function ensureBucket() {
    if (bucketReady) return;
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    if (error && !error.message.toLowerCase().includes('already exists')) {
        throw error;
    }
    bucketReady = true;
}

// ---------------------------------------------------------------------------
// PUT /  (mounted at /user/backup-blob)
// Body: { envelope: <Envelope> }
// Validates, size-checks, plaintext-checks, upserts to storage.
// Returns: { updated_at: <ISO8601> }
// ---------------------------------------------------------------------------
router.put('/', async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Rate limit: 12 writes per day
        if (!checkPutRateLimit(userId)) {
            return res.status(429).json({
                error: 'rate_limited',
                message: 'Backup upload is limited to 12 times per day.',
            });
        }

        const { envelope } = req.body ?? {};

        // Validate envelope structure
        const validationError = validateEnvelope(envelope);
        if (validationError) {
            return res.status(400).json({
                error: 'invalid_envelope',
                message: validationError,
            });
        }

        // Serialise to measure size (we need the bytes for upload anyway)
        const serialised = JSON.stringify(envelope);
        const bodyBytes = Buffer.byteLength(serialised, 'utf8');

        if (bodyBytes > MAX_BYTES) {
            return res.status(413).json({
                error: 'payload_too_large',
                message: `Backup blob must be ≤ 5 MB (received ${bodyBytes} bytes).`,
            });
        }

        // Plaintext-detection sanity check — defense-in-depth (spec §1)
        if (detectsPlaintext(envelope.ct)) {
            return res.status(400).json({
                error: 'plaintext_rejected',
                message: 'ct field appears to contain unencrypted data. Encrypt before uploading.',
            });
        }

        await ensureBucket();

        const path = BLOB_PATH_FOR(userId);
        const fileBuffer = Buffer.from(serialised, 'utf8');

        const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, fileBuffer, {
                contentType: 'application/json',
                upsert: true,
            });

        if (uploadError) {
            return next(uploadError);
        }

        const updated_at = new Date().toISOString();
        return res.status(200).json({ updated_at });

    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /  (mounted at /user/backup-blob)
// Downloads the blob and responds { envelope, updated_at }.
// Returns 404 { error: 'no_backup' } if absent.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
    try {
        const userId = req.user.id;

        await ensureBucket();

        const path = BLOB_PATH_FOR(userId);

        const { data, error } = await supabaseAdmin.storage
            .from(BUCKET)
            .download(path);

        if (error) {
            // Supabase returns an error when the file doesn't exist.
            const msg = error.message ?? '';
            if (
                msg.toLowerCase().includes('not found') ||
                msg.toLowerCase().includes('does not exist') ||
                msg.toLowerCase().includes('object not found')
            ) {
                return res.status(404).json({ error: 'no_backup' });
            }
            return next(error);
        }

        // data is a Blob in the Supabase JS SDK v2
        const text = await data.text();
        let envelope;
        try {
            envelope = JSON.parse(text);
        } catch (_) {
            return res.status(500).json({ error: 'corrupt_blob', message: 'Stored blob is not valid JSON.' });
        }

        // Infer updated_at from envelope.created_at if available (the upload
        // round-trip does not return metadata; we use the envelope's own timestamp).
        const updated_at = (envelope && typeof envelope.created_at === 'string')
            ? envelope.created_at
            : null;

        return res.status(200).json({ envelope, updated_at });

    } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /status  (mounted at /user/backup-blob → final URL /user/backup-blob/status)
// Returns { exists, updated_at, bytes } without downloading the blob.
// Uses storage list with search to inspect metadata only.
// ---------------------------------------------------------------------------
router.get('/status', async (req, res, next) => {
    try {
        const userId = req.user.id;

        await ensureBucket();

        // List the user's folder — returns file metadata without downloading body.
        const { data, error } = await supabaseAdmin.storage
            .from(BUCKET)
            .list(userId, {
                limit: 10,
                search: 'backup.json',
            });

        if (error) {
            return next(error);
        }

        const fileEntry = Array.isArray(data)
            ? data.find((f) => f.name === 'backup.json')
            : null;

        if (!fileEntry) {
            return res.status(200).json({ exists: false, updated_at: null, bytes: null });
        }

        return res.status(200).json({
            exists:     true,
            updated_at: fileEntry.updated_at ?? fileEntry.created_at ?? null,
            bytes:      fileEntry.metadata?.size ?? null,
        });

    } catch (err) { next(err); }
});

module.exports = router;
