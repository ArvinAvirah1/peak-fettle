/**
 * planLifecycle.test.js — engine-v2 Stage-2 lifecycle tests (plain node).
 *
 * Mirrors the transpile-and-eval harness used by
 * mobile/src/lib/trainingEngine/v2/__tests__/engineV2.test.js and
 * mobile/src/db/__tests__/migrations.test.js (no jest / no expo / no Babel):
 *   require('typescript').transpileModule → eval in a module context, resolving
 *   relative ./x imports the same way as the v2 engine suite.
 * Run:  node mobile/src/planGen/__tests__/planLifecycle.test.js
 *
 * Coverage (task section F):
 *   1. Trial state derivation across day-keys (mid-block, block boundary, end).
 *   2. Adoption regeneration determinism (same answers + split → identical plan).
 *   3. Meta-change patching + diff summary.
 *   4. Persistence round-trip against a stubbed db (plan + trial + lifecycle).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/planGen/__tests__  → up 4 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

// ---------------------------------------------------------------------------
// TS loader with relative-import resolution + injectable module stubs.
//   stubs: map of ABSOLUTE-ish module key (repo-relative path w/o ext, or a bare
//   specifier) → exports object. Used to stub localDb for the persistence test.
// ---------------------------------------------------------------------------
function makeLoader(stubs) {
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
        const rel = path.relative(REPO, base).split(path.sep).join('/');
        if (stubs && stubs[rel]) return stubs[rel];
        const cands = [base + '.ts', base + '.tsx', path.join(base, 'index.ts')];
        for (const cand of cands) {
          if (fs.existsSync(cand)) {
            return load(path.relative(REPO, cand).split(path.sep).join('/'));
          }
        }
      }
      if (stubs && stubs[id]) return stubs[id];
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

// ---------------------------------------------------------------------------
// In-memory stub for src/db/localDb (single-row generated_plans table).
// ---------------------------------------------------------------------------
function makeLocalDbStub() {
  const rows = {}; // id → row object
  return {
    genId: () => 'stub-' + Math.floor(1e9 * 0.5), // deterministic-ish; unused here
    localDb: {
      async init() {},
      async getFirst(sql, params) {
        // SELECT ... FROM generated_plans WHERE id = ?
        const id = params && params[0];
        const row = rows[id];
        if (!row) return null;
        if (/created_at/.test(sql) && /SELECT created_at/.test(sql)) {
          return { created_at: row.created_at ?? null };
        }
        return { ...row };
      },
      async getAll() { return []; },
      async execute(sql, params) {
        params = params || [];
        if (/^\s*INSERT INTO generated_plans/i.test(sql)) {
          // positional: id,user_id,kind,status,payload,survey,split,active_block,
          //             block_start_day_key,adopted_split,created_at,updated_at
          const [id, user_id, kind, status, payload, survey, split, active_block,
                 block_start_day_key, adopted_split, created_at, updated_at] = params;
          const existing = rows[id];
          rows[id] = {
            id, user_id, kind, status, payload, survey, split, active_block,
            block_start_day_key, adopted_split,
            created_at: existing ? existing.created_at : created_at,
            updated_at,
          };
          return;
        }
        const upd = sql.match(/UPDATE generated_plans SET ([\s\S]+?) WHERE id = \?/i);
        if (upd) {
          const id = params[params.length - 1];
          const row = rows[id];
          if (!row) return;
          // status update
          if (/status\s*=\s*'trial_complete'/.test(sql)) { row.status = 'trial_complete'; row.updated_at = params[0]; return; }
          if (/status\s*=\s*\?/.test(sql) && /updated_at\s*=\s*\?/.test(sql) && !/active_block/.test(sql)) {
            row.status = params[0]; row.updated_at = params[1]; return;
          }
          if (/active_block\s*=\s*\?/.test(sql)) { row.active_block = params[0]; row.updated_at = params[1]; return; }
          return;
        }
        if (/^\s*DELETE FROM generated_plans/i.test(sql)) {
          const id = params[0];
          delete rows[id];
          return;
        }
      },
    },
    _rows: rows,
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  PASS  ' + name); passed++; }
  catch (err) { console.log('  FAIL  ' + name + ' — ' + err.message); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

// ---------------------------------------------------------------------------
console.log('\nengine-v2 Stage 2 — planLifecycle.test.js\n');

(async () => {
  // Load pure modules (no db) with a plain loader.
  const load = makeLoader({});
  const trial = load('mobile/src/planGen/trialLifecycle.ts');
  const meta = load('mobile/src/planGen/metaChanges.ts');
  const gen = load('mobile/src/planGen/generateFromSurvey.ts');
  const surveyTypes = load('mobile/src/planGen/surveyTypes.ts');

  const BASE = surveyTypes.DEFAULT_SURVEY_ANSWERS;

  // ── 1. Trial state derivation across day-keys ──────────────────────────────
  await test('trial mid-block: day 4 of block 1 (PPL), not complete', () => {
    const p = trial.trialProgress('2026-07-01', '2026-07-04'); // +3 days → day 4
    eq(p.currentBlockIndex, 0, 'block:');
    eq(p.currentSplit, 'ppl', 'split:');
    eq(p.dayInBlock, 4, 'day-in-block:');
    eq(p.blockJustCompleted, false, 'not complete mid-block:');
    eq(p.allBlocksComplete, false, 'sequence not complete:');
  });

  await test('trial block-1 final day (day 21) prompts adoption', () => {
    const p = trial.trialProgress('2026-07-01', '2026-07-21'); // +20 days → day 21
    eq(p.currentBlockIndex, 0, 'still block 1:');
    eq(p.dayInBlock, 21, 'final day:');
    eq(p.blockJustCompleted, true, 'block just completed:');
    eq(p.allBlocksComplete, false, 'sequence not yet complete:');
  });

  await test('trial block boundary: day 22 → block 2 (upper_lower) day 1', () => {
    const p = trial.trialProgress('2026-07-01', '2026-07-22'); // +21 → next block day 1
    eq(p.currentBlockIndex, 1, 'advanced to block 2:');
    eq(p.currentSplit, 'upper_lower', 'split:');
    eq(p.dayInBlock, 1, 'day 1 of block 2:');
    eq(p.blockJustCompleted, false, 'fresh block not complete:');
  });

  await test('trial sequence complete after 63 days (all three blocks)', () => {
    const p = trial.trialProgress('2026-07-01', '2026-09-02'); // +63 days
    eq(p.allBlocksComplete, true, 'all blocks complete:');
    eq(p.currentBlockIndex, 2, 'clamped to last block:');
    eq(p.currentSplit, 'body_part', 'last split:');
    eq(p.blockJustCompleted, true, 'end state prompts:');
  });

  await test('trial progress is robust to a start date after today (clamps to day 1)', () => {
    const p = trial.trialProgress('2026-07-10', '2026-07-01'); // negative elapsed
    eq(p.daysElapsed, 0, 'clamped to 0:');
    eq(p.currentBlockIndex, 0, 'block 1:');
    eq(p.dayInBlock, 1, 'day 1:');
  });

  await test('daysBetween + parseDayKey pure maths', () => {
    eq(trial.daysBetween('2026-07-01', '2026-07-08'), 7, 'a week:');
    eq(trial.daysBetween('2026-07-08', '2026-07-01'), -7, 'reverse:');
    eq(trial.parseDayKey('not-a-date'), null, 'bad key → null:');
  });

  // ── 2. Adoption regeneration determinism ───────────────────────────────────
  await test('adoption regeneration: same answers + split → byte-identical plan', () => {
    const answers = { ...BASE, goal: 'hypertrophy', experienceLevel: 'intermediate', daysPerWeek: 4, sessionMinutes: 60, splitPreference: 'ppl' };
    const now = new Date('2026-07-02T00:00:00.000Z');
    const a = gen.generateFromSurvey({ ...answers, splitPreference: 'upper_lower' }, 'u1', { now });
    const b = gen.generateFromSurvey({ ...answers, splitPreference: 'upper_lower' }, 'u1', { now });
    eq(a.kind, 'plan', 'forcing a split yields a plan:');
    eq(JSON.stringify(a.plan.weeks), JSON.stringify(b.plan.weeks), 'regenerated plans differ:');
    eq(a.plan.splitPreference, 'upper_lower', 'forced split honoured:');
  });

  await test("adopting from a trial survey (unsure) with a forced split yields that split's plan", () => {
    const answers = { ...BASE, goal: 'hypertrophy', experienceLevel: 'novice', daysPerWeek: 3, sessionMinutes: 60, splitPreference: 'unsure' };
    const now = new Date('2026-07-02T00:00:00.000Z');
    const res = gen.generateFromSurvey({ ...answers, splitPreference: 'body_part' }, 'u2', { now });
    eq(res.kind, 'plan', 'forced split → single plan (not a trial):');
    eq(res.plan.splitPreference, 'body_part', 'body_part adopted:');
  });

  // ── 3. Meta-change patching + diff summary ─────────────────────────────────
  await test('applyMetaChange folds only the patched fields (pure, no mutation)', () => {
    const before = { ...BASE, daysPerWeek: 4, sessionMinutes: 60, knobs: { failureProximity: 'balanced', progressionSpeed: 'balanced', deloadFrequency: 'standard' } };
    const after = meta.applyMetaChange(before, { daysPerWeek: 5, progressionSpeed: 'aggressive' });
    eq(after.daysPerWeek, 5, 'days patched:');
    eq(after.knobs.progressionSpeed, 'aggressive', 'progression patched:');
    eq(after.sessionMinutes, 60, 'untouched field preserved:');
    eq(before.daysPerWeek, 4, 'original not mutated:');
    eq(before.knobs.progressionSpeed, 'balanced', 'original knobs not mutated:');
  });

  await test('diffSummary produces human lines for each change', () => {
    const before = { ...BASE, daysPerWeek: 4, splitPreference: 'ppl' };
    const after = meta.applyMetaChange(before, { daysPerWeek: 5, splitPreference: 'upper_lower' });
    const lines = meta.diffSummary(before, after);
    assert(lines.length >= 2, 'expected ≥2 diff lines, got ' + lines.length);
    assert(lines.some((l) => /Days per week: 4 → 5/.test(l.text)), 'days diff line missing');
    assert(lines.some((l) => /Split:/.test(l.text) && /Upper/.test(l.text)), 'split diff line missing');
  });

  await test('diffSummary is empty for a no-op patch + hasAnyChange is false', () => {
    const before = { ...BASE, daysPerWeek: 4 };
    const after = meta.applyMetaChange(before, { daysPerWeek: 4 });
    eq(meta.diffSummary(before, after).length, 0, 'no diff for no-op:');
    eq(meta.hasAnyChange(before, { daysPerWeek: 4 }), false, 'hasAnyChange false:');
    eq(meta.hasAnyChange(before, { daysPerWeek: 6 }), true, 'hasAnyChange true on real change:');
  });

  await test('excluded-exercise meta-change is captured + regenerates deterministically', () => {
    const before = { ...BASE, goal: 'hypertrophy', experienceLevel: 'intermediate', daysPerWeek: 4, sessionMinutes: 60, splitPreference: 'ppl', excludedExerciseIds: [] };
    const after = meta.applyMetaChange(before, { excludedExerciseIds: ['ex_deadbeef'] });
    eq(JSON.stringify(after.excludedExerciseIds), JSON.stringify(['ex_deadbeef']), 'exclusion stored:');
    const now = new Date('2026-07-02T00:00:00.000Z');
    const a = gen.generateFromSurvey(after, 'u3', { now });
    const b = gen.generateFromSurvey(after, 'u3', { now });
    eq(JSON.stringify(a.plan.weeks), JSON.stringify(b.plan.weeks), 'excluded regen not deterministic:');
  });

  // ── 4. Persistence round-trip against a stubbed db ─────────────────────────
  await test('planStore round-trip: save a single plan and load it back', async () => {
    const dbStub = makeLocalDbStub();
    const loadS = makeLoader({ 'mobile/src/db/localDb': dbStub });
    const store = loadS('mobile/src/planGen/planStore.ts');

    const answers = { ...BASE, goal: 'hypertrophy', splitPreference: 'ppl', daysPerWeek: 4, sessionMinutes: 60 };
    const res = gen.generateFromSurvey({ ...answers }, 'u9', { now: new Date('2026-07-02T00:00:00.000Z') });
    assert(res.kind === 'plan', 'need a plan for this test');

    const saved = await store.saveActivePlan(
      { userId: 'u9', plan: res.plan, survey: answers, status: 'plan_saved' },
      new Date('2026-07-02T10:00:00.000Z'),
    );
    eq(saved.kind, 'plan', 'stored kind:');
    eq(saved.status, 'plan_saved', 'stored status:');
    eq(saved.split, 'ppl', 'stored split:');

    const loaded = await store.loadActivePlan();
    assert(loaded, 'should reload');
    eq(loaded.kind, 'plan', 'reloaded kind:');
    eq(loaded.survey.splitPreference, 'ppl', 'survey survives round-trip:');
    eq(JSON.stringify(loaded.plan.weeks), JSON.stringify(res.plan.weeks), 'plan payload survives:');

    // status transition
    const adopted = await store.updateStatus('plan_adopted', new Date('2026-07-02T11:00:00.000Z'));
    eq(adopted.status, 'plan_adopted', 'status updated:');

    // discard
    await store.clearActivePlan();
    eq(await store.loadActivePlan(), null, 'cleared → null:');
  });

  await test('planStore round-trip: trial sequence + advanceTrialBlock lifecycle', async () => {
    const dbStub = makeLocalDbStub();
    const loadS = makeLoader({ 'mobile/src/db/localDb': dbStub });
    const store = loadS('mobile/src/planGen/planStore.ts');

    const answers = { ...BASE, goal: 'hypertrophy', splitPreference: 'unsure', daysPerWeek: 4, sessionMinutes: 60 };
    const res = gen.generateFromSurvey({ ...answers }, 'u10', { now: new Date('2026-07-02T00:00:00.000Z') });
    assert(res.kind === 'trial', 'need a trial sequence');

    const saved = await store.saveActiveTrial(
      { userId: 'u10', sequence: res.sequence, survey: answers, startDayKey: '2026-07-02' },
      new Date('2026-07-02T09:00:00.000Z'),
    );
    eq(saved.kind, 'trial', 'stored trial kind:');
    eq(saved.status, 'trial_active', 'trial active:');
    eq(saved.activeBlock, 0, 'block 0 active:');
    eq(saved.blockStartDayKey, '2026-07-02', 'start day-key stored:');

    // advance block 0 → 1
    const b1 = await store.advanceTrialBlock(new Date('2026-07-23T00:00:00.000Z'));
    eq(b1.activeBlock, 1, 'advanced to block 1:');
    eq(b1.status, 'trial_active', 'still active:');
    // advance 1 → 2
    const b2 = await store.advanceTrialBlock(new Date('2026-08-13T00:00:00.000Z'));
    eq(b2.activeBlock, 2, 'advanced to block 2:');
    // advance 2 → complete
    const done = await store.advanceTrialBlock(new Date('2026-09-03T00:00:00.000Z'));
    eq(done.status, 'trial_complete', 'sequence complete after last block:');
  });

  // ---------------------------------------------------------------------------
  console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
  if (failed > 0) process.exit(1);
})();
