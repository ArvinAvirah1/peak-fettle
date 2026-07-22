# L24 — Testing & the Feedback Loop

**Duration:** 3–4 hours (lecture + case studies + design exercises)
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)
**Prerequisites:** L23 (build tooling), L10–L20 (all layers of the stack)

---

## Opening Context

Testing is the **safety net** between your code and your users. Peak Fettle uses a multi-layer testing strategy:

1. **Unit tests** (Jest) — Fast, isolated tests of individual functions (middleware, routes)
2. **Integration tests** (manual, not yet automated) — Real database, real API calls
3. **Persona-based beta feedback** — Six target personas (Marcus, Priya, Derek, Jasmine, Linda, Tyler) test the app end-to-end
4. **Automated code review** — Static analysis, linting, type checking

Together, these layers catch bugs that each layer misses alone. This lesson explores **what to test**, **how mocking can mask real bugs**, and **how to design for testability**.

---

## Section 1 — The Testing Pyramid

### Concept

The testing pyramid has three layers:

```
         ╔════════════════════╗
         ║     Manual/E2E     ║  Few tests, slow, catch real-world issues
         ║  (personas beta)   ║
         ╠════════════════════╣
         ║    Integration     ║  Some tests, medium speed, real DB/API
         ║   (not automated)  ║
         ╠════════════════════╣
         ║      Unit Tests    ║  Many tests, fast, isolated, mocked
         ║   (Jest on CI)     ║
         ╚════════════════════╝
```

**Rule of thumb:**
- Unit tests: 70% (cheap to write and run)
- Integration tests: 20% (catch layer-interactions)
- End-to-end / beta: 10% (expensive but catch the real world)

Peak Fettle currently has:
- Unit tests: ✓ (health.test.js, requireAuth.test.js, CI runs on every push)
- Integration tests: ✗ (none automated; would require live Supabase)
- Beta testing: ✓ (six personas, weekly feedback reports)

---

## Section 2 — Unit Tests: What to Test and How

### Example 1: Health Check Test

**File:** `peak-fettle-agents/server/__tests__/health.test.js`

```javascript
'use strict';

process.env.JWT_SECRET  = 'ci-test-secret-do-not-use-in-prod';
process.env.WEB_ORIGIN  = 'http://localhost:3000';
process.env.NODE_ENV    = 'test';

// Mock the database pool so no live Supabase connection is required
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
```

#### What This Tests

The `/health` endpoint is a **smoke test** — it verifies the server is alive and responding. It's designed to be called by:
- Load balancers (to detect if the server is down)
- Uptime monitors (PagerDuty, Grafana)
- Kubernetes liveness probes

#### Why Mocking?

The test mocks the database using `jest.mock('../db', ...)`. This means:

**Pro:** The test doesn't need a real Supabase connection. It runs in milliseconds. No credentials needed in CI.

**Con:** If the database driver is broken, this test won't catch it. It only tests the HTTP handler, not the driver.

#### Coverage

This test covers:
- HTTP status code (200, not 500)
- Response shape (JSON with `ok` and `ts` fields)
- Authorization (no JWT required)

It does **not** cover:
- Database connectivity (mocked away)
- Real timestamp accuracy (not important for health)

### Example 2: Authentication Middleware Test (T-01)

**File:** `peak-fettle-agents/server/__tests__/requireAuth.test.js`

```javascript
'use strict';

process.env.JWT_SECRET = 'ci-test-secret-do-not-use-in-prod';

const jwt           = require('jsonwebtoken');
const { requireAuth } = require('../middleware/requireAuth');

const SECRET = process.env.JWT_SECRET;

function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json   = jest.fn(() => res);
    return res;
}

function mockReq(token) {
    return { headers: { authorization: token ? `Bearer ${token}` : '' } };
}

describe('requireAuth middleware', () => {
    let next;

    beforeEach(() => { next = jest.fn(); });

    // Happy path: valid access token
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

    // Error case: missing token
    it('returns 401 missing_token when Authorization header is absent', () => {
        const req = { headers: {} };
        const res = mockRes();

        requireAuth(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'missing_token' });
        expect(next).not.toHaveBeenCalled();
    });

    // Error case: refresh token used as access token (T-01)
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
```

#### What This Tests

The `requireAuth` middleware is the **gatekeeper** for protected endpoints. It:
1. Extracts the JWT from the `Authorization: Bearer <token>` header
2. Verifies the signature using `JWT_SECRET`
3. Checks the token is not expired
4. **Rejects refresh tokens** (T-01 regression guard)
5. Attaches `req.user` to the request if valid

#### Key Test: T-01 (Refresh Token Rejection)

The T-01 test is **critical for security**. It verifies that if an attacker obtains a refresh token (which lives 30 days), they **cannot** use it as an access token to call protected endpoints.

If this test didn't exist and someone accidentally removed the refresh-token check:

```javascript
// UNSAFE: no refresh token check
const decoded = jwt.verify(token, SECRET);
req.user = decoded;
next();
```

An attacker with a refresh token could bypass this middleware entirely.

**With the test:** CI fails, the merge is blocked, the vulnerability is caught.

#### Mocking Helpers

The test uses **mock functions** to simulate Express request/response:

```javascript
function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);  // Chainable: res.status(401).json({...})
    res.json   = jest.fn(() => res);
    return res;
}
```

This simulates the Express Response object. Tests don't need a real HTTP connection.

### Test Design Principles for Unit Tests

**1. Test one thing per test**

Good:
```javascript
it('rejects expired tokens with 401', () => { ... });
it('rejects invalid signatures with 401', () => { ... });
```

Bad:
```javascript
it('handles tokens', () => {
    // Tests expired, invalid signature, missing header — all in one test
    // When it fails, you don't know which case broke
});
```

**2. Use descriptive test names**

Good:
```javascript
it('returns 401 refresh_token_not_accepted when a refresh token is presented (T-01)')
```

Bad:
```javascript
it('test 5')
```

**3. Test error paths, not just happy paths**

Peak Fettle's tests cover:
- Valid token (happy path)
- Missing token (error)
- Invalid signature (error)
- Expired token (error)
- Wrong token type (error)

**4. Isolate external dependencies with mocks**

```javascript
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
    },
}));
```

This replaces the real database driver with a mock. Tests don't hit Supabase.

---

## Section 3 — Integration Testing and the Mocking Liability

### The Problem: Mocks Hide Bugs

Unit tests mock external dependencies (database, HTTP APIs). But **mocks are lies** — they simulate ideal behavior. In the real world:

- Database queries are **slow** and **might fail**
- Network timeouts **happen**
- Race conditions **arise** under load
- Schema validation **is strict**

### Example: The Percentile Batch Job (N-07)

From the feedback report (pf-tester-feedback-2026-05-02.md):

```markdown
### N-07 — MEDIUM: `compute_percentile_batch` references undefined view `v_user_lift_inputs`

The batch job references a view that doesn't exist in the database.

**Impact:** If the weekly batch cron calls `compute_percentile_batch()`, it fails immediately.
```

**Why a unit test would miss this:**

```javascript
// Unit test (using mocked database)
it('compute_percentile_batch calculates percentiles', async () => {
    const mockDb = {
        query: jest.fn().mockResolvedValue({ rows: [{ user_id: '1', lift: 'bench', e1rm: 100 }] }),
    };
    
    const result = await computePercentileBatch(mockDb);
    expect(result).toBe(true);  // ✓ Test passes!
});
```

The mock returns fake data. The test never discovers that `v_user_lift_inputs` doesn't exist.

**Why an integration test would catch it:**

```javascript
// Integration test (against real Supabase)
it('compute_percentile_batch runs against real schema', async () => {
    const realDb = await supabase.db.connect();
    
    const result = await computePercentileBatch(realDb);
    expect(result).toBe(true);  // ✗ Fails! relation "v_user_lift_inputs" does not exist
});
```

Against the real database, the SQL query fails because the view is missing.

### When Mocks Are Liabilities vs. Assets

**Mocks are Assets when:**
- Testing **logic**, not I/O (e.g., business calculations)
- The external system is **expensive** (calling a paid API for every test)
- The external system is **unavailable** in CI (e.g., hardware sensors)
- You want **fast**, **deterministic** tests

**Mocks are Liabilities when:**
- Testing **integration** between layers (e.g., API → database)
- The **schema** or **contract** is important (e.g., a field was renamed)
- **Failure modes** are different in reality (e.g., network timeouts)

### Recommended Testing Strategy for Peak Fettle

**Unit tests (run on every push, CI):**
- Middleware logic (JWT validation, error handling)
- Business calculations (percentile formulas, E1RM estimates)
- Input validation
- **Mocks are fine here.** Tests run in milliseconds.

**Integration tests (run weekly or pre-production):**
- Full request → middleware → route → database → response
- Use a **test instance** of Supabase (separate from production)
- Verify schema, indexes, triggers are correct
- Test error cases (database constraints violated, query timeouts)

**Example integration test structure:**

```javascript
// integrationTests/percentile.test.js
describe('Percentile Batch (against real DB)', () => {
    let testDb;

    beforeAll(async () => {
        // Connect to staging Supabase instance
        testDb = await createStagingDatabaseConnection();
        // Seed test data
        await seedTestData(testDb);
    });

    afterAll(async () => {
        // Clean up test data
        await testDb.disconnect();
    });

    it('compute_percentile_batch completes without errors', async () => {
        // Call the real batch function against real (test) database
        const result = await computePercentileBatch(testDb);
        expect(result.success).toBe(true);
        expect(result.updatedRows).toBeGreaterThan(0);
    });

    it('percentile batch creates lift_percentiles entries', async () => {
        const percentiles = await testDb.query(
            'SELECT * FROM lift_percentiles WHERE percentile >= 50'
        );
        expect(percentiles.rows.length).toBeGreaterThan(0);
    });
});
```

---

## Section 4 — Persona-Based Beta Testing

### The Six Testing Personas

Peak Fettle uses six fictional personas to represent the user base:

1. **Marcus Webb** (28, competitive powerlifter)
   - Tests advanced features: E1RM tracking, percentile rankings
   - Looks for precision in weight entry, trend lines
   - **Will catch:** E1RM formula inflation (N-03), missing features

2. **Priya Nair** (26, natural bodybuilder)
   - Tests volume tracking, exercise substitutions
   - Cares about clean UI, muscle group progress
   - **Will catch:** UI clutter, missing exercise variants

3. **Derek Okafor** (38, beginner returning to fitness)
   - Tests onboarding, simple language
   - Wants streaks, not overwhelmed by jargon
   - **Will catch:** Confusing terminology, poor onboarding

4. **Jasmine Cole** (21, athletic performance)
   - Tests fast UI, cardio + lifting mixed sessions
   - Expects smooth animations, quick logging
   - **Will catch:** Performance lags, slow UI transitions

5. **Linda Marsh** (54, beginner returning after gap)
   - Tests accessibility, encouragement, not intimidation
   - Needs explanations of terms
   - **Will catch:** Jargon-heavy copy, lack of guidance

6. **Tyler Broussard** (19, beginner self-taught from YouTube)
   - Tests social proof, quick onboarding
   - Wants percentile rankings, motivates him
   - **Will catch:** Confusing first-time UX, slow setup

### How Beta Feedback Feeds the Roadmap

**Weekly cycle:**

1. **Monday–Friday:** Testers use the app, log issues (specific observations, not diagnoses)
2. **Friday EOD:** Manual test report generated (e.g., `pf-tester-feedback-2026-05-02.md`)
3. **Report contains:**
   - Status of prior issues (open/closed/new)
   - New bugs found (severity-ranked)
   - Test coverage notes
   - Executive brief for leadership
4. **Monday:** Dev team triages, assigns to sprints

### Example: Issue N-01 (EditSetDialog SpinBoxes Regression)

From feedback report 2026-05-02:

```markdown
### N-01 — HIGH: EditSetDialog (TICKET-004) still uses SpinBoxes for date/time
**File:** qml/EditSetDialog.qml
**Category:** Qt/QML — UI regression

SetTrackerPage.qml explicitly replaced SpinBoxes with text fields for date/time entry, 
with a code comment noting: "SpinBox UI eat the value between - and + on phones." 
That fix only went into the log form. The brand-new EditSetDialog.qml (TICKET-004) 
uses SpinBox for all five date/time fields. Any tester on a narrow screen will see 
the value disappear between the - and + buttons.

**Fix:** Apply the same text-field approach used on SetTrackerPage.
```

**Impact:** This issue was found because a tester (Jasmine, who cares about mobile UX) tested the new EditSetDialog on a phone and immediately spotted the regression.

If we'd only had unit tests, we'd never catch this — it's a UI issue visible only on-device.

### Handling Conflicting Persona Feedback

Personas sometimes want opposite things:

**Example:**

- **Marcus** (powerlifter) wants percentile rankings always visible
- **Linda** (beginner) finds percentile rankings intimidating and wants to hide them

**Solution:** A **settings toggle**.

```qml
// SettingsPage.qml
Switch {
    text: "Show percentile rankings"
    checked: showPercentiles
    onCheckedChanged: userPreferences.setShowPercentiles(checked)
}
```

Both personas are happy: Marcus enables it, Linda disables it.

---

## Section 5 — Worked Examples: Designing Tests for Each Layer

### Layer 1: Qt/QML — Unit Testing at the View Layer

**Problem:** How do you test QML without rendering it on screen?

**Answer:** Test the **data model** (the C++ backend), not the QML view.

```cpp
// test/test_set.cpp
#include <gtest/gtest.h>
#include "src/set.h"

class SetTest : public ::testing::Test {};

TEST_F(SetTest, RirClampsBetweenMinusOneAndTen) {
    Set s("Bench Press", 100.0, 5);
    
    s.setRir(99);  // Try to set out-of-range value
    EXPECT_EQ(s.rir(), 10);  // Should be clamped to 10
    
    s.setRir(-99);  // Try negative
    EXPECT_EQ(s.rir(), -1);  // Should be clamped to -1
}

TEST_F(SetTest, ConstructorClampsRir) {
    // This test ensures N-02 doesn't regress
    Set s("Bench Press", 100.0, 5, 99, QDateTime::currentDateTime());
    EXPECT_EQ(s.rir(), 10);  // Constructor should clamp, not accept 99
}

TEST_F(SetTest, E1rmFormula) {
    Set s1("Bench Press", 100.0, 10);
    EXPECT_NEAR(s1.estimatedOneRM(), 133.33, 0.1);
    
    // N-03: Single-rep max should not be inflated
    Set s2("Bench Press", 200.0, 1);
    EXPECT_NEAR(s2.estimatedOneRM(), 200.0, 0.1);  // Not 206.7
}
```

**Key insight:** Test the **business logic** (E1RM calculation, RIR clamping), not the UI (button clicks, animations). The logic is stable and fast. UI testing requires rendered widgets or screenshot comparisons, which are slow.

### Layer 2: Express Routes — Unit Tests with Mocks

**Problem:** Test the `/sets` route without hitting Supabase.

**Pattern:**

```javascript
// __tests__/sets.test.js
'use strict';

process.env.JWT_SECRET = 'test-secret';
process.env.WEB_ORIGIN = 'http://localhost:3000';

// Mock the database pool
jest.mock('../db', () => ({
    pool: {
        query: jest.fn(),
    },
}));

const request = require('supertest');
const app = require('../index');
const { pool } = require('../db');

describe('POST /sets', () => {
    const validToken = jwt.sign(
        { sub: 'user-123' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );

    it('creates a set for authenticated user', async () => {
        // Mock the database to return success
        pool.query.mockResolvedValue({ rows: [{ id: 'set-1' }] });

        const res = await request(app)
            .post('/sets')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                workout_id: 'workout-1',
                exercise: 'Bench Press',
                weight_kg: 100,
                reps: 5,
                rir: 2,
            });

        expect(res.status).toBe(201);
        expect(res.body.id).toBe('set-1');
        
        // Verify the route called the database
        expect(pool.query).toHaveBeenCalled();
    });

    it('returns 401 without valid JWT', async () => {
        const res = await request(app)
            .post('/sets')
            .send({ /* set data */ });

        expect(res.status).toBe(401);
    });

    it('returns 403 if user does not own the workout (T-03)', async () => {
        // Mock: database returns no rows (user doesn't own this workout)
        pool.query.mockResolvedValue({ rows: [] });

        const res = await request(app)
            .post('/sets')
            .set('Authorization', `Bearer ${validToken}`)
            .send({
                workout_id: 'someone-elses-workout',
                exercise: 'Bench Press',
                weight_kg: 100,
                reps: 5,
                rir: 2,
            });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('workout_not_found_or_not_owned');
    });
});
```

**Key insight:** Mock the database to simulate both success and error cases. Test that the route enforces ownership checks (T-03). Test error handling, not just happy paths.

### Layer 3: Database Schema — Integration Tests

**Problem:** The schema defines constraints that code might violate. How do you test it?

**Answer:** Write integration tests that hit the real schema:

```javascript
// integrationTests/schema.test.js
const supabase = require('@supabase/supabase-js').createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Database Schema', () => {
    beforeEach(async () => {
        // Clear test data
        await supabase.from('sets').delete().neq('id', null);
    });

    it('exercises.name column has max length enforcement', async () => {
        // Try to insert a name longer than expected
        const longName = 'A'.repeat(1001);  // Assume max is 1000

        const { error } = await supabase
            .from('exercises')
            .insert({ name: longName, category: 'chest' });

        expect(error).toBeTruthy();  // Should fail
        expect(error.message).toContain('violates check constraint');
    });

    it('lift_vectors table exists with expected columns', async () => {
        const { data, error } = await supabase
            .rpc('_get_table_columns', { table_name: 'lift_vectors' });

        expect(error).toBeFalsy();
        expect(data.map(col => col.name)).toContain('lift_name');
        expect(data.map(col => col.name)).toContain('p50');
        expect(data.map(col => col.name)).toContain('p95');
    });

    it('pg_trgm extension is installed (for fuzzy search index)', async () => {
        const { data } = await supabase.rpc('_get_installed_extensions');
        expect(data.map(ext => ext.extname)).toContain('pg_trgm');
    });

    it('compute_percentile_batch function references existing view', async () => {
        // Try to call the batch job
        const { error } = await supabase.rpc('compute_percentile_batch');
        
        // Should not fail with "relation does not exist"
        if (error) {
            expect(error.message).not.toContain('does not exist');
        }
    });
});
```

**Key insight:** Integration tests verify the database actually works as expected. They catch schema issues (missing views, broken constraints) that unit tests miss.

---

## Section 6 — The Mock-Removal Sprint

### Concept

A **mock-removal sprint** is a focused effort to identify which mocks are hiding real bugs.

**Process:**

1. Take a unit test that mocks the database
2. Replace the mock with a real database call
3. Run the test — if it fails, you've found a bug that mocks hid
4. Fix the code or the test
5. Decide: keep the real database call (integration test) or restore the mock (unit test)?

### Example: The Health Check Test

**Current unit test (with mock):**

```javascript
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [] }),
    },
}));

it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
});
```

**Convert to integration test (no mock):**

```javascript
// Don't mock the database
// It requires actual Supabase credentials

it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
});

// This test now requires:
// - Supabase instance running
// - SUPABASE_URL and SUPABASE_KEY set
// - ~100ms to run (not 1ms)
```

**Decision:** For the health check, keep the mock. The test is fast and doesn't need a real database. The `/health` endpoint doesn't even touch the database in a meaningful way.

### Example: The Percentile Batch Job

**Current (doesn't exist):**

```javascript
jest.mock('../db', () => ({
    pool: {
        query: jest.fn().mockResolvedValue({ rows: [...] }),
    },
}));

// This test "passes" but the real job fails because v_user_lift_inputs doesn't exist
```

**Mock-removal result:**

Run against real Supabase:

```
Error: relation "v_user_lift_inputs" does not exist
```

**Decision:** This must be an integration test (no mock), and it must be run regularly (weekly CI). The batch job is too complex to test with mocks.

---

## Section 7 — Bloom L1–L5 Quiz

### L1 — Recall

**Q1.1:** Name the three layers of the testing pyramid.

**Q1.2:** What does `jest.mock()` do?

**Q1.3:** Who are the six personas in Peak Fettle's beta testing?

**Answers:**
- Q1.1: Unit tests (bottom, many), Integration tests (middle, some), End-to-end/Beta (top, few).
- Q1.2: It replaces a module (e.g., the database driver) with a mock object that simulates its behavior, so tests don't need a real instance.
- Q1.3: Marcus (powerlifter), Priya (bodybuilder), Derek (beginner), Jasmine (athlete), Linda (returning beginner), Tyler (self-taught beginner).

### L2 — Understand

**Q2.1:** Explain the difference between a unit test that mocks the database and an integration test that uses a real database.

**Q2.2:** Why is the T-01 test (refresh token rejection) critical for security?

**Q2.3:** What does N-07 (missing `v_user_lift_inputs` view) tell us about the limits of mocking?

**Answers:**
- Q2.1: Unit tests mock the database, so they're fast and don't require credentials, but they don't catch schema errors or real-world failures. Integration tests use a real (test) database, so they're slower but catch actual database issues.
- Q2.2: If a refresh token (valid for 30 days) is mistakenly accepted as an access token, an attacker who obtains the refresh token can bypass authentication entirely. The T-01 test prevents this regression by asserting the middleware rejects refresh tokens.
- Q2.3: It shows that mocks can hide bugs that only surface when the code hits a real database. The batch job ran "fine" in unit tests (mocked query returned success), but failed in production because the view didn't exist.

### L3 — Apply

**Q3.1:** You're writing a unit test for the `POST /workouts` route. Should you mock the database? Justify your answer.

**Q3.2:** Design an integration test that would catch the N-07 bug (missing view).

**Q3.3:** A tester (Linda) reports that the onboarding feels overwhelming. This is not a code bug — it's a UX issue. How would you design a test to catch similar UX regressions?

**Answers:**
- Q3.1: Yes, mock the database for the unit test. The test should verify the route's logic (parsing request, validation, calling the database), not the database itself. Mocking keeps the test fast and lets it run in CI. Write a separate integration test (run weekly) that verifies the route against a real database.

- Q3.2: Write an integration test that calls `compute_percentile_batch()` against a real Supabase instance:
  ```javascript
  const result = await computePercentileBatch(realDb);
  expect(result.success).toBe(true);
  // If v_user_lift_inputs doesn't exist, the query fails and the test fails
  ```

- Q3.3: Create a **persona-specific test scenario:** Have a tester (or automated script) follow Linda's workflow: onboarding → logging first set → checking dashboard. Measure:
  - Number of UI elements visible (if >10, might be overwhelming)
  - Presence of explanatory text (jargon should have tooltips)
  - Time to complete first set (if >3 min, too slow)
  This is not a code test but a **UX test** — a manual checklist or automated screenshot comparison.

### L4 — Analyze

**Q4.1:** The health check test takes 5ms. An integration test of the same endpoint takes 500ms (because it hits a real database). In a typical CI run with 20 endpoints, should all 20 tests be unit tests, all integration, or a mix? Justify.

**Q4.2:** The requireAuth test includes a mock Express response. What would break if you replaced it with a real HTTP server?

**Q4.3:** Beta tester Derek reports: "I logged a set 'Bench Press' and then logged another set but I'm not sure if it went through." This is vague. How would you turn this into a concrete test case?

**Answers:**
- Q4.1: **A mix, following the pyramid:** Unit test all 20 endpoints (fast, CI on every push). Integration test the 5 most critical routes (those that touch the database or external APIs). The ratio: 15 unit, 5 integration. This catches bugs quickly (unit tests) while also verifying real-world integration (integration tests) without making CI slow.

- Q4.2: If you used a real HTTP server instead of mocks: (1) tests would be much slower (HTTP overhead), (2) you'd need to manage the server lifecycle (start/stop), (3) you'd test HTTP functionality (response headers, chunking) that's not the point. The middleware test should be isolated — it tests JWT parsing and the next() callback, not HTTP plumbing.

- Q4.3: Derek's report is **subjective.** Convert it to a concrete test:
  - Step 1: Log a set "Bench Press" with weight 100 kg, reps 5
  - Step 2: Verify the set appears in the set list immediately (no network delay)
  - Step 3: Restart the app
  - Step 4: Verify the set is still there (persisted to database)
  - Step 5: Log a second set "Squat"
  - Step 6: Verify both sets are in the list
  This is a **user-journey test**, not a unit test. It requires the full app stack.

### L5 — Evaluate

**Q5.1:** Peak Fettle currently has unit tests (Jest) and persona-based beta testing, but no automated integration tests. Evaluate this decision. Should you add integration tests? If yes, when and how?

**Q5.2:** The feedback report (N-03) found that the E1RM formula inflates 1-rep maxes by 3.3%. This is a **calculation bug**, not a **schema bug**. Could this have been caught by integration tests? By mocks?

**Q5.3:** Consider the mock-removal sprint. You take every mocked database call and replace it with a real Supabase call. Your CI time goes from 2 minutes to 20 minutes. Is this trade-off worth it?

**Answers:**
- Q5.1: **Yes, add integration tests, but strategically.** Current approach (unit tests in CI, beta testing weekly) is reasonable for a Phase A product, but as the app scales:
  - Add a **weekly integration test run** against a staging Supabase instance
  - Focus on critical paths: auth flows, set logging, percentile batch
  - Do not convert all unit tests to integration tests (too slow)
  - Integration tests catch schema/data bugs; unit tests catch logic bugs
  - Target: 70% unit (CI on every push), 25% integration (CI weekly), 5% beta (ongoing)

- Q5.2: **Integration tests would catch it** (schema validation, real data flow). **Mocks would not** because the formula is a **calculation**, not a database issue. The formula's bug is in the C++ logic, not the integration. A unit test of the `estimatedOneRM()` function would catch it:
  ```cpp
  Set s("Bench Press", 200.0, 1);
  EXPECT_EQ(s.estimatedOneRM(), 200.0);  // Fails if formula is wrong
  ```
  The issue is that **no unit test existed** for this calculation.

- Q5.3: **Not worth it right now.** 20 minutes per push is unacceptable for developer velocity. Better strategy:
  - Keep unit tests fast in CI (2 min)
  - Run integration tests on a **schedule** (nightly or weekly), not on every push
  - Run integration tests **before production deployment** (pre-release gate)
  - This gives you confidence (integration tests catch real bugs) without killing developer feedback loop (CI still takes 2 min)

---

## Section 8 — Interactive Widget: Test Coverage Map

The following widget shows which test types catch which categories of bugs.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PEAK FETTLE TEST COVERAGE MAP                     │
└──────────────────────────────────────────────────────────────────────┘

Bug Category                 Unit  Integ  Beta  Caught By
═════════════════════════════════════════════════════════════════════════

Logic errors (E1RM formula)   ✓     ~     ✗    Unit test of formula
Security (refresh token)      ✓     ✓     ✓    Unit test + beta
Schema (missing view)         ✗     ✓     ~    Integration test
Constraints (name too long)   ✗     ✓     ~    Integration test
Performance (N->slow query)   ✗     ✓     ✗    Integration test
Regression (UI SpinBox)       ✗     ✗     ✓    Beta tester (Jasmine)
UX (onboarding confusing)     ✗     ✗     ✓    Beta tester (Linda, Derek)
Typo (variable name)          ✓     ✓     ✓    Any test
Data integrity (duplicate)    ✗     ✓     ~    Integration test

Legend:
✓ = Will catch reliably
~ = Might catch (depends on test design)
✗ = Won't catch

Key insights:
- Unit tests catch logic bugs (calculations, validation)
- Integration tests catch data/schema bugs (missing views, constraints)
- Beta tests catch UX bugs (confusing flows, poor onboarding)
- No single test type catches everything
```

---

## Summary and Key Takeaways

1. **Unit tests** (Jest, mocked) are fast and run in CI. Catch logic bugs, but not schema/integration issues.

2. **Integration tests** (real database) are slower but catch schema bugs, constraint violations, missing indexes. Run on schedule (weekly), not every push.

3. **Beta testing** (personas) catches UX issues, real-world flows, and credibility issues (E1RM inflation) that code tests miss.

4. **Mocks are tools, not solutions.** They're great for speed (CI every push) but hide real bugs (missing views, schema changes). Use mocks for unit tests, but validate against real systems in integration tests.

5. **Design tests for testability:** Separate business logic (test this!) from I/O (mock this for unit tests, hit real for integration tests).

6. **T-01 (refresh token rejection)** is an example of a critical security test that **must** exist and **must** not regress. Without it, CI blindly merges code that introduces a 30-day authentication bypass.

7. **The mock-removal sprint** is a useful exercise: take a test, remove the mocks, and see if it still passes. If it fails, you've found a real bug.

8. **Multiple feedback loops:** Unit tests (2 min), beta reports (weekly), integration tests (weekly pre-deploy). Together, they catch bugs at different stages.

---

## Further Reading

- [Jest Documentation](https://jestjs.io/) — unit testing framework
- [Testing Library](https://testing-library.com/) — testing best practices
- [Database Integration Testing](https://martinfowler.com/bliki/IntegrationTest.html) — when and how
- Peak Fettle `pf-tester-feedback-*.md` files — real feedback examples
- Peak Fettle `testing-team/personas.md` — detailed persona specifications

---

**Next Lesson:** L25 — Capstone. Synthesis of all 24 lessons: evaluate Peak Fettle's architecture and design a non-trivial feature end-to-end.
