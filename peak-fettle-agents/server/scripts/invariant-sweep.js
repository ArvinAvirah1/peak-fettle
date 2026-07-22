#!/usr/bin/env node
/**
 * invariant-sweep.js — CI gate for the two most-repeated P0 bug classes.
 *
 * Check 1 — LOCAL-FIRST: screens (mobile/app) and shared components
 *   (mobile/src/components) must not VALUE-import from mobile/src/api/*
 *   unless the file is in the audited allowlist below. Free users make zero
 *   personal REST calls; every allowlisted file has been audited to branch on
 *   isLocalFirst() (tierPolicy.ts) before touching the network. Type-only
 *   imports (`import type { X } from '../api/y'`) are always allowed — they
 *   cannot make a network call.
 *
 *   Adding a NEW screen/component that imports api/*? Route it through the
 *   tier-branched data layer (mobile/src/data/*, the useWorkout / useStreak /
 *   useInsights/useHealthMetrics hooks) instead. If it genuinely needs a raw
 *   api import (Pro-only surface), audit the isLocalFirst branching and add
 *   the file to LOCAL_FIRST_AUDITED below with a comment.
 *
 * Check 2 — UNITS: weight/length conversion factors must never be inlined.
 *   All conversion goes through mobile/src/constants/units.ts (the 185 lb →
 *   185 kg incident, and the 186.7 → 186.75 display-rounding incident, were
 *   both inlined-math bugs). Banned literals outside units.ts: 2.20462,
 *   2.2046, 0.45359, 453.592, 2.54. (The legacy `weight_raw / 8` COALESCE
 *   read path is intentionally NOT banned — it is the documented fallback.)
 *
 * Usage (from repo root):
 *   node peak-fettle-agents/server/scripts/invariant-sweep.js
 *
 * Exit 0 if clean, exit 1 if any violations.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Resolve @babel/parser from mobile/node_modules (same trick as parse-sweep.js)
const BABEL_PARSER_PATH = path.join(REPO_ROOT, 'mobile', 'node_modules', '@babel', 'parser');
let babelParser;
try {
  babelParser = require(BABEL_PARSER_PATH);
} catch (e) {
  console.error(`ERROR: Could not load @babel/parser from ${BABEL_PARSER_PATH}`);
  console.error('Run: npm ci --prefix mobile');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Check 1 config — audited files allowed to value-import from api/*
// (audit date 2026-07-21; every entry verified to branch on isLocalFirst or to
// be a Pro/account-only surface). Paths are repo-relative, forward slashes.
// ---------------------------------------------------------------------------

const LOCAL_FIRST_AUDITED = new Set([
  // -- screens --
  'mobile/app/_layout.tsx',
  'mobile/app/(tabs)/index.tsx',
  'mobile/app/(tabs)/plans.tsx',
  'mobile/app/(tabs)/profile.tsx',
  'mobile/app/(tabs)/rankings.tsx',
  'mobile/app/csv-import.tsx',
  'mobile/app/data-export.tsx',
  'mobile/app/exercise-library.tsx',
  'mobile/app/health-metrics.tsx',
  'mobile/app/insights.tsx',
  'mobile/app/onboarding.tsx',
  'mobile/app/progress.tsx',
  'mobile/app/templates.tsx',
  'mobile/app/workout-day.tsx',
  'mobile/app/workout-history.tsx',
  // -- shared components --
  'mobile/src/components/ExercisePicker.tsx',
  'mobile/src/components/LiftProgressChart.tsx',
  'mobile/src/components/MuscleHeatmap.tsx',
  'mobile/src/components/ReadinessCard.tsx',
  'mobile/src/components/RoutineStrip.tsx',
  'mobile/src/components/SetEntryForm.tsx',
  'mobile/src/components/WorkoutLoggerHost.tsx',
]);

const LOCAL_FIRST_SCAN_DIRS = [
  path.join(REPO_ROOT, 'mobile', 'app'),
  path.join(REPO_ROOT, 'mobile', 'src', 'components'),
];

// ---------------------------------------------------------------------------
// Check 2 config — conversion-factor literals banned outside units.ts
// ---------------------------------------------------------------------------

const UNITS_FILE = path.join(REPO_ROOT, 'mobile', 'src', 'constants', 'units.ts');
const UNITS_SCAN_DIRS = [
  path.join(REPO_ROOT, 'mobile', 'app'),
  path.join(REPO_ROOT, 'mobile', 'src'),
];
// Digit guards keep unrelated numbers (e.g. -2.549732… in strengthModelV3's
// polynomial coefficients) from false-positiving.
const BANNED_FACTOR_RE = /(?<![\d.])(?:2\.20462|2\.2046|0\.45359\d*|453\.592|2\.54)(?![\d])/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '__tests__', '__mocks__']);

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && EXTS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

function parseImports(src) {
  const ast = babelParser.parse(src, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript', ['decorators', { decoratorsBeforeExport: true }]],
    strictMode: false,
  });
  return ast.program.body.filter((n) => n.type === 'ImportDeclaration');
}

function isTypeOnly(decl) {
  if (decl.importKind === 'type') return true;
  return (
    decl.specifiers.length > 0 &&
    decl.specifiers.every((s) => s.importKind === 'type')
  );
}

// Matches the REST-client directory (…/api/client, …/api/workouts, …) but NOT
// mobile/src/types/api.ts, which is a pure type-definitions module.
const API_SOURCE_RE = /(^|\/)api\//;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const violations = [];
let scanned = 0;

// Check 1 — local-first api imports
for (const dir of LOCAL_FIRST_SCAN_DIRS) {
  for (const file of walk(dir)) {
    scanned++;
    const src = fs.readFileSync(file, 'utf8');
    let decls;
    try {
      decls = parseImports(src);
    } catch (e) {
      violations.push({ file, line: 0, reason: `could not parse: ${e.message}` });
      continue;
    }
    for (const decl of decls) {
      if (!API_SOURCE_RE.test(decl.source.value)) continue;
      if (isTypeOnly(decl)) continue;
      if (LOCAL_FIRST_AUDITED.has(rel(file))) continue;
      violations.push({
        file,
        line: decl.loc.start.line,
        reason:
          `LOCAL-FIRST: value-import from '${decl.source.value}' outside the data layer. ` +
          `Free users make ZERO personal REST calls — use the tier-branched data layer ` +
          `(mobile/src/data/*, useWorkout*/useStreak/useInsights hooks) instead. ` +
          `If this surface is genuinely Pro-only and audited for isLocalFirst branching, ` +
          `add it to LOCAL_FIRST_AUDITED in invariant-sweep.js with a comment.`,
      });
    }
  }
}

// Check 2 — inlined unit-conversion factors
for (const dir of UNITS_SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (path.resolve(file) === path.resolve(UNITS_FILE)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (BANNED_FACTOR_RE.test(lines[i])) {
        violations.push({
          file,
          line: i + 1,
          reason:
            `UNITS: inlined conversion factor. All weight/length conversion must go ` +
            `through mobile/src/constants/units.ts (kgToLbs, lbsToKg, cmToIn, inToCm, ` +
            `formatSetWeight, …). Inlined math caused the 185 lb → 185 kg P0.`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (violations.length === 0) {
  console.log(`invariant-sweep: scanned ${scanned} files — All clean.`);
  process.exit(0);
} else {
  console.error(`invariant-sweep: ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  FAIL  ${rel(v.file)}:${v.line}`);
    console.error(`        ${v.reason}\n`);
  }
  process.exit(1);
}
