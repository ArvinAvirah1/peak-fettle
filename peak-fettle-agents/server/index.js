// Peak Fettle — Express server
// Author: dev-backend
// Date: 2026-04-30 (updated 2026-05-04 — Phase C routes: constraints, health-metrics, user)
//                  (updated 2026-05-17 — PL-1/PL-2/PL-3: templates, csv import, rest day)

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes        = require('./routes/auth');
const workoutsRoutes    = require('./routes/workouts');
const setsRoutes        = require('./routes/sets');
const exercisesRoutes   = require('./routes/exercises');
const plansRoutes       = require('./routes/plans');
const percentileRoutes  = require('./routes/percentile');
const { groupsRouter, creditsRouter, goalsRouter } = require('./routes/groups');
const cosmeticsRoutes   = require('./routes/cosmetics');
// Phase C routes
const constraintsRoutes  = require('./routes/constraints');   // TICKET-012
const healthMetricsRoutes = require('./routes/healthMetrics'); // TICKET-013
const userRoutes         = require('./routes/user');           // TICKET-014
const measurementsRoutes = require('./routes/measurements');   // TICKET-130
// PL-1/PL-2/PL-3 routes
const templateRoutes     = require('./routes/templates');      // PL-1
const csvImportRoutes    = require('./routes/csvImport');      // PL-2
const routinesRoutes     = require('./routes/routines');       // TICKET-055/056
const insightsRoutes     = require('./routes/insights');       // TICKET-engine spec §4
const backupRoutes       = require('./routes/backup');         // TICKET-094-B §4 Agent F
const lifeosRoutes       = require('./routes/lifeos');         // LIFEOS TICKET-111
const partnerRoutes      = require('./routes/partner');        // LIFEOS TICKET-121 (public, code-based)
const { routineShareRouter, shareRouter } = require('./routes/shareLinks'); // TICKET-138
const { errorHandler } = require('./middleware/errorHandler');
const { requireAuth }  = require('./middleware/requireAuth');

const app = express();

// Railway terminates TLS and forwards through one reverse-proxy hop. Without this,
// req.ip resolves to the internal proxy address, so every express-rate-limit bucket
// (authLimiter, partnerLimiter) is shared GLOBALLY instead of per client IP — which
// breaks both brute-force and code-enumeration throttling (TICKET-127 security pass).
// Trust exactly ONE hop ('1') — not `true`, which trusts a spoofable XFF chain.
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// N-12: CORS — whitelist-based origin policy.
// In production, WEB_ORIGIN must be set explicitly. In development it defaults
// to localhost:3000. If NODE_ENV is 'production' and WEB_ORIGIN is absent,
// fail loud so the misconfiguration is visible at startup.
// ---------------------------------------------------------------------------
const isDev = (process.env.NODE_ENV || 'development') === 'development';
const allowedOrigin = process.env.WEB_ORIGIN || (isDev ? 'http://localhost:3000' : null);
if (!allowedOrigin) {
    console.error('[peak-fettle-api] FATAL: WEB_ORIGIN env var must be set in production.');
    process.exit(1);
}

// Security headers, JSON body parsing, CORS for the web mirror
app.use(helmet());
// TICKET-094-B: backup route needs its own body-size budget (≤5 MB envelopes).
// Mount it BEFORE the global 256 kb bodyParser so the 6 MB limit here takes
// effect first; our route handler then enforces the 5 MB spec cap in software.
app.use('/user/backup-blob', requireAuth, express.json({ limit: '6mb' }), backupRoutes);

app.use(express.json({ limit: '256kb' }));
app.use(cors({ origin: allowedOrigin }));

// ---------------------------------------------------------------------------
// N-11: Rate limiting on auth routes — brute-force + email enumeration defence.
// 20 attempts per 15-minute window is generous for legitimate use but throttles
// automated attacks. express-rate-limit is already a dependency.
// ---------------------------------------------------------------------------
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
});

// LIFEOS TICKET-121: the partner-view endpoint is PUBLIC (the code is the
// capability), so rate-limit hard to make code enumeration infeasible. 30
// reads/min per IP is ample for a partner refreshing a daily summary.
const partnerLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
});

// TICKET-138: GET /share/:linkId is PUBLIC (the recipient has no account —
// same posture as partnerLimiter above), so rate-limit hard against link-id
// enumeration. 30 reads/min per IP is ample for a human opening a shared link.
const shareLinkLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
});

// Health check (not rate-limited — load balancer / uptime monitors use this)
// Health check also reports whether the beta tier-toggle escape hatch is
// VISIBLE to this process (boolean only - never echoes secrets). Lets ops
// verify Railway env wiring from a browser instead of guessing (2026-07-02).
app.get('/health', (_req, res) => res.json({
    ok: true,
    ts: Date.now(),
    tierToggle: (process.env.ALLOW_CLIENT_TIER_TOGGLE || '').trim().replace(/"/g, '').toLowerCase() === 'true',
}));

// Public routes — auth is rate-limited (N-11)
app.use('/auth', authLimiter, authRoutes);

// Exercises: GET routes are public (global read-only library); POST requires auth
// so anonymous clients can't pollute the library with junk exercises.
// express-router matches in order, so the requireAuth middleware only fires
// when the request reaches a POST handler inside exercisesRoutes.
// Simplest approach: mount the router twice — public for the router, but the
// POST handler inside reads req.user which is set by requireAuth below.
// Actually: mount once unprotected and gate inside the route handler via a
// manual auth check — OR just mount with requireAuth and mark GET public in
// the route. Cleanest: mount once and rely on the route-level guard.
//
// Implementation: mount exercises unauthenticated (GET is public), and the
// POST /exercises route uses requireAuth passed as route middleware internally.
// We pass requireAuth into the exercises router via the app so both GET and
// POST are on the same mount point, with auth enforced only on POST.
app.use('/exercises', (req, res, next) => {
    if (req.method === 'POST') {
        return requireAuth(req, res, next);
    }
    next();
}, exercisesRoutes);

// PL-1: Template library — public read, no auth required
app.use('/templates', templateRoutes);
app.use('/routines',  requireAuth, routinesRoutes); // TICKET-055/056
// TICKET-138: routine share-link create/revoke — same /routines prefix, so it
// inherits the requireAuth above. NOT behind requirePaid: creating a share
// link is the explicit user-initiated network action carve-out (free tier may
// use it too — see tierPolicy.ts comment).
app.use('/routines',  requireAuth, routineShareRouter);
// TICKET-138: GET /share/:linkId is PUBLIC (no account for the recipient) —
// hard rate-limited like /partner above, mounted OUTSIDE requireAuth.
app.use('/share', shareLinkLimiter, shareRouter);

// Protected routes — JWT required
app.use('/workouts',   requireAuth, workoutsRoutes);
app.use('/sets',       requireAuth, setsRoutes);
app.use('/plans',      requireAuth, plansRoutes);
app.use('/percentile', requireAuth, percentileRoutes);

// 2026-06-12 (Agent O, SPEC_094A): percentile batch cron DISABLED.
// Percentile computation has moved on-device (strengthModelV3, Agent N).
// The external cron/percentile.js script must NOT be scheduled any more.
// The cron file is retained for reference but has an early-exit guard.
// The /percentile REST endpoint above is kept until Pro clients are verified
// to be using on-device values exclusively (remove after device-test gate).
// To fully remove: apply 20260612_drop_percentile_rankings.sql (founder-gated),
// then delete routes/percentile.js and the app.use line above.

// Group Streak Credits — all three prefixes are auth-protected
app.use('/groups',  requireAuth, groupsRouter);
app.use('/credits', requireAuth, creditsRouter);
app.use('/goals',   requireAuth, goalsRouter);

// Character customization + cosmetic shop
app.use('/cosmetics', requireAuth, cosmeticsRoutes);

// Phase C — TICKET-012: injury / limitation constraint filter
app.use('/constraints',   requireAuth, constraintsRoutes);

// Phase C — TICKET-013: wearable health metrics (HealthKit sync)
app.use('/health-metrics', requireAuth, healthMetricsRoutes);
app.use('/measurements', requireAuth, measurementsRoutes); // TICKET-130

// Phase C — TICKET-014: GDPR data export + account deletion
app.use('/user', requireAuth, userRoutes);
app.use('/lifeos', requireAuth, lifeosRoutes); // LIFEOS TICKET-111 — entitlement re-checked inside
// LIFEOS TICKET-121 — PUBLIC partner view (NO requireAuth; the code is the
// capability). Hard rate-limited; returns only the opaque summary string.
app.use('/partner', partnerLimiter, partnerRoutes);

// PL-2: CSV import (Garmin / Strava) — auth required
app.use('/import', requireAuth, csvImportRoutes);

// Training Engine — insight endpoints (spec §4)
app.use('/insights', requireAuth, insightsRoutes);

// Centralized error handler — last middleware
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Only bind a port when run directly (`node index.js`).
// When required by tests (supertest), skip listen so no dangling server is
// left open and the test process can exit cleanly.
// ---------------------------------------------------------------------------
if (require.main === module) {
    const port = process.env.PORT || 4000;
    app.listen(port, () => {
        console.log(`[peak-fettle-api] listening on :${port}`);
    });
}

module.exports = app; // exported for tests
