// pf_ticket134_coverage.js -- TICKET-134 full-catalog media coverage check.
// Run from mobile/:  node scripts/pf_ticket134_coverage.js
//
// The acceptance criterion for TICKET-134 is that EVERY exercise seeded into
// the server's `exercises` table (db/schema.sql, across both
// `INSERT INTO exercises (...) VALUES` blocks) has media coverage --
// i.e. getExerciseMedia() resolves it by normalized name -- so
// ExerciseDetailSheet always has primary/secondary muscles + cues to render,
// regardless of whether the exercise came from the on-device engine catalog
// (ENGINE_EXERCISE_MEDIA / RAW) or is a server-sourced Exercise row that only
// shares a name with a media-only entry (MEDIA_ONLY_RAW).
//
// This script does NOT re-parse exerciseCatalog.ts as TypeScript (that's
// pf_ticket134_check.js's job, which validates RAW's own field shape). It
// instead regex-extracts:
//   1. every seed exercise name from db/schema.sql's two
//      `INSERT INTO exercises (name, category, muscle_groups, is_compound)
//      VALUES (...)` blocks
//   2. every `name: '...'` key that exerciseCatalog.ts carries media for
//      (both the RAW engine-catalog block and the MEDIA_ONLY_RAW block --
//      grabbing every `name: '...'` occurrence in the file covers both,
//      since both blocks use the same `name: '...'` shape)
// normalizes both sides with the SAME algorithm as
// exerciseCatalog.ts's normalizeExerciseName(), and reports any seed
// exercise with zero media coverage. Exits nonzero if any are uncovered.

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd(); // expected: mobile/
const repoRoot = path.join(projectRoot, '..');
const schemaPath = path.join(repoRoot, 'db', 'schema.sql');
const catalogPath = path.join(projectRoot, 'src', 'lib', 'trainingEngine', 'exerciseCatalog.ts');

if (!fs.existsSync(schemaPath)) {
  console.error('FAIL: could not find db/schema.sql at ' + schemaPath);
  process.exit(1);
}
if (!fs.existsSync(catalogPath)) {
  console.error('FAIL: could not find exerciseCatalog.ts at ' + catalogPath);
  process.exit(1);
}

const schemaSrc = fs.readFileSync(schemaPath, 'utf8');
const catalogSrc = fs.readFileSync(catalogPath, 'utf8');

// -- 1. Extract seed exercise names from every
// -- INSERT INTO exercises (name, ...) VALUES ... ON CONFLICT (name) block --
const seedNames = [];
const insertBlockRe = /INSERT INTO exercises \(name[^)]*\)\s*VALUES\s*([\s\S]*?)\nON CONFLICT \(name\)/g;
let blockMatch;
let blockCount = 0;
while ((blockMatch = insertBlockRe.exec(schemaSrc))) {
  blockCount++;
  const body = blockMatch[1];
  // Row shape: ('Name', 'category', ARRAY[...], TRUE|FALSE)
  const rowRe = /\(\s*'((?:[^']|'')*)'\s*,\s*'\w+'\s*,\s*ARRAY\[/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(body))) {
    seedNames.push(rowMatch[1].replace(/''/g, "'"));
  }
}

if (blockCount === 0 || seedNames.length === 0) {
  console.error('FAIL: could not extract any seed exercise names from db/schema.sql');
  process.exit(1);
}

// -- 2. Extract every media-covered name from exerciseCatalog.ts --
const mediaNames = [];
const nameRe = /name:\s*'((?:[^'\\]|\\.)*)'/g;
let nameMatch;
while ((nameMatch = nameRe.exec(catalogSrc))) {
  mediaNames.push(nameMatch[1].replace(/\\'/g, "'"));
}

if (mediaNames.length === 0) {
  console.error('FAIL: could not extract any name: \'...\' entries from exerciseCatalog.ts');
  process.exit(1);
}

// -- Same normalization algorithm as normalizeExerciseName() in exerciseCatalog.ts --
function normalize(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const mediaNormSet = new Set(mediaNames.map(normalize));

const seedNormToOriginal = new Map();
for (const n of seedNames) {
  seedNormToOriginal.set(normalize(n), n);
}

const uncovered = [];
for (const [norm, original] of seedNormToOriginal) {
  if (!mediaNormSet.has(norm)) {
    uncovered.push(original);
  }
}

console.log('Seed blocks found: ' + blockCount);
console.log('Seed exercises (raw rows): ' + seedNames.length + ', unique: ' + seedNormToOriginal.size);
console.log('Media-covered names in exerciseCatalog.ts: ' + mediaNames.length + ', unique normalized: ' + mediaNormSet.size);

if (uncovered.length > 0) {
  console.log('\nUNCOVERED seed exercises (' + uncovered.length + '):');
  for (const u of uncovered) console.log('  - ' + u);
} else {
  console.log('\n0 uncovered seed exercises -- full coverage confirmed.');
}

process.exit(uncovered.length > 0 ? 1 : 0);
