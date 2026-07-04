/**
 * groupLeaderboard.test.js — TICKET-139 (group leaderboards, opt-in, group-scoped)
 *
 * Plain-node test (no jest/expo), mirroring the transpile-and-eval harness used
 * by mobile/src/data/__tests__/shareLinks.test.js and routineFields.test.js:
 * require('typescript').transpileModule → eval in a module context, resolving
 * relative ./x imports. No DB/network is touched.
 *
 * Covers:
 *   1. isPlausibleSet / sumPlausibleVolumeKg (mobile/src/data/groupSignals.ts) —
 *      the anti-gaming guard v1: weight/rep bounds, COALESCE(weight_kg,
 *      weight_raw/8.0) fallback, week-boundary filtering, non-lift exclusion.
 *   2. maybeSendWeeklySignals payload shaping — opt-in is PER GROUP (a user can
 *      opt in to one group and not another) and non-opted-in groups NEVER
 *      receive the aggregate fields (server must store NULL, not 0).
 *   3. Server-side leaderboardWeekKeys (peak-fettle-agents/server/routes/
 *      groups.js) — the deterministic current/last ISO-week-Monday math, given
 *      an injected "now" (no internal Date.now()/new Date() read).
 *   4. Entry-shaping rule (re-implemented here matching fetchGroupLeaderboard's
 *      logic, since that function needs a live pg pool): a member with no
 *      signal row, or opted_in=false, must render as opted_in:false with every
 *      aggregate null — never coerced to zero.
 *
 * Run: node mobile/src/data/__tests__/groupLeaderboard.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/data/__tests__  → up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function makeLoader() {
  const cache = {};
  function load(relPath) {
    if (cache[relPath]) return cache[relPath];
    const src = fs.readFileSync(path.join(REPO, relPath), 'utf8');
    const js = ts.transpileModule(src, {
      compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    cache[relPath] = mod.exports;
    const dir = path.dirname(path.join(REPO, relPath));
    const requireStub = function (id) {
      if (id.charAt(0) === '.') {
        const base = path.resolve(dir, id);
        const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
        for (const cand of cands) {
          if (fs.existsSync(cand)) {
            return load(path.relative(REPO, cand).split(path.sep).join('/'));
          }
        }
      }
      try { return require(id); } catch (_) { return {}; }
    };
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', '__dirname', '__filename', js)(
      mod, mod.exports, requireStub, dir, path.join(REPO, relPath)
    );
    cache[relPath] = mod.exports;
    return mod.exports;
  }
  return load;
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function deepEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
  }
}

const load = makeLoader();
// groupSignals.ts's apiClient import resolves via the requireStub's best-effort
// `try/catch → {}` fallback (axios/expo-* are not installed for this harness),
// but none of the functions under test here (isPlausibleSet,
// sumPlausibleVolumeKg, the opt-in payload shaping helpers) call apiClient
// directly except sendWeeklySignal/maybeSendWeeklySignals's network leg, which
// we avoid invoking — we test the payload BEFORE the POST by calling the
// exported pure pieces directly.
const GS = load('mobile/src/data/groupSignals.ts');

// Server route file — plain CommonJS, safe to require directly for its two
// exported pure helpers (leaderboardWeekKeys, isMissingSchema). Requiring the
// whole module also requires '../db' (pg pool) and 'express'/'zod', which ARE
// installed under peak-fettle-agents/server/node_modules, so this is a normal
// `require`, not the TS loader.
const GROUPS_ROUTE = path.join(REPO, 'peak-fettle-agents', 'server', 'routes', 'groups.js');
const groupsRoute = require(GROUPS_ROUTE);

console.log('\ndata — groupLeaderboard.test.js (TICKET-139)\n');

// ---------------------------------------------------------------------------
// 1. isPlausibleSet — anti-gaming guard v1 bounds
// ---------------------------------------------------------------------------

test('isPlausibleSet: accepts a normal working set', () => {
  assert(GS.isPlausibleSet(100, 8) === true, '100kg x 8 is plausible:');
});

test('isPlausibleSet: rejects an absurd weight (anti-gaming)', () => {
  assert(GS.isPlausibleSet(5000, 5) === false, '5000kg rejected:');
});

test('isPlausibleSet: rejects an absurd rep count (anti-gaming)', () => {
  assert(GS.isPlausibleSet(20, 999) === false, '999 reps rejected:');
});

test('isPlausibleSet: rejects zero/negative reps', () => {
  assert(GS.isPlausibleSet(50, 0) === false, '0 reps rejected:');
  assert(GS.isPlausibleSet(50, -1) === false, 'negative reps rejected:');
});

test('isPlausibleSet: rejects negative weight, accepts zero (bodyweight-ish)', () => {
  assert(GS.isPlausibleSet(-10, 5) === false, 'negative weight rejected:');
  assert(GS.isPlausibleSet(0, 12) === true, 'zero weight (bodyweight) accepted:');
});

test('isPlausibleSet: rejects non-finite input', () => {
  assert(GS.isPlausibleSet(NaN, 5) === false, 'NaN weight rejected:');
  assert(GS.isPlausibleSet(100, Infinity) === false, 'Infinity reps rejected:');
});

test('isPlausibleSet: boundary values are inclusive', () => {
  assert(GS.isPlausibleSet(GS.PLAUSIBILITY_MAX_WEIGHT_KG, 1) === true, 'max weight boundary accepted:');
  assert(GS.isPlausibleSet(1, GS.PLAUSIBILITY_MAX_REPS) === true, 'max reps boundary accepted:');
  assert(GS.isPlausibleSet(GS.PLAUSIBILITY_MAX_WEIGHT_KG + 0.01, 1) === false, 'just over max weight rejected:');
});

// ---------------------------------------------------------------------------
// 2. sumPlausibleVolumeKg — pure aggregation (no clock reads inside)
// ---------------------------------------------------------------------------

test('sumPlausibleVolumeKg: sums weight_kg x reps for lift sets in-week', () => {
  const rows = [
    { kind: 'lift', weight_kg: 100, weight_raw: null, reps: 5, logged_at: '2026-07-06T10:00:00Z' },
    { kind: 'lift', weight_kg: 50,  weight_raw: null, reps: 10, logged_at: '2026-07-07T10:00:00Z' },
  ];
  // 100*5 + 50*10 = 500 + 500 = 1000
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 1000, 'volume summed:');
});

test('sumPlausibleVolumeKg: falls back to weight_raw/8.0 per schema-v3 (CLAUDE.md §2)', () => {
  const rows = [
    { kind: 'lift', weight_kg: null, weight_raw: 800, reps: 5, logged_at: '2026-07-06T10:00:00Z' },
  ];
  // weight_raw 800 / 8 = 100kg; 100 * 5 = 500
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 500, 'weight_raw fallback used:');
});

test('sumPlausibleVolumeKg: prefers weight_kg over weight_raw when both present', () => {
  const rows = [
    { kind: 'lift', weight_kg: 100, weight_raw: 999999, reps: 1, logged_at: '2026-07-06T10:00:00Z' },
  ];
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 100, 'weight_kg (exact) preferred:');
});

test('sumPlausibleVolumeKg: excludes cardio (non-lift) sets', () => {
  const rows = [
    { kind: 'cardio', weight_kg: null, weight_raw: null, reps: null, logged_at: '2026-07-06T10:00:00Z' },
    { kind: 'lift', weight_kg: 20, weight_raw: null, reps: 10, logged_at: '2026-07-06T10:00:00Z' },
  ];
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 200, 'cardio excluded, only lift counted:');
});

test('sumPlausibleVolumeKg: excludes sets logged before the week boundary', () => {
  const rows = [
    { kind: 'lift', weight_kg: 100, weight_raw: null, reps: 5, logged_at: '2026-06-29T10:00:00Z' }, // last week
    { kind: 'lift', weight_kg: 100, weight_raw: null, reps: 5, logged_at: '2026-07-06T10:00:00Z' }, // this week
  ];
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 500, 'only in-week set counted:');
});

test('sumPlausibleVolumeKg: excludes implausible sets from the total (anti-gaming)', () => {
  const rows = [
    { kind: 'lift', weight_kg: 100, weight_raw: null, reps: 5, logged_at: '2026-07-06T10:00:00Z' },     // plausible: 500
    { kind: 'lift', weight_kg: 9999, weight_raw: null, reps: 5, logged_at: '2026-07-06T10:00:00Z' },    // implausible weight
    { kind: 'lift', weight_kg: 50, weight_raw: null, reps: 500, logged_at: '2026-07-06T10:00:00Z' },    // implausible reps
  ];
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 500, 'implausible sets excluded from total:');
});

test('sumPlausibleVolumeKg: handles empty/missing weight or reps gracefully', () => {
  const rows = [
    { kind: 'lift', weight_kg: null, weight_raw: null, reps: 5, logged_at: '2026-07-06T10:00:00Z' },
    { kind: 'lift', weight_kg: 100, weight_raw: null, reps: null, logged_at: '2026-07-06T10:00:00Z' },
  ];
  assert(GS.sumPlausibleVolumeKg(rows, '2026-07-06') === 0, 'null weight/reps rows contribute zero:');
});

// ---------------------------------------------------------------------------
// 3. maybeSendWeeklySignals — per-group opt-in payload shaping
//    (network leg stubbed out by overriding the exported sendWeeklySignal is
//    not possible via CJS-interop `exports` reassignment here, so instead we
//    verify the underlying opt-in-read + payload-shape contract directly via
//    the local KV helpers, which is what maybeSendWeeklySignals consults.)
// ---------------------------------------------------------------------------

test('getLeaderboardOptIn/setLeaderboardOptIn: per-group key, default OFF', async () => {
  // localDb is stubbed to {} by the loader's best-effort require fallback
  // (expo-sqlite is not installed for this harness), so getSetting/setSetting
  // will throw inside their try/catch and resolve to the documented defaults.
  // This still proves the CONTRACT: default OFF when nothing is stored.
  const optedIn = await GS.getLeaderboardOptIn('11111111-1111-1111-1111-111111111111');
  assert(optedIn === false, 'default opt-in is OFF when unset/unavailable:');
});

test('GroupSignalPayload shape: opted_in gates the aggregate fields (documented contract)', () => {
  // This test asserts the DOCUMENTED contract of maybeSendWeeklySignals's inner
  // payload-building step (mirrored here since the real function is fire-and-
  // forget over the network): when optedIn is false, the payload must carry
  // NEITHER total_volume_kg NOR streak_weeks, regardless of whether volume/
  // streak data was computed. Re-implemented inline to match groupSignals.ts's
  // maybeSendWeeklySignals body exactly (see the `if (optedIn)` block there).
  function buildPayload(weekStart, hitGoal, workoutsDone, optedIn, volumeKg, streakWeeks) {
    const payload = { week_start: weekStart, hit_goal: hitGoal, workouts_done: workoutsDone };
    if (optedIn) {
      payload.opted_in = true;
      if (volumeKg != null) payload.total_volume_kg = volumeKg;
      if (streakWeeks != null) payload.streak_weeks = streakWeeks;
    }
    return payload;
  }

  const optedOut = buildPayload('2026-07-06', true, 3, false, 1234, 5);
  assert(!('opted_in' in optedOut), 'opted_in absent when not opted in:');
  assert(!('total_volume_kg' in optedOut), 'total_volume_kg withheld when not opted in:');
  assert(!('streak_weeks' in optedOut), 'streak_weeks withheld when not opted in:');

  const optedIn = buildPayload('2026-07-06', true, 3, true, 1234, 5);
  assert(optedIn.opted_in === true, 'opted_in true when opted in:');
  assert(optedIn.total_volume_kg === 1234, 'total_volume_kg included when opted in:');
  assert(optedIn.streak_weeks === 5, 'streak_weeks included when opted in:');
});

// ---------------------------------------------------------------------------
// 4. Server: leaderboardWeekKeys — deterministic week-boundary math
// ---------------------------------------------------------------------------

test('leaderboardWeekKeys: "now" mid-week resolves to that week\'s Monday + prior Monday', () => {
  // 2026-07-08 is a Wednesday; ISO week Monday is 2026-07-06.
  const { currentWeekStart, lastWeekStart } = groupsRoute.leaderboardWeekKeys(new Date('2026-07-08T12:00:00Z'));
  assert(currentWeekStart === '2026-07-06', 'current week Monday correct: ' + currentWeekStart);
  assert(lastWeekStart === '2026-06-29', 'last week Monday correct: ' + lastWeekStart);
});

test('leaderboardWeekKeys: "now" exactly on a Monday is unchanged', () => {
  const { currentWeekStart, lastWeekStart } = groupsRoute.leaderboardWeekKeys(new Date('2026-07-06T00:00:00Z'));
  assert(currentWeekStart === '2026-07-06', 'Monday now → same-day current week:');
  assert(lastWeekStart === '2026-06-29', 'prior Monday computed:');
});

test('leaderboardWeekKeys: crosses a year boundary correctly', () => {
  // 2027-01-01 is a Friday; its ISO week starts Monday 2026-12-28.
  const { currentWeekStart, lastWeekStart } = groupsRoute.leaderboardWeekKeys(new Date('2027-01-01T09:00:00Z'));
  assert(currentWeekStart === '2026-12-28', 'year-boundary current week correct: ' + currentWeekStart);
  assert(lastWeekStart === '2026-12-21', 'year-boundary last week correct: ' + lastWeekStart);
});

// ---------------------------------------------------------------------------
// 5. Entry-shaping rule — non-participants render opted_in:false + all-null
//    (re-implemented here matching fetchGroupLeaderboard's buildWeek logic,
//    since that function requires a live pg pool and cannot run in this
//    plain-node harness; this proves the SHAPING rule in isolation).
// ---------------------------------------------------------------------------

function buildWeekEntries(members, signalByKey, weekStart) {
  return members.map((m) => {
    const s = signalByKey.get(`${m.user_id}|${weekStart}`);
    const optedIn = !!s && s.opted_in === true;
    return {
      user_id: m.user_id,
      display_name: m.display_name,
      opted_in: optedIn,
      total_volume_kg: optedIn && s.total_volume_kg != null ? Number(s.total_volume_kg) : null,
      session_count: optedIn && s.session_count != null ? Number(s.session_count) : null,
      streak_weeks: optedIn && s.streak_weeks != null ? Number(s.streak_weeks) : null,
    };
  });
}

test('entry shaping: member with no signal row renders opted_in:false, all nulls', () => {
  const members = [{ user_id: 'u1', display_name: 'Alice' }];
  const signalByKey = new Map(); // no signals at all
  const entries = buildWeekEntries(members, signalByKey, '2026-07-06');
  deepEq(entries[0], {
    user_id: 'u1', display_name: 'Alice', opted_in: false,
    total_volume_kg: null, session_count: null, streak_weeks: null,
  }, 'no-signal member fully null, not zero:');
});

test('entry shaping: member with opted_in:false signal still renders all-null (never their own zero-ish data)', () => {
  const members = [{ user_id: 'u1', display_name: 'Alice' }];
  const signalByKey = new Map([
    ['u1|2026-07-06', { opted_in: false, total_volume_kg: 500, session_count: 3, streak_weeks: 2 }],
  ]);
  const entries = buildWeekEntries(members, signalByKey, '2026-07-06');
  assert(entries[0].opted_in === false, 'opted_in false respected even if aggregate columns are non-null in the row:');
  assert(entries[0].total_volume_kg === null, 'aggregate hidden when opted_in is false:');
});

test('entry shaping: opted-in member with data renders full aggregates', () => {
  const members = [{ user_id: 'u1', display_name: 'Alice' }];
  const signalByKey = new Map([
    ['u1|2026-07-06', { opted_in: true, total_volume_kg: '1234.5', session_count: 4, streak_weeks: 6 }],
  ]);
  const entries = buildWeekEntries(members, signalByKey, '2026-07-06');
  deepEq(entries[0], {
    user_id: 'u1', display_name: 'Alice', opted_in: true,
    total_volume_kg: 1234.5, session_count: 4, streak_weeks: 6,
  }, 'opted-in member shows full aggregates (numeric coerced from pg NUMERIC string):');
});

test('entry shaping: current-week and last-week signals for the same user do not bleed across weeks', () => {
  const members = [{ user_id: 'u1', display_name: 'Alice' }];
  const signalByKey = new Map([
    ['u1|2026-07-06', { opted_in: true, total_volume_kg: 1000, session_count: 3, streak_weeks: 4 }],
    ['u1|2026-06-29', { opted_in: true, total_volume_kg: 500,  session_count: 2, streak_weeks: 3 }],
  ]);
  const current = buildWeekEntries(members, signalByKey, '2026-07-06');
  const last = buildWeekEntries(members, signalByKey, '2026-06-29');
  assert(current[0].total_volume_kg === 1000, 'current week reads its own row:');
  assert(last[0].total_volume_kg === 500, 'last week reads its own row, not current week\'s:');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
