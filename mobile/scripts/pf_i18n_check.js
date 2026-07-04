/**
 * pf_i18n_check.js — TICKET-146 CI-able i18n checks.
 *
 * 1. KEY CHECK (always): every literal t('ns:dot.path') / i18n key used under
 *    mobile/app + mobile/src must exist in the EN bundles. Exit 1 on misses.
 * 2. RAW-LITERAL LINT: JSXText containing letters = an unextracted string.
 *      node scripts/pf_i18n_check.js --files a.tsx b.tsx   → exit 1 on hits (per-batch gate)
 *      node scripts/pf_i18n_check.js                       → repo-wide COUNT report only
 *    (repo-wide stays informational until every extraction batch has landed;
 *    flip REPO_WIDE_STRICT to true at that point to make CI enforce it).
 */

'use strict';

const REPO_WIDE_STRICT = false; // 11 residuals: diagnostics.tsx (dev tool, excluded by design) + unit-string exemptions — flip to true once those are resolved/allowlisted

const fs = require('fs');
const path = require('path');
const parser = require(path.join(process.cwd(), 'node_modules', '@babel', 'parser'));

const EN_DIR = path.join('src', 'i18n', 'locales', 'en');

function flatten(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out.add(key);
  }
  return out;
}

const known = new Set();
for (const f of fs.readdirSync(EN_DIR)) {
  if (!f.endsWith('.json')) continue;
  const ns = f.replace(/\.json$/, '');
  const nsKeys = flatten(JSON.parse(fs.readFileSync(path.join(EN_DIR, f), 'utf8')), '', new Set());
  for (const k of nsKeys) known.add(`${ns}:${k}`);
}

function walkDir(d, files) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walkDir(p, files); }
    else if (/\.(ts|tsx)$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p);
  }
  return files;
}

const argFiles = process.argv.indexOf('--files');
const targets = argFiles !== -1 ? process.argv.slice(argFiles + 1) : walkDir('app', walkDir('src', []));

const KEY_RE = /\bt\(\s*['"`]([a-z0-9_]+:[A-Za-z0-9_.\-]+)['"`]/g;

let missingKeys = 0;
let rawLiterals = 0;
const rawByFile = new Map();

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'range', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens']);

for (const file of targets) {
  const src = fs.readFileSync(file, 'utf8');

  KEY_RE.lastIndex = 0;
  let m;
  while ((m = KEY_RE.exec(src)) !== null) {
    // i18next plural convention: t('k', {count}) resolves k_one / k_other.
    const k = m[1];
    if (!known.has(k) && !known.has(`${k}_one`) && !known.has(`${k}_other`)) {
      console.log(`MISSING KEY  ${k}  (${file})`);
      missingKeys++;
    }
  }

  // JSXText can only exist in .tsx; data-only .ts files (e.g. the derived
  // strength model) can be multi-MB and OOM a full AST walk for no benefit.
  if (!file.endsWith('.tsx')) continue;

  let ast;
  try {
    ast = parser.parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'], attachComment: false });
  } catch { continue; /* parse failures are the sweep's job */ }

  const stack = [ast.program];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'JSXText' && /[A-Za-z]{2,}/.test(node.value)) {
      rawLiterals++;
      rawByFile.set(file, (rawByFile.get(file) ?? 0) + 1);
    }
    for (const k of Object.keys(node)) {
      if (SKIP_KEYS.has(k)) continue;
      const v = node[k];
      if (Array.isArray(v)) stack.push(...v);
      else if (v && typeof v === 'object' && v.type) stack.push(v);
    }
  }
}

console.log(`\n${targets.length} files scanned · ${known.size} known keys · ${missingKeys} missing keys · ${rawLiterals} raw JSX literals`);
if (rawByFile.size && (argFiles !== -1 || REPO_WIDE_STRICT)) {
  for (const [f, n] of [...rawByFile.entries()].sort((a, b) => b[1] - a[1])) console.log(`  RAW ${String(n).padStart(3)}  ${f}`);
}

const strict = argFiles !== -1 || REPO_WIDE_STRICT;
process.exit(missingKeys > 0 || (strict && rawLiterals > 0) ? 1 : 0);
