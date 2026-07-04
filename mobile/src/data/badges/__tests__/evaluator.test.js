/**
 * evaluator.test.js — TICKET-143 badge evaluator test suite.
 *
 * Same typescript-transpile-and-eval pattern as
 * mobile/src/db/__tests__/migrations.test.js (no jest/Babel/expo-sqlite
 * needed). Run:
 *   node mobile/src/data/badges/__tests__/evaluator.test.js
 *
 * Tests:
 *   1. evaluateBadges is pure and deterministic given the same inputs.
 *   2. Threshold-crossing badges are returned; already-earned ids are excluded.
 *   3. Every BADGE_DEFS entry is reachable (a metrics snapshot exists that earns it).
 *   4. Cosmetic-grant badges carry their cosmeticItemId through to the result.
 *   5. Retroactive-grant perf test: gatherBadgeMetrics-shaped orchestration
 *      (via a large synthetic stub DB) evaluates in well under a budget.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'node_modules', 'typescript'));

function load(relPath, deps) {
  deps = deps || {};
  const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  const requireStub = function (id) {
    const key = id.replace(/^\.\//, '').replace(/^\.\.\//, '').replace(/^\.\.\/\.\.\//, '');
    if (deps[id]) return deps[id];
    if (deps[key]) return deps[key];
    try { return require(id); } catch (_) { return {}; }
  };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
    mod, mod.exports, requireStub,
    path.dirname(path.join(REPO, relPath)),
    path.join(REPO, relPath),
  );
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Stub the localDb / cosmeticUnlocks / groupSignals / appSettings deps so the
// pure evaluateBadges function (the primary unit under test) and a synthetic
// gatherBadgeMetrics perf pass can both run in plain Node.
// ---------------------------------------------------------------------------

function makeStubLocalDb(fixture) {
  // fixture: { workoutCount, exercisePrCount, totalVolumeKg, streakDays, generatedPlanStatus }
  return {
    async init() {},
    async getFirst(sql) {
      if (/COUNT\(\*\) AS n FROM workouts/.test(sql)) return { n: fixture.workoutCount };
      if (/COUNT\(\*\) AS n FROM exercise_prs/.test(sql)) return { n: fixture.exercisePrCount };
      if (/current_streak_days, longest_streak_days FROM streaks/.test(sql)) {
        return { current_streak_days: fixture.streakDays, longest_streak_days: fixture.streakDays };
      }
      if (/SUM\(COALESCE\(weight_kg/.test(sql)) return { total: fixture.totalVolumeKg };
      if (/status FROM generated_plans/.test(sql)) {
        return fixture.generatedPlanStatus ? { status: fixture.generatedPlanStatus } : null;
      }
      return null;
    },
    async getAll(sql) {
      if (/badge_id FROM badges_earned/.test(sql)) return [];
      return [];
    },
    async execute() {},
  };
}

const badgeDefsMod = load('src/data/badges/badgeDefs.ts');

const appSettingsStore = new Map();
const appSettingsStub = {
  async getSetting(key) { return appSettingsStore.has(key) ? appSettingsStore.get(key) : null; },
  async setSetting(key, value) { appSettingsStore.set(key, value); },
};

const grantedCosmetics = [];
const cosmeticUnlocksStub = {
  async grantCosmetic(userId, itemId, source) { grantedCosmetics.push({ userId, itemId, source }); },
};

const groupSignalsStub = {
  getActiveGroupIds() { return groupSignalsStub._ids || []; },
};

function evaluatorFor(localDbStub) {
  return load('src/data/badges/evaluator.ts', {
    '../../db/localDb': { localDb: localDbStub },
    '../../db/localDb.ts': { localDb: localDbStub },
    './badgeDefs': badgeDefsMod,
    './badgeDefs.ts': badgeDefsMod,
    '../cosmeticUnlocks': cosmeticUnlocksStub,
    '../cosmeticUnlocks.ts': cosmeticUnlocksStub,
    '../groupSignals': groupSignalsStub,
    '../groupSignals.ts': groupSignalsStub,
    '../appSettings': appSettingsStub,
    '../appSettings.ts': appSettingsStub,
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log('  PASS  ' + name);
    passed++;
  } catch (err) {
    console.log('  FAIL  ' + name + ' — ' + err.message);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

(async () => {
  console.log('\nTICKET-143 — badges/evaluator.test.js\n');

  const { BADGE_DEFS } = badgeDefsMod;
  const evaluatorNoop = evaluatorFor(makeStubLocalDb({
    workoutCount: 0, exercisePrCount: 0, totalVolumeKg: 0, streakDays: 0, generatedPlanStatus: null,
  }));
  const { evaluateBadges } = evaluatorNoop;

  const NOW = new Date('2026-07-03T12:00:00.000Z');

  await test('BADGE_DEFS has ~20 badges across all 6 categories', () => {
    assert(BADGE_DEFS.length >= 18 && BADGE_DEFS.length <= 24, 'expected ~20, got ' + BADGE_DEFS.length);
    const categories = new Set(BADGE_DEFS.map((b) => b.category));
    for (const c of ['workout_count', 'streak', 'pr_count', 'total_volume', 'group_participation', 'program_completion']) {
      assert(categories.has(c), 'missing category: ' + c);
    }
  });

  await test('every badge id is unique', () => {
    const ids = BADGE_DEFS.map((b) => b.id);
    eq(new Set(ids).size, ids.length, 'duplicate badge ids present:');
  });

  await test('evaluateBadges is pure: same inputs -> same outputs', () => {
    const metrics = {
      workoutCount: 10, streakWeeks: 0, prCount: 0, totalVolumeKg: 0,
      groupsJoined: 0, programsCompleted: 0,
    };
    const r1 = evaluateBadges(metrics, new Set(), NOW);
    const r2 = evaluateBadges(metrics, new Set(), NOW);
    eq(JSON.stringify(r1), JSON.stringify(r2), 'non-deterministic output:');
  });

  await test('threshold-crossing badges are returned; already-earned excluded', () => {
    const metrics = {
      workoutCount: 10, streakWeeks: 0, prCount: 0, totalVolumeKg: 0,
      groupsJoined: 0, programsCompleted: 0,
    };
    const result = evaluateBadges(metrics, new Set(), NOW);
    const ids = result.map((b) => b.badgeId);
    assert(ids.includes('workouts_1'), 'workouts_1 should be earned at 10 workouts');
    assert(ids.includes('workouts_10'), 'workouts_10 should be earned at 10 workouts');
    assert(!ids.includes('workouts_50'), 'workouts_50 should NOT be earned at 10 workouts');

    // Already-earned ids are never re-returned even though they still clear the threshold.
    const alreadyEarned = new Set(['workouts_1', 'workouts_10']);
    const result2 = evaluateBadges(metrics, alreadyEarned, NOW);
    const ids2 = result2.map((b) => b.badgeId);
    assert(!ids2.includes('workouts_1'), 'workouts_1 should be excluded once already earned');
    assert(!ids2.includes('workouts_10'), 'workouts_10 should be excluded once already earned');
  });

  await test('every BADGE_DEFS entry is reachable via SOME metrics snapshot', () => {
    const maxedMetrics = {
      workoutCount: 10_000, streakWeeks: 1000, prCount: 10_000,
      totalVolumeKg: 100_000_000, groupsJoined: 100, programsCompleted: 100,
    };
    const result = evaluateBadges(maxedMetrics, new Set(), NOW);
    const earnedIds = new Set(result.map((b) => b.badgeId));
    for (const def of BADGE_DEFS) {
      assert(earnedIds.has(def.id), 'badge unreachable at max metrics: ' + def.id);
    }
  });

  await test('cosmetic-grant badges carry cosmeticItemId through the result', () => {
    const metrics = {
      workoutCount: 100, streakWeeks: 0, prCount: 0, totalVolumeKg: 0,
      groupsJoined: 0, programsCompleted: 0,
    };
    const result = evaluateBadges(metrics, new Set(), NOW);
    const workouts100 = result.find((b) => b.badgeId === 'workouts_100');
    assert(workouts100, 'workouts_100 should be earned at 100 workouts');
    eq(workouts100.cosmeticItemId, 'hoodie', 'workouts_100 cosmetic grant:');
  });

  await test('earnedAt uses the passed `now`, never an internal clock read', () => {
    const metrics = { workoutCount: 1, streakWeeks: 0, prCount: 0, totalVolumeKg: 0, groupsJoined: 0, programsCompleted: 0 };
    const fixedNow = new Date('2020-01-01T00:00:00.000Z');
    const result = evaluateBadges(metrics, new Set(), fixedNow);
    assert(result.every((b) => b.earnedAt === fixedNow.toISOString()), 'earnedAt should equal the passed now ISO string');
  });

  await test('runBadgeEvaluation persists newly-earned badges + grants cosmetics (integration, stub DB)', async () => {
    grantedCosmetics.length = 0;
    const stubDb = makeStubLocalDb({
      workoutCount: 50, exercisePrCount: 0, totalVolumeKg: 0, streakDays: 0, generatedPlanStatus: null,
    });
    const executed = [];
    stubDb.execute = async (sql, params) => { executed.push({ sql, params }); };
    const ev = evaluatorFor(stubDb);
    const result = await ev.runBadgeEvaluation('local', NOW);
    const ids = result.newlyEarned.map((b) => b.badgeId);
    assert(ids.includes('workouts_50'), 'workouts_50 should be newly earned');
    assert(
      executed.some((e) => /INSERT OR IGNORE INTO badges_earned/.test(e.sql) && e.params[0] === 'workouts_50'),
      'badges_earned insert should have run for workouts_50',
    );
    assert(
      grantedCosmetics.some((g) => g.itemId === 'compression'),
      'compression cosmetic should have been granted for workouts_50',
    );
  });

  await test('retroactive grant perf: large synthetic history evaluates quickly', async () => {
    // Simulate "a large existing history" the way the real gatherBadgeMetrics
    // would see it AFTER aggregation (the DB does the O(n) work in a single
    // SQL aggregate; evaluateBadges itself is O(number of badges), not
    // O(history size) — this test proves that shape holds under a big number).
    const stubDb = makeStubLocalDb({
      workoutCount: 5000, exercisePrCount: 3000, totalVolumeKg: 50_000_000, streakDays: 400, generatedPlanStatus: 'trial_complete',
    });
    const ev = evaluatorFor(stubDb);
    const t0 = Date.now();
    for (let i = 0; i < 500; i++) {
      // Repeat the metrics-gather + pure-evaluate path 500x to approximate a
      // "large history, many repeated evaluations" perf budget rather than
      // relying on wall-clock timing of a single call (flaky on shared CI).
      const metrics = await ev.gatherBadgeMetrics();
      ev.evaluateBadges(metrics, new Set(), NOW);
    }
    const elapsedMs = Date.now() - t0;
    assert(elapsedMs < 2000, `500 evaluation passes took ${elapsedMs}ms, expected < 2000ms`);
  });

  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
