// Peak Fettle — Express server
// Author: dev-backend
// Date: 2026-04-30 (updated 2026-05-04 — Phase C routes: constraints, health-metrics, user)

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
const { errorHandler } = require('./middleware/errorHandler');
const { requireAuth }  = require('./middleware/requireAuth');

const app = express();

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

// Health check (not rate-limited — load balancer / uptime monitors use this)
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Public routes — auth is rate-limited (N-11)
app.use('/auth', authLimiter, authRoutes);

// Public routes (exercises are a global read-only library — no auth needed for reads)
app.use('/exercises', exercisesRoutes);

// Protected routes — JWT required
app.use('/workouts',   requireAuth, workoutsRoutes);
app.use('/sets',       requireAuth, setsRoutes);
app.use('/plans',      requireAuth, plansRoutes);
app.use('/percentile', requireAuth, percentileRoutes);

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

// Phase C — TICKET-014: GDPR data export + account deletion
app.use('/user', requireAuth, userRoutes);

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
