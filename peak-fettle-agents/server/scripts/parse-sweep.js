#!/usr/bin/env node
/**
 * parse-sweep.js — CI gate for Peak Fettle
 *
 * Checks every JS/TS/TSX/JSX file for:
 *   - Null bytes (OneDrive corruption signature)
 *   - Babel parse errors (jsx + typescript plugins)
 *   - node --check syntax errors (server .js files only)
 *
 * Usage (from repo root):
 *   node peak-fettle-agents/server/scripts/parse-sweep.js
 *   node peak-fettle-agents/server/scripts/parse-sweep.js --paths mobile/app,mobile/src
 *
 * Exit 0 if clean, exit 1 if any failures.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SCRIPT_DIR = __dirname;
// script lives at peak-fettle-agents/server/scripts/ — three levels up = repo root
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..');

// Resolve @babel/parser from mobile/node_modules (not installed at repo root)
const BABEL_PARSER_PATH = path.join(REPO_ROOT, 'mobile', 'node_modules', '@babel', 'parser');
let babelParser;
try {
  babelParser = require(BABEL_PARSER_PATH);
} catch (e) {
  console.error(`ERROR: Could not load @babel/parser from ${BABEL_PARSER_PATH}`);
  console.error('Run: npm ci --prefix mobile');
  process.exit(2);
}

// Parse --paths argument (comma-separated, relative to repo root)
const argsRaw = process.argv.slice(2);
let scanDirs;
const pathsFlag = argsRaw.find(a => a.startsWith('--paths=') || a === '--paths');
if (pathsFlag) {
  const val = pathsFlag.includes('=')
    ? pathsFlag.split('=').slice(1).join('=')
    : argsRaw[argsRaw.indexOf('--paths') + 1];
  scanDirs = val.split(',').map(p => path.resolve(REPO_ROOT, p.trim()));
} else {
  scanDirs = [
    path.join(REPO_ROOT, 'mobile', 'app'),
    path.join(REPO_ROOT, 'mobile', 'src'),
    path.join(REPO_ROOT, 'peak-fettle-agents', 'server'),
    // LIFEOS TICKET-101 #6 — Life OS app surface
    path.join(REPO_ROOT, 'lifeos', 'app'),
    path.join(REPO_ROOT, 'lifeos', 'src'),
    path.join(REPO_ROOT, 'lifeos', 'plugins'),
    path.join(REPO_ROOT, 'lifeos', 'targets'),
    path.join(REPO_ROOT, 'lifeos', '__tests__'),
  ];
}

const SERVER_DIR = path.join(REPO_ROOT, 'peak-fettle-agents', 'server');

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

const BABEL_EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', '__pycache__']);

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
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile() && BABEL_EXTS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkNullBytes(filePath, src) {
  if (src.includes('\0')) {
    return 'contains null bytes (OneDrive corruption)';
  }
  return null;
}

function checkBabel(filePath, src) {
  const ext = path.extname(filePath);
  const plugins = ['jsx', 'typescript'];
  // Add decorators for files that commonly use them
  plugins.push(['decorators', { decoratorsBeforeExport: true }]);
  try {
    babelParser.parse(src, {
      sourceType: 'module',
      plugins,
      strictMode: false,
      errorRecovery: false,
    });
    return null;
  } catch (e) {
    return `parse error: ${e.message}`;
  }
}

function checkNodeSyntax(filePath) {
  // Only run node --check on server .js files
  if (path.extname(filePath) !== '.js') return null;
  if (!filePath.startsWith(SERVER_DIR)) return null;
  try {
    execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
    return null;
  } catch (e) {
    const msg = (e.stderr || e.stdout || '').toString().trim().split('\n')[0];
    return `node --check: ${msg}`;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const failures = [];
let totalFiles = 0;

for (const dir of scanDirs) {
  if (!fs.existsSync(dir)) {
    console.warn(`WARNING: scan path does not exist, skipping: ${dir}`);
    continue;
  }
  const files = walk(dir);
  for (const filePath of files) {
    totalFiles++;
    let src;
    try {
      src = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      failures.push({ file: filePath, reason: `could not read: ${e.message}` });
      continue;
    }

    const nullErr = checkNullBytes(filePath, src);
    if (nullErr) {
      failures.push({ file: filePath, reason: nullErr });
      continue; // no point parsing a null-byte file
    }

    const babelErr = checkBabel(filePath, src);
    if (babelErr) {
      failures.push({ file: filePath, reason: babelErr });
    }

    const nodeErr = checkNodeSyntax(filePath);
    if (nodeErr && !babelErr) {
      // Only report node --check if babel didn't already flag it
      failures.push({ file: filePath, reason: nodeErr });
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length === 0) {
  console.log(`parse-sweep: scanned ${totalFiles} files — All clean.`);
  process.exit(0);
} else {
  console.error(`parse-sweep: ${failures.length} FAILED file(s) out of ${totalFiles} scanned:\n`);
  for (const f of failures) {
    const rel = path.relative(REPO_ROOT, f.file);
    console.error(`  FAIL  ${rel}`);
    console.error(`        ${f.reason}`);
  }
  console.error(`\nTotal failures: ${failures.length}`);
  process.exit(1);
}
