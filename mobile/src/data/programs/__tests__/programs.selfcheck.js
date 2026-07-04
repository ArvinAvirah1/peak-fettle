/**
 * programs.selfcheck.js — TICKET-132 self-check (plain node, no jest/expo).
 *
 * Mirrors the transpile-and-eval harness used by
 * mobile/src/data/__tests__/routineFields.test.js: require('typescript')
 * .transpileModule → eval in a module context, resolving relative ./x
 * imports. This lets us load the actual .ts program modules (no separate
 * hand-copied fixture data) and run them through the SAME allowlist used by
 * routine import / local-DB reads.
 *
 * Run: node mobile/src/data/programs/__tests__/programs.selfcheck.js
 *
 * Checks, per spec's "validate every program JSON parses and passes the
 * routineExerciseFields allowlist":
 *   1. Every program module parses/transpiles and loads without throwing.
 *   2. Every program has the required Program shape (id/name/subtitle/
 *      daysPerWeek/level/progressionStyle/progressionLabel/days/source_notes),
 *      source_notes is non-empty prose (spec: "documenting the progression
 *      rules encoded").
 *   3. Every exercise in every day round-trips through allowlistExercise with
 *      ZERO fields silently dropped (i.e. the hand-authored JSON is already
 *      allowlist-clean — this is what "validated through the
 *      routineExerciseFields.ts allowlist" means for static bundled data).
 *   4. No duplicate program ids; no duplicate day names within one program
 *      (mapWeekToRoutines-equivalent adoption creates one routine per day
 *      name — a duplicate name would silently collide).
 *   5. IDs are distinct from the existing bundled beginner program ids
 *      (ppl-3 / ppl-6 / upper-lower-4) — this shelf must not shadow them.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// __dirname = <repo>/mobile/src/data/programs/__tests__ → up 5 = <repo>
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
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
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

const load = makeLoader();
const fields = load('mobile/src/data/routineExerciseFields.ts');
const programsIndex = load('mobile/src/data/programs/index.ts');

console.log('\ndata/programs — programs.selfcheck.js\n');

const PROGRAM_FILES = [
  'lp4dayT1t2t3', 'wave531ThreeDay', 'ppl6day', 'highFreq5day',
  'novaLp3day', 'upperLower4day', 'minimalist2day',
];

// ── 1. Every program module parses/loads ────────────────────────────────────
const loadedPrograms = [];
for (const f of PROGRAM_FILES) {
  test(`loads: ${f}.ts`, () => {
    const mod = load(`mobile/src/data/programs/${f}.ts`);
    assert(mod && mod.default, 'module has a default export');
    loadedPrograms.push(mod.default);
  });
}

// ── 2. Program shape + source_notes ─────────────────────────────────────────
const REQUIRED_KEYS = [
  'id', 'name', 'subtitle', 'daysPerWeek', 'level',
  'progressionStyle', 'progressionLabel', 'days', 'source_notes',
];
for (const p of loadedPrograms) {
  test(`shape: ${p && p.id}`, () => {
    for (const k of REQUIRED_KEYS) {
      assert(p[k] !== undefined && p[k] !== null && p[k] !== '', `missing/empty field "${k}"`);
    }
    assert(Array.isArray(p.days) && p.days.length > 0, 'has at least 1 day');
    assert(typeof p.source_notes === 'string' && p.source_notes.length >= 80,
      'source_notes is substantial documentation (>=80 chars)');
    assert(typeof p.daysPerWeek === 'number' && p.daysPerWeek >= 1 && p.daysPerWeek <= 7,
      'daysPerWeek in 1..7');
    assert(['beginner', 'intermediate', 'advanced'].includes(p.level), 'level is a known band');
    assert(['linear', 'wave', 'dup', 'block'].includes(p.progressionStyle), 'progressionStyle is a known style');
  });
}

// ── 3. Every exercise allowlist-round-trips with NOTHING silently dropped ────
for (const p of loadedPrograms) {
  test(`allowlist round-trip (no silent drops): ${p.id}`, () => {
    for (const day of p.days) {
      assert(typeof day.slug === 'string' && day.slug.length > 0, `${p.id}: day missing slug`);
      assert(typeof day.name === 'string' && day.name.length > 0, `${p.id}: day missing name`);
      assert(Array.isArray(day.exercises) && day.exercises.length > 0, `${p.id}/${day.slug}: no exercises`);
      for (const ex of day.exercises) {
        const out = fields.allowlistExercise(ex);
        // Base fields must survive untouched.
        eq(out.name, ex.name, `${p.id}/${day.slug}: name dropped/changed for "${ex.name}"`);
        if (ex.target_sets !== undefined) {
          eq(out.target_sets, ex.target_sets, `${p.id}/${day.slug}/${ex.name}: target_sets dropped`);
        }
        if (ex.target_reps !== undefined) {
          eq(out.target_reps, ex.target_reps, `${p.id}/${day.slug}/${ex.name}: target_reps dropped`);
        }
        // S2 fields, when present in source, must survive the allowlist bounds
        // exactly (proves the authored JSON is already allowlist-clean).
        if (ex.superset_group !== undefined) {
          eq(out.superset_group, ex.superset_group, `${p.id}/${day.slug}/${ex.name}: superset_group dropped by allowlist (out of bounds!)`);
        }
        if (ex.superset_rounds !== undefined) {
          eq(out.superset_rounds, ex.superset_rounds, `${p.id}/${day.slug}/${ex.name}: superset_rounds dropped by allowlist (out of bounds!)`);
        }
        if (ex.dropset !== undefined) {
          assert(out.dropset !== undefined, `${p.id}/${day.slug}/${ex.name}: dropset dropped entirely by allowlist (out of bounds!)`);
          eq(out.dropset.last_n, ex.dropset.last_n, `${p.id}/${day.slug}/${ex.name}: dropset.last_n changed`);
          if (ex.dropset.drops !== undefined) {
            eq(out.dropset.drops, ex.dropset.drops, `${p.id}/${day.slug}/${ex.name}: dropset.drops dropped by allowlist (out of bounds!)`);
          }
          if (ex.dropset.drop_pct !== undefined) {
            eq(out.dropset.drop_pct, ex.dropset.drop_pct, `${p.id}/${day.slug}/${ex.name}: dropset.drop_pct dropped by allowlist (out of bounds!)`);
          }
        }
      }
    }
  });
}

// ── 4. No duplicate program ids; no duplicate day names within a program ────
test('no duplicate program ids', () => {
  const ids = loadedPrograms.map((p) => p.id);
  const uniq = new Set(ids);
  eq(uniq.size, ids.length, `duplicate ids found: ${JSON.stringify(ids)}`);
});

for (const p of loadedPrograms) {
  test(`no duplicate day names within program: ${p.id}`, () => {
    const names = p.days.map((d) => d.name);
    const uniq = new Set(names);
    eq(uniq.size, names.length, `duplicate day names in ${p.id}: ${JSON.stringify(names)}`);
  });
}

// ── 5. Shelf ids don't collide with the existing bundled beginner ids ───────
test('shelf program ids do not collide with beginnerTemplates.ts bundled ids', () => {
  const beginnerIds = ['ppl-3', 'ppl-6', 'upper-lower-4'];
  const shelfIds = loadedPrograms.map((p) => p.id);
  for (const id of beginnerIds) {
    assert(!shelfIds.includes(id), `shelf id collides with existing bundled beginner program "${id}"`);
  }
});

// ── 6. index.ts loads, sanitizes, and exposes exactly the 7 programs ────────
test('index.ts: listPrograms() returns all 7 sanitized programs, no throw', () => {
  const list = programsIndex.listPrograms();
  eq(list.length, 7, 'exactly 7 shelf programs exposed');
  for (const p of list) {
    assert(typeof p.id === 'string' && p.id.length > 0, 'sanitized program has an id');
  }
});

test('index.ts: getProgram/getProgramPreviewDay work for every id', () => {
  const list = programsIndex.listPrograms();
  for (const p of list) {
    const found = programsIndex.getProgram(p.id);
    assert(found && found.id === p.id, `getProgram(${p.id}) round-trips`);
    const preview = programsIndex.getProgramPreviewDay(p);
    assert(preview && Array.isArray(preview.exercises) && preview.exercises.length > 0,
      `getProgramPreviewDay(${p.id}) returns a non-empty day`);
  }
});

test('index.ts: BEGINNER_SHELF_LINK points at the existing bundled section (not a duplicate Program)', () => {
  const link = programsIndex.BEGINNER_SHELF_LINK;
  assert(link && link.id === 'beginner-programs-link', 'link id present');
  assert(!('days' in link), 'link card carries no days/exercises of its own (not a duplicate program)');
});

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
