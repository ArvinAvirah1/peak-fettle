'use strict';

/**
 * Minimal CommonJS loader for the pure-TS engine modules under test.
 * Transpiles with the `typescript` package (resolved from this app's or the
 * sibling mobile app's node_modules — no install required in lifeos/ for CI
 * on a fresh clone) and resolves relative imports between .ts files.
 *
 * Only suitable for dependency-free engine/content modules (no RN imports).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function resolveTypescript() {
  const candidates = [
    path.join(__dirname, '..'),
    path.join(__dirname, '..', '..', 'mobile'),
    path.join(__dirname, '..', '..', 'peak-fettle-agents'),
  ];
  for (const base of candidates) {
    try {
      return require(require.resolve('typescript', { paths: [base] }));
    } catch {
      // try next
    }
  }
  throw new Error('[tsLoader] cannot resolve the typescript package from lifeos/, mobile/, or peak-fettle-agents/');
}

const ts = resolveTypescript();

function loadTs(filePath, cache = new Map()) {
  const resolved = path.resolve(filePath);
  if (cache.has(resolved)) return cache.get(resolved).exports;

  const source = fs.readFileSync(resolved, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: resolved,
  });

  const mod = { exports: {} };
  cache.set(resolved, mod);

  const localRequire = (spec) => {
    if (spec.startsWith('.')) {
      let p = path.resolve(path.dirname(resolved), spec);
      if (!p.endsWith('.ts') && !p.endsWith('.tsx')) {
        if (fs.existsSync(p + '.ts')) p += '.ts';
        else if (fs.existsSync(path.join(p, 'index.ts'))) p = path.join(p, 'index.ts');
        else throw new Error(`[tsLoader] cannot resolve relative import ${spec} from ${resolved}`);
      }
      return loadTs(p, cache);
    }
    return require(spec);
  };

  // Executes ONLY this repo's own transpiled .ts sources (dev/test tooling —
  // the input is never user- or network-controlled).
  const fn = vm.compileFunction(outputText, ['require', 'module', 'exports', '__dirname', '__filename'], {
    filename: resolved,
  });
  fn(localRequire, mod, mod.exports, path.dirname(resolved), resolved);
  return mod.exports;
}

module.exports = { loadTs };
